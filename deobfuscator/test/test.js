'use strict';
/** Round-trip test: obfuscate sample.lua, verify structure, then deobfuscate. */
const fs = require('fs');
const path = require('path');
const { obfuscate, encode85 } = require('../obfuscator');
const { deobfuscate } = require('../engine');

const sample = fs.readFileSync(path.join(__dirname, 'sample.lua'), 'utf8');
console.log('=== SAMPLE (first 200 chars) ===');
console.log(sample.slice(0, 200));

// --- obfuscate ---
const obf = obfuscate(sample, { seed: 'test-seed-1' });
fs.writeFileSync(path.join(__dirname, 'sample_obfuscated.lua'), obf);
console.log('\n=== OBFUSCATED (first 900 chars) ===');
console.log(obf.slice(0, 900));
console.log('... [length: ' + obf.length + ' chars]');

// --- structural checks ---
const checks = {
  'outer IIFE wrapper': /return\s*\(\s*function\s*\(\s*\.\.\.\s*\)\s*$/.test((obf.trim().split('\n')[1] || '').trim()),
  'string pool U={...}': /local U=\{/.test(obf),
  'dictionary o (85 symbols)': /local o=\{/.test(obf) && countSyms(obf, 'local o={', 'local w={') === 85,
  'dictionary w (64 symbols)': /local w=\{/.test(obf) && countSyms(obf, 'local w={', 'local q=') === 64,
  'alias q=string.char': /local q=string\.char/.test(obf),
  'decoder D exists': /local function D\(s\)/.test(obf),
  'register loader R exists': /local function R\(x\)/.test(obf),
  'VM dispatcher while s do': /while s do/.test(obf),
  'arithmetic camouflage present': /\(-\d+\+\d+\)|\(\d+-\d+\)|\(\d+%\d+\)/.test(obf),
  'payload closure embedded': /local payload=function\(\)/.test(obf),
};

function countSyms(src, startMark, endMark) {
  const s = src.indexOf(startMark);
  const e = src.indexOf(endMark, s);
  if (s === -1 || e === -1) return 0;
  return src.slice(s + startMark.length, e).split(',').filter((x) => x.trim()).length;
}
let pass = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log((ok ? '  [PASS] ' : '  [FAIL] ') + name);
  if (ok) pass++;
}
console.log('structural checks: ' + pass + '/' + Object.keys(checks).length);

// --- deobfuscate the obfuscated output ---
const result = deobfuscate(obf);
fs.writeFileSync(path.join(__dirname, 'sample_report.txt'), result.reportText);
fs.writeFileSync(path.join(__dirname, 'sample_clean.lua'), result.cleanCode);
console.log('\n=== DEOBFUSCATION REPORT (first 1200 chars) ===');
console.log(result.reportText.slice(0, 1200));

// --- verify decoded strings include the originals ---
const expected = ['Players', 'Player', 'hello world', 'congrats gpt', 'loop', 'big', 'small'];
const gotTexts = (result.report.payload.interestingStrings || []).map((s) => s.text);
let found = 0;
for (const e of expected) {
  const ok = gotTexts.some((t) => t === e || t.includes(e));
  console.log((ok ? '  [FOUND] ' : '  [MISS ] ') + JSON.stringify(e));
  if (ok) found++;
}
console.log('\nstring recovery: ' + found + '/' + expected.length);
console.log(found === expected.length ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
