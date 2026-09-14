'use strict';
/**
 * Lua/Luau Obfuscator & Deobfuscator Discord Bot
 * ------------------------------------------------
 * Commands:
 *   .obfuscate  [attach .lua/.txt]   -> obfuscates the attached script
 *   .deobfuscate / .decode / .unobfuscate [attach file] -> deobfuscates
 *   .help, .ping, .info, .source
 *
 * - Prefix commands AND slash commands supported
 * - Keep-alive Express server so free hosts (Render) don't sleep
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, SlashCommandBuilder, REST, Routes, AttachmentBuilder } = require('discord.js');

const { deobfuscate } = require('./deobfuscator/engine');
const { obfuscate } = require('./deobfuscator/obfuscator');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const TOKEN = process.env.DISCORD_TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || '';
const PREFIX = (process.env.PREFIX || '.').trim();
const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_KB = Number(process.env.MAX_FILE_KB || 2000); // 2 MB default
const ALLOWED_EXT = ['.txt', '.lua', '.luau', '.txt.lua', '.obf'];

// ---------------------------------------------------------------------------
// KEEP-ALIVE WEB SERVER (so Render free tier doesn't sleep the bot)
// ---------------------------------------------------------------------------
const app = express();
app.get('/', (_req, res) => {
  res.send(`<html><body style="background:#111;color:#eee;font-family:monospace;padding:40px">
<h2>Lua Obfuscator/Deobfuscator Bot is ONLINE</h2>
<p>Discord bot alive at ${new Date().toISOString()}</p></body></html>`);
});
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.listen(PORT, () => console.log(`[web] keep-alive listening on :${PORT}`));

// ---------------------------------------------------------------------------
// DISCORD CLIENT
// ---------------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`[bot] logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: '.help | obfuscate & deobfuscate Lua' }], status: 'online' });
});

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luaobf-'));
  return path.join(dir, name);
}

function fileExt(name) {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.luau')) return '.luau';
  if (lower.endsWith('.lua')) return '.lua';
  if (lower.endsWith('.txt')) return '.txt';
  return null;
}

function embedOk(title, desc) {
  return new EmbedBuilder().setColor(0x00ff88).setTitle(title).setDescription(desc);
}
function embedErr(title, desc) {
  return new EmbedBuilder().setColor(0xff3366).setTitle(title).setDescription(desc);
}

/** Attach a file to a message, or fall back to a code block if too large. */
async function sendFile(msg, filename, content, note) {
  try {
    const buf = Buffer.from(content, 'utf8');
    const attachment = new AttachmentBuilder(buf, { name: filename });
    await msg.reply({ content: note || undefined, files: [attachment], allowedMentions: { repliedUser: true } });
  } catch (e) {
    // file too big or failed -> paste truncated preview
    const preview = content.length > 1500 ? content.slice(0, 1500) + '\n... (truncated)' : content;
    await msg.reply('```lua\n' + preview + '\n```');
  }
}

// ---------------------------------------------------------------------------
// CORE COMMAND HANDLERS
// ---------------------------------------------------------------------------
async function handleObfuscate(msg, src) {
  const started = Date.now();
  const seed = crypto.randomBytes(8).toString('hex');
  const result = obfuscate(src, { seed, version: '2.3.0' });
  const outName = 'obfuscated_' + seed.slice(0, 6) + '.lua';
  const ms = Date.now() - started;
  const lines = result.split('\n').length;
  await sendFile(msg, outName, result,
    `Obfuscated (WeAreDevs-compatible) in ${ms}ms - ${result.length} chars, ${lines} lines.`);
}

