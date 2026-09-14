# SETUP GUIDE - Lua Obfuscator/Deobfuscator Bot
## Complete walkthrough: Discord Portal -> GitHub -> Render -> UptimeRobot (mobile-friendly)

This guide explains **every step one by one**. You can do all of it from a phone.
Estimated time: 15-25 minutes.

---

# STEP 1 - Create the Discord bot (Discord Developer Portal)

1. Open **https://discord.com/developers/applications** in your browser (works on mobile).
2. Log in with your Discord account.
3. Tap **"New Application"** (top right).
4. Enter a name, for example `Lua Obfuscator Bot`, then tap **Create**.

### 1.1 - Copy the Application ID

5. You are now on the application page. You'll see **"APPLICATION ID"** with a number under it (e.g. `1234567890123456789`).
6. Tap **Copy** next to it.
7. Save it somewhere (notes app). This is your **CLIENT_ID**.

### 1.2 - Create the bot user

8. In the left menu, tap **"Bot"**.
9. Tap **"Reset Token"** -> **"Yes, do it!"**.
10. Tap **Copy** on the token that appears.
11. **SAVE THIS TOKEN** - this is your **DISCORD_TOKEN**. Discord only shows it once!
    - Treat it like a password. Never share it, never put it in the GitHub code.

### 1.3 - Enable the Message Content intent (required for `.obfuscate` commands)

12. Still on the **Bot** page, scroll down to **"Privileged Gateway Intents"**.
13. Turn **ON** these switches:
    - **MESSAGE CONTENT INTENT**  (required - the bot must read your `.obfuscate` command text)
    - **SERVER MEMBERS INTENT**   (optional but recommended)
14. Tap **Save Changes**.

### 1.4 - Invite the bot to your server

15. In the left menu, tap **"OAuth2"** -> **"URL Generator"**.
16. Under **Scopes**, check **"bot"**.
17. Under **Bot Permissions**, check:
    - **Send Messages**
    - **Read Message History**
    - **Attach Files**
    - **Embed Links**
18. Copy the generated URL at the bottom.
19. Open that URL in a new tab, pick your server, tap **Authorize** -> complete the captcha.

The bot is now in your server (it will show as offline until we deploy it).

**Checklist after Step 1:**
- [ ] CLIENT_ID copied (Application ID)
- [ ] DISCORD_TOKEN copied (bot token)
- [ ] MESSAGE CONTENT INTENT enabled
- [ ] Bot invited to your server

---

# STEP 2 - Put the code on GitHub

The easiest way on mobile is the **GitHub mobile app** or the GitHub website.

### 2.1 - Create the repository

1. Go to **https://github.com/new** (or in the app: tap **+** -> **New repository**).
2. Repository name: `lua-obfuscator-bot` (or anything you like).
3. Set it to **Private** (recommended - keeps your bot code personal).
4. Tap **Create repository**.

### 2.2 - Add ALL the files

You need these files uploaded to the repo (from the bot package):

```
bot.js
package.json
Procfile
render.yaml
.gitignore
.env.example
README.md
deobfuscator/engine.js
deobfuscator/obfuscator.js
deobfuscator/test/sample.lua
deobfuscator/test/test.js
deobfuscator/test/test_bot_flow.js
.github/workflows/keep-alive.yml
SETUP_GUIDE.md
```

**On the GitHub website** (mobile browser, request "Desktop site" if buttons are hidden):

- On your repo page tap **"Add file" -> "Create new file"**.
- Type the path with folders, e.g. `deobfuscator/engine.js` (GitHub creates the folder automatically).
- Paste the file contents, tap **"Commit changes"**.
- Repeat for each file. For `.github/workflows/keep-alive.yml`, type the full path - folders are created automatically.

> **Tip:** On mobile, "Add file" may be inside a **"..."** menu. If you don't see it, request the **Desktop site** in your browser menu.

**Do NOT upload a `.env` file** - the secret values go into Render later, not into GitHub.

**Checklist after Step 2:**
- [ ] Repo created (Private recommended)
- [ ] All 13 files uploaded
- [ ] No `.env` file in the repo

---

# STEP 3 - Deploy on Render (free)

Render is free for this kind of bot (web service, free plan).

