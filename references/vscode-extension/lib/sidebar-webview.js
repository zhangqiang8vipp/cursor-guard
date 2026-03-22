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
        backups: (p.backups || []).slice(0, 5),
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
  --radius: 8px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--text);
  background: transparent;
  padding: 10px;
}

/* ── Big status indicator ── */
.status-hero {
  text-align: center;
  padding: 14px 10px;
  border-radius: var(--radius);
  margin-bottom: 10px;
}
.status-hero.protected {
  background: rgba(166,227,161,0.1);
  border: 1px solid rgba(166,227,161,0.3);
}
.status-hero.alert {
  background: rgba(243,139,168,0.12);
  border: 1px solid rgba(243,139,168,0.4);
}
.status-hero.stopped {
  background: rgba(249,226,175,0.1);
  border: 1px solid rgba(249,226,175,0.3);
}
.status-hero.critical {
  background: rgba(243,139,168,0.15);
  border: 1px solid var(--red);
}
.status-icon { font-size: 28px; display: block; margin-bottom: 4px; }
.status-text { font-size: 15px; font-weight: 700; }
.status-sub { font-size: 11px; color: var(--dim); margin-top: 2px; }

/* ── Alert card ── */
.alert-card {
  background: rgba(243,139,168,0.1);
  border: 1px solid rgba(243,139,168,0.35);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin-bottom: 10px;
}
.alert-card .title { color: var(--red); font-weight: 700; font-size: 12px; }
.alert-card .detail { color: var(--dim); font-size: 11px; margin-top: 3px; }
.alert-card .actions { margin-top: 6px; display: flex; gap: 6px; }
.alert-card .btn-sm {
  font-size: 10px; padding: 3px 8px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text); cursor: pointer;
}
.alert-card .btn-sm:hover { border-color: var(--blue); color: var(--blue); }

/* ── Quick stats ── */
.stats-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin-bottom: 10px;
}
.stats-card .label-sm {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--dim); margin-bottom: 6px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 11px;
}
.stat-row .name { color: var(--dim); }
.stat-row .val { font-weight: 600; color: var(--text); }
.stat-row .val.green { color: var(--green); }
.stat-row .val.blue { color: var(--blue); }
.stat-row .val.yellow { color: var(--yellow); }

/* ── Action buttons ── */
.actions-section {
  margin-top: 8px;
}
.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.action-btn {
  padding: 8px 6px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover { border-color: var(--blue); color: var(--blue); background: rgba(137,180,250,0.08); }
.action-btn.primary {
  border-color: rgba(137,180,250,0.3);
  background: rgba(137,180,250,0.08);
}
.action-btn.full { grid-column: 1 / -1; }
.action-btn .icon { margin-right: 3px; }

/* ── Scope display ── */
.scope-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.scope-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
}
.scope-chip.protected {
  background: rgba(166,227,161,0.12);
  color: var(--green);
}
.scope-chip.excluded {
  background: rgba(243,139,168,0.12);
  color: var(--red);
}
.scope-chip.total {
  background: rgba(108,112,134,0.15);
  color: var(--dim);
}
.scope-block { margin-bottom: 6px; }
.scope-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 4px;
}
.scope-label.green { color: var(--green); }
.scope-label.red { color: var(--red); }
.scope-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.scope-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scope-tag.green {
  background: rgba(166,227,161,0.1);
  color: var(--green);
  border: 1px solid rgba(166,227,161,0.2);
}
.scope-tag.red {
  background: rgba(243,139,168,0.08);
  color: var(--red);
  border: 1px solid rgba(243,139,168,0.2);
}
.scope-tag.dim {
  background: rgba(108,112,134,0.1);
  color: var(--dim);
  border: 1px solid var(--border);
}

.empty-state {
  text-align: center; padding: 24px 10px;
  color: var(--dim); font-size: 12px;
}
</style>
</head>
<body>
<div id="root">
  <div class="empty-state">Waiting for data...</div>
</div>
<script>
const vscode = acquireVsCodeApi();
let _alertExpiresAt = 0;

