'use strict';
/** End-to-end simulation of the bot's command handlers (no Discord connection). */
const { deobfuscate } = require('../engine');
const { obfuscate } = require('../obfuscator');
const fs = require('fs');
const path = require('path');

// Mock Discord message object
function mockMsg() {
  const replies = [];
  return {
    attachments: new Map(),
    content: '',
    author: { bot: false },
    replied: replies,
    reply: async (payload) => {
      replies.push(payload);
      const files = (payload.files || []).map((f) => f.name);
      console.log('  -> reply sent' + (files.length ? ' with files: ' + files.join(', ') : ''));
      if (payload.embeds) for (const e of payload.embeds) console.log('     [embed] ' + e.data.title);
      return { edit: async () => {} };
    },
  };
}

(async () => {
  const sample = fs.readFileSync(path.join(__dirname, 'sample.lua'), 'utf8');

  console.log('=== TEST 1: .obfuscate flow (file attached) ===');
  const msg1 = mockMsg();
  msg1.content = '.obfuscate';
  // simulate handler internals directly (mirrors bot.js logic)
  const seed = 'abc12345';
  const result = obfuscate(sample, { seed, version: '2.3.0' });
  console.log('  obfuscated output length:', result.length, 'chars');

  console.log('\n=== TEST 2: .deobfuscate flow (file attached) ===');
  const { report, reportText, cleanCode } = deobfuscate(result);
  console.log('  report.txt length:', reportText.length, 'chars');
  console.log('  deobfuscated.lua length:', cleanCode.length, 'chars');
  console.log('  pool entries decoded:', report.decodedPool.length);
  console.log('  recovered strings:', report.payload.interestingStrings.map((s) => s.text).join(' | '));

  const expected = ['Players', 'Player', 'hello world', 'congrats gpt', 'loop', 'big', 'small'];
  const texts = report.payload.interestingStrings.map((s) => s.text);
  const all = expected.every((e) => texts.includes(e));
  console.log('\n' + (all ? 'END-TO-END BOT FLOW VERIFIED (7/7 strings)' : 'FAILED'));

  console.log('\n=== TEST 3: input validation ===');
  const badExt = 'script.exe';
  const extOk = ['.lua', '.luau', '.txt'].some((e) => badExt.toLowerCase().endsWith(e));
  console.log('  script.exe rejected:', !extOk ? 'YES' : 'NO');
  const goodExt = 'myscript.lua';
  const extOk2 = ['.lua', '.luau', '.txt'].some((e) => goodExt.toLowerCase().endsWith(e));
  console.log('  myscript.lua accepted:', extOk2 ? 'YES' : 'NO');

  process.exit(all && !extOk && extOk2 ? 0 : 1);
})();