1. Go to **https://render.com** and sign up / log in (works with GitHub login).
2. Tap **"New +"** (top right) -> **"Web Service"**.
3. Connect your GitHub account if asked, then pick your `lua-obfuscator-bot` repository.
4. Fill in the settings:

| Field | Value |
|---|---|
| **Name** | `lua-obfuscator-bot` |
| **Region** | Oregon (or closest to you) |
| **Branch** | main |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node bot.js` |
| **Instance Type** | **Free** |

5. Tap **"Add Environment Variable"** and add these two:

| Key | Value |
|---|---|
| `DISCORD_TOKEN` | (the bot token you saved in Step 1.2) |
| `CLIENT_ID` | (the application ID you saved in Step 1.1) |

   Also add these optional ones:

| Key | Value |
|---|---|
| `PREFIX` | `.` |
| `PORT` | `3000` |
| `MAX_FILE_KB` | `2000` |

6. Tap **"Create Web Service"**.
7. Wait 2-5 minutes while it installs and deploys. Watch the log - you want to see:

```
[web] keep-alive listening on :3000
[bot] slash commands registered
[bot] logged in as Lua Obfuscator Bot#1234
```

8. When you see **"logged in as ..."**, your bot is **ONLINE** in Discord!

**Checklist after Step 3:**
- [ ] Web service created (Free plan)
- [ ] DISCORD_TOKEN + CLIENT_ID set as environment variables
- [ ] Log shows "logged in as ..."
- [ ] Bot shows online (green dot) in your server

---

# STEP 4 - Keep it alive 24/7 (IMPORTANT for free tier)

Render's free plan sleeps the app after ~15 minutes with no web traffic. When it sleeps, your bot goes **offline**. Two options to prevent that - pick **one** (Option A is easier on mobile):

## Option A - UptimeRobot (recommended, easiest)

1. Go to **https://uptimerobot.com** and sign up (free).
2. Tap **"Add New Monitor"**.
3. Settings:

| Field | Value |
|---|---|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | Lua Bot Keep-Alive |
| **URL** | `https://YOUR-APP-NAME.onrender.com/health` |
| **Monitoring Interval** | 5 minutes |

4. Get your Render URL first: in Render, open your service -> at the top it shows the URL like `https://lua-obfuscator-bot.onrender.com`. Append `/health` to it.
5. Tap **Create Monitor**.

UptimeRobot now pings your bot every 5 minutes -> it never sleeps -> bot stays online 24/7.

## Option B - GitHub Actions (built into this project)

The file `.github/workflows/keep-alive.yml` pings your Render URL every 5 minutes automatically. To activate it:

1. Open your repo on GitHub -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Tap **"New repository secret"**:

| Field | Value |
|---|---|
| Name | `RENDER_URL` |
| Value | `https://your-app-name.onrender.com` |

3. Tap **Add secret**. Done - GitHub pings it every 5 minutes at no cost.

**Checklist after Step 4:**
- [ ] UptimeRobot monitor created (or RENDER_URL secret added)
- [ ] `https://your-app.onrender.com/health` returns `{"ok":true}` in browser

---

# STEP 5 - Use the bot!

1. In Discord, go to your server and pick a channel.
2. **Attach a file**: tap the **+** next to the message box -> upload a `.lua` or `.txt` file.
3. While the file is attached, type the command in the same message:

```
.obfuscate
```

4. Send. The bot replies with **`obfuscated_xxxxxx.lua`** - download it (Discord shows it as a file you can tap -> Save).

### Deobfuscate / decode

Attach the obfuscated (or any WeAreDevs-style) file and type:

```
.deobfuscate
```

or the aliases:

```
.decode
.unobfuscate
```

The bot sends back **two files**:

- **`report.txt`** - full reverse-engineering report: obfuscator identification, arithmetic camouflage table, string pool, permutation mapping, dictionaries, decoded pool entries (hex + text), VM architecture, recovered strings, confidence rating
- **`deobfuscated.lua`** - reconstructed readable source

### All commands

| Command | What it does |
|---|---|
| `.obfuscate` | Obfuscate attached `.lua`/`.txt` (string pool + Base-85 + permutation + VM dispatcher + arithmetic camouflage) |
| `.deobfuscate` / `.decode` / `.unobfuscate` | Full deobfuscation report + reconstruction |
| `.help` | Show command list |
| `.ping` | Check bot latency |
| `.info` | Engine details |
| `.source` | Where the code lives |

