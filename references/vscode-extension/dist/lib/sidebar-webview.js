'use strict';

const vscode = require('vscode');
const { getLocale, setLocale } = require('./locale');

class SidebarDashboardProvider {
  constructor(poller, context) {
    this._poller = poller;
    this._extensionUri = context?.extensionUri;
    this._localeStorage = context?.globalState;
    this._locale = getLocale(this._localeStorage);
    this._view = null;
    this._sub = poller.onChange(data => this._push(data));
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    const webview = webviewView.webview;
    webview.options = { enableScripts: true };

    let brandInnerHtml = '';
    if (this._extensionUri) {
      const logoUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'media', 'brand-placeholder.png')
      );
      brandInnerHtml =
        '<img class="cg-brand-mark-img" src="' +
        escHtmlAttr(logoUri.toString()) +
        '" alt="" draggable="false" />';
    }

    webview.html = _getHtml(brandInnerHtml);

    webviewView.webview.onDidReceiveMessage(async msg => {
      if (msg.cmd === 'ready') {
        this._postLocale();
        this._push(this._poller.data);
      }
      if (msg.cmd === 'setLocale') {
        this._locale = await setLocale(this._localeStorage, msg.locale);
        this._postLocale();
      }
      if (msg.cmd === 'exec') vscode.commands.executeCommand(msg.command);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._postLocale();
        this._push(this._poller.data);
      }
    });
  }

  _postLocale() {
    if (!this._view) return;
    this._view.webview.postMessage({ type: 'locale', locale: this._locale });
  }

  _push(data) {
    if (!this._view?.visible) return;

    const payload = {};
    for (const [id, project] of data) {
      payload[id] = {
        name: project.name || id,
        dashboard: project.dashboard,
        backups: (project.backups || []).slice(0, 5),
      };
    }

    this._view.webview.postMessage({ type: 'update', data: payload });
  }

  dispose() {
    this._sub?.dispose();
  }
}

function escHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function _getHtml(brandInnerHtml) {
  brandInnerHtml = brandInnerHtml || '';
  const brandMarkClass =
    'cg-brand-mark' + (brandInnerHtml ? ' cg-brand-mark--has-img' : '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
:root {
  --surface: var(--vscode-sideBar-background, #1f2430);
  --surface-2: var(--vscode-editorWidget-background, #252a38);
  --border: var(--vscode-widget-border, rgba(120, 130, 160, 0.22));
  --text: var(--vscode-foreground, #e8eaf0);
  --muted: var(--vscode-descriptionForeground, #9aa4bd);
  --green: var(--vscode-testing-iconPassed, #89d18a);
  --yellow: var(--vscode-editorWarning-foreground, #e4c06a);
  --red: var(--vscode-testing-iconFailed, #f0a0a0);
  --orange: var(--vscode-charts-orange, #f0b070);
  --blue: var(--vscode-textLink-foreground, #8eb6ff);
  --radius: 12px;
  --radius-lg: 14px;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  --shadow-soft: 0 4px 14px rgba(0, 0, 0, 0.12);
  --accent: var(--blue);
  --glow-green: color-mix(in srgb, var(--green) 35%, transparent);
  --glow-blue: color-mix(in srgb, var(--blue) 28%, transparent);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background: transparent;
  -webkit-font-smoothing: antialiased;
}

.cg-shell {
  position: relative;
  padding: 10px 10px 18px;
  min-height: 100%;
  background:
    radial-gradient(120% 80% at 0% -20%, var(--glow-blue), transparent 55%),
    radial-gradient(90% 60% at 100% 0%, var(--glow-green), transparent 45%);
}

.cg-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--surface-2) 75%, transparent);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(8px);
}

.cg-brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, color-mix(in srgb, var(--blue) 55%, #1a1a2e), color-mix(in srgb, var(--green) 40%, #1a1a2e));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent) inset,
    0 4px 12px color-mix(in srgb, var(--blue) 25%, transparent);
}

.cg-brand-mark--has-img {
  background: color-mix(in srgb, var(--surface-2) 88%, var(--text));
  padding: 4px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent) inset,
    0 2px 10px color-mix(in srgb, var(--blue) 18%, transparent);
}

.cg-brand-mark-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
  user-select: none;
}

.cg-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.cg-brand-title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  background: linear-gradient(90deg, var(--text), color-mix(in srgb, var(--text) 72%, var(--blue)));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.cg-brand-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  margin-top: 1px;
}

.cg-brand-sub {
  font-weight: 600;
  opacity: 0.88;
}

.cg-brand-sub--project {
  font-size: 11px;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--text) 92%, var(--muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cg-brand-sub--backup {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.cg-brand-backup-prefix {
  font-weight: 600;
  color: var(--muted);
  margin-right: 2px;
}

#cg-brand-backup .backup-age[data-backup-ts] {
  color: var(--green);
  font-weight: 700;
  letter-spacing: 0.06em;
}

.cg-brand-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
}

.lang-btn {
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
  color: var(--text);
  padding: 6px 11px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.lang-btn:hover {
  border-color: color-mix(in srgb, var(--blue) 55%, var(--border));
  color: var(--blue);
  box-shadow: var(--shadow-soft);
}

.lang-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--blue) 70%, transparent);
  outline-offset: 2px;
}

.empty {
  padding: 26px 12px;
  text-align: center;
  color: var(--muted);
}

.hero {
  position: relative;
  margin-bottom: 12px;
  padding: 16px 14px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 92%, transparent);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.hero::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  height: 3px;
  opacity: 0.85;
  background: linear-gradient(90deg, var(--muted), var(--muted));
  pointer-events: none;
}

.hero.protected::before {
  background: linear-gradient(90deg, var(--green), var(--blue));
  box-shadow: 0 0 16px var(--glow-green);
}

.hero.risk::before {
  background: linear-gradient(90deg, var(--orange), var(--yellow));
}

.hero.alert::before,
.hero.critical::before {
  background: linear-gradient(90deg, var(--red), var(--orange));
}

.hero.stopped::before {
  background: linear-gradient(90deg, var(--yellow), var(--muted));
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hero-top .hero-kicker {
  margin: 0;
}

.cg-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 45%, transparent);
  animation: cg-pulse 2.2s ease-out infinite;
  flex-shrink: 0;
}

@keyframes cg-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green) 45%, transparent); opacity: 1; }
  70% { box-shadow: 0 0 0 8px transparent; opacity: 0.85; }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .cg-pulse-dot { animation: none; box-shadow: 0 0 6px color-mix(in srgb, var(--green) 35%, transparent); }
  .card { transition: none; }
  .card-chevron { transition: none; }
  .card-head { transition: none; }
  .btn { transition: none; }
  .lang-btn { transition: none; }
}

