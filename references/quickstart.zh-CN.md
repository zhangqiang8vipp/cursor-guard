# Cursor Guard 使用说明

一份简短的上手文档，适合第一次安装后直接照着用。

## 1. 它是做什么的

`cursor-guard` 用来保护你的项目不被 Cursor Agent 误改、误删、误覆盖。

它主要做 3 件事：

1. 在高风险写入前，先保留可恢复的版本。
2. 提供自动备份能力，定时保存项目状态。
3. 在需要恢复时，优先从本地备份里找回文件。

默认是**本地保护**，不会自动推送到远程仓库。

---

## 2. 环境要求

- `Node.js >= 18`
- `Git`
  说明：如果你只用 `shadow` 影子拷贝模式，可以没有 Git；如果要用默认的 Git 备份模式，就需要 Git。
- `Cursor IDE`

---

## 3. 安装方式

### 方式一：放到 Cursor skill 目录

把项目放到下面任一目录即可：

```text
~/.cursor/skills/cursor-guard/
<你的项目>/.cursor/skills/cursor-guard/
```

### 方式二：npm 安装后复制

```bash
npm install cursor-guard
```

Windows:

```powershell
Copy-Item -Recurse node_modules/cursor-guard "$env:USERPROFILE/.cursor/skills/cursor-guard"
```

macOS / Linux:

```bash
cp -r node_modules/cursor-guard ~/.cursor/skills/cursor-guard
```

---

## 4. 最快开始方式

### 第一步：先检查环境

最稳的方式：先进入你的项目根目录，再执行：

```bash
npx cursor-guard-doctor --path .
```

也可以在任何别的目录执行，但 `--path` 必须明确指向你的项目根目录：

```bash
# Windows
npx cursor-guard-doctor --path D:\MyProject

# macOS / Linux
npx cursor-guard-doctor --path /Users/you/my-project
```

它会检查：

- Node / Git 是否可用
- 当前目录是不是 Git 仓库
- 备份目录是否被忽略
- 配置文件是否合法

### 第二步：按需创建配置文件

```bash
cp .cursor/skills/cursor-guard/references/cursor-guard.example.json .cursor-guard.json
```

如果你不想自定义，也可以先不配，直接使用默认行为。

### 第三步：启动自动备份

这一点最重要：

- 命令可以在任意目录执行
- 但 `--path` 必须是你要保护的项目根目录
- 如果你当前就在项目根目录，写 `--path .` 最方便
- 如果你当前不在项目根目录，就不要写 `--path .`，要写完整路径

```bash
# 已经进入项目根目录时
npx cursor-guard-backup --path .

# 不在项目根目录时，直接写目标项目路径
# Windows
npx cursor-guard-backup --path D:\MyProject

# macOS / Linux
npx cursor-guard-backup --path /Users/you/my-project
```

如果想缩短检查间隔：

```bash
npx cursor-guard-backup --path . --interval 30
```

建议在**独立终端**里运行，不要和日常开发命令混在一起。

错误示例：

```bash
# 你当前在 D:\OtherProject
# 这条命令保护的是 D:\OtherProject，不是 D:\MyProject
npx cursor-guard-backup --path .
```

正确思路是：

- 要么先 `cd` 到真正的项目根目录，再用 `--path .`
- 要么不切目录，直接把目标项目路径写完整

### 第四步：在 Cursor 里正常使用 Agent

后续你像平时一样让 Agent 改代码即可。  
`cursor-guard` 会在需要时提供保护、备份和恢复路径。

---

## 5. 备份方式怎么选

### `git`

适合已经是 Git 仓库的项目。

- 备份写入 `refs/guard/auto-backup`
- 不污染你当前分支
- 普通 `git push` 和 `git push --all` 不会把它推到远程

### `shadow`

适合非 Git 项目，或者你只想做本地文件拷贝。

- 备份写入 `.cursor-guard-backup/<timestamp>/`

### `both`

同时保留 Git 备份和影子拷贝，安全性最高，但占空间更多。

---

## 6. 推荐配置示例

```json
{
  "protect": ["src/**", "package.json", "README.md"],
  "ignore": ["dist/**", "node_modules/**", "*.log"],
  "backup_strategy": "both",
  "auto_backup_interval_seconds": 60,
  "pre_restore_backup": "always",
  "secrets_patterns_extra": ["*.secret", "tokens.*"],
  "retention": {
    "mode": "days",
    "days": 30,
    "max_count": 100,
    "max_size_mb": 500
  },
  "git_retention": {
    "enabled": true,
    "mode": "count",
    "max_count": 200
  }
}
```

这个配置的意思：

- 只重点保护 `src/**`、`package.json`、`README.md`
- 忽略产物目录和日志
- 同时启用 Git 备份和影子拷贝
- 每 60 秒检查一次变化
- 恢复前默认先保留当前版本
- 额外排除自定义敏感文件
- 自动清理过旧备份

---

## 7. 最常用的配置项

### `protect`

指定重点保护哪些文件或目录。  
不写时，默认保护全部文件。

### `ignore`

指定哪些文件不要纳入保护和备份。

### `backup_strategy`

可选值：

- `git`
- `shadow`
- `both`

### `pre_restore_backup`

控制恢复前是否先保留当前版本：

- `always`：总是先保留
- `ask`：恢复前询问
- `never`：不保留，不推荐

### `retention`

控制 `.cursor-guard-backup/` 里的影子拷贝保留多久。

### `git_retention`

控制 `refs/guard/auto-backup` 里的 Git 备份保留多久。

---

## 8. 怎么恢复

恢复路径建议按这个顺序看：

1. `refs/guard/pre-restore/...`
2. `refs/guard/auto-backup`
3. `.cursor-guard-backup/<timestamp>/`

常用命令：

```bash
git log guard/auto-backup --oneline -20
git restore --source=guard/auto-backup -- <path/to/file>
git diff guard/auto-backup -- <path/to/file>
```

如果是影子拷贝模式，就去 `.cursor-guard-backup/` 里找对应时间戳目录。

更完整的恢复方法见：

- [recovery.md](./recovery.md)

---

## 9. 你最需要知道的几个点

- 默认不会自动 `git push`
- 普通 `git push` / `git push --all` 不会推送 `refs/guard/auto-backup`
- 但 `git push --mirror` 会推送所有 refs，谨慎使用
- `.cursor-guard-backup/` 会被自动加入忽略，避免备份目录反复触发 Git 脏状态
- 如果是重要项目，建议用 `both`

---

## 10. 常用命令速查

```bash
# 检查环境
npx cursor-guard-doctor --path .

# 启动自动备份
npx cursor-guard-backup --path .

# 每 30 秒检查一次
npx cursor-guard-backup --path . --interval 30

# 查看最近 Git 自动备份
git log guard/auto-backup --oneline -20

# 从自动备份恢复单个文件
git restore --source=guard/auto-backup -- src/app.ts
```

---

## 11. 进一步阅读

- [README.zh-CN.md](../README.zh-CN.md)
- [config-reference.zh-CN.md](./config-reference.zh-CN.md)
- [recovery.md](./recovery.md)
