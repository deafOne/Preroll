const fs = require('node:fs');
const path = require('node:path');

const SOURCES = [
  { name: 'Leafly', url: 'https://www.leafly.com/learn' },
  { name: 'Weedmaps Learn', url: 'https://weedmaps.com/learn' },
  { name: 'Grow Weed Easy', url: 'https://www.growweedeasy.com/' },
  { name: 'Cannabis Training University', url: 'https://cannabistraininguniversity.com/blog/' },
  { name: 'New York Office of Cannabis Management', url: 'https://cannabis.ny.gov/guide-safer-cannabis-consumption' }
];
const OUTPUT = path.join(__dirname, '..', 'guides', 'catalog.json');
const HOWTO = /how to|guide|tips|tutorial|beginner|setup|set up|consume|consumption|dose|dosing|store|storage|clean|grind|roll|vape|edible|tincture|terpene|strain|grow|harvest|dry|cure|clone|prune|train|nutrient|safety|safer|responsib|label|potency|dispensary|choose|cook/i;
const SKIP = /login|sign.?up|newsletter|advertis|podcast|shop|merch|career|privacy|terms/i;

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
async function crawl(source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'Preroll.org educational index crawler/1.0', 'Accept': 'text/html' },
    signal: AbortSignal.timeout(12000),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(source.name + ': HTTP ' + response.status);
  const html = await response.text();
  const results = new Map();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.size < 80) {
    let url;
    try { url = new URL(match[1], source.url); } catch { continue; }
    const title = clean(match[2]);
    if (!/^https?:$/.test(url.protocol) || !title || title.length < 8 || title.length > 180) continue;
    if (url.hostname !== new URL(source.url).hostname || SKIP.test(title + ' ' + url.href) || !HOWTO.test(title + ' ' + url.href)) continue;
    url.hash = '';
    results.set(url.href, {
      guideId: 'external-' + Buffer.from(url.href).toString('base64url').slice(0, 18),
      title,
      description: 'External educational resource. Review the linked source for current details and applicable safety guidance.',
      category: category(title, url.href),
      source: source.name,
      url: url.href,
      publishedAt: null
    });
  }
  return [...results.values()];
}
(async () => {
  let existing = { guides: [], sources: [] };
  try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const editorial = (existing.guides || []).filter(g =>
    g.source === 'Preroll.org Editorial' || String(g.guideId || '').startsWith('howto-2026-') || String(g.guideId || '').startsWith('pr-')
  );
  const settled = await Promise.allSettled(SOURCES.map(crawl));
  const scraped = settled.flatMap((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn('Skipping unavailable source:', SOURCES[i].name, result.reason.message);
    return [];
  });
  const byKey = new Map();
  for (const guide of [...editorial, ...scraped]) {
    if (!guide.title || !guide.url) continue;
    // Editorial entries intentionally share the guide landing page; preserve each distinct ID.
    const key = guide.source === 'Preroll.org Editorial' || String(guide.guideId || '').startsWith('howto-2026-') || String(guide.guideId || '').startsWith('pr-')
      ? 'editorial:' + String(guide.guideId || guide.title)
      : 'url:' + guide.url;
    if (!byKey.has(key)) byKey.set(key, guide);
  }
  const guides = [...byKey.values()];
  const output = {
    generatedAt: new Date().toISOString(),
    count: guides.length,
    sources: [...new Set([...SOURCES.map(s => s.name), 'Preroll.org Editorial'])],
    editorialNote: existing.editorialNote || 'Editorial references should be checked against current primary sources.',
    guides
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log('Guide catalog:', output.count, '| preserved editorial:', editorial.length, '| scraped:', scraped.length);
})().catch(error => { console.error(error); process.exitCode = 1; });
