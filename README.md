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
- **Auto-backup script** — A PowerShell watcher that periodically snapshots to a dedicated Git branch without disturbing your working tree

---

## Installation

### Method 1: npm

```bash
npm install cursor-guard
```

After installation, copy the skill files to your Cursor skills directory:

**Windows (PowerShell):**

```powershell
# Global (all projects)
Copy-Item -Recurse node_modules/cursor-guard "$env:USERPROFILE/.cursor/skills/cursor-guard"

# Per-project (current project only)
Copy-Item -Recurse node_modules/cursor-guard .cursor/skills/cursor-guard
```

**macOS / Linux:**

```bash
# Global
cp -r node_modules/cursor-guard ~/.cursor/skills/cursor-guard

# Per-project
cp -r node_modules/cursor-guard .cursor/skills/cursor-guard
```

After copying, you can remove the npm dependency if you don't need it in `node_modules`:

```bash
npm uninstall cursor-guard
```

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
├── SKILL.md                          # AI agent instructions
├── README.md
├── LICENSE
└── references/
    ├── auto-backup.ps1               # Auto-backup script
    ├── recovery.md                   # Recovery commands
    ├── cursor-guard.example.json     # Example config
    └── cursor-guard.schema.json      # Config schema
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

5. **(Optional) Run auto-backup** in a separate terminal:

```powershell
.\auto-backup.ps1 -Path "D:\MyProject"
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

Run in a separate terminal while working in Cursor:

```powershell
.\auto-backup.ps1 -Path "D:\MyProject"

# Custom interval (default 60s):
.\auto-backup.ps1 -Path "D:\MyProject" -IntervalSeconds 30
```

The script uses Git plumbing commands to snapshot to `cursor-guard/auto-backup` branch — it never switches branches or touches your working index.

> **Note**: Run this script in a separate PowerShell window, NOT inside Cursor's integrated terminal. Cursor's terminal may interfere with Git plumbing commands.

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
2. **Auto-backup branch** — `cursor-guard/auto-backup`
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

---

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main skill instructions for the AI agent |
| `references/auto-backup.ps1` | PowerShell auto-backup watcher script |
| `references/recovery.md` | Recovery command templates |
| `references/cursor-guard.example.json` | Example project configuration |
| `references/cursor-guard.schema.json` | JSON Schema for config validation |

---

## Known Limitations

- **Binary files**: Git diffs and snapshots work on text files. Binary files (images, compiled assets) are stored but cannot be meaningfully diffed or partially restored.
- **Untracked files**: Files never committed to Git cannot be recovered from Git history. Shadow copy (`backup_strategy: "shadow"` or `"both"`) is the only safety net for untracked files.
- **Concurrent agents**: If multiple AI agent threads write to the same file simultaneously, snapshots cannot prevent race conditions. Avoid parallel edits to the same file.
- **External tools modifying the index**: Tools that alter Git's index (e.g. other Git GUIs, IDE Git integrations) while `auto-backup.ps1` is running may conflict. The script uses a temporary index to minimize this, but edge cases exist.
- **Git worktree**: The auto-backup script supports worktree layouts (`git rev-parse --git-dir`), but has not been tested with all exotic setups (e.g. `--separate-git-dir`).
- **Cursor terminal interference**: Cursor's integrated terminal injects `--trailer` flags into `git commit` commands, which breaks plumbing commands like `commit-tree`. Always run `auto-backup.ps1` in a **separate PowerShell window**.
- **Large repos**: For very large repositories, `git add -A` in the backup loop may be slow. Use `protect` patterns in `.cursor-guard.json` to narrow scope.

## Requirements

- **Git** — for primary backup strategy
- **PowerShell 5.1+** — for auto-backup script (Windows built-in)
- **Cursor IDE** — with Agent mode enabled

---

## License

MIT
