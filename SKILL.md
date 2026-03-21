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
- **Health check**: e.g. "guard doctor", "检查备份配置", "自检", "诊断guard", "check guard setup", "MCP 能用吗". If MCP `doctor` tool is available, call `doctor { "path": "<project>" }` and format the result; otherwise run `guard-doctor.ps1` and report results. Doctor output includes an "MCP server" check (SDK installed + server.js present). If doctor reports FAIL items, suggest running `doctor_fix` (MCP) or guide the user through manual fixes.
- **Auto-fix**: e.g. "guard fix", "修复配置", "自动修复". If MCP `doctor_fix` tool is available, call `doctor_fix { "path": "<project>", "dry_run": true }` first to preview, then `doctor_fix { "path": "<project>" }` to apply. Without MCP, guide the user through manual steps based on doctor output.
- **Backup status**: e.g. "备份状态", "guard status", "watcher 在跑吗", "最近一次备份". If MCP `backup_status` tool is available, call `backup_status { "path": "<project>" }` and format the structured result for the user (watcher running/stale, last backup time, strategy, ref counts, disk). Without MCP, check lock file existence and `git log` manually.
- **Health dashboard**: e.g. "看板", "dashboard", "健康状态", "备份总览", "guard 概况". If MCP `dashboard` tool is available, call `dashboard { "path": "<project>" }` and present the structured dashboard (strategy, last backup, counts, disk usage, protection scope, health status, alerts). Format as a clear summary for the user.
- **Alert check**: e.g. "有告警吗", "alert status", "变更异常", "风险提示". If MCP `alert_status` tool is available, call `alert_status { "path": "<project>" }` to check for active change-velocity alerts. Report whether an alert is active and its details.

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
  "retention": { "mode": "days", "days": 30, "max_count": 100, "max_size_mb": 500 },

  // Retention for Git auto-backup branch. Disabled by default.
  // "count": keep N newest commits. "days": keep commits from last N days.
  "git_retention": { "enabled": false, "mode": "count", "max_count": 200 },

  // V4: Proactive change-velocity detection (default: on).
  // When enabled, the watcher monitors file change frequency and raises
  // alerts when abnormal patterns are detected (e.g. 20+ files in 10s).
  "proactive_alert": true,
  "alert_thresholds": {
    "files_per_window": 20,  // trigger threshold
    "window_seconds": 10,    // sliding window
    "cooldown_seconds": 60   // min gap between alerts
  }
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

### 0a. Execution Path: MCP vs Shell

cursor-guard provides an **MCP server** (`cursor-guard-mcp`) as an optional enhancement. When available, prefer MCP tool calls over shell commands — they are faster, return structured JSON, and consume fewer tokens.

**Detection**: at the start of a session, check if the following MCP tools are available in your tool list: `doctor`, `list_backups`, `snapshot_now`, `restore_file`, `restore_project`, `dashboard`, `alert_status`. If **any** of them exists, use MCP for that operation; otherwise, fall back to shell commands as described in the sections below.

**Routing table** (MCP tool → replaces which shell workflow):

| Operation | MCP tool | Shell fallback section |
|-----------|----------|----------------------|
| Health check / diagnostics | `doctor` | guard-doctor.ps1 / .sh |
| Auto-fix common issues | `doctor_fix` | manual steps per doctor output |
| Backup system status | `backup_status` | manual: check lock file + git log + shadow dir |
| Pre-write snapshot | `snapshot_now` | §2a plumbing commands |
| List restore points | `list_backups` | §5a Step 2 git log |
| Restore single file | `restore_file` | §5a Step 5 git restore |
| Preview project restore | `restore_project` (preview=true) | §5a Step 5 git diff |
| Execute project restore | `restore_project` (preview=false) | §5a Step 5 git restore -- . |
| Backup health dashboard | `dashboard` | manual: combine backup_status + git/shadow stats |
| Change-velocity alerts | `alert_status` | manual: check alert file in .git/ or .cursor-guard-backup/ |

**Rules**:
- MCP results are JSON — parse `status`, `error`, and data fields; do not re-run shell to verify.
- If an MCP call returns an `error` field, report it to the user and fall back to the shell path for that operation.
- All Hard Rules (§Hard Rules) still apply regardless of execution path. MCP tools enforce them internally (e.g. `restore_file` creates a pre-restore snapshot by default).
- If MCP is not configured, the skill works exactly as before — **no degradation**.
- `doctor_fix` is safe to call — each fix is idempotent. Use `dry_run: true` to preview changes before applying. Typical fixes: create missing config, init git repo, gitignore backup dir, remove stale lock file.
- `restore_project` with `preview: false` executes a full restore including pre-restore snapshot. Always call with `preview: true` first, show the result to the user, and only execute after explicit confirmation.

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

