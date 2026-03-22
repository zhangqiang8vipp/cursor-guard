# Cursor Guard — 版本演进规划书

> 本文档描述 cursor-guard 从 V2 到 V7 的长期演进方向。
> 每一代向下兼容，低版本功能永远不废弃。
>
> **当前版本**：`V4.5.4`（V4 最终版）  
> **文档状态**：`V2` ~ `V4.5.4` 已完成交付（含 V5 intent/audit 基础），`V5` 主体规划中

## 阅读导航

- `V2-V3`：先看当前可用能力，以及下一步最现实的演进
- `V4-V5`：再看智能化与多 Agent 协调的中期方向
- `V6-V7`：最后看协议、治理与终局形态

---

## 一句话看全局

| 版本 | 关键词 | 核心组成 | 一句话 |
|---|---|---|---|
| `V2` | 能用 | Skill + Script | "AI 弄丢代码能恢复" |
| `V3` | 更稳 | + Core 抽取 + 可选 MCP | "恢复操作更标准、更省 token" |
| `V4` | 更聪明 | + 主动检测 + 可观测 + Web 仪表盘 + Intent + 增量摘要 + 安全硬化 | "cursor-guard 会主动提醒你，能看到为什么备份、改了什么" ✅ |
| `V5` | 成闭环 | + 变更控制层 | "AI 代码变更可预防、可追溯、可按事件恢复"（intent 基础已在 V4.3 落地） |
| `V6` | 成标准 | + 开放协议 + 团队工作流 | "把 AI 代码变更安全做成跨工具标准" |
| `V7` | 可证明 | + 可验证信任 + 治理层 | "能证明安全流程被执行了" |

---

## 这个项目不只是"又一个备份工具"

市场上已有针对 AI 编码的快照/回滚工具（VS Code 扩展、平台内置 checkpoint 等），它们覆盖了"工具级保护"这一层。

cursor-guard 的差异化不在工具层的功能多少，而在**完整的四阶段终局设计**：

| 阶段 | 对应版本 | 定义 | 市场现状 |
|---|---|---|---|
| 阶段一 | `V2-V3` | 工具 | 市场已有竞品，cursor-guard 在此做到够好 |
| 阶段二 | `V4-V5` | 平台 | 少数大厂在内置，但不开放 |
| 阶段三 | `V6` | 协议 | 几乎空白，无人系统化定义 |
| 阶段四 | `V7` | 可验证治理 | 完全空白 |

工具层是入口，协议层和可验证治理层才是护城河。
V2-V3 的目标是让用户"离不开"，V6-V7 的目标是让行业"绕不开"。

---

## 一条贯穿所有版本的原则

> **MCP / 智能层 / 协调层 / 生态层 / 治理层都是可选增强，Skill + Script 基础路径永远可用。**

用户不装 MCP、不开智能检测、不用多 Agent 协调——cursor-guard 也能正常保护代码。
每一层新能力都是"有则更好，无则不影响"。

---

## 这套东西由什么组成

| 层 / 组件 | 当前状态 | 负责什么 | 是否必需 |
|---|---|---|---|
| `SKILL.md` | `V2` 已有，`V3.1` 增加 MCP 双路径 | 规定 Agent 的安全行为：先读后写、恢复前先保留、优先走哪条恢复路径 | 是 |
| `auto-backup.js` | `V2` 已有，`V3.0` 迁移至 Core | 后台定时备份，持续留下本地恢复点 | 是 |
| `guard-doctor.js` | `V2` 已有，`V3.0` 迁移至 Core | 检查环境、配置、Git 状态、备份可用性 | 是 |
| `Node Core` | `V3.0` ✅ 已完成 | 6 个模块：doctor / doctor-fix / snapshot / backups / restore / status | 否 |
| `MCP Server` | `V3.1-V4.0` ✅ 已完成 | 9 个工具，Agent 标准调用入口，结构化 JSON 返回 | 否 |
| `智能提醒 / 可观测` | `V4.0` ✅ 已完成 | 主动发现风险、汇总健康状态（anomaly + dashboard） | 否 |
| `Web 仪表盘` | `V4.2` ✅ 已完成 | 本地只读 Web UI，备份/恢复点/诊断/保护范围，中英双语 | 否 |
| `备份上下文 + Intent` | `V4.3` ✅ 已完成 | 结构化 commit trailer（Files-Changed/Summary/Trigger/Intent/Agent/Session），增量 diff-tree 真实摘要，仪表盘可追溯 | 否 |
| `变更控制层` | `V5` 规划（intent 基础已在 V4.3 落地） | 覆盖编辑意图、冲突告警、影响半径、审计事件、按事件恢复 | 否 |
| `开放协议 / 团队工作流` | `V6` 规划 | 把变更控制能力提炼成跨工具协议、适配器和 CI 查询入口 | 否 |
| `治理 / 可验证层` | `V7` 规划 | 让“是否走过安全流程”变成可以证明、可以审计、可以验证的事实 | 否 |

一句话概括：

- `V2` 先把安全网立住
- `V3-V5` 逐步把入口、体验、协作和变更闭环做强
- `V6-V7` 再把这套东西上升为协议与治理能力

---

## 版本是怎么推进的

cursor-guard 的版本推进，不是“想到什么就加什么功能”，而是按一条固定顺序推进：

1. **先把当前版本做稳**
2. **再抽象出可复用核心**
3. **再增加更好的调用入口**
4. **再扩展到更复杂的场景**
5. **最后再上升到协议与治理**

这意味着：

- `V2` 先解决“能不能恢复”
- `V3` 再解决“恢复是否足够稳、足够省、足够标准”
- `V4-V5` 才去解决“复杂场景下是否仍然安全”
- `V6-V7` 最后回答“这套规则能不能成为行业共识、能不能被证明执行过”

### 版本推进的硬规则

| 规则 | 含义 |
|---|---|
| 先稳后进 | 当前版本没有站稳，不推进下一代 |
| 先抽 Core 再扩入口 | 不在 CLI / MCP / IDE 适配器里复制逻辑 |
| 可选增强不替代基础路径 | 新能力只能增强，不能让基础可用性变差 |
| 不为远期版本提前妥协 | 不为了 V6/V7 提前把 V2/V3 做复杂 |
| 版本靠“条件满足”推进 | 不是按时间表硬推，而是按是否达成衡量标准推进 |

### 你可以把它理解成一条演进链

```text
V2：先有安全网
  ↓
V3：把安全网做稳、做标准
  ↓
V4：让系统会主动提醒风险
  ↓
V5：让 AI 代码变更形成可控闭环
  ↓
V6：把这套闭环提炼成开放协议和团队工作流
  ↓
V7：让“是否真的安全”变得可验证
```

---

## cursor-guard 如何保证安全

cursor-guard 的安全，不靠“模型自己小心一点”，而是靠**规则 + 本地备份机制 + 恢复路径 + 诊断能力**共同保证。

### 长期不变的安全规则

| 规则 | 含义 |
|---|---|
| 写前先留快照 | 在高风险改动前，先留下可恢复的版本 |
| 恢复前默认保留当前版本 | 回到旧版本前，先把现在这一版留住 |
| 本地优先 | 保护点默认保存在本地，不依赖远程服务 |
| 不自动 push | 不把备份自动推到 GitHub / 远程仓库 |
| 不污染用户分支和暂存区 | 安全机制不能打乱用户自己的 Git 节奏 |
| 恢复必须有人确认 | 不做无人确认的自动恢复 |
| 多路径恢复 | Git ref、shadow copy、上下文线索彼此兜底 |
| 增强层可选 | 就算没配 MCP、没开智能层，也必须能正常保护代码 |

### 这些规则是怎么落地的

| 安全目标 | 落地方式 | 用户得到什么 |
|---|---|---|
| 写前可回退 | `refs/guard/snapshot` 等本地引用路径保存写前状态 | AI 改坏代码时能退回到改之前 |
| 持续有后手 | `refs/guard/auto-backup` 或 `.cursor-guard-backup/` 持续记录恢复点 | 不用等出事才临时补救 |
| 恢复不丢当前版本 | `refs/guard/pre-restore/*` 在恢复前先保留当前状态 | 回滚后还能回到“回滚前” |
| Git 仓库安全 | 使用 guard refs、临时 index、shadow copy 等机制 | 不污染主分支，不把备份混进正常提交 |
| 非 Git 目录也能自救 | shadow copy 作为兜底路径 | 即使没 Git 也能保命 |
| 环境问题能尽早暴露 | `guard-doctor` 检查配置、Git、ignore、备份状态 | 出问题前先发现，而不是出事后才知道 |
| 高风险操作可解释 | SKILL.md 规定恢复顺序、确认规则、预览优先 | Agent 行为不是临场发挥，而是按规则执行 |

### 安全是分层保证的

| 层 | 作用 |
|---|---|
| `Skill` 层 | 约束 Agent：什么时候该快照、什么时候该确认、恢复优先级是什么 |
| `Script / CLI` 层 | 真正执行本地备份、自检和恢复动作 |
| `Core / MCP` 层 | 让能力调用更稳定、更标准，减少模型自由发挥 |
| `协议 / 治理` 层 | 让这套安全做法可以复用、可以验证、可以被别人实现 |

所以，cursor-guard 的安全逻辑不是一句“请谨慎操作”，而是一套明确的产品底线：

- **先留后改**
- **先保留再恢复**
- **默认本地，不自动上云**
- **默认可解释，不靠黑盒**
- **默认可降级，不让增强层变成依赖**

---

## 兼容性承诺

以下接口和格式在**当前主版本周期内**保持语义稳定：

| 稳定项 | 当前已有 | 承诺 |
|---|---|---|
| `.cursor-guard.json` | V2 全部字段 | 新版本只新增字段，不删除或改变现有字段语义 |
| `refs/guard/*` 已有路径 | `refs/guard/snapshot`、`refs/guard/auto-backup`、`refs/guard/pre-restore/*` | 这些路径和语义不变 |
| `refs/guard/*` 未来路径 | （暂无） | 新版本可能在 `refs/guard/` 下新增子路径（如 `refs/guard/pre-edit/*`、`refs/guard/audit/*`），新增不影响已有路径 |
| `.cursor-guard-backup/` | 时间戳目录 `YYYYMMDD_HHMMSS` | 目录结构和命名格式不变 |
| `cursor-guard-backup` CLI | `--path`、`--interval` | 命令名和核心参数不变 |
| `cursor-guard-doctor` CLI | `--path` | 命令名和核心参数不变 |
| SKILL.md 触发规则 | 中英文触发关键词 | 现有关键词持续有效 |

