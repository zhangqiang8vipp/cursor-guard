# Cursor Guard — 版本演进规划书

> 本文档描述 cursor-guard 从 V2 到 V7 的长期演进方向。
> 每一代向下兼容，低版本功能永远不废弃。
>
> **当前版本**：`V3.4.0`  
> **文档状态**：`V2` ~ `V3.4` 已实施，`V4+` 规划中

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
| `V4` | 更聪明 | + 主动检测 + 可观测 | "cursor-guard 会主动提醒你" |
| `V5` | 能协调 | + 多 Agent 安全协调 | "多个 AI 同时改代码也安全" |
| `V6` | 成生态 | + 开放协议 + 社区扩展 | "AI 编码安全的行业标准" |
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
| `MCP Server` | `V3.1-V3.4` ✅ 已完成 | 7 个工具，Agent 标准调用入口，结构化 JSON 返回 | 否 |
| `智能提醒 / 可观测` | `V4` 规划 | 主动发现风险、汇总健康状态 | 否 |
| `多 Agent 协调层` | `V5` 规划 | 协调多个 AI 的并发编辑，降低互相覆盖和冲突 | 否 |
| `开放协议` | `V6` 规划 | 把安全规则提炼成跨工具可复用的规范与测试套件 | 否 |
| `治理 / 可验证层` | `V7` 规划 | 让“是否走过安全流程”变成可以证明、可以审计、可以验证的事实 | 否 |

一句话概括：

- `V2` 先把安全网立住
- `V3-V5` 逐步把入口、体验、协作做强
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
V5：让多个 AI 同时工作时也不乱
  ↓
V6：把这些经验提炼成开放协议
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
| 状态 | 概念阶段 💡 |
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

### V4 不做的事

- 不做自动恢复（恢复永远需要人确认，这是产品底线）
- 不做 Web 仪表盘
- 不做云端同步

### 进入 V5 的衡量标准

- V4 的主动提醒功能误报率 < 10%
- 健康看板的信息准确度经用户验证
- 多 Agent 并发编辑已成为用户的真实场景（不是假设）
- MCP 协议的 notification / resource subscription 机制已相对成熟

---

## V5 — 多 Agent 安全协调

| 项目 | 内容 |
|---|---|
| 状态 | 远期愿景 🔭 |
| 定位 | 从保护"一个 Agent 的操作"到协调"多个 Agent 的并发操作"。 |

### 为什么需要这一步

V2-V4 解决的是单 Agent 场景。但行业趋势：
- Cursor 已有 background agent，未来可能多 Agent 并发编辑同一项目
- 一个开发者可能同时使用多种 AI 编码工具
- AI 编辑从"偶尔辅助"变成"持续大量写入"

在这个背景下，"单 Agent 写前快照"已不够。需要的是**跨 Agent 协调**。

### 三个可能方向（选一个）

#### 方向 A：并发编辑安全（最可能的主线）

```
场景：Agent A 在改 src/auth.ts，Agent B 在重构 src/api.ts
      但 api.ts 依赖 auth.ts 的导出

现在：谁后写谁赢，另一个 Agent 的改动可能被覆盖
V5：cursor-guard 感知编辑意向 → 检测潜在冲突 → 发出警告
    冲突发生后能精确回退到每个 Agent 各自的编辑前状态
```

可能的实现：
- 本地轻量协调服务（或利用 MCP resource subscription）
- Agent 编辑前向 cursor-guard 注册 intent
- 维护"编辑会话表"
- 冲突检测基于文件路径（首版）→ 符号级依赖（增强版）

#### 方向 B：变更影响分析

```
现在：cursor-guard 知道 src/auth.ts 被修改了
V5：cursor-guard 知道 validateToken 签名变了，
    而 src/api.ts、src/middleware.ts、tests/auth.test.ts 都依赖它
```

- 对接 TypeScript / 语言服务的符号引用
- 恢复时提供"这次变更涉及的所有文件"而非单个文件
- doctor 检查"最近 AI 编辑是否引入了类型错误/引用断裂"

风险：做太深会变成另一个 lint 工具，需要严格克制边界。

#### 方向 C：AI 编辑审计链

每次 AI 修改留下结构化审计记录（示例为未来格式，`refs/guard/pre-edit/*` 为 V5+ 新增路径，不影响现有 `refs/guard/snapshot` 和 `refs/guard/pre-restore/*`）：

```
[2026-03-21 14:32:05] agent:claude | action:edit | file:src/auth.ts
  intent: "添加 JWT 过期检查"
  lines_changed: 12-28
  snapshot_ref: refs/guard/pre-edit/a3f2c1   ← V5+ 新增 ref 路径
  risk_level: medium
  user_confirmed: true
```

价值：
- 事后追溯"这段代码何时、被谁、因何改的"
- 团队场景可做 AI 编辑的 code review
- 精确定位问题操作链条

### V5 不做的事

- 不做跨机器同步（那是 git remote 的事）
- 不做 AI 行为控制（cursor-guard 是安全网不是笼子）
- 不做通用版本控制（不取代 git）

### 进入 V6 的衡量标准

- V5 的协调机制在真实多 Agent 场景中验证过，冲突检测准确率可接受
- cursor-guard 有一定的用户基数和社区认可度
- AI 编码工具市场格局相对稳定（知道要适配谁）
- 社区出现"跨工具安全标准"的真实需求信号

---

## V6 — 开放生态 + 行业标准

| 项目 | 内容 |
|---|---|
| 状态 | 远期愿景 🔭🔭 |
| 定位 | 从一个 Cursor 插件，变成 AI 编码安全的开放协议和参考实现。 |

### 为什么会走到这一步

