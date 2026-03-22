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
- **MCP 工具调用（可选）** — 9 个标准化工具（诊断、快照、恢复、状态、看板、告警等），结构化 JSON 返回，低 token 消耗
- **自动诊断修复** — `doctor_fix` 一键修补缺失配置、未初始化 Git、gitignore 遗漏等常见问题
- **主动变更频率告警（V4）** — 自动检测异常文件变更模式并发出风险预警
- **备份健康看板（V4）** — 一次调用全面查看：策略、数量、磁盘占用、保护范围、健康状态
- **Web 仪表盘（V4.2）** — 本地只读 Web 页面 `http://127.0.0.1:3120`——健康状态、备份、恢复点、诊断、保护范围一目了然。中英双语、自动刷新、支持多项目监控
- **IDE 扩展（V4.7）** — 完整仪表盘嵌入 VSCode/Cursor/Windsurf，WebView 标签页 + 状态栏告警指示器 + 侧边栏项目树。无需打开浏览器
- **事件驱动监听（V4.9）** — `fs.watch` + 防抖替代盲轮询。备份延迟 < 500ms，空闲时零 CPU。不支持的平台自动降级为轮询
- **右键上下文菜单（V4.7.7）** — 在资源管理器/编辑器右键菜单中将文件或文件夹添加到 `protect` 或 `ignore` 列表
- **实时侧边栏（V4.9.1）** — "上次备份 Xs 前"和告警倒计时每秒跳动更新
- **删除文件智能恢复（V4.8.4）** — 恢复命令自动指向父提交（`hash~1`），避免"文件不存在"错误
- **自包含 VSIX（V4.8.1）** — MCP server 通过 esbuild 打包为单文件，IDE 扩展零 npm 依赖
- **一键热重启（V4.5.8）** — 仪表盘检测到新版本时可原地重启服务，不丢失状态
- **Shadow 增量硬链接（V4.5.4）** — 未变更文件硬链接到上次快照，节省磁盘空间和 I/O
- **强保护模式（V4.5.4）** — `always_watch: true` 让 watcher 随 MCP server 自动启动，确保零保护缺口

---

## 安装

### 方式一：npm 安装（推荐）

```bash
npm install cursor-guard
npx cursor-guard-init
```

`init` 命令一键完成：复制技能文件到 `.cursor/skills/cursor-guard/`、安装 MCP 依赖、添加 `.gitignore` 条目。

可选参数：

```bash
npx cursor-guard-init              # 项目级安装（默认）
npx cursor-guard-init --global     # 全局安装（~/.cursor/skills/）
npx cursor-guard-init --path /my/project  # 指定项目根目录
```

初始化完成后，`node_modules` 中的 npm 包已不再需要：

```bash
npm uninstall cursor-guard
```

<details>
<summary>手动安装（不使用 init 命令）</summary>

如果你更喜欢手动操作，复制文件后需要手动安装依赖：

```bash
# 复制
cp -r node_modules/cursor-guard .cursor/skills/cursor-guard

# 在 skill 目录中安装 MCP 依赖
cd .cursor/skills/cursor-guard && npm install --omit=dev && cd -

# 添加到 .gitignore，防止 node_modules 被 git 快照捕获
echo ".cursor/skills/**/node_modules/" >> .gitignore
```

</details>

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
├── SKILL.md                            # AI 代理指令（含 MCP 双路径逻辑）
├── ROADMAP.md                          # 版本演进规划书
├── README.md
├── README.zh-CN.md
├── LICENSE
├── package.json
└── references/
    ├── lib/
    │   ├── auto-backup.js              # 备份 watcher（调用 Core）
    │   ├── guard-doctor.js             # 健康检查 CLI（调用 Core）
    │   ├── utils.js                    # 共享工具库
    │   └── core/                       # V3 Core 层（纯逻辑）
    │       ├── doctor.js               # 诊断检查（含 MCP 自检）
    │       ├── doctor-fix.js           # 自动修复常见问题
    │       ├── snapshot.js             # Git 快照 + 影子拷贝
    │       ├── backups.js              # 备份列表 + 留存清理
    │       ├── restore.js              # 单文件/全项目恢复
    │       ├── status.js               # 备份系统状态
    │       ├── anomaly.js             # V4：变更频率检测
    │       └── dashboard.js           # V4：健康看板聚合
    ├── dashboard/
    │   ├── server.js                   # 仪表盘 HTTP 服务 + API
    │   └── public/                     # Web UI（HTML/CSS/JS）
    │       ├── index.html
    │       ├── style.css
    │       └── app.js
    ├── mcp/
    │   └── server.js                   # MCP Server（9 个工具）
    ├── vscode-extension/               # IDE 扩展（V4.7）
    │   ├── extension.js                # 扩展入口
    │   ├── package.json                # 扩展清单
    │   ├── lib/                        # 模块（dashboard-manager、webview、status-bar、tree-view、poller）
    │   └── media/                      # 图标（SVG + PNG）
    ├── bin/
    │   ├── cursor-guard-backup.js      # CLI：npx cursor-guard-backup
    │   ├── cursor-guard-doctor.js      # CLI：npx cursor-guard-doctor
    │   └── cursor-guard-mcp (server.js)# CLI：npx cursor-guard-mcp
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