**新版本可以新增字段、新增命令、新增引用路径，但不破坏已有的。**

如果未来某个主版本确实需要调整已有接口的语义（例如合并冗余字段），会遵循 deprecation 流程：**提前一个主版本标记废弃 → 新旧并存至少一个版本周期 → 下一个主版本移除旧接口**。不会在小版本中做破坏性变更。

升级就是"多了新能力"，不是"要改配置"。

---

## V2 — Skill + Script（当前版本）

| 项目 | 内容 |
|---|---|
| 状态 | 已发布 ✅ |
| 定位 | 让 Cursor AI 代理在编辑代码时有一张安全网。 |

### 架构

```
用户 → Cursor Agent
         ↓
       SKILL.md（规则层）
         ↓
       Agent 拼 shell / git 命令执行
         ↓
       auto-backup.js（后台 watcher）
       guard-doctor.js（诊断 CLI）
       utils.js（工具库）
         ↓
       Git refs + .cursor-guard-backup/
```

### 能力

| 能力 | 实现 |
|---|---|
| 写前快照 | Agent 按 SKILL.md 拼 git plumbing 命令 |
| 自动备份 | `auto-backup.js` 后台定时脚本 |
| 恢复 | Agent 拼 `git log` / `git restore` / shadow copy |
| 诊断 | `guard-doctor.js` CLI |
| 配置 | `.cursor-guard.json` |
| 跨平台 | `.ps1` + `.sh` + Node CLI（`npx`） |

### 已知局限

- Agent 恢复流程 token 消耗高（拼命令 → 读输出 → 判断 → 重试）
- 操作稳定性取决于模型当轮的命令生成质量
- 没有结构化工具调用入口
- 核心逻辑与 CLI 输出耦合（`console.log` + ANSI 色彩直出）

### V2 在后续版本中的定位

**永远保留。** 即使用户升级到 V7，只要不配置任何增强层，系统自动降级到 V2 路径。

### 进入 V3 的衡量标准

- V2.x 在真实项目中稳定运行，无重大恢复失败报告
- 用户反馈中"恢复流程不稳定"或"token 消耗高"成为主要痛点
- 核心逻辑（备份/恢复/诊断）的单元测试覆盖率达到基本可信水平

---

## V3 — Node Core + 可选 MCP

| 项目 | 内容 |
|---|---|
| 状态 | ✅ 已完成（V3.0-V3.4 全部交付） |
| 定位 | 不改变用户体验，让 Agent 的调用更稳、更省、更标准。Core 的设计目标不仅是服务 MCP，而是为未来所有入口（CLI / MCP / IDE 扩展 / 第三方适配器）提供统一的逻辑层。 |

### 核心变化

1. **从现有代码中抽取 Node Core 层**——纯逻辑、结构化返回、不做任何 `console.log`
2. **新增 MCP Server 作为可选入口**——给 Agent 一个低歧义的工具调用接口
3. **保留全部现有 CLI / 脚本**——改为调用 Core 层后格式化输出

### 架构

```
┌─ Node Core（纯逻辑层）──────────────────────┐
│  core/doctor.js    → { checks, summary }    │
│  core/backups.js   → { candidates[] }       │
│  core/snapshot.js  → { ref, strategy }      │
│  core/restore.js   → { status, pre_ref }    │
└──────────────────────────────────────────────┘
        ↑                    ↑                ↑
  CLI / 脚本入口        MCP Server        auto-backup
  （现有，调 Core）    （新增，调 Core）    （现有，调 Core）

SKILL.md:
  有 MCP → 优先走 MCP
  没 MCP → 走 CLI / shell（与 V2 一致）
```

### V3 拆为两步发布

#### V3.0 — Core 抽取（最关键，独立发布）✅ 已完成

这是 V3 全部工作的地基，也是整个项目后续演进的基础。Core 做不好，MCP、协议、生态都走不动。

| 现有文件 | 抽取到 | 变化 |
|---|---|---|
| `guard-doctor.js` | `core/doctor.js` | 返回 `{ checks[], summary }` 而非 `console.log` |
| `auto-backup.js` 中的备份逻辑 | `core/backups.js` + `core/snapshot.js` | 纯函数，返回结构化结果 |
| `auto-backup.js` 中的恢复逻辑 | `core/restore.js` | 同上 |
| `utils.js` | 保持不动 | 继续作为底层工具库 |
| 现有 CLI 入口 | 改为调用 Core → 格式化输出 | 薄壳 |

Core 设计原则：
- 每个函数接收明确参数，返回 JSON-serializable 对象
- 不做 I/O 格式化（不打印、不着色）
- 错误通过返回值传达，不抛到调用层
- 所有函数可独立单元测试
- API 设计面向"被任意入口调用"，不绑定特定消费者

**V3.0 的交付标志**：Core 层抽取完成，现有 CLI 和 watcher 全部迁移到调用 Core，所有现有测试通过，行为与 V2 完全一致。（已达成：utils 32 + core 40 + MCP 11 = 83 测试全过）

#### V3.1 — MCP Server 首版（在 Core 稳定后发布）✅ 已完成

| 工具 | 输入 | 输出 | 风险 |
|---|---|---|---|
| `doctor` | `path` | 环境 / 配置 / Git / 备份状态 | 低（只读） |
| `list_backups` | `path`, `file?`, `before?`, `limit?` | 恢复点列表 | 低（只读） |
| `snapshot_now` | `path`, `scope?`, `strategy?` | 快照引用 | 低（只创建） |
| `restore_file` | `path`, `file`, `source`, `preserve_current?` | 恢复结果 + pre-restore ref | 中 |
| `restore_project` | `path`, `source`, `preview` | 影响范围 / diff 摘要 | **首版仅 preview=true** |

`restore_project` 首版只返回预览，不执行。实际恢复走 `restore_file` 逐文件操作。

SKILL.md 同步更新：增加 MCP 检测与双路径逻辑。

### V3.x 增量（全部已完成 ✅）

| 版本 | 新增 | 状态 |
|---|---|---|
| V3.2 | `restore_project` 开放执行模式；`doctor_fix` 工具（自动修补常见配置问题） | ✅ |
| V3.3 | `backup_status` 工具（watcher 状态、最近备份时间、策略、锁文件） | ✅ |
| V3.4 | MCP 自检——doctor 输出中加 "MCP server status" 检查项 | ✅ |

### V3 不做的事

- 不做 daemon 管理（MCP 控制 watcher 启停）
- 不做远程同步
- 不做 Web UI
- 不引入 MCP SDK 以外的重量级依赖

### 依赖策略

V3.1 引入 `@modelcontextprotocol/sdk` 作为唯一新增外部依赖。Core 层（V3.0）保持零依赖。
选择官方 SDK 而非自行实现 stdio 协议，原因是 MCP 规范仍在快速演进，自实现容易落后。

### V3 的交付目标

V3 完成后，cursor-guard 应该在个人开发者场景中做到：快照零感知、恢复一键完成、跨平台体验一致、token 消耗肉眼可见下降。这是后续所有版本的用户基础——工具层做不到极致，协议层就没人听。

### 用户话术

- **不装 MCP**：cursor-guard 也能正常工作，和现在一样。
- **装了 MCP**：Agent 调用更稳、更快、更省上下文，但不是必需。

### 进入 V4 的衡量标准

- V3 Core API 在至少一个完整版本周期内无破坏性变更
- MCP 工具调用成功率 > 95%（在正常环境下）
- 用户反馈中"恢复流程不稳定"不再是主要痛点
- 平均恢复路径的 token 消耗相比 V2 有可观测的下降

---

## V4 — 智能化 + 可观测

| 项目 | 内容 |
|---|---|
| 状态 | ✅ 已完成（V4.0 全部交付） |
| 定位 | 从被动工具变成主动助手。不等用户问，主动发现问题。 |

### 前提

- V3 的 Core 层和 MCP 已稳定运行至少一个版本周期
- V3 衡量标准全部达标

### 主线方向：智能恢复建议 + 备份健康看板

V4 聚焦两件事——**主动风险提示**和**状态可见性**。这是用户从"能用"到"放心用"的关键一步。

#### 主线 A：智能恢复建议

```
现在：用户说"恢复到5分钟前" → Agent 查 → 列候选 → 恢复
V4：检测到短时间内大量文件被修改 → 主动提示"建议先看看恢复点"
```

- 基于 watcher 的变更频率检测
- 当变更速率异常时（如 10 秒内 20+ 文件被改），在下次 MCP 调用响应中附加风险提示
- SKILL.md 可配置"主动提醒"策略（`"proactive_alert": true/false`）

#### 主线 B：备份健康看板

```
cursor-guard status

  备份策略：git + shadow
  最近备份：2 分钟前
  备份数量：git 47 commits / shadow 23 snapshots
  磁盘占用：git 12MB / shadow 89MB
  保护范围：src/** lib/**（排除 node_modules）
  健康状态：✓ 一切正常
```

- 一个结构化的状态聚合（MCP 工具 + CLI 双入口）
- 不做 Web UI，纯文本/JSON 输出

#### 候选支线（视需求择机推进）

- **多项目状态概览**：一台机器上多个项目的备份状态统一查看，共享策略模板
- **备份完整性校验**：Git 备份引用可达性检查（`git cat-file -t`）、shadow copy 哈希比对、doctor 增加"备份质量"指标

### V4 实施详情

#### Core 模块（2 个新增）

| 模块 | 文件 | 核心函数 |
|---|---|---|
| **anomaly** | `core/anomaly.js` | `createChangeTracker()` / `recordChange()` / `checkAnomaly()` / `getAlertStatus()` / `saveAlert()` / `loadActiveAlert()` |
| **dashboard** | `core/dashboard.js` | `getDashboard()` — 综合健康看板（策略、计数、磁盘、范围、健康、告警） |

