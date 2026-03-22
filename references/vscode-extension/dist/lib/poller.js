'use strict';

const vscode = require('vscode');

const POLL_INTERVAL = 5000;

class Poller {
  constructor(dashMgr) {
    this._dashMgr = dashMgr;
    this._timer = null;
    this._listeners = [];
    this._data = new Map();
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

  start() {
    if (this._timer) return;
    this._poll();
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _poll() {
    if (!this._dashMgr.running) return;
    try {
      const projects = await this._dashMgr.getProjects();
      if (!Array.isArray(projects)) return;
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
    } catch { /* non-critical */ }
  }

  async forceRefresh() {
    await this._poll();
  }

  dispose() {
    this.stop();
    this._listeners = [];
  }
}

module.exports = { Poller };
