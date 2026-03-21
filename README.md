# Cursor Guard

Protects your code from accidental AI overwrite or deletion in [Cursor](https://cursor.com).

## What It Does

When Cursor's AI agent edits your files, there's a risk of accidental overwrites, deletions, or loss of work. **Cursor Guard** enforces a safety protocol:

- **Mandatory pre-write snapshots** — Git commit or shadow copy before any destructive operation
- **Read before Write** — The agent must read a file before overwriting it
- **Review before apply** — Diff previews and explicit confirmation for dangerous ops
- **Deterministic recovery** — Clear priority-ordered recovery paths (Git → shadow copies → conversation context → editor history)
- **Configurable scope** — Protect only what matters via `.cursor-guard.json`
- **Secrets filtering** — Sensitive files (`.env`, keys, certificates) are auto-excluded from backups
- **Auto-backup script** — A PowerShell watcher that periodically snapshots to a dedicated Git branch without disturbing your working tree

## Installation

### For Cursor (as an Agent Skill)

Copy the `cursor-guard/` folder into your Cursor skills directory:

```
~/.cursor/skills/cursor-guard/
```

Or per-project:

```
<project-root>/.cursor/skills/cursor-guard/
```

The skill activates automatically when the AI agent detects risky operations (file edits, deletes, renames) or when you mention recovery-related terms.

### Project Configuration (Optional)

Copy the example config to your workspace root and customize:

```bash
cp .cursor/skills/cursor-guard/references/cursor-guard.example.json .cursor-guard.json
```

Edit `.cursor-guard.json` to define which files to protect:

```json
{
  "protect": ["src/**", "lib/**", "package.json"],
  "ignore": ["node_modules/**", "dist/**"],
  "auto_backup_interval_seconds": 60,
  "secrets_patterns": [".env", ".env.*", "*.key", "*.pem"],
  "retention": { "mode": "days", "days": 30 }
}
```

## Auto-Backup Script

Run in a separate terminal while working in Cursor:

```powershell
.\auto-backup.ps1 -Path "D:\MyProject"

# Custom interval (default 60s):
.\auto-backup.ps1 -Path "D:\MyProject" -IntervalSeconds 30
```

The script uses Git plumbing commands to snapshot to `cursor-guard/auto-backup` branch — it never switches branches or touches your working index.

## Recovery

If something goes wrong, recovery follows this priority:

1. **Git** — `git restore`, `git reset`, `git reflog`
2. **Shadow copies** — `.cursor-guard-backup/<timestamp>/`
3. **Conversation context** — Original file content captured by agent Read calls
4. **Editor history** — VS Code/Cursor Timeline (auxiliary)

See [references/recovery.md](references/recovery.md) for detailed commands.

## Trigger Keywords

The skill activates on these signals:

- File edits, deletes, renames by the AI agent
- Recovery requests: "回滚", "误删", "丢版本", "rollback", "undo", "recover"
- History issues: checkpoints missing, Timeline not working, save failures

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main skill instructions for the AI agent |
| `references/auto-backup.ps1` | PowerShell auto-backup watcher script |
| `references/recovery.md` | Recovery command templates |
| `references/cursor-guard.example.json` | Example project configuration |
| `references/cursor-guard.schema.json` | JSON Schema for config validation |

## Requirements

- **Git** (for primary backup strategy)
- **PowerShell 5.1+** (for auto-backup script; Windows built-in)
- **Cursor IDE** with Agent mode enabled

## License

MIT
