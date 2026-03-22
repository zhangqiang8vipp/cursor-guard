# Release guide / 发版流程指南

**Audience / 读者**：本仓库维护者、其他开发者、以及需要代为执行发版步骤的 **AI 助手**（Agent）。  
**Repo / 仓库**：<https://github.com/zhangqiang8vipp/cursor-guard>

**Jump / 跳转**：[English](#english-for-maintainers-and-ai-agents) · [中文（维护者与 AI）](#中文维护者与-ai-助手)

---

## English (for maintainers and AI agents)

### Single source of truth

- All release versions come from the **repository root** `package.json` → field **`version`** (semver, e.g. `4.9.8`).
- `references/vscode-extension/build-vsix.js` reads that value and writes the same version into:
  - `references/vscode-extension/dist/package.json`
  - `references/vscode-extension/dist/guard-version.json`
- The **npm** package name is `cursor-guard@<version>`. The **VSIX** file name is always `cursor-guard-ide-<version>.vsix`.

Never hand-type an old version in release notes while the repo already has a higher `version`.

### Quick machine-readable checklist

From the repo root:

```bash
npm run release:checklist
```

Copy the printed table into your tracker. It is always aligned with the current `package.json`.

### Step-by-step release procedure

1. **Bump version**  
   Edit root `package.json` → `version`. Optionally sync `package-lock.json` (`npm install` or manual bump of the top-level `version` fields).

2. **Run tests (recommended)**  
   ```bash
   npm test
   ```

3. **Build the VSIX**  
   ```bash
   cd references/vscode-extension
   node build-vsix.js
   cd dist
   npx --yes @vscode/vsce package --no-dependencies
   ```  
   Output: `references/vscode-extension/dist/cursor-guard-ide-<version>.vsix`.

4. **Commit**  
   Include source changes, updated `dist/` if your workflow commits it, and the new `.vsix` if you ship it from the repo. Use a clear message, e.g. `release: vX.Y.Z — …`.

5. **Tag and push**  
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin <default-branch>
   git push origin vX.Y.Z
   ```

6. **GitHub Release + attach VSIX**  
   - Create a release for tag `vX.Y.Z` and attach `cursor-guard-ide-X.Y.Z.vsix`.  
   - **Windows + GitHub CLI (`gh`) — avoid mojibake in release notes**  
     On Windows, passing long Chinese (or mixed) text inline with `gh release edit --notes "..."` often corrupts encoding (garbled text on GitHub).  
     **Always** put the body in a **UTF-8** file and use:
     ```bash
     gh release create vX.Y.Z path/to/cursor-guard-ide-X.Y.Z.vsix --title "Cursor Guard vX.Y.Z" --notes-file RELEASE_NOTES.md
     ```
     or for an existing release:
     ```bash
     gh release edit vX.Y.Z --notes-file RELEASE_NOTES.md
     ```
     Save `RELEASE_NOTES.md` as UTF-8 in VS Code / Cursor (default). Keep the release **title** ASCII-only if your shell is unreliable with Unicode.  
   - This repo’s `.gitignore` includes `.release-notes-*.md` so temporary note files are not committed by mistake.

7. **Maintenance branches (optional)**  
   If you use branches like `release/v4.8.x`, fast-forward them to the current default branch when your policy requires it.

8. **npm publish**  
   From the repo root:
   ```bash
   npm publish --access public
   ```  
   If npm returns **EOTP**, open the URL it prints, complete authentication in the browser, then run `npm publish` again. AI agents cannot complete OTP for you.

9. **VS Code Marketplace (optional)**  
   Not required for GitHub Release + VSIX. If you publish there, use a personal access token and `npx @vscode/vsce publish` from `references/vscode-extension/dist` (see VS Code publishing docs).

### Hints for AI agents

- Read root `package.json` → `version` before claiming a release number.  
- Prefer `npm run release:checklist` over inventing version strings.  
- After editing release notes on Windows, use **`gh … --notes-file`** with a UTF-8 file; do not rely on huge `--notes "…"` strings in PowerShell.  
- Do not echo npm OTP URLs as “user must visit” without also explaining they must complete the flow in a real browser.  
- Never paste publish tokens into chat logs.

---

## 中文（维护者与 AI 助手）

### 唯一版本源

- 一切发版版本号以**仓库根目录** `package.json` 的 **`version`** 为准（semver，例如 `4.9.8`）。
- 执行 `references/vscode-extension/build-vsix.js` 时，会把同一版本写入扩展构建产物中的 `package.json` 与 `guard-version.json`。
- **npm** 包为 `cursor-guard@<version>`；**VSIX** 固定命名为 `cursor-guard-ide-<version>.vsix`。

仓库已是新版本时，不要在对外说明里仍写旧的版本号（例如仍写 4.9.5）。

### 一键打印检查表

在仓库根目录：

```bash
npm run release:checklist
```

将终端输出复制到你的发版记录即可，内容与当前 `package.json` 一致。

### 发版步骤（建议顺序）

1. **改版本号**  
   修改根目录 `package.json` 的 `version`。如需，同步 `package-lock.json` 顶部版本字段或执行 `npm install` 更新锁文件。

2. **测试（建议）**  
   ```bash
   npm test
   ```

3. **构建 VSIX**  
   ```bash
   cd references/vscode-extension
   node build-vsix.js
   cd dist
   npx --yes @vscode/vsce package --no-dependencies
   ```  
   得到：`references/vscode-extension/dist/cursor-guard-ide-<version>.vsix`。

4. **Git 提交**  
   按你们仓库习惯包含源码与 `dist/`（若纳入版本控制）及新的 `.vsix`。提交信息建议含 `release: vX.Y.Z`。

5. **打标签并推送**  
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin <默认分支>
   git push origin vX.Y.Z
   ```

6. **GitHub Release 并上传 VSIX**  
   - 为标签 `vX.Y.Z` 创建 Release，上传对应 VSIX。  
   - **Windows 上使用 `gh` 写中文说明时务必注意编码**  
     在 PowerShell 里用很长的 `gh release edit --notes "……中文……"` 容易导致 GitHub 上显示**乱码**。  
     **正确做法**：把正文保存为 **UTF-8** 的 Markdown 文件（如 `RELEASE_NOTES.md`，用 Cursor/VS Code 保存即可），然后执行：
     ```bash
     gh release create vX.Y.Z ./references/vscode-extension/dist/cursor-guard-ide-X.Y.Z.vsix --title "Cursor Guard vX.Y.Z" --notes-file RELEASE_NOTES.md
     ```
     或已有 Release 时：
     ```bash
     gh release edit vX.Y.Z --notes-file RELEASE_NOTES.md
     ```
     **标题**建议只用 ASCII（如 `Cursor Guard v4.9.8`），避免控制台编码问题。  
   - 本仓库 `.gitignore` 已忽略 `.release-notes-*.md`，避免临时说明文件被误提交。

7. **release 维护分支（可选）**  
   若使用 `release/v4.8.x` 等分支，按团队策略决定是否快进到当前默认分支。

8. **npm 发布**  
   在仓库根目录：
   ```bash
   npm publish --access public
   ```  
   若提示 **OTP / 二次验证**，在浏览器完成 npm 提示的认证后**再执行一次** `npm publish`。AI 无法代替你完成浏览器验证。

9. **VS Code 扩展市场（可选）**  
   非必须；多数用户通过 GitHub Release + VSIX 安装即可。若上架市场，需 PAT 与 `vsce publish`（见官方文档）。

### 给其他 AI 助手的摘要

- 发版前先读根目录 `package.json` 的 `version`，不要臆造版本号。  
- 优先执行 `npm run release:checklist` 生成与仓库一致的步骤表。  
- 在 Windows 上更新 GitHub Release 正文时，用 **`gh … --notes-file`** + UTF-8 文件，避免在命令行里直接塞长中文。  
- 不要在对话中粘贴 npm / GitHub 令牌；OTP 必须用户本人在浏览器完成。

---

## Related files / 相关文件

| File | Purpose |
|------|---------|
| `scripts/print-release-checklist.js` | Implements `npm run release:checklist` |
| `references/vscode-extension/build-vsix.js` | Assembles `dist/` and syncs version from root `package.json` |
| `README.md` / `README.zh-CN.md` | Short “Release checklist” sections + link here |
| `.gitignore` | Ignores `.release-notes-*.md` |

---

*Last updated / 最后更新: 2026-03-22（v4.9.9：随包分发与 README 入口）*
