#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const HTML_FILES = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(directory, entry.name));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      HTML_FILES.push(path.join(directory, entry.name));
    }
  }
}
function decode(value) {
  return value.replace(/&amp;/gi, '&').replace(/&#x2f;/gi, '/').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
}
function targetFor(sourceFile, rawValue) {
  const value = decode(rawValue.trim());
  if (!value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return null;
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
  const target = path.resolve(decoded.startsWith('/') ? ROOT : path.dirname(sourceFile), '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  if (fs.existsSync(target)) {
    if (fs.statSync(target).isDirectory()) return path.join(target, 'index.html');
    return target;
  }
  if (!path.extname(target)) {
    const index = path.join(target, 'index.html');
    if (fs.existsSync(index)) return index;
  }
  return target;
}
walk(ROOT);
let failures = 0;
let checked = 0;
for (const file of HTML_FILES) {
  const html = fs.readFileSync(file, 'utf8');
  const attributes = /\b(href|src)\s*=\s*(["'])(.*?)\2/gi;
  let match;
  while ((match = attributes.exec(html))) {
    const target = targetFor(file, match[3]);
    if (!target) continue;
    checked++;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      failures++;
      console.error('BROKEN ' + path.relative(ROOT, file) + ' — ' + match[1] + '="' + match[3] + '"');
    }
  }
}
console.log('Checked ' + checked + ' local HTML links/assets across ' + HTML_FILES.length + ' HTML files.');
if (failures) {
  console.error(failures + ' broken local references found.');
  process.exitCode = 1;
} else {
  console.log('All local HTML links and assets resolve.');
}