window.addEventListener('message', e => {
  if (e.data.type === 'update') render(e.data.data);
});
vscode.postMessage({ cmd: 'ready' });

setInterval(() => {
  if (!_alertExpiresAt) return;
  const el = document.querySelector('.alert-countdown');
  if (!el) return;
  const remain = Math.max(0, Math.ceil((_alertExpiresAt - Date.now()) / 1000));
  if (remain <= 0) {
    el.textContent = '0s';
    _alertExpiresAt = 0;
    return;
  }
  el.textContent = remain > 60 ? Math.floor(remain / 60) + 'm ' + (remain % 60) + 's' : remain + 's';
}, 1000);

function render(projects) {
  const ids = Object.keys(projects);
  if (ids.length === 0) {
    root.innerHTML = '<div class="empty-state">No projects detected.<br>Add .cursor-guard.json to get started.</div>';
    return;
  }
  let html = '';
  for (const id of ids) {
    const p = projects[id];
    const d = p.dashboard;
    if (!d) { html += '<div class="empty-state">Loading...</div>'; continue; }
    html += renderProject(d);
  }
  html += renderActions(projects);
  root.innerHTML = html;

  const alertCard = root.querySelector('.alert-card[data-expires]');
  _alertExpiresAt = alertCard ? parseInt(alertCard.dataset.expires, 10) || 0 : 0;

  root.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => vscode.postMessage({ cmd: 'exec', command: btn.dataset.cmd }));
  });
}