.hero.risk {
  border-color: rgba(244, 179, 110, 0.45);
  background: rgba(244, 179, 110, 0.12);
}

.hero.alert {
  border-color: rgba(242, 159, 159, 0.45);
  background: rgba(242, 159, 159, 0.12);
}

.hero.stopped {
  border-color: rgba(245, 213, 133, 0.45);
  background: rgba(245, 213, 133, 0.10);
}

.hero.critical {
  border-color: rgba(242, 159, 159, 0.60);
  background: rgba(242, 159, 159, 0.16);
}

.hero.protected {
  border-color: rgba(154, 215, 162, 0.45);
  background: rgba(154, 215, 162, 0.10);
}

.hero-kicker {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  opacity: 0.92;
}

.hero-title {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.hero-sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.95;
}

.card {
  position: relative;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--surface-2) 100%, var(--text)) 0%,
    color-mix(in srgb, var(--surface-2) 96%, transparent) 100%
  );
  box-shadow: var(--shadow);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  border-color: color-mix(in srgb, var(--border) 70%, var(--blue));
  box-shadow: var(--shadow-soft);
}

.card.risk-card {
  border-color: rgba(244, 179, 110, 0.45);
}

.card.alert-card {
  border-color: rgba(242, 159, 159, 0.45);
}

.card.cg-collapsible {
  padding-top: 0;
  padding-bottom: 12px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: calc(100% + 28px);
  margin: 0 -14px 0 -14px;
  padding: 12px 14px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  transition: background 0.15s ease;
}

