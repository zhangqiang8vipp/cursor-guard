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
    for (const [id, p] of data) {
      payload[id] = {
        name: p.name || id,
        dashboard: p.dashboard,
        backups: (p.backups || []).slice(0, 6),
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
  --bg: #1e1e2e;
  --surface: #282838;
  --border: #383850;
  --text: #cdd6f4;
  --dim: #6c7086;
  --green: #a6e3a1;
  --red: #f38ba8;
  --yellow: #f9e2af;
  --blue: #89b4fa;
  --purple: #cba6f7;
  --orange: #fab387;
  --teal: #94e2d5;
  --radius: 6px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font: 11px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--text);
  background: transparent;
  padding: 8px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin-bottom: 6px;
}
.card-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--dim);
  margin-bottom: 6px;
}
.status-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.status-badge {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
  border-radius: var(--radius);
  background: var(--bg);
  border: 1px solid var(--border);
}
.status-badge .icon { font-size: 16px; display: block; }
.status-badge .label { font-size: 9px; color: var(--dim); margin-top: 2px; }
.status-badge .value { font-size: 11px; font-weight: 700; }
.status-badge.ok { border-color: var(--green); }
.status-badge.ok .value { color: var(--green); }
.status-badge.warn { border-color: var(--yellow); }
.status-badge.warn .value { color: var(--yellow); }
.status-badge.danger { border-color: var(--red); }
.status-badge.danger .value { color: var(--red); }
.status-badge.info { border-color: var(--blue); }
.status-badge.info .value { color: var(--blue); }

.alert-bar {
  background: rgba(243,139,168,0.15);
  border: 1px solid var(--red);
  border-radius: var(--radius);
  padding: 6px 10px;
  margin-bottom: 6px;
  text-align: center;
}
.alert-bar .alert-title { color: var(--red); font-weight: 700; font-size: 12px; }
.alert-bar .alert-detail { color: var(--dim); font-size: 10px; margin-top: 2px; }
.alert-bar.hidden { display: none; }

.bar-group { margin-bottom: 4px; }
.bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  margin-bottom: 2px;
}
.bar-label .name { color: var(--text); }
.bar-label .val { color: var(--dim); font-weight: 600; }
.bar-track {
  height: 6px;
  background: var(--bg);
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}
.bar-fill.blue { background: var(--blue); }
.bar-fill.purple { background: var(--purple); }
.bar-fill.green { background: var(--green); }
.bar-fill.orange { background: var(--orange); }
.bar-fill.teal { background: var(--teal); }

.backup-list { list-style: none; }
.backup-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid var(--border);
  font-size: 10px;
}
.backup-item:last-child { border: none; }
.backup-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.backup-dot.auto { background: var(--blue); }
.backup-dot.snapshot { background: var(--purple); }
.backup-dot.restore { background: var(--orange); }
.backup-time { color: var(--dim); white-space: nowrap; }
.backup-type { font-weight: 600; min-width: 36px; }
.backup-summary { color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

.scope-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.scope-tag {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg);
}
.scope-tag.protect { color: var(--green); border: 1px solid var(--green); }
.scope-tag.ignore { color: var(--red); border: 1px solid var(--red); }

.health-row { display: flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 0; }
.health-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

.actions-row { display: flex; gap: 4px; flex-wrap: wrap; }
.action-btn {
  flex: 1;
  min-width: 70px;
  padding: 5px 4px;
  font-size: 9px;
  font-weight: 600;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover { border-color: var(--blue); color: var(--blue); }

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--dim);
  font-size: 11px;
}

.ring-chart {
  position: relative;
  width: 56px; height: 56px;
  margin: 0 auto 4px;
}
.ring-chart svg { transform: rotate(-90deg); }
.ring-chart .ring-bg { stroke: var(--bg); }
.ring-chart .ring-fill { transition: stroke-dashoffset 0.6s ease; }
.ring-label {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 700;
}
</style>
</head>
<body>
<div id="root">
  <div class="empty-state">Waiting for data...</div>
</div>
<script>
const vscode = acquireVsCodeApi();
window.addEventListener('message', e => {
  if (e.data.type === 'update') render(e.data.data);
});
vscode.postMessage({ cmd: 'ready' });

function render(projects) {
  const ids = Object.keys(projects);
  if (ids.length === 0) {
    document.getElementById('root').innerHTML = '<div class="empty-state">No projects detected</div>';
    return;
  }
  let html = '';
  for (const id of ids) {
    const p = projects[id];
    const d = p.dashboard;
    if (!d) { html += '<div class="empty-state">Loading ' + esc(p.name) + '...</div>'; continue; }
    html += renderProject(p.name, d, p.backups || []);
  }
  html += renderActions();
  document.getElementById('root').innerHTML = html;
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => vscode.postMessage({ cmd: 'exec', command: btn.dataset.cmd }));
  });
}

