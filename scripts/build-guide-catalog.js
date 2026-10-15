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
const NEW_PER_RUN = 10;
const HOWTO = /how to|guide|tips|tutorial|beginner|setup|set up|consume|consumption|dose|dosing|store|storage|clean|grind|roll|vape|edible|tincture|terpene|strain|grow|harvest|dry|cure|clone|prune|train|nutrient|safety|safer|responsib|label|potency|dispensary|choose|cook/i;
const SKIP = /login|sign.?up|newsletter|advertis|podcast|shop|merch|career|privacy|terms/i;

function clean(value = '') {
  return value.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/\\s+/g, ' ').trim();
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
  const re = /<a\\b[^>]*href=["']([^"'#]+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.size < 100) {
    let url;
    try { url = new URL(match[1], source.url); } catch { continue; }
    const title = clean(match[2]);
    if (!/^https?:$/.test(url.protocol) || !title || title.length < 8 || title.length > 180) continue;
    if (url.hostname !== new URL(source.url).hostname || SKIP.test(title + ' ' + url.href) || !HOWTO.test(title + ' ' + url.href)) continue;
    url.hash = '';
    results.set(url.href, {
      guideId: 'external-' + Buffer.from(url.href).toString('base64url').slice(0, 18),
      title,
      description: 'External educational resource. Open the original source for the complete guide and current safety information.',
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
  try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const previous = Array.isArray(existing.guides) ? existing.guides : [];
  const knownUrls = new Set(previous.filter(g => g.url).map(g => g.url.replace(/#.*$/, '')));
  const settled = await Promise.allSettled(SOURCES.map(crawl));
  const scraped = settled.flatMap((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn('Skipping unavailable source:', SOURCES[i].name, result.reason.message);
    return [];
  });
  const uniqueCandidates = new Map();
  for (const guide of scraped) {
    const url = String(guide.url || '').replace(/#.*$/, '');
    if (!url || knownUrls.has(url) || uniqueCandidates.has(url)) continue;
    uniqueCandidates.set(url, { ...guide, url });
  }

  const additions = [...uniqueCandidates.values()].slice(0, NEW_PER_RUN);
  if (additions.length !== NEW_PER_RUN) {
    console.error('Daily guide publication paused: found ' + additions.length +
      ' new eligible links; exactly ' + NEW_PER_RUN +
      ' are required. Existing live catalog was left untouched. Check source access or discovery rules.');
    process.exitCode = 2;
    return;
  }

  const guides = [...previous, ...additions];
  const output = {
    generatedAt: new Date().toISOString(),
    count: guides.length,
    dailyNewCount: additions.length,
    sources: [...new Set([...(existing.sources || []), ...SOURCES.map(s => s.name), 'Preroll.org Editorial'])],
    editorialNote: existing.editorialNote || 'Preroll.org indexes external educational resources; full articles remain on their original publisher sites.',
    guides
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\\n');
  console.log('Published ' + additions.length + ' new external how-to resources. Total indexed: ' + output.count);
  for (const guide of additions) console.log('+ ' + guide.title + ' — ' + guide.url);
})().catch(error => { console.error(error); process.exitCode = 1; });
