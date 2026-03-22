'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { guardPath } = require('./paths');

const CONFIG_FILE = '.cursor-guard.json';
const WATCHER_START_GRACE_MS = 8000;

class DashboardManager {
  constructor() {
    this._instance = null;
    this._serverModule = null;
    this._startingWatchers = new Map();
  }

  get running() { return !!this._instance; }
  get port() { return this._instance?.port; }
  get token() { return this._instance?.token; }
  get baseUrl() { return this._instance ? `http://127.0.0.1:${this._instance.port}` : null; }
  get registry() { return this._instance?.registry; }

  async autoStart(workspaceFolders) {
    if (!workspaceFolders || workspaceFolders.length === 0) return false;
    const paths = workspaceFolders
      .map(f => f.uri.fsPath)
      .filter(p => fs.existsSync(path.join(p, CONFIG_FILE)));
    if (paths.length === 0) return false;
    return this.start(paths);
  }

  async ensureRunning(paths) {
    if (this._instance) return true;
    const configPaths = paths.filter(p => fs.existsSync(path.join(p, CONFIG_FILE)));
    if (configPaths.length === 0) return false;
    return this.start(configPaths);
  }

  async start(paths) {
    if (!this._serverModule) {
      this._serverModule = require(guardPath('dashboard', 'server'));
    }
    const { startDashboardServer, getInstance } = this._serverModule;
    const existing = getInstance();
    if (existing) {
      await startDashboardServer(paths, { silent: true });
      this._instance = getInstance();
    } else {
      this._instance = await startDashboardServer(paths, { port: 3120, silent: true });
    }
    return true;
  }

  async fetchApi(endpoint) {
    if (!this._instance) return null;
    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${this.token}`;
    return new Promise((resolve) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
  }

  async getProjects() {
    return this.fetchApi('/api/projects') || [];
  }

  async getPageData(projectId, scope) {
    const scopeParam = scope ? `&scope=${scope}` : '';
    return this.fetchApi(`/api/page-data?id=${projectId}${scopeParam}`);
  }

  async getFullPageData(projectId) {
    return this.fetchApi(`/api/page-data?id=${projectId}`);
  }

  async getBackupFiles(projectId, hash) {
    return this.fetchApi(`/api/backup-files?id=${projectId}&hash=${hash}`);
  }

  async snapshotNow(projectPath) {
    if (!projectPath) return;
    try {
      const { createGitSnapshot } = require(guardPath('lib', 'core', 'snapshot'));
      const { loadConfig } = require(guardPath('lib', 'utils'));
      const { cfg } = loadConfig(projectPath);
      return createGitSnapshot(projectPath, cfg, { message: 'guard: manual snapshot via IDE extension' });
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }

  _getWatcherLockPath(projectPath) {
    try {
      const { gitAvailable, isGitRepo, gitDir: getGitDir } = require(guardPath('lib', 'utils'));
      const repo = gitAvailable() && isGitRepo(projectPath);
      if (repo) {
        const gDir = getGitDir(projectPath);
        if (gDir) return path.join(gDir, 'cursor-guard.lock');
      }
    } catch { /* ignore */ }
    return path.join(projectPath, '.cursor-guard-backup', 'cursor-guard.lock');
  }

  _getPendingWatcherPid(projectPath) {
    const pending = this._startingWatchers.get(projectPath);
    if (!pending) return null;
    try {
      process.kill(pending.pid, 0);
      return pending.pid;
    } catch {
      this._startingWatchers.delete(projectPath);
      return null;
    }
  }

  _clearPendingWatcher(projectPath, pid) {
    const pending = this._startingWatchers.get(projectPath);
    if (!pending) return;
    if (pid == null || pending.pid === pid) {
      this._startingWatchers.delete(projectPath);
    }
  }

  startWatcher(projectPath) {
    if (!projectPath) return null;
    const existingPid = this.getWatcherPid(projectPath);
    if (existingPid) return existingPid;
    const cliScript = guardPath('bin', 'cursor-guard-backup.js');
    const child = spawn(process.execPath, [cliScript, '--path', projectPath], {
      cwd: projectPath,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, GUARD_SPAWNED_BY_EXT: '1' },
    });
    this._startingWatchers.set(projectPath, { pid: child.pid, startedAt: Date.now() });
    const clearPending = () => this._clearPendingWatcher(projectPath, child.pid);
    child.once('exit', clearPending);
    child.once('error', clearPending);
    setTimeout(clearPending, WATCHER_START_GRACE_MS);
    child.unref();
    return child.pid;
  }

  stopWatcher(projectPath) {
    if (!projectPath) return false;
    const pendingPid = this._getPendingWatcherPid(projectPath);
    if (pendingPid) {
      try { process.kill(pendingPid, 'SIGTERM'); } catch { /* ignore */ }
      this._clearPendingWatcher(projectPath, pendingPid);
    }
    try {
      const lockPath = this._getWatcherLockPath(projectPath);
      if (!fs.existsSync(lockPath)) return false;
      const content = fs.readFileSync(lockPath, 'utf-8');
      const pidMatch = content.match(/pid=(\d+)/);
      if (pidMatch) {
        process.kill(parseInt(pidMatch[1], 10), 'SIGTERM');
      }
      try { fs.unlinkSync(lockPath); } catch { /* ok */ }
      return true;
    } catch { /* ok */ }
    return !!pendingPid;
  }

  getWatcherPid(projectPath) {
    const pendingPid = this._getPendingWatcherPid(projectPath);
    if (pendingPid) return pendingPid;
    try {
      const lockPath = this._getWatcherLockPath(projectPath);
      if (!fs.existsSync(lockPath)) return null;
      const content = fs.readFileSync(lockPath, 'utf-8');
      const pidMatch = content.match(/pid=(\d+)/);
      if (pidMatch) {
        const pid = parseInt(pidMatch[1], 10);
        process.kill(pid, 0);
        this._clearPendingWatcher(projectPath, pid);
        return pid;
      }
    } catch { /* not running */ }
    return null;
  }

  dispose() {
    this._instance = null;
  }
}

module.exports = { DashboardManager };