#### MCP 工具（2 个新增 + 全局 alert 注入）

| 工具 | 功能 |
|---|---|
| `dashboard` | 一次调用返回综合健康看板 |
| `alert_status` | 查询当前活跃的变更频率告警 |
| **全局注入** | 所有现有 MCP 工具响应自动附加 `_activeAlert` 字段（如有活跃告警） |

#### 配置新增

| 字段 | 默认值 | 说明 |
|---|---|---|
| `proactive_alert` | `true` | 启用/禁用主动变更频率检测 |
| `alert_thresholds.files_per_window` | `20` | 触发告警的文件变更数 |
| `alert_thresholds.window_seconds` | `10` | 滑动时间窗口（秒） |
| `alert_thresholds.cooldown_seconds` | `60` | 连续告警最小间隔（秒） |

#### 测试

- V4 最终测试分布：utils 39 + core 78 + MCP 21 = **138 测试全过**
- 较 V3.4（83 测试）净增 55 个测试，覆盖 anomaly、dashboard、MCP alert 注入、protect basename 匹配、C-quoted 路径解析、shadow/ref 碰撞重试、rename 预览、loadConfig 类型校验等场景

#### V4 代码审查加固（4 轮共 17 项修复）

V4 经过 4 轮系统性代码审查，修复了以下关键问题：

| 轮次 | 修复项 | 要点 |
|---|---|---|
| 一审 | 6 项 | Guard ref 首次快照从 HEAD 种子改为 orphan commit；`listBackups` / `getBackupStatus` 加 `--grep=^guard:` 过滤非 guard 提交；`previewProjectRestore` 识别 untracked 文件；`executeProjectRestore` 支持 `cleanUntracked` 选项；`injectAlert` 注入覆盖所有 MCP 工具；watcher 异常计数按 protect/ignore 过滤 |
| 二审 | 4 项 | `loadConfig` 校验数组元素类型（非字符串自动过滤并警告）；`createGitSnapshot` protect 缩小时旧 tree 残留清除；auto-backup porcelain 解析修正（`execFileSync` 替代 `git()` 避免 `trim()` 截断首行）；`executeProjectRestore` filesRestored 口径修正（不含 untracked 清理数） |
| 三审 | 4 项 | `doctor-fix.js` stale-lock PID 正则修正（`pid=` 格式）；Git pre-restore ref 加毫秒防碰撞；非 Git pre-restore shadow 同步加碰撞检测；`doctor.js` shadow 目录正则支持毫秒后缀 |
| 四审 | 3+2 项 | `createGitSnapshot` protect basename 语义对齐（`git add -A` + `matchesAny` 裁剪替代 `git add -- <pattern>`）；`unquoteGitPath()` 反解 C-quoted 路径（支持 UTF-8 octal）；pre-restore ref / shadow snapshot 碰撞重试循环（最多 1000 次）；`previewProjectRestore` 正确解析 rename/copy 条目 |

### V4.x 增量（全部已完成 ✅）

| 版本 | 新增 | 状态 |
|---|---|---|
| V4.1 | 用户反馈修复：fileCount 精度、安装流程、doctor MCP 检测、PowerShell 兼容 | ✅ |
| V4.2.0 | **Web 仪表盘**：本地只读 Web UI，健康总览、备份表格、恢复点抽屉、诊断、保护范围。中英双语、自动刷新、多项目支持 | ✅ |
| V4.2.1 | 代码审查修复：`t()` replaceAll、未用导入清理、过滤栏补全、跨平台 shell 兼容、去重 | ✅ |
| V4.2.2 | `restore_project` 保护 `.cursor-guard.json`；init 提示 `git commit` | ✅ |
| V4.3.0 | **备份上下文元数据**：Git commit 结构化 trailer（Files-Changed / Summary / Trigger），仪表盘"变更"列 | ✅ |
| V4.3.1 | `restore_project` 保护 `.gitignore`；`cursor-guard-index.lock` 清理；summary 按 protect/ignore 过滤 + 分类格式 | ✅ |
| V4.3.2 | `cursor-guard-init` 自动添加根目录 `node_modules/` 到 `.gitignore`；doctor MCP 版本提示含重载快捷键 | ✅ |
| V4.3.3 | **Intent 上下文**（V5 基础前置）：`snapshot_now` 支持 `intent` / `agent` / `session` 参数，Git trailer 存储，仪表盘展示意图徽章和完整审计字段 | ✅ |
| V4.3.4 | **运维加固**：`backup.log` 日志轮转（1MB / 3 文件）；watcher 单实例保护加固（锁文件时间戳 + 24h 超时）；`previewProjectRestore` 保护路径分组摘要（降低 token 消耗）；SKILL.md 硬规则 #15（升级后提交 skill 文件） | ✅ |
| V4.3.5 | **Summary 准确性修复 + UI 优化**：备份摘要改用 `diff-tree` 增量对比（修复 porcelain 假摘要 bug）；仪表盘变更列三行堆叠布局；配色全面优化（背景层级 / 状态色 / 文字层级） | ✅ |
| V4.4.0 | **V4 收官版**：首次快照 summary（无 parent 时生成 Added N: ...）；doctor 新增 Git retention 警告（>500 commits + disabled）和 Backup integrity 校验（`cat-file -t` tree 可达性）；`cursor-guard-init` 升级检测（已有配置提示） | ✅ |
| V4.4.1 | **安全硬化版（5 项审计修复 + UX 优化）**：见下方详细说明 | ✅ |
| V4.5.0 | **V4 最终版（异常检测修复 + Dashboard 全面升级）**：见下方详细说明 | ✅ 收官 |
| V4.5.2 | **告警结构化文件列表**：见下方详细说明 | ✅ |
| V4.5.3 | **告警历史 UX 优化 + 备份结构化文件表格**：见下方详细说明 | ✅ |
| V4.5.4 | **Shadow 硬链接增量优化 + always_watch 强保护模式**：见下方详细说明 | ✅ |

#### V4.4.1 详细内容

**安全修复（2×P1 + 3×P2）**：

| 级别 | 问题 | 修复 |
|------|------|------|
| P1 | `restoreFile` 接受目录 pathspec（`src`、`.cursor`）和项目根（`.`），单文件 API 能恢复整个目录或回滚受保护资产 | `validateRelativePath` 拦截 `.` 和空路径；`isToolPath` 匹配裸 `.cursor`；git 路径用 `cat-file -t` 验证必须是 blob（文件），tree（目录）直接拒绝；shadow 路径用 `statSync` 拦截目录 |
| P1 | `restore_project` 对 HEAD 已删除的受保护文件不处理，旧快照会把它们复活 | 恢复前用 `ls-tree HEAD -- <path>` 检查存在性，HEAD 中不存在的路径用 `rmSync/unlinkSync` 清除 |
| P2 | Git retention 重建链只保留 subject（`%s`），丢失 V4.3 审计 trailers | 改用 `%B`（完整 body + trailers），重建用 `fullBody` 传入 `commit-tree -m` |
| P2 | Dashboard 仅绑定 127.0.0.1 但无 Host/token 防护，可被 DNS rebinding 读取 | 加 Host header 校验（`127.0.0.1`/`localhost`）+ per-process 随机 token 注入 index.html，API 请求必须携带 |
| P2 | `doctor_fix` 初始化 Git 时 `git add -A` 会提交 `node_modules/` | 在 `git add -A` 前写入 `node_modules/` 和 `.cursor/skills/**/node_modules/` 到 `.gitignore` |

**回归测试**：新增 3 条负例锁定 restore 防线（目录 pathspec / 受保护 .cursor / 项目根 `.`），总测试 143/143 全绿。

**Dashboard UX**：
- 骨架屏加载（shimmer 占位，消除白屏→弹出的突兀感）
- 渐进渲染（`page-data?scope=` 按需返回，overview 先渲染，backups+doctor 并行加载）
- 备份 summary 行级统计（`git diff-tree --numstat`，每文件 `(+N -M)`），分行显示
- Summary 可见性提升（12px + secondary 颜色 + monospace 字体）
- 去除变更列冗余 trigger badge（类型列已有）
- Pre-restore 快照记录恢复方向（`From: <HEAD短hash>`、`Restore-To: <目标短hash>`、`File: <文件路径>`），表格琥珀色显示 `ab1b45d → f4029e9`

**架构级防护缺口修复**：
- MCP 工具注入 watcher 未运行警告（`_warning` 字段），AI 第一次调任何工具就能看到保护缺口
- SKILL.md Hard Rule #1 升级："任何文件写入/删除前必须 snapshot"（之前仅要求"高风险操作前"）
- SKILL.md 新增 Hard Rule #3a："必须检查 watcher 状态"——看到 `_warning` 必须告知用户

#### V4.5.0 详细内容

**Bug 修复**：

| 问题 | 根因 | 修复 |
|------|------|------|
| 异常检测 `changedFileCount` 虚高 | `auto-backup.js` 用 `git status --porcelain`（对比 HEAD）计数，而非对比上一次备份的增量 | 改用 `createGitSnapshot` 返回的 `changedCount`（来自 `diff-tree`），异常检测和 Summary 共享同一数据源。移除了未使用的 `execFileSync` 和 `unquoteGitPath` 导入 |
| 诊断锁文件状态判断不够智能 | `doctor.js` Lock file 检测只要存在就报 WARN，不区分 watcher 是否在运行 | 加入 PID 存活判断（`process.kill(pid, 0)`）：PID 在线 → PASS（`watcher running`）；PID 已死 → WARN（`stale lock file`）；无 PID → WARN（兜底）。前端 i18n 同步补全 `detail.lock_running` / `detail.lock_stale` / `detail.lock_exists` |

**Dashboard 升级（10 项改进）**：

