'use strict';

const vscode = require('vscode');
const { getLocale, setLocale } = require('./locale');

class SidebarDashboardProvider {
  constructor(poller, context) {
    this._poller = poller;
    this._localeStorage = context?.globalState;
    this._locale = getLocale(this._localeStorage);
    this._view = null;
    this._sub = poller.onChange(data => this._push(data));
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = _getHtml();

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

function _getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
:root {
  --surface: #1f2430;
  --surface-2: #2b3141;
  --border: #3b4357;
  --text: #eef2ff;
  --muted: #9aa4bd;
  --green: #9ad7a2;
  --yellow: #f5d585;
  --red: #f29f9f;
  --orange: #f4b36e;
  --blue: #9fc3ff;
  --radius: 10px;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 10px;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: transparent;
}

.empty {
  padding: 26px 12px;
  text-align: center;
  color: var(--muted);
}

.hero {
  margin-bottom: 10px;
  padding: 14px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.04);
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
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.hero-title {
  margin-top: 3px;
  font-size: 16px;
  font-weight: 700;
}

.hero-sub {
  margin-top: 4px;
  color: var(--muted);
}

.card {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.card.risk-card {
  border-color: rgba(244, 179, 110, 0.45);
}

.card.alert-card {
  border-color: rgba(242, 159, 159, 0.45);
}

.card-title {
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 3px 0;
}

.row-name {
  color: var(--muted);
}

.row-value {
  text-align: right;
  font-weight: 600;
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
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
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
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font: 10px/1.4 Consolas, "Cascadia Code", monospace;
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

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.btn {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  padding: 8px 6px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.btn:hover {
  border-color: var(--blue);
  color: var(--blue);
}

.btn.primary {
  background: rgba(159, 195, 255, 0.10);
  border-color: rgba(159, 195, 255, 0.35);
}

.btn.full {
  grid-column: 1 / -1;
}

.shell-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.shell-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.lang-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  padding: 4px 10px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.lang-btn:hover {
  border-color: var(--blue);
  color: var(--blue);
}
</style>
</head>
<body>
<div class="shell-topbar">
  <div id="shell-title" class="shell-title">Cursor Guard Sidebar</div>
  <button id="lang-toggle" class="lang-btn" type="button">中文</button>
</div>
<div id="root">
  <div class="empty">Waiting for data...</div>
</div>
<script>
const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
const shellTitle = document.getElementById('shell-title');
const langToggle = document.getElementById('lang-toggle');
const savedState = vscode.getState() || {};
let _locale = savedState.locale || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
let _alertExpiresAt = 0;
let _projects = {};

const I18N = {
  'en-US': {
    'chrome.title': 'Cursor Guard Sidebar',
    'chrome.switch': '中文',
    'state.waiting': 'Waiting for data...',
    'state.loading': 'Loading...',
    'state.empty': 'No projects detected.<br>Add .cursor-guard.json to get started.',
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
    'time.secondsAgo': '{n}s ago',
    'time.minutesAgo': '{m}m {s}s ago',
    'time.hoursAgo': '{h}h {m}m ago',
    'time.daysAgo': '{d}d ago',
    'time.seconds': '{n}s',
    'time.minutes': '{m}m {s}s',
    'alert.filesChangedFast': '{count} files changed fast'
  },
  'zh-CN': {
    'chrome.title': 'Cursor Guard 侧边栏',
    'chrome.switch': 'EN',
    'state.waiting': '等待数据中...',
    'state.loading': '加载中...',
    'state.empty': '未检测到项目。<br>添加 .cursor-guard.json 后即可启用。',
    'hero.pre.kicker': '事先预警',
    'hero.pre.title': '删除风险',
    'hero.pre.subtitle': '请先检查这次破坏性编辑',
    'hero.alert.kicker': '变更告警',
    'hero.alert.subtitle': '检测到异常高频文件变更',
    'hero.protection.kicker': '保护状态',
    'hero.protection.stopped': 'Watcher 未运行',
    'hero.protection.stoppedSub': '启动 watcher 以开启持续保护',
    'hero.health.kicker': '健康状态',
    'hero.health.critical': '严重问题',
    'hero.health.check': '请检查诊断结果',
    'hero.protection.safe': '保护中',
    'hero.protection.safeSub': 'Watcher 正在运行，备份状态健康',
    'card.deletionRisk': '删除风险',
    'card.activeAlert': '活跃告警',
    'card.quickStats': '快速概览',
    'card.protectionScope': '保护范围',
    'row.file': '文件',
    'row.risk': '风险',
    'row.methodsRemoved': '移除的方法数',
    'row.summary': '摘要',
    'row.window': '窗口',
    'row.files': '文件数',
    'row.threshold': '阈值',
    'row.expires': '剩余时间',
    'row.watcher': '\u76d1\u63a7',
    'row.health': '\u5065\u5eb7',
    'row.lastBackup': '上次备份',
    'row.gitBackups': 'Git 备份数',
    'row.shadowCopies': 'Shadow 备份数',
    'row.diskFree': '剩余磁盘',
    'status.watcher.running': '\u8fd0\u884c\u4e2d',
    'status.watcher.stale': '\u9501\u6b8b\u7559',
    'status.watcher.stopped': '\u5df2\u505c\u6b62',
    'status.health.healthy': '\u5065\u5eb7',
    'status.health.warning': '\u8b66\u544a',
    'status.health.critical': '\u4e25\u91cd',
    'pill.protected': '{n} 个受保护',
    'pill.excluded': '{n} 个排除',
    'pill.total': '{n} 个总计',
    'tag.protect': '保护',
    'tag.ignore': '忽略',
    'tag.more': '+{n} 个更多',
    'actions.openDashboard': '打开看板',
    'actions.restore': '恢复',
    'actions.viewDetails': '查看详情',
    'actions.snapshot': '立即快照',
    'actions.watcherOn': '\u505c\u6b62 Watcher',
    'actions.watcherOff': '\u542f\u52a8 Watcher',
    'actions.doctor': '诊断',
    'stats.never': '从未',
    'time.secondsAgo': '{n} 秒前',
    'time.minutesAgo': '{m} 分 {s} 秒前',
    'time.hoursAgo': '{h} 小时 {m} 分前',
    'time.daysAgo': '{d} 天前',
    'time.seconds': '{n} 秒',
    'time.minutes': '{m} 分 {s} 秒',
    'alert.filesChangedFast': '{count} 个文件快速变更'
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
  shellTitle.textContent = t('chrome.title');
  langToggle.textContent = t('chrome.switch');
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

  const ageEl = document.querySelector('.backup-age[data-backup-ts]');
  if (!ageEl) return;
  const ts = parseInt(ageEl.dataset.backupTs, 10);
  if (!ts) return;
  ageEl.textContent = formatRelativeAge(ts);
}, 1000);

function render(projects) {
  _projects = projects || {};
  const ids = Object.keys(projects);
  if (ids.length === 0) {
    root.innerHTML = '<div class="empty">' + t('state.empty') + '</div>';
    return;
  }

  let html = '';
  for (const id of ids) {
    const project = projects[id];
    const dashboard = project.dashboard;
    if (!dashboard) {
      html += '<div class="empty">' + esc(t('state.loading')) + '</div>';
      continue;
    }
    html += renderProject(dashboard);
  }
  html += renderActions(projects);
  root.innerHTML = html;

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
    html += hero('alert', t('hero.alert.kicker'), t('alert.filesChangedFast', { count: alert.fileCount || '?' }), t('hero.alert.subtitle'));
  } else if (!watcherRunning) {
    html += hero('stopped', t('hero.protection.kicker'), t('hero.protection.stopped'), t('hero.protection.stoppedSub'));
  } else if (critical) {
    html += hero('critical', t('hero.health.kicker'), t('hero.health.critical'), dashboard.health.issues?.[0] || t('hero.health.check'));
  } else {
    html += hero('protected', t('hero.protection.kicker'), t('hero.protection.safe'), t('hero.protection.safeSub'));
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
  const ids = Object.keys(projects);
  const dashboard = ids.length > 0 ? projects[ids[0]]?.dashboard : null;
  const watcherRunning = dashboard?.watcher?.running;

  let html = '<div class="actions">';
  html += '<button class="btn primary" data-cmd="cursorGuard.snapshotNow">' + esc(t('actions.snapshot')) + '</button>';
  html += '<button class="btn" data-cmd="cursorGuard.quickRestore">' + esc(t('actions.restore')) + '</button>';
  html += watcherRunning
    ? '<button class="btn" data-cmd="cursorGuard.stopWatcher">' + esc(t('actions.watcherOn')) + '</button>'
    : '<button class="btn" data-cmd="cursorGuard.startWatcher">' + esc(t('actions.watcherOff')) + '</button>';
  html += '<button class="btn" data-cmd="cursorGuard.doctor">' + esc(t('actions.doctor')) + '</button>';
  html += '<button class="btn primary full" data-cmd="cursorGuard.openDashboard">' + esc(t('actions.openDashboard')) + '</button>';
  html += '</div>';
  return html;
}

function hero(tone, kicker, title, subtitle) {
  let html = '<div class="hero ' + tone + '">';
  html += '<div class="hero-kicker">' + esc(kicker) + '</div>';
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
