'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CONFIG_FILE = '.cursor-guard.json';

class DashboardManager {
  constructor() {
    this._instance = null;
    this._serverModule = null;
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

  async start(paths) {
    if (!this._serverModule) {
      this._serverModule = require('../../dashboard/server');
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
    return new Promise((resolve, reject) => {
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
      const { createGitSnapshot } = require('../../lib/core/snapshot');
      const { loadConfig } = require('../../lib/utils');
      const { cfg } = loadConfig(projectPath);
      return createGitSnapshot(projectPath, cfg, { message: 'guard: manual snapshot via IDE extension' });
    } catch (e) {
      return { status: 'error', error: e.message };
    }
  }

  startWatcher(projectPath) {
    if (!projectPath) return null;
    const existingPid = this.getWatcherPid(projectPath);
    if (existingPid) return existingPid;
    const cliScript = path.resolve(__dirname, '..', '..', 'bin', 'cursor-guard-backup.js');
    const child = spawn(process.execPath, [cliScript, '--path', projectPath], {
      cwd: projectPath,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, GUARD_SPAWNED_BY_EXT: '1' },
    });
    child.unref();
    return child.pid;
  }

  stopWatcher(projectPath) {
    if (!projectPath) return false;
    try {
      const lockPath = path.join(projectPath, '.cursor-guard-backup.lock');
      if (!fs.existsSync(lockPath)) return false;
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      if (lockData.pid) {
        process.kill(lockData.pid, 'SIGTERM');
        try { fs.unlinkSync(lockPath); } catch { /* ok */ }
        return true;
      }
    } catch { /* ok */ }
    return false;
  }

  getWatcherPid(projectPath) {
    try {
      const lockPath = path.join(projectPath, '.cursor-guard-backup.lock');
      if (!fs.existsSync(lockPath)) return null;
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      if (lockData.pid) {
        process.kill(lockData.pid, 0);
        return lockData.pid;
      }
    } catch { /* not running */ }
    return null;
  }

  dispose() {
    this._instance = null;
  }
}

module.exports = { DashboardManager };
