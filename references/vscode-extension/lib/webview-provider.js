'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getPublicDir } = require('./paths');

const PUBLIC_DIR = getPublicDir();

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

    this._panel = vscode.window.createWebviewPanel(
      'cursorGuardDashboard',
      'Cursor Guard Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(PUBLIC_DIR)],
      }
    );

    this._panel.webview.html = this._buildHtml(this._panel.webview);
    this._panel.iconPath = new vscode.ThemeIcon('shield');

    this._panel.onDidDispose(() => { this._panel = null; });

    this._panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'copy') {
        vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('Copied to clipboard');
      }
    });
  }

  _buildHtml(webview) {
    const htmlPath = path.join(PUBLIC_DIR, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(PUBLIC_DIR, 'style.css')));
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(PUBLIC_DIR, 'app.js')));

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
      `connect-src ${baseUrl}`,
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