.card-head:hover {
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.card.cg-collapsible.is-collapsed .card-head {
  border-bottom-color: transparent;
}

.card-head .card-title {
  margin: 0;
  padding: 0;
  border: none;
  flex: 1;
  min-width: 0;
}

.card-title {
  margin-bottom: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.card-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1;
  color: var(--muted);
  background: color-mix(in srgb, var(--text) 6%, transparent);
  transition: transform 0.2s ease, background 0.15s ease;
  flex-shrink: 0;
}

.card-head:hover .card-chevron {
  background: color-mix(in srgb, var(--text) 10%, transparent);
  color: var(--text);
}

.card.is-collapsed .card-chevron {
  transform: rotate(-90deg);
}

.card-panel {
  padding-top: 12px;
}

.card-panel .actions {
  margin-top: 10px;
}

.card.is-collapsed .card-panel {
  display: none;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 5px 0;
}

.row-name {
  color: var(--muted);
}

.row-value {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.row-value.green { color: var(--green); }
.row-value.blue { color: var(--blue); }
.row-value.yellow { color: var(--yellow); }
.row-value.orange { color: var(--orange); }
.row-value.red { color: var(--red); }

.pill-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}

.pill.green { background: rgba(154, 215, 162, 0.12); color: var(--green); }
.pill.red { background: rgba(242, 159, 159, 0.12); color: var(--red); }
.pill.orange { background: rgba(244, 179, 110, 0.12); color: var(--orange); }
.pill.dim { background: rgba(154, 164, 189, 0.12); color: var(--muted); }

.tag-group { margin-top: 8px; }
.tag-label {
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font: 10px/1.45 ui-monospace, Consolas, "Cascadia Code", monospace;
}

.tag.green {
  color: var(--green);
  border-color: rgba(154, 215, 162, 0.3);
  background: rgba(154, 215, 162, 0.08);
}

.tag.red {
  color: var(--red);
  border-color: rgba(242, 159, 159, 0.3);
  background: rgba(242, 159, 159, 0.08);
}

.tag.dim {
  color: var(--muted);
}

.cg-actions-wrap {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 0;
}

.btn {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface-2) 88%, var(--text));
  color: var(--text);
  padding: 9px 8px;
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.btn:hover {
  border-color: color-mix(in srgb, var(--blue) 55%, var(--border));
  color: var(--blue);
  box-shadow: var(--shadow-soft);
}

.btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--blue) 70%, transparent);
  outline-offset: 2px;
}

.btn.primary {
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--blue) 22%, var(--surface-2)),
    color-mix(in srgb, var(--blue) 10%, var(--surface-2))
  );
  border-color: color-mix(in srgb, var(--blue) 45%, var(--border));
}

.btn.primary:hover {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--blue) 25%, transparent), var(--shadow-soft);
}

.btn.full {
  grid-column: 1 / -1;
}
</style>
</head>
<body>
<div class="cg-shell">
  <header class="cg-brand" aria-label="Cursor Guard">
    <div class="${brandMarkClass}" aria-hidden="true">${brandInnerHtml}</div>
    <div class="cg-brand-text">
      <span class="cg-brand-title" id="cg-brand-title">Cursor Guard</span>
      <div class="cg-brand-meta">
        <span class="cg-brand-sub cg-brand-sub--project" id="cg-brand-project">-</span>
        <div class="cg-brand-sub cg-brand-sub--backup" id="cg-brand-backup">
          <span class="cg-brand-backup-prefix" id="cg-brand-backup-prefix" hidden>Last backup </span><span id="cg-brand-backup-age" class="backup-age">-</span>
        </div>
      </div>
    </div>
    <div class="cg-brand-tools">
      <button id="lang-toggle" class="lang-btn" type="button">中文</button>
    </div>
  </header>
  <div id="root">
    <div class="empty">Waiting for data...</div>
  </div>
</div>
<script>
const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
const brandTitle = document.getElementById('cg-brand-title');
const brandProject = document.getElementById('cg-brand-project');
const brandBackupPrefix = document.getElementById('cg-brand-backup-prefix');
const brandBackupAge = document.getElementById('cg-brand-backup-age');
const langToggle = document.getElementById('lang-toggle');
const savedState = vscode.getState() || {};
let _locale = savedState.locale || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
let _alertExpiresAt = 0;
let _projects = {};