到 V5，cursor-guard 已经积累了：
- 一套经过验证的安全规则体系（Skill 层）
- 一个稳定的核心引擎（Core 层）
- 一组标准化的工具接口（MCP 层）
- 多 Agent 协调能力（V5 层）

这些东西并不是 Cursor 独有的需求。任何 AI 编码工具（Windsurf、Copilot Workspace、未来的新工具）都面临同样的问题："AI 改了代码，怎么确保安全？"

V6 的核心判断是：**cursor-guard 解决的问题是通用的，不应该被锁在一个 IDE 里。**

### 三个子方向

#### 方向 A：协议规范化

把 V2-V5 积累的安全规则提炼成一份正式规范：

```
AI Code Safety Protocol v1.0

1. Pre-Write Snapshot
   - MUST create recoverable snapshot before destructive operations
   - Snapshot MUST NOT pollute user's staging area or branch history

2. Recovery Priority
   - Git ref → Shadow copy → Conversation context → Editor history

3. Concurrent Edit Coordination
   - Intent registration → Conflict detection → Advisory warning

4. Audit Trail
   - Structured record format for all AI-initiated edits
```

这份规范是 IDE 无关的。任何工具都可以按规范实现自己的保护层。
cursor-guard 本身变成"这份规范的参考实现"。

配套产出：**协议一致性测试套件（conformance suite）**——第三方实现可以跑这套测试来验证自己是否符合协议。

#### 方向 B：插件化架构

把 cursor-guard 的核心能力拆成可插拔模块：

```
@cursor-guard/core          → 核心引擎（备份/恢复/诊断）
@cursor-guard/mcp           → MCP Server
@cursor-guard/watcher       → 后台自动备份
@cursor-guard/coordinator   → 多 Agent 协调（V5）
@cursor-guard/audit         → 审计链（V5）

社区可开发：
@cursor-guard/plugin-xxx    → 自定义备份策略
@cursor-guard/adapter-yyy   → 其他 IDE 适配器
```

- 定义清晰的 Plugin API
- 社区可以贡献自定义备份策略（如 S3 备份、数据库快照）
- 其他 IDE 的适配器不需要 cursor-guard 官方维护

#### 方向 C：CI/CD 集成

把 AI 编辑审计链对接到开发流程中：

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
  ↓
PR Review 中展示 AI 编辑报告
```

价值：团队层面可见 AI 编辑的影响范围和安全覆盖率。

### V6 不做的事

- **不做商业化平台** —— cursor-guard 保持开源，协议保持开放
- **不做云端服务** —— 核心能力永远是本地优先
- **不做 IDE 本体** —— 只做安全层，不越界
- **不做强制标准** —— 协议是"推荐遵循"，不是"不遵循就不能用"

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
| **一句话** | 能恢复 | 更稳更省 | 主动提醒 | 多 Agent 安全 | 行业标准 | 可证明 |
| **核心架构** | Skill + Script | + Core + MCP | + 智能检测 | + 协调层 | + 开放协议 | + 治理层 |
| **Agent 调用** | 拼 shell | 优先 MCP | MCP + 主动建议 | MCP + 协调 | 标准接口 | 标准接口 + 审计 |
| **安装门槛** | 最低 | 不变 | 不变 | 略增 | 看具体实现 | 看具体实现 |
| **适合谁** | 所有人 | 所有人 | 所有人 | 多 Agent 用户 | 工具开发者 + 团队 | 企业 + 合规场景 |
| **状态** | ✅ 已发布 | ✅ 已完成 | 💡 概念 | 🔭 远期 | 🔭🔭 愿景 | 🔭🔭🔭 愿景 |

---

## 版本推进节奏

```
V2.x  ──────  ✅ 已完成
               │
V3.0  ──────  ✅ Core 抽取（6 模块，83 测试）
V3.1  ──────  ✅ MCP Server 首版（7 工具）
V3.2  ──────  ✅ restore_project 执行模式 + doctor_fix
V3.3  ──────  ✅ backup_status
V3.4  ──────  ✅ MCP 自检                        ← 当前版本
               │
               │  前提：MCP 调用成功率 > 95%，token 消耗可观测下降
               ▼
V4.0  ──────  智能恢复建议 + 备份健康看板
V4.x  ──────  候选支线（完整性校验 / 多项目概览）
               │
               │  前提：多 Agent 并发成为真实场景
               │  前提：MCP notification 机制成熟
               ▼
V5.0  ──────  多 Agent 协调基础版
V5.x  ──────  审计链 / 影响分析
               │
               │  前提：cursor-guard 有社区认可度
               │  前提：跨工具安全标准有真实需求
               ▼
V6.0  ──────  协议规范 + conformance suite
V6.x  ──────  插件架构 / CI/CD 集成 / 社区生态
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

### 现在（V3）

> cursor-guard 已经能保护你的代码。
> 自动备份、写前快照、确定性恢复——开箱即用。
> V3 新增：MCP 工具调用（可选）让 AI 操作更稳、更快、更省 token。
> 自动诊断修复、备份状态一览、全项目恢复——一个工具搞定。

### 未来

> 后续版本会让这个保护更智能、更能应对复杂场景。
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
| Web 仪表盘 | 投入产出比不合理 |
| 取代 Git | cursor-guard 是 Git 的增强，不是替代 |
| AI 行为限制 | cursor-guard 是安全网，不是笼子 |
| 多 IDE 全面适配 | 聚焦 Cursor，其他 IDE 由社区或 V6 协议解决 |
| 商业化封闭 | 保持开源，协议保持开放 |
| 中心化认证服务 | 签名和验证基于本地，不引入外部依赖 |

---

*最后更新：2026-03-21*
*版本：v1.1（V3.4 交付后更新）*
