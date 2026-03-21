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
| `"git"` | Local commits to dedicated branch `cursor-guard/auto-backup` |
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

Interval in seconds for `auto-backup.ps1` to check for changes and create snapshots.

```json
"auto_backup_interval_seconds": 60
```

---

## `secrets_patterns`

- **Type**: `string[]` (glob patterns)
- **Default**: built-in list (see below)

Glob patterns for sensitive files. Matching files are **auto-excluded** from backup, even if within `protect` scope. Built-in defaults (always active): `.env`, `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `credentials*`. Set this field to override with your own patterns.

```json
"secrets_patterns": [".env", ".env.*", "*.key", "*.pem"]
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