5. **（可选）启用 MCP 工具调用** — 在 `.cursor/mcp.json` 中添加：

```jsonc
{
  "mcpServers": {
    "cursor-guard": {
      "command": "node",
      "args": ["<skill-path>/references/mcp/server.js"]
    }
  }
}
```

启用后 AI 代理可直接调用 9 个结构化工具（诊断、快照、恢复、看板、告警等），无需拼接 shell 命令，更快更省 token。不启用也完全不影响使用。

6. **（可选）运行自动备份** — 在独立终端运行：

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

这点很重要：

- 命令可以在任何目录执行
- 但 `--path` 必须指向你要保护的项目根目录
- 如果你当前已经在项目根目录，可以写 `--path .`
- 如果你当前不在项目根目录，就不要写 `--path .`，要写完整路径

```bash
# 如果当前就在项目根目录
npx cursor-guard-backup --path .

# 如果当前不在项目根目录
npx cursor-guard-backup --path /my/project
npx cursor-guard-backup --path /my/project --interval 30

# Windows PowerShell
.\references\auto-backup.ps1 -Path "D:\MyProject"

# macOS / Linux
./references/auto-backup.sh /my/project
```

错误示例：

```bash
# 你当前在别的目录
# 这时 --path . 保护的是当前目录，不是你真正想保护的项目
npx cursor-guard-backup --path .
```

脚本使用 Git 底层命令快照到 `refs/guard/auto-backup`——不会切换分支，也不会影响你的工作索引。该引用位于 `refs/heads/` 之外，`git push --all` 不会推送它。支持 `shadow` 模式用于非 Git 目录。

### 健康检查

```bash
npx cursor-guard-doctor --path /my/project

# Windows: .\references\guard-doctor.ps1 -Path "D:\MyProject"
# macOS/Linux: ./references/guard-doctor.sh /my/project
```

> **注意**：请在独立终端窗口中运行备份/检查脚本，不要在 Cursor 集成终端中运行。

### Web 仪表盘

本地只读 Web 页面，一页查看备份健康状态、恢复点、保护范围和诊断结果。

```bash
# 监控单个项目
npx cursor-guard-dashboard --path /my/project

# 监控多个项目
npx cursor-guard-dashboard --path /project-a --path /project-b

# 自定义端口（默认 3120）
npx cursor-guard-dashboard --path /my/project --port 8080

# Windows PowerShell（从 skill 目录运行）
node references\dashboard\server.js --path "D:\MyProject"
```

然后在浏览器打开 `http://127.0.0.1:3120`。也可以使用 **IDE 扩展**（见下方）将仪表盘直接嵌入编辑器。

特性：

- **只读** — 不执行任何写操作，随时可以安全运行
- **中英双语** — zh-CN / en-US，自动检测系统语言，右上角手动切换
- **自动刷新** — 每 15 秒拉取数据，支持手动刷新按钮
- **多项目** — 传多个 `--path` 参数可从一个页面监控多个项目
- **4 个区块**：总览（健康状态 + 守护进程 + 告警 + 最近备份）、备份与恢复（恢复点表格，按类型过滤）、保护范围（protect/ignore 规则）、诊断（doctor 检查项）
- **2 个详情抽屉**：恢复点抽屉（预览 JSON、复制引用/hash）、诊断抽屉（完整检查列表，WARN/FAIL 默认展开）
- **安全性** — 仅绑定 `127.0.0.1`（不暴露到局域网）、API 使用项目 ID 而非原始路径、静态文件服务严格限制在 `public/` 目录
- **零额外依赖** — 使用 Node.js 内置 `http` 模块 + cursor-guard 已有核心模块

