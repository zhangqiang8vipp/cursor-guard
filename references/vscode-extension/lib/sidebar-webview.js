'use strict';

const vscode = require('vscode');

class SidebarDashboardProvider {
  constructor(poller) {
    this._poller = poller;
    this._view = null;
    this._sub = poller.onChange(data => this._push(data));
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = _getHtml();

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.cmd === 'ready') this._push(this._poller.data);
      if (msg.cmd === 'exec') vscode.commands.executeCommand(msg.command);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._push(this._poller.data);
    });
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
</style>
</head>
<body>
<div id="root">
  <div class="empty">Waiting for data...</div>
</div>
<script>
const vscode = acquireVsCodeApi();
let _alertExpiresAt = 0;

window.addEventListener('message', event => {
  if (event.data.type === 'update') render(event.data.data);
});

vscode.postMessage({ cmd: 'ready' });

setInterval(() => {
  if (_alertExpiresAt) {
    const el = document.querySelector('.alert-countdown');
    if (el) {
      const remain = Math.max(0, Math.ceil((_alertExpiresAt - Date.now()) / 1000));
      if (remain <= 0) {
        el.textContent = '0s';
        _alertExpiresAt = 0;
      } else if (remain > 60) {
        el.textContent = Math.floor(remain / 60) + 'm ' + (remain % 60) + 's';
      } else {
        el.textContent = remain + 's';
      }
    }
  }

  const ageEl = document.querySelector('.backup-age[data-backup-ts]');
  if (!ageEl) return;
  const ts = parseInt(ageEl.dataset.backupTs, 10);
  if (!ts) return;

  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) ageEl.textContent = sec + 's ago';
  else if (sec < 3600) ageEl.textContent = Math.floor(sec / 60) + 'm ' + (sec % 60) + 's ago';
  else if (sec < 86400) ageEl.textContent = Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm ago';
  else ageEl.textContent = Math.floor(sec / 86400) + 'd ago';
}, 1000);