| 优先级 | 改进 | 说明 |
|--------|------|------|
| 高 | 告警卡片补全 | 显示触发时间、过期倒计时（实时递减）、具体数字（N 文件 / N 秒 / 阈值 N） |
| 高 | 告警历史 | 保留最近 20 条告警记录，即使过期也显示在卡片下方（最近 5 条） |
| 中 | 文件搜索框 | 备份表格上方输入框，按文件名/意图/摘要实时过滤相关备份 |
| 中 | 恢复命令复制 | 抽屉底部显示 `restore_project` 和 `restore_file` MCP 命令，一键复制 |
| 低 | 筛选按钮计数 | "Git 自动备份 (12)" 而非仅 "Git 自动备份"；无数据的类型自动隐藏 |
| 低 | Watcher 最后扫描 | 卡片增加 "最后扫描: 3s 前"，确认 watcher 实际在工作 |
| 中 | 摘要展开/收起 | 变更摘要超过 2 行时自动折叠，显示 `+N more` 按钮点击展开；避免行过长截断，无需进抽屉即可看全 |
| 修复 | `showLoading` 引用 | 项目切换时调用了不存在的 `showLoading()`，改为 `showSkeleton()` |
| 优化 | i18n 补全 | 新增 14 个双语 key（告警详情、告警历史、文件搜索、恢复命令、扫描时间） |

> **注**：V4.2 的 Web 仪表盘最初在 V4.0 规划中标记为"不做"，但用户需求明确后实施。事实证明只读仪表盘投入产出比合理，且不违反安全原则。

#### V4.5.2 详细内容

**告警结构化文件列表**：

| 层 | 改动 | 说明 |
|----|------|------|
| Core | `snapshot.js` 返回 `changedFiles` 数组 | 每项包含 `{ path, action, added, deleted }`，数据来源 `diff-tree --numstat`，按变化量降序排列 |
| Core | `auto-backup.js` 透传 `changedFiles` | `createGitSnapshot` → `recordChange(tracker, count, changedFiles)` |
| Core | `anomaly.js` alert 携带 `files` 字段 | 窗口内多次事件的文件按路径去重合并，最多保留 50 条，`saveAlert` 持久化到磁盘 |
| Dashboard | 告警卡片可展开文件详情表格 | 点击"展开文件详情"显示排序表格（文件路径 / 操作类型 / 变化量），操作类型用彩色 badge 区分（修改=蓝 / 新增=绿 / 删除=红 / 重命名=紫） |
| Dashboard | i18n 补全 | 新增 8 个双语 key（showFiles / hideFiles / col.file / col.action / col.changes / action.*） |

> 22 个文件被删除和 22 个文件被新增的风险完全不同——结构化文件列表让用户一眼判断严重程度。

#### V4.5.3 详细内容

**告警历史 UX 修复**：

| 问题 | 修复 | 实现细节 |
|------|------|----------|
| 告警过期后，"无活跃告警"绿色状态下方直接展示历史记录，上面说没事、下面列了两条记录，信息矛盾 | 历史默认完全隐藏，只显示灰色"历史（N 条）"可点击文字，展开后才显示历史列表 | `renderAlertCard` 无活跃告警分支：新增 `alert-history-toggle-btn`（灰色 11px 可点击按钮）+ `.alert-history-collapsed`（CSS `display:none`）。事件委托 `[data-alert-history-toggle]` 绑定在 `#card-alert` 上，toggle `alert-history-collapsed` class |

告警卡片状态设计：

```
无告警时：
  ✅ 无活跃告警
  历史（2 条）  ← 灰色小字，点击展开

有告警时：
  ⚠ 活跃告警
  13:03:54 触发 · 剩余 1m 53s
  22 个文件在 10 秒内变更（阈值：20）
  [展开文件详情]
```

**备份结构化文件表格**：

| 层 | 改动 | 说明 |
|----|------|------|
| Core | `backups.js` 新增 `getBackupFiles(projectDir, commitHash)` | 对指定 commit 运行 `diff-tree --numstat + --name-status`，返回 `[{path, action, added, deleted}]`，按变化量降序。支持 rename 解析（`R` 前缀→取 tab 分割的最后一段）。无 parent 时退化为 `ls-tree` 列出全部文件 |
| Server | `GET /api/backup-files?id=<project>&hash=<commit>` | 懒加载端点，不在 `list_backups` 中批量计算（50 条备份×`diff-tree` 会很慢）。400 校验 `hash` 必填 |
| Dashboard | `parseSummaryToFiles(summary)` | 解析 summary 文本格式 `"Modified 3: a.js (+2 -1), b.js (+0 -5), ...; Added 2: c.js (+10 -0)"` → `[{path, action, added, deleted}]`。正则匹配 `(Modified|Added|Deleted|Renamed) N:` 段头，逐文件解析 `filename (+N -M)`，自动跳过 `...` 截断标记 |
| Dashboard | `fetchBackupFiles(hash)` | 调用 `/api/backup-files` 端点，返回完整文件数组。网络失败静默降级（返回空数组） |
| Dashboard | 备份表 `formatSummaryCell` | 行内 mini 文件表格：`parseSummaryToFiles` 取前 3 个文件，每文件显示路径（mono 字体 11px，`max-width:220px` 省略号截断）+ 操作 badge（彩色）+ `+N -M`。超出显示"等 N 个文件…"（斜体灰色），`N` 取 `filesChanged` 字段（当 summary 有 `...` 截断时）或实际剩余数 |
| Dashboard | 抽屉 `openRestoreDrawer` | summary 字段不再用 `<pre>` 文本，改为懒加载可排序文件表格。打开抽屉 → `fetchBackupFiles(hash)` → `renderDrawerFilesTable(files, sortKey)`。三列表头均可点击排序（path=字典序 / action=字母序 / changes=变化量降序），当前排序列高亮。API 失败时降级为 `parseSummaryToFiles` 本地解析 |
| Dashboard | `renderDrawerFilesTable(files, sortKey)` | 可排序表格渲染函数：sticky 表头、340px 最大高度滚动区域、表头带 ↕ 排序指示器、行内复用 `formatFileActionBadge` 统一操作 badge |
| Dashboard | i18n 补全 | 新增 `summary.andMore`（"and {n} more…" / "等 {n} 个文件…"）、`alert.historyCount`（"History ({n})" / "历史（{n} 条）"） |

> 同一个 `getBackupFiles` 数据结构，告警详情和备份详情两个地方同时受益。备份表行内看 3 个关键文件，抽屉里看完整列表——信息层级清晰，不再一行文本挤 22 个文件名。

#### V4.5.4 详细内容

**Shadow 硬链接增量优化**：

| 层 | 改动 | 说明 |
|----|------|------|
| Core | `snapshot.js` `findPreviousSnapshot(backupDir)` | 新增辅助函数。扫描 backupDir 下所有 `YYYYMMDD_HHMMSS` 格式目录，按时间戳降序排列，返回最新的 snapshot 目录路径（`isDirectory` 校验） |
| Core | `snapshot.js` `createShadowCopy` 硬链接逻辑 | 备份循环中，对每个文件执行增量判断：① 读取源文件 `stat`（size + mtimeMs）② 读取上一个 snapshot 同路径文件 `stat` ③ 若 size 完全一致且 mtimeMs 差值 < 1ms → `fs.linkSync(prevFile, dest)` 硬链接 ④ 否则 → `fs.copyFileSync(src, dest)` + `fs.utimesSync(dest, atime, mtime)` 保留源文件时间戳 |
| Core | mtime 保留策略 | 每次 `copyFileSync` 后立即 `utimesSync` 将源文件的 mtime 同步到目标。这确保下一次 shadow 备份时，"上一个 snapshot 的文件 mtime" = "当时源文件的 mtime"，硬链接比较才有基准。`utimesSync` 失败不阻塞备份（`try-catch` 静默） |
| Core | 跨卷容错 | `fs.linkSync` 在跨文件系统（如 backupDir 在不同磁盘卷）或 FAT32 分区上会抛 `EXDEV` 错误。外层 `try-catch` 捕获后自动 fall back 到 `copyFileSync`，不影响备份正确性 |
| Watcher | `auto-backup.js` 日志 | Shadow 日志增加硬链接统计：`Shadow copy 20260322_130000 (150 files [142 hard-linked])`。linkedCount = 0 时不显示 |
| 返回值 | `createShadowCopy` 新增 `linkedCount` 字段 | 表示本次备份中通过硬链接节省 I/O 的文件数。用于日志、Dashboard 未来可展示 |

性能对比：

| 场景 | 文件总数 | 变更数 | 传统全量 copy | 硬链接增量 | 磁盘节省 |
|------|---------|--------|--------------|-----------|---------|
| 常规开发 | 150 | 8 | 150 次 copy | 8 copy + 142 link | ~95% I/O |
| 大规模重构 | 150 | 50 | 150 次 copy | 50 copy + 100 link | ~67% I/O |
| 首次备份 | 150 | 150 | 150 次 copy | 150 次 copy（无上一个 snapshot） | 0%（正常） |

> 硬链接在 NTFS（Windows）和 ext4/APFS（Linux/macOS）上均支持。同一 inode 共享磁盘块，150 个文件只改 8 个时磁盘写入降 95%。

**always_watch 强保护模式**：

| 层 | 改动 | 说明 |
|----|------|------|
| Config | `utils.js` DEFAULT_CONFIG | 新增 `always_watch: false` 默认配置项 |
| Config | `utils.js` loadConfig | 解析 `.cursor-guard.json` 中的 `always_watch` 布尔值。类型校验：非 `true`/`false` 值 → 警告 + 使用默认值 `false` |
| MCP | `mcp/server.js` `watchedProjects` Map | 进程级 Map，`key = projectPath`，`value = { pid, external }`。追踪已启动/检测到的 watcher，防止重复 spawn |
| MCP | `mcp/server.js` `ensureWatcher(projectPath)` | 自动 watcher 管理器，执行流程：① `watchedProjects.has(path)` → 已处理过则跳过 ② `loadConfig(path)` → 检查 `always_watch` 是否为 `true` ③ `isWatcherRunning(path)` → 已有外部 watcher 则标记 `external: true` 跳过 ④ `spawn(process.execPath, [cursor-guard-backup, --path, path])` → 创建 detached 子进程（`detached: true, stdio: 'ignore', windowsHide: true`） ⑤ `child.unref()` → 父进程退出不影响 watcher |
| MCP | 所有 9 个 tool handler | 入口处统一调用 `ensureWatcher(resolved)`。仅首次调用触发实际逻辑，后续调用通过 Map 缓存直接跳过（O(1)） |
| 安全 | 与现有锁文件机制兼容 | `ensureWatcher` 先检查 `isWatcherRunning`（读取 lock file + `process.kill(pid, 0)` PID 存活检测），不会在已有 watcher 时重复启动。手动启动的 watcher 和 auto-spawn 的 watcher 使用同一个 lock file，互斥保护 |