async function handleDeobfuscate(msg, src) {
  const started = Date.now();
  const { report, reportText, cleanCode } = deobfuscate(src);
  const ms = Date.now() - started;

  // Report file
  await sendFile(msg, 'report.txt', reportText, `Analysis complete in ${ms}ms.`);

  // Clean reconstruction file
  const cleanName = 'deobfuscated_' + Date.now() + '.lua';
  await sendFile(msg, cleanName, cleanCode, 'Reconstructed source attached.');

  // Summary embed
  const stats = [
    `Obfuscator: **${report.detectedObfuscator}**`,
    `Wrapper: ${report.outerWrapper || 'none'}`,
    `Arithmetic camouflage simplified: ${report.arithmeticSimplifications.length}`,
    `String pool: ${report.stringPool ? report.stringPool.count + ' entries (' + report.stringPool.variableName + ')' : 'not found'}`,
    `Permutation: ${report.permutation ? report.permutation.type : 'none'}`,
    `Dictionaries: ${report.dictionaries.map((d) => d.variable + '(' + d.length + ')').join(', ') || 'none'}`,
    `VM: ${report.vmAnalysis.virtualized ? report.vmAnalysis.architecture : 'none detected'}`,
    `Confidence: ${report.confidence}`,
  ].join('\n');
  const emb = embedOk('Deobfuscation Report', stats);
  const rec = (report.payload.interestingStrings || []).slice(0, 12).map((s) => '`' + String(s.text).slice(0, 60).replace(/`/g, "'") + '`').join('\n');
  if (rec) emb.addFields({ name: 'Recovered strings', value: rec.slice(0, 1000) || 'none' });
  await msg.reply({ embeds: [emb] });
}

// ---------------------------------------------------------------------------
// MESSAGE (PREFIX) COMMANDS
// ---------------------------------------------------------------------------
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    const content = msg.content.trim().toLowerCase();
    if (!content.startsWith(PREFIX)) return;
    const cmd = content.slice(PREFIX.length).split(/\s+/)[0];

    if (cmd === 'help' || cmd === 'commands') {
      const emb = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Lua Obfuscator/Deobfuscator Bot - Commands')
        .setDescription([
          '**How to use:** attach a `.lua` or `.txt` file to your message, then type a command in the same message.',
          '',
          '`' + PREFIX + 'obfuscate` - obfuscate the attached script (WeAreDevs-style: string pool, Base-85 dictionaries, VM dispatcher, arithmetic camouflage)',
          '`' + PREFIX + 'deobfuscate` - full reverse-engineering report (alias: `' + PREFIX + 'decode`, `' + PREFIX + 'unobfuscate`)',
          '`' + PREFIX + 'ping` - latency check',
          '`' + PREFIX + 'info` - bot & engine info',
          '`' + PREFIX + 'source` - link to source code',
        ].join('\n'));
      await msg.reply({ embeds: [emb] });
      return;
    }

    if (cmd === 'ping') {
      const sent = await msg.reply('Pinging...');
      const lat = sent.createdTimestamp - msg.createdTimestamp;
      await sent.edit(`Pong! Round-trip: **${lat}ms** | API: **${client.ws.ping}ms**`);
      return;
    }

    if (cmd === 'info') {
      const emb = embedOk('Bot Info', [
        'Engine: WeAreDevs-compatible obfuscator/deobfuscator v2.3',
        'Layers handled: string pool, pool permutation, custom Base-85/Base-64 dictionaries, arithmetic camouflage, index obfuscation, VM dispatcher (control-flow flattening), register tables, closure wrapping.',
        'Input: `.lua`, `.luau`, `.txt` attachments (or text pasted in the message after the command).',
        'Output: obfuscated `.lua` / full analysis `report.txt` + reconstructed `.lua`.',
      ].join('\n'));
      await msg.reply({ embeds: [emb] });
      return;
    }

    if (cmd === 'source') {
      await msg.reply('Source is bundled with this bot deployment (see the GitHub repo you deployed from).');
      return;
    }

    if (cmd === 'obfuscate' || cmd === 'deobfuscate' || cmd === 'decode' || cmd === 'unobfuscate') {
      // Resolve source: attachment first, then inline code
      let src = null;
      let srcName = 'input.lua';
      const att = msg.attachments.first();
      if (att) {
        const ext = fileExt(att.name);
        if (!ext) {
          await msg.reply({ embeds: [embedErr('Unsupported file', 'Please attach a `.lua`, `.luau` or `.txt` file.')] });
          return;
        }
        if (att.size > MAX_FILE_KB * 1024) {
          await msg.reply({ embeds: [embedErr('File too large', `Max size is ${MAX_FILE_KB} KB.`)] });
          return;
        }
        const res = await fetch(att.url);
        src = await res.text();
        srcName = att.name;
      } else {
        // inline code after command
        const inline = msg.content.slice(msg.content.toLowerCase().indexOf(cmd) + cmd.length).trim();
        const m = inline.match(/```(?:lua|luau)?\n?([\s\S]*?)```/);
        if (m) src = m[1];
        else if (inline) src = inline;
      }
      if (!src || !src.trim()) {
        await msg.reply({ embeds: [embedErr('No input', 'Attach a `.lua`/`.txt` file or paste code in a ```lua code block together with the command.')] });
        return;
      }
      if (cmd === 'obfuscate') await handleObfuscate(msg, src, srcName);
      else await handleDeobfuscate(msg, src, srcName);
      return;
    }
  } catch (e) {
    console.error('[bot] error:', e);
    try { await msg.reply({ embeds: [embedErr('Error', String(e.message || e).slice(0, 1000))] }); } catch (_) {}
  }
});