> **MCP shortcut**: if `snapshot_now` tool is available, call it with `{ "path": "<project>", "strategy": "git" }` instead of the shell commands below. The tool handles temp index, secrets exclusion, and ref creation internally, and returns `{ "git": { "status": "created", "commitHash": "...", "shortHash": "..." } }`. Report the `shortHash` to the user and proceed.

Use a **temporary index and dedicated ref** so the user's staged/unstaged state is never touched:

```bash
GIT_DIR=$(git rev-parse --git-dir)
GUARD_IDX="$GIT_DIR/guard-snapshot-index"

# 1. Create temp index from HEAD
GIT_INDEX_FILE="$GUARD_IDX" git read-tree HEAD

# 2. Stage working-tree files into temp index
GIT_INDEX_FILE="$GUARD_IDX" git add -A

# 3. Write tree and create commit on a guard ref (not on the user's branch)
TREE=$(GIT_INDEX_FILE="$GUARD_IDX" git write-tree)
COMMIT=$(git commit-tree "$TREE" -p HEAD -m "guard: snapshot before ai edit")
git update-ref refs/guard/snapshot "$COMMIT"

# 4. Cleanup
rm -f "$GUARD_IDX"
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
| **What** | Commits to `refs/guard/auto-backup` via plumbing | File copies to `.cursor-guard-backup/<timestamp>/` |
| **Who creates** | Auto-backup script (when `backup_strategy` = `git` or `both`) | Auto-backup script (when `backup_strategy` = `shadow` or `both`); or the agent manually (§2b) |
| **Who cleans up** | `git_retention` config (auto, opt-in); or manual `git branch -D` | `retention` config (auto); or manual |
| **Restore** | `git restore --source=guard/auto-backup -- <file>` | Copy file from `.cursor-guard-backup/<ts>/<file>` to original path |
| **Requires Git** | Yes | No (fallback for non-git repos) |

**Priority order for the agent:**

1. **Guard ref snapshot** (`refs/guard/snapshot`) — agent creates before each high-risk edit using temp index (§2a). Does not pollute user's branch or staging area.
2. **Git auto-backup ref** (`refs/guard/auto-backup`) — periodic snapshots by auto-backup script. Lives outside `refs/heads/` so `git push --all` won't push it.
3. **Shadow copy** (`.cursor-guard-backup/`) — fallback for non-git repos, or as extra insurance when `backup_strategy = "both"`.
4. **Editor habits** — Ctrl+S frequently; optional extensions are user-configured, mention only if asked.

**Hard default:** Do NOT `git push` unless the user explicitly asks. Scope = **local only**.

**Retention:**
- **Shadow copies**: controlled by `retention` in `.cursor-guard.json` (mode: days/count/size).
- **Git branch**: controlled by `git_retention` in `.cursor-guard.json` (disabled by default; enable with `"enabled": true`, mode: count/days). Safely rebuilds the backup branch as an orphan chain containing only kept snapshots — never touches user history. Run `git gc` to reclaim disk space.
- See [references/config-reference.md](references/config-reference.md) for full field docs.

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

> **MCP shortcut**: if `list_backups` tool is available, call it with `{ "path": "<project>", "file": "<file>", "before": "<time expr>", "limit": 10 }`. The tool searches all sources (git refs + shadow copies) in one call and returns a unified list sorted by time. Skip to Step 3 with the results.

**For time-based requests**, the goal is to find the **latest commit AT or BEFORE the target time** — not commits after it.

```bash
# "恢复到5分钟前" → find the most recent commit BEFORE that point
git log --oneline --before="5 minutes ago" -5 -- <file>

# Auto-backup branch (if exists)
git log guard/auto-backup --oneline --before="5 minutes ago" -5 -- <file>

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
git log guard/auto-backup --oneline -<N+5> -- <file>
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
  - Check auto-backup ref: `git rev-parse --verify refs/guard/auto-backup`
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

**Git repo (preferred) — timestamped ref stack:**

Each pre-restore snapshot writes to a unique ref `refs/guard/pre-restore/<yyyyMMdd_HHmmss>` so consecutive restores never overwrite each other:

```powershell
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
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
git update-ref "refs/guard/pre-restore/$ts" $commit
```

Record the short hash and the ref path. Also update `refs/guard/pre-restore` as an alias pointing to the latest:

