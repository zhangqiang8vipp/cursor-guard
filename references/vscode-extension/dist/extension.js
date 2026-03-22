'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { DashboardManager } = require('./lib/dashboard-manager');
const { WebViewProvider } = require('./lib/webview-provider');
const { StatusBarController } = require('./lib/status-bar');
const { GuardTreeView } = require('./lib/tree-view');
const { Poller } = require('./lib/poller');
const { SidebarDashboardProvider } = require('./lib/sidebar-webview');
const { autoSetup } = require('./lib/auto-setup');
const { guardPath } = require('./lib/paths');

let dashMgr, poller, statusBar, treeView, webviewProvider, sidebarProvider;
const _preWarningBaselines = new Map();
const _preWarningTimers = new Map();
const _preWarningFingerprints = new Map();
const PRE_WARNING_DEBOUNCE_MS = 200;
const PRE_WARNING_POPUP_COOLDOWN_MS = 5000;

function _docKey(document) {
  return document.uri.toString();
}

function _getPreWarningDeps() {
  return {
    loadConfig: require(guardPath('lib', 'utils')).loadConfig,
    ...require(guardPath('lib', 'core', 'pre-warning')),
  };
}

function _getProjectInfo(document) {
  if (!document || document.uri.scheme !== 'file') return null;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) return null;
  const projectPath = folder.uri.fsPath;
  const relPath = path.relative(projectPath, document.uri.fsPath).replace(/\\/g, '/');
  if (!relPath || relPath.startsWith('..')) return null;
  return { projectPath, relPath };
}

function _seedBaseline(document) {
  if (!document || document.uri.scheme !== 'file') return;
  _preWarningBaselines.set(_docKey(document), document.getText());
}

function _clearDocPreWarningState(document) {
  const key = _docKey(document);
  const timer = _preWarningTimers.get(key);
  if (timer) clearTimeout(timer);
  _preWarningTimers.delete(key);
  _preWarningBaselines.delete(key);
  _preWarningFingerprints.delete(key);
}

function _isLikelyDeleteBatch(event) {
  const deletedChars = event.contentChanges.reduce((sum, change) => {
    return sum + Math.max(0, change.rangeLength - (change.text || '').length);
  }, 0);
  const deletedLines = event.contentChanges.reduce((sum, change) => {
    return sum + Math.max(0, change.range.end.line - change.range.start.line);
  }, 0);
  return deletedChars >= 8
    || deletedLines > 0
    || event.contentChanges.some(change => change.rangeLength >= 20 || (change.rangeLength > 0 && !change.text));
}

async function _openPreWarningDiff(document, previousText) {
  const beforeDoc = await vscode.workspace.openTextDocument({
    language: document.languageId,
    content: previousText,
  });
  await vscode.commands.executeCommand(
    'vscode.diff',
    beforeDoc.uri,
    document.uri,
    `Cursor Guard Pre-Warning: ${path.basename(document.uri.fsPath)}`
  );
}

async function _showPreWarningPopup(document, relPath, previousText, warning, projectPath) {
  const methodHint = Array.isArray(warning.removedMethods) && warning.removedMethods.length > 0
    ? ` - ${warning.removedMethods.slice(0, 3).map(m => `${m.name}:${m.lineNumber}`).join(', ')}`
    : '';
  const action = await vscode.window.showWarningMessage(
    `Cursor Guard: risky deletion detected in ${relPath} - ${warning.summary}${methodHint}`,
    { modal: true },
    'Undo Change',
    'View Diff',
    'Keep Changes'
  );

  if (action === 'Undo Change') {
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    await vscode.commands.executeCommand('undo');
    const { clearPreWarning } = _getPreWarningDeps();
    clearPreWarning(projectPath, relPath);
    if (poller) poller.forceRefresh();
    return;
  }

  if (action === 'View Diff') {
    await _openPreWarningDiff(document, previousText);
  }
}