### IDE 扩展（VSCode / Cursor / Windsurf）

将完整仪表盘直接嵌入 IDE 内部，无需打开浏览器。

#### 方式 A：VSIX 独立安装（推荐，无需 npm）

```bash
# 构建独立 VSIX 包
cd references/vscode-extension
node build-vsix.js
cd dist
npx vsce package

# 安装生成的 .vsix 文件（或从 GitHub Releases 下载）
code --install-extension cursor-guard-ide-4.9.1.vsix
```

首次激活时，扩展自动：
- 将 `SKILL.md` 安装到 IDE 的 skills 目录
- 将 MCP Server 注册到 IDE 的 `mcp.json`
- 创建默认 `.cursor-guard.json` 配置（如不存在）

#### 方式 B：从源码安装（开发模式）

```bash
cd references/vscode-extension
code --install-extension .
```

功能：

- **WebView 仪表盘** — 完整仪表盘作为编辑器标签页嵌入，与浏览器版本完全一致
- **状态栏指示器** — 实时显示 `Guard: OK`（绿色）或 `Guard: 22 files!`（黄色告警）
- **侧边栏 TreeView** — Activity Bar 图标，树形展示项目列表、Watcher 状态、备份统计、告警、健康评估
- **可视化图表侧边栏** — 备份时间实时跳动、告警倒计时、保护范围、Quick Stats
- **命令面板** — `Open Dashboard`、`Snapshot Now`、`Start/Stop Watcher`、`Quick Restore`、`Doctor`、`Refresh`
- **右键菜单** — 在资源管理器/编辑器右键菜单中将文件或文件夹添加到 `protect` 或 `ignore`
- **事件驱动刷新** — `FileSystemWatcher` 监听文件变化推送 UI 更新（< 1.5s 延迟），30s 心跳兜底
- **自动配置（V4.7.5）** — 首次运行自动检测 IDE 类型、安装 Skill、注册 MCP、创建配置
- **自包含（V4.8.1）** — MCP server 通过 esbuild 打包，零 npm 依赖
- **多项目** — 热加载所有包含 `.cursor-guard.json` 的工作区文件夹
- **兼容性** — 支持 VSCode ^1.74.0、Cursor、Windsurf、Trae 及所有基于 VSCode 的 IDE

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
- 健康检查："guard doctor"、"自检"、"诊断guard"、"MCP 能用吗"
- 自动修复："guard fix"、"修复配置"、"自动修复"
- 备份状态："备份状态"、"guard status"、"watcher 在跑吗"
- 健康看板："看板"、"dashboard"、"备份总览"、"健康状态"
- 告警检查："有告警吗"、"变更异常"、"风险提示"

---

## 文件说明

| 文件 | 用途 |
|------|------|
| `SKILL.md` | AI 代理的主要技能指令（含 MCP 双路径逻辑） |
| `ROADMAP.md` | 版本演进规划书（V2-V7） |
| `references/lib/core/` | Core 层：8 个纯逻辑模块（doctor / doctor-fix / snapshot / backups / restore / status / anomaly / dashboard） |
| `references/mcp/server.js` | MCP Server：9 个标准化工具（可选） |
| `references/lib/auto-backup.js` | 自动备份 watcher（调用 Core） |
| `references/lib/guard-doctor.js` | 健康检查 CLI 壳（调用 Core） |
| `references/lib/utils.js` | 共享工具库（配置、glob、git、manifest） |
| `references/bin/cursor-guard-backup.js` | CLI 入口：`npx cursor-guard-backup` |
| `references/bin/cursor-guard-doctor.js` | CLI 入口：`npx cursor-guard-doctor` |
| `references/dashboard/server.js` | 仪表盘 HTTP 服务 + REST API |
| `references/dashboard/public/` | 仪表盘 Web UI（index.html、style.css、app.js） |
| `references/vscode-extension/` | IDE 扩展：WebView 仪表盘、状态栏、侧边栏树、命令面板 |
| `references/auto-backup.ps1` / `.sh` | 薄封装（Windows / macOS+Linux） |
| `references/guard-doctor.ps1` / `.sh` | 薄封装（Windows / macOS+Linux） |
| `references/recovery.md` | 恢复命令模板 |
| `references/cursor-guard.example.json` | 示例项目配置 |
| `references/cursor-guard.schema.json` | 配置文件的 JSON Schema |
| `references/config-reference.md` | 配置字段说明（英文） |
| `references/config-reference.zh-CN.md` | 配置字段说明（中文） |

