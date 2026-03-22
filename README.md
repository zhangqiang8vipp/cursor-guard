# Cursor Guard

[![npm version](https://img.shields.io/npm/v/cursor-guard)](https://www.npmjs.com/package/cursor-guard)
[![license](https://img.shields.io/github/license/zhangqiang8vipp/cursor-guard)](LICENSE)

Protects your code from accidental AI overwrite or deletion in [Cursor](https://cursor.com).

**[中文文档](README.zh-CN.md)**

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
- **MCP tool calls (optional)** — 9 structured tools (diagnostics, snapshot, restore, status, dashboard, alerts, etc.) with JSON responses and lower token cost
- **Auto-fix diagnostics** — `doctor_fix` automatically patches missing configs, uninitialized Git repos, gitignore gaps, and stale locks
- **Proactive change-velocity alerts (V4)** — Auto-detects abnormal file change patterns and raises risk warnings
- **Backup health dashboard (V4)** — One-call comprehensive view: strategy, counts, disk usage, protection scope, health status
- **Web dashboard (V4.2)** — Local read-only web UI at `http://127.0.0.1:3120` — see health, backups, restore points, diagnostics, protection scope at a glance. Dual-language (zh-CN / en-US), auto-refresh every 15s, multi-project support

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
    │       └── dashboard.js           # V4: Health dashboard aggregation
    ├── dashboard/
    │   ├── server.js                   # Dashboard HTTP server + API
    │   └── public/                     # Web UI (HTML/CSS/JS)
    │       ├── index.html
    │       ├── style.css
    │       └── app.js
    ├── mcp/
    │   └── server.js                   # MCP Server (9 tools)
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

This gives the AI agent 9 structured tools (diagnostics, snapshot, restore, dashboard, alerts, etc.) with JSON responses — faster, more reliable, and lower token cost. Everything works without MCP too.

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

Then open `http://127.0.0.1:3120` in your browser.

Features:

- **Read-only** — no write operations, safe to run anytime
- **Dual-language** — zh-CN / en-US, auto-detects system language, manual toggle in top-right
- **Auto-refresh** — pulls data every 15 seconds, plus manual refresh button
- **Multi-project** — pass multiple `--path` args to monitor several projects from one page
- **4 sections**: Overview (health + watcher + alerts + latest backups), Backups & Recovery (restore point table with type filters), Protection Scope (protect/ignore patterns), Diagnostics (doctor checks)
- **2 detail drawers**: Restore Point drawer (preview JSON, copy ref/hash), Doctor drawer (full check list, WARN/FAIL expanded by default)
- **Security** — binds to `127.0.0.1` only (not exposed to LAN), API uses project IDs instead of raw file paths, static file serving restricted to `public/` directory
- **Zero extra dependencies** — uses Node.js built-in `http` module + existing cursor-guard core modules

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
| `references/lib/core/` | Core layer: 8 pure-logic modules (doctor / doctor-fix / snapshot / backups / restore / status / anomaly / dashboard) |
| `references/mcp/server.js` | MCP Server: 9 structured tools (optional) |
| `references/lib/auto-backup.js` | Auto-backup watcher (calls Core) |
| `references/lib/guard-doctor.js` | Health check CLI shell (calls Core) |
| `references/lib/utils.js` | Shared utilities (config, glob, git, manifest) |
| `references/bin/cursor-guard-backup.js` | CLI entry: `npx cursor-guard-backup` |
| `references/bin/cursor-guard-doctor.js` | CLI entry: `npx cursor-guard-doctor` |
| `references/dashboard/server.js` | Dashboard HTTP server + REST API |
| `references/dashboard/public/` | Dashboard web UI (index.html, style.css, app.js) |
| `references/auto-backup.ps1` / `.sh` | Thin wrappers (Windows / macOS+Linux) |
| `references/guard-doctor.ps1` / `.sh` | Thin wrappers (Windows / macOS+Linux) |
| `references/recovery.md` | Recovery command templates |
| `references/cursor-guard.example.json` | Example project configuration |
| `references/cursor-guard.schema.json` | JSON Schema for config validation |
| `references/config-reference.md` | Config field docs (English) |
| `references/config-reference.zh-CN.md` | Config field docs (Chinese) |

---

## Changelog

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

## Known Limitations

- **Binary files**: Git diffs and snapshots work on text files. Binary files (images, compiled assets) are stored but cannot be meaningfully diffed or partially restored.
- **Untracked files**: Files never committed to Git cannot be recovered from Git history. Shadow copy (`backup_strategy: "shadow"` or `"both"`) is the only safety net for untracked files.
- **Concurrent agents**: If multiple AI agent threads write to the same file simultaneously, snapshots cannot prevent race conditions. Avoid parallel edits to the same file.
- **External tools modifying the index**: Tools that alter Git's index (e.g. other Git GUIs, IDE Git integrations) while auto-backup is running may conflict. The script uses a temporary index to minimize this, but edge cases exist.
- **Git worktree**: The auto-backup script supports worktree layouts (`git rev-parse --git-dir`), but has not been tested with all exotic setups (e.g. `--separate-git-dir`).
- **Cursor terminal interference**: Cursor's integrated terminal injects `--trailer` flags into `git commit` commands, which breaks plumbing commands like `commit-tree`. Always run auto-backup in a **separate terminal window**.
- **Large repos**: For very large repositories, `git add -A` in the backup loop may be slow. Use `protect` patterns in `.cursor-guard.json` to narrow scope.

## Requirements

- **Node.js >= 18** — core runtime for backup and health check scripts
- **Git** — for primary backup strategy (not needed for shadow-only mode)
- **Cursor IDE** — with Agent mode enabled

---

## License

MIT