async function _assessPreWarning(document) {
  if (!document || document.isClosed || document.uri.scheme !== 'file') return;

  const info = _getProjectInfo(document);
  if (!info) return;

  const key = _docKey(document);
  const previousText = _preWarningBaselines.get(key) ?? document.getText();
  const deps = _getPreWarningDeps();
  const { cfg } = deps.loadConfig(info.projectPath);

  if (!deps.isPreWarningEnabled(cfg) || deps.shouldExcludePreWarning(info.relPath, cfg)) {
    deps.clearPreWarning(info.projectPath, info.relPath);
    _preWarningFingerprints.delete(key);
    if (poller) poller.forceRefresh();
    return;
  }

  const assessment = deps.assessDeletionRisk(previousText, document.getText(), {
    threshold: cfg.pre_warning_threshold,
  });

  if (!assessment.triggered) {
    deps.clearPreWarning(info.projectPath, info.relPath);
    _preWarningFingerprints.delete(key);
    if (poller) poller.forceRefresh();
    return;
  }

  const warning = {
    file: info.relPath,
    mode: cfg.pre_warning_mode,
    threshold: cfg.pre_warning_threshold,
    deletedLines: assessment.deletedLines,
    removedMethodCount: assessment.removedMethodCount,
    removedMethods: assessment.removedMethods.slice(0, 10),
    riskPercent: assessment.riskPercent,
    summary: assessment.summary,
    deletedLineSamples: assessment.deletedLineSamples,
  };

  const fingerprint = JSON.stringify([
    warning.file,
    warning.deletedLines,
    warning.removedMethodCount,
    warning.riskPercent,
    warning.removedMethods.map(m => m.name).join(','),
  ]);
  const last = _preWarningFingerprints.get(key);
  _preWarningFingerprints.set(key, { fingerprint, at: Date.now() });

  deps.recordPreWarning(info.projectPath, warning, {
    setActive: cfg.pre_warning_mode !== 'silent',
  });
  if (poller) poller.forceRefresh();

  if (cfg.pre_warning_mode === 'silent') {
    console.warn(`[cursor-guard] pre-warning ${info.relPath}: ${warning.summary}`);
    return;
  }

  if (cfg.pre_warning_mode === 'popup') {
    if (last && last.fingerprint === fingerprint && Date.now() - last.at < PRE_WARNING_POPUP_COOLDOWN_MS) {
      return;
    }
    await _showPreWarningPopup(document, info.relPath, previousText, warning, info.projectPath);
  }
}

async function activate(context) {
  await autoSetup(context, vscode);

  dashMgr = new DashboardManager();
  poller = new Poller(dashMgr);
  statusBar = new StatusBarController(poller);
  treeView = new GuardTreeView(poller, dashMgr);
  webviewProvider = new WebViewProvider(context, dashMgr);
  sidebarProvider = new SidebarDashboardProvider(poller);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cursorGuardDashboard', sidebarProvider),

    vscode.commands.registerCommand('cursorGuard.openDashboard', async () => {
      if (!dashMgr.running) {
        const action = await vscode.window.showWarningMessage(
          'Cursor Guard: Dashboard server not running.',
          'Start Server', 'Cancel'
        );
        if (action === 'Start Server') {
          const folders = vscode.workspace.workspaceFolders;
          if (folders) {
            await dashMgr.ensureRunning(folders.map(f => f.uri.fsPath));
          }
          if (!dashMgr.running) {
            vscode.window.showErrorMessage('Cursor Guard: failed to start dashboard server.');
            return;
          }
        } else {
          return;
        }
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
      } else if (result?.status === 'unchanged' || result?.status === 'skipped') {
        vscode.window.showInformationMessage('Cursor Guard: no changes to snapshot');
      } else if (result?.status === 'error') {
        vscode.window.showWarningMessage(`Cursor Guard: ${result.error}`);
      } else {
        vscode.window.showWarningMessage(`Cursor Guard: snapshot returned status "${result?.status || 'unknown'}"`);
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

    vscode.commands.registerCommand('cursorGuard.quickRestore', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return;
      if (!dashMgr.running) {
        vscode.window.showWarningMessage('Cursor Guard: dashboard not running. Cannot list backups.');
        return;
      }
      const projects = await dashMgr.fetchApi('/api/projects');
      if (!projects || projects.length === 0) return;
      const pid = projects[0].id;
      const pageData = await dashMgr.getFullPageData(pid);
      const backups = (pageData?.backups || []).slice(0, 8);
      if (backups.length === 0) {
        vscode.window.showInformationMessage('Cursor Guard: no backups available to restore from.');
        return;
      }
      const items = backups.map(b => {
        const time = b.timestamp ? new Date(b.timestamp).toLocaleString() : '?';
        const files = b.filesChanged ? `${b.filesChanged} files` : '';
        const summary = b.summary ? b.summary.slice(0, 60) : '';
        return {
          label: `$(git-commit) ${time}`,
          description: `${b.type || 'auto'} - ${files}`,
          detail: summary,
          hash: b.commitHash,
        };
      });
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a backup to restore from',
        title: 'Cursor Guard: Quick Restore',
      });
      if (selected && selected.hash) {
        const url = `${dashMgr.baseUrl}?token=${dashMgr.token}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
        vscode.window.showInformationMessage(
          `Cursor Guard: opening dashboard for restore. Selected backup: ${selected.hash.slice(0, 7)}`
        );
      }
    }),

    vscode.commands.registerCommand('cursorGuard.doctor', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) return;
      const projectPath = folders[0].uri.fsPath;
      try {
        const { runDiagnostics } = require(guardPath('lib', 'core', 'doctor'));
        const result = runDiagnostics(projectPath);
        const passed = result.checks.filter(c => c.status === 'PASS').length;
        const warned = result.checks.filter(c => c.status === 'WARN').length;
        const failed = result.checks.filter(c => c.status === 'FAIL').length;
        const msg = `Doctor: ${passed} passed, ${warned} warnings, ${failed} failed`;
        if (failed > 0) {
          vscode.window.showErrorMessage(`Cursor Guard: ${msg}`);
        } else if (warned > 0) {
          vscode.window.showWarningMessage(`Cursor Guard: ${msg}`);
        } else {
          vscode.window.showInformationMessage(`Cursor Guard: ${msg}`);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Cursor Guard Doctor: ${e.message}`);
      }
    }),

    vscode.commands.registerCommand('cursorGuard.addToProtect', (uri) => {
      _modifyGuardConfig(uri, 'protect');
    }),

    vscode.commands.registerCommand('cursorGuard.addToIgnore', (uri) => {
      _modifyGuardConfig(uri, 'ignore');
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

  let _fsRefreshTimer = null;
  const _scheduleRefresh = () => {
    if (_fsRefreshTimer) clearTimeout(_fsRefreshTimer);
    _fsRefreshTimer = setTimeout(() => poller.forceRefresh(), 1500);
  };
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
  fileWatcher.onDidChange(_scheduleRefresh);
  fileWatcher.onDidCreate(_scheduleRefresh);
  fileWatcher.onDidDelete(_scheduleRefresh);
  context.subscriptions.push(fileWatcher);

  for (const document of vscode.workspace.textDocuments) {
    _seedBaseline(document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      _seedBaseline(document);
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      const info = _getProjectInfo(document);
      _clearDocPreWarningState(document);
      if (info) {
        const { clearPreWarning } = _getPreWarningDeps();
        clearPreWarning(info.projectPath, info.relPath);
        if (poller) poller.forceRefresh();
      }
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      const info = _getProjectInfo(document);
      _seedBaseline(document);
      _preWarningFingerprints.delete(_docKey(document));
      if (info) {
        const { clearPreWarning } = _getPreWarningDeps();
        clearPreWarning(info.projectPath, info.relPath);
        if (poller) poller.forceRefresh();
      }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      const info = _getProjectInfo(event.document);
      if (!info || !_isLikelyDeleteBatch(event)) return;

      const key = _docKey(event.document);
      const existing = _preWarningTimers.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        _preWarningTimers.delete(key);
        _assessPreWarning(event.document).catch(err => {
          console.warn(`[cursor-guard] pre-warning failed for ${info.relPath}: ${err.message}`);
        });
      }, PRE_WARNING_DEBOUNCE_MS);

      _preWarningTimers.set(key, timer);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      const restarted = await dashMgr.autoStart(vscode.workspace.workspaceFolders);
      if (restarted && !poller._timer) poller.start();
      poller.forceRefresh();
    })
  );
}

