# 配置参数说明

本文档说明 `.cursor-guard.json` 中的每个配置项。

> 示例文件：[cursor-guard.example.json](cursor-guard.example.json)
>
> JSON Schema：[cursor-guard.schema.json](cursor-guard.schema.json)

---

## `protect`

- **类型**：`string[]`（glob 模式）
- **默认值**：未设置（保护所有文件）

白名单 glob 模式，相对于工作区根目录。只有匹配的文件才会被保护。留空或不设置则保护所有文件。

```json
"protect": ["src/**", "lib/**", "package.json"]
```

---

## `ignore`

- **类型**：`string[]`（glob 模式）
- **默认值**：未设置

黑名单 glob 模式。匹配的文件即使被 `protect` 包含也会排除。在 `.gitignore` 基础上额外生效。

**解析规则**：

| 场景 | 行为 |
|------|------|
| 同时设置 `protect` 和 `ignore` | 文件须匹配 protect 且不匹配 ignore |
| 仅设置 `protect` | 仅匹配文件被保护 |
| 仅设置 `ignore` | 除匹配文件外全部保护 |
| 都不设置 | 保护全部文件 |

```json
"ignore": ["node_modules/**", "dist/**", "*.log"]
```

---

## `backup_strategy`

- **类型**：`string`
- **可选值**：`"git"` | `"shadow"` | `"both"`
- **默认值**：`"git"`

| 值 | 说明 |
|----|------|
| `"git"` | 提交到专用分支 `cursor-guard/auto-backup` |
| `"shadow"` | 文件拷贝到 `.cursor-guard-backup/<timestamp>/` |
| `"both"` | Git 分支快照 + 影子拷贝同时进行 |

```json
"backup_strategy": "git"
```

---

## `auto_backup_interval_seconds`

- **类型**：`integer`
- **最小值**：`5`
- **默认值**：`60`

自动备份脚本检查变更并创建快照的间隔秒数。

```json
"auto_backup_interval_seconds": 60
```

---

## `secrets_patterns`

- **类型**：`string[]`（glob 模式）
- **默认值**：内置列表（见下）

敏感文件 glob 模式。匹配的文件**自动排除**备份，即使在 `protect` 范围内。内置默认值：`.env`、`.env.*`、`*.key`、`*.pem`、`*.p12`、`*.pfx`、`credentials*`。

**设置此字段会完全替换内置默认值。** 如果只想追加模式，请使用 `secrets_patterns_extra`。

```json
"secrets_patterns": [".env", ".env.*", "*.key", "*.pem"]
```

---

## `secrets_patterns_extra`

- **类型**：`string[]`（glob 模式）
- **默认值**：未设置

追加到当前 `secrets_patterns`（含默认值）的额外 glob 模式。使用此字段可在不丢失 `.p12`、`.pfx`、`credentials*` 等内置保护的情况下添加自定义模式。

```json
"secrets_patterns_extra": ["*.secret", "tokens.*"]
```

---

## `pre_restore_backup`

- **类型**：`string`
- **可选值**：`"always"` | `"ask"` | `"never"`
- **默认值**：`"always"`

| 值 | 说明 |
|----|------|
| `"always"` | 恢复前自动保留当前版本，无需确认。 |
| `"ask"` | 每次恢复前询问用户是否保留当前版本。 |
| `"never"` | 不保留当前版本（不推荐）。 |

无论此配置如何，用户在当前消息中的明确指令始终优先。说"不保留当前版本"可跳过，说"先保留当前版本"可强制保留。

```json
"pre_restore_backup": "always"
```

---

## `retention`

- **类型**：`object`
- **默认值**：`{ "mode": "days", "days": 30 }`

仅针对**影子拷贝**的保留策略。Git 分支快照不会自动清理，需手动管理。控制 `.cursor-guard-backup/` 旧目录的自动清理。

### 子字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | `"days"` \| `"count"` \| `"size"` | `"days"` | 清理策略 |
| `days` | `integer` | `30` | 保留最近 N 天的快照（mode=days 时生效） |
| `max_count` | `integer` | `100` | 保留最新 N 份快照（mode=count 时生效） |
| `max_size_mb` | `integer` | `500` | 总大小不超过 N MB（mode=size 时生效） |

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

- **类型**：`object`
- **默认值**：`{ "enabled": false, "mode": "count", "max_count": 200 }`

**`cursor-guard/auto-backup` Git 分支**的保留策略。默认情况下自动备份提交会无限累积。启用此项可自动裁剪旧提交。

### 子字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `boolean` | `false` | 启用自动裁剪。关闭时分支无限增长。 |
| `mode` | `"days"` \| `"count"` | `"count"` | 裁剪策略 |
| `days` | `integer` | `30` | 保留最近 N 天的提交（mode=days 时生效） |
| `max_count` | `integer` | `200` | 保留最新 N 个提交（mode=count 时生效，最少 10） |

```json
"git_retention": {
  "enabled": true,
  "mode": "count",
  "max_count": 200
}
```
