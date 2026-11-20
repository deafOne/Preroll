#!/usr/bin/env node
'use strict';

const API = (process.env.PREROLL_API_URL || 'https://preroll-v2wf.onrender.com').replace(/\/+$/, '');
const TIMEOUT_MS = 20000;

async function get(path) {
  const response = await fetch(API + path, {
    headers: { Accept: 'application/json', 'User-Agent': 'Preroll.org live-data monitor/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store'
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(path + ' returned invalid JSON (HTTP ' + response.status + ')'); }
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status + ': ' + (data.error || 'request failed'));
  return data;
}

async function main() {
  const checks = [
    ['API/database health', '/api/health'],
    ['Cannabis news feed', '/api/news?latest=18'],
    ['New York OCM license feed', '/api/ny/licenses'],
    ['Strain catalog', '/api/strains?limit=1'],
    ['Community discussions', '/api/posts'],
    ['Community reviews', '/api/reviews']
  ];
  const results = await Promise.allSettled(checks.map(async ([name, path]) => {
    const data = await get(path);
    if (path === '/api/health' && (!data.ok || data.database !== true)) {
      throw new Error('API is responding but PostgreSQL is not healthy');
    }
    if (path.startsWith('/api/news') && (!Array.isArray(data.articles) || data.articles.length === 0)) {
      throw new Error('No current articles returned from the public RSS feeds');
    }
    if (path === '/api/ny/licenses') {
      if (!Array.isArray(data.licenses) || data.licenses.length === 0) throw new Error('OCM feed returned no license rows');
      const stamp = Date.parse(data.fetchedAt || '');
      if (!Number.isFinite(stamp) || Date.now() - stamp > 36 * 60 * 60 * 1000) throw new Error('OCM feed timestamp is missing or older than 36 hours');
    }
    if (path.startsWith('/api/strains') && (!Array.isArray(data.strains) || !(data.total > 0))) {
      throw new Error('Strain catalog returned no records');
    }
    if (path === '/api/posts' && !Array.isArray(data) && !Array.isArray(data.posts)) {
      throw new Error('Community discussions response has an unexpected shape');
    }
    if (path === '/api/reviews' && !Array.isArray(data) && !Array.isArray(data.reviews)) {
      throw new Error('Community reviews response has an unexpected shape');
    }
    const count = Array.isArray(data) ? data.length :
      Array.isArray(data.articles) ? data.articles.length :
      Array.isArray(data.licenses) ? data.licenses.length :
      Array.isArray(data.strains) ? (data.total ?? data.strains.length) :
      Array.isArray(data.posts) ? data.posts.length :
      Array.isArray(data.reviews) ? data.reviews.length : (data.database ? 'database connected' : 'ok');
    return { name, count };
  }));

  let failures = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log('PASS ' + result.value.name + ' — ' + result.value.count);
    } else {
      failures++;
      console.error('FAIL ' + checks[index][0] + ' — ' + result.reason.message);
    }
  });
  console.log('Preroll.org live-data check: ' + (checks.length - failures) + '/' + checks.length + ' passed.');
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error('Live-data monitor crashed:', error);
  process.exitCode = 1;
});
