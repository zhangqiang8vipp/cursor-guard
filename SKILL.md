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
- **Time/version recovery**: e.g. "恢复到5分钟前", "恢复到前3个版本", "回到上一个版本", "restore to 10 minutes ago", "go back 2 versions", "恢复到下午3点的状态".

If none of the above, do not expand scope; answer normally.

---

## 0. Load Project Config (If Exists)

On first trigger in a session, check if the workspace root contains `.cursor-guard.json`. If found, **read it** and apply throughout:

```jsonc
{
  "protect": ["src/**", "lib/**", "package.json"],
  "ignore": ["node_modules/**", "dist/**", "*.log"],

  // "git": auto-backup to a dedicated branch (default)
  // "shadow": file copies to .cursor-guard-backup/<timestamp>/
  // "both": git branch snapshot + shadow copies
  "backup_strategy": "git",
  "auto_backup_interval_seconds": 60,

  // Sensitive file patterns — auto-excluded from backup even if in protect scope.
  // Built-in defaults: .env, .env.*, *.key, *.pem, *.p12, *.pfx, credentials*
  "secrets_patterns": [".env", ".env.*", "*.key", "*.pem"],

  // Controls behavior before restore operations.
  // "always" (default): automatically preserve current version before every restore.
  // "ask": prompt the user each time to decide.
  // "never": skip preservation entirely (not recommended).
  "pre_restore_backup": "always",

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

Use a **temporary index and dedicated ref** so the user's staged/unstaged state is never touched:

```bash
# 1. Create temp index from HEAD
GIT_INDEX_FILE=.git/guard-snapshot-index git read-tree HEAD

# 2. Stage working-tree files into temp index
GIT_INDEX_FILE=.git/guard-snapshot-index git add -A

# 3. Write tree and create commit on a guard ref (not on the user's branch)
TREE=$(GIT_INDEX_FILE=.git/guard-snapshot-index git write-tree)
COMMIT=$(git commit-tree $TREE -p HEAD -m "guard: snapshot before ai edit")
git update-ref refs/guard/snapshot $COMMIT

