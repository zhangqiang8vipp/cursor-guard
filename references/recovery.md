# Recovery Command Templates

Replace `<path>` / `<file>` with real paths. Run from repository root. **Review output before destructive commands.**

---

## Inspect current state

```bash
git status
git diff
git log --oneline -10
```

## Recent commits (compact)

```bash
git log --oneline -20 --decorate
```

## Restore one file to last commit (discard working tree changes)

```bash
git restore --source=HEAD -- <path/to/file>
```

## Restore one file from a specific commit

```bash
git restore --source=<commit> -- <path/to/file>
```

> Avoid shell redirects (`git show <commit>:file > file`) on Windows — they can corrupt encoding. Prefer `git restore --source`.

## Undo uncommitted changes (entire repo) — **destructive**

**Always preview first / 务必先预览：**

```bash
# Step 1: Preview what will be reverted / 预览将要还原的内容
git diff

# Step 2: Preview what untracked files would be removed / 预览将被删除的未跟踪文件
git clean -fdn   # dry-run: shows what WOULD be deleted

# Step 3: Only after user confirms / 用户确认后再执行
git restore .
```

Only suggest `git clean -fd` if the user explicitly wants untracked removal; warn about data loss:

```bash
# DANGEROUS: removes untracked files — only after explicit confirmation
# 危险：删除未跟踪文件——仅在用户明确确认后执行
git clean -fd
```

## Recover "lost" commits / after reset

```bash
# Step 1: Find the lost commit / 找到丢失的提交
git reflog

# Step 2: Create a recovery branch (safe, non-destructive) / 创建恢复分支（安全）
git branch recover-branch <hash>

# Step 3 (alternative): Hard reset — DESTRUCTIVE, preview first
# 硬重置——破坏性操作，先预览
git diff HEAD <hash> --stat   # preview what changes
git reset --hard <hash>       # only after confirmation
```

## Restore deleted file from HEAD (if it was committed)

```bash
git restore --source=HEAD -- <path/to/deleted/file>
```

## Stash (quick shelter before experiments)

```bash
git stash push -m "wip before experiment"
git stash list
git stash pop
```

## Restore to N minutes/hours ago / 恢复到 N 分钟/小时前

The goal is to find the **latest commit AT or BEFORE** the target time.

目标是找到目标时间点**之前（含）最近的一次提交**。

```bash
# Find the most recent commit BEFORE N minutes ago
# 查找 N 分钟前之前最近的提交
git log --oneline --before="5 minutes ago" -5 -- <file>

# Find the most recent commit BEFORE N hours ago
# 查找 N 小时前之前最近的提交
git log --oneline --before="2 hours ago" -5 -- <file>

# Reflog as fallback (captures resets, amends, etc.)
# Reflog 作为兜底（能捕获 reset、amend 等操作）
git reflog --before="5 minutes ago" -5

# Restore file to the first (closest) commit found above
# 恢复到上面找到的第一个（最近的）提交
git restore --source=<commit-hash> -- <file>
```

## Restore to a specific time / 恢复到指定时间点

```bash
# Find the closest commit before a specific time
# 查找指定时间点之前最近的提交
git log --oneline --before="2026-03-21 15:00" -5 -- <file>
git log --oneline --before="today 15:00" -5 -- <file>

# Yesterday / 昨天
git log --oneline --after="yesterday 00:00" --before="yesterday 23:59" -- <file>

# Restore
git restore --source=<commit-hash> -- <file>
```

## Restore to N versions ago / 恢复到前 N 个版本

```bash
# Show recent N commits for a file
# 查看某文件最近 N 个提交
git log --oneline -10 -- <file>

# Restore to previous version (1 version ago)
# 恢复到上一个版本
git restore --source=HEAD~1 -- <file>

# Restore to 3 versions ago
# 恢复到前 3 个版本
git restore --source=HEAD~3 -- <file>

# Preview what the file looked like N versions ago (without restoring)
# 预览 N 个版本前的文件内容（不实际恢复）
git show HEAD~3:<file>

# Diff current vs N versions ago
# 对比当前和 N 个版本前的差异
git diff HEAD~3 -- <file>
```

> **Note / 注意**: `HEAD~N` counts commits on the current branch. If you want the Nth commit that *changed this specific file*, use:
>
> `HEAD~N` 是按分支提交计数。如果想找第 N 次**修改该文件**的提交，用：
>
> ```bash
> # Find the 3rd most recent commit that touched this file
> git log --oneline -3 -- <file>
> # Then use the hash from the output
> git restore --source=<hash> -- <file>
> ```

## Restore entire project to a point in time / 恢复整个项目到某个时间点

