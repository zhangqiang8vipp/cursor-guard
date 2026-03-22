'use strict';

const vscode = require('vscode');

class StatusBarController {
  constructor(poller) {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._item.command = 'cursorGuard.openDashboard';
    this._item.tooltip = 'Cursor Guard — click to open dashboard';
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
    let hasAlert = false;
    let watcherRunning = false;
    let alertFileCount = 0;
    let projectCount = 0;

    for (const [, p] of data) {
      projectCount++;
      const d = p.dashboard;
      if (!d) continue;
      if (d.alerts?.active) {
        hasAlert = true;
        alertFileCount = d.alerts.latest?.fileCount || 0;
      }
      if (d.watcher?.running) watcherRunning = true;
    }

    if (hasAlert) {
      this._item.text = `$(bell~spin) Guard: ${alertFileCount} files!`;
      this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this._item.color = undefined;
      this._item.tooltip = `Cursor Guard — ALERT: ${alertFileCount} files changed rapidly. Click to open dashboard.`;
    } else if (watcherRunning) {
      this._item.text = '$(shield) Guard: OK';
      this._item.backgroundColor = undefined;
      this._item.color = new vscode.ThemeColor('statusBar.foreground');
      this._item.tooltip = 'Cursor Guard — watcher running, no alerts. Click to open dashboard.';
    } else if (projectCount > 0) {
      this._item.text = '$(eye-closed) Guard: Unprotected';
      this._item.backgroundColor = undefined;
      this._item.color = new vscode.ThemeColor('statusBar.foreground');
      this._item.tooltip = 'Cursor Guard — watcher NOT running. Click to open dashboard, or use Command Palette > Start Watcher.';
    } else {
      this._item.text = '$(shield) Guard';
      this._item.backgroundColor = undefined;
      this._item.color = new vscode.ThemeColor('statusBar.foreground');
      this._item.tooltip = 'Cursor Guard — no projects detected';
    }
  }

  dispose() {
    this._sub?.dispose();
    this._item.dispose();
  }
}

module.exports = { StatusBarController };
