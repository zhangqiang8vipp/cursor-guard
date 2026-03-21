#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getDashboard } = require('../lib/core/dashboard');
const { runDiagnostics } = require('../lib/core/doctor');
const { listBackups } = require('../lib/core/backups');
const { loadActiveAlert } = require('../lib/core/anomaly');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_PORT = 3120;
const MAX_PORT_RETRIES = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ── CLI ────────────────────────────────────────────────────── */

function parseCliArgs() {
  const result = { paths: [], port: DEFAULT_PORT };
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--path' && next && !next.startsWith('--')) {
      result.paths.push(path.resolve(next));
      i++;
    } else if (arg === '--port' && next) {
      result.port = parseInt(next, 10) || DEFAULT_PORT;
      i++;
    }
  }
  if (result.paths.length === 0) result.paths.push(process.cwd());
  return result;
}

/* ── Project Registry ───────────────────────────────────────── */

function buildRegistry(paths) {
  const map = new Map();
  const seen = new Set();
  let idx = 0;
  for (const raw of paths) {
    const resolved = path.resolve(raw);
    if (seen.has(resolved.toLowerCase())) continue;
    seen.add(resolved.toLowerCase());
    const id = `p${idx++}`;
    const name = path.basename(resolved) || resolved;
    const label = resolved.length > 50 ? '...' + resolved.slice(-47) : resolved;
    map.set(id, { id, name, pathLabel: label, _path: resolved });
  }
  return map;
}

/* ── HTTP helpers ───────────────────────────────────────────── */

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function notFound(res) { res.writeHead(404); res.end('Not Found'); }
function forbidden(res) { res.writeHead(403); res.end('Forbidden'); }

/* ── Static file server (strict) ────────────────────────────── */

function serveStatic(reqUrl, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(reqUrl, 'http://x').pathname); }
  catch { return notFound(res); }

  if (pathname === '/') pathname = '/index.html';
  if (pathname.indexOf('\0') !== -1) return forbidden(res);

  const resolved = path.resolve(path.join(PUBLIC_DIR, pathname));
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    return forbidden(res);
  }

  fs.readFile(resolved, (err, data) => {
    if (err) return notFound(res);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

/* ── API routes ─────────────────────────────────────────────── */

function handleApi(pathname, query, registry, res) {
  if (pathname === '/api/projects') {
    const list = [...registry.values()].map(({ id, name, pathLabel }) => ({ id, name, pathLabel }));
    return json(res, list);
  }

  const id = query.get('id');
  const project = id ? registry.get(id) : null;
  if (!project) return json(res, { error: 'Invalid or missing project id' }, 400);
  const pp = project._path;

  if (!fs.existsSync(pp)) {
    return json(res, { error: `Project directory not accessible: ${project.pathLabel}` }, 500);
  }

  if (pathname === '/api/page-data') {
    const result = { timestamp: new Date().toISOString() };
    try { result.dashboard = getDashboard(pp); }
    catch (e) { result.dashboard = { error: e.message }; }
    try { result.doctor = runDiagnostics(pp); }
    catch (e) { result.doctor = { error: e.message }; }
    try { result.backups = listBackups(pp, { limit: 50 }).sources || []; }
    catch (e) { result.backups = { error: e.message }; }
    return json(res, result);
  }

  if (pathname === '/api/backups') {
    try {
      const type = query.get('type') || undefined;
      const limit = Math.min(parseInt(query.get('limit')) || 50, 200);
      const raw = listBackups(pp, { limit });
      let sources = raw.sources || [];
      if (type) sources = sources.filter(s => s.type === type);
      return json(res, { sources });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  if (pathname === '/api/doctor') {
    try { return json(res, runDiagnostics(pp)); }
    catch (e) { return json(res, { error: e.message }, 500); }
  }

  return notFound(res);
}

/* ── Server ─────────────────────────────────────────────────── */

function main() {
  const args = parseCliArgs();
  const registry = buildRegistry(args.paths);
  let port = args.port;
  let retries = 0;

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405);
      return res.end('Method Not Allowed');
    }
    let parsed;
    try { parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
    catch { return notFound(res); }

    if (parsed.pathname.startsWith('/api/')) {
      handleApi(parsed.pathname, parsed.searchParams, registry, res);
    } else {
      serveStatic(req.url, res);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries < MAX_PORT_RETRIES) {
      retries++;
      port++;
      server.listen(port, '127.0.0.1');
    } else {
      console.error('Failed to start:', err.message);
      process.exit(1);
    }
  });

  server.on('listening', () => {
    const addr = server.address();
    console.log('');
    console.log('  Cursor Guard Dashboard');
    console.log('  ─────────────────────────');
    console.log(`  URL:      http://127.0.0.1:${addr.port}`);
    console.log(`  Projects: ${registry.size}`);
    for (const p of registry.values()) {
      console.log(`    [${p.id}] ${p.name} → ${p._path}`);
    }
    console.log('');
  });

  server.listen(port, '127.0.0.1');
}

main();