```bash
# CAUTION: This affects ALL files. Review carefully!
# 注意：这会影响所有文件，请仔细检查！

# Step 1: Find the target commit / 第一步：找到目标提交
git log --oneline --before="10 minutes ago" -5

# Step 2: Preview what will change / 第二步：预览变更
git diff <commit-hash> -- .

# Step 3: Restore (after confirmation) / 第三步：恢复（确认后）
git restore --source=<commit-hash> -- .
```

---

## Recover from auto-backup branch

The `auto-backup.ps1` script stores periodic snapshots on a dedicated branch via plumbing commands:

```bash
# List recent auto-backup snapshots
git log cursor-guard/auto-backup --oneline -20

# Restore a file from the latest auto-backup
git restore --source=cursor-guard/auto-backup -- <path/to/file>

# Restore from a specific auto-backup snapshot
git restore --source=<commit-hash> -- <path/to/file>

# Diff your working copy against the auto-backup version
git diff cursor-guard/auto-backup -- <path/to/file>

# Time-based: find auto-backup snapshot from before N minutes ago
# 按时间查找：N 分钟前之前最近的自动备份快照
git log cursor-guard/auto-backup --oneline --before="5 minutes ago" -5 -- <path/to/file>

# Version-based: list recent N auto-backup snapshots
# 按版本查找：最近 N 个自动备份快照
git log cursor-guard/auto-backup --oneline -10 -- <path/to/file>
```

## If not a Git repo yet

```bash
git init
git add -A
git commit -m "guard: initial snapshot" --no-verify
```

This does **not** recover past work from before `init`.

---

## Shadow Copy Recovery (Non-Git Fallback)

If `.cursor-guard-backup/` exists, find snapshots:

```powershell
# List all backup timestamps / 列出所有备份时间戳
Get-ChildItem .cursor-guard-backup/ -Directory | Sort-Object Name -Descending

# Restore a specific file from a timestamp / 从某个时间戳恢复文件
Copy-Item ".cursor-guard-backup/<timestamp>/<filename>" "<original-path>"

# Find the closest shadow copy to N minutes ago / 查找 N 分钟前最近的影子拷贝
$target = (Get-Date).AddMinutes(-5)
Get-ChildItem .cursor-guard-backup/ -Directory |
    Where-Object { $_.Name -match '^\d{8}_\d{6}$' } |
    ForEach-Object {
        $dt = [datetime]::ParseExact($_.Name, "yyyyMMdd_HHmmss", $null)
        [PSCustomObject]@{ Name = $_.Name; Time = $dt; Diff = [math]::Abs(($dt - $target).TotalSeconds) }
    } | Sort-Object Diff | Select-Object -First 3
```

---

## Windows-Specific Notes

- **Long paths**: If you get path errors, enable long path support:
  ```powershell
  git config --local core.longpaths true   # use --global for system-wide
  ```
- **Line endings**: Git may show spurious diffs due to CRLF/LF. Check with:
  ```bash
  git diff --check
  ```
  Fix with `git config --local core.autocrlf true` if desired (or `--global` for system-wide).
- **PowerShell quoting**: Use single quotes for paths with spaces in PowerShell:
  ```powershell
  git restore --source=HEAD -- 'src/my file.py'
  ```
- **File locks**: If a file is locked by another process (e.g. Cursor still has it open), `git restore` may fail. Close the tab first or use:
  ```powershell
  # Force close file handle (admin required, use with caution)
  # Prefer: just close the file tab in Cursor, then retry git restore.
  ```

---

## Non-Git Auxiliary Recovery

- **VS Code / Cursor Timeline (Local History)**: per-file; access via right-click file tab → "Open Timeline". May miss tool-only writes (Write/StrReplace via agent).
- **Checkpoints**: inside Agent thread UI only. Not guaranteed for all edit paths. Not long-term storage.
- **Conversation context**: if the agent used the Read tool on a file before overwriting it, the original content exists in the chat history. Ask the agent to re-write the original content back.
- **Recycle Bin (Windows)**: only catches files deleted via Explorer, NOT via `rm` / `Remove-Item` / agent Delete tool.

---

## Backup Cleanup

### Shadow copies

```powershell
# List all shadow copy snapshots (newest first)
Get-ChildItem .cursor-guard-backup/ -Directory | Sort-Object Name -Descending

# Delete snapshots older than 30 days
$cutoff = (Get-Date).AddDays(-30)
Get-ChildItem .cursor-guard-backup/ -Directory | Where-Object {
    try { [datetime]::ParseExact($_.Name, "yyyyMMdd_HHmmss", $null) -lt $cutoff } catch { $false }
} | Remove-Item -Recurse -Force
```

### Auto-backup branch

```bash
# View auto-backup history
git log cursor-guard/auto-backup --oneline -30

# Delete the branch entirely (script will recreate it on next run)
git branch -D cursor-guard/auto-backup

# Reclaim disk space after removing old branches
git gc --prune=now
```

### Log file

```powershell
# View recent backup log entries
Get-Content .cursor-guard-backup/backup.log -Tail 30
```