You can also paste code directly instead of attaching a file:

```
.deobfuscate
```lua
return (function(...) local U={"...","..."} ... end)(...)
```
```

(put the command and the code block in the **same message**)

**Checklist after Step 5:**
- [ ] `.obfuscate` returned an obfuscated `.lua` file
- [ ] `.deobfuscate` returned `report.txt` + `deobfuscated.lua`
- [ ] `.help`, `.ping`, `.info` all respond

---

# STEP 6 - Test the round-trip (verify it works end to end)

Do this once to prove your deployment works:

1. Upload a simple script as `.txt` or `.lua`:
   ```lua
   print("congrats gpt")
   print("Skido On Top")
   local x = 5
   if x > 3 then print("big") else print("small") end
   for i = 1, 3 do print("loop", i) end
   ```
2. Send `.obfuscate` -> download `obfuscated_xxxxx.lua`.
3. Attach that new file and send `.deobfuscate`.
4. Open `report.txt` -> Section 6 (DECODED POOL) should show the decoded strings, and Section 8 should list `congrats gpt`, `Skido On Top`, `big`, `small`, `loop`.
5. The obfuscated file itself runs in any Lua interpreter and prints exactly the same output as the original (verified with Lua 5.1).

---

# TROUBLESHOOTING

| Problem | Fix |
|---|---|
| Bot offline in Discord | Check Render logs. Usually: `DISCORD_TOKEN` missing/invalid, or MESSAGE CONTENT INTENT not enabled |
| `[bot] An invalid token was provided` | Re-reset the token in Discord Portal (Bot -> Reset Token) and update it in Render env vars |
| Bot online but ignores `.obfuscate` | MESSAGE CONTENT INTENT is off (Step 1.3), or the bot lacks **Send Messages** / **Attach Files** permissions in that channel |
| "Unsupported file" error | Only `.lua`, `.luau`, `.txt` are accepted |
| "File too large" | Default limit is 2000 KB - raise `MAX_FILE_KB` in Render env vars |
| Bot goes offline after ~15 min | Keep-alive not set up - do Step 4 (UptimeRobot or RENDER_URL secret) |
| Slash commands not registered | `CLIENT_ID` env var missing in Render, or re-deploy after adding it |
| Render build fails | Make sure **all** files are uploaded (especially `package.json`, `bot.js`, `deobfuscator/engine.js`, `deobfuscator/obfuscator.js`) |
| `Cannot find module 'discord.js'` | Build command must be `npm install` |

---

# SECURITY NOTES

- **Never commit `.env`** - real tokens go in Render's "Environment Variables" only. The `.gitignore` in this project already blocks `.env`.
- If your token ever leaks: Discord Portal -> Bot -> **Reset Token** immediately, then update Render.
- Keep the repo **Private** so nobody can copy your bot setup.

---

# FILE MAP (what each file does)

| File | Purpose |
|---|---|
| `bot.js` | The Discord bot: prefix + slash commands, file upload handling, keep-alive Express server |
| `deobfuscator/engine.js` | Deobfuscator: pool extraction, permutation simulation, Base-85/64 decoding, VM analysis, report generation |
| `deobfuscator/obfuscator.js` | Obfuscator: converts clean Lua into the WeAreDevs-style obfuscated architecture |
| `deobfuscator/test/*.js` | Tests: structural checks, string recovery, bot-flow simulation |
| `examples/example_clean.lua` | A clean sample script to test `.obfuscate` with |
| `examples/example_obfuscated.lua` | A ready obfuscated file to test `.deobfuscate` with (runs in real Lua) |
| `docs/MASTER_PROMPT_SPEC.txt` | The full reverse-engineering specification this engine implements |
| `package.json` | Dependencies (discord.js, express, dotenv) and start script |
| `Procfile` | Start command for Heroku-style hosts |
| `render.yaml` | Render deployment blueprint |
| `.github/workflows/keep-alive.yml` | GitHub Actions uptime pinger (UptimeRobot alternative) |
| `.env.example` | Template showing which env vars are needed |
| `.gitignore` | Keeps secrets and junk files out of GitHub |

That's everything. If all checklists are green, your bot is published and online 24/7.