---

## 更新日志

### v4.9.0–v4.9.1 — 事件驱动架构

- **架构重构**：Watcher（`auto-backup.js`）从 `while+sleep` 轮询重写为 `fs.watch` 事件驱动 + 500ms 防抖。空闲时零 CPU，备份延迟 < 500ms
- **自动降级**：`fs.watch` 不可用时自动回退到轮询模式
- **配置即时响应**：`.cursor-guard.json` 变化通过 `fs.watch` 事件直接触发热加载（不再等待 10 个轮询周期）
- **IDE FileSystemWatcher**：扩展使用 VSCode 内置 `createFileSystemWatcher` 推送文件变化事件（1.5s 防抖）
- **Poller 心跳**：从 5s 固定轮询改为 30s 心跳；UI 更新由事件驱动
- **实时侧边栏计时**："上次备份 Xs 前"每秒跳动更新（v4.9.1）

### v4.8.0–v4.8.5 — 打包修复、Doctor 优化、恢复 UX

- **修复**：MCP server 通过 esbuild 打包为单个自包含文件——彻底解决传递依赖缺失问题（`zod-to-json-schema`、`ajv` 等）（v4.8.1）
- **修复**：`doctor` MCP 检查不再在 `.cursor/mcp.json` 已配置 cursor-guard 时误报 WARN（v4.8.2）
- **修复**：Skill 目录 `references/` 每次激活时自动创建 junction 链接到扩展运行时文件（v4.8.2）
- **修复**：删除文件的恢复命令自动指向父提交（`hash~1`），避免"文件不存在"错误。按钮显示"恢复删除前"橙色样式（v4.8.4）
- **修复**：`protect` 范围外的文件不再在变更摘要中被误标为"删除"（v4.8.5）
- **优化**：VSIX 包从 3.18 MB 缩减至 1.27 MB

### v4.7.6–v4.7.9 — 侧边栏重设计、右键菜单、保护范围

- **新功能**：右键上下文菜单——在资源管理器/编辑器右键添加文件到 `protect` 或 `ignore`，含模式选择器（v4.7.7）
- **新功能**：侧边栏保护范围卡片——显示受保护/排除文件数、protect/ignore 模式列表（v4.7.8）
- **新功能**：告警倒计时每秒实时跳动（v4.7.8）
- **修复**：Open Dashboard CORS/CSP 问题——添加 CORS 头、放宽 CSP、WebView 失败时回退到浏览器（v4.7.8）
- **修复**：`protect` 模式改为严格匹配（仅完整路径，不回退到 basename）（v4.7.8）
- **重设计**：侧边栏仪表盘简化——单一状态指示器、2×2 操作按钮网格、精简 Quick Stats（v4.7.6）

### v4.7.5 — VSIX 独立打包 + 自动配置

- **功能**：`build-vsix.js` 将所有运行时依赖打包为独立 VSIX —— 无需 npm 安装
- **功能**：`auto-setup.js` 首次激活自动检测 IDE 类型（Cursor/Windsurf/Trae/VSCode），安装 SKILL.md，注册 MCP Server，创建默认配置
- **修复**：`dashboard/server.js` PKG_PATH 改为动态查找（支持 skill 目录、VSIX 扁平、guard-version.json 回退）
- **增强**：新增 `onStartupFinished` 激活事件，确保无 `.cursor-guard.json` 的项目也能触发自动配置

### v4.7.0–v4.7.4 — IDE 扩展 + Bug 修复

- **功能**：VSCode/Cursor/Windsurf 扩展 — 完整仪表盘作为 WebView 标签页嵌入，状态栏告警指示器，侧边栏 TreeView 项目状态，命令面板集成
- **功能**：可视化图表侧边栏 — 进度条、状态徽章、备份时间线（v4.7.3）
- **修复**：智能路径解析器 `paths.js` 支持 VSIX/skill/npm 多种安装环境（v4.7.4）
- **修复**：WebView CSP、Watcher 无限重启、快照状态处理（v4.7.1–v4.7.4）
- **适配**：`fetchJson()` 支持 `__GUARD_BASE_URL__` 用于 WebView；`copyText()` 在 IDE 中通过 `postMessage` 桥接到 `vscode.env.clipboard`

