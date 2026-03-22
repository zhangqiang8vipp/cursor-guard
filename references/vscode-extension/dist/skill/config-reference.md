# Configuration Reference

This document explains every field in `.cursor-guard.json`.

> Example file: [cursor-guard.example.json](cursor-guard.example.json)
>
> JSON Schema: [cursor-guard.schema.json](cursor-guard.schema.json)

---

## `protect`

- **Type**: `string[]` (glob patterns)
- **Default**: not set (all files protected)

Whitelist glob patterns relative to workspace root. Only matching files get backup protection. If empty or missing, all files are protected.

```json
"protect": ["src/**", "lib/**", "package.json"]
```

---

## `ignore`

- **Type**: `string[]` (glob patterns)
- **Default**: not set

Blacklist glob patterns. Matching files are excluded from protection even if they match `protect`. Applied on top of `.gitignore`.

**Resolution rules**:

| Scenario | Behavior |
|----------|----------|
| Both `protect` and `ignore` set | File must match `protect` AND not match `ignore` |
| Only `protect` set | Only matching files are protected |
| Only `ignore` set | Everything protected except matches |
| Neither set | Protect everything |

```json
"ignore": ["node_modules/**", "dist/**", "*.log"]
```

---

## `backup_strategy`

- **Type**: `string`
- **Allowed**: `"git"` | `"shadow"` | `"both"`
- **Default**: `"git"`

| Value | Description |
|-------|-------------|
| `"git"` | Local commits to dedicated ref `refs/guard/auto-backup` |
| `"shadow"` | File copies to `.cursor-guard-backup/<timestamp>/` |
| `"both"` | Git branch snapshot + shadow copies |

```json
"backup_strategy": "git"
```

---

## `auto_backup_interval_seconds`

- **Type**: `integer`
- **Minimum**: `5`
- **Default**: `60`

Interval in seconds for the auto-backup script to check for changes and create snapshots.

```json
"auto_backup_interval_seconds": 60
```

---

## `secrets_patterns`

- **Type**: `string[]` (glob patterns)
- **Default**: built-in list (see below)

