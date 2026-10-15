'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000
});
const SOURCES = [
  { name: 'leafly', base: 'https://www.leafly.com/strains?page=', fallbackPages: 517 },
  { name: 'weedmaps', base: 'https://weedmaps.com/strains?page=', fallbackPages: 657 }
];
const MIN_SCRAPED_ROWS = 100;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function stripHtml(v = '') {
  return v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function parsePage(html, source, page) {
  const out = new Map(), re = /<a[^>]+href=["'](?:https?:\/\/[^"']+)?\/strains\/([^"'?#/]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1], text = stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!text || text.length > 160 || /^(strains|learn more|indica|sativa|hybrid)$/i.test(text)) continue;
    const before = stripHtml(html.slice(Math.max(0, m.index - 700), m.index)).toLowerCase();
    const tm = before.match(/\b(indica|sativa|hybrid)\b/);
    const type = tm ? tm[1][0].toUpperCase() + tm[1].slice(1) : 'Unknown';
    const name = text.replace(/^(indica|sativa|hybrid)\s+/i, '').replace(/\s+aka.*$/i, '').trim();
    if (name.length < 2) continue;
    out.set(slug, { slug, name, type, source, source_page: page });
  }
  return [...out.values()];
}
async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Preroll.org strain catalog importer/1.1)',
      'Accept': 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
  return r.text();
}
function discoverPages(html, fallback) {
  const nums = [...html.matchAll(/[?&]page=(\d+)/gi)].map(m => Number(m[1])).filter(Number.isFinite);
  return Math.max(fallback, ...nums, 1);
}
async function ensureTable() {
  await pool.query('CREATE TABLE IF NOT EXISTS strains(' +
    'id BIGSERIAL PRIMARY KEY, slug VARCHAR(180) NOT NULL, name VARCHAR(180) NOT NULL,' +
    "type VARCHAR(20) NOT NULL DEFAULT 'Unknown', source VARCHAR(20) NOT NULL," +
    'source_page INTEGER, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),' +
    'UNIQUE(slug,source))');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_strains_name ON strains(name)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_strains_source ON strains(source)');
}
async function save(rows) {
  if (!rows.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query('INSERT INTO strains(slug,name,type,source,source_page,updated_at) ' +
        'VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(slug,source) DO UPDATE SET ' +
        'name=EXCLUDED.name,type=EXCLUDED.type,source_page=EXCLUDED.source_page,updated_at=now()',
        [r.slug, r.name, r.type || 'Unknown', r.source, r.source_page || null]);
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
async function runSource(source) {
  const first = await fetchPage(source.base + '1');
  const pages = Math.min(discoverPages(first, source.fallbackPages), 60);
  console.log('[' + source.name + '] scanning ' + pages + ' pages (safety cap 60)');
  const all = new Map();
  for (const row of parsePage(first, source.name, 1)) all.set(row.slug, row);
  let next = 2;
  const concurrency = 4;
  while (next <= pages) {
    const batch = [];
    for (let i = 0; i < concurrency && next <= pages; i++, next++) batch.push(next);
    const results = await Promise.all(batch.map(async page => {
      try {
        const rows = parsePage(await fetchPage(source.base + page), source.name, page);
        await sleep(200);
        return rows;
      } catch (e) {
        console.warn('[' + source.name + '] page ' + page + ' skipped: ' + e.message);
        return [];
      }
    }));
    for (const rows of results) for (const row of rows) all.set(row.slug, row);
    await sleep(250);
  }
  const rows = [...all.values()];
  if (rows.length) await save(rows);
  console.log('[' + source.name + '] scraped and upserted ' + rows.length + ' distinct records');
  return rows.length;
}
async function syncStaticCatalog() {
  const file = path.join(__dirname, '..', 'strains', 'catalog.json');
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const strains = Array.isArray(payload.strains) ? payload.strains : [];
  const rows = [];
  for (const item of strains) {
    const name = String(item.name || '').trim().slice(0, 180);
    const slug = String(item.id || item.slug || '').trim().slice(0, 180);
    if (!name || !slug) continue;
    let source = String(item.source || 'catalog').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
    if (!source) source = 'catalog';
    const rawType = String(item.type || '');
    const type = /^(indica|sativa|hybrid)$/i.test(rawType) ? rawType[0].toUpperCase() + rawType.slice(1).toLowerCase() : 'Unknown';
    rows.push({ slug, name, type, source, source_page: null });
  }
  if (rows.length) await save(rows);
  console.log('Static catalog fallback synced to database:', rows.length, 'records from', file);
  return rows.length;
}
(async () => {
  let locked = false;
  try {
    await ensureTable();
    const lock = (await pool.query('SELECT pg_try_advisory_lock(81723451) AS locked')).rows[0].locked;
    if (!lock) {
      console.log('Another strain sync is already running; exiting.');
      return;
    }
    locked = true;
    let scraped = 0;
    for (const source of SOURCES) {
      try {
        scraped += await runSource(source);
      } catch (e) {
        console.warn('[' + source.name + '] scrape unavailable:', e.message);
      }
    }
    if (scraped < MIN_SCRAPED_ROWS) {
      console.warn('Live scrape returned only ' + scraped + ' records; syncing known catalog instead of leaving the database stale.');
      await syncStaticCatalog();
    }
    const q = await pool.query('SELECT source,COUNT(*)::int AS count FROM strains GROUP BY source ORDER BY source');
    console.log('Strain catalog sync complete:', q.rows);
  } catch (e) {
    console.error('Strain catalog sync failed:', e);
    process.exitCode = 1;
  } finally {
    if (locked) {
      try { await pool.query('SELECT pg_advisory_unlock(81723451)'); } catch {}
    }
    await pool.end();
  }
})();