const I18N = {
  'en-US': {
    'chrome.title': 'Cursor Guard',
    'chrome.switch': '\u4e2d\u6587',
    'state.waiting': 'Waiting for data...',
    'state.loading': 'Loading...',
    'state.empty': 'No projects detected.<br>Add .cursor-guard.json to get started.',
    'brand.noWorkspace': 'No workspace',
    'brand.addConfig': 'Add .cursor-guard.json',
    'brand.loadingBackup': 'Loading backup...',
    'brand.noGitBackup': 'No Git backup yet',
    'brand.backupPrefix': 'Last backup',
    'hero.pre.kicker': 'Pre-Warning',
    'hero.pre.title': 'Delete Risk',
    'hero.pre.subtitle': 'Review pending destructive edit',
    'hero.alert.kicker': 'Change Alert',
    'hero.alert.subtitle': 'Abnormal change velocity detected',
    'hero.protection.kicker': 'Protection',
    'hero.protection.stopped': 'Watcher Stopped',
    'hero.protection.stoppedSub': 'Start watcher to enable continuous protection',
    'hero.health.kicker': 'Health',
    'hero.health.critical': 'Critical Issue',
    'hero.health.check': 'Check diagnostics',
    'hero.protection.safe': 'Protected',
    'hero.protection.safeSub': 'Watcher running and backups healthy',
    'card.deletionRisk': 'Deletion Risk',
    'card.activeAlert': 'Active Alert',
    'card.quickStats': 'Quick Stats',
    'card.protectionScope': 'Protection Scope',
    'row.file': 'File',
    'row.risk': 'Risk',
    'row.methodsRemoved': 'Methods removed',
    'row.summary': 'Summary',
    'row.window': 'Window',
    'row.files': 'Files',
    'row.threshold': 'Threshold',
    'row.expires': 'Expires',
    'row.watcher': 'Watcher',
    'row.health': 'Health',
    'row.lastBackup': 'Last backup',
    'row.gitBackups': 'Git backups',
    'row.shadowCopies': 'Shadow copies',
    'row.diskFree': 'Disk free',
    'status.watcher.running': 'Running',
    'status.watcher.stale': 'Stale Lock',
    'status.watcher.stopped': 'Stopped',
    'status.health.healthy': 'Healthy',
    'status.health.warning': 'Warning',
    'status.health.critical': 'Critical',
    'pill.protected': '{n} protected',
    'pill.excluded': '{n} excluded',
    'pill.total': '{n} total',
    'tag.protect': 'Protect',
    'tag.ignore': 'Ignore',
    'tag.more': '+{n} more',
    'actions.openDashboard': 'Open Dashboard',
    'actions.restore': 'Restore',
    'actions.viewDetails': 'View Details',
    'actions.snapshot': 'Snapshot',
    'actions.watcherOn': 'Stop Watcher',
    'actions.watcherOff': 'Start Watcher',
    'actions.doctor': 'Doctor',
    'stats.never': 'never',
    'misc.unknown': 'Unknown',
    'misc.na': 'N/A',
    'time.secondsAgo': '{n}s ago',
    'time.minutesAgo': '{m}m {s}s ago',
    'time.hoursAgo': '{h}h {m}m ago',
    'time.daysAgo': '{d}d ago',
    'time.seconds': '{n}s',
    'time.minutes': '{m}m {s}s',
    'alert.filesChangedFast': '{count} files changed fast'
  },
  'zh-CN': {
    'chrome.title': 'Cursor Guard',
    'chrome.switch': 'EN',
    'state.waiting': '绛夊緟鏁版嵁涓?..',
    'state.loading': '鍔犺浇涓?..',
    'state.empty': '鏈娴嬪埌椤圭洰銆?br>娣诲姞 .cursor-guard.json 鍚庡嵆鍙惎鐢ㄣ€?,
    'hero.pre.kicker': '浜嬪厛棰勮',
    'hero.pre.title': '鍒犻櫎椋庨櫓',
    'hero.pre.subtitle': '璇峰厛妫€鏌ヨ繖娆＄牬鍧忔€х紪杈?,
    'hero.alert.kicker': '鍙樻洿鍛婅',
    'hero.alert.subtitle': '妫€娴嬪埌寮傚父楂橀鏂囦欢鍙樻洿',
    'hero.protection.kicker': '淇濇姢鐘舵€?,
    'hero.protection.stopped': 'Watcher 鏈繍琛?,
    'hero.protection.stoppedSub': '鍚姩 watcher 浠ュ紑鍚寔缁繚鎶?,
    'hero.health.kicker': '鍋ュ悍鐘舵€?,
    'hero.health.critical': '涓ラ噸闂',
    'hero.health.check': '璇锋鏌ヨ瘖鏂粨鏋?,
    'hero.protection.safe': '淇濇姢涓?,
    'hero.protection.safeSub': 'Watcher 姝ｅ湪杩愯锛屽浠界姸鎬佸仴搴?,
    'card.deletionRisk': '鍒犻櫎椋庨櫓',
    'card.activeAlert': '娲昏穬鍛婅',
    'card.quickStats': '蹇€熸瑙?,
    'card.protectionScope': '淇濇姢鑼冨洿',
    'row.file': '鏂囦欢',
    'row.risk': '椋庨櫓',
    'row.methodsRemoved': '绉婚櫎鐨勬柟娉曟暟',
    'row.summary': '鎽樿',
    'row.window': '绐楀彛',
    'row.files': '鏂囦欢鏁?,
    'row.threshold': '闃堝€?,
    'row.expires': '鍓╀綑鏃堕棿',
    'row.watcher': '\u76d1\u63a7',
    'row.health': '\u5065\u5eb7',
    'row.lastBackup': '涓婃澶囦唤',
    'row.gitBackups': 'Git 澶囦唤鏁?,
    'row.shadowCopies': 'Shadow 澶囦唤鏁?,
    'row.diskFree': '鍓╀綑纾佺洏',
    'status.watcher.running': '\u8fd0\u884c\u4e2d',
    'status.watcher.stale': '\u9501\u6b8b\u7559',
    'status.watcher.stopped': '\u5df2\u505c\u6b62',
    'status.health.healthy': '\u5065\u5eb7',
    'status.health.warning': '\u8b66\u544a',
    'status.health.critical': '\u4e25\u91cd',
    'pill.protected': '{n} 涓彈淇濇姢',
    'pill.excluded': '{n} 涓帓闄?,
    'pill.total': '{n} 涓€昏',
    'tag.protect': '淇濇姢',
    'tag.ignore': '蹇界暐',
    'tag.more': '+{n} 涓洿澶?,
    'actions.openDashboard': '鎵撳紑鐪嬫澘',
    'actions.restore': '鎭㈠',
    'actions.viewDetails': '鏌ョ湅璇︽儏',
    'actions.snapshot': '绔嬪嵆蹇収',
    'actions.watcherOn': '\u505c\u6b62 Watcher',
    'actions.watcherOff': '\u542f\u52a8 Watcher',
    'actions.doctor': '璇婃柇',
    'brand.noWorkspace': '\u65e0\u5de5\u4f5c\u533a',
    'brand.addConfig': '\u6dfb\u52a0 .cursor-guard.json',
    'brand.loadingBackup': '\u5907\u4efd\u4fe1\u606f\u52a0\u8f7d\u4e2d...',
    'brand.noGitBackup': '\u6682\u65e0 Git \u5907\u4efd',
    'brand.backupPrefix': '\u4e0a\u6b21\u5907\u4efd',
    'stats.never': '\u4ece\u672a',
    'misc.unknown': '\u672a\u77e5',
    'misc.na': 'N/A',
    'time.secondsAgo': '{n} 绉掑墠',
    'time.minutesAgo': '{m} 鍒?{s} 绉掑墠',
    'time.hoursAgo': '{h} 灏忔椂 {m} 鍒嗗墠',
    'time.daysAgo': '{d} 澶╁墠',
    'time.seconds': '{n} 绉?,
    'time.minutes': '{m} 鍒?{s} 绉?,
    'alert.filesChangedFast': '{count} 涓枃浠跺揩閫熷彉鏇?
  }
};

