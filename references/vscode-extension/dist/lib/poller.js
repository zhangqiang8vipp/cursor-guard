'use strict';

const fs = require('fs');
const path = require('path');
const { guardPath } = require('./paths');

/** Safety net if fs.watch misses (platform limits); primary updates are filesystem events. */
const FALLBACK_POLL_MS = 180000;

function tryWatchDirRecursive(dir, cb) {
  try {
    return fs.watch(dir, { recursive: true }, cb);
  } catch {
    try {
      return fs.watch(dir, cb);
    } catch {
      return null;
    }
  }
}

class Poller {
  constructor(dashMgr) {
    this._dashMgr = dashMgr;
    this._timer = null;
    this._listeners = [];
    this._data = new Map();
    this._pollRunning = false;
    this._pollAgainAfter = false;
    this._pollWaiters = [];
    this._fsWatchers = [];
    this._watchedRegistryKey = '';
    this._fsDebounceTimer = null;
    this._reattachTimer = null;
  }

  get data() { return this._data; }

  onChange(fn) {
    this._listeners.push(fn);
    return { dispose: () => { this._listeners = this._listeners.filter(l => l !== fn); } };
  }

  _emit() {
    for (const fn of this._listeners) {
      try { fn(this._data); } catch { /* listener error */ }
    }
  }

  _teardownFsWatchers() {
    if (this._reattachTimer) {
      clearTimeout(this._reattachTimer);
      this._reattachTimer = null;
    }
    if (this._fsDebounceTimer) {
      clearTimeout(this._fsDebounceTimer);
      this._fsDebounceTimer = null;
    }
    for (const w of this._fsWatchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this._fsWatchers = [];
  }

  _scheduleFsRefresh() {
    if (this._fsDebounceTimer) clearTimeout(this._fsDebounceTimer);
    this._fsDebounceTimer = setTimeout(() => {
      this._fsDebounceTimer = null;
      void this.forceRefresh();
    }, 400);
  }

  _syncFileWatchers() {
    const reg = this._dashMgr?.registry;
    if (!reg) return;
    const key = [...reg.entries()].map(([k, v]) => `${k}:${v._path}`).sort().join('|');
    if (key === this._watchedRegistryKey) return;
    this._watchedRegistryKey = key;

    this._teardownFsWatchers();

    let utils;
    try {
      utils = require(guardPath('lib', 'utils'));
    } catch {
      return;
    }
    const { isGitRepo, gitDir: getGitDir } = utils;

    for (const proj of reg.values()) {
      const pp = proj._path;
      const pid = proj.id;

      if (isGitRepo(pp)) {
        const gDir = getGitDir(pp);
        if (gDir && fs.existsSync(gDir)) {
          try {
            const w = fs.watch(gDir, (ev, fname) => {
              if (fname === 'cursor-guard-alert.json' || fname === 'cursor-guard.lock') {
                this._scheduleFsRefresh();
              }
            });
            this._fsWatchers.push(w);
          } catch { /* ignore */ }

          const refsDir = path.join(gDir, 'refs');
          if (fs.existsSync(refsDir)) {
            try {
              const w = fs.watch(refsDir, (ev, fname) => {
                if (!fname) return;
                if (fname === 'guard' || fname.startsWith('guard')) {
                  this._scheduleFsRefresh();
                  if (!this._reattachTimer) {
                    this._reattachTimer = setTimeout(() => {
                      this._reattachTimer = null;
                      this._watchedRegistryKey = '';
                      this._syncFileWatchers();
                    }, 600);
                  }
                }
              });
              this._fsWatchers.push(w);
            } catch { /* ignore */ }
          }

          const guardDir = path.join(gDir, 'refs', 'guard');
          if (fs.existsSync(guardDir)) {
            const w = tryWatchDirRecursive(guardDir, () => this._scheduleFsRefresh());
            if (w) this._fsWatchers.push(w);
            const preRestoreDir = path.join(guardDir, 'pre-restore');
            if (fs.existsSync(preRestoreDir)) {
              const w2 = tryWatchDirRecursive(preRestoreDir, () => this._scheduleFsRefresh());
              if (w2) this._fsWatchers.push(w2);
            }
          }
        }
      }

      const backupDir = path.join(pp, '.cursor-guard-backup');
      if (fs.existsSync(backupDir)) {
        const w = tryWatchDirRecursive(backupDir, () => this._scheduleFsRefresh());
        if (w) this._fsWatchers.push(w);
      }
    }
  }

  start() {
    if (this._timer) return;
    void this._poll();
    this._timer = setInterval(() => void this._poll(), FALLBACK_POLL_MS);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _poll() {
    if (this._pollRunning) {
      this._pollAgainAfter = true;
      return;
    }
    this._pollRunning = true;
    try {
      do {
        this._pollAgainAfter = false;
        if (!this._dashMgr.running) break;
        const projects = await this._dashMgr.getProjects();
        if (!Array.isArray(projects)) break;
        for (const p of projects) {
          const fullData = await this._dashMgr.getFullPageData(p.id);
          this._data.set(p.id, {
            ...p,
            dashboard: fullData?.dashboard || null,
            backups: fullData?.backups || [],
            scope: fullData?.scope || null,
            doctor: fullData?.doctor || null,
          });
        }
        this._emit();
      } while (this._pollAgainAfter);
    } catch { /* non-critical */ }
    finally {
      this._pollRunning = false;
      const waiters = this._pollWaiters.splice(0);
      for (const fn of waiters) {
        try { fn(); } catch { /* ignore */ }
      }
      try {
        this._syncFileWatchers();
      } catch { /* ignore */ }
    }
  }

  async forceRefresh() {
    return new Promise(resolve => {
      this._pollWaiters.push(resolve);
      this._pollAgainAfter = true;
      if (!this._pollRunning) {
        void this._poll();
      }
    });
  }

  dispose() {
    this.stop();
    this._teardownFsWatchers();
    this._listeners = [];
  }
}

module.exports = { Poller };