function render(projects) {
  const ids = Object.keys(projects);
  if (ids.length === 0) {
    root.innerHTML = '<div class="empty">No projects detected.<br>Add .cursor-guard.json to get started.</div>';
    return;
  }

  let html = '';
  for (const id of ids) {
    const project = projects[id];
    const dashboard = project.dashboard;
    if (!dashboard) {
      html += '<div class="empty">Loading...</div>';
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
  const preWarning = dashboard.preWarnings?.active ? dashboard.preWarnings.latest : null;
  const alert = dashboard.alerts?.active ? dashboard.alerts.latest : null;
  const health = dashboard.health?.status || 'unknown';
  const critical = health === 'critical';
  let html = '';

  if (preWarning) {
    html += hero('risk', 'Pre-Warning', 'Delete Risk', preWarning.summary || 'Review pending destructive edit');
  } else if (alert) {
    html += hero('alert', 'Change Alert', (alert.fileCount || '?') + ' files changed fast', 'Abnormal change velocity detected');
  } else if (!watcherRunning) {
    html += hero('stopped', 'Protection', 'Watcher Stopped', 'Start watcher to enable continuous protection');
  } else if (critical) {
    html += hero('critical', 'Health', 'Critical Issue', esc(dashboard.health.issues?.[0] || 'Check diagnostics'));
  } else {
    html += hero('protected', 'Protection', 'Protected', 'Watcher running and backups healthy');
  }

  if (preWarning) {
    html += '<div class="card risk-card">';
    html += '<div class="card-title">Deletion Risk</div>';
    html += row('File', esc(preWarning.file || 'Unknown'), 'orange');
    html += row('Risk', esc(String(preWarning.riskPercent || '?')) + '%', 'orange');
    if (preWarning.removedMethodCount) {
      html += row('Methods removed', esc(String(preWarning.removedMethodCount)), 'red');
    }
    html += row('Summary', esc(preWarning.summary || 'Pending destructive edit warning'), 'orange');
    html += '<div class="actions">';
    html += '<button class="btn" data-cmd="cursorGuard.openDashboard">Open Dashboard</button>';
    html += '<button class="btn" data-cmd="cursorGuard.quickRestore">Restore</button>';
    html += '</div>';
    html += '</div>';
  }

  if (alert) {
    const expiresTs = alert.expiresAt ? new Date(alert.expiresAt).getTime() : 0;
    const remain = expiresTs ? Math.max(0, Math.ceil((expiresTs - Date.now()) / 1000)) : 0;
    const display = remain > 60 ? Math.floor(remain / 60) + 'm ' + (remain % 60) + 's' : remain + 's';
    html += '<div class="card alert-card" data-expires="' + expiresTs + '">';
    html += '<div class="card-title">Active Alert</div>';
    html += row('Window', (alert.windowSeconds || '?') + 's', 'red');
    html += row('Files', String(alert.fileCount || '?'), 'red');
    html += row('Threshold', String(alert.threshold || '?'), 'yellow');
    html += row('Expires', '<span class="alert-countdown">' + display + '</span>', 'yellow', true);
    html += '<div class="actions">';
    html += '<button class="btn" data-cmd="cursorGuard.openDashboard">View Details</button>';
    html += '</div>';
    html += '</div>';
  }

  const gitCount = dashboard.counts?.git?.commits || 0;
  const shadowCount = dashboard.counts?.shadow?.snapshots || 0;
  const lastGitTs = dashboard.lastBackup?.git?.timestamp || '';
  const lastGit = dashboard.lastBackup?.git?.relativeTime || 'never';
  const freeGB = dashboard.disk?.freeGB;
  const freeDisplay = typeof freeGB === 'number' ? freeGB.toFixed(1) + ' GB' : 'N/A';
  const diskWarn = dashboard.disk?.warning;

  html += '<div class="card">';
  html += '<div class="card-title">Quick Stats</div>';
  if (lastGitTs) {
    html += '<div class="row"><span class="row-name">Last backup</span><span class="row-value green backup-age" data-backup-ts="' + new Date(lastGitTs).getTime() + '">' + esc(lastGit) + '</span></div>';
  } else {
    html += row('Last backup', lastGit, 'green');
  }
  html += row('Git backups', String(gitCount), 'blue');
  if (shadowCount > 0) html += row('Shadow copies', String(shadowCount), 'blue');
  html += row('Disk free', freeDisplay, diskWarn ? 'yellow' : 'green');
  html += '</div>';

  const scope = dashboard.protectionScope || {};
  const protect = scope.protect || [];
  const ignore = scope.ignore || [];

  html += '<div class="card">';
  html += '<div class="card-title">Protection Scope</div>';
  html += '<div class="pill-wrap">';
  html += '<span class="pill green">' + esc(String(scope.fileCount || 0)) + ' protected</span>';
  if ((scope.excludedCount || 0) > 0) {
    html += '<span class="pill red">' + esc(String(scope.excludedCount || 0)) + ' excluded</span>';
  }
  html += '<span class="pill dim">' + esc(String(scope.totalFiles || 0)) + ' total</span>';
  html += '</div>';

  if (protect.length > 0) {
    html += renderTags('Protect', protect, 'green');
  }
  if (ignore.length > 0) {
    html += renderTags('Ignore', ignore, 'red');
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
    html += '<span class="tag dim">+' + (values.length - 6) + ' more</span>';
  }
  html += '</div></div>';
  return html;
}

function renderActions(projects) {
  const ids = Object.keys(projects);
  const dashboard = ids.length > 0 ? projects[ids[0]]?.dashboard : null;
  const watcherRunning = dashboard?.watcher?.running;

  let html = '<div class="actions">';
  html += '<button class="btn primary" data-cmd="cursorGuard.snapshotNow">Snapshot</button>';
  html += '<button class="btn" data-cmd="cursorGuard.quickRestore">Restore</button>';
  html += watcherRunning
    ? '<button class="btn" data-cmd="cursorGuard.stopWatcher">Watcher On</button>'
    : '<button class="btn" data-cmd="cursorGuard.startWatcher">Watcher Off</button>';
  html += '<button class="btn" data-cmd="cursorGuard.doctor">Doctor</button>';
  html += '<button class="btn primary full" data-cmd="cursorGuard.openDashboard">Open Dashboard</button>';
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