function t(key, params) {
  const dict = I18N[_locale] || I18N['en-US'];
  let value = dict[key] || I18N['en-US'][key] || key;
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replaceAll('{' + name + '}', String(replacement));
  }
  return value;
}

function setLocale(locale, opts) {
  _locale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  document.documentElement.lang = _locale === 'zh-CN' ? 'zh-CN' : 'en';
  vscode.setState({ locale: _locale });
  if (!opts || opts.syncHost !== false) {
    vscode.postMessage({ cmd: 'setLocale', locale: _locale });
  }
  updateChrome();
  if (!opts || opts.render !== false) {
    render(_projects);
  }
}

function toggleLocale() {
  setLocale(_locale === 'zh-CN' ? 'en-US' : 'zh-CN');
}

function updateChrome() {
  document.documentElement.lang = _locale === 'zh-CN' ? 'zh-CN' : 'en';
  brandTitle.textContent = t('chrome.title');
  langToggle.textContent = t('chrome.switch');
  updateBrandBar(_projects);
}

function formatRelativeAge(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return t('time.secondsAgo', { n: sec });
  if (sec < 3600) return t('time.minutesAgo', { m: Math.floor(sec / 60), s: sec % 60 });
  if (sec < 86400) return t('time.hoursAgo', { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) });
  return t('time.daysAgo', { d: Math.floor(sec / 86400) });
}

function formatCountdown(seconds) {
  if (seconds > 60) return t('time.minutes', { m: Math.floor(seconds / 60), s: seconds % 60 });
  return t('time.seconds', { n: seconds });
}

