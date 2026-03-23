# Manual snapshot “bookmark” when the tree is unchanged / 树未变时的手动快照「书签」

## Why we do this / 为什么这样选

When you call **`snapshot_now`** (MCP) or **Snapshot Now** (IDE), you often add an **`intent`** (and optional **agent** / **session**). If the Guard snapshot **tree is identical** to the previous baseline, Git has nothing new to store as a *different tree* — but from a **product** perspective, “no new tree” must not mean **“nothing happened”**.

We **still create a normal Git commit** on the manual snapshot ref (`refs/guard/snapshot` for MCP; same mechanism when `allowEmptyTree` is used) with:

- The **same tree** as the parent (a true “empty” or **bookmark** commit in Git terms).
- **`Guard-Bookmark: true`** in the commit trailers for machines and UI.
- A default **`Summary`** line when you did not supply one, so the backup list is not blank.
- Your **`Intent` / `Agent` / `Session`** trailers when provided.

This matches the earlier design choice: **prefer a bookmark commit over rewriting history** (no `amend` of the previous commit) and **over a separate sidecar store** for the common case — one timeline, one `list_backups` source of truth.

## Pros / 优点

- **Visible audit trail**: time + intent appear on the dashboard timeline and in `list_backups`.
- **No history rewrite**: previous commit hashes stay valid; no trailer surgery on old commits.
- **Same stack as today**: `listBackups` + trailers + restore by hash still work; bookmark commits are valid restore targets (tree equals parent — a deliberate no-op restore).
- **Future-friendly for event-based restore**: each user action can map to a **stable commit hash** and timestamp even when the tree did not move — good for “restore to the state *as of* this acknowledged intent” and for correlating MCP calls with timeline entries.

## Cons / 缺点

- **Extra commits** on `refs/guard/snapshot` (and any code path using `allowEmptyTree`): retention / ref length grow slightly faster if users spam snapshot with no changes.
- **Semantic nuance**: restoring *to* a bookmark commit may change nothing relative to parent; documentation and UI must say **“bookmark / no tree change”** so it is not confused with a content-bearing restore point.
- **Not used for auto-backup**: the watcher still skips when the tree is unchanged (`allowEmptyTree` off) to avoid noise.

## Scope / 范围

- **Manual paths**: MCP `snapshot_now` (already uses `allowEmptyTree: true`) and IDE snapshot (same).
- **Automatic backup**: unchanged — still **skip** when tree unchanged.

## MCP: `record_guard_event`

Dedicated tool for **agent workflows** after other MCP calls: writes **`Guard-Event:`** (short label, e.g. `restore_project:execute`) plus optional **`detail`** → Summary, **`intent`**, **`agent`**, **`session`**. Same mechanics as manual snapshot with **`allowEmptyTree`**: if the tree is unchanged vs the Guard baseline, you still get a **bookmark commit** on `refs/guard/snapshot` so the event is visible on the timeline — not a silent no-op.

## Related code / 相关实现

- `references/lib/core/snapshot.js` — `allowEmptyTree`, `Guard-Bookmark`, `Guard-Event` (via `context.guardEvent`), default summary, `bookmark: true` on result.
- `references/lib/core/backups.js` — `TRAILER_MAP` entries `Guard-Bookmark` → `guardBookmark`, `Guard-Event` → `guardEvent`.
- `references/mcp/server.js` — tool **`record_guard_event`**.
- Dashboard — bookmark badge, **MCP/audit event** row, drawer fields.

---

*Introduced in v4.9.13; `record_guard_event` in v4.9.14.*