用户配置方式：
```json
{
  "always_watch": true
}
```

两种保护模式对比：

| | 轻量模式（默认） | 强保护模式 |
|---|---|---|
| 配置 | `always_watch: false`（或不设） | `always_watch: true` |
| Watcher 启动 | 手动 `cursor-guard-backup` | MCP server 首次 tool 调用自动 spawn |
| 保护覆盖 | AI 需手动 `snapshot_now` | 全程自动备份，零保护缺口 |
| 适用场景 | 小项目、低频编辑 | 重要项目、高频 AI 协作 |
| 资源开销 | 无后台进程 | 后台 watcher 进程（低 CPU，周期性扫描） |

> 这个特性直接填补了 V4 最大的架构缺口——"Watcher 停止 = 裸奔"。详见下方"V4 遗留的架构缺口"中该条目已标记为 **已解决**。

#### V4.5.x 新增配置参考

| 字段 | 类型 | 默认值 | 引入版本 | 说明 |
|------|------|--------|---------|------|
| `always_watch` | `boolean` | `false` | V4.5.4 | 强保护模式。设为 `true` 后，MCP server 首次 tool 调用自动启动 watcher 进程 |

完整 `.cursor-guard.json` 配置示例（含 V4.5.4 新增项）：

```json
{
  "protect": ["src/**", "*.config.js"],
  "ignore": ["node_modules/**", "dist/**"],
  "backup_strategy": "git",
  "auto_backup_interval_seconds": 60,
  "always_watch": true,
  "proactive_alert": true,
  "alert_thresholds": {
    "files_per_window": 20,
    "window_seconds": 10,
    "cooldown_seconds": 60
  }
}
```

### V4 不做的事

- 不做自动恢复（恢复永远需要人确认，这是产品底线）
- ~~不做 Web 仪表盘~~ → V4.2 已实施（只读、本地、零依赖）
- 不做云端同步

### V4 遗留的架构缺口（V5 接手）

通过 V4.4.1 的安全审计和真实场景测试，发现以下架构层面的保护缺口。这些不是代码 bug，而是设计边界：

| 缺口 | 现状 | 影响 | V5 改进方向 | 状态 |
|------|------|------|------------|------|
| ~~**Watcher 停止 = 裸奔**~~ | ~~Watcher 不运行期间无自动备份~~ | ~~变更永久丢失~~ | ~~`always_watch` 配置项~~ | ✅ **V4.5.4 已解决**：`always_watch: true` 时 MCP server 首次 tool 调用自动 spawn watcher 进程，与现有锁文件互斥机制兼容 |
| **保护依赖 AI 自觉** | SKILL.md 要求 AI 在写入前 snapshot，但没有强制机制 | AI 不遵守协议就直接写，保护形同虚设 | **embedded watcher + `begin_edit` 意图绑定**：MCP server 内嵌 watcher 循环 + 按文件路径匹配 intent，消除进程边界和并发竞争（详见 V5 设计） | 🔮 V5 |
| **自动备份无意图上下文** | auto-backup 只有 `trigger: auto`，不知道是谁改的、为什么改 | 事后回溯只能看到时间点快照，不知道操作意图 | **`begin_edit` → 文件路径绑定**：AI 编辑前声明意图和目标文件，embedded watcher 检测变更时按路径匹配 intent，自动备份也能带上下文 | 🔮 V5 |
| **无跨进程写拦截** | 当前 MCP 架构下无法拦截 Cursor 编辑器的文件写入 | 只能在写后检测，不能写前阻止 | 等待 MCP 协议支持 `notification` / `resource subscription`，或探索 fs watch + pre-commit 组合 | 🔮 V5+ |
| **意图队列并发问题** | 曾考虑"意图队列"（AI 写文件 → watcher 读文件关联 intent），但存在 4 类并发竞态：多 Agent 竞争、意图-变更错位、意图堆积、空意图残留 | 文件 I/O 跨进程 + 时间顺序绑定 = 不可靠 | **同进程内存 Map + 文件路径绑定**：消灭进程边界后无 IPC，按路径而非时间匹配消除歧义（详见 V5 设计） | 🔮 V5 |

### 进入 V5 的衡量标准

- V4 的主动提醒功能误报率 < 10%
- 健康看板的信息准确度经用户验证
- 多 Agent 并发编辑已成为用户的真实场景（不是假设）
- MCP 协议的 notification / resource subscription 机制已相对成熟

---

## V5 — AI 代码变更控制

| 项目 | 内容 |
|---|---|
| 状态 | 中期主线 🚀 |
| 定位 | 从保护"一次 AI 写操作"升级为管理"整条 AI 代码变更链路"：事前预防、事中判断、事后追溯、按事件恢复。 |
| 产品定义 | `AI Code Change Control Layer` |
| 关键词 | `intent` / `impact` / `audit` / `restore-by-event` |

### 为什么需要这一步

V2-V4 已经证明，cursor-guard 的价值不只是"多留一个备份点"，而是在 AI 编码场景下提供一层本地、可解释、非侵入式的安全控制：

- **Agent-aware**：知道这不是普通文件变更，而是 AI 发起的代码修改
- **Local-first**：核心能力默认在本地完成，不依赖云端才能恢复
- **Non-polluting Git safety net**：通过 `refs/guard/*`、临时 index、shadow copy 提供恢复点，不污染用户分支与暂存区
- **Deterministic recovery**：恢复顺序明确，可解释、可复现
- **已有四层基础**：Skill / Core / MCP / Watcher 已搭好，具备继续上升为"变更控制层"的条件

如果继续只强调"写前快照"，会低估这个项目真正的优势。V5 应该把 cursor-guard 明确升级为：

> **AI Code Change Control Layer**  
> 一层面向 AI 编码的代码变更安全控制层。

### V5 的闭环

V5 不是"三个方向选一个"，而是把下面这条链路做完整：

1. **Intent**：谁正准备改这里？
2. **Impact**：这次改动会波及哪里？
3. **Audit**：这段代码何时、被谁、因何改的？
4. **Restore**：出事后该回退哪次操作？

只有这四步连起来，cursor-guard 才不是"备份工具"，而是"变更控制层"。

### V5.0 可执行功能清单

| 模块 / 能力 | AI 要做什么 | 建议产物 | 完成标准 |
|---|---|---|---|
| `intent registry` | 在高风险写入前注册编辑意图，记录 agent、会话、工作区、分支、目标文件、风险级别 | `core/intent.*` 或同等模块 | 能列出活跃会话，能释放会话，能查到谁准备改哪个文件。**基础版已在 V4.3.3 落地**：`snapshot_now` 支持 `intent` / `agent` / `session` 参数，存储为 Git commit trailer，仪表盘可展示。**V4.3.5 修复**：summary 改用 `diff-tree` 增量对比，确保元数据准确 |
| `pre-edit snapshot` | 在每次高风险 AI 写入前创建 `refs/guard/pre-edit/*` 恢复点 | `refs/guard/pre-edit/<session>/<seq>` | 任意一条 AI 编辑事件都能关联到写前快照 |
| `conflict detection` | 先做文件路径级冲突检测，再预留符号级增强位 | `detectConflicts()` / `listConflicts()` | 两个会话同时改重叠文件时能给出 advisory warning |
| `audit store` | 以 append-only 方式保存 AI 编辑事件 | 默认本地 `JSONL`；后续可升级 `SQLite` | 能按文件 / 会话 / agent / 时间 / 风险级别查询。**雏形已在 V4.3.0-V4.3.3 落地**：审计元数据通过 Git commit trailer 持久化，`listBackups` 可按 trigger/intent/agent/session 解析 |
| `restore by event` | 允许从一条审计事件直接跳转并执行恢复 | `restore_from_event` | 给定 `event_id` 可以定位 `before_ref` 或 `restore_ref` |
| `impact set` | 为高风险编辑记录受影响文件 / 符号 / 测试集合 | `impact_set` 字段 | 查询事件时能看到"这次改动可能波及哪里" |
| `MCP / CLI surface` | 暴露最小可用接口给 Agent 和终端 | `register_intent` / `list_active_intents` / `audit_query` / `get_event` / `restore_from_event` | AI 不需要拼复杂 shell，就能完成查询与恢复 |
| `dashboard / doctor` | 把活跃会话、冲突告警、最近 AI 事件纳入诊断和看板 | `dashboard` / `doctor` 扩展字段 | 用户能看见"现在谁在改、最近改了什么、哪里有冲突" |
| `always_watch` | 配置项 `"always_watch": true`，MCP server 启动时自动内嵌 watcher 循环；用户可选两种保护模式：**轻量模式**（默认，AI 手动 `snapshot_now`）vs **强保护模式**（watcher 始终在后台，所有变更自动备份） | `.cursor-guard.json` 配置 + MCP server 启动逻辑 | MCP server 启动后，`always_watch: true` 的项目自动有 watcher 保护，无需额外命令；选择权在用户 |
| `embedded watcher` | **消灭进程边界**：不再是独立后台进程，而是 MCP server 同进程内的 watcher 循环。同进程 = 无 IPC、无文件桥接、无并发竞争。检测到文件变更时自动创建 snapshot，不依赖 AI 手动调用 | MCP server 内部模块 | watcher 停止 = 裸奔的保护缺口彻底消除；AI 忘记 snapshot 也有兜底 |
| `begin_edit` / `end_edit` | **意图-变更原子绑定**：AI 编辑前调 `begin_edit({ intent, files[], agent, session })`，在内存 `Map<session, EditScope>` 注册编辑意图和目标文件。embedded watcher 检测到变更时按**文件路径**匹配 intent，自动备份带完整上下文。`end_edit(session)` 或 TTL（默认 5 分钟）自动清除 | `begin_edit` / `end_edit` MCP 工具 + 内存 `activeEdits` Map | auto-backup 也能带 intent/agent/session；并发多 Agent 按文件路径消歧，不按时间顺序 |
| `tests / docs` | 为事件链路补齐单测、集成测试和文档 | tests + schema docs | V5.0 的所有核心事件和恢复路径都有测试覆盖 |