function displayCount(value) {
  return value == null ? '?' : String(value);
}

function pickPrimaryProject(projects) {
  const ids = Object.keys(projects || {});
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (projects[id] && projects[id].dashboard) return { id, project: projects[id], ids };
  }
  if (ids.length) return { id: ids[0], project: projects[ids[0]], ids };
  return null;
}

function updateBrandBar(projects) {
  const primary = pickPrimaryProject(projects || {});

  if (!primary) {
    brandProject.textContent = t('brand.noWorkspace');
    brandProject.removeAttribute('title');
    brandBackupPrefix.hidden = true;
    brandBackupPrefix.textContent = t('brand.backupPrefix') + ' ';
    brandBackupAge.removeAttribute('data-backup-ts');
    brandBackupAge.textContent = t('brand.addConfig');
    return;
  }

  const project = primary.project || {};
  const dashboard = project.dashboard;
  let name = project.name || primary.id;
  if (primary.ids.length > 1) {
    name += ' +' + (primary.ids.length - 1);
  }
  brandProject.textContent = name;
  brandProject.title = name;

  if (!dashboard) {
    brandBackupPrefix.hidden = true;
    brandBackupPrefix.textContent = t('brand.backupPrefix') + ' ';
    brandBackupAge.removeAttribute('data-backup-ts');
    brandBackupAge.textContent = t('brand.loadingBackup');
    return;
  }

  const gitTs = dashboard.lastBackup?.git?.timestamp;
  if (gitTs) {
    const ts = new Date(gitTs).getTime();
    brandBackupPrefix.hidden = false;
    brandBackupPrefix.textContent = t('brand.backupPrefix') + ' ';
    brandBackupAge.dataset.backupTs = String(ts);
    brandBackupAge.textContent = formatRelativeAge(ts);
  } else {
    brandBackupPrefix.hidden = true;
    brandBackupPrefix.textContent = t('brand.backupPrefix') + ' ';
    brandBackupAge.removeAttribute('data-backup-ts');
    brandBackupAge.textContent = t('brand.noGitBackup');
  }
}

window.addEventListener('message', event => {
  if (event.data.type === 'locale') {
    setLocale(event.data.locale, { syncHost: false });
    return;
  }
  if (event.data.type === 'update') render(event.data.data);
});

langToggle.addEventListener('click', toggleLocale);
updateChrome();
root.innerHTML = '<div class="empty">' + t('state.waiting') + '</div>';
vscode.postMessage({ cmd: 'ready' });

setInterval(() => {
  if (_alertExpiresAt) {
    const el = document.querySelector('.alert-countdown');
    if (el) {
      const remain = Math.max(0, Math.ceil((_alertExpiresAt - Date.now()) / 1000));
      if (remain <= 0) {
        el.textContent = formatCountdown(0);
        _alertExpiresAt = 0;
      } else {
        el.textContent = formatCountdown(remain);
      }
    }
  }

  document.querySelectorAll('.backup-age[data-backup-ts]').forEach(ageEl => {
    const ts = parseInt(ageEl.dataset.backupTs, 10);
    if (!ts) return;
    ageEl.textContent = formatRelativeAge(ts);
  });
}, 1000);

function render(projects) {
  _projects = projects || {};
  const ids = Object.keys(_projects);
  if (ids.length === 0) {
    root.innerHTML = '<div class="empty">' + t('state.empty') + '</div>';
    updateBrandBar(_projects);
    return;
  }

  let html = '';
  for (const id of ids) {
    const project = _projects[id];
    const dashboard = project.dashboard;
    if (!dashboard) {
      html += '<div class="empty">' + esc(t('state.loading')) + '</div>';
      continue;
    }
    html += renderProject(dashboard);
  }
  html += renderActions(_projects);
  root.innerHTML = html;
  updateBrandBar(_projects);

  const alertCard = root.querySelector('.alert-card[data-expires]');
  _alertExpiresAt = alertCard ? parseInt(alertCard.dataset.expires, 10) || 0 : 0;

  root.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      vscode.postMessage({ cmd: 'exec', command: btn.dataset.cmd });
    });
  });
}