### v4.6.x — 告警 UX 大优化

- **修复**：告警倒计时现在每秒更新（之前仅在 15 秒页面刷新时更新）
- **修复**：告警文件详情弹窗支持每文件「复制恢复命令」按钮
- **修复**：备份过时阈值改为 `max(interval*10, 300)` 秒（至少 5 分钟）；仅在 watcher 运行时检查
- **功能**：告警历史始终可访问（无论是否有活跃告警），使用 `localStorage` 持久化
- **功能**：告警历史作为弹窗展示，支持嵌套查看文件详情

### v4.5.x — 保护加固

- **修复**：Shadow 硬链接顺序 bug（上次快照总是空目录）
- **修复**：`changedFiles` 现在过滤忽略路径
- **功能**：告警结构化文件列表 — 每文件路径、操作、+/- 行数，支持排序
- **功能**：Shadow 增量硬链接 — 未变更文件链接到上次快照，节省磁盘空间
- **功能**：`always_watch: true` 配置 — watcher 随 MCP server 自动启动，零保护缺口
- **功能**：Dashboard 服务单例 — 多项目共享一个端口，热加载新项目
- **功能**：Dashboard 版本检测 + 一键热重启（`/api/restart` 端点）
- **功能**：文件详情弹窗 + 每文件恢复命令复制按钮
- **功能**：`cursor-guard-init` 自动创建 `.cursor-guard.json`；支持 `backup_interval_seconds` 别名
- **许可证**：从 MIT 变更为 BSL 1.1（源码可见，商业使用需作者授权）

### v4.4.0 — V4 收官版

- **修复**：首次快照现在会生成 "Added N: file1, file2, ..." 摘要，而不是空白——之前第一次备份因为没有 parent tree 对比所以 summary 始终为空
- **功能**：Watcher `--dashboard` 参数——`npx cursor-guard-backup --path <dir> --dashboard` 启动时同时启动 Web 仪表盘，单进程完成监控+查看。可选端口：`--dashboard 4000`，端口被占自动递增
- **功能**：Doctor 新增 "Git retention" 检查——当 Git 备份 commit 数超过 500 且 `git_retention.enabled` 为 `false` 时发出 WARN，引导用户开启自动清理防止 ref 无限增长
- **功能**：Doctor 新增 "Backup integrity" 检查——通过 `git cat-file -t` 验证最近一次 auto-backup commit 的 tree 对象是否可达，尽早发现静默损坏
- **改进**：`cursor-guard-init` 现在检测已有 `.cursor-guard.json`，显示升级提示而非静默覆盖
- **改进**：Dashboard server 重构，导出 `startDashboardServer()` 供嵌入其他进程使用

### v4.3.5

- **修复**：备份摘要（Summary）现使用增量 `diff-tree` 替代 `git status --porcelain`——之前 summary 始终显示自 HEAD 以来的累计差异，现在正确显示自上次 auto-backup 以来的增量变化
- **改进**：仪表盘备份表格"变更"列改为分层堆叠布局（文件数 + 触发方式 / 意图 / 明细分行显示），可读性更好
- **改进**：配色优化——背景层级差距加大，状态色柔和（绿 `#4ade80`、琥珀 `#f59e0b`、红 `#ef4444`），品牌蓝加深 `#3b82f6`，文字层级对比更清晰

### v4.3.4

- **改进**：日志轮转——`backup.log` 超过 1MB 自动轮转，保留最近 3 个旧文件。watcher 启动时和每 100 次写入时检查
- **改进**：Watcher 单实例保护——锁文件新增启动时间戳；超过 24 小时的锁即使 PID 检查不可靠（Windows）也自动清理
- **改进**：`previewProjectRestore` 分组输出——受保护路径（`.cursor/`、`.gitignore`、`.cursor-guard.json`）汇总为 `protectedPaths: { count: N }`，不再逐一列出数千个文件，大幅降低 token 消耗
- **改进**：SKILL.md 硬规则 #15——升级后 Agent 必须提交 skill 文件，确保 `restore_project` 的 HEAD 保护机制生效

