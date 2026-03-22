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
    this._item.text = '$(shield) Guard';
    this._item.backgroundColor = undefined;
  }

  _update(data) {
    let hasAlert = false;
    let watcherRunning = false;
    let alertFileCount = 0;

    for (const [, p] of data) {
      const d = p.dashboard;
      if (!d) continue;
      if (d.alerts?.active) {
        hasAlert = true;
        alertFileCount = d.alerts.latest?.fileCount || 0;
      }
      if (d.watcher?.running) watcherRunning = true;
    }

    if (hasAlert) {
      this._item.text = `$(warning) Guard: ${alertFileCount} files!`;
      this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this._item.tooltip = `Cursor Guard — ALERT: ${alertFileCount} files changed rapidly`;
    } else if (watcherRunning) {
      this._item.text = '$(shield) Guard: OK';
      this._item.backgroundColor = undefined;
      this._item.tooltip = 'Cursor Guard — watcher running, no alerts';
    } else {
      this._item.text = '$(shield) Guard';
      this._item.backgroundColor = undefined;
      this._item.tooltip = 'Cursor Guard — watcher not running';
    }
  }

  dispose() {
    this._sub?.dispose();
    this._item.dispose();
  }
}

module.exports = { StatusBarController };
