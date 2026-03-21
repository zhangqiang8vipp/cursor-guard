---
name: cursor-guard
description: >-
  Protects code from accidental AI overwrite or deletion in Cursor: mandatory
  pre-write snapshots, review-before-apply, local Git safety net, and
  deterministic recovery. Trigger on code loss, rollback, checkpoints,
  Timeline/local history, tool vs editor saves, multi-root workspaces, or safe
  AI editing workflows (including Chinese phrases like 回滚, 误删, 丢版本).
---

# Cursor Guard — Strong Protection Mode

## When This Skill Applies (Triggers)

Use this skill when any of the following appear:

- **Auto disk writes**: Agent/tools edit files without the user reviewing a diff first.
- **Deletes or renames**: Bulk delete, `rm`, refactor that removes paths.
- **History confusion**: Checkpoints missing, Timeline/local history not rolling back, "save failed" after external writes.
- **Parallel context**: Multiple repos or branches; unclear which folder is the workspace root.
- **Recovery asks**: e.g. "改不回来", "丢版本", "回滚", "reflog", "误删", or English equivalents.

If none of the above, do not expand scope; answer normally.

---

## 0. Load Project Config (If Exists)

On first trigger in a session, check if the workspace root contains `.cursor-guard.json`. If found, **read it** and apply throughout:

```jsonc
{
  "protect": ["src/**", "lib/**", "package.json"],
  "ignore": ["node_modules/**", "dist/**", "*.log"],

  "backup_strategy": "git",
  "auto_backup_interval_seconds": 60,

  // Sensitive file patterns — auto-excluded from backup even if in protect scope.
  // Built-in defaults: .env, .env.*, *.key, *.pem, *.p12, *.pfx, credentials*
  "secrets_patterns": [".env", ".env.*", "*.key", "*.pem"],

  // Retention for shadow copies. mode: "days" | "count" | "size"
  "retention": { "mode": "days", "days": 30, "max_count": 100, "max_size_mb": 500 }
}
```

**Resolution rules:**
- `protect` set + `ignore` set → file must match a `protect` pattern AND not match any `ignore` pattern.
- Only `protect` set → only matching files are protected.
- Only `ignore` set → everything is protected except matching files.
- Neither set → protect everything (same as before).

