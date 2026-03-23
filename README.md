# Cursor Guard

[![npm version](https://img.shields.io/npm/v/cursor-guard)](https://www.npmjs.com/package/cursor-guard)
[![license](https://img.shields.io/github/license/zhangqiang8vipp/cursor-guard)](LICENSE)

Protects your code from accidental AI overwrite or deletion in [Cursor](https://cursor.com).

**[中文文档](README.zh-CN.md)**  
**Release / 发版（maintainers & AI）:** [docs/RELEASE.md](docs/RELEASE.md)

---

## What It Does

When Cursor's AI agent edits your files, there's a risk of accidental overwrites, deletions, or loss of work. **Cursor Guard** enforces a safety protocol:

- **Mandatory pre-write snapshots** — Git commit or shadow copy before any destructive operation
- **Read before Write** — The agent must read a file before overwriting it
- **Review before apply** — Diff previews and explicit confirmation for dangerous ops
- **Deterministic recovery** — Clear priority-ordered recovery paths (Git → shadow copies → conversation context → editor history)
- **Configurable scope** — Protect only what matters via `.cursor-guard.json`
- **Secrets filtering** — Sensitive files (`.env`, keys, certificates) are auto-excluded from backups
- **Auto-backup script** — A cross-platform watcher (Node.js) that periodically snapshots to a dedicated Git branch without disturbing your working tree
- **MCP tool calls (optional)** — 10 structured tools (diagnostics, snapshot, **record_guard_event** audit bookmark, restore, status, dashboard, alerts, etc.) with JSON responses and lower token cost
- **Auto-fix diagnostics** — `doctor_fix` automatically patches missing configs, uninitialized Git repos, gitignore gaps, and stale locks
- **Proactive change-velocity alerts (V4)** — Auto-detects abnormal file change patterns and raises risk warnings
- **Pre-warning destructive edit guard (V4.9.7)** — Detects risky partial deletions before they quietly stick, with softer auto-continue review, sidebar language sync, and `popup` / `dashboard` / `silent` modes
- **Backup health dashboard (V4)** — One-call comprehensive view: strategy, counts, disk usage, protection scope, health status
- **Web dashboard (V4.2)** — Local read-only web UI at `http://127.0.0.1:3120` — see health, backups, restore points, diagnostics, protection scope at a glance. Dual-language (zh-CN / en-US), auto-refresh, multi-project support
- **IDE extension (V4.7)** — Full dashboard embedded in VSCode/Cursor/Windsurf as a WebView tab + status bar alert indicator + sidebar project tree. No browser needed
- **Event-driven watching (V4.9)** — `fs.watch` + debounce replaces blind polling. Backup latency < 500ms, zero CPU when idle. Automatic fallback to polling on unsupported platforms
- **Right-click context menus (V4.7.7)** — Add files/folders to `protect` or `ignore` lists via Explorer/Editor right-click menu with pattern picker
- **Real-time sidebar (V4.9.1)** — "Last backup Xs ago" and alert countdown tick every second in the sidebar dashboard
- **Smart restore for deleted files (V4.8.4)** — Restore commands auto-point to parent commit (`hash~1`) when file was deleted in the snapshot, preventing "file not found" errors
- **Self-contained VSIX (V4.8.1)** — MCP server bundled as a single file via esbuild, zero npm dependencies needed for IDE extension
- **One-click hot restart (V4.5.8)** — Dashboard detects new versions and offers in-place server restart without losing state
- **Shadow incremental hard links (V4.5.4)** — Unchanged files are hard-linked to save disk space and I/O
- **Strong protection mode (V4.5.4)** — `always_watch: true` auto-starts watcher with MCP server, ensuring zero protection gaps

---

## Installation

### Method 1: npm (Recommended)

```bash
npm install cursor-guard
npx cursor-guard-init
```

The `init` command copies skill files to `.cursor/skills/cursor-guard/`, installs MCP dependencies, and adds `.gitignore` entries — all in one step.

Options:

```bash
npx cursor-guard-init              # project-local (default)
npx cursor-guard-init --global     # global (~/.cursor/skills/)
npx cursor-guard-init --path /my/project  # specify project root
```

After init, the npm package in `node_modules` is no longer needed:

```bash
npm uninstall cursor-guard
```

<details>
<summary>Manual installation (without init command)</summary>

If you prefer manual setup, copy files then install dependencies:

```bash
# Copy
cp -r node_modules/cursor-guard .cursor/skills/cursor-guard

# Install MCP dependencies in the skill directory
cd .cursor/skills/cursor-guard && npm install --omit=dev && cd -

# Add to .gitignore so node_modules aren't captured by git snapshots
echo ".cursor/skills/**/node_modules/" >> .gitignore
```

</details>

### Method 2: Git clone

```bash
# Global
git clone https://github.com/zhangqiang8vipp/cursor-guard.git ~/.cursor/skills/cursor-guard

# Per-project
git clone https://github.com/zhangqiang8vipp/cursor-guard.git .cursor/skills/cursor-guard
```

### Method 3: Manual download

Download from [GitHub Releases](https://github.com/zhangqiang8vipp/cursor-guard/releases) and extract to:

```
~/.cursor/skills/cursor-guard/               # Global
<project-root>/.cursor/skills/cursor-guard/   # Per-project
```

### Verify Installation

After installation, your directory structure should look like this:

```
.cursor/skills/cursor-guard/
├── SKILL.md                            # AI agent instructions (with MCP dual-path logic)
├── ROADMAP.md                          # Version evolution roadmap
├── README.md
├── README.zh-CN.md
├── LICENSE
├── package.json
└── references/
    ├── lib/
    │   ├── auto-backup.js              # Backup watcher (calls Core)
    │   ├── guard-doctor.js             # Health check CLI (calls Core)
    │   ├── utils.js                    # Shared utilities
    │   └── core/                       # V3 Core layer (pure logic)
    │       ├── doctor.js               # Diagnostics (incl. MCP self-check)
    │       ├── doctor-fix.js           # Auto-fix common issues
    │       ├── snapshot.js             # Git snapshots + shadow copies
    │       ├── backups.js              # Backup listing + retention
    │       ├── restore.js              # Single file / project restore
    │       ├── status.js               # Backup system status
    │       ├── anomaly.js             # V4: Change-velocity detection
│       ├── pre-warning.js         # V4.9.7: destructive edit risk scoring + persistence
    │       └── dashboard.js           # V4: Health dashboard aggregation
    ├── dashboard/
    │   ├── server.js                   # Dashboard HTTP server + API
    │   └── public/                     # Web UI (HTML/CSS/JS)
    │       ├── index.html
    │       ├── style.css
    │       └── app.js
    ├── mcp/
    │   └── server.js                   # MCP Server (10 tools)
    ├── vscode-extension/               # IDE Extension (V4.7)
    │   ├── extension.js                # Extension entry point
    │   ├── package.json                # Extension manifest
    │   ├── lib/                        # Modules (dashboard-manager, webview, status-bar, tree-view, poller)
    │   └── media/                      # Icons (SVG + PNG)
    ├── bin/
    │   ├── cursor-guard-backup.js      # CLI: npx cursor-guard-backup
    │   ├── cursor-guard-doctor.js      # CLI: npx cursor-guard-doctor
    │   └── cursor-guard-mcp (server.js)# CLI: npx cursor-guard-mcp
    ├── auto-backup.ps1 / .sh           # Thin wrappers
    ├── guard-doctor.ps1 / .sh
    ├── recovery.md                     # Recovery commands
    ├── cursor-guard.example.json       # Example config
    ├── cursor-guard.schema.json        # Config schema
    ├── config-reference.md             # Config docs (EN)
    └── config-reference.zh-CN.md       # Config docs (CN)
```

The skill activates automatically when the AI agent detects risky operations or when you mention recovery-related terms. No extra setup needed.

---

## Quick Start

1. **Install the skill** using any method above

2. **Open Cursor** and start an Agent conversation

3. **The skill works automatically** — when the AI agent tries to edit files, it will:
   - Create a Git snapshot before writing
   - Read files before overwriting
   - Show diff previews for dangerous operations
   - Report a status block after each protected operation

4. **(Optional) Add project config** to customize protection scope:

```bash
cp .cursor/skills/cursor-guard/references/cursor-guard.example.json .cursor-guard.json
```

5. **(Optional) Enable MCP tool calls** — add to `.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "cursor-guard": {
      "command": "node",
      "args": ["<skill-path>/references/mcp/server.js"]
    }
  }
}
```

This gives the AI agent 10 structured tools (diagnostics, snapshot, record_guard_event, restore, dashboard, alerts, etc.) with JSON responses — faster, more reliable, and lower token cost. Everything works without MCP too.

6. **(Optional) Run auto-backup** in a separate terminal:

```bash
npx cursor-guard-backup --path /my/project
```

### Project Configuration

Edit `.cursor-guard.json` to define which files to protect:

```json
{
  "protect": ["src/**", "lib/**", "package.json"],
  "ignore": ["node_modules/**", "dist/**"],
  "auto_backup_interval_seconds": 60,
  "secrets_patterns": [".env", ".env.*", "*.key", "*.pem"],
  "pre_restore_backup": "always",
  "proactive_alert": true,
  "alert_thresholds": { "files_per_window": 20, "window_seconds": 10, "cooldown_seconds": 60 },
  "enable_pre_warning": true,
  "pre_warning_threshold": 30,
  "pre_warning_mode": "popup",
  "pre_warning_exclude_patterns": ["generated/**"],
  "retention": { "mode": "days", "days": 30 }
}
```

#### `pre_restore_backup` — restore behavior control

| Value | Behavior |
|-------|----------|
| `"always"` (default) | Automatically preserve current version before every restore. No prompt. |
| `"ask"` | Prompt you each time: "Preserve current version before restore? (Y/n)" — you decide per restore. |
| `"never"` | Never preserve current version before restore (not recommended). |

Regardless of config, you can always override per-request:
- Say "don't preserve current version" to skip even when config is `"always"`
- Say "preserve current first" to force even when config is `"never"`

#### `enable_pre_warning` — destructive partial-delete pre-warning

When enabled, the IDE extension evaluates edits that remove lines or whole methods/functions before they slip by unnoticed.

| Field | Default | Meaning |
|-------|---------|---------|
| `enable_pre_warning` | `false` | Turn pre-warning on without affecting existing projects |
| `pre_warning_threshold` | `30` | Warn when deletion risk reaches this percent |
| `pre_warning_mode` | `"popup"` | `popup` = interrupt with actions, `dashboard` = highlight only, `silent` = log/status only |
| `pre_warning_exclude_patterns` | `[]` | Skip generated files, migrations, vendored code, etc. |

Method/function removal is treated as high risk and can still trigger a warning even when the deleted-line percentage is below the threshold.

---

## Auto-Backup Script

Run in a separate terminal while working in Cursor. Cross-platform — requires Node.js >= 18.

Important:

- You can run the command from any directory
- But `--path` must point to the project root you want to protect
- If you are already in the project root, `--path .` is fine
- If you are not in the project root, do not use `--path .`; use the full target path instead

```bash
# If you are already in the project root
npx cursor-guard-backup --path .

# If you are not in the project root
npx cursor-guard-backup --path /my/project
npx cursor-guard-backup --path /my/project --interval 30

# Windows PowerShell
.\references\auto-backup.ps1 -Path "D:\MyProject"

# macOS / Linux
./references/auto-backup.sh /my/project
```

Wrong example:

```bash
# You are in some other directory
# In that case --path . protects the current directory, not your real project
npx cursor-guard-backup --path .
```

The script uses Git plumbing commands to snapshot to `refs/guard/auto-backup` — it never switches branches or touches your working index. The ref lives outside `refs/heads/` so `git push --all` won't push it. Supports `shadow` mode for non-Git directories.

### Health Check

```bash
npx cursor-guard-doctor --path /my/project

# Windows: .\references\guard-doctor.ps1 -Path "D:\MyProject"
# macOS/Linux: ./references/guard-doctor.sh /my/project
```

> **Note**: Run backup/doctor scripts in a separate terminal, NOT inside Cursor's integrated terminal.

### Web Dashboard

A local read-only web page for monitoring backup health, restore points, protection scope, and diagnostics — all in one view.

```bash
# Monitor a single project
npx cursor-guard-dashboard --path /my/project

# Monitor multiple projects
npx cursor-guard-dashboard --path /project-a --path /project-b

# Custom port (default: 3120)
npx cursor-guard-dashboard --path /my/project --port 8080

# Windows PowerShell (from skill directory)
node references\dashboard\server.js --path "D:\MyProject"
```

Then open `http://127.0.0.1:3120` in your browser. Or use the **IDE Extension** (see below) to embed the dashboard directly in your editor.

Features:

- **Read-only** — no write operations, safe to run anytime
- **Dual-language** — zh-CN / en-US, auto-detects system language, manual toggle in top-right
- **Auto-refresh** — pulls data every 15 seconds, plus manual refresh button
- **Multi-project** — pass multiple `--path` args to monitor several projects from one page
- **4 sections**: Overview (health + watcher + alerts + latest backups), Backups & Recovery (restore point table with type filters), Protection Scope (protect/ignore patterns), Diagnostics (doctor checks)
- **2 detail drawers**: Restore Point drawer (preview JSON, copy ref/hash), Doctor drawer (full check list, WARN/FAIL expanded by default)
- **Security** — binds to `127.0.0.1` only (not exposed to LAN), API uses project IDs instead of raw file paths, static file serving restricted to `public/` directory
- **Zero extra dependencies** — uses Node.js built-in `http` module + existing cursor-guard core modules

### IDE Extension (VSCode / Cursor / Windsurf)

Embed the full dashboard directly inside your IDE — no browser needed.

#### Method A: VSIX standalone (recommended, no npm needed)

```bash
# Build the self-contained VSIX (version = root package.json "version")
cd references/vscode-extension
node build-vsix.js
cd dist
npx --yes @vscode/vsce package --no-dependencies

# Install the generated .vsix (VERSION always matches package.json)
V=$(node -p "require('../../../package.json').version")
code --install-extension "cursor-guard-ide-${V}.vsix"
```

PowerShell (from `references\vscode-extension\dist`):

```powershell
$V = node -p "require('../../../package.json').version"
code --install-extension "cursor-guard-ide-$V.vsix"
```

Print the full release checklist from the repo root: `npm run release:checklist`.

On first activation, the extension automatically:
- Installs `SKILL.md` to your IDE's skills directory
- Registers the MCP Server in your IDE's `mcp.json`
- Creates a default `.cursor-guard.json` if missing

#### Method B: From source (development)

```bash
cd references/vscode-extension
code --install-extension .
```

Features:

- **WebView Dashboard** — full dashboard embedded as an editor tab, identical to the browser version
- **Status Bar Indicator** — shows `Guard: OK` (green) or `Guard: 22 files!` (yellow) in real-time
- **Sidebar TreeView** — activity bar icon with project list, watcher status, backup stats, alerts, health
- **Visual Sidebar** — graphical dashboard with live-ticking backup age, alert countdown, protection scope, quick stats
- **Pre-warning delete guard** — flags risky partial deletions, removed methods, and suspicious line drops before they quietly stick
- **Command Palette** — `Open Dashboard`, `Snapshot Now`, `Start/Stop Watcher`, `Quick Restore`, `Doctor`, `Refresh`
- **Right-click menus** — add files/folders to `protect` or `ignore` via Explorer/Editor context menu
- **Event-driven refresh** — `FileSystemWatcher` pushes UI updates on file changes (< 1.5s latency), 30s heartbeat fallback
- **Auto-setup (V4.7.5)** — auto-detects IDE type, installs Skill, registers MCP, creates config on first run
- **Self-contained (V4.8.1)** — MCP server bundled via esbuild, zero npm dependencies
- **Multi-project** — hot-loads all workspace folders with `.cursor-guard.json`
- **Compatible** — works with VSCode ^1.74.0, Cursor, Windsurf, Trae, and all VSCode-based IDEs

---

## Recovery

If something goes wrong, just tell the AI agent in natural language.

**Default behavior**: Before any restore, the agent automatically preserves your current version so you can undo the restore if needed. You don't need to ask for this — it happens by default. To skip, explicitly say "don't preserve current version" or "skip backup before restore".

### By time

> "restore to 5 minutes ago"
> "go back to yesterday's version"
> "restore to 3pm today"

### By version

> "undo the last change"
> "go back 3 versions"
> "restore to the previous version"

### By file

> "restore src/app.py to 10 minutes ago"
> "restore src/app.py to the previous version"

The agent will:
1. **Preserve your current version** first (unless you opt out)
2. Search Git history and auto-backup snapshots
3. Show matching versions for you to choose
4. Restore after your confirmation
5. Report both the pre-restore backup ref and the restore result

If the pre-restore backup fails, the agent will **not** proceed — it will wait for your explicit confirmation before restoring without a safety net.

### Recovery priority

1. **Git** — `git restore`, `git reset`, `git reflog`
2. **Auto-backup ref** — `refs/guard/auto-backup`
3. **Shadow copies** — `.cursor-guard-backup/<timestamp>/`
4. **Conversation context** — Original file content captured by agent Read calls
5. **Editor history** — VS Code/Cursor Timeline (auxiliary)

See [references/recovery.md](references/recovery.md) for detailed commands.

---

## Trigger Keywords

The skill activates on these signals:

- File edits, deletes, renames by the AI agent
- Recovery requests: "rollback", "undo", "recover", "restore"
- Time-based recovery: "restore to N minutes ago", "go back to yesterday"
- Version-based recovery: "previous version", "go back N versions"
- History issues: checkpoints missing, Timeline not working, save failures
- Health check: "guard doctor", "check guard setup", "is MCP working"
- Auto-fix: "guard fix", "fix config"
- Backup status: "guard status", "is the watcher running", "last backup time"
- Dashboard: "dashboard", "health overview", "backup summary"
- Alerts: "any alerts?", "change velocity warning", "risk status"

---

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main skill instructions for the AI agent (with MCP dual-path) |
| `ROADMAP.md` | Version evolution roadmap (V2-V7) |
| `references/lib/core/` | Core layer: 9 pure-logic modules (doctor / doctor-fix / snapshot / backups / restore / status / anomaly / pre-warning / dashboard) |
| `references/mcp/server.js` | MCP Server: 10 structured tools (optional) |
| `references/lib/auto-backup.js` | Auto-backup watcher (calls Core) |
| `references/lib/guard-doctor.js` | Health check CLI shell (calls Core) |
| `references/lib/utils.js` | Shared utilities (config, glob, git, manifest) |
| `references/bin/cursor-guard-backup.js` | CLI entry: `npx cursor-guard-backup` |
| `references/bin/cursor-guard-doctor.js` | CLI entry: `npx cursor-guard-doctor` |
| `references/dashboard/server.js` | Dashboard HTTP server + REST API |
| `references/dashboard/public/` | Dashboard web UI (index.html, style.css, app.js) |
| `references/vscode-extension/` | IDE Extension: WebView dashboard, status bar, sidebar tree, commands |
| `references/auto-backup.ps1` / `.sh` | Thin wrappers (Windows / macOS+Linux) |
| `references/guard-doctor.ps1` / `.sh` | Thin wrappers (Windows / macOS+Linux) |
| `references/recovery.md` | Recovery command templates |
| `references/cursor-guard.example.json` | Example project configuration |
| `references/cursor-guard.schema.json` | JSON Schema for config validation |
| `references/config-reference.md` | Config field docs (English) |
| `references/config-reference.zh-CN.md` | Config field docs (Chinese) |

---

## Changelog

### v4.9.9 — Dedicated release guide (`docs/RELEASE.md`)

- **Docs**: New bilingual **[docs/RELEASE.md](docs/RELEASE.md)** for maintainers, developers, and AI agents (full procedure, Windows `gh` + UTF-8 `--notes-file`, npm OTP)
- **Docs**: README / README.zh-CN link to the guide from the header and the release-checklist section; `npm run release:checklist` footer points to the same file
- **Packaging**: `docs/RELEASE.md` added to npm `files` so it ships with the package

### v4.9.8 — Release docs, checklist script, sidebar brand asset

- **Docs**: Bilingual **Release checklist** sections in README / README.zh-CN; steps tied to root `package.json` `version` so VSIX file name, Git tag, and npm stay consistent
- **Tooling**: `npm run release:checklist` (`scripts/print-release-checklist.js`) prints a ready-to-paste table; `build-vsix.js` logs the expected VSIX file name after build
- **IDE**: Sidebar header can show packaged brand artwork via `media/brand-placeholder.png` and `asWebviewUri` (fallback gradient if the file is absent)

### v4.9.7 — Softer Pre-Warning UX, Sidebar Locale Sync, and Watcher Singleton Guard

- **Improve**: `popup` mode now uses a softer auto-continue review flow with a 2-second timeout instead of a hard modal stop
- **Improve**: Pre-warning review text now follows the sidebar language toggle, keeping zh-CN / en-US messaging consistent inside the IDE
- **Fix**: Sidebar keeps showing watcher / health status even when delete-risk warnings are present, and popup-mode warnings no longer stick forever
- **Fix**: IDE watcher start/stop logic now uses the real per-project lock path and pending-process guard, preventing repeated clicks from spawning duplicate watchers
- **Docs**: README, roadmap, and skill notes updated for the 4.9.7 release flow and IDE behavior

### v4.9.6 — Pre-Warning for Destructive Partial Deletes

- **Feature**: Added configurable `pre_warning` support in `.cursor-guard.json` — `enable_pre_warning`, `pre_warning_threshold`, `pre_warning_mode`, `pre_warning_exclude_patterns`
- **Feature**: IDE extension now detects risky line/method removals and can react in `popup`, `dashboard`, or `silent` mode
- **Feature**: `backup_status`, `dashboard`, sidebar, status bar, and browser dashboard surface active delete-risk warnings
- **Improve**: New `pre-warning.js` core module centralizes deletion-risk scoring, active-warning persistence, and warning history
- **Docs**: README, skill guide, roadmap, and config references now document the pre-warning flow end-to-end

### v4.9.0–v4.9.1 — Event-Driven Architecture

- **Architecture**: Watcher (`auto-backup.js`) rewritten from `while+sleep` polling to `fs.watch` event-driven with 500ms debounce. Zero CPU when idle, backup latency < 500ms
- **Fallback**: Automatic degradation to polling mode if `fs.watch` is unavailable (e.g. older Linux kernels)
- **Config hot-reload**: `.cursor-guard.json` changes trigger instant config reload via `fs.watch` event (no more waiting 10 polling cycles)
- **IDE FileSystemWatcher**: Extension uses VSCode built-in `createFileSystemWatcher` to push UI updates on file changes (1.5s debounce)
- **Poller heartbeat**: Reduced from 5s fixed interval to 30s heartbeat; UI updates are now event-driven
- **Live sidebar counters**: "Last backup Xs ago" ticks every second in real-time (v4.9.1)

### v4.8.0–v4.8.5 — Bundling, Doctor Fixes, Restore UX

- **Fix**: MCP server bundled as single self-contained file via esbuild — eliminates all transitive dependency issues (`zod-to-json-schema`, `ajv`, etc.) (v4.8.1)
- **Fix**: `doctor` MCP check no longer false-warns when cursor-guard is configured in `.cursor/mcp.json` (v4.8.2)
- **Fix**: Skill directory `references/` now auto-creates junction link to extension runtime files on every activation (v4.8.2)
- **Fix**: Deleted file restore commands auto-point to parent commit (`hash~1`), preventing "file not found" errors. Button shows "Restore pre-delete" with orange styling (v4.8.4)
- **Fix**: Files outside `protect` scope no longer appear as phantom "deleted" in change summaries (v4.8.5)
- **Improve**: VSIX package reduced from 3.18 MB to 1.27 MB thanks to esbuild bundling

### v4.7.6–v4.7.9 — Sidebar Redesign, Context Menus, Protection Scope

- **Feature**: Right-click context menus — add files/folders to `protect` or `ignore` via Explorer/Editor menus with pattern picker (v4.7.7)
- **Feature**: Protection scope card in sidebar — shows protected/excluded file counts, actual protect/ignore patterns (v4.7.8)
- **Feature**: Alert countdown ticks live every second in sidebar (v4.7.8)
- **Fix**: Open Dashboard CORS/CSP issues — added `Access-Control-Allow-Origin`, relaxed CSP, fallback to browser on WebView failure (v4.7.8)
- **Fix**: `protect` patterns now use strict matching (full path only, no basename fallback) for consistency (v4.7.8)
- **Redesign**: Sidebar dashboard simplified — single status indicator, 2x2 action button grid, streamlined Quick Stats, removed clutter (v4.7.6)

### v4.7.5 — VSIX Self-Contained Build + Auto-Setup

- **Feature**: `build-vsix.js` packages all runtime dependencies into a self-contained VSIX — no npm installation needed
- **Feature**: `auto-setup.js` auto-detects IDE type (Cursor/Windsurf/Trae/VSCode), installs SKILL.md, registers MCP Server, creates default config on first activation
- **Fix**: `dashboard/server.js` PKG_PATH now dynamically resolved (supports skill dir, VSIX flat, `guard-version.json` fallback)
- **Enhancement**: Added `onStartupFinished` activation event so auto-setup runs even without `.cursor-guard.json`

### v4.7.0–v4.7.4 — IDE Extension + Bug Fixes

- **Feature**: VSCode/Cursor/Windsurf extension — full dashboard as WebView tab, status bar alert indicator, sidebar TreeView with project status, Command Palette integration
- **Feature**: Auto-activation on `.cursor-guard.json` detection, dashboard server runs in extension host process (zero subprocess overhead)
- **Feature**: Visual sidebar dashboard with charts, progress bars, status badges (v4.7.3)
- **Fix**: Smart path resolver (`paths.js`) for VSIX/skill/npm installation contexts (v4.7.4)
- **Fix**: WebView CSP, watcher infinite restart, snapshot status handling (v4.7.1–v4.7.4)
- **Adapt**: `fetchJson()` supports `__GUARD_BASE_URL__` for WebView; `copyText()` bridges to `vscode.env.clipboard` when in IDE

### v4.6.x — Alert UX Overhaul

- **Fix**: Alert countdown now updates every second (was only on 15s page refresh)
- **Fix**: Alert file details modal now shows per-file "Copy Restore Command" buttons
- **Fix**: Backup stale threshold changed to `max(interval*10, 300)s` (min 5 min); only checks when watcher is running
- **Feature**: Alert history always accessible (both active and no-alert states), persisted in `localStorage`
- **Feature**: Alert history as modal dialog with nested file detail drill-down

### v4.5.x — Protection Hardening

- **Fix**: Shadow hard-link ordering bug (previous snapshot was always empty directory)
- **Fix**: `changedFiles` now filters ignored paths from git diff output
- **Feature**: Alert structured file list — per-file path, action, +/- lines, sortable tables
- **Feature**: Shadow incremental hard links — unchanged files linked to previous snapshot, saving disk space
- **Feature**: `always_watch: true` config — watcher auto-starts with MCP server, zero protection gaps
- **Feature**: Dashboard server singleton — multiple projects share one port, hot-add new projects
- **Feature**: Dashboard version detection + one-click hot restart (`/api/restart` endpoint)
- **Feature**: File detail modal with per-file restore command copy buttons
- **Feature**: `cursor-guard-init` auto-creates `.cursor-guard.json`; `backup_interval_seconds` alias supported
- **License**: Changed to BSL 1.1

### v4.4.0 — V4 Final

- **Fix**: First snapshot now generates "Added N: file1, file2, ..." summary instead of blank — previously the very first backup had no summary because there was no parent tree to diff against
- **Feature**: `--dashboard` flag for watcher — `npx cursor-guard-backup --path <dir> --dashboard` starts the web dashboard alongside the watcher in a single process. Optional port: `--dashboard 4000`. Auto-increments if port is busy
- **Feature**: Doctor check "Git retention" — warns when git backup commits exceed 500 and `git_retention.enabled` is `false`, guiding users to enable auto-pruning before refs grow unbounded
- **Feature**: Doctor check "Backup integrity" — verifies that the latest auto-backup commit's tree object is reachable via `git cat-file -t`, catching silent corruption early
- **Improve**: `cursor-guard-init` now detects existing `.cursor-guard.json` and displays an upgrade notice instead of silently overwriting
- **Improve**: Dashboard server refactored to export `startDashboardServer()` for embedding into other processes

### v4.3.5

- **Fix**: Backup summary now uses incremental `diff-tree` instead of `git status --porcelain` — previously summary always showed cumulative changes since HEAD, now correctly shows changes since the last auto-backup
- **Improve**: Dashboard backup table "Changes" column uses stacked layout (file count + trigger / intent / detail on separate rows) for better readability
- **Improve**: Refined color palette — deeper background contrast, softer status colors (green `#4ade80`, amber `#f59e0b`, red `#ef4444`), deeper brand blue `#3b82f6`, wider text hierarchy gap

### v4.3.4

- **Improve**: Log rotation — `backup.log` now rotates at 1MB, keeping up to 3 old files (`backup.log.1`, `.2`, `.3`). Rotation runs on watcher startup and every 100 writes
- **Improve**: Watcher single-instance protection — lock file now includes startup timestamp; locks older than 24h are auto-cleaned even if PID check is unreliable on Windows
- **Improve**: `previewProjectRestore` output grouped — protected paths (`.cursor/`, `.gitignore`, `.cursor-guard.json`) summarized as `protectedPaths: { count: N }` instead of listing thousands of individual files, drastically reducing token cost
- **Improve**: SKILL.md Hard Rule #15 — agents must commit skill files after upgrade to ensure `restore_project` HEAD protection works correctly

### v4.3.3

- **Feature**: Intent context for snapshots — `snapshot_now` now accepts `intent`, `agent`, and `session` parameters, stored as Git commit trailers to form an audit trail per operation
- **Feature**: Dashboard displays intent badge in backup table and full intent/agent/session fields in restore-point drawer
- **Improve**: `parseCommitTrailers` refactored to a data-driven map, supporting all 6 trailer fields (Files-Changed, Summary, Trigger, Intent, Agent, Session)
- **Improve**: SKILL.md updated to guide AI agents to pass `intent` describing the operation about to happen

### v4.3.2

- **Fix**: `cursor-guard-init` now adds `node_modules/` (root-level) to `.gitignore` — prevents `git add -A` from scanning thousands of npm dependency files after `npm install cursor-guard --save-dev`
- **Improve**: Doctor "MCP version" mismatch warning now includes the reload keybinding (`Ctrl+Shift+P -> "Developer: Reload Window"`) for faster action

### v4.3.1

- **Fix**: `restore_project` now protects `.gitignore` — added to `GUARD_CONFIGS` so it is restored from HEAD after recovery, preventing post-restore full-tree scans (2500+ files)
- **Fix**: `cursor-guard-index.lock` cleanup — `createGitSnapshot` now removes stale `.lock` files on entry and in the `finally` block, preventing lock file remnants from blocking subsequent operations
- **Improve**: Auto-backup summary now filtered by `protect`/`ignore` patterns, excluding `.cursor/skills/` and other non-protected files
- **Improve**: Summary format changed from flat `M file1, A file2` to categorized `Modified 3: a.js; Added 1: b.js` with i18n support
- **Improve**: Manual snapshot `message` (from `snapshot_now`) now displayed in dashboard backup table and restore-point drawer
- **Improve**: SKILL.md adds best-practice guidance for AI agents to provide descriptive `message` when calling `snapshot_now`

### v4.3.0

- **Feature**: Backup context metadata — structured Git commit messages with `Files-Changed`, `Summary`, and `Trigger` trailers
- **Feature**: `listBackups` parses commit trailers and returns `filesChanged`, `summary`, `trigger` fields
- **Feature**: Dashboard backup table adds "Changes" column; restore-point drawer shows trigger, files changed, and summary

### v4.2.2

- **Fix**: `restore_project` now protects `.cursor-guard.json` during restore (prevents config loss)
- **Fix**: Post-restore HEAD recovery loop extended to restore both `.cursor/` and `.cursor-guard.json`
- **Improve**: `cursor-guard-init` now reminds users to `git commit` after installation in Git repos

### v4.2.1

- **Fix**: `t()` function uses `replaceAll` for i18n placeholder substitution
- **Fix**: Removed unused `loadActiveAlert` import from dashboard server
- **Fix**: Added `git-snapshot` type to dashboard filter bar
- **Fix**: Replaced `&&` with `;` in `detail.mcp_no_sdk` i18n string for cross-platform compatibility
- **Fix**: Deduplicated `sdkCandidates` in `doctor.js`

### v4.2.0

- **Feature**: Web dashboard — local read-only UI with health overview, backup table, restore-point drawers, diagnostics, protection scope
- **Feature**: Dual-language (zh-CN / en-US) with full i18n coverage including doctor checks, health issues, alert messages
- **Feature**: Multi-project support via CLI `--path` args and frontend project selector

---

## Release checklist

**Single source of truth**: the `version` field in the **repository root** `package.json`. Running `references/vscode-extension/build-vsix.js` copies that value into the extension `package.json` and `guard-version.json`, so the VSIX and npm tarball stay aligned.

**Full guide (bilingual, for humans and AI agents):** [docs/RELEASE.md](docs/RELEASE.md) — includes **Windows `gh` + UTF-8**: use `--notes-file` for GitHub Release bodies so Chinese text does not become mojibake.

### Generate a filled-in table (recommended)

From the repository root:

```bash
npm run release:checklist
```

Copy the terminal output into your own release tracker. It always reflects the current `package.json` version.

### Reference checklist

| Step | What to do |
|------|------------|
| **1. Version** | Bump root `package.json` `version`, then rebuild. Do not keep stale numbers (e.g. 4.9.5) in notes while the repo is already newer. |
| **2. VSIX** | `cd references/vscode-extension && node build-vsix.js && cd dist && npx --yes @vscode/vsce package --no-dependencies` |
| **3. Artifact** | `cursor-guard-ide-<version>.vsix` in `references/vscode-extension/dist/` (file name matches `version`). |
| **4. Git** | Commit and push your default branch; create and push tag `v<version>` (example: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`). Record the actual commit hash in your notes. |
| **5. GitHub Release** | [Create a release](https://github.com/zhangqiang8vipp/cursor-guard/releases/new), select tag `v<version>`, attach the VSIX. |
| **6. Release branches** | Fast-forward maintenance branches such as `release/v4.8.x` / `release/v4.7.x` to the current `master` when your branching policy requires it. |
| **7. npm** | From the repo root: `npm publish`. If npm asks for OTP, complete verification in the browser, then run `npm publish` again. |

Skipping the Marketplace is fine; GitHub Release + VSIX is enough for many users.

---

## Known Limitations

- **Binary files**: Git diffs and snapshots work on text files. Binary files (images, compiled assets) are stored but cannot be meaningfully diffed or partially restored.
- **Untracked files**: Files never committed to Git cannot be recovered from Git history. Shadow copy (`backup_strategy: "shadow"` or `"both"`) is the only safety net for untracked files.
- **Concurrent agents**: If multiple AI agent threads write to the same file simultaneously, snapshots cannot prevent race conditions. Avoid parallel edits to the same file.
- **External tools modifying the index**: Tools that alter Git's index (e.g. other Git GUIs, IDE Git integrations) while auto-backup is running may conflict. The script uses a temporary index to minimize this, but edge cases exist.
- **Git worktree**: The auto-backup script supports worktree layouts (`git rev-parse --git-dir`), but has not been tested with all exotic setups (e.g. `--separate-git-dir`).
- **Pre-warning scope**: `pre_warning` is currently an editor/extension-side "last brake", not a universal cross-process write blocker. Headless shell / MCP flows surface it through status and dashboard after detection rather than hard-blocking writes.
- **Cursor terminal interference**: Cursor's integrated terminal injects `--trailer` flags into `git commit` commands, which breaks plumbing commands like `commit-tree`. Always run auto-backup in a **separate terminal window**.
- **Large repos**: For very large repositories, `git add -A` in the backup loop may be slow. Use `protect` patterns in `.cursor-guard.json` to narrow scope.

## Requirements

- **Node.js >= 18** — core runtime for backup and health check scripts
- **Git** — for primary backup strategy (not needed for shadow-only mode)
- **Cursor IDE** — with Agent mode enabled

---

## Support / Donate

This is an independent open-source project maintained by a solo developer. If Cursor Guard has saved your code or your time, consider buying me a coffee :)

| WeChat Pay | Alipay |
|:---:|:---:|
| <img src="media/wechat-pay.png" alt="WeChat Pay" width="200"> | <img src="media/alipay.jpg" alt="Alipay" width="200"> |

---

## License

[BSL 1.1](LICENSE)
