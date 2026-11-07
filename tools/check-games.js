#!/usr/bin/env node
/* Checks every game in games/: it must parse, register itself, and stay away from the network,
   cookies, storage beyond its own keys, and code from strings. Games run on mdblist.com inside a
   signed-in user's page, so these rules matter; a reviewer still reads every change.
   Run: node tools/check-games.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..', 'games');
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'network (fetch)'],
  [/XMLHttpRequest/, 'network (XMLHttpRequest)'],
  [/\bWebSocket\b|\bEventSource\b|sendBeacon/, 'network'],
  [/\bimport\s*\(|importScripts/, 'loading code'],
  [/document\.cookie/, 'cookies'],
  [/\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*['"`]/, 'code from strings'],
  [/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/, 'writing HTML into the page'],
  [/sessionStorage|indexedDB/, 'storage (use localStorage with your own "mdb-<game>-" key)'],
  [/<script/i, 'script tags'],
];

let failed = 0;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
for (const file of files) {
  const full = path.join(dir, file);
  const src = fs.readFileSync(full, 'utf8');
  const problems = [];
  try { execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' }); }
  catch (e) { problems.push('does not parse: ' + String(e.stderr || e.message).trim().split('\n')[0]); }
  if (!/registerEffect\(\s*['"][\w-]+['"]/.test(src)) problems.push('never calls MDBCosmetics.registerEffect(\'key\', factory)');
  for (const [re, what] of FORBIDDEN) if (re.test(src)) problems.push('not allowed: ' + what);
  for (const m of src.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*(['"`])([^'"`]*)\1/g)) {
    if (!/^mdb-[\w-]+$/.test(m[2])) problems.push('localStorage key "' + m[2] + '" should look like "mdb-<game>-..."');
  }
  if (problems.length) { failed++; console.log('✗ ' + file + '\n  - ' + problems.join('\n  - ')); }
  else console.log('✓ ' + file);
}
if (!files.length) { console.log('no games found'); process.exit(1); }
process.exit(failed ? 1 : 0);