function renderProject(name, d, backups) {
  let h = '';

  // Status badges row
  const wOk = d.watcher?.running;
  const hasAlert = d.alerts?.active;
  const health = d.health?.status || 'unknown';

  h += '<div class="status-row">';
  h += badge(wOk ? '👁' : '🚫', 'Watcher', wOk ? 'Running' : 'Stopped', wOk ? 'ok' : 'danger');
  h += badge(hasAlert ? '🔔' : '✅', 'Alerts', hasAlert ? (d.alerts.latest?.fileCount || '!') : 'None', hasAlert ? 'danger' : 'ok');
  h += badge('💚', 'Health', health, health === 'healthy' ? 'ok' : health === 'critical' ? 'danger' : 'warn');
  h += badge('📁', 'Files', d.protectionScope?.fileCount || 0, 'info');
  h += '</div>';

  // Alert bar
  if (hasAlert) {
    const a = d.alerts.latest;
    const remain = a.expiresAt ? Math.max(0, Math.ceil((new Date(a.expiresAt).getTime() - Date.now()) / 1000)) : 0;
    const display = remain > 60 ? Math.floor(remain/60) + 'm ' + (remain%60) + 's' : remain + 's';
    h += '<div class="alert-bar">';
    h += '<div class="alert-title">⚠ ' + (a.fileCount||'?') + ' files changed in ' + (a.windowSeconds||'?') + 's</div>';
    h += '<div class="alert-detail">Threshold: ' + (a.threshold||'?') + ' · Expires: ' + display + '</div>';
    h += '</div>';
  }

  // Backup stats bars
  const gitC = d.counts?.git?.commits || 0;
  const shadowC = d.counts?.shadow?.snapshots || 0;
  const maxC = Math.max(gitC, shadowC, 1);
  const gitDisk = d.diskUsage?.git?.display || '0B';
  const shadowDisk = d.diskUsage?.shadow?.display || '0B';
  const gitBytes = d.diskUsage?.git?.bytes || 0;
  const shadowBytes = d.diskUsage?.shadow?.bytes || 0;
  const maxBytes = Math.max(gitBytes, shadowBytes, 1);

  h += '<div class="card">';
  h += '<div class="card-title">Backup Statistics</div>';
  h += bar('Git backups', gitC, gitC / maxC * 100, 'blue');
  h += bar('Shadow snapshots', shadowC, shadowC / maxC * 100, 'purple');
  h += bar('Git disk', gitDisk, gitBytes / maxBytes * 100, 'teal');
  h += bar('Shadow disk', shadowDisk, shadowBytes / maxBytes * 100, 'orange');
  if (d.disk) {
    h += '<div class="bar-label" style="margin-top:4px"><span class="name">System free</span><span class="val">' + d.disk.freeGB + ' GB</span></div>';
  }
  h += '</div>';

  // Recent backups timeline
  h += '<div class="card">';
  h += '<div class="card-title">Recent Backups</div>';
  if (backups.length === 0) {
    h += '<div style="color:var(--dim);font-size:10px">No backups yet</div>';
  } else {
    h += '<ul class="backup-list">';
    for (const b of backups) {
      const time = b.timestamp ? new Date(b.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '?';
      const type = b.type || 'auto';
      const dotClass = type === 'git-snapshot' ? 'snapshot' : type === 'pre-restore' ? 'restore' : 'auto';
      const typeLabel = type === 'git-snapshot' ? 'snap' : type === 'pre-restore' ? 'pre-rst' : 'auto';
      const summary = b.summary ? truncate(b.summary, 30) : '';
      const files = b.filesChanged ? b.filesChanged + ' files' : '';
      h += '<li class="backup-item">';
      h += '<span class="backup-dot ' + dotClass + '"></span>';
      h += '<span class="backup-time">' + time + '</span>';
      h += '<span class="backup-type">' + typeLabel + '</span>';
      h += '<span class="backup-summary">' + esc(files + (files && summary ? ' · ' : '') + summary) + '</span>';
      h += '</li>';
    }
    h += '</ul>';
  }
  h += '</div>';

  // Health issues
  if (d.health?.issues?.length > 0) {
    h += '<div class="card">';
    h += '<div class="card-title">Health Issues</div>';
    for (const issue of d.health.issues) {
      const critical = issue.includes('critically') || issue.includes('requires Git');
      h += '<div class="health-row"><span class="health-dot" style="background:' + (critical ? 'var(--red)' : 'var(--yellow)') + '"></span>' + esc(issue) + '</div>';
    }
    h += '</div>';
  }

  // Protection scope
  h += '<div class="card">';
  h += '<div class="card-title">Protection Scope</div>';
  const protect = d.protectionScope?.protect || ['**'];
  const ignore = d.protectionScope?.ignore || [];
  h += '<div style="font-size:10px;margin-bottom:4px">' + (d.protectionScope?.fileCount || 0) + ' files monitored</div>';
  h += '<div class="scope-tags">';
  for (const p of protect) h += '<span class="scope-tag protect">✓ ' + esc(p) + '</span>';
  for (const i of ignore.slice(0, 6)) h += '<span class="scope-tag ignore">✗ ' + esc(i) + '</span>';
  if (ignore.length > 6) h += '<span class="scope-tag ignore">+' + (ignore.length - 6) + ' more</span>';
  h += '</div></div>';

  return h;
}

function renderActions() {
  return '<div class="card"><div class="card-title">Quick Actions</div><div class="actions-row">'
    + '<button class="action-btn" data-cmd="cursorGuard.openDashboard">🖥 Dashboard</button>'
    + '<button class="action-btn" data-cmd="cursorGuard.snapshotNow">📸 Snapshot</button>'
    + '<button class="action-btn" data-cmd="cursorGuard.startWatcher">▶ Start</button>'
    + '<button class="action-btn" data-cmd="cursorGuard.stopWatcher">⏹ Stop</button>'
    + '</div></div>';
}

function badge(icon, label, value, cls) {
  return '<div class="status-badge ' + cls + '">'
    + '<span class="icon">' + icon + '</span>'
    + '<span class="value">' + esc(String(value)) + '</span>'
    + '<span class="label">' + label + '</span>'
    + '</div>';
}
function bar(name, val, pct, color) {
  return '<div class="bar-group"><div class="bar-label"><span class="name">' + name + '</span><span class="val">' + val + '</span></div>'
    + '<div class="bar-track"><div class="bar-fill ' + color + '" style="width:' + Math.max(pct, 2) + '%"></div></div></div>';
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }
</script>
</body>
</html>`;
}

module.exports = { SidebarDashboardProvider };