function renderProject(dashboard) {
  const watcherRunning = dashboard.watcher?.running;
  const latestPreWarning = dashboard.preWarnings?.active ? dashboard.preWarnings.latest : null;
  const preWarning = latestPreWarning?.mode === 'dashboard' ? latestPreWarning : null;
  const alert = dashboard.alerts?.active ? dashboard.alerts.latest : null;
  const health = dashboard.health?.status || 'unknown';
  const critical = health === 'critical';
  let html = '';

  if (preWarning) {
    html += hero('risk', t('hero.pre.kicker'), t('hero.pre.title'), preWarning.summary || t('hero.pre.subtitle'));
  } else if (alert) {
    html += hero('alert', t('hero.alert.kicker'), t('alert.filesChangedFast', { count: displayCount(alert.fileCount) }), t('hero.alert.subtitle'));
  } else if (!watcherRunning) {
    html += hero('stopped', t('hero.protection.kicker'), t('hero.protection.stopped'), t('hero.protection.stoppedSub'));
  } else if (critical) {
    html += hero('critical', t('hero.health.kicker'), t('hero.health.critical'), dashboard.health.issues?.[0] || t('hero.health.check'));
  } else {
    html += hero('protected', t('hero.protection.kicker'), t('hero.protection.safe'), t('hero.protection.safeSub'), { live: true });
  }

  if (preWarning) {
    html += '<div class="card risk-card">';
    html += '<div class="card-title">' + esc(t('card.deletionRisk')) + '</div>';
    html += row(t('row.file'), esc(preWarning.file || 'Unknown'), 'orange');
    html += row(t('row.risk'), esc(String(preWarning.riskPercent || '?')) + '%', 'orange');
    if (preWarning.removedMethodCount) {
      html += row(t('row.methodsRemoved'), esc(String(preWarning.removedMethodCount)), 'red');
    }
    html += row(t('row.summary'), esc(preWarning.summary || t('hero.pre.subtitle')), 'orange');
    html += '<div class="actions">';
    html += '<button class="btn" data-cmd="cursorGuard.openDashboard">' + esc(t('actions.openDashboard')) + '</button>';
    html += '<button class="btn" data-cmd="cursorGuard.quickRestore">' + esc(t('actions.restore')) + '</button>';
    html += '</div>';
    html += '</div>';
  }

  if (alert) {
    const expiresTs = alert.expiresAt ? new Date(alert.expiresAt).getTime() : 0;
    const remain = expiresTs ? Math.max(0, Math.ceil((expiresTs - Date.now()) / 1000)) : 0;
    const display = formatCountdown(remain);
    html += '<div class="card alert-card" data-expires="' + expiresTs + '">';
    html += '<div class="card-title">' + esc(t('card.activeAlert')) + '</div>';
    html += row(t('row.window'), (alert.windowSeconds || '?') + 's', 'red');
    html += row(t('row.files'), String(alert.fileCount || '?'), 'red');
    html += row(t('row.threshold'), String(alert.threshold || '?'), 'yellow');
    html += row(t('row.expires'), '<span class="alert-countdown">' + esc(display) + '</span>', 'yellow', true);
    html += '<div class="actions">';
    html += '<button class="btn" data-cmd="cursorGuard.openDashboard">' + esc(t('actions.viewDetails')) + '</button>';
    html += '</div>';
    html += '</div>';
  }

  const gitCount = dashboard.counts?.git?.commits || 0;
  const shadowCount = dashboard.counts?.shadow?.snapshots || 0;
  const lastGitTs = dashboard.lastBackup?.git?.timestamp || '';
  const lastGit = dashboard.lastBackup?.git?.relativeTime || t('stats.never');
  const freeGB = dashboard.disk?.freeGB;
  const freeDisplay = typeof freeGB === 'number' ? freeGB.toFixed(1) + ' GB' : 'N/A';
  const diskWarn = dashboard.disk?.warning;
  const watcherInfo = watcherStateInfo(dashboard);
  const healthInfo = healthStateInfo(dashboard);

  html += '<div class="card">';
  html += '<div class="card-title">' + esc(t('card.quickStats')) + '</div>';
  html += row(t('row.watcher'), watcherInfo.label, watcherInfo.tone);
  html += row(t('row.health'), healthInfo.label, healthInfo.tone);
  if (lastGitTs) {
    html += '<div class="row"><span class="row-name">' + esc(t('row.lastBackup')) + '</span><span class="row-value green backup-age" data-backup-ts="' + new Date(lastGitTs).getTime() + '">' + esc(formatRelativeAge(new Date(lastGitTs).getTime())) + '</span></div>';
  } else {
    html += row(t('row.lastBackup'), lastGit, 'green');
  }
  html += row(t('row.gitBackups'), String(gitCount), 'blue');
  if (shadowCount > 0) html += row(t('row.shadowCopies'), String(shadowCount), 'blue');
  html += row(t('row.diskFree'), freeDisplay, diskWarn ? 'yellow' : 'green');
  html += '</div>';

  const scope = dashboard.protectionScope || {};
  const protect = scope.protect || [];
  const ignore = scope.ignore || [];

  html += '<div class="card">';
  html += '<div class="card-title">' + esc(t('card.protectionScope')) + '</div>';
  html += '<div class="pill-wrap">';
  html += '<span class="pill green">' + esc(t('pill.protected', { n: String(scope.fileCount || 0) })) + '</span>';
  if ((scope.excludedCount || 0) > 0) {
    html += '<span class="pill red">' + esc(t('pill.excluded', { n: String(scope.excludedCount || 0) })) + '</span>';
  }
  html += '<span class="pill dim">' + esc(t('pill.total', { n: String(scope.totalFiles || 0) })) + '</span>';
  html += '</div>';

  if (protect.length > 0) {
    html += renderTags(t('tag.protect'), protect, 'green');
  }
  if (ignore.length > 0) {
    html += renderTags(t('tag.ignore'), ignore, 'red');
  }
  html += '</div>';

  return html;
}