```powershell
git update-ref refs/guard/pre-restore $commit
```

To list all pre-restore snapshots: `git for-each-ref refs/guard/pre-restore/ --sort=-creatordate --format="%(refname:short) %(creatordate:short) %(objectname:short)"`

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
- 备份引用: refs/guard/pre-restore/20260321_163005 (abc1234)
- 恢复方式: git restore --source=refs/guard/pre-restore/20260321_163005 -- <file>
- 历史栈: git for-each-ref refs/guard/pre-restore/ --sort=-creatordate

Current version preserved before restore:
- Backup ref: refs/guard/pre-restore/20260321_163005 (abc1234)
- To undo: git restore --source=refs/guard/pre-restore/20260321_163005 -- <file>
- History: git for-each-ref refs/guard/pre-restore/ --sort=-creatordate
```

### Step 5: Execute Recovery

> **MCP shortcut**: if `restore_file` / `restore_project` tools are available:
> - Single file: `restore_file { "path": "<project>", "file": "<file>", "source": "<hash-or-timestamp>", "preserve_current": true }` — handles pre-restore snapshot + restore + verification in one call.
> - Project preview: `restore_project { "path": "<project>", "source": "<hash>", "preview": true }` — returns the list of files that would change.
> - Project execute: after user confirms, `restore_project { "path": "<project>", "source": "<hash>", "preview": false, "preserve_current": true }` — creates pre-restore snapshot, then restores all files in one call. Returns `{ filesRestored, preRestoreRef, files }`.
> - MCP `restore_file` and `restore_project` respect `pre_restore_backup` config (§Step 4) automatically. The response includes `preRestoreRef` if a snapshot was created.

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
- **Pre-restore backup**: `refs/guard/pre-restore/<ts>` (`<short-hash>`) or `shadow copy at .cursor-guard-backup/pre-restore-<ts>/` or `skipped (user opted out)` or `skipped (no changes)`
- **Restored to**: `<target-hash>` / `<target description>`
- **Scope**: single file `<path>` / N files / entire project
- **Result**: success / failed
- **To undo restore**: `git restore --source=refs/guard/pre-restore/<ts> -- <file>`
- **All pre-restore snapshots**: `git for-each-ref refs/guard/pre-restore/ --sort=-creatordate`
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
- Auto-backup (Node.js core): [references/lib/auto-backup.js](references/lib/auto-backup.js)
- Guard doctor (Node.js core): [references/lib/guard-doctor.js](references/lib/guard-doctor.js)
- Core modules: [references/lib/core/](references/lib/core/) (doctor, doctor-fix, snapshot, backups, restore, status, anomaly, dashboard)
- MCP server: [references/mcp/server.js](references/mcp/server.js) (9 tools: doctor, doctor_fix, backup_status, list_backups, snapshot_now, restore_file, restore_project, dashboard, alert_status)
- Shared utilities: [references/lib/utils.js](references/lib/utils.js)
- Config JSON Schema: [references/cursor-guard.schema.json](references/cursor-guard.schema.json)
- Example config: [references/cursor-guard.example.json](references/cursor-guard.example.json)
- Config field reference (EN): [references/config-reference.md](references/config-reference.md)
- 配置参数说明（中文）: [references/config-reference.zh-CN.md](references/config-reference.zh-CN.md)
- Version roadmap: [ROADMAP.md](ROADMAP.md)

### Running scripts

Cross-platform (requires Node.js >= 18):

```bash
# Via npx (if installed from npm)
npx cursor-guard-backup --path /my/project --interval 60
npx cursor-guard-doctor --path /my/project

# Via thin wrapper (from skill directory)
# Windows PowerShell:
.\references\auto-backup.ps1 -Path "D:\MyProject"
.\references\guard-doctor.ps1 -Path "D:\MyProject"

# macOS / Linux:
./references/auto-backup.sh /my/project
./references/guard-doctor.sh /my/project
```

### MCP Server (optional enhancement)

If your Cursor config supports MCP, add `cursor-guard` as an MCP server for lower token cost and structured tool calls:

```jsonc
// .cursor/mcp.json (or global Cursor MCP settings)
{
  "mcpServers": {
    "cursor-guard": {
      "command": "node",
      "args": ["<path-to-skill>/references/mcp/server.js"]
    }
  }
}
```

Once configured, the 9 tools (`doctor`, `doctor_fix`, `backup_status`, `list_backups`, `snapshot_now`, `restore_file`, `restore_project`, `dashboard`, `alert_status`) are available as MCP tool calls. See §0a for routing logic.