# 4. Cleanup
rm .git/guard-snapshot-index
```

**PowerShell equivalent** (for agent Shell calls):

```powershell
$guardIdx = Join-Path (git rev-parse --git-dir) "guard-snapshot-index"
$env:GIT_INDEX_FILE = $guardIdx
git read-tree HEAD
git add -A
$tree = git write-tree
$env:GIT_INDEX_FILE = $null
Remove-Item $guardIdx -Force -ErrorAction SilentlyContinue
$commit = git commit-tree $tree -p HEAD -m "guard: snapshot before ai edit"
git update-ref refs/guard/snapshot $commit
```

- Run this via Shell tool BEFORE the first Write / StrReplace / Delete call.
- The user's index (staged files) and current branch are **never modified**.
- If `.cursor-guard.json` exists with `protect` patterns, scope `git add` to those paths instead of `-A`.
- Record the commit hash (short) and report it to the user.
- To restore: `git restore --source=refs/guard/snapshot -- <file>`.
- Before writing the tree, check staged files against `secrets_patterns` (§0). Exclude any matches and warn the user.

**Simplified fallback**: If the plumbing approach fails (e.g. `commit-tree` not available), the agent MAY fall back to `git stash push -m "guard: snapshot" --keep-index` + `git stash pop` to shelter and restore the user's state. Report which method was used in the status block.

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

There are two distinct backup mechanisms. Do not confuse them:

| | **Git branch snapshot** | **Shadow copy** |
|---|---|---|
| **What** | Commits to `cursor-guard/auto-backup` branch via plumbing | File copies to `.cursor-guard-backup/<timestamp>/` |
| **Who creates** | `auto-backup.ps1` (when `backup_strategy` = `git` or `both`) | `auto-backup.ps1` (when `backup_strategy` = `shadow` or `both`); or the agent manually (§2b) |
| **Who cleans up** | Manual: `git branch -D cursor-guard/auto-backup` | `auto-backup.ps1` per `retention` config; or manual |
| **Restore** | `git restore --source=cursor-guard/auto-backup -- <file>` | `Copy-Item ".cursor-guard-backup/<ts>/<file>" "<path>"` |
| **Requires Git** | Yes | No (fallback for non-git repos) |

**Priority order for the agent:**

1. **Guard ref snapshot** (`refs/guard/snapshot`) — agent creates before each high-risk edit using temp index (§2a). Does not pollute user's branch or staging area.
2. **Git branch auto-backup** (`cursor-guard/auto-backup`) — periodic snapshots by `auto-backup.ps1`.
3. **Shadow copy** (`.cursor-guard-backup/`) — fallback for non-git repos, or as extra insurance when `backup_strategy = "both"`.
4. **Editor habits** — Ctrl+S frequently; optional extensions are user-configured, mention only if asked.

**Hard default:** Do NOT `git push` unless the user explicitly asks. Scope = **local only**.

**Retention:** The `retention` config in `.cursor-guard.json` controls cleanup of **shadow copy directories** only. Git branch snapshots are not subject to retention; clean them manually (see [references/recovery.md](references/recovery.md)).

---

## 5. Recovery Strategy (Priority Order)

1. **Git**: `git status` → `git diff` → `git restore` → `git reset` → `git reflog` — see [references/recovery.md](references/recovery.md).
2. **Shadow copies**: Check `.cursor-guard-backup/` for timestamped copies.
3. **Conversation context**: If the agent Read the file before overwriting, the original content is in this chat — offer to re-write it back.
4. **Editor Local History / Timeline**: auxiliary, per-file; unreliable for tool-only disk writes.
5. **Cursor Checkpoints**: auxiliary; tied to Agent UI; not a long-term backup.

---

## 5a. Time-Based & Version-Based Recovery

When the user requests recovery using time or version references, follow this workflow:

### Trigger Phrases (Chinese & English)

| Pattern | Type | Example |
|---------|------|---------|
| "恢复到 N 分钟/小时前", "N minutes/hours ago" | Time-based | "恢复到5分钟前", "restore to 10 minutes ago" |
| "恢复到前 N 个版本", "go back N versions" | Version-based | "恢复到前3个版本", "go back 2 versions" |
| "恢复到上一个版本", "previous version" | Version-based (N=1) | "回到上一个版本", "undo last change" |
| "恢复到今天下午3点", "restore to 3pm" | Time-based (absolute) | "恢复到下午3点的状态" |
| "恢复到昨天的版本", "yesterday's version" | Time-based | "恢复到昨天" |

### Step 1: Parse the Request

Extract two things from the user's request:
- **Target scope**: specific file(s) or entire project?
- **Reference point**: a time expression or a version count?

If unclear, ask: "你想恢复哪个文件？还是整个项目？" / "Which file(s) do you want to restore?"

### Step 2: Find Matching Commits

**For time-based requests**, the goal is to find the **latest commit AT or BEFORE the target time** — not commits after it.

```bash
# "恢复到5分钟前" → find the most recent commit BEFORE that point
git log --oneline --before="5 minutes ago" -5 -- <file>

# Auto-backup branch (if exists)
git log cursor-guard/auto-backup --oneline --before="5 minutes ago" -5 -- <file>

# Reflog as fallback (shows all HEAD movements)
git reflog --before="5 minutes ago" -5
```

Time expression mapping (always use `--before` to find the state AT that point):
- "5分钟前" / "5 minutes ago" → `--before="5 minutes ago"`
- "1小时前" / "1 hour ago" → `--before="1 hour ago"`
- "今天下午3点" → `--before="today 15:00"`
- "昨天" / "yesterday" → `--before="yesterday 23:59"`

**Key rule**: the first result from `--before` is the closest commit at or before the target time — that is the correct restore point.

**For version-based requests**, use commit offset:

```bash
# N versions ago on current branch
git log --oneline -<N+5> -- <file>

# Or use HEAD~N directly
git show HEAD~<N>:<file>

# Auto-backup branch
git log cursor-guard/auto-backup --oneline -<N+5> -- <file>
```

### Step 3: Present Candidates to User

**Selection rule**: prefer the **latest commit AT or BEFORE the target time**. This is always candidate #1 in the `--before` results. Only if no commit exists before the target time, inform the user and offer the closest commit after it as an approximation.

Show a numbered list of matching commits with timestamps:

```
Found these snapshots / 找到以下快照:

