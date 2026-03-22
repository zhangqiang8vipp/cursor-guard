'use strict';

const vscode = require('vscode');
const { DashboardManager } = require('./lib/dashboard-manager');
const { WebViewProvider } = require('./lib/webview-provider');
const { StatusBarController } = require('./lib/status-bar');
const { GuardTreeView } = require('./lib/tree-view');
const { Poller } = require('./lib/poller');

let dashMgr, poller, statusBar, treeView, webviewProvider;

async function activate(context) {
  dashMgr = new DashboardManager();
  poller = new Poller(dashMgr);
  statusBar = new StatusBarController(poller);
  treeView = new GuardTreeView(poller, dashMgr);
  webviewProvider = new WebViewProvider(context, dashMgr);

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorGuard.openDashboard', () => {
      if (!dashMgr.running) {
        vscode.window.showWarningMessage('Cursor Guard: no projects detected. Add .cursor-guard.json to your workspace.');
        return;
      }
      webviewProvider.show();
    }),

    vscode.commands.registerCommand('cursorGuard.snapshotNow', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return;
      const projectPath = folders[0].uri.fsPath;
      const result = await dashMgr.snapshotNow(projectPath);
      if (result?.status === 'created') {
        vscode.window.showInformationMessage(`Cursor Guard: snapshot created (${result.changedCount || 0} changes)`);
      } else if (result?.status === 'unchanged') {
        vscode.window.showInformationMessage('Cursor Guard: no changes to snapshot');
      } else {
        vscode.window.showWarningMessage(`Cursor Guard: ${result?.error || 'snapshot failed'}`);
      }
      poller.forceRefresh();
    }),

    vscode.commands.registerCommand('cursorGuard.startWatcher', () => {
      vscode.window.showInformationMessage(
        'Cursor Guard: run `cursor-guard-backup --path <dir> --dashboard` in terminal to start the watcher.'
      );
    }),

    vscode.commands.registerCommand('cursorGuard.stopWatcher', () => {
      vscode.window.showInformationMessage(
        'Cursor Guard: stop the watcher by terminating its terminal process (Ctrl+C).'
      );
    }),

    vscode.commands.registerCommand('cursorGuard.refreshTree', () => {
      poller.forceRefresh();
      treeView.refresh();
    }),

    statusBar,
    poller,
    treeView,
    webviewProvider,
  );

  const started = await dashMgr.autoStart(vscode.workspace.workspaceFolders);
  if (started) {
    poller.start();
    vscode.window.showInformationMessage(`Cursor Guard: dashboard started on port ${dashMgr.port}`);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      const restarted = await dashMgr.autoStart(vscode.workspace.workspaceFolders);
      if (restarted && !poller._timer) poller.start();
      poller.forceRefresh();
    })
  );
}

function deactivate() {
  if (poller) poller.dispose();
  if (statusBar) statusBar.dispose();
  if (treeView) treeView.dispose();
  if (webviewProvider) webviewProvider.dispose();
  if (dashMgr) dashMgr.dispose();
}

module.exports = { activate, deactivate };
