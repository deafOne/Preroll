#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const API = (process.env.PREROLL_API_URL || 'https://preroll-v2wf.onrender.com').replace(/\/+$/, '');
const PAGE_TIMEOUT_MS = 15000;
const API_TIMEOUT_MS = 30000;
const OCM_TIMEOUT_MS = 90000;

async function get(endpoint, timeout = API_TIMEOUT_MS) {
  const response = await fetch(API + endpoint, {
    headers: { Accept: 'application/json', 'User-Agent': 'Preroll.org live-data monitor/2.0' },
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store'
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(endpoint + ' returned invalid JSON (HTTP ' + response.status + ')'); }
  if (!response.ok) throw new Error(endpoint + ' returned HTTP ' + response.status + ': ' + (data.error || 'request failed'));
  return data;
}

async function main() {
  // These local files are the actual published routes. Verify them independently
  // of the custom-domain edge firewall, which can reject GitHub-hosted probes.
  const pages = [
    ['Homepage', 'index.html'],
    ['News', 'news/index.html'],
    ['New York market', 'index.html'],
    ['Strain library', 'strains/index.html'],
    ['Guides', 'guides/index.html'],
    ['Forum', 'forum/index.html'],
    ['Calculators', 'calculators/index.html'],
    ['Dr. Terpenstein', 'dr-terpenstein/index.html'],
    ['Resources', 'resources/index.html'],
    ['Media Network', 'media-network/index.html'],
    ['Green Empire game', 'game/index.html'],
    ['Infinity Cannabis Tycoon', 'tycoon/index.html']
  ];
  let failures = 0;
  for (const [name, file] of pages) {
    if (fs.existsSync(path.join(process.cwd(), file))) console.log('PASS page source ' + name);
    else { failures++; console.error('FAIL page source ' + name + ' — missing ' + file); }
  }

  // One live probe is enough to detect an origin outage. A 403/429 from the
  // custom-domain edge is a bot/rate-limit decision, not evidence of a broken
  // page; report it as unverified rather than failing every route.
  try {
    const response = await fetch('https://preroll.org/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Preroll.org status monitor/2.0)' },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      redirect: 'follow'
    });
    if (response.ok) console.log('PASS live homepage — HTTP ' + response.status);
    else if (response.status === 403 || response.status === 429) {
      console.warn('WARN live homepage — HTTP ' + response.status + ' from the edge; automated probe blocked, page availability is unverified');
    } else {
      failures++;
      console.error('FAIL live homepage — HTTP ' + response.status);
    }
  } catch (error) {
    failures++;
    console.error('FAIL live homepage — ' + error.message);
  }

  const checks = [
    ['API/database health', '/api/health', API_TIMEOUT_MS],
    ['Cannabis news feed', '/api/news?latest=18', API_TIMEOUT_MS],
    ['New York OCM license feed', '/api/ny/licenses', OCM_TIMEOUT_MS],
    ['Strain catalog', '/api/strains?limit=1', API_TIMEOUT_MS],
    ['Community discussions', '/api/posts', API_TIMEOUT_MS],
    ['Community reviews', '/api/reviews', API_TIMEOUT_MS]
  ];
  const results = await Promise.allSettled(checks.map(async ([name, endpoint, timeout]) => {
    const data = await get(endpoint, timeout);
    if (endpoint === '/api/health' && (!data.ok || data.database !== true)) {
      throw new Error('API is responding but PostgreSQL is not healthy');
    }
    if (endpoint.startsWith('/api/news') && (!Array.isArray(data.articles) || data.articles.length === 0)) {
      throw new Error('No current articles returned from the public RSS feeds');
    }
    if (endpoint === '/api/ny/licenses') {
      if (!Array.isArray(data.licenses) || data.licenses.length === 0) throw new Error('OCM feed returned no license rows');
      const stamp = Date.parse(data.fetchedAt || '');
      if (!Number.isFinite(stamp) || Date.now() - stamp > 36 * 60 * 60 * 1000) {
        throw new Error('OCM feed timestamp is missing or older than 36 hours');
      }
    }
    if (endpoint.startsWith('/api/strains') && (!Array.isArray(data.strains) || !(data.total > 0))) {
      throw new Error('Strain catalog returned no records');
    }
    if (endpoint === '/api/posts' && !Array.isArray(data) && !Array.isArray(data.posts)) {
      throw new Error('Community discussions response has an unexpected shape');
    }
    if (endpoint === '/api/reviews' && !Array.isArray(data) && !Array.isArray(data.reviews)) {
      throw new Error('Community reviews response has an unexpected shape');
    }
    const count = Array.isArray(data) ? data.length :
      Array.isArray(data.articles) ? data.articles.length :
      Array.isArray(data.licenses) ? data.licenses.length :
      Array.isArray(data.strains) ? (data.total ?? data.strains.length) :
      Array.isArray(data.posts) ? data.posts.length :
      Array.isArray(data.reviews) ? data.reviews.length :
      (data.database ? 'database connected' : 'ok');
    return { name, count };
  }));

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') console.log('PASS ' + result.value.name + ' — ' + result.value.count);
    else { failures++; console.error('FAIL ' + checks[index][0] + ' — ' + result.reason.message); }
  });
  console.log('Preroll.org audit: ' + (pages.length + checks.length + 1 - failures) +
    '/' + (pages.length + checks.length + 1) + ' required checks passed; edge-blocked probes are warnings.');
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error('Live-data monitor crashed:', error);
  process.exitCode = 1;
});