// ---------------------------------------------------------------------------
// SLASH COMMANDS (optional, auto-registered when CLIENT_ID provided)
// ---------------------------------------------------------------------------
const slashCommands = [
  new SlashCommandBuilder().setName('obfuscate').setDescription('Obfuscate a Lua script (WeAreDevs-style)'),
  new SlashCommandBuilder().setName('deobfuscate').setDescription('Deobfuscate / decode an obfuscated Lua script'),
  new SlashCommandBuilder().setName('help').setDescription('Show bot commands'),
  new SlashCommandBuilder().setName('ping').setDescription('Check latency'),
  new SlashCommandBuilder().setName('info').setDescription('Bot and engine info'),
].map((c) => c.toJSON());

async function registerSlash() {
  if (!TOKEN || !CLIENT_ID) {
    console.log('[bot] CLIENT_ID not set - skipping slash command registration (prefix commands still work)');
    return;
  }
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log('[bot] slash commands registered');
  } catch (e) {
    console.error('[bot] slash registration failed:', e.message);
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      await sent.edit(`Pong! Round-trip: **${sent.createdTimestamp - interaction.createdTimestamp}ms** | API: **${client.ws.ping}ms**`);
      return;
    }
    if (interaction.commandName === 'help') {
      await interaction.reply({ embeds: [helpEmbed()] });
      return;
    }
    if (interaction.commandName === 'info') {
      await interaction.reply({ embeds: [infoEmbed()] });
      return;
    }
    if (interaction.commandName === 'obfuscate' || interaction.commandName === 'deobfuscate') {
      await interaction.deferReply();
      const att = interaction.options.getAttachment?.('file');
      if (!att) {
        await interaction.editReply('Attach a `.lua`/`.txt` file to this command invocation (or use the prefix command `' + PREFIX + 'obfuscate` with an attachment).');
        return;
      }
      const res = await fetch(att.url);
      const src = await res.text();
      if (interaction.commandName === 'obfuscate') {
        const seed = crypto.randomBytes(8).toString('hex');
        const out = obfuscate(src, { seed, version: '2.3.0' });
        const attachment = new AttachmentBuilder(Buffer.from(out, 'utf8'), { name: 'obfuscated_' + seed.slice(0, 6) + '.lua' });
        await interaction.editReply({ content: 'Obfuscated output:', files: [attachment] });
      } else {
        const { reportText, cleanCode } = deobfuscate(src);
        const a1 = new AttachmentBuilder(Buffer.from(reportText, 'utf8'), { name: 'report.txt' });
        const a2 = new AttachmentBuilder(Buffer.from(cleanCode, 'utf8'), { name: 'deobfuscated.lua' });
        await interaction.editReply({ content: 'Deobfuscation complete:', files: [a1, a2] });
      }
      return;
    }
  } catch (e) {
    console.error('[bot] interaction error:', e);
    try { await interaction.reply({ content: 'Error: ' + String(e.message || e).slice(0, 500), ephemeral: true }); } catch (_) {}
  }
});

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Lua Obfuscator/Deobfuscator Bot - Commands')
    .setDescription([
      '**How to use:** attach a `.lua` or `.txt` file to your message, then type a command in the same message.',
      '',
      '`' + PREFIX + 'obfuscate` - obfuscate the attached script',
      '`' + PREFIX + 'deobfuscate` - full reverse-engineering report (alias `' + PREFIX + 'decode`)',
      '`' + PREFIX + 'ping` - latency check',
      '`' + PREFIX + 'info` - bot & engine info',
    ].join('\n'));
}
function infoEmbed() {
  return embedOk('Bot Info', [
    'Engine: WeAreDevs-compatible obfuscator/deobfuscator v2.3',
    'Layers: string pool, permutation, Base-85/64 dictionaries, arithmetic camouflage, VM dispatcher, registers, closures.',
    'Input: `.lua`, `.luau`, `.txt` attachments or inline ```lua code blocks.',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
if (!TOKEN) {
  console.error('[bot] DISCORD_TOKEN missing! Set it in your host environment (Render dashboard) or .env file.');
  process.exit(1);
}
registerSlash().finally(() => client.login(TOKEN));