→ 1. [abc1234] 2026-03-21 16:05:32 — guard: snapshot before ai edit  ← closest before target
  2. [def5678] 2026-03-21 16:02:15 — guard: auto-backup 2026-03-21 16:02:15
  3. [ghi9012] 2026-03-21 15:58:40 — feat: add login page

Recommended: #1 (closest to target time). Restore this one? / 推荐 #1（最接近目标时间）。恢复这个？
```

**Rules**:
- If only ONE candidate is found, confirm with the user before restoring.
- If MULTIPLE candidates, pre-select #1 (closest before target) but let the user pick another.
- If NO candidates before the target time:
  - Check auto-backup branch: `git rev-parse --verify cursor-guard/auto-backup`
  - Check shadow copies: `Get-ChildItem .cursor-guard-backup/ -Directory | Sort-Object Name -Descending`
  - If still nothing, report clearly: "No snapshot found before that time. The earliest available is [hash] at [time]. Do you want to use it?"
- **Never silently pick a version.** Always show and confirm.

### Step 4: Preserve Current Version Before Restore

> **Rule: `restore_requires_preserve_current_by_default`**
>
> The behavior is controlled by `pre_restore_backup` in `.cursor-guard.json` (default: `"always"`).

**4a. Determine preservation mode**

Read `pre_restore_backup` from config (§0). Three modes:

| Config value | Behavior |
|-------------|----------|
| `"always"` (default) | Automatically preserve current version. No prompt. Jump to 4b. |
| `"ask"` | Prompt the user: "恢复前是否保留当前版本？(Y/n)" / "Preserve current version before restore? (Y/n)". If user answers yes/default → jump to 4b. If user answers no → inform and jump to Step 5. |
| `"never"` | Skip preservation entirely. Inform: "配置已设为不保留当前版本 (pre_restore_backup=never)，直接恢复。" and jump to Step 5. |

**Override rules** (apply regardless of config):
- If the user **explicitly** says "不保留当前版本" / "skip backup before restore" in the current message → skip, even if config is `"always"`.
- If the user **explicitly** says "先保留当前版本" / "preserve current first" → preserve, even if config is `"never"`.
- User's explicit instruction in the current message always takes priority over config.

**4b. Determine preservation scope**

| Restore scope | What to preserve |
|---------------|-----------------|
| Single file | Only that file's current state |
| Multiple files | All files that will be overwritten |
| Entire project | Full project snapshot |

**4c. Check if there are changes to preserve**

```bash
# For single file: check if file differs from the restore target
git diff <target-commit> -- <file>

# For project: check overall status
git status --porcelain
```

If the file/project is **identical** to the restore target (no diff), inform:
"当前版本与目标版本相同，无需保留，跳过备份。" / "Current version is identical to target, no backup needed."
Then jump to Step 5.

If the working tree is clean AND HEAD matches the restore target, inform:
"当前无可保留变更，直接恢复。" / "No changes to preserve, proceeding with restore."
Then jump to Step 5.

**4d. Create preservation snapshot**

Use the same temp-index plumbing as §2a to avoid polluting the user's staging area:

**Git repo (preferred):**

```powershell
$guardIdx = Join-Path (git rev-parse --git-dir) "guard-pre-restore-index"
$env:GIT_INDEX_FILE = $guardIdx

# For single file: read HEAD tree then update just the target file
git read-tree HEAD
git add -- <file>

# For project: snapshot everything
git read-tree HEAD
git add -A

$tree = git write-tree
$env:GIT_INDEX_FILE = $null
Remove-Item $guardIdx -Force -ErrorAction SilentlyContinue

$commit = git commit-tree $tree -p HEAD -m "guard: preserve current before restore to <target>"
git update-ref refs/guard/pre-restore $commit
```

Record the short hash and the ref `refs/guard/pre-restore`.

**Non-Git fallback (shadow copy):**

```powershell
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$dir = ".cursor-guard-backup/pre-restore-$ts"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item "<file>" "$dir/<file>"
```

**4e. Handle preservation failure**

If the snapshot fails (e.g. disk full, permission error):
1. **Do NOT proceed with restore.** Default is to abort.
2. Inform the user: "当前版本保留失败。默认不继续恢复；如果你确认不保留当前状态也要继续，请明确说明。" / "Failed to preserve current version. Restore aborted by default. If you want to continue without backup, please confirm explicitly."
3. Only proceed if the user explicitly confirms: "即使不保留也继续" / "continue without backup".

**4f. Inform user of preservation result**

Before executing restore, tell the user:
```
在恢复前，我已保留当前版本：
- 备份引用: refs/guard/pre-restore (abc1234)
- 恢复方式: git restore --source=refs/guard/pre-restore -- <file>

