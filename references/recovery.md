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

```bash
git restore .
git clean -fd   # removes untracked files/dirs — DANGEROUS
```

Only suggest `git clean -fd` if the user explicitly wants untracked removal; warn about data loss.

## Recover "lost" commits / after reset

```bash
git reflog
# find the commit hash, then:
git branch recover-branch <hash>
# or (destructive — discards uncommitted work):
git reset --hard <hash>
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
# List all backup timestamps
Get-ChildItem .cursor-guard-backup/ -Directory | Sort-Object Name -Descending

# Restore a specific file from a timestamp
Copy-Item ".cursor-guard-backup/<timestamp>/<filename>" "<original-path>"
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
