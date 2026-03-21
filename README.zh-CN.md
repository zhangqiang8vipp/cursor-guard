# Cursor Guard

[![npm version](https://img.shields.io/npm/v/cursor-guard)](https://www.npmjs.com/package/cursor-guard)
[![license](https://img.shields.io/github/license/zhangqiang8vipp/cursor-guard)](LICENSE)

保护你的代码免受 [Cursor](https://cursor.com) AI 代理意外覆写或删除。

**[English](README.md)**

---

## 功能介绍

当 Cursor 的 AI 代理编辑你的文件时，可能会意外覆盖、删除或丢失代码。**Cursor Guard** 强制执行一套安全协议：

- **强制写前快照** — 在任何破坏性操作前自动 Git 提交或影子拷贝
- **先读后写** — 代理必须先读取文件内容，才能覆写
- **预览再执行** — 危险操作前展示 diff 预览并要求确认
- **确定性恢复** — 按优先级的恢复路径（Git → 影子拷贝 → 对话上下文 → 编辑器历史）
- **可配置保护范围** — 通过 `.cursor-guard.json` 配置文件只保护你关心的文件
- **敏感文件过滤** — `.env`、密钥、证书等敏感文件自动排除备份
- **自动备份脚本** — 跨平台 (Node.js) 定期快照到独立 Git 分支，不干扰工作区

---

## 安装

### 方式一：npm 安装

```bash
npm install cursor-guard
```

安装后，将技能文件复制到 Cursor 技能目录：

**Windows (PowerShell):**

```powershell
# 全局安装（所有项目生效）
Copy-Item -Recurse node_modules/cursor-guard "$env:USERPROFILE/.cursor/skills/cursor-guard"

# 项目级安装（仅当前项目生效）
Copy-Item -Recurse node_modules/cursor-guard .cursor/skills/cursor-guard
```

**macOS / Linux:**

```bash
# 全局安装
cp -r node_modules/cursor-guard ~/.cursor/skills/cursor-guard

# 项目级安装
cp -r node_modules/cursor-guard .cursor/skills/cursor-guard
```

复制完成后，如果不需要保留在 `node_modules` 中，可以卸载：

```bash
npm uninstall cursor-guard
```

### 方式二：Git 克隆

```bash
# 全局安装
git clone https://github.com/zhangqiang8vipp/cursor-guard.git ~/.cursor/skills/cursor-guard

# 项目级安装
git clone https://github.com/zhangqiang8vipp/cursor-guard.git .cursor/skills/cursor-guard
```

### 方式三：手动下载

从 [GitHub Releases](https://github.com/zhangqiang8vipp/cursor-guard/releases) 下载并解压到：

```
~/.cursor/skills/cursor-guard/               # 全局
<项目根目录>/.cursor/skills/cursor-guard/      # 项目级
```

### 验证安装

安装后目录结构应如下所示：

```
.cursor/skills/cursor-guard/
├── SKILL.md                            # AI 代理指令
├── README.md
├── README.zh-CN.md
├── LICENSE
├── package.json
└── references/
    ├── lib/
    │   ├── auto-backup.js              # 备份核心 (Node.js)
    │   ├── guard-doctor.js             # 健康检查核心
    │   └── utils.js                    # 共享工具库
    ├── bin/
    │   ├── cursor-guard-backup.js      # CLI 入口：npx cursor-guard-backup
    │   └── cursor-guard-doctor.js      # CLI 入口：npx cursor-guard-doctor
    ├── auto-backup.ps1 / .sh           # 薄封装
    ├── guard-doctor.ps1 / .sh
    ├── recovery.md                     # 恢复命令模板
    ├── cursor-guard.example.json       # 示例配置
    ├── cursor-guard.schema.json        # 配置 Schema
    ├── config-reference.md             # 配置说明（英文）
    └── config-reference.zh-CN.md       # 配置说明（中文）
```

技能会在 AI 代理检测到高风险操作（文件编辑、删除、重命名）或你提到恢复相关词汇时自动激活。无需其他设置，安装即生效。

---

## 快速上手

1. **安装技能** — 用以上任意方式安装

2. **打开 Cursor** — 开始一个 Agent 对话

3. **技能自动生效** — 当 AI 代理尝试编辑文件时，会自动：
   - 写入前创建 Git 快照
   - 覆写前先读取文件
   - 危险操作前展示 diff 预览
   - 每次受保护操作后报告状态

4. **（可选）添加项目配置** — 自定义保护范围：

```bash
cp .cursor/skills/cursor-guard/references/cursor-guard.example.json .cursor-guard.json
```

5. **（可选）运行自动备份** — 在独立终端运行：

```bash
npx cursor-guard-backup --path /my/project
```

### 项目配置

编辑 `.cursor-guard.json` 定义保护哪些文件：

```json
{
  "protect": ["src/**", "lib/**", "package.json"],
  "ignore": ["node_modules/**", "dist/**"],
  "auto_backup_interval_seconds": 60,
  "secrets_patterns": [".env", ".env.*", "*.key", "*.pem"],
  "pre_restore_backup": "always",
  "retention": { "mode": "days", "days": 30 }
}
```

#### `pre_restore_backup` — 恢复前保留行为控制

| 值 | 行为 |
|----|------|
| `"always"`（默认） | 每次恢复前自动保留当前版本，无需确认。 |
| `"ask"` | 每次恢复前询问你："恢复前是否保留当前版本？(Y/n)"——由你逐次决定。 |
| `"never"` | 恢复前不保留当前版本（不推荐）。 |

无论配置如何，你始终可以在单次请求中覆盖：
- 说"不保留当前版本"可跳过保留（即使配置为 `"always"`）
- 说"先保留当前版本"可强制保留（即使配置为 `"never"`）

---

## 自动备份脚本

在使用 Cursor 时，在**单独的终端窗口**中运行。跨平台——需要 Node.js >= 18。

```bash
# 通过 npx（npm 安装后）
npx cursor-guard-backup --path /my/project
npx cursor-guard-backup --path /my/project --interval 30

# Windows PowerShell
.\references\auto-backup.ps1 -Path "D:\MyProject"

# macOS / Linux
./references/auto-backup.sh /my/project
```

脚本使用 Git 底层命令快照到 `refs/guard/auto-backup`——不会切换分支，也不会影响你的工作索引。该引用位于 `refs/heads/` 之外，`git push --all` 不会推送它。支持 `shadow` 模式用于非 Git 目录。

### 健康检查

```bash
npx cursor-guard-doctor --path /my/project

# Windows: .\references\guard-doctor.ps1 -Path "D:\MyProject"
# macOS/Linux: ./references/guard-doctor.sh /my/project
```

> **注意**：请在独立终端窗口中运行备份/检查脚本，不要在 Cursor 集成终端中运行。

---

## 恢复

出问题时，直接用自然语言告诉 AI 代理即可。

**默认行为**：执行任何恢复操作前，代理会自动保留你的当前版本，方便恢复后反悔。无需额外请求，这是默认行为。如需跳过，请明确说"不保留当前版本"或"直接覆盖恢复"。

### 按时间恢复

> "帮我恢复到5分钟前"
> "恢复到今天下午3点的状态"
> "回到昨天的版本"

### 按版本恢复

> "恢复到上一个版本"
> "回到前3个版本"
> "撤销最近两次修改"

### 指定文件恢复

> "把 src/app.py 恢复到10分钟前"
> "把 src/app.py 恢复到上一个版本"

代理会：
1. **先保留你的当前版本**（除非你明确选择跳过）
2. 搜索 Git 历史和自动备份快照
3. 列出匹配版本供你选择
4. 确认后执行恢复
5. 报告恢复前备份引用和恢复结果

如果保留当前版本失败，代理**不会**继续恢复——会等你明确确认后才会在没有安全网的情况下恢复。

### 恢复优先级

1. **Git** — `git restore`, `git reset`, `git reflog`
2. **自动备份引用** — `refs/guard/auto-backup`
3. **影子拷贝** — `.cursor-guard-backup/<时间戳>/`
4. **对话上下文** — 代理 Read 调用捕获的原始文件内容
5. **编辑器历史** — VS Code/Cursor Timeline（辅助）

详细恢复命令见 [references/recovery.md](references/recovery.md)。

---

## 触发关键词

技能在以下信号时激活：

- AI 代理的文件编辑、删除、重命名
- 恢复请求："回滚"、"误删"、"丢版本"、"改不回来"
- 按时间恢复："恢复到N分钟前"、"恢复到下午3点"、"回到昨天"
- 按版本恢复："恢复到上一个版本"、"前N个版本"、"撤销最近N次修改"
- 历史问题：Checkpoint 丢失、Timeline 不工作、保存失败

---

## 文件说明

| 文件 | 用途 |
|------|------|
| `SKILL.md` | AI 代理的主要技能指令 |
| `references/lib/auto-backup.js` | 自动备份核心逻辑 (Node.js) |
| `references/lib/guard-doctor.js` | 健康检查核心逻辑 (Node.js) |
| `references/lib/utils.js` | 共享工具库（配置、glob、git、manifest） |
| `references/bin/cursor-guard-backup.js` | CLI 入口：`npx cursor-guard-backup` |
| `references/bin/cursor-guard-doctor.js` | CLI 入口：`npx cursor-guard-doctor` |
| `references/auto-backup.ps1` / `.sh` | 薄封装（Windows / macOS+Linux） |
| `references/guard-doctor.ps1` / `.sh` | 薄封装（Windows / macOS+Linux） |
| `references/recovery.md` | 恢复命令模板 |
| `references/cursor-guard.example.json` | 示例项目配置 |
| `references/cursor-guard.schema.json` | 配置文件的 JSON Schema |
| `references/config-reference.md` | 配置字段说明（英文） |
| `references/config-reference.zh-CN.md` | 配置字段说明（中文） |

---

## 已知限制

- **二进制文件**：Git 快照可以存储二进制文件（图片、编译产物），但无法进行有意义的 diff 或部分恢复。
- **未跟踪文件**：从未提交到 Git 的文件无法从 Git 历史恢复。影子拷贝（`backup_strategy: "shadow"` 或 `"both"`）是未跟踪文件的唯一安全网。
- **并发 Agent**：如果多个 AI 代理线程同时写入同一文件，快照无法防止竞态条件。请避免并行编辑同一文件。
- **外部工具修改索引**：在自动备份运行期间，其他修改 Git 索引的工具（如 Git GUI、IDE Git 集成）可能冲突。脚本使用临时索引来最小化风险，但边缘情况仍存在。
- **Git worktree**：自动备份脚本支持 worktree 布局（`git rev-parse --git-dir`），但未在所有特殊配置下测试（如 `--separate-git-dir`）。
- **Cursor 终端干扰**：Cursor 集成终端会向 `git commit` 命令注入 `--trailer` 标志，导致 `commit-tree` 等底层命令异常。请始终在**独立的终端窗口**中运行自动备份脚本。
- **大型仓库**：对于非常大的仓库，备份循环中的 `git add -A` 可能较慢。使用 `.cursor-guard.json` 中的 `protect` 模式缩小范围。

## 环境要求

- **Node.js >= 18** — 备份与健康检查脚本的核心运行时
- **Git** — 主要备份策略（仅影子拷贝模式不需要）
- **Cursor IDE** — 需启用 Agent 模式

---

## 许可证

MIT