async function _modifyGuardConfig(uri, field) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('Cursor Guard: no workspace folder open.');
    return;
  }

  let targetUri = uri;
  if (!targetUri) {
    const editor = vscode.window.activeTextEditor;
    if (editor) targetUri = editor.document.uri;
  }
  if (!targetUri) {
    vscode.window.showWarningMessage('Cursor Guard: no file or folder selected.');
    return;
  }

  const wsRoot = folders[0].uri.fsPath;
  const configPath = path.join(wsRoot, '.cursor-guard.json');
  const targetPath = targetUri.fsPath;

  const relative = path.relative(wsRoot, targetPath).replace(/\\/g, '/');
  if (!relative || relative.startsWith('..')) {
    vscode.window.showWarningMessage('Cursor Guard: selected path is outside the workspace.');
    return;
  }

  let isDir = false;
  try { isDir = fs.statSync(targetPath).isDirectory(); } catch { /* file */ }
  const pattern = isDir ? `${relative}/**` : relative;

  const action = field === 'protect' ? 'Add to Protected' : 'Exclude from Protection';
  const pick = await vscode.window.showQuickPick(
    [
      { label: pattern, description: isDir ? 'directory glob' : 'exact file' },
      { label: `${path.basename(targetPath)}`, description: 'filename only (matches anywhere)' },
      ...(isDir ? [] : [{ label: `*.${path.extname(targetPath).slice(1)}`, description: 'file extension' }]),
      { label: '$(edit) Custom pattern...', description: 'enter your own glob', custom: true },
    ],
    { placeHolder: `${action}: choose a pattern`, title: `Cursor Guard: ${action}` }
  );
  if (!pick) return;

  let chosenPattern = pick.label;
  if (pick.custom) {
    const input = await vscode.window.showInputBox({
      prompt: `Enter a glob pattern to ${field === 'protect' ? 'protect' : 'exclude'}`,
      value: pattern,
    });
    if (!input) return;
    chosenPattern = input;
  }

  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { config = {}; }
  }

  if (!Array.isArray(config[field])) config[field] = [];

  if (config[field].includes(chosenPattern)) {
    vscode.window.showInformationMessage(`Cursor Guard: "${chosenPattern}" already in ${field} list.`);
    return;
  }

  config[field].push(chosenPattern);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const label = field === 'protect' ? 'Protected' : 'Excluded';
  vscode.window.showInformationMessage(`Cursor Guard: "${chosenPattern}" added to ${label} list.`);

  if (poller) poller.forceRefresh();
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
