#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('guides/catalog.json', 'utf8'));
if (!Array.isArray(data.guides) || data.guides.length === 0) throw new Error('Guide catalog is empty');
if (data.count !== data.guides.length) throw new Error('Guide count does not match catalog length');
const ids = new Set();
const urls = new Set();
for (const guide of data.guides) {
  if (!guide || !guide.guideId || !guide.title || !guide.url) throw new Error('Incomplete guide record: ' + JSON.stringify(guide));
  if (guide.source === 'Preroll.org Editorial') throw new Error('Placeholder editorial record remains: ' + guide.title);
  const url = new URL(guide.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid guide URL: ' + guide.url);
  if (url.hostname === 'preroll.org' || url.hostname.endsWith('.preroll.org')) throw new Error('Internal guide URL is not a source article: ' + guide.url);
  url.hash = '';
  const key = url.href.replace(/\/$/, '');
  if (ids.has(guide.guideId)) throw new Error('Duplicate guide ID: ' + guide.guideId);
  if (urls.has(key)) throw new Error('Duplicate guide URL: ' + guide.url);
  ids.add(guide.guideId);
  urls.add(key);
}
console.log('Validated ' + data.guides.length + ' unique external guide records.');
