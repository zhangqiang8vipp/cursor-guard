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
      showCollapseAll: false,
    });

    this._sub = poller.onChange(() => this._onDidChange.fire());
  }

  refresh() { this._onDidChange.fire(); }
  getTreeItem(el) { return el; }

  getChildren(el) {
    if (!el) return this._getRootItems();
    if (el.contextValue === 'project') return this._getProjectStatus(el.projectId);
    return [];
  }

  _getRootItems() {
    const data = this._poller.data;
    if (data.size === 0) {
      return [_item('No projects detected', 'info', { icon: 'info', color: C.yellow, desc: 'Add .cursor-guard.json' })];
    }
    const items = [];
    for (const [id, p] of data) {
      const d = p.dashboard;
      const hasAlert = d?.alerts?.active;
      const watcherOk = d?.watcher?.running;
      const color = hasAlert ? C.red : watcherOk ? C.green : C.yellow;
      const status = hasAlert ? `ALERT ${d.alerts.latest?.fileCount || ''} files` : watcherOk ? 'Protected' : 'Unprotected';
      const item = _item(p.name || id, 'project', {
        icon: hasAlert ? 'bell' : watcherOk ? 'shield' : 'eye-closed',
        color,
        desc: status,
        collapsible: vscode.TreeItemCollapsibleState.Expanded,
      });
      item.projectId = id;
      items.push(item);
    }
    return items;
  }

  _getProjectStatus(pid) {
    const p = this._poller.data.get(pid);
    if (!p?.dashboard) return [_item('Loading...', 'loading', { icon: 'loading~spin', color: C.blue })];
    const d = p.dashboard;
    const items = [];

    if (d.watcher?.running) {
      const w = _item('Watcher: Running', 'watcher', { icon: 'eye', color: C.green, desc: `PID ${d.watcher.pid || '?'}` });
      items.push(w);
    } else {
      const w = _item('Watcher: Stopped', 'watcher', { icon: 'eye-closed', color: C.red });
      w.command = { command: 'cursorGuard.startWatcher', title: 'Start Watcher' };
      w.tooltip = 'Click to start watcher';
      items.push(w);
    }

    const gitC = d.counts?.git?.commits || 0;
    const shadowC = d.counts?.shadow?.snapshots || 0;
    const lastAgo = d.lastBackup?.git?.relativeTime || 'never';
    items.push(_item(`Backups: ${gitC + shadowC}`, 'stat', { icon: 'history', color: C.blue, desc: `last ${lastAgo}` }));

    const health = d.health?.status || 'unknown';
    const hColor = health === 'healthy' ? C.green : health === 'critical' ? C.red : C.yellow;
    const hIcon = health === 'healthy' ? 'pass-filled' : health === 'critical' ? 'error' : 'warning';
    items.push(_item(`Health: ${health}`, 'health', { icon: hIcon, color: hColor }));

    const openItem = _item('Open Dashboard', 'action', { icon: 'browser', color: C.blue });
    openItem.command = { command: 'cursorGuard.openDashboard', title: 'Open' };
    items.push(openItem);

    const snapItem = _item('Snapshot Now', 'action', { icon: 'device-camera', color: C.purple });
    snapItem.command = { command: 'cursorGuard.snapshotNow', title: 'Snap' };
    items.push(snapItem);

    return items;
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

module.exports = { GuardTreeView };