Current version preserved before restore:
- Backup ref: refs/guard/pre-restore (abc1234)
- To undo: git restore --source=refs/guard/pre-restore -- <file>
```

### Step 5: Execute Recovery

**Single file recovery:**

```bash
git restore --source=<commit-hash> -- <path/to/file>
```

**Entire project recovery** (destructive — require explicit confirmation):

```bash
# Show what will change first
git diff <commit-hash> -- .

# After user confirms:
git restore --source=<commit-hash> -- .
```

**From shadow copy:**

```powershell
# Find the closest timestamp directory
Get-ChildItem .cursor-guard-backup/ -Directory | Sort-Object Name -Descending

# Restore
Copy-Item ".cursor-guard-backup/<timestamp>/<file>" "<original-path>"
```

### Step 6: Verify & Report

After restoring, always:
1. Show the restored file content (or diff) so the user can verify
2. Report the recovery in the status block (§6a), including **both** the pre-restore backup ref and the restore target
3. Tell the user how to undo the restore if needed

**Status block for restore operations:**

```markdown
**Cursor Guard — restore status**
- **Pre-restore backup**: `refs/guard/pre-restore` (`<short-hash>`) or `shadow copy at .cursor-guard-backup/pre-restore-<ts>/` or `skipped (user opted out)` or `skipped (no changes)`
- **Restored to**: `<target-hash>` / `<target description>`
- **Scope**: single file `<path>` / N files / entire project
- **Result**: success / failed
- **To undo restore**: `git restore --source=refs/guard/pre-restore -- <file>`
```

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
3. **MUST preserve current version before restore** — every restore operation must first snapshot the current state (§5a Step 4). Skip ONLY when: (a) user explicitly opts out, (b) current state is identical to target, or (c) no changes exist. If preservation fails, abort restore by default.
4. **Do not** treat Timeline/Checkpoints as the only or primary recovery path.
5. **Do not** recommend Checkpoints as long-term or sole backup.
6. **No automatic push** to remotes; local commits only unless user requests push.
7. **Be honest** about limits: terminal side effects, binary files, and non-tracked paths are not fully reversible without prior commits.
8. **Do not** run `git clean`, `reset --hard`, or other destructive Git commands unless the user clearly asked; always show what would be affected first.
9. **Do not** delete files via the Delete tool without explicit per-file confirmation from the user.
10. **Do not** modify or delete `.cursor-guard.json` unless the user explicitly asks — accidental config changes silently alter protection scope.
11. **Use `--no-verify`** on all guard snapshot commits to bypass pre-commit hooks that could fail or modify files.
12. **Concurrent agents**: if multiple Agent threads are active, warn the user to avoid simultaneous writes to the same file. Snapshots cannot prevent race conditions between parallel agents.
13. **Preservation must not pollute** — all pre-restore backups use temp index + dedicated ref (`refs/guard/pre-restore`). The user's staging area, working tree, and commit history on their branch are never modified by the preservation process.

---

## Optional: Project Conventions

- If the workspace has `.cursor-guard.json`, the agent MUST read and follow it (see §0).
- If `.cursor-guard-backup/` folder exists, align shadow copy paths with it.
- Template config: [references/cursor-guard.example.json](references/cursor-guard.example.json) — copy to workspace root and customize. Field docs: [references/config-reference.md](references/config-reference.md).

---

## Further Reading

- Recovery commands: [references/recovery.md](references/recovery.md)
- Auto-backup script: [references/auto-backup.ps1](references/auto-backup.ps1)
- Config JSON Schema: [references/cursor-guard.schema.json](references/cursor-guard.schema.json)
- Example config: [references/cursor-guard.example.json](references/cursor-guard.example.json)
- Config field reference (EN/中文): [references/config-reference.md](references/config-reference.md)
