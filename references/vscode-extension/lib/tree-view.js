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
    return [];
  }

  _getRootItems() {
    const data = this._poller.data;
    if (data.size === 0) {
      return [new TreeItem('No projects detected', 'info', { icon: 'info' })];
    }
    const items = [];
    for (const [id, p] of data) {
      const item = new TreeItem(p.name || id, 'project', {
        icon: 'folder',
        description: p.pathLabel,
        collapsible: vscode.TreeItemCollapsibleState.Expanded,
      });
      item.projectId = id;
      items.push(item);
    }
    return items;
  }

  _getProjectChildren(projectId) {
    const p = this._poller.data.get(projectId);
    if (!p?.dashboard) return [new TreeItem('Loading...', 'loading', { icon: 'loading~spin' })];
    const d = p.dashboard;
    const items = [];

    const watcherStatus = d.watcher?.running ? 'Running' : 'Stopped';
    const watcherIcon = d.watcher?.running ? 'eye' : 'eye-closed';
    const watcherItem = new TreeItem(`Watcher: ${watcherStatus}`, 'watcher', { icon: watcherIcon });
    if (d.watcher?.pid) watcherItem.description = `PID ${d.watcher.pid}`;
    items.push(watcherItem);

    if (d.lastBackup?.git) {
      const ago = this._relativeTime(d.lastBackup.git.timestamp);
      items.push(new TreeItem(`Last Backup: ${ago}`, 'backup', { icon: 'git-commit' }));
    }

    if (d.counts) {
      const gitCount = d.counts.git?.commits || 0;
      const shadowCount = d.counts.shadow?.snapshots || 0;
      items.push(new TreeItem(`Backups: ${gitCount} git, ${shadowCount} shadow`, 'counts', { icon: 'database' }));
    }

    if (d.alerts?.active) {
      const a = d.alerts.latest || {};
      const alertItem = new TreeItem(
        `ALERT: ${a.fileCount || '?'} files in ${a.windowSeconds || '?'}s`,
        'alert',
        { icon: 'warning' }
      );
      alertItem.description = `threshold: ${a.threshold}`;
      items.push(alertItem);
    }

    const health = d.health?.status || 'unknown';
    const healthIcon = health === 'healthy' ? 'pass' : health === 'critical' ? 'error' : 'warning';
    const healthItem = new TreeItem(`Health: ${health}`, 'health', { icon: healthIcon });
    if (d.health?.issues?.length > 0) {
      healthItem.description = d.health.issues[0];
    }
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
    if (opts.icon) this.iconPath = new vscode.ThemeIcon(opts.icon);
    if (opts.description) this.description = opts.description;
  }
}

module.exports = { GuardTreeView };
