'use strict';

const vscode = require('vscode');

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

  getTreeItem(element) { return element; }

  getChildren(element) {
    if (!element) return this._getRootItems();
    if (element.contextValue === 'project') return this._getProjectChildren(element.projectId);
    if (element.contextValue === 'actions') return this._getActionItems();
    return [];
  }

  _getRootItems() {
    const data = this._poller.data;
    const items = [];

    if (data.size === 0) {
      const hint = new TreeItem('No projects detected', 'info', {
        icon: new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.yellow')),
        description: 'Add .cursor-guard.json',
      });
      items.push(hint);
    } else {
      for (const [id, p] of data) {
        const d = p.dashboard;
        const hasAlert = d?.alerts?.active;
        const watcherOk = d?.watcher?.running;
        const iconColor = hasAlert
          ? new vscode.ThemeColor('charts.red')
          : watcherOk
            ? new vscode.ThemeColor('charts.green')
            : new vscode.ThemeColor('charts.yellow');
        const icon = hasAlert
          ? new vscode.ThemeIcon('shield', iconColor)
          : watcherOk
            ? new vscode.ThemeIcon('shield', iconColor)
            : new vscode.ThemeIcon('shield', iconColor);

        const item = new TreeItem(p.name || id, 'project', {
          icon,
          description: hasAlert ? 'ALERT' : watcherOk ? 'Protected' : 'Unprotected',
          collapsible: vscode.TreeItemCollapsibleState.Expanded,
        });
        item.projectId = id;
        items.push(item);
      }
    }

    const actionsItem = new TreeItem('Quick Actions', 'actions', {
      icon: new vscode.ThemeIcon('zap', new vscode.ThemeColor('charts.blue')),
      collapsible: vscode.TreeItemCollapsibleState.Collapsed,
    });
    items.push(actionsItem);

    return items;
  }

  _getActionItems() {
    const openDash = new TreeItem('Open Dashboard', 'action', {
      icon: new vscode.ThemeIcon('dashboard', new vscode.ThemeColor('charts.blue')),
    });
    openDash.command = { command: 'cursorGuard.openDashboard', title: 'Open Dashboard' };

    const snapshot = new TreeItem('Snapshot Now', 'action', {
      icon: new vscode.ThemeIcon('device-camera', new vscode.ThemeColor('charts.purple')),
    });
    snapshot.command = { command: 'cursorGuard.snapshotNow', title: 'Snapshot Now' };

    const startW = new TreeItem('Start Watcher', 'action', {
      icon: new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.green')),
    });
    startW.command = { command: 'cursorGuard.startWatcher', title: 'Start Watcher' };

    const stopW = new TreeItem('Stop Watcher', 'action', {
      icon: new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('charts.red')),
    });
    stopW.command = { command: 'cursorGuard.stopWatcher', title: 'Stop Watcher' };

    const refresh = new TreeItem('Refresh', 'action', {
      icon: new vscode.ThemeIcon('refresh', new vscode.ThemeColor('charts.orange')),
    });
    refresh.command = { command: 'cursorGuard.refreshTree', title: 'Refresh' };

    return [openDash, snapshot, startW, stopW, refresh];
  }

  _getProjectChildren(projectId) {
    const p = this._poller.data.get(projectId);
    if (!p?.dashboard) {
      return [new TreeItem('Loading...', 'loading', {
        icon: new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.blue')),
      })];
    }
    const d = p.dashboard;
    const items = [];

    if (d.watcher?.running) {
      const w = new TreeItem('Watcher: Running', 'watcher', {
        icon: new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.green')),
        description: d.watcher.pid ? `PID ${d.watcher.pid}` : '',
      });
      items.push(w);
    } else {
      const w = new TreeItem('Watcher: Stopped', 'watcher', {
        icon: new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('charts.red')),
        description: 'Click Quick Actions > Start',
      });
      items.push(w);
    }

    if (d.alerts?.active) {
      const a = d.alerts.latest || {};
      const alertItem = new TreeItem(
        `ALERT: ${a.fileCount || '?'} files in ${a.windowSeconds || '?'}s`,
        'alert',
        {
          icon: new vscode.ThemeIcon('bell', new vscode.ThemeColor('charts.red')),
          description: `threshold: ${a.threshold}`,
        }
      );
      items.push(alertItem);
    } else {
      items.push(new TreeItem('No alerts', 'noalert', {
        icon: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
      }));
    }

    if (d.lastBackup?.git) {
      const ago = this._relativeTime(d.lastBackup.git.timestamp);
      items.push(new TreeItem(`Last Backup: ${ago}`, 'backup', {
        icon: new vscode.ThemeIcon('git-commit', new vscode.ThemeColor('charts.blue')),
      }));
    }

    if (d.counts) {
      const gitCount = d.counts.git?.commits || 0;
      const shadowCount = d.counts.shadow?.snapshots || 0;
      items.push(new TreeItem(`Git: ${gitCount}  Shadow: ${shadowCount}`, 'counts', {
        icon: new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
      }));
    }

    const health = d.health?.status || 'unknown';
    const healthColor = health === 'healthy'
      ? new vscode.ThemeColor('charts.green')
      : health === 'critical'
        ? new vscode.ThemeColor('charts.red')
        : new vscode.ThemeColor('charts.yellow');
    const healthIcon = health === 'healthy' ? 'pass-filled' : health === 'critical' ? 'error' : 'warning';
    const healthItem = new TreeItem(`Health: ${health}`, 'health', {
      icon: new vscode.ThemeIcon(healthIcon, healthColor),
      description: d.health?.issues?.length > 0 ? d.health.issues[0] : '',
    });
    items.push(healthItem);

    return items;
  }

  _relativeTime(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  dispose() {
    this._sub?.dispose();
    this._treeView.dispose();
    this._onDidChange.dispose();
  }
}

class TreeItem extends vscode.TreeItem {
  constructor(label, contextValue, opts = {}) {
    super(label, opts.collapsible || vscode.TreeItemCollapsibleState.None);
    this.contextValue = contextValue;
    if (opts.icon) this.iconPath = opts.icon;
    if (opts.description) this.description = opts.description;
  }
}

module.exports = { GuardTreeView };