### V5 核心设计：Embedded Watcher + 文件路径意图绑定

#### 问题根因

V4 的自动备份（auto-backup）和意图上下文（intent）分属两个独立进程：

```
MCP Server 进程（知道 intent）  ←——×——→  Watcher 进程（知道文件变了）
         ↑                                        ↑
    AI agent 调用                              fs 检测循环
    有上下文                                  无上下文
```

- `auto-backup.js` 调用 snapshot 时只传 `{ trigger: 'auto', changedFileCount }`，没有 intent/agent/session
- 只有 `snapshot_now` MCP 工具支持 intent 参数
- 曾考虑"意图队列"（AI 写文件 → watcher 读文件关联），但存在 4 类并发竞态：

| 竞态场景 | 描述 |
|---------|------|
| 多 Agent 竞争 | A 提交意图 → B 提交意图 → watcher 触发 → 绑谁的？ |
| 意图-变更错位 | A 提交意图但未改文件 → B 改了另一个文件 → A 的意图被错绑到 B 的变更 |
| 意图堆积 | 一个 cycle 内多个 agent 提交意图 → watcher 只产生一次 commit → 意图丢失或错配 |
| 空意图残留 | Agent 提交意图后放弃 → 意图留在队列 → 被绑到下一次无关变更 |

根本原因：**意图提交和文件变更是两个独立事件，跨进程 + 按时间绑定 = 无法原子化**。

#### 方案：同进程 + 按文件路径绑定

```
┌─────────────── MCP Server 进程（V5） ──────────────────┐
│                                                         │
│  AI agent 调用              内存 activeEdits             │
│  begin_edit({               Map<session, {              │
│    intent,              →     intent, files[],          │
│    files[],                   agent, timestamp,         │
│    agent,                     ttl                       │
│    session               }>                             │
│  })                              ↓ 直接读取（同进程）    │
│                                                         │
│  Embedded Watcher 循环 ←─── 检测到 src/auth.ts 变更     │
│  查 activeEdits:                                        │
│    s1 声明了 [src/auth.ts] → 匹配 ✅                     │
│    s2 声明了 [src/style.css] → 不匹配 ❌                 │
│  → 创建 auto-backup commit 带 s1 的 intent              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**核心优势**：
- **同进程**：无 IPC、无文件 I/O、无并发竞争（Node.js 单线程 event loop）
- **按文件路径绑定**：不同 Agent 改不同文件时各自匹配，无歧义
- **TTL 自动过期**：空意图 5 分钟后自动清除，不会残留
- **多 Agent 同文件**：标记为 `multi-agent overlap`，附上所有匹配意图（同时作为冲突检测信号）

#### 并发场景处理

| 场景 | 处理方式 |
|------|---------|
| A 改 `auth.ts`，B 改 `style.css` | 各自匹配各自的 `begin_edit` scope，零歧义 |
| A、B 都声明要改 `auth.ts` | `begin_edit` 时即检测到重叠，返回 advisory warning；auto-backup 附上两个 intent |
| A 声明了意图但没改文件 | TTL 到期自动清除；`end_edit` 可提前关闭 |
| 文件变更但没有任何 `begin_edit` | 降级为普通 auto-backup（和 V4 行为一致，无退化） |
| AI 直接调 `snapshot_now(intent=...)` | 和现在一模一样，完全兼容 |

#### 实现分期

```
Phase 1 (V5.0):
  ├── always_watch: true → MCP server 内嵌 watcher 循环
  ├── 新增 begin_edit / end_edit MCP 工具
  ├── 内存 Map<session, EditScope> 管理活跃编辑意图
  └── watcher 变更检测时查 Map，按文件路径匹配 intent → 写入 commit trailer

Phase 2 (V5.x):
  ├── begin_edit → 产生 intent_registered 事件（写入审计存储）
  ├── 文件变更 → 产生 edit_applied 事件（关联 intent + before_ref）
  ├── end_edit → 产生 intent_released 事件
  └── 完整审计链闭环，支持 restore_from_event
```

#### 与"意图队列"方案的本质区别

| | 意图队列（已否决） | embedded watcher + begin_edit |
|---|---|---|
| 通信方式 | 文件 I/O（跨进程） | 内存 Map（同进程） |
| 绑定维度 | 时间顺序（先进先出） | 文件路径（精确匹配） |
| 并发安全 | 4 类竞态条件 | 无竞态（单进程 event loop） |
| 空意图处理 | 残留在文件中 | TTL 自动过期 + `end_edit` 显式关闭 |
| 多 Agent 消歧 | 无法消歧 | 文件路径级消歧 + 冲突检测信号 |

### V5 主线 A：并发编辑安全（预防层）

```
场景：Agent A 在改 src/auth.ts，Agent B 在重构 src/api.ts
      但 api.ts 依赖 auth.ts 的导出

现在：谁后写谁赢，另一个 Agent 的改动可能被覆盖
V5：cursor-guard 先感知编辑意图，再给出冲突预警，
    并为每个编辑会话留下各自可恢复的 pre-edit 证据点
