# Lua Obfuscator / Deobfuscator Discord Bot

A Discord bot that obfuscates and deobfuscates (decodes) Lua/Luau scripts using a **WeAreDevs-compatible engine** built from the reverse-engineering master prompt specification.

## What it does

### `.obfuscate`
Attach a `.lua` or `.txt` file, and the bot returns an obfuscated copy implementing the full WeAreDevs-style architecture:

- Outer IIFE wrapper: `return (function(...) ... end)(...)`
- Encoded string pool `U` (every string literal extracted and Base-85 encoded)
- Runtime pool permutation via unrolled `U[a],U[b]=U[b],U[a]` swaps
- Custom 85-symbol and 64-symbol character dictionaries (`o`, `w`)
- Short-block Base-85 string decoder (`D`/`DE`, 5 chars -> 4 bytes, 2-4 chars -> 1-3 bytes)
- Index obfuscation helper `S(x) = U[x + K]`
- Register loader `R(x) = Z[x]` with virtual register table `Z`
- Arithmetic camouflage on all constants (`(-844356+860808)` style)
- State-based VM dispatcher with control-flow flattening around the payload closure

### `.deobfuscate` / `.decode` / `.unobfuscate`
Attach an obfuscated script and the bot sends back:

1. **`report.txt`** - a full reverse-engineering report following the master prompt structure: obfuscator identification, arithmetic simplification table, string pool dump, permutation mapping, dictionary analysis, decoded pool (hex + text), VM architecture analysis, payload status
2. **`deobfuscated.lua`** - reconstructed source with proven structural layers and recovered strings

## Commands

| Command | Action |
|---|---|
| `.obfuscate` | Obfuscate the attached `.lua`/`.txt` (WeAreDevs-style) |
| `.deobfuscate` | Full analysis report + reconstruction (aliases: `.decode`, `.unobfuscate`) |
| `.help` | Command list |
| `.ping` | Latency check |
| `.info` | Engine info |
| `.source` | Source link |

Slash commands (`/obfuscate`, `/deobfuscate`, `/help`, `/ping`, `/info`) are auto-registered when `CLIENT_ID` is set.

**How to use:** attach your `.lua`/`.txt` file to a message and type the command in the same message. You can also paste code inline in a ` ```lua ` code block.

## Engine architecture (deobfuscator)

```
obfuscated source
   -> obfuscator identification (marker comment / IIFE pattern)
   -> arithmetic camouflage simplification (all a+b/a-b/a%b expressions)
   -> string pool extraction (largest multi-char literal table, prefers U)
   -> pool permutation simulation (swap-sequence or canonical rotation)
   -> dictionary detection (85/64 symbol alphabets, uniqueness verified)
   -> Base-85 / Base-64 decoding of every pool entry (hex + printable text)
   -> VM dispatcher analysis (state machine, register table, branch count)
   -> payload hint extraction (recovered strings + identifiers)
   -> report.txt + deobfuscated.lua
```

All deterministic layers are verified with an independent Node.js decoder, and the obfuscator output has been verified to **execute correctly in real Lua 5.1** (identical output to the original script).

## Deployment

See **SETUP_GUIDE.md** for the complete step-by-step deployment walkthrough (Discord Developer Portal -> GitHub -> Render -> uptime monitoring), written for mobile.

Quick start (local):

```bash
npm install
cp .env.example .env   # then edit .env with your bot token
npm start
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `DISCORD_TOKEN` | (required) | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | (optional) | Application ID - enables slash commands |
| `PREFIX` | `.` | Command prefix |
| `PORT` | `3000` | Keep-alive web server port |
| `MAX_FILE_KB` | `2000` | Max attachment size |

## Files

```
bot.js                     Discord bot (prefix + slash commands, keep-alive server)
deobfuscator/engine.js     Deobfuscator engine (pool, permutation, dictionaries, VM)
deobfuscator/obfuscator.js Obfuscator engine (WeAreDevs-compatible generator)
deobfuscator/test/         Tests (structure checks, round-trip, bot-flow simulation)
.github/workflows/keep-alive.yml   GitHub Actions uptime pinger (UptimeRobot alternative)
render.yaml                Render deployment config
Procfile                   Heroku-style start command
package.json               Dependencies and scripts
.env.example               Environment template
```

## License

MIT