function renderProject(d) {
  const wOk = d.watcher?.running;
  const hasAlert = d.alerts?.active;
  const health = d.health?.status || 'unknown';
  const isCritical = health === 'critical';
  let h = '';

  // ── Big status hero ──
  if (hasAlert) {
    const fc = d.alerts.latest?.fileCount || '?';
    h += '<div class="status-hero alert">';
    h += '<span class="status-icon">🔴</span>';
    h += '<span class="status-text">' + fc + ' files alert</span>';
    h += '<span class="status-sub">Abnormal change velocity detected</span>';
    h += '</div>';
  } else if (!wOk) {
    h += '<div class="status-hero stopped">';
    h += '<span class="status-icon">🟡</span>';
    h += '<span class="status-text">Watcher Stopped</span>';
    h += '<span class="status-sub">Start watcher to enable protection</span>';
    h += '</div>';
  } else if (isCritical) {
    h += '<div class="status-hero critical">';
    h += '<span class="status-icon">🔴</span>';
    h += '<span class="status-text">Critical Issue</span>';
    h += '<span class="status-sub">' + esc(d.health.issues?.[0] || 'Check diagnostics') + '</span>';
    h += '</div>';
  } else {
    h += '<div class="status-hero protected">';
    h += '<span class="status-icon">🟢</span>';
    h += '<span class="status-text">Protected</span>';
    h += '<span class="status-sub">Watcher running · All systems OK</span>';
    h += '</div>';
  }

  // ── Alert detail card (only when active) ──
  if (hasAlert) {
    const a = d.alerts.latest;
    const expiresTs = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
    const remain = expiresTs ? Math.max(0, Math.ceil((expiresTs - Date.now()) / 1000)) : 0;
    const display = remain > 60 ? Math.floor(remain/60) + 'm ' + (remain%60) + 's' : remain + 's';
    h += '<div class="alert-card" data-expires="' + expiresTs + '">';
    h += '<div class="title">\u26a0 ' + (a.fileCount||'?') + ' files in ' + (a.windowSeconds||'?') + 's</div>';
    h += '<div class="detail">Threshold: ' + (a.threshold||'?') + ' \xb7 Expires: <span class="alert-countdown">' + display + '</span></div>';
    h += '<div class="actions">';
    h += '<button class="btn-sm" data-cmd="cursorGuard.openDashboard">View Details</button>';
    h += '</div>';
    h += '</div>';
  }

  // ── Quick stats ──
  const gitC = d.counts?.git?.commits || 0;
  const shadowC = d.counts?.shadow?.snapshots || 0;
  const lastGit = d.lastBackup?.git?.relativeTime || 'never';
  const freeGB = d.disk?.freeGB;
  const freeDisplay = typeof freeGB === 'number' ? freeGB.toFixed(1) + ' GB' : 'N/A';
  const diskWarn = d.disk?.warning;

  h += '<div class="stats-card">';
  h += '<div class="label-sm">Quick Stats</div>';
  h += statRow('Last backup', lastGit, 'green');
  h += statRow('Git backups', gitC, 'blue');
  if (shadowC > 0) h += statRow('Shadow copies', shadowC, 'blue');
  h += statRow('Disk free', freeDisplay, diskWarn ? 'yellow' : 'green');
  h += '</div>';

  // ── Protection Scope ──
  const scope = d.protectionScope || {};
  const pCount = scope.fileCount || 0;
  const exCount = scope.excludedCount || 0;
  const totalF = scope.totalFiles || 0;
  const protectPats = scope.protect || [];
  const ignorePats = scope.ignore || [];

  h += '<div class="stats-card">';
  h += '<div class="label-sm">Protection Scope</div>';
  h += '<div class="scope-summary">';
  h += '<span class="scope-chip protected">\u{1f6e1}\ufe0f ' + pCount + ' protected</span>';
  if (exCount > 0) h += '<span class="scope-chip excluded">\u{1f6ab} ' + exCount + ' excluded</span>';
  h += '<span class="scope-chip total">' + totalF + ' total</span>';
  h += '</div>';

  if (protectPats.length > 0) {
    h += '<div class="scope-block">';
    h += '<span class="scope-label green">Protect (' + protectPats.length + ')</span>';
    h += '<div class="scope-tags">';
    const showP = protectPats.slice(0, 6);
    for (const p of showP) h += '<span class="scope-tag green">' + esc(p) + '</span>';
    if (protectPats.length > 6) h += '<span class="scope-tag dim">+' + (protectPats.length - 6) + ' more</span>';
    h += '</div></div>';
  }

  if (ignorePats.length > 0) {
    h += '<div class="scope-block">';
    h += '<span class="scope-label red">Ignore (' + ignorePats.length + ')</span>';
    h += '<div class="scope-tags">';
    const showI = ignorePats.slice(0, 6);
    for (const ig of showI) h += '<span class="scope-tag red">' + esc(ig) + '</span>';
    if (ignorePats.length > 6) h += '<span class="scope-tag dim">+' + (ignorePats.length - 6) + ' more</span>';
    h += '</div></div>';
  }

  h += '</div>';

  return h;
}

function renderActions(projects) {
  const ids = Object.keys(projects);
  const d = ids.length > 0 ? projects[ids[0]]?.dashboard : null;
  const wOk = d?.watcher?.running;

  let h = '<div class="actions-section"><div class="actions-grid">';
  h += '<button class="action-btn primary" data-cmd="cursorGuard.snapshotNow"><span class="icon">📸</span>Snapshot</button>';
  h += '<button class="action-btn" data-cmd="cursorGuard.quickRestore"><span class="icon">⏪</span>Restore</button>';

  if (wOk) {
    h += '<button class="action-btn" data-cmd="cursorGuard.stopWatcher"><span class="icon">🟢</span>Watcher ON</button>';
  } else {
    h += '<button class="action-btn" data-cmd="cursorGuard.startWatcher"><span class="icon">⚪</span>Watcher OFF</button>';
  }
  h += '<button class="action-btn" data-cmd="cursorGuard.doctor"><span class="icon">🔍</span>Doctor</button>';

  h += '<button class="action-btn full primary" data-cmd="cursorGuard.openDashboard"><span class="icon">📊</span>Open Dashboard</button>';
  h += '</div></div>';
  return h;
}

function statRow(name, val, cls) {
  return '<div class="stat-row"><span class="name">' + name + '</span><span class="val ' + cls + '">' + esc(String(val)) + '</span></div>';
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
</script>
</body>
</html>`;
}

module.exports = { SidebarDashboardProvider };
