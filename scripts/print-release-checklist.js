#!/usr/bin/env node
'use strict';

/**
 * 打印发版检查清单。唯一版本源：仓库根目录 package.json 的 version。
 * 用法：在 cursor-guard 仓库根目录执行  npm run release:checklist
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const v = pkg.version;
let repoWeb = 'https://github.com/zhangqiang8vipp/cursor-guard';
if (pkg.repository && typeof pkg.repository.url === 'string') {
  repoWeb = pkg.repository.url.replace(/\.git$/i, '').replace(/^git\+/, '');
}

const vsixName = `cursor-guard-ide-${v}.vsix`;

console.log(`
═══════════════════════════════════════════════════════════════════
 发版检查清单（版本源：package.json → version = ${v}）
═══════════════════════════════════════════════════════════════════

| 步骤 | 内容 |
|------|------|
| **1. 版本号** | 先修改本仓库根目录 **package.json** 的 **version**，再构建（build-vsix 会把扩展内 package.json / guard-version.json 对齐到同一版本）。 |
| **2. VSIX** | \`cd references/vscode-extension && node build-vsix.js && cd dist && npx --yes @vscode/vsce package --no-dependencies\` |
| **3. 产物** | **${vsixName}**（位于 references/vscode-extension/dist/） |
| **4. Git** | 提交并推送默认分支；打标签 **v${v}** 并推送：\`git tag -a v${v} -m "v${v}" && git push origin v${v}\`（commit 以实际为准填你的记录表） |
| **5. GitHub Release** | ${repoWeb}/releases/new — 选择 tag **v${v}**，上传 **${vsixName}** |
| **6. release 分支** | 按需将 **release/v4.x.x** 等快进到当前 master（分支策略自定） |
| **7. npm** | 仓库根执行 \`npm publish\`；若提示 OTP，在浏览器完成验证后再执行一次 |

当前 npm 包名：**${pkg.name}@${v}**  ·  扩展 displayName 见 references/vscode-extension/package.json

`);
