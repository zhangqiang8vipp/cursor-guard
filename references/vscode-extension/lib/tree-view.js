'use strict';

const vscode = require('vscode');

const C = {
  green: new vscode.ThemeColor('charts.green'),
  red: new vscode.ThemeColor('charts.red'),
  yellow: new vscode.ThemeColor('charts.yellow'),
  blue: new vscode.ThemeColor('charts.blue'),
  purple: new vscode.ThemeColor('charts.purple'),
  orange: new vscode.ThemeColor('charts.orange'),
};

class GuardTreeView {
  constructor(poller, dashMgr) {
    this._poller = poller;
    this._dashMgr = dashMgr;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChange.event;

    this._treeView = vscode.window.createTreeView('cursorGuardProjects', {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    this._sub = poller.onChange(() => this._onDidChange.fire());
  }

  refresh() { this._onDidChange.fire(); }
  getTreeItem(el) { return el; }

  getChildren(el) {
    if (!el) return this._getRootItems();
    switch (el.contextValue) {
      case 'project': return this._getProjectSections(el.projectId);
      case 'section-watcher': return this._getWatcherDetails(el.projectId);
      case 'section-alert': return this._getAlertDetails(el.projectId);
      case 'section-backups': return this._getRecentBackups(el.projectId);
      case 'section-stats': return this._getStatsDetails(el.projectId);
      case 'section-health': return this._getHealthDetails(el.projectId);
      case 'section-scope': return this._getScopeDetails(el.projectId);
      case 'section-actions': return this._getActionItems();
      default: return [];
    }
  }

  _getRootItems() {
    const data = this._poller.data;
    if (data.size === 0) {
      return [
        _item('No projects detected', 'info', { icon: 'info', color: C.yellow, desc: 'Add .cursor-guard.json' }),
        this._actionsSection(),
      ];
    }
    const items = [];
    for (const [id, p] of data) {
      const d = p.dashboard;
      const hasAlert = d?.alerts?.active;
      const watcherOk = d?.watcher?.running;
      const color = hasAlert ? C.red : watcherOk ? C.green : C.yellow;
      const status = hasAlert ? 'ALERT' : watcherOk ? 'Protected' : 'Unprotected';
      const item = _item(p.name || id, 'project', {
        icon: hasAlert ? 'bell' : 'shield',
        color,
        desc: status,
        collapsible: vscode.TreeItemCollapsibleState.Expanded,
      });
      item.projectId = id;
      items.push(item);
    }
    items.push(this._actionsSection());
    return items;
  }

  _actionsSection() {
    const a = _item('Quick Actions', 'section-actions', {
      icon: 'zap', color: C.blue,
      collapsible: vscode.TreeItemCollapsibleState.Collapsed,
    });
    return a;
  }

  _getProjectSections(pid) {
    const p = this._poller.data.get(pid);
    if (!p?.dashboard) return [_item('Loading...', 'loading', { icon: 'loading~spin', color: C.blue })];

    const sections = [];

    const d = p.dashboard;
    const watcherOk = d.watcher?.running;
    const ws = _item(
      watcherOk ? `Watcher: Running` : 'Watcher: Stopped',
      'section-watcher',
      {
        icon: watcherOk ? 'eye' : 'eye-closed',
        color: watcherOk ? C.green : C.red,
        desc: watcherOk ? `PID ${d.watcher.pid || '?'}` : 'Click to see details',
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
      }
    );
    ws.projectId = pid;
    sections.push(ws);

    const hasAlert = d.alerts?.active;
    const alertLabel = hasAlert
      ? `ALERT: ${d.alerts.latest?.fileCount || '?'} files in ${d.alerts.latest?.windowSeconds || '?'}s`
      : 'No active alerts';
    const as = _item(alertLabel, 'section-alert', {
      icon: hasAlert ? 'bell' : 'check',
      color: hasAlert ? C.red : C.green,
      desc: hasAlert ? `threshold: ${d.alerts.latest?.threshold}` : '',
      collapsible: hasAlert ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    });
    as.projectId = pid;
    sections.push(as);

    const gitCount = d.counts?.git?.commits || 0;
    const shadowCount = d.counts?.shadow?.snapshots || 0;
    const lastAgo = d.lastBackup?.git ? _relativeTime(d.lastBackup.git.timestamp) : 'never';
    const bs = _item(
      `Backups (${gitCount + shadowCount})`,
      'section-backups',
      {
        icon: 'history',
        color: C.blue,
        desc: `last: ${lastAgo}`,
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
      }
    );
    bs.projectId = pid;
    sections.push(bs);

    const gitDisk = d.diskUsage?.git?.display || '0B';
    const shadowDisk = d.diskUsage?.shadow?.display || '0B';
    const ss = _item(
      `Git: ${gitCount}  Shadow: ${shadowCount}`,
      'section-stats',
      {
        icon: 'graph',
        color: C.purple,
        desc: `Disk: ${gitDisk} + ${shadowDisk}`,
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
      }
    );
    ss.projectId = pid;
    sections.push(ss);

    const health = d.health?.status || 'unknown';
    const hColor = health === 'healthy' ? C.green : health === 'critical' ? C.red : C.yellow;
    const hIcon = health === 'healthy' ? 'pass-filled' : health === 'critical' ? 'error' : 'warning';
    const issueCount = d.health?.issues?.length || 0;
    const hs = _item(
      `Health: ${health}`,
      'section-health',
      {
        icon: hIcon,
        color: hColor,
        desc: issueCount > 0 ? `${issueCount} issue(s)` : 'all good',
        collapsible: issueCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      }
    );
    hs.projectId = pid;
    sections.push(hs);

    const fileCount = d.protectionScope?.fileCount || 0;
    const scp = _item(
      `Protection: ${fileCount} files`,
      'section-scope',
      {
        icon: 'lock',
        color: C.orange,
        desc: d.protectionScope?.protect?.join(', ') || '**',
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
      }
    );
    scp.projectId = pid;
    sections.push(scp);

    return sections;
  }

  _getWatcherDetails(pid) {
    const d = this._poller.data.get(pid)?.dashboard;
    if (!d) return [];
    const items = [];
    const w = d.watcher;
    if (w?.running) {
      items.push(_item(`PID: ${w.pid || 'N/A'}`, 'detail', { icon: 'terminal', color: C.green }));
      if (w.startedAt) items.push(_item(`Started: ${_relativeTime(w.startedAt)}`, 'detail', { icon: 'clock', color: C.blue }));
      items.push(_item(`Interval: ${d.strategy === 'shadow' ? 'shadow' : 'git'} backup`, 'detail', { icon: 'settings-gear', color: C.blue }));
    } else {
      items.push(_item('Watcher is not running', 'detail', { icon: 'circle-slash', color: C.red }));
      const startItem = _item('Start Watcher', 'action-start', { icon: 'play', color: C.green });
      startItem.command = { command: 'cursorGuard.startWatcher', title: 'Start' };
      items.push(startItem);
    }
    return items;
  }

  _getAlertDetails(pid) {
    const d = this._poller.data.get(pid)?.dashboard;
    if (!d?.alerts?.active) return [];
    const a = d.alerts.latest;
    const items = [];
    if (a.timestamp) items.push(_item(`Triggered: ${new Date(a.timestamp).toLocaleTimeString()}`, 'detail', { icon: 'clock', color: C.red }));
    if (a.expiresAt) {
      const remain = Math.max(0, new Date(a.expiresAt).getTime() - Date.now());
      const sec = Math.ceil(remain / 1000);
      const display = sec > 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
      items.push(_item(`Expires in: ${display}`, 'detail', { icon: 'watch', color: C.yellow }));
    }
    items.push(_item(`Files: ${a.fileCount || '?'}  Window: ${a.windowSeconds || '?'}s  Threshold: ${a.threshold || '?'}`, 'detail', { icon: 'list-flat', color: C.orange }));
    if (a.files && a.files.length > 0) {
      const sorted = [...a.files].sort((x, y) => (y.added + y.deleted) - (x.added + x.deleted));
      const max = Math.min(sorted.length, 10);
      for (let i = 0; i < max; i++) {
        const f = sorted[i];
        const op = f.action === 'A' ? 'Added' : f.action === 'D' ? 'Deleted' : 'Modified';
        items.push(_item(f.path, 'alert-file', {
          icon: f.action === 'D' ? 'trash' : f.action === 'A' ? 'new-file' : 'edit',
          color: f.action === 'D' ? C.red : f.action === 'A' ? C.green : C.blue,
          desc: `${op}  +${f.added} -${f.deleted}`,
        }));
      }
      if (sorted.length > 10) {
        items.push(_item(`... and ${sorted.length - 10} more files`, 'detail', { icon: 'ellipsis', color: C.yellow }));
      }
    }
    return items;
  }

  _getRecentBackups(pid) {
    const backups = this._poller.data.get(pid)?.backups || [];
    if (backups.length === 0) return [_item('No backups yet', 'detail', { icon: 'circle-slash', color: C.yellow })];
    const recent = backups.slice(0, 8);
    return recent.map(b => {
      const time = b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : '?';
      const type = b.type || 'auto';
      const typeIcon = type === 'git-snapshot' ? 'device-camera' : type === 'pre-restore' ? 'history' : 'git-commit';
      const typeColor = type === 'git-snapshot' ? C.purple : type === 'pre-restore' ? C.orange : C.blue;
      const summary = b.summary ? _truncate(b.summary, 50) : '';
      const fileCount = b.filesChanged || '';
      const desc = fileCount ? `${fileCount} files  ${summary}` : summary;
      const item = _item(`${time}  ${type}`, 'backup-item', { icon: typeIcon, color: typeColor, desc });
      const tooltip = [];
      if (b.hash) tooltip.push(`Hash: ${b.hash}`);
      if (b.summary) tooltip.push(`Summary: ${b.summary}`);
      if (b.trigger) tooltip.push(`Trigger: ${b.trigger}`);
      if (b.intent) tooltip.push(`Intent: ${b.intent}`);
      if (tooltip.length > 0) item.tooltip = tooltip.join('\n');
      return item;
    });
  }

  _getStatsDetails(pid) {
    const d = this._poller.data.get(pid)?.dashboard;
    if (!d) return [];
    const items = [];
    items.push(_item(`Git backups: ${d.counts?.git?.commits || 0}`, 'detail', { icon: 'git-branch', color: C.blue }));
    items.push(_item(`Shadow snapshots: ${d.counts?.shadow?.snapshots || 0}`, 'detail', { icon: 'copy', color: C.purple }));
    items.push(_item(`Git disk: ${d.diskUsage?.git?.display || '0B'}`, 'detail', { icon: 'file-binary', color: C.blue }));
    items.push(_item(`Shadow disk: ${d.diskUsage?.shadow?.display || '0B'}`, 'detail', { icon: 'file-binary', color: C.purple }));
    if (d.disk) {
      items.push(_item(`System free: ${d.disk.freeGB} GB`, 'detail', {
        icon: 'server',
        color: d.disk.warning ? C.red : C.green,
        desc: d.disk.warning || '',
      }));
    }
    items.push(_item(`Strategy: ${d.strategy || 'git'}`, 'detail', { icon: 'settings-gear', color: C.orange }));
    return items;
  }

  _getHealthDetails(pid) {
    const d = this._poller.data.get(pid)?.dashboard;
    if (!d?.health?.issues?.length) return [_item('All checks passed', 'detail', { icon: 'pass-filled', color: C.green })];
    return d.health.issues.map(issue => {
      const isCritical = issue.includes('critically') || issue.includes('requires Git');
      return _item(issue, 'health-issue', {
        icon: isCritical ? 'error' : 'warning',
        color: isCritical ? C.red : C.yellow,
      });
    });
  }

  _getScopeDetails(pid) {
    const d = this._poller.data.get(pid)?.dashboard;
    if (!d?.protectionScope) return [];
    const items = [];
    const protect = d.protectionScope.protect || ['**'];
    const ignore = d.protectionScope.ignore || [];
    items.push(_item(`Protected files: ${d.protectionScope.fileCount || 0}`, 'detail', { icon: 'file-code', color: C.green }));
    if (protect.length > 0) {
      items.push(_item(`Protect: ${protect.join(', ')}`, 'detail', { icon: 'check', color: C.green }));
    }
    if (ignore.length > 0) {
      items.push(_item(`Ignore: ${ignore.join(', ')}`, 'detail', { icon: 'x', color: C.red }));
    }
    return items;
  }

  _getActionItems() {
    const openDash = _item('Open Dashboard', 'action', { icon: 'browser', color: C.blue });
    openDash.command = { command: 'cursorGuard.openDashboard', title: 'Open Dashboard' };

    const snapshot = _item('Snapshot Now', 'action', { icon: 'device-camera', color: C.purple });
    snapshot.command = { command: 'cursorGuard.snapshotNow', title: 'Snapshot Now' };

    const startW = _item('Start Watcher', 'action', { icon: 'play', color: C.green });
    startW.command = { command: 'cursorGuard.startWatcher', title: 'Start Watcher' };

    const stopW = _item('Stop Watcher', 'action', { icon: 'debug-stop', color: C.red });
    stopW.command = { command: 'cursorGuard.stopWatcher', title: 'Stop Watcher' };

    const refresh = _item('Refresh', 'action', { icon: 'refresh', color: C.orange });
    refresh.command = { command: 'cursorGuard.refreshTree', title: 'Refresh' };

    return [openDash, snapshot, startW, stopW, refresh];
  }

  dispose() {
    this._sub?.dispose();
    this._treeView.dispose();
    this._onDidChange.dispose();
  }
}

function _item(label, ctx, opts = {}) {
  const ti = new vscode.TreeItem(label, opts.collapsible || vscode.TreeItemCollapsibleState.None);
  ti.contextValue = ctx;
  if (opts.icon) ti.iconPath = new vscode.ThemeIcon(opts.icon, opts.color);
  if (opts.desc) ti.description = opts.desc;
  return ti;
}

function _relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function _truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

module.exports = { GuardTreeView };