```

首版目标：

- Agent 写入前先注册 `intent`
- 维护本地"编辑会话表"：Agent / 会话 / 工作区 / 分支 / 目标文件 / 风险级别
- 冲突检测先从**文件路径级**做起，再逐步增强到符号级
- 对潜在冲突返回 advisory warning，而不是一上来做硬锁
- 为每个会话创建 `refs/guard/pre-edit/*` 恢复点，做到"按会话回退"而不是只按项目回退

### V5 主线 B：变更影响分析（判断层）

```
现在：cursor-guard 知道 src/auth.ts 被修改了
V5：cursor-guard 还知道 validateToken 签名变了，
    src/api.ts、src/middleware.ts、tests/auth.test.ts 可能被波及
```

目标不是做另一个 lint / language server，而是只回答**和 AI 变更安全直接相关**的问题：

- 本次 AI 变更影响了哪些文件、符号、测试和构建入口
- 哪些恢复操作应该按"变更集"而不是单文件执行
- doctor / dashboard 能否指出"最近一次 AI 编辑可能导致的引用断裂、类型错误、测试波及"
- 在审计记录中保存 `impact_set`，让排查和恢复不再只看单个文件

边界要明确：

- 不做通用静态分析平台
- 不替代 lint / typecheck / language server
- 只服务于"这次 AI 代码变更是否安全、可恢复、可解释"

### V5 主线 C：AI 编辑审计链（证据层）

每次 AI 修改都留下结构化、可查询、可恢复的审计记录（示例为未来格式，`refs/guard/pre-edit/*` 为 V5+ 新增路径，不影响现有 `refs/guard/snapshot` 和 `refs/guard/pre-restore/*`）：

```yaml
event_id: evt_20260321_143205_001
session_id: sess_auth_refactor_01
agent_id: cursor/background-claude
action: edit
intent: "添加 JWT 过期检查"
risk_level: medium
files:
  - path: src/auth.ts
    lines_changed: 12-28
before_ref: refs/guard/pre-edit/sess_auth_refactor_01/0001
restore_ref: refs/guard/pre-restore/20260321_143401
impact_set:
  - src/api.ts
  - src/middleware.ts
  - tests/auth.test.ts
user_confirmed: true
timestamp: 2026-03-21T14:32:05+08:00
```

V5 的关键不是"多打一行日志"，而是建立完整证据链：

- 事后追溯"这段代码何时、被谁、因何改的"
- 支持按文件 / Agent / 会话 / 时间 / 风险级别查询
- 支持从审计事件直接跳到恢复点，做到 `restore_from_event`
- 让团队 code review、事故排查、恢复决策都有统一依据

### V5 核心事件

| 事件名 | 何时产生 | 最少字段 |
|---|---|---|
| `intent_registered` | AI 在高风险写入前注册意图 | `event_id` `session_id` `agent_id` `files[]` `risk_level` `timestamp` |
| `conflict_detected` | 当前意图与活跃会话发生重叠 | `event_id` `session_id` `conflict_with[]` `files[]` `severity` `timestamp` |
| `edit_applied` | AI 写入已落盘且写前快照完成 | `event_id` `session_id` `before_ref` `files[]` `intent` `impact_set[]` `timestamp` |
| `restore_executed` | 用户或 Agent 按事件执行恢复 | `event_id` `restored_from_event` `restore_ref` `files[]` `timestamp` |
| `intent_released` | 会话结束或冲突解除 | `event_id` `session_id` `timestamp` |

### V5 标准事件结构

> 首版建议统一为一个可 append-only 的结构，默认落本地 `JSONL`。  
> 如后续需要更强查询性能，再平滑升级到 `SQLite`。

```json
{
  "event_id": "evt_20260321_143205_001",
  "session_id": "sess_auth_refactor_01",
  "agent_id": "cursor/background-claude",
  "event_type": "edit_applied",
  "action": "edit",
  "intent": "添加 JWT 过期检查",
  "risk_level": "medium",
  "files": [
    { "path": "src/auth.ts", "lines_changed": "12-28" }
  ],
  "before_ref": "refs/guard/pre-edit/sess_auth_refactor_01/0001",
  "restore_ref": "refs/guard/pre-restore/20260321_143401",
  "impact_set": [
    "src/api.ts",
    "src/middleware.ts",
    "tests/auth.test.ts"
  ],
  "user_confirmed": true,
  "timestamp": "2026-03-21T14:32:05+08:00"
}
```

### V5 的代表性价值

- 对个人开发者：知道上一次 AI 大改到底动了什么，能按事件回退，而不是盲猜
- 对重度 AI 用户：background agent、多工具协作时，能提前看到覆盖风险
- 对团队：可以讨论"这次 AI 改动值不值得保留"，而不是只讨论"代码现在长什么样"

### V5 不做的事

- 不做跨机器同步（那是 git remote 的事）
- 不做通用静态分析平台（不取代 lint / typecheck / language server）
- 不做云端控制平面（核心能力仍然本地优先）
- 不做通用版本控制（不取代 git）
- 不在 V5 首版强制所有 Agent 写入走硬锁（先 advisory，后增强）

### V5 完成标志（Definition of Done）

- `always_watch: true` 配置生效后，MCP server 启动自动内嵌 watcher 循环，用户无需额外命令
- `begin_edit` / `end_edit` MCP 工具可用，AI 能声明编辑意图和目标文件
- embedded watcher 的自动备份能通过文件路径匹配关联 `begin_edit` 中的 intent/agent/session
- 无 `begin_edit` 时自动备份行为与 V4 一致（无退化）
- AI 能在高风险写入前注册意图并创建 `pre-edit` 快照
- 用户能查询最近一次 AI 编辑的完整上下文
- 给定 `event_id` 能找到对应快照并执行恢复
- 两个活跃会话改同一文件时，系统能稳定给出冲突告警
- dashboard / doctor 能展示最近 AI 事件、活跃会话和未解决冲突

### 进入 V6 的衡量标准

- V5 已能稳定回答四个核心问题：谁改的、为什么改、影响哪、怎么恢复
- `intent / impact / audit / restore` 数据模型稳定
- V5 在真实多 Agent / 多工具工作流中验证过，冲突检测准确率可接受
- cursor-guard 有一定的用户基数和社区认可度
- 社区开始出现"跨工具复用审计链与恢复语义"的真实需求

---

## V6 — 开放协议 + 团队工作流

| 项目 | 内容 |
|---|---|
| 状态 | 中长期主线 🚀🚀 |
| 定位 | 从 Cursor 内的安全技能，升级为跨工具的 AI 代码变更控制协议、参考实现与团队工作流入口。 |
| 产出定位 | `协议` + `适配器` + `CI 查询报告` |

### 为什么会走到这一步

到 V5，cursor-guard 已经积累了：
- 一套经过验证的安全规则体系（Skill 层）
- 一个稳定的核心引擎（Core 层）
- 一组标准化的工具接口（MCP 层）
- 一套面向 AI 代码变更的控制闭环（意图 / 影响 / 审计 / 恢复）

这些能力并不是 Cursor 独有的需求。任何 AI 编码工具（Windsurf、Copilot Workspace、未来的新工具）都面临同样的问题：

> AI 改了代码，如何确保这次改动可预防、可追溯、可恢复、可审计？

V6 的核心判断是：

- **护城河不只是"能备份"**，而是"协议 + 数据模型 + 查询接口 + 工作流集成"
- Cursor 只是第一个适配器，不是最终形态
- 如果 V5 做成了控制闭环，V6 就应把它升级成跨工具标准和团队基础设施

### V6.0 可执行功能清单

| 模块 / 能力 | AI 要做什么 | 建议产物 | 完成标准 |
|---|---|---|---|
| `protocol spec` | 把 snapshot / intent / audit / restore 语义写成正式协议 | `AI Code Change Control Protocol v1.0` 文档 | 第三方仅靠文档就能实现兼容版本 |
| `event schemas` | 发布事件、查询、覆盖率报告的结构定义 | `intent.schema.json` `edit_event.schema.json` `restore_event.schema.json` `coverage_report.schema.json` | 所有接口都能按 schema 校验 |
| `conformance suite` | 提供最小一致性测试套件和 fixtures | conformance tests + fixtures | 第三方实现能跑出 pass / fail 结果 |
| `adapter API` | 定义 IDE / Agent 接入层的最小接口 | Adapter API 文档 | 新工具可通过统一接口接入 intent / audit / restore |
| `query API` | 定义跨工具可复用的查询能力 | `list_events` / `get_event` / `list_sessions` / `get_restore_chain` / `get_coverage_report` | 团队工具和 CI 能稳定消费这些查询 |
| `CI reporter` | 把 AI 编辑审计链转成 PR / 流水线报告 | GitHub / CI reporter | 团队能在 PR 中看到 AI 编辑安全报告 |
| `module boundaries` | 明确 core、audit、coordinator、adapter、reporter 的边界 | 模块边界文档 | 不同实现可以复用同一协议而不强耦合 |

### V6 主线 A：协议规范化

把 V2-V5 积累的变更控制能力提炼成一份正式规范：

```
AI Code Change Control Protocol v1.0

1. Pre-Write Snapshot
   - MUST create recoverable snapshot before destructive operations
   - Snapshot MUST NOT pollute user's staging area or branch history

2. Edit Intent
   - Agent MUST register intent before high-risk writes
   - Intent SHOULD be queryable during an active session

3. Impact Set
   - High-risk edits SHOULD emit affected files / symbols / tests

4. Audit Trail
   - Structured record format for all AI-initiated edits

5. Restore by Event
   - Any recorded AI edit SHOULD be restorable through linked snapshot refs
```

这份规范应该是 IDE 无关、传输无关的：可以跑在 MCP、CLI、HTTP、IDE adapter 上。
cursor-guard 自身则变成"这份规范的参考实现"。

配套产出：**协议一致性测试套件（conformance suite）**——第三方实现可以跑这套测试来验证自己是否符合协议。

### V6 主线 B：模块化与适配器架构

把 cursor-guard 的核心能力拆成可复用模块，并围绕"适配器"而不是"杂项插件"扩张：

```
@cursor-guard/core          → 核心引擎（备份/恢复/诊断）
@cursor-guard/mcp           → MCP Server
@cursor-guard/watcher       → 后台自动备份
@cursor-guard/coordinator   → 编辑意图 / 冲突告警（V5）
@cursor-guard/audit         → 审计链 / 查询 / 按事件恢复（V5）
@cursor-guard/adapter-cursor
@cursor-guard/adapter-windsurf
@cursor-guard/reporter-github

社区扩展的重点不是"再发明一个备份后端"，而是：

- 适配其他 IDE / Agent
- 输出到不同的团队查询界面和报告载体
- 对接不同的审计存储和可视化层
- 让更多工具复用同一套变更控制语义

需要定义清晰的 Adapter API，例如：

- `registerIntent`
- `recordEditEvent`
- `queryAudit`
- `restoreFromEvent`
- `reportCoverage`

### V6 主线 C：CI/CD 集成

把 AI 编辑审计链对接到开发流程中，让团队在 PR 和流水线里真正用起来：

```
AI 编辑 → cursor-guard 记录审计链
  ↓
git push → CI 流水线
  ↓
cursor-guard CI check:
  - 本次 PR 中有 N 处 AI 编辑
  - 其中 M 处已有 pre-edit snapshot
  - 覆盖率：M/N = 95%
  - 风险评估：2 处高风险变更（大面积重写）
  - 是否存在未解决冲突告警
  - 是否可从事件直接恢复
  ↓
PR Review 中展示 AI 编辑报告
```

价值不只是"做个报表"，而是把 cursor-guard 从个人安全网升级为团队工作流的一部分：

- 团队层面看见 AI 编辑的影响范围和安全覆盖率
- code review 不再只看 diff，也能看审计上下文
- 事故发生后，可以从 PR / CI 报告直接追到具体事件与恢复点

### V6 协议对象

| 对象 | 用途 | 备注 |
|---|---|---|
| `intent` | 描述一次待执行的 AI 修改意图 | 事前预防 |
| `edit_event` | 描述一次已落盘 AI 修改 | 事后追溯 |
| `restore_event` | 描述一次按事件恢复 | 恢复审计 |
| `session` | 聚合同一 Agent 会话中的多次事件 | 查询入口 |
| `coverage_report` | 给 CI / PR 展示安全覆盖率和风险摘要 | 团队工作流 |

### V6 不做的事

- **不做商业化平台** —— cursor-guard 保持开源，协议保持开放
- **不做强依赖云端的服务** —— 核心能力永远是本地优先
- **不做 IDE 本体** —— 只做安全层，不越界
- **不做通用工程观测平台** —— 只围绕 AI 代码变更安全
- **不做强制标准** —— 协议是"推荐遵循"，不是"不遵循就不能用"

### V6 完成标志（Definition of Done）

- 协议文档、schema、conformance suite 三件套齐全
- 至少两个不同入口能接入同一套 intent / audit / restore 语义
- CI / PR 能稳定展示 AI 编辑安全报告
- 团队可以查询"这次 PR 里哪些改动由 AI 产生、是否有快照、是否可恢复"

### 进入 V7 的衡量标准

- V6 协议规范已有至少两个独立实现（cursor-guard 自身 + 至少一个第三方）
- conformance suite 测试套件稳定
- 企业或团队场景出现"能不能证明 AI 编辑走了安全流程"的需求
- 审计链数据格式经社区验证

---

## V7 — 可验证信任 / 治理层

| 项目 | 内容 |
|---|---|
| 状态 | 远期愿景 🔭🔭🔭 |
| 定位 | 不只是"有备份、有恢复"，而是"能证明这次 AI 改动是在安全链路下完成的"。 |

### 为什么需要这一步

V6 定义了协议，但协议被遵守了吗？没人能证明。

在团队和企业场景中，"我们用了 cursor-guard"不等于"每次 AI 编辑都走了安全流程"。管理者需要的不是承诺，是**证据**。

V7 的核心转变：

```
V6：定义了"AI 编辑应该怎么才算安全"
V7：能证明"这次 AI 编辑确实走了安全流程"
```

类比：ISO 27001 定义信息安全标准，审计/认证证明你遵守了。标准有价值，但**可验证**才是企业买单的原因。

### 核心能力

#### 7.1 审计记录签名化

为每次 AI 编辑操作生成带签名的审计记录，保证记录不可篡改。

```jsonc
{
  "event_id": "a3f2c1d4",
  "timestamp": "2026-03-21T14:32:05Z",
  "agent": "claude-4",
  "action": "edit",
  "file": "src/auth.ts",
  "pre_snapshot_ref": "refs/guard/pre-edit/a3f2c1",  // V5+ 新增 ref 路径
  "risk_level": "medium",
  "user_confirmed": true,
  "content_hash": "sha256:e3b0c44298fc...",
  "signature": "ed25519:Kx8dG9f...（基于项目密钥对 content_hash 的签名）"
}
```

> **注**：`refs/guard/pre-edit/*` 是 V5+ 规划的新增引用路径，用于细粒度审计。不改变现有 `refs/guard/snapshot`（写前快照）和 `refs/guard/pre-restore/*`（恢复前快照）的语义。

- 本地签名（基于项目密钥或机器指纹），不依赖外部服务
- 签名链：每条记录的签名包含前一条记录的哈希，形成可验证链
- 审计记录存储在 `.cursor-guard-audit/` 或 Git notes 中

#### 7.2 CI 安全覆盖率校验

在 CI 流水线中验证"本次 PR 的 AI 编辑是否都有安全保护"：

```
cursor-guard ci-check --base=main --head=feature-branch

AI Edit Safety Report:
  Total AI edits:        12
  With pre-snapshot:     11  (91.7%)
  With audit record:     12  (100%)
  High-risk edits:       2   (both user-confirmed)
  Unsigned records:      0
  
  Status: PASS (threshold: 90%)
```

- 作为 CI step 或 GitHub Action 运行
- 可配置通过阈值（安全覆盖率百分比）
- 输出格式兼容 PR Review comment

#### 7.3 团队策略包（Policy Packs）

可复用的团队级安全策略定义：

```json
{
  "policy": "strict-production",
  "rules": {
    "pre_snapshot": "required",
    "user_confirmation": "required_for_high_risk",
    "audit_signing": "required",
    "ci_coverage_threshold": 95,
    "allowed_restore_sources": ["guard-ref", "shadow-copy"]
  }
}
```

- 策略包可导出、导入、版本化
- 团队管理者定义统一策略，成员项目自动继承
- 与 CI 校验联动——不满足策略的 PR 被标记

#### 7.4 安全操作证明（Attestation）

最终形态：为一次完整的 AI 编辑会话生成可验证的"安全操作证明"。

```
Attestation: session-20260321-143205
  Agent: claude-4
  Session: 14:32:05 - 14:47:22
  Files edited: 8
  All pre-snapshots: ✓
  All audit signed: ✓
  Policy compliance: strict-production ✓
  Attestation hash: sha256:abc123...
  
  This session's AI edits were performed under
  cursor-guard safety protocol v1.0 with full compliance.
```

- 可独立验证（给定 attestation，任何人可以校验）
- 不依赖 cursor-guard 服务——纯本地密码学验证

### V7 的实施节奏

```
V7.0  审计记录签名化 + CI 安全覆盖率校验
V7.1  团队策略包
V7.2  完整 attestation（安全操作证明链）
```

### V7 不做的事

- 不做中心化证书颁发（签名基于本地密钥，不引入 CA）
- 不做实时监控平台（cursor-guard 不是 SIEM）
- 不做合规认证业务（cursor-guard 提供证据，不做审计结论）

---

## 全版本对比

| | V2 | V3 | V4 | V5 | V6 | V7 |
|---|---|---|---|---|---|---|
| **一句话** | 能恢复 | 更稳更省 | 主动提醒 + 可观测 + 可追溯 | 变更闭环 | 跨工具标准 | 可证明 |
| **核心架构** | Skill + Script | + Core + MCP | + 智能检测 + Web 仪表盘 + Intent + 增量摘要 | + 变更控制层 | + 开放协议 + 适配器 | + 治理层 |
| **Agent 调用** | 拼 shell | 优先 MCP | MCP + 主动建议 | MCP + 意图 / 审计 / 恢复 | 标准接口 + 适配器 | 标准接口 + 审计 |
| **安装门槛** | 最低 | 不变 | 不变 | 略增 | 看具体实现 | 看具体实现 |
| **适合谁** | 所有人 | 所有人 | 所有人 | 重度 AI 用户 + 团队试点 | 工具开发者 + 团队 | 企业 + 合规场景 |
| **状态** | ✅ 已发布 | ✅ 已完成 | ✅ 已完成 | 🚀 中期主线 | 🚀🚀 中长期 | 🔭🔭🔭 愿景 |

---

## 版本推进节奏

```
V2.x  ──────  ✅ 已完成
               │
V3.0  ──────  ✅ Core 抽取（6 模块，83 测试）
V3.1  ──────  ✅ MCP Server 首版（7 工具）
V3.2  ──────  ✅ restore_project 执行模式 + doctor_fix
V3.3  ──────  ✅ backup_status
V3.4  ──────  ✅ MCP 自检
               │
               │  前提：MCP 调用成功率 > 95%，token 消耗可观测下降
               ▼
V4.0  ──────  ✅ 智能恢复建议 + 备份健康看板 + 4 轮代码审查加固（138 测试）
V4.1  ──────  ✅ 用户反馈修复（fileCount 精度、安装流程、PowerShell 兼容）
V4.2.0 ─────  ✅ Web 仪表盘（只读、双语、多项目、聚合 API）
V4.2.1 ─────  ✅ 代码审查修复（t() replaceAll、未用导入、过滤栏补全）
V4.2.2 ─────  ✅ restore 保护 .cursor-guard.json + init 提示 git commit
V4.3.0 ─────  ✅ 备份上下文元数据（Git trailer: Files-Changed / Summary / Trigger）
V4.3.1 ─────  ✅ restore 保护 .gitignore + lock 清理 + summary 过滤/分类
V4.3.2 ─────  ✅ init 自动添加 node_modules/ 到 .gitignore + doctor 重载提示
V4.3.3 ─────  ✅ Intent 上下文（intent / agent / session trailer + 仪表盘展示）
V4.3.4 ─────  ✅ 运维加固（日志轮转 / 锁文件时间戳 / preview 分组 / SKILL 规则）
V4.3.5 ─────  ✅ Summary 增量 diff-tree 修复 + 变更列堆叠布局 + 配色优化
V4.4.0 ─────  ✅ V4 收官：首次快照 summary + doctor 完整性/retention 检查 + init 升级检测  ← 当前版本
               │
               │  前提：AI 编辑需要更强的追溯 / 恢复 / 查询闭环
               │  前提：多 Agent / 多工具协作成为真实场景
               ▼
V5.0  ──────  编辑意图 + pre-edit 审计链基础版
V5.x  ──────  影响分析 / 冲突告警 / 按事件恢复
               │
               │  前提：cursor-guard 有社区认可度
               │  前提：跨工具复用审计链与恢复语义有真实需求
               ▼
V6.0  ──────  协议规范 + conformance suite
V6.x  ──────  适配器架构 / CI 查询报告 / 团队工作流
               │
               │  前提：协议有多个独立实现
               │  前提：企业场景需要可验证证据
               ▼
V7.0  ──────  审计签名 + CI 安全覆盖率
V7.1  ──────  团队策略包
V7.2  ──────  attestation（安全操作证明）
```

**关键原则：每个版本只有在前一版稳定、且前提条件满足后才推进。不为远期版本提前做设计妥协。**

---

## Beyond V7

V7 的"可验证治理"是这条产品线的逻辑终点——该保护的都保护了、该标准化的都标准化了、该证明的都能证明。再往上加版本号，只有量变（更多平台适配、更多语言支持），没有质变。

这不是说项目到此结束，而是说 cursor-guard 作为**一个项目**的功能边界到此收敛。

但它推动的东西才刚开始——

如果 V6 的协议被采纳、V7 的治理层被验证，那么"AI 编辑前必须有安全快照"会像"代码必须有版本控制"一样成为行业共识。到那时候，这个能力可能已经被 IDE 原生实现、被 CI 平台内置、被开发者视为理所当然。

**cursor-guard 最好的终局不是所有人都在用 cursor-guard，而是所有人都在用 cursor-guard 定义的范式。**

就像 jQuery 推动了浏览器原生实现更好的 DOM API，最终让自己变得不再必要——那不是失败，那是赢了。

---

## 给用户说的话

### 现在（V4.3.5）

> cursor-guard 已经能保护你的代码，而且越来越聪明。
> 自动备份、写前快照、确定性恢复——开箱即用。
>
> **V3**：MCP 工具调用（可选）让 AI 操作更稳、更快、更省 token。
> **V4.0**：系统会主动监测异常变更并提醒你，一个 `dashboard` 就能看全局健康状态。
> **V4.2**：本地 Web 仪表盘——健康、备份、恢复点、诊断一页可见，中英双语自动刷新。
> **V4.3.0-4.3.3**：每次备份带上下文（改了什么、为什么备份、哪个 AI 在操作），Intent 意图可追溯。
> **V4.3.4**：运维加固——日志轮转、锁文件保护、restore 预览分组降低 token 消耗。
> **V4.3.5**：修复了备份摘要准确性（增量 diff-tree）；仪表盘变更列分层展示，配色全面优化。
>
> 经过 4 轮代码审查，138+ 个测试覆盖所有核心路径。

### 未来

> 后续版本会让这个保护形成变更闭环、升级为跨工具标准。
> 但你现在用的功能，永远不会被废弃。
> 每一层新能力都是可选增强，不是强制升级。

---

## 附录：不做清单（全版本通用）

无论演进到哪个版本，以下事项明确不做：

| 不做 | 原因 |
|---|---|
| 自动恢复（无人确认） | 恢复操作必须有人确认，这是产品底线 |
| 自动 push 到远程 | 本地优先，push 需用户明确指令 |
| 云端备份服务 | cursor-guard 的定位是本地安全网 |
| ~~Web 仪表盘~~ | ~~投入产出比不合理~~ → V4.2 已实施只读仪表盘（本地、零依赖、不执行写操作） |
| 取代 Git | cursor-guard 是 Git 的增强，不是替代 |
| AI 行为限制 | cursor-guard 是安全网，不是笼子 |
| 多 IDE 全面适配 | 聚焦 Cursor，其他 IDE 由社区或 V6 协议解决 |
| 商业化封闭 | 保持开源，协议保持开放 |
| 中心化认证服务 | 签名和验证基于本地，不引入外部依赖 |

---

*最后更新：2026-03-22*
*版本：v1.5（V4.4.0 收官版，含 Web 仪表盘、备份上下文元数据、Intent 基础、增量 summary、doctor 完整性校验、运维加固、UI 优化）*
