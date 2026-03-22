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
      return [_item('No projects detected', 'info', {
        icon: 'info',
        color: C.yellow,
        desc: 'Add .cursor-guard.json',
      })];
    }

    const items = [];
    for (const [id, project] of data) {
      const dashboard = project.dashboard;
      const hasPreWarning = dashboard?.preWarnings?.active;
      const hasAlert = dashboard?.alerts?.active;
      const watcherOk = dashboard?.watcher?.running;

      let color = C.yellow;
      let status = 'Unprotected';
      let icon = 'eye-closed';

      if (hasPreWarning) {
        color = C.orange;
        icon = 'warning';
        const latest = dashboard.preWarnings.latest;
        status = latest?.file
          ? `Delete risk in ${latest.file}`
          : `Delete risk (${dashboard.preWarnings.count || 1})`;
      } else if (hasAlert) {
        color = C.red;
        icon = 'bell';
        status = `Alert ${dashboard.alerts.latest?.fileCount || ''} files`;
      } else if (watcherOk) {
        color = C.green;
        icon = 'shield';
        status = 'Protected';
      }

      const item = _item(project.name || id, 'project', {
        icon,
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
    const project = this._poller.data.get(pid);
    if (!project?.dashboard) {
      return [_item('Loading...', 'loading', { icon: 'loading~spin', color: C.blue })];
    }

    const dashboard = project.dashboard;
    const items = [];

    if (dashboard.preWarnings?.active) {
      const latest = dashboard.preWarnings.latest || {};
      items.push(_item('Pre-Warning: Active', 'prewarning', {
        icon: 'warning',
        color: C.orange,
        desc: latest.riskPercent ? `${latest.riskPercent}% risk` : undefined,
      }));

      const detail = latest.file
        ? `${latest.file} - ${latest.summary || 'Review pending deletion'}`
        : `${dashboard.preWarnings.count || 1} destructive edit warning(s) pending`;
      items.push(_item(detail, 'prewarning-detail', {
        icon: 'note',
        color: C.orange,
      }));
    }

    if (dashboard.watcher?.running) {
      items.push(_item('Watcher: Running', 'watcher', {
        icon: 'eye',
        color: C.green,
        desc: `PID ${dashboard.watcher.pid || '?'}`,
      }));
    } else {
      const watcherItem = _item('Watcher: Stopped', 'watcher', {
        icon: 'eye-closed',
        color: C.red,
      });
      watcherItem.command = { command: 'cursorGuard.startWatcher', title: 'Start Watcher' };
      watcherItem.tooltip = 'Click to start watcher';
      items.push(watcherItem);
    }

    const gitCount = dashboard.counts?.git?.commits || 0;
    const shadowCount = dashboard.counts?.shadow?.snapshots || 0;
    const lastAgo = dashboard.lastBackup?.git?.relativeTime || 'never';
    items.push(_item(`Backups: ${gitCount + shadowCount}`, 'stat', {
      icon: 'history',
      color: C.blue,
      desc: `last ${lastAgo}`,
    }));

    const health = dashboard.health?.status || 'unknown';
    const healthColor = health === 'healthy' ? C.green : health === 'critical' ? C.red : C.yellow;
    const healthIcon = health === 'healthy' ? 'pass-filled' : health === 'critical' ? 'error' : 'warning';
    items.push(_item(`Health: ${health}`, 'health', {
      icon: healthIcon,
      color: healthColor,
    }));

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
  const treeItem = new vscode.TreeItem(label, opts.collapsible || vscode.TreeItemCollapsibleState.None);
  treeItem.contextValue = ctx;
  if (opts.icon) treeItem.iconPath = new vscode.ThemeIcon(opts.icon, opts.color);
  if (opts.desc) treeItem.description = opts.desc;
  return treeItem;
}

module.exports = { GuardTreeView };
