# Configuration Reference / 配置参数说明

This document explains every field in `.cursor-guard.json`.

本文档说明 `.cursor-guard.json` 中的每个配置项。

> Example file: [cursor-guard.example.json](cursor-guard.example.json)
>
> JSON Schema: [cursor-guard.schema.json](cursor-guard.schema.json)

---

## `protect`

- **Type**: `string[]` (glob patterns)
- **Default**: not set (all files protected)

**EN**: Whitelist glob patterns relative to workspace root. Only matching files get backup protection. If empty or missing, all files are protected.

**中文**: 白名单 glob 模式（相对于工作区根目录）。只有匹配的文件才会被保护。留空或不设置则保护所有文件。

```json
"protect": ["src/**", "lib/**", "package.json"]
```

---

## `ignore`

- **Type**: `string[]` (glob patterns)
- **Default**: not set

**EN**: Blacklist glob patterns. Matching files are excluded from protection even if they match `protect`. Applied on top of `.gitignore`.

**中文**: 黑名单 glob 模式。匹配的文件即使被 `protect` 包含也会排除。在 `.gitignore` 基础上额外生效。

**Resolution rules / 解析规则**:

| Scenario / 场景 | Behavior / 行为 |
|-----------------|----------------|
| Both `protect` and `ignore` set | File must match `protect` AND not match `ignore` / 文件须匹配 protect 且不匹配 ignore |
| Only `protect` set | Only matching files protected / 仅匹配文件被保护 |
| Only `ignore` set | Everything protected except matches / 除匹配文件外全部保护 |
| Neither set | Protect everything / 保护全部文件 |

```json
"ignore": ["node_modules/**", "dist/**", "*.log"]
```

---

## `backup_strategy`

- **Type**: `string`
- **Allowed**: `"git"` | `"shadow"` | `"both"`
- **Default**: `"git"`

| Value | EN | 中文 |
|-------|-----|------|
| `"git"` | Local commits to dedicated branch `cursor-guard/auto-backup` | 提交到专用分支 `cursor-guard/auto-backup` |
| `"shadow"` | File copies to `.cursor-guard-backup/<timestamp>/` | 文件拷贝到 `.cursor-guard-backup/<timestamp>/` |
| `"both"` | Git branch snapshot + shadow copies | 两者同时 |

```json
"backup_strategy": "git"
```

---

## `auto_backup_interval_seconds`

- **Type**: `integer`
- **Minimum**: `5`
- **Default**: `60`

**EN**: Interval in seconds for `auto-backup.ps1` to check for changes and create snapshots.

**中文**: 自动备份脚本 `auto-backup.ps1` 检查变更并创建快照的间隔秒数。

```json
"auto_backup_interval_seconds": 60
```

---

## `secrets_patterns`

- **Type**: `string[]` (glob patterns)
- **Default**: built-in list (see below)

**EN**: Glob patterns for sensitive files. Matching files are **auto-excluded** from backup, even if within `protect` scope. Built-in defaults (always active): `.env`, `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `credentials*`. Set this field to override with your own patterns.

**中文**: 敏感文件 glob 模式。匹配的文件**自动排除**备份，即使在 `protect` 范围内。内置默认值（始终生效）：`.env`, `.env.*`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `credentials*`。设置此字段可覆盖为自定义模式。

```json
"secrets_patterns": [".env", ".env.*", "*.key", "*.pem"]
```

---

## `pre_restore_backup`

- **Type**: `string`
- **Allowed**: `"always"` | `"ask"` | `"never"`
- **Default**: `"always"`

| Value | EN | 中文 |
|-------|-----|------|
| `"always"` | Auto-preserve current version before every restore. No prompt. | 恢复前自动保留当前版本，无需确认。 |
| `"ask"` | Prompt user each time: "Preserve current version?" | 每次恢复前询问用户是否保留。 |
| `"never"` | Skip preservation entirely (not recommended). | 不保留当前版本（不推荐）。 |

**EN**: Regardless of this config, the user's explicit instruction in the current message always takes priority. Say "don't preserve" to skip, or "preserve first" to force.

**中文**: 无论此配置如何，用户在当前消息中的明确指令始终优先。说"不保留当前版本"可跳过，说"先保留当前版本"可强制保留。

```json
"pre_restore_backup": "always"
```

---

## `retention`

- **Type**: `object`
- **Default**: `{ "mode": "days", "days": 30 }`

**EN**: Retention policy for **shadow copies** only. Git branch snapshots are not auto-cleaned — manage them manually. Controls automatic cleanup of old `.cursor-guard-backup/` directories.

**中文**: 仅针对**影子拷贝**的保留策略。Git 分支快照不会自动清理，需手动管理。控制 `.cursor-guard-backup/` 旧目录的自动清理。

### Sub-fields / 子字段

| Field | Type | Default | EN | 中文 |
|-------|------|---------|-----|------|
| `mode` | `"days"` \| `"count"` \| `"size"` | `"days"` | Cleanup strategy | 清理策略 |
| `days` | `integer` | `30` | Keep snapshots from last N days (when mode=days) | 保留最近 N 天的快照 |
| `max_count` | `integer` | `100` | Keep N newest snapshots (when mode=count) | 保留最新 N 份快照 |
| `max_size_mb` | `integer` | `500` | Keep total size under N MB (when mode=size) | 总大小不超过 N MB |

```json
"retention": {
  "mode": "days",
  "days": 30,
  "max_count": 100,
  "max_size_mb": 500
}
```
