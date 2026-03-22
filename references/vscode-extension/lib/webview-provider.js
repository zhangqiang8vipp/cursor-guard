'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let _publicDir = null;

function getPublicDirLazy() {
  if (_publicDir) return _publicDir;
  try {
    const { getPublicDir } = require('./paths');
    _publicDir = getPublicDir();
  } catch {
    _publicDir = path.resolve(__dirname, '..', 'dashboard', 'public');
  }
  return _publicDir;
}

class WebViewProvider {
  constructor(context, dashMgr) {
    this._context = context;
    this._dashMgr = dashMgr;
    this._panel = null;
  }

  show() {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    const publicDir = getPublicDirLazy();
    const htmlPath = path.join(publicDir, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      const baseUrl = this._dashMgr.baseUrl;
      if (baseUrl) {
        vscode.env.openExternal(vscode.Uri.parse(baseUrl + '?token=' + (this._dashMgr.token || '')));
        return;
      }
      vscode.window.showErrorMessage(
        `Cursor Guard: dashboard files not found at ${publicDir}. Try reinstalling the extension.`
      );
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'cursorGuardDashboard',
      'Cursor Guard Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(publicDir)],
      }
    );

    this._panel.webview.html = this._buildHtml(this._panel.webview, publicDir);
    this._panel.iconPath = new vscode.ThemeIcon('shield');

    this._panel.onDidDispose(() => { this._panel = null; });

    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'copy') {
        vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('Copied to clipboard');
      }
    });
  }

  _buildHtml(webview, publicDir) {
    const htmlPath = path.join(publicDir, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(publicDir, 'style.css')));
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(publicDir, 'app.js')));

    html = html.replace(/href="style\.css"/g, `href="${styleUri}"`);
    html = html.replace(/src="app\.js"/g, `src="${scriptUri}"`);

    const baseUrl = this._dashMgr.baseUrl || '';
    const token = this._dashMgr.token || '';
    const nonce = _getNonce();

    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
      `connect-src ${baseUrl || 'http://127.0.0.1:*'}`,
    ].join('; ');

    html = html.replace(
      '</head>',
      `<meta http-equiv="Content-Security-Policy" content="${csp}">
<script nonce="${nonce}">
  window.__GUARD_TOKEN__ = "${token}";
  window.__GUARD_BASE_URL__ = "${baseUrl}";
  window.__IN_VSCODE__ = true;
</script>
</head>`
    );

    return html;
  }

  dispose() {
    if (this._panel) { this._panel.dispose(); this._panel = null; }
  }
}

function _getNonce() {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

module.exports = { WebViewProvider };
