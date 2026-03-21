# Cursor Guard

Protects your code from accidental AI overwrite or deletion in [Cursor](https://cursor.com).

保护你的代码免受 [Cursor](https://cursor.com) AI 代理意外覆写或删除。

---

## What It Does / 功能介绍

When Cursor's AI agent edits your files, there's a risk of accidental overwrites, deletions, or loss of work. **Cursor Guard** enforces a safety protocol:

当 Cursor 的 AI 代理编辑你的文件时，可能会意外覆盖、删除或丢失代码。**Cursor Guard** 强制执行一套安全协议：

- **Mandatory pre-write snapshots / 强制写前快照** — Git commit or shadow copy before any destructive operation / 在任何破坏性操作前自动 Git 提交或影子拷贝
- **Read before Write / 先读后写** — The agent must read a file before overwriting it / 代理必须先读取文件内容，才能覆写
- **Review before apply / 预览再执行** — Diff previews and explicit confirmation for dangerous ops / 危险操作前展示 diff 预览并要求确认
- **Deterministic recovery / 确定性恢复** — Clear priority-ordered recovery paths (Git → shadow copies → conversation context → editor history) / 按优先级的恢复路径（Git → 影子拷贝 → 对话上下文 → 编辑器历史）
- **Configurable scope / 可配置保护范围** — Protect only what matters via `.cursor-guard.json` / 通过配置文件只保护你关心的文件
- **Secrets filtering / 敏感文件过滤** — Sensitive files (`.env`, keys, certificates) are auto-excluded from backups / `.env`、密钥、证书等敏感文件自动排除
- **Auto-backup script / 自动备份脚本** — A PowerShell watcher that periodically snapshots to a dedicated Git branch without disturbing your working tree / 定期快照到独立 Git 分支，不干扰工作区

---

## Installation / 安装

### Method 1: npm install / 方式一：npm 安装

```bash
npm install cursor-guard
```

After installation, copy the skill files to your Cursor skills directory:

安装后，将技能文件复制到 Cursor 技能目录：

**Windows (PowerShell):**

```powershell
# Global installation (all projects) / 全局安装（所有项目生效）
Copy-Item -Recurse node_modules/cursor-guard "$env:USERPROFILE/.cursor/skills/cursor-guard"

# Per-project installation / 项目级安装（仅当前项目生效）
Copy-Item -Recurse node_modules/cursor-guard .cursor/skills/cursor-guard
```

**macOS / Linux:**

```bash
# Global installation / 全局安装
cp -r node_modules/cursor-guard ~/.cursor/skills/cursor-guard

# Per-project installation / 项目级安装
cp -r node_modules/cursor-guard .cursor/skills/cursor-guard
```

After copying, you can remove the npm dependency if you don't need it in `node_modules`:

复制完成后，如果不需要保留在 `node_modules` 中，可以卸载：

```bash
npm uninstall cursor-guard
```

### Method 2: Git clone / 方式二：Git 克隆

```bash
# Global installation / 全局安装
git clone https://github.com/zhangqiang8vipp/cursor-guard.git ~/.cursor/skills/cursor-guard

# Per-project installation / 项目级安装
git clone https://github.com/zhangqiang8vipp/cursor-guard.git .cursor/skills/cursor-guard
```

### Method 3: Manual download / 方式三：手动下载

Download from [GitHub Releases](https://github.com/zhangqiang8vipp/cursor-guard/releases) and extract to:

从 [GitHub Releases](https://github.com/zhangqiang8vipp/cursor-guard/releases) 下载并解压到：

```
~/.cursor/skills/cursor-guard/          # Global / 全局
<project-root>/.cursor/skills/cursor-guard/  # Per-project / 项目级
```

### Verify Installation / 验证安装

After installation, your directory structure should look like this / 安装后目录结构应如下所示：

```
.cursor/skills/cursor-guard/
├── SKILL.md                          # AI agent instructions / AI 代理指令
├── README.md
├── LICENSE
└── references/
    ├── auto-backup.ps1               # Auto-backup script / 自动备份脚本
    ├── recovery.md                   # Recovery commands / 恢复命令
    ├── cursor-guard.example.json     # Example config / 示例配置
    └── cursor-guard.schema.json      # Config schema / 配置 Schema
```

The skill activates automatically when the AI agent detects risky operations (file edits, deletes, renames) or when you mention recovery-related terms.

技能会在 AI 代理检测到高风险操作（文件编辑、删除、重命名）或你提到恢复相关词汇时自动激活。无需其他设置，安装即生效。

---

## Quick Start / 快速上手

1. **Install the skill** using any method above / 用以上任意方式安装技能

2. **Open Cursor** and start an Agent conversation / 打开 Cursor，开始一个 Agent 对话

3. **The skill works automatically** — when the AI agent tries to edit files, it will: / 技能自动生效——当 AI 代理尝试编辑文件时，会自动：
   - Create a Git snapshot before writing / 写入前创建 Git 快照
   - Read files before overwriting / 覆写前先读取文件
   - Show diff previews for dangerous operations / 危险操作前展示 diff 预览
   - Report a status block after each protected operation / 每次受保护操作后报告状态

4. **(Optional) Add project config** to customize protection scope / （可选）添加项目配置自定义保护范围：

```bash
cp .cursor/skills/cursor-guard/references/cursor-guard.example.json .cursor-guard.json
```

5. **(Optional) Run auto-backup** in a separate terminal / （可选）在独立终端运行自动备份：

```powershell
.\auto-backup.ps1 -Path "D:\MyProject"
```

### Project Configuration / 项目配置

Edit `.cursor-guard.json` to define which files to protect / 编辑 `.cursor-guard.json` 定义保护哪些文件：

```json
{
  "protect": ["src/**", "lib/**", "package.json"],
  "ignore": ["node_modules/**", "dist/**"],
  "auto_backup_interval_seconds": 60,
  "secrets_patterns": [".env", ".env.*", "*.key", "*.pem"],
  "retention": { "mode": "days", "days": 30 }
}
```

---

## Auto-Backup Script / 自动备份脚本

Run in a separate terminal while working in Cursor:

在使用 Cursor 时，在**单独的终端窗口**中运行：

```powershell
.\auto-backup.ps1 -Path "D:\MyProject"

# Custom interval (default 60s) / 自定义间隔（默认 60 秒）：
.\auto-backup.ps1 -Path "D:\MyProject" -IntervalSeconds 30
```

The script uses Git plumbing commands to snapshot to `cursor-guard/auto-backup` branch — it never switches branches or touches your working index.

脚本使用 Git 底层命令快照到 `cursor-guard/auto-backup` 分支——不会切换分支，也不会影响你的工作索引。

> **Note / 注意**: Run this script in a separate PowerShell window, NOT inside Cursor's integrated terminal. Cursor's terminal may interfere with Git plumbing commands.
>
> 请在独立的 PowerShell 窗口中运行此脚本，不要在 Cursor 的集成终端中运行，因为 Cursor 终端可能干扰 Git 底层命令。

---

## Recovery / 恢复

If something goes wrong, just tell the AI agent in natural language:

出问题时，直接用自然语言告诉 AI 代理即可：

### By time / 按时间恢复

> "帮我恢复到5分钟前"
> "restore to 10 minutes ago"
> "恢复到今天下午3点的状态"
> "go back to yesterday's version"

### By version / 按版本恢复

> "恢复到上一个版本"
> "回到前3个版本"
> "undo the last 2 changes"
> "go back 3 versions"

### By file / 指定文件恢复

> "把 src/app.py 恢复到10分钟前"
> "restore src/app.py to the previous version"

The agent will automatically search Git history and auto-backup snapshots, show you matching versions to choose from, and restore after your confirmation.

代理会自动搜索 Git 历史和自动备份快照，列出匹配版本供你选择，确认后执行恢复。

### Recovery priority / 恢复优先级

1. **Git** — `git restore`, `git reset`, `git reflog`
2. **Auto-backup branch / 自动备份分支** — `cursor-guard/auto-backup`
3. **Shadow copies / 影子拷贝** — `.cursor-guard-backup/<timestamp>/`
4. **Conversation context / 对话上下文** — Original file content captured by agent Read calls / 代理 Read 调用捕获的原始内容
5. **Editor history / 编辑器历史** — VS Code/Cursor Timeline (auxiliary / 辅助)

See [references/recovery.md](references/recovery.md) for detailed commands / 详细命令见恢复文档。

---

## Trigger Keywords / 触发关键词

The skill activates on these signals / 技能在以下信号时激活：

- File edits, deletes, renames by the AI agent / AI 代理的文件编辑、删除、重命名
- Recovery requests / 恢复请求："回滚"、"误删"、"丢版本"、"rollback"、"undo"、"recover"
- Time-based recovery / 按时间恢复："恢复到N分钟前"、"restore to N minutes ago"、"恢复到下午3点"
- Version-based recovery / 按版本恢复："恢复到上一个版本"、"前N个版本"、"go back N versions"
- History issues / 历史问题：checkpoints missing、Timeline not working、save failures

---

## Files / 文件说明

| File / 文件 | Purpose / 用途 |
|------|---------|
| `SKILL.md` | Main skill instructions for the AI agent / AI 代理的主要技能指令 |
| `references/auto-backup.ps1` | PowerShell auto-backup watcher script / PowerShell 自动备份监控脚本 |
| `references/recovery.md` | Recovery command templates / 恢复命令模板 |
| `references/cursor-guard.example.json` | Example project configuration / 示例项目配置 |
| `references/cursor-guard.schema.json` | JSON Schema for config validation / 配置文件的 JSON Schema |

---

## Requirements / 环境要求

- **Git** — for primary backup strategy / 主要备份策略
- **PowerShell 5.1+** — for auto-backup script (Windows built-in) / 自动备份脚本（Windows 自带）
- **Cursor IDE** — with Agent mode enabled / 需启用 Agent 模式

---

## License / 许可证

MIT
