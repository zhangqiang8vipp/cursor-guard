## v4.9.5

### Watcher: stop self-trigger loop without time-based cooldown
- **Root cause**: Event-driven `fs.watch` fired on `.git/` writes from snapshots; Windows often reports paths like `HEAD`, `objects/...` without a `.git/` prefix.
- **Fix**: `shouldIgnoreFsWatchEvent` now fully classifies paths under the **real** Git directory (`git rev-parse --git-dir` via `gDir`). No post-snapshot cooldown — loop broken by path semantics only.

### Backup file stats (from v4.9.3 in this line)
- `getBackupFiles` uses only `git diff --numstat` + `git diff --name-status` (matches CLI).

### Sidebar (from v4.9.1)
- Live "Last backup Xs ago" ticker.

### Event-driven watcher (from v4.9.0)
- `fs.watch` + VS Code `FileSystemWatcher` + 30s poller heartbeat.

### Asset
- `cursor-guard-ide-4.9.5.vsix`
