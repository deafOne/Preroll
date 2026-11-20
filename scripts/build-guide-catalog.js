const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SOURCES = [
  { name: 'Leafly', url: 'https://www.leafly.com/learn' },
  { name: 'Weedmaps Learn', url: 'https://weedmaps.com/learn' },
  { name: 'Grow Weed Easy', url: 'https://www.growweedeasy.com/' },
  { name: 'Cannabis Training University', url: 'https://cannabistraininguniversity.com/blog/' },
  { name: 'New York Office of Cannabis Management', url: 'https://cannabis.ny.gov/guide-safer-cannabis-consumption' }
];
const OUTPUT = path.join(__dirname, '..', 'guides', 'catalog.json');
const NEW_PER_RUN = 10;
const HOWTO = /how to|guide|tips|tutorial|beginner|setup|set up|consume|consumption|dose|dosing|store|storage|clean|grind|roll|vape|edible|tincture|terpene|strain|grow|harvest|dry|cure|clone|prune|train|nutrient|safety|safer|responsib|label|potency|dispensary|choose|cook|seed/i;
const SKIP = /login|sign.?up|newsletter|advertis|podcast|shop|merch|career|privacy|terms|contact|support|donat|feedback|about us|free ways|website-feedback|forum|community/i;

function clean(value = '') {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
}
function category(title, url) {
  const s = (title + ' ' + url).toLowerCase();
  if (/grow|harvest|cure|clone|prune|nutrient|seed|plant/.test(s)) return 'Growing';
  if (/edible|cook|recipe|infus|tincture/.test(s)) return 'Edibles & cooking';
  if (/terpene|cannabinoid|thc|cbd|science|effect/.test(s)) return 'Cannabis science';
  if (/safety|dose|dosing|consume|consumption|responsib/.test(s)) return 'Safer consumption';
  if (/new york|dispensary|license|law|legal/.test(s)) return 'New York';
  return 'Cannabis 101';
}
function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname === 'preroll.org' || url.hostname.endsWith('.preroll.org')) return '';
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return ''; }
}
function guideId(url) {
  return 'external-' + createHash('sha256').update(url).digest('hex').slice(0, 20);
}
async function crawl(source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'Preroll.org educational index crawler/2.0', 'Accept': 'text/html' },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(source.name + ': HTTP ' + response.status);
  const html = await response.text();
  const results = new Map();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.size < 100) {
    let url;
    try { url = new URL(match[1], source.url); } catch { continue; }
    const title = clean(match[2]);
    const href = canonicalUrl(url.href);
    if (!href || !title || title.length < 8 || title.length > 180) continue;
    if (url.hostname !== new URL(source.url).hostname || SKIP.test(title + ' ' + url.pathname) || !HOWTO.test(title)) continue;
    results.set(href, {
      guideId: guideId(href),
      title,
      description: 'External educational resource. Open the original source for the complete guide and current safety information.',
      category: category(title, href),
      source: source.name,
      url: href,
      publishedAt: null
    });
  }
  return [...results.values()];
}
function writeCatalog(existing, guides, dailyNewCount) {
  const sources = [...new Set([
    ...((Array.isArray(existing.sources) ? existing.sources : []).filter(x => x !== 'Preroll.org Editorial')),
    ...SOURCES.map(source => source.name)
  ])];
  const output = {
    generatedAt: new Date().toISOString(),
    count: guides.length,
    dailyNewCount,
    sources,
    editorialNote: existing.editorialNote || 'Preroll.org indexes external educational resources; full articles remain on their original publisher sites.',
    guides
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const temp = OUTPUT + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(output, null, 2) + '\n');
  fs.renameSync(temp, OUTPUT);
  return output;
}

(async () => {
  let existing = { guides: [], sources: [] };
  try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  // Remove generated placeholder cards that all pointed at the same index page,
  // and deduplicate any repeated external URL before the next publication check.
  const rawPrevious = Array.isArray(existing.guides) ? existing.guides : [];
  const previous = [];
  const knownUrls = new Set();
  for (const item of rawPrevious) {
    if (!item || !item.title || item.source === 'Preroll.org Editorial') continue;
    const url = canonicalUrl(item.url);
    if (!url || knownUrls.has(url) || SKIP.test(item.title)) continue;
    knownUrls.add(url);
    previous.push({ ...item, url, guideId: guideId(url) });
  }
  const cleanedExisting = previous.length !== rawPrevious.length ||
    previous.some((item, index) => rawPrevious[index]?.url !== item.url || rawPrevious[index]?.guideId !== item.guideId);

  const settled = await Promise.allSettled(SOURCES.map(crawl));
  const scraped = settled.flatMap((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn('Skipping unavailable source:', SOURCES[i].name, result.reason.message);
    return [];
  });
  const candidates = new Map();
  for (const guide of scraped) {
    const url = canonicalUrl(guide.url);
    if (!url || knownUrls.has(url) || candidates.has(url)) continue;
    candidates.set(url, { ...guide, url, guideId: guideId(url) });
  }
  const additions = [...candidates.values()].slice(0, NEW_PER_RUN);

  if (additions.length !== NEW_PER_RUN) {
    if (cleanedExisting) {
      const output = writeCatalog(existing, previous, 0);
      console.log('Cleaned guide catalog: removed ' + (rawPrevious.length - previous.length) +
        ' invalid, internal, placeholder or duplicate records. Unique verified external links: ' + output.count);
    } else {
      console.log('No-op: found ' + additions.length + ' of ' + NEW_PER_RUN +
        ' required new verified guide links. Existing catalog preserved for the next scheduled run.');
    }
    return;
  }

  const output = writeCatalog(existing, [...previous, ...additions], additions.length);
  console.log('Published ' + additions.length + ' new external how-to resources. Total indexed: ' + output.count);
  for (const guide of additions) console.log('+ ' + guide.title + ' — ' + guide.url);
})().catch(error => { console.error(error); process.exitCode = 1; });