**`secrets_patterns`**: Glob patterns for sensitive files (`.env`, keys, certificates). Matching files are **auto-excluded** from backup commits, even within `protect` scope. Built-in defaults: `.env`, `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `credentials*`. Set this field to override.

**`retention`**: Controls automatic cleanup of old shadow-copy snapshots in `.cursor-guard-backup/`:
- `"days"` (default): keep snapshots from the last N days (default **30**).
- `"count"`: keep the N most recent snapshots (default 100).
- `"size"`: keep total shadow-copy folder under N MB (default 500).

**If no config file exists**, the agent operates in "protect everything" mode (backward compatible). Mention to the user that they can create `.cursor-guard.json` to narrow scope — see [references/cursor-guard.example.json](references/cursor-guard.example.json).

When the target file of an edit **falls outside the protected scope**, the agent:
- Still applies "Read before Write" (Hard Rule §2).
- Skips the mandatory git snapshot / shadow copy step.
- Notes `outside protection scope` in the status block.

---

## 1. Assess Risk (First)

| Signal | Risk |
|--------|------|
| Multi-file edits, `delete_file`, terminal `rm`, or **Write** to existing file | **High** |
| Single small edit (`StrReplace` with narrow scope), user explicitly asked | **Medium** |
| Read-only explanation, no writes | **Low** |

---

## 2. Mandatory Pre-Write Backup Protocol (ENFORCED)

> **This is not optional.** The agent MUST execute these steps before making
> destructive or high-risk changes. Skipping is only allowed when the user
> explicitly says "不用备份" / "skip backup".

### 2a. If workspace IS a Git repo

**Before any High-risk operation on a protected file:**

```
git add -A && git commit -m "guard: snapshot before ai edit" --no-verify
```

- Run this via Shell tool BEFORE the first Write / StrReplace / Delete call.
- If `.cursor-guard.json` exists with `protect` patterns, the agent may scope the commit: `git add <protected-paths>` instead of `-A` to keep the snapshot focused.
- If `git status` shows nothing to commit, that's fine — the existing HEAD is the rollback point.
- Record the commit hash (short) and report it to the user.
- Before committing, check staged files against `secrets_patterns` (§0). Exclude any matches and warn the user.

**Before any Medium-risk operation:**

- At minimum, run `git diff -- <target_file>` and `git status` so the user sees current state.
- Recommend a snapshot commit; proceed without it only if the user confirms.

### 2b. If workspace is NOT a Git repo

**Before any High-risk operation, offer TWO options (pick one):**

1. **Quick git init** (preferred):
   ```
   git init && git add -A && git commit -m "guard: initial snapshot" --no-verify
   ```
2. **Shadow copy** (fallback if user declines git):
   - Copy the target file(s) to `.cursor-guard-backup/<timestamp>/` via Shell.
   - Example:
     ```powershell
     $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
     New-Item -ItemType Directory -Force ".cursor-guard-backup/$ts"
     Copy-Item "src/app.py" ".cursor-guard-backup/$ts/app.py"
     ```
   - Add `.cursor-guard-backup/` to `.gitignore` if git is later initialized.

**If user declines BOTH:** document refusal in the status block (§6), state the file cannot be recovered if lost, and proceed only with explicit "我了解风险，继续" confirmation.

### 2c. Multi-file batch operations

When editing 3+ files in one task:

1. Create the snapshot commit covering ALL files first.
2. Apply changes file-by-file; if any step fails, offer to `git restore` all files back to the snapshot.
3. After all edits succeed, offer a clean commit with a real message.

---

## 3. Protection Strategy During Edits

**Before applying AI changes:**

1. **Preview**: Show a clear **diff-style summary** (paths + intent). For substantial edits, prefer patch-sized chunks.
2. **Destructive ops**: For deletes or large rewrites, **confirm explicitly** (one short question). Do not assume "cleanup" permission.
3. **Workspace root**: State which directory is treated as project root; avoid touching paths outside it unless the user asked.
4. **Read before Write**: The agent MUST Read a file's current content before using Write to overwrite it. This ensures the full original content is captured in conversation context as a last-resort recovery source.
5. **Rename / Move**: Treat renames and moves as a delete + create. Snapshot the original path before proceeding; note both old and new paths in the status block so history can be traced.

**After tool writes (agent wrote to disk directly):**

- Tell the user: editor buffer may be stale → **`Revert File`** (Ctrl+Shift+P → "Revert File") or close & reopen tab.
- Do **not** claim Timeline/Checkpoints will capture tool writes.

---

## 4. Backup Strategy (Priority)

1. **Git local commits** — primary safety net. Short WIP commits before risky AI runs.
2. **Shadow copy** (`.cursor-guard-backup/`) — fallback for non-git or when user wants extra insurance.
3. **Auto-backup script** — see [references/auto-backup.ps1](references/auto-backup.ps1) for a PowerShell watcher that auto-commits on file change.
4. **Editor habits** — Ctrl+S frequently; optional extensions are user-configured, mention only if asked.

**Hard default:** Do NOT `git push` unless the user explicitly asks. Scope = **local only**.

**Retention:** Shadow copies are auto-cleaned by `auto-backup.ps1` per the `retention` config (default: keep 30 days). For manual cleanup of the backup branch, see [references/recovery.md](references/recovery.md).

---

## 5. Recovery Strategy (Priority Order)

1. **Git**: `git status` → `git diff` → `git restore` → `git reset` → `git reflog` — see [references/recovery.md](references/recovery.md).
2. **Shadow copies**: Check `.cursor-guard-backup/` for timestamped copies.
3. **Conversation context**: If the agent Read the file before overwriting, the original content is in this chat — offer to re-write it back.
4. **Editor Local History / Timeline**: auxiliary, per-file; unreliable for tool-only disk writes.
5. **Cursor Checkpoints**: auxiliary; tied to Agent UI; not a long-term backup.

---

## 6. Output to User (When This Skill Was Used)

When you followed this skill's workflow, end with a short **status block**:

```markdown
**Cursor Guard — status**
- **Risk**: low / medium / high
- **Snapshot**: `<short-hash>` or `shadow copy at .cursor-guard-backup/<ts>/` or `none (user declined)`
- **Done**: (e.g. snapshot committed / diff previewed / recovery completed)
- **Next step**: (one concrete command or one UI action)
- **Recovery ref**: `references/recovery.md` in this skill folder
```

Skip the block for unrelated turns.

---

## Hard Rules (Non-Negotiable)

1. **MUST snapshot before high-risk ops** — git commit or shadow copy. No exceptions unless user explicitly declines.
2. **MUST Read before Write** — never overwrite a file the agent hasn't read in the current turn.
3. **Do not** treat Timeline/Checkpoints as the only or primary recovery path.
4. **Do not** recommend Checkpoints as long-term or sole backup.
5. **No automatic push** to remotes; local commits only unless user requests push.
6. **Be honest** about limits: terminal side effects, binary files, and non-tracked paths are not fully reversible without prior commits.
7. **Do not** run `git clean`, `reset --hard`, or other destructive Git commands unless the user clearly asked; always show what would be affected first.
8. **Do not** delete files via the Delete tool without explicit per-file confirmation from the user.
9. **Do not** modify or delete `.cursor-guard.json` unless the user explicitly asks — accidental config changes silently alter protection scope.
10. **Use `--no-verify`** on all guard snapshot commits to bypass pre-commit hooks that could fail or modify files.
11. **Concurrent agents**: if multiple Agent threads are active, warn the user to avoid simultaneous writes to the same file. Snapshots cannot prevent race conditions between parallel agents.

---

## Optional: Project Conventions

- If the workspace has `.cursor-guard.json`, the agent MUST read and follow it (see §0).
- If `.cursor-guard-backup/` folder exists, align shadow copy paths with it.
- Template config: [references/cursor-guard.example.json](references/cursor-guard.example.json) — copy to workspace root and customize.

---

## Further Reading

- Recovery commands: [references/recovery.md](references/recovery.md)
- Auto-backup script: [references/auto-backup.ps1](references/auto-backup.ps1)
- Config JSON Schema: [references/cursor-guard.schema.json](references/cursor-guard.schema.json)
- Example config: [references/cursor-guard.example.json](references/cursor-guard.example.json)