Glob patterns for sensitive files. Matching files are **auto-excluded** from backup, even if within `protect` scope. Built-in defaults: `.env`, `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `credentials*`.

**Setting this field replaces the built-in defaults entirely.** If you only need to add patterns, use `secrets_patterns_extra` instead.

```json
"secrets_patterns": [".env", ".env.*", "*.key", "*.pem"]
```

---

## `secrets_patterns_extra`

- **Type**: `string[]` (glob patterns)
- **Default**: not set

Additional glob patterns **appended** to the current `secrets_patterns` (including defaults). Use this to add custom patterns without losing the built-in protection for `.p12`, `.pfx`, `credentials*`, etc.

```json
"secrets_patterns_extra": ["*.secret", "tokens.*"]
```

---

## `pre_restore_backup`

- **Type**: `string`
- **Allowed**: `"always"` | `"ask"` | `"never"`
- **Default**: `"always"`

| Value | Description |
|-------|-------------|
| `"always"` | Auto-preserve current version before every restore. No prompt. |
| `"ask"` | Prompt user each time: "Preserve current version?" |
| `"never"` | Skip preservation entirely (not recommended). |

Regardless of this config, the user's explicit instruction in the current message always takes priority. Say "don't preserve" to skip, or "preserve first" to force.

```json
"pre_restore_backup": "always"
```

---

## `retention`

- **Type**: `object`
- **Default**: `{ "mode": "days", "days": 30 }`

Retention policy for **shadow copies** only. Git branch snapshots are not auto-cleaned — manage them manually. Controls automatic cleanup of old `.cursor-guard-backup/` directories.

### Sub-fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `"days"` \| `"count"` \| `"size"` | `"days"` | Cleanup strategy |
| `days` | `integer` | `30` | Keep snapshots from last N days (when mode=days) |
| `max_count` | `integer` | `100` | Keep N newest snapshots (when mode=count) |
| `max_size_mb` | `integer` | `500` | Keep total size under N MB (when mode=size) |

```json
"retention": {
  "mode": "days",
  "days": 30,
  "max_count": 100,
  "max_size_mb": 500
}
```

---

## `git_retention`

- **Type**: `object`
- **Default**: `{ "enabled": false, "mode": "count", "max_count": 200 }`

Retention policy for the **`refs/guard/auto-backup` Git ref**. By default, auto-backup commits accumulate indefinitely. Enable this to automatically prune old commits.

### Sub-fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable automatic pruning. When false, branch grows without limit. |
| `mode` | `"days"` \| `"count"` | `"count"` | Pruning strategy |
| `days` | `integer` | `30` | Keep commits from last N days (when mode=days) |
| `max_count` | `integer` | `200` | Keep N newest commits (when mode=count, minimum 10) |

```json
"git_retention": {
  "enabled": true,
  "mode": "count",
  "max_count": 200
}
```

---

## `proactive_alert`

- **Type**: `boolean`
- **Default**: `true`

Enable V4 proactive change-velocity detection. When enabled, the auto-backup watcher monitors file change frequency and raises alerts when abnormal patterns are detected (e.g. 20+ files modified in 10 seconds). Alerts are persisted to a file so the MCP server can include them in tool responses.

Set to `false` to disable proactive monitoring entirely.

```json
"proactive_alert": true
```

---

## `alert_thresholds`

- **Type**: `object`
- **Default**: `{ "files_per_window": 20, "window_seconds": 10, "cooldown_seconds": 60 }`

Thresholds for proactive change-velocity alerts. Only effective when `proactive_alert` is `true`.

### Sub-fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `files_per_window` | `integer` | `20` | Number of file changes within the time window that triggers an alert |
| `window_seconds` | `integer` | `10` | Sliding time window in seconds for counting file changes |
| `cooldown_seconds` | `integer` | `60` | Minimum seconds between consecutive alerts to avoid noise |

```json
"alert_thresholds": {
  "files_per_window": 20,
  "window_seconds": 10,
  "cooldown_seconds": 60
}
```

---

## `enable_pre_warning`

- **Type**: `boolean`
- **Default**: `false`

Enable destructive-edit pre-warning. When enabled, the IDE extension evaluates deletion-heavy edits and removed methods/functions before they quietly land. Active warnings are persisted so `backup_status`, `dashboard`, the sidebar, and the browser dashboard can surface them.

```json
"enable_pre_warning": true
```

---

## `pre_warning_threshold`

- **Type**: `integer`
- **Minimum**: `1`
- **Maximum**: `100`
- **Default**: `30`

Risk threshold for triggering a pre-warning. The score is based primarily on deletion ratio, but method/function removal is treated as inherently risky and can still trigger a warning even if the line percentage is below the threshold.

```json
"pre_warning_threshold": 30
```

---

## `pre_warning_mode`

- **Type**: `string`
- **Allowed**: `"popup"` | `"dashboard"` | `"silent"`
- **Default**: `"popup"`

Controls how the warning is presented inside the IDE extension.

| Value | Description |
|-------|-------------|
| `"popup"` | Show an interactive warning with quick actions such as undo / diff review |
| `"dashboard"` | Do not interrupt editing; highlight the risk in dashboard, sidebar, and status surfaces |
| `"silent"` | Persist/log the warning without UI interruption |

```json
"pre_warning_mode": "popup"
```

---

## `pre_warning_exclude_patterns`

- **Type**: `string[]` (glob patterns)
- **Default**: not set

Glob patterns that skip pre-warning evaluation. Useful for generated code, migrations, vendored directories, lockfiles, or other files where large deletions are expected and not actionable.

```json
"pre_warning_exclude_patterns": ["generated/**", "vendor/**"]
```