### v4.3.3

- **功能**：快照意图上下文——`snapshot_now` 新增 `intent`（操作意图）、`agent`（AI 模型）、`session`（会话 ID）参数，作为 Git commit trailer 存储，形成按操作事件的审计链
- **功能**：仪表盘备份表格显示意图徽章，恢复点抽屉完整展示 intent/agent/session 字段
- **改进**：`parseCommitTrailers` 重构为数据驱动映射表，支持全部 6 个 trailer 字段
- **改进**：SKILL.md 更新指引，要求 AI agent 在调用 `snapshot_now` 时传入 `intent` 描述即将执行的操作

### v4.3.2

- **修复**：`cursor-guard-init` 现在会将根目录 `node_modules/` 加入 `.gitignore`——防止 `npm install cursor-guard --save-dev` 后 `git add -A` 扫描数千个依赖文件导致极度缓慢
- **改进**：Doctor "MCP version" 版本不一致警告现在包含重载快捷键提示（`Ctrl+Shift+P -> "Developer: Reload Window"`），方便快速操作

### v4.3.1

- **修复**：`restore_project` 现在保护 `.gitignore`——加入 `GUARD_CONFIGS`，恢复后从 HEAD 还原，防止 `.gitignore` 丢失导致全量扫描（2500+ 文件）
- **修复**：`cursor-guard-index.lock` 清理——`createGitSnapshot` 在入口和 `finally` 块中清除过期 `.lock` 文件，防止锁文件残留阻塞后续操作
- **改进**：自动备份 summary 现按 `protect`/`ignore` 模式过滤，排除 `.cursor/skills/` 等非保护文件
- **改进**：summary 格式从扁平的 `M file1, A file2` 改为分类格式 `修改 3: a.js; 新增 1: b.js`，支持中英双语
- **改进**：手动快照的 `message`（来自 `snapshot_now`）现显示在仪表盘备份表格和恢复点抽屉中
- **改进**：SKILL.md 新增最佳实践指引，建议 AI agent 在调用 `snapshot_now` 时传入描述性 `message`

### v4.3.0

- **功能**：备份上下文元数据——Git commit 消息使用结构化 trailer（`Files-Changed`、`Summary`、`Trigger`）
- **功能**：`listBackups` 解析 commit trailer，返回 `filesChanged`、`summary`、`trigger` 字段
- **功能**：仪表盘备份表格新增"变更"列；恢复点抽屉展示触发方式、变更文件数、变更摘要

### v4.2.2

- **修复**：`restore_project` 恢复时保护 `.cursor-guard.json`（防止配置丢失）
- **修复**：恢复后 HEAD 恢复循环扩展为同时还原 `.cursor/` 和 `.cursor-guard.json`
- **改进**：`cursor-guard-init` 在 Git 仓库中安装后提醒用户执行 `git commit`

### v4.2.1

- **修复**：`t()` 函数改用 `replaceAll` 替换 i18n 占位符
- **修复**：移除仪表盘 server 中未使用的 `loadActiveAlert` 导入
- **修复**：仪表盘过滤栏补充 `git-snapshot` 类型选项
- **修复**：`detail.mcp_no_sdk` i18n 字符串中 `&&` 替换为 `;`，确保跨平台兼容
- **修复**：`doctor.js` 中 `sdkCandidates` 去重

### v4.2.0

- **功能**：Web 仪表盘——本地只读 UI，健康总览、备份表格、恢复点抽屉、诊断、保护范围
- **功能**：中英双语（zh-CN / en-US），完整 i18n 覆盖含 doctor 检查项、健康问题、告警消息
- **功能**：多项目支持——CLI `--path` 参数 + 前端项目选择器

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

## 支持 / 捐赠

这是一个独立开发者维护的开源项目。如果 Cursor Guard 拯救过你的代码或节省了你的时间，欢迎请我喝杯咖啡 :)

| 微信支付 | 支付宝 |
|:---:|:---:|
| <img src="media/wechat-pay.png" alt="微信支付" width="200"> | <img src="media/alipay.jpg" alt="支付宝" width="200"> |

---

## 许可证

[BSL 1.1（商业源代码许可证）](LICENSE) — 源代码自由查看、修改和非商业使用。商业使用需获得作者授权。2056-03-22 之后自动转为 Apache 2.0。
