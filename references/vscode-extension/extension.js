'use strict';

const vscode = require('vscode');
const { DashboardManager } = require('./lib/dashboard-manager');
const { WebViewProvider } = require('./lib/webview-provider');
const { StatusBarController } = require('./lib/status-bar');
const { GuardTreeView } = require('./lib/tree-view');
const { Poller } = require('./lib/poller');
const { SidebarDashboardProvider } = require('./lib/sidebar-webview');

let dashMgr, poller, statusBar, treeView, webviewProvider, sidebarProvider;

async function activate(context) {
  dashMgr = new DashboardManager();
  poller = new Poller(dashMgr);
  statusBar = new StatusBarController(poller);
  treeView = new GuardTreeView(poller, dashMgr);
  webviewProvider = new WebViewProvider(context, dashMgr);
  sidebarProvider = new SidebarDashboardProvider(poller);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cursorGuardDashboard', sidebarProvider),

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

    vscode.commands.registerCommand('cursorGuard.startWatcher', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('Cursor Guard: no workspace folder open.');
        return;
      }
      const projectPath = folders[0].uri.fsPath;
      const existingPid = dashMgr.getWatcherPid(projectPath);
      if (existingPid) {
        vscode.window.showInformationMessage(`Cursor Guard: watcher already running (PID ${existingPid})`);
        return;
      }
      const pid = dashMgr.startWatcher(projectPath);
      if (pid) {
        vscode.window.showInformationMessage(`Cursor Guard: watcher started (PID ${pid})`);
        setTimeout(() => poller.forceRefresh(), 2000);
      } else {
        vscode.window.showWarningMessage('Cursor Guard: failed to start watcher');
      }
    }),

    vscode.commands.registerCommand('cursorGuard.stopWatcher', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return;
      const projectPath = folders[0].uri.fsPath;
      const stopped = dashMgr.stopWatcher(projectPath);
      if (stopped) {
        vscode.window.showInformationMessage('Cursor Guard: watcher stopped');
        setTimeout(() => poller.forceRefresh(), 1000);
      } else {
        vscode.window.showWarningMessage('Cursor Guard: no running watcher found');
      }
    }),

    vscode.commands.registerCommand('cursorGuard.refreshTree', () => {
      poller.forceRefresh();
      treeView.refresh();
    }),

    statusBar,
    poller,
    treeView,
    webviewProvider,
    sidebarProvider,
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
  if (sidebarProvider) sidebarProvider.dispose();
  if (dashMgr) dashMgr.dispose();
}

module.exports = { activate, deactivate };