function renderTags(label, values, tone) {
  let html = '<div class="tag-group">';
  html += '<div class="tag-label">' + esc(label) + ' (' + values.length + ')</div>';
  html += '<div class="tag-list">';
  const shown = values.slice(0, 6);
  for (const value of shown) {
    html += '<span class="tag ' + tone + '">' + esc(value) + '</span>';
  }
  if (values.length > 6) {
    html += '<span class="tag dim">' + esc(t('tag.more', { n: values.length - 6 })) + '</span>';
  }
  html += '</div></div>';
  return html;
}

function watcherStateInfo(dashboard) {
  const watcher = dashboard?.watcher || {};
  if (watcher.running) return { label: t('status.watcher.running'), tone: 'green' };
  if (watcher.stale) return { label: t('status.watcher.stale'), tone: 'yellow' };
  return { label: t('status.watcher.stopped'), tone: 'red' };
}

function healthStateInfo(dashboard) {
  const health = dashboard?.health?.status || 'warning';
  if (health === 'critical') return { label: t('status.health.critical'), tone: 'red' };
  if (health === 'healthy') return { label: t('status.health.healthy'), tone: 'green' };
  return { label: t('status.health.warning'), tone: 'yellow' };
}

function renderActions(projects) {
  const primary = pickPrimaryProject(projects || {});
  const dashboard = primary?.project?.dashboard || null;
  const watcherRunning = dashboard?.watcher?.running;

  let html = '<div class="cg-actions-wrap"><div class="actions">';
  html += '<button class="btn primary" data-cmd="cursorGuard.snapshotNow">' + esc(t('actions.snapshot')) + '</button>';
  html += '<button class="btn" data-cmd="cursorGuard.quickRestore">' + esc(t('actions.restore')) + '</button>';
  html += watcherRunning
    ? '<button class="btn" data-cmd="cursorGuard.stopWatcher">' + esc(t('actions.watcherOn')) + '</button>'
    : '<button class="btn" data-cmd="cursorGuard.startWatcher">' + esc(t('actions.watcherOff')) + '</button>';
  html += '<button class="btn" data-cmd="cursorGuard.doctor">' + esc(t('actions.doctor')) + '</button>';
  html += '<button class="btn primary full" data-cmd="cursorGuard.openDashboard">' + esc(t('actions.openDashboard')) + '</button>';
  html += '</div></div>';
  return html;
}

function hero(tone, kicker, title, subtitle, opts) {
  const pulse = opts && opts.live ? '<span class="cg-pulse-dot" title="Watcher running"></span>' : '';
  let html = '<div class="hero ' + tone + '">';
  html += '<div class="hero-top">';
  html += '<div class="hero-kicker">' + esc(kicker) + '</div>';
  html += pulse;
  html += '</div>';
  html += '<div class="hero-title">' + esc(title) + '</div>';
  html += '<div class="hero-sub">' + esc(subtitle) + '</div>';
  html += '</div>';
  return html;
}

function row(name, value, tone, rawValue) {
  return '<div class="row"><span class="row-name">' + esc(name) + '</span><span class="row-value ' + tone + '">' + (rawValue ? value : esc(String(value))) + '</span></div>';
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
</script>
</body>
</html>`;
}

module.exports = { SidebarDashboardProvider };




