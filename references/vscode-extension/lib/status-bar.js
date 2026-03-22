'use strict';

const vscode = require('vscode');

class StatusBarController {
  constructor(poller) {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._item.command = 'cursorGuard.openDashboard';
    this._item.tooltip = 'Cursor Guard - click to open dashboard';
    this._setIdle();
    this._item.show();

    this._sub = poller.onChange(data => this._update(data));
  }

  _setIdle() {
    this._item.text = '$(shield) Guard: init...';
    this._item.backgroundColor = undefined;
    this._item.color = new vscode.ThemeColor('statusBar.foreground');
  }

  _update(data) {
    let hasPreWarning = false;
    let hasAlert = false;
    let watcherRunning = false;
    let preWarningLabel = '';
    let alertFileCount = 0;
    let projectCount = 0;

    for (const [, project] of data) {
      projectCount++;
      const dashboard = project.dashboard;
      if (!dashboard) continue;

      if (dashboard.preWarnings?.active && !hasPreWarning) {
        hasPreWarning = true;
        const latest = dashboard.preWarnings.latest;
        preWarningLabel = latest?.file
          ? `${latest.file} (${latest.riskPercent || '?'}%)`
          : `${dashboard.preWarnings.count || 1} pending`;
      }

      if (dashboard.alerts?.active) {
        hasAlert = true;
        alertFileCount = dashboard.alerts.latest?.fileCount || 0;
      }

      if (dashboard.watcher?.running) watcherRunning = true;
    }

    if (hasPreWarning) {
      this._item.text = `$(warning) Guard: Delete Risk`;
      this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this._item.color = undefined;
      this._item.tooltip = `Cursor Guard - pre-warning active: ${preWarningLabel}. Click to open dashboard.`;
      return;
    }

    if (hasAlert) {
      this._item.text = `$(bell~spin) Guard: ${alertFileCount} files!`;
      this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this._item.color = undefined;
      this._item.tooltip = `Cursor Guard - alert: ${alertFileCount} files changed rapidly. Click to open dashboard.`;
      return;
    }

    if (watcherRunning) {
      this._item.text = '$(shield) Guard: OK';
      this._item.backgroundColor = undefined;
      this._item.color = new vscode.ThemeColor('statusBar.foreground');
      this._item.tooltip = 'Cursor Guard - watcher running, no active alerts. Click to open dashboard.';
      return;
    }

    if (projectCount > 0) {
      this._item.text = '$(eye-closed) Guard: Unprotected';
      this._item.backgroundColor = undefined;
      this._item.color = new vscode.ThemeColor('statusBar.foreground');
      this._item.tooltip = 'Cursor Guard - watcher not running. Click to open dashboard or start watcher from the Command Palette.';
      return;
    }

    this._item.text = '$(shield) Guard';
    this._item.backgroundColor = undefined;
    this._item.color = new vscode.ThemeColor('statusBar.foreground');
    this._item.tooltip = 'Cursor Guard - no projects detected';
  }

  dispose() {
    this._sub?.dispose();
    this._item.dispose();
  }
}

module.exports = { StatusBarController };
