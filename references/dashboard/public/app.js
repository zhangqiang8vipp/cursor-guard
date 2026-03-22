'use strict';

/* ═══════════════════════════════════════════════════════════════
   Cursor Guard Dashboard — Frontend
   ═══════════════════════════════════════════════════════════════ */

/* ── I18n Dictionary ──────────────────────────────────────── */

const I18N = {
  'en-US': {
    'app.title':        'Cursor Guard Dashboard',
    'topbar.refresh':   'Refresh',
    'topbar.lastRefresh':'Last refresh',
    'state.loading':    'Loading…',
    'state.retry':      'Retry',

    'overview.title':   'Overview',
    'backups.title':    'Backups & Recovery',
    'protection.title': 'Protection Scope',
    'diagnostics.title':'Diagnostics',

    'health.title':     'Health',
    'health.healthy':   'Healthy',
    'health.warning':   'Warning',
    'health.critical':  'Critical',
    'health.unknown':   'Unknown',

    'gitBackup.title':  'Latest Git Backup',
    'gitBackup.none':   'No Git backup yet',
    'shadowBackup.title':'Latest Shadow Snapshot',
    'shadowBackup.none':'No Shadow snapshot yet',

    'watcher.title':    'Watcher',
    'watcher.running':  'Running',
    'watcher.stopped':  'Stopped',
    'watcher.stale':    'Stale',
    'watcher.pid':      'PID',
    'watcher.since':    'Since',

    'alert.title':      'Alerts',
    'alert.none':       'No active alerts',
    'alert.active':     'Active Alert',
    'alert.triggered':  'Triggered',
    'alert.expires':    'Expires in',
    'alert.detail':     '{count} files in {window}s (threshold: {threshold})',
    'alert.expired':    'Expired',
    'alert.history':    'Recent Alert History',
    'alert.noHistory':  'No alert history',
    'alert.historyCount':'History ({n})',
    'alert.showFiles':  'Show file details',
    'alert.hideFiles':  'Hide file details',
    'alert.col.file':   'File',
    'alert.col.action': 'Action',
    'alert.col.changes':'Changes',
    'alert.action.modified': 'Modified',
    'alert.action.added':    'Added',
    'alert.action.deleted':  'Deleted',
    'alert.action.renamed':  'Renamed',
    'alert.breakdown':       '{added} added, {modified} modified, {deleted} deleted',
    'alert.suggestion':      'Check recent changes and consider creating a manual snapshot',
    'alert.viewFiles':       'View file details ({n} files)',
    'modal.alertFiles':      'Alert File Details',
    'modal.col.restore':     'Restore',
    'modal.copyRestore':     'Copy cmd',
    'modal.copied':          'Copied!',

    'backups.gitCommits':       'Git Commits',
    'backups.shadowSnapshots':  'Shadow Snapshots',
    'backups.preRestore':       'Pre-Restore Snapshots',
    'backups.diskUsage':        'Disk Usage',
    'backups.gitDisk':          'Git',
    'backups.shadowDisk':       'Shadow',
    'backups.restorePoints':    'Restore Points',
    'backups.filterAll':        'All',
    'backups.noBackups':        'No restore points found',
    'backups.col.time':         'Time',
    'backups.col.type':         'Type',
    'backups.col.ref':          'Ref / Hash',

    'type.git-auto-backup':     'Git Auto-Backup',
    'type.git-pre-restore':     'Git Pre-Restore',
    'type.git-snapshot':        'Git Snapshot',
    'type.shadow':              'Shadow Snapshot',
    'type.shadow-pre-restore':  'Shadow Pre-Restore',

    'protection.protect':   'Protected Patterns',
    'protection.ignore':    'Ignored Patterns',
    'protection.fileCount': '{n} files in protection scope',
    'protection.note':      'These patterns define which files are protected. This is not the full directory listing.',
    'protection.allFiles':  'All files (no protect patterns configured)',
    'protection.noIgnore':  'None',

    'diagnostics.pass':     'Pass',
    'diagnostics.warn':     'Warn',
    'diagnostics.fail':     'Fail',
    'diagnostics.hint':     'Click for details →',
    'diagnostics.PASS':     'PASS',
    'diagnostics.WARN':     'WARN',
    'diagnostics.FAIL':     'FAIL',

    'drawer.restorePoint':  'Restore Point Details',
    'drawer.doctorTitle':   'Diagnostic Details',
    'drawer.close':         'Close',
    'drawer.preview':       'Preview JSON',
    'drawer.copyRef':       'Copy Ref',
    'drawer.copyJson':      'Copy JSON',
    'drawer.copied':        'Copied!',
    'drawer.field.time':    'Time',
    'drawer.field.type':    'Type',
    'drawer.field.ref':     'Ref',
    'drawer.field.hash':    'Commit Hash',
    'drawer.field.path':    'Path',
    'drawer.field.message': 'Message',
    'drawer.field.filesChanged': 'Files Changed',
    'drawer.field.summary': 'Change Summary',
    'drawer.field.trigger': 'Trigger',
    'trigger.auto':         'Auto (scheduled)',
    'trigger.manual':       'Manual (agent)',
    'trigger.pre-restore':  'Pre-Restore',
    'backups.col.summary':  'Changes',
    'backups.search':       'Search files…',
    'summary.modified':     'Modified',
    'summary.added':        'Added',
    'summary.deleted':      'Deleted',
    'summary.renamed':      'Renamed',
    'summary.files':        'files',
    'summary.andMore':      'and {n} more…',
    'drawer.field.intent':  'Intent',
    'drawer.field.agent':   'Agent',
    'drawer.field.session': 'Session',
    'drawer.field.from':    'From (current)',
    'drawer.field.restoreTo':'Restore to',
    'drawer.field.restoreFile':'Restored file',
    'drawer.restoreCmd':    'Copy Restore Command',
    'drawer.restoreCmdFile':'Copy File Restore Command',

    'watcher.lastScan':    'Last scan',

    'error.fetchFailed':    'Failed to fetch data',
    'error.sectionFailed':  'This section failed to load',
    'empty.noData':         'No data available',

    'strategy.git':    'Git',
    'strategy.shadow': 'Shadow',
    'strategy.both':   'Both',

    'time.justNow':    'just now',
    'time.secondsAgo': '{n}s ago',
    'time.minutesAgo': '{n}m ago',
    'time.hoursAgo':   '{n}h ago',
    'time.daysAgo':    '{n}d ago',

    'issue.watcher_not_running':        'Auto-backup watcher is not running',
    'issue.watcher_stale':              'Watcher has a stale lock file (process not running)',
    'issue.strategy_no_git':            'Strategy requires Git but directory is not a git repo',
    'issue.no_auto_backup_ref':         'No auto-backup ref found — watcher may not have run yet',
    'issue.disk_critically_low':        'Disk space critically low ({gb} GB free)',
    'issue.disk_low':                   'Disk space low ({gb} GB free)',
    'issue.git_backup_stale':           'Last git backup is stale ({rel})',
    'issue.active_alert':               'Active alert: {type} — {count} files in {window}s',
    'issue.alert_high_velocity':        'High volume of file changes detected. Consider reviewing recent modifications and creating a manual snapshot.',

    'check.Git installed':              'Git installed',
    'check.Git repository':             'Git repository',
    'check.Config file':                'Config file',
    'check.Strategy compatibility':     'Strategy compatibility',
    'check.Backup ref':                 'Backup ref',
    'check.Guard refs':                 'Guard refs',
    'check.Shadow copies':              'Shadow copies',
    'check.Backup dir ignored':         'Backup dir ignored',
    'check.Config: backup_strategy':    'Config: backup_strategy',
    'check.Config: pre_restore_backup': 'Config: pre_restore_backup',
    'check.Config: interval':           'Config: interval',
    'check.Config: retention.mode':     'Config: retention.mode',
    'check.Config: git_retention.mode': 'Config: git_retention.mode',
    'check.Protect patterns':           'Protect patterns',
    'check.Disk space':                 'Disk space',
    'check.Lock file':                  'Lock file',
    'check.Node.js':                    'Node.js',
    'check.MCP server':                 'MCP server',
    'check.MCP version':                'MCP version',

    'detail.git_version':               'version {v}',
    'detail.git_not_found':             'git not found in PATH; only shadow strategy available',
    'detail.worktree':                  'worktree detected (git-dir: {dir})',
    'detail.standard_repo':             'standard repo',
    'detail.not_git_repo':              'not a Git repo; git/both strategies won\'t work',
    'detail.config_valid':              '.cursor-guard.json found and valid JSON',
    'detail.config_parse_error':        'JSON parse error: {err}',
    'detail.config_missing':            'no .cursor-guard.json found; using defaults (protect everything)',
    'detail.strategy_no_git':           'backup_strategy=\'{s}\' but directory is not a Git repo',
    'detail.strategy_ok':               'backup_strategy=\'{s}\' and Git repo exists',
    'detail.strategy_shadow':           'backup_strategy=\'shadow\' — no Git required',
    'detail.strategy_unknown':          'unknown backup_strategy=\'{s}\' (must be git/shadow/both)',
    'detail.ref_exists':                'refs/guard/auto-backup exists ({n} commits)',
    'detail.ref_legacy':                'legacy refs/heads/cursor-guard/auto-backup found ({n} commits) — run auto-backup once to migrate',
    'detail.ref_not_created':           'refs/guard/auto-backup not created yet (will be created on first backup)',
    'detail.guard_refs_found':          '{n} ref(s) found ({pre} pre-restore snapshots)',
    'detail.guard_refs_none':           'no guard refs yet (created on first snapshot or restore)',
    'detail.shadow_stats':              '{n} snapshot(s), {mb} MB total',
    'detail.shadow_not_found':          '.cursor-guard-backup/ not found (will be created on first shadow backup)',
    'detail.gitignore_ok':              '.cursor-guard-backup/ is git-ignored',
    'detail.gitignore_missing':         '.cursor-guard-backup/ may NOT be git-ignored — backup changes could trigger commits',
    'detail.invalid_value':             'invalid value \'{v}\'',
    'detail.pre_restore_never':         'set to \'never\' — restores won\'t auto-preserve current version',
    'detail.interval_low':              '{n}s is below minimum (5s), will be clamped',
    'detail.protect_count':             '{matched} / {total} files matched by protect patterns',
    'detail.disk_critical':             '{gb} GB free — critically low',
    'detail.disk_free':                 '{gb} GB free',
    'detail.disk_unknown':              'could not determine free space',
    'detail.lock_running':              'watcher running (pid={pid}, since {since})',
    'detail.lock_stale':                'stale lock file (pid={pid} is dead) — safe to delete or run doctor_fix',
    'detail.lock_exists':               'lock file exists — another instance may be running. {info}',
    'detail.lock_none':                 'no lock file (no running instance)',
    'detail.node_ok':                   '{v}',
    'detail.node_old':                  '{v} — recommended >=18',
    'detail.mcp_ok':                    'server.js found, SDK {v}',
    'detail.mcp_no_sdk':                'server.js found but @modelcontextprotocol/sdk not installed — run: cd <skill-dir>; npm install',
    'detail.mcp_no_server':             'SDK installed ({v}) but server.js not found at expected path',
    'detail.mcp_not_configured':        'MCP not configured (optional — cursor-guard works without it)',
    'detail.mcp_version_mismatch':      'running v{mem} but disk has v{disk} — restart Cursor to load the new version',
    'detail.mcp_version_ok':            'v{v}',
  },

  'zh-CN': {
    'app.title':        'Cursor Guard 仪表盘',
    'topbar.refresh':   '刷新',
    'topbar.lastRefresh':'上次刷新',
    'state.loading':    '加载中…',
    'state.retry':      '重试',

    'overview.title':   '总览',
    'backups.title':    '备份与恢复',
    'protection.title': '保护范围',
    'diagnostics.title':'诊断',

    'health.title':     '健康状态',
    'health.healthy':   '健康',
    'health.warning':   '警告',
    'health.critical':  '严重',
    'health.unknown':   '未知',

    'gitBackup.title':  '最近 Git 备份',
    'gitBackup.none':   '暂无 Git 备份',
    'shadowBackup.title':'最近影子快照',
    'shadowBackup.none':'暂无影子快照',

    'watcher.title':    '守护进程',
    'watcher.running':  '运行中',
    'watcher.stopped':  '已停止',
    'watcher.stale':    '已过期',
    'watcher.pid':      'PID',
    'watcher.since':    '启动时间',

    'alert.title':      '告警',
    'alert.none':       '无活跃告警',
    'alert.active':     '活跃告警',
    'alert.triggered':  '触发时间',
    'alert.expires':    '剩余有效',
    'alert.detail':     '{count} 个文件在 {window} 秒内变更（阈值：{threshold}）',
    'alert.expired':    '已过期',
    'alert.history':    '近期告警历史',
    'alert.noHistory':  '暂无告警记录',
    'alert.historyCount':'历史（{n} 条）',
    'alert.showFiles':  '展开文件详情',
    'alert.hideFiles':  '收起文件详情',
    'alert.col.file':   '文件',
    'alert.col.action': '操作',
    'alert.col.changes':'变化量',
    'alert.action.modified': '修改',
    'alert.action.added':    '新增',
    'alert.action.deleted':  '删除',
    'alert.action.renamed':  '重命名',
    'alert.breakdown':       '新增 {added} · 修改 {modified} · 删除 {deleted}',
    'alert.suggestion':      '建议检查近期变更，并考虑手动创建快照',
    'alert.viewFiles':       '查看文件详情（{n} 个文件）',
    'modal.alertFiles':      '告警文件详情',
    'modal.col.restore':     '恢复',
    'modal.copyRestore':     '复制命令',
    'modal.copied':          '已复制！',

    'backups.gitCommits':       'Git 提交数',
    'backups.shadowSnapshots':  '影子快照',
    'backups.preRestore':       '恢复前快照',
    'backups.diskUsage':        '磁盘占用',
    'backups.gitDisk':          'Git',
    'backups.shadowDisk':       'Shadow',
    'backups.restorePoints':    '恢复点',
    'backups.filterAll':        '全部',
    'backups.noBackups':        '暂无恢复点',
    'backups.col.time':         '时间',
    'backups.col.type':         '类型',
    'backups.col.ref':          '引用 / Hash',

    'type.git-auto-backup':     'Git 自动备份',
    'type.git-pre-restore':     'Git 恢复前快照',
    'type.git-snapshot':        'Git 快照',
    'type.shadow':              '影子快照',
    'type.shadow-pre-restore':  '影子恢复前快照',

    'protection.protect':   '保护规则',
    'protection.ignore':    '忽略规则',
    'protection.fileCount': '{n} 个文件在保护范围内',
    'protection.note':      '以下是当前会进入保护范围的文件规则，不等于当前目录全部文件。',
    'protection.allFiles':  '全部文件（未配置 protect 规则）',
    'protection.noIgnore':  '无',

    'diagnostics.pass':     '通过',
    'diagnostics.warn':     '警告',
    'diagnostics.fail':     '失败',
    'diagnostics.hint':     '点击查看详情 →',
    'diagnostics.PASS':     '通过',
    'diagnostics.WARN':     '警告',
    'diagnostics.FAIL':     '失败',

    'drawer.restorePoint':  '恢复点详情',
    'drawer.doctorTitle':   '诊断详情',
    'drawer.close':         '关闭',
    'drawer.preview':       '预览 JSON',
    'drawer.copyRef':       '复制引用',
    'drawer.copyJson':      '复制 JSON',
    'drawer.copied':        '已复制！',
    'drawer.field.time':    '时间',
    'drawer.field.type':    '类型',
    'drawer.field.ref':     '引用',
    'drawer.field.hash':    '提交 Hash',
    'drawer.field.path':    '路径',
    'drawer.field.message': '消息',
    'drawer.field.filesChanged': '变更文件数',
    'drawer.field.summary': '变更摘要',
    'drawer.field.trigger': '触发方式',
    'trigger.auto':         '自动（定时）',
    'trigger.manual':       '手动（Agent）',
    'trigger.pre-restore':  '恢复前快照',
    'backups.col.summary':  '变更',
    'backups.search':       '搜索文件…',
    'summary.modified':     '修改',
    'summary.added':        '新增',
    'summary.deleted':      '删除',
    'summary.renamed':      '重命名',
    'summary.files':        '个文件',
    'summary.andMore':      '等 {n} 个文件…',
    'drawer.field.intent':  '操作意图',
    'drawer.field.agent':   'AI 模型',
    'drawer.field.session': '会话 ID',
    'drawer.field.from':    '恢复前版本',
    'drawer.field.restoreTo':'恢复目标',
    'drawer.field.restoreFile':'恢复文件',
    'drawer.restoreCmd':    '复制恢复命令',
    'drawer.restoreCmdFile':'复制文件恢复命令',

    'watcher.lastScan':    '最后扫描',

    'error.fetchFailed':    '数据拉取失败',
    'error.sectionFailed':  '此区块加载失败',
    'empty.noData':         '暂无数据',

    'strategy.git':    'Git',
    'strategy.shadow': '影子',
    'strategy.both':   '双重',

    'time.justNow':    '刚刚',
    'time.secondsAgo': '{n} 秒前',
    'time.minutesAgo': '{n} 分钟前',
    'time.hoursAgo':   '{n} 小时前',
    'time.daysAgo':    '{n} 天前',

    'issue.watcher_not_running':        '自动备份守护进程未运行',
    'issue.watcher_stale':              '守护进程锁文件已过期（进程未运行）',
    'issue.strategy_no_git':            '策略需要 Git 但目录不是 Git 仓库',
    'issue.no_auto_backup_ref':         '未找到自动备份引用——守护进程可能尚未运行',
    'issue.disk_critically_low':        '磁盘空间严重不足（{gb} GB 可用）',
    'issue.disk_low':                   '磁盘空间不足（{gb} GB 可用）',
    'issue.git_backup_stale':           '最近 Git 备份已过时（{rel}）',
    'issue.active_alert':               '活跃告警：{type}——{count} 个文件在 {window} 秒内变更',
    'issue.alert_high_velocity':        '检测到大量文件变更，建议检查最近修改并手动创建快照。',

    'check.Git installed':              'Git 安装状态',
    'check.Git repository':             'Git 仓库',
    'check.Config file':                '配置文件',
    'check.Strategy compatibility':     '策略兼容性',
    'check.Backup ref':                 '备份引用',
    'check.Guard refs':                 'Guard 引用',
    'check.Shadow copies':              '影子拷贝',
    'check.Backup dir ignored':         '备份目录忽略',
    'check.Config: backup_strategy':    '配置：备份策略',
    'check.Config: pre_restore_backup': '配置：恢复前备份',
    'check.Config: interval':           '配置：备份间隔',
    'check.Config: retention.mode':     '配置：留存模式',
    'check.Config: git_retention.mode': '配置：Git 留存模式',
    'check.Protect patterns':           '保护规则匹配',
    'check.Disk space':                 '磁盘空间',
    'check.Lock file':                  '锁文件',
    'check.Node.js':                    'Node.js',
    'check.MCP server':                 'MCP 服务器',
    'check.MCP version':                'MCP 版本',

    'detail.git_version':               '版本 {v}',
    'detail.git_not_found':             'PATH 中未找到 git；仅可使用 shadow 策略',
    'detail.worktree':                  '检测到工作树（git-dir：{dir}）',
    'detail.standard_repo':             '标准仓库',
    'detail.not_git_repo':              '非 Git 仓库；git/both 策略不可用',
    'detail.config_valid':              '.cursor-guard.json 已找到且 JSON 格式有效',
    'detail.config_parse_error':        'JSON 解析错误：{err}',
    'detail.config_missing':            '未找到 .cursor-guard.json；使用默认设置（保护全部文件）',
    'detail.strategy_no_git':           'backup_strategy=\'{s}\' 但目录不是 Git 仓库',
    'detail.strategy_ok':               'backup_strategy=\'{s}\' 且 Git 仓库存在',
    'detail.strategy_shadow':           'backup_strategy=\'shadow\'——不需要 Git',
    'detail.strategy_unknown':          '未知 backup_strategy=\'{s}\'（须为 git/shadow/both）',
    'detail.ref_exists':                'refs/guard/auto-backup 存在（{n} 个提交）',
    'detail.ref_legacy':                '发现旧版 refs/heads/cursor-guard/auto-backup（{n} 个提交）——运行一次自动备份即可迁移',
    'detail.ref_not_created':           'refs/guard/auto-backup 尚未创建（首次备份时自动创建）',
    'detail.guard_refs_found':          '{n} 个引用（{pre} 个恢复前快照）',
    'detail.guard_refs_none':           '尚无 guard 引用（首次快照或恢复时创建）',
    'detail.shadow_stats':              '{n} 个快照，共 {mb} MB',
    'detail.shadow_not_found':          '.cursor-guard-backup/ 未找到（首次影子备份时自动创建）',
    'detail.gitignore_ok':              '.cursor-guard-backup/ 已被 git 忽略',
    'detail.gitignore_missing':         '.cursor-guard-backup/ 可能未被 git 忽略——备份变更可能触发提交',
    'detail.invalid_value':             '无效值 \'{v}\'',
    'detail.pre_restore_never':         '设为 \'never\'——恢复时不会自动保留当前版本',
    'detail.interval_low':              '{n} 秒低于最小值（5 秒），将被限制',
    'detail.protect_count':             '{matched} / {total} 个文件匹配保护规则',
    'detail.disk_critical':             '{gb} GB 可用——严重不足',
    'detail.disk_free':                 '{gb} GB 可用',
    'detail.disk_unknown':              '无法检测可用空间',
    'detail.lock_running':              '守护进程运行中（pid={pid}，启动于 {since}）',
    'detail.lock_stale':                '残留锁文件（pid={pid} 已终止）——可安全删除或运行 doctor_fix',
    'detail.lock_exists':               '锁文件存在——可能有其他实例正在运行。{info}',
    'detail.lock_none':                 '无锁文件（无运行中的实例）',
    'detail.node_ok':                   '{v}',
    'detail.node_old':                  '{v}——建议 >=18',
    'detail.mcp_ok':                    'server.js 已找到，SDK {v}',
    'detail.mcp_no_sdk':                'server.js 已找到但 @modelcontextprotocol/sdk 未安装——请运行：cd <skill-dir>; npm install',
    'detail.mcp_no_server':             'SDK 已安装（{v}）但 server.js 未在预期路径找到',
    'detail.mcp_not_configured':        'MCP 未配置（可选——cursor-guard 无需 MCP 也能工作）',
    'detail.mcp_version_mismatch':      '运行中 v{mem}，磁盘为 v{disk}——请重启 Cursor 加载新版本',
    'detail.mcp_version_ok':            'v{v}',
  },
};

/* ── State ────────────────────────────────────────────────── */

const state = {
  locale: 'en-US',
  projects: [],
  currentProjectId: null,
  pageData: null,
  filteredBackups: [],
  backupFilter: 'all',
  fileSearch: '',
  refreshTimer: null,
  tickTimer: null,
  lastRefreshAt: null,
  drawerOpen: null,
  alertHistory: [],
};

const REFRESH_MS = 15000;

/* ── DOM helpers ──────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── I18n helpers ─────────────────────────────────────────── */

function t(key, params) {
  const dict = I18N[state.locale] || I18N['en-US'];
  let text = dict[key] || I18N['en-US'][key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

function detectLocale() {
  const saved = localStorage.getItem('cg-locale');
  if (saved && I18N[saved]) return saved;
  const nav = navigator.language || '';
  return nav.startsWith('zh') ? 'zh-CN' : 'en-US';
}

function setLocale(loc) {
  state.locale = loc;
  localStorage.setItem('cg-locale', loc);
  document.documentElement.lang = loc === 'zh-CN' ? 'zh-CN' : 'en';
  document.title = t('app.title');
  const refreshBtn = $('#refresh-btn');
  if (refreshBtn) refreshBtn.title = t('topbar.refresh');
  updateStaticI18n();
  if (state.pageData) renderAll();
  updateRefreshDisplay();
}

function updateStaticI18n() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}

/* ── Backend string translation ────────────────────────────── */

const ISSUE_PATTERNS = [
  { re: /^Auto-backup watcher is not running$/,                     key: 'issue.watcher_not_running' },
  { re: /^Watcher has a stale lock file/,                           key: 'issue.watcher_stale' },
  { re: /^Strategy requires Git but directory is not a git repo$/,  key: 'issue.strategy_no_git' },
  { re: /^No auto-backup ref found/,                                key: 'issue.no_auto_backup_ref' },
  { re: /^Disk space critically low \((.+?) GB free\)$/,            key: 'issue.disk_critically_low', extract: ['gb'] },
  { re: /^Disk space low \((.+?) GB free\)$/,                       key: 'issue.disk_low', extract: ['gb'] },
  { re: /^Last git backup is stale \((.+?)\)$/,                     key: 'issue.git_backup_stale', extract: ['rel'] },
  { re: /^Active alert: (.+?) — (\d+) files in (\d+)s$/,           key: 'issue.active_alert', extract: ['type', 'count', 'window'] },
  { re: /^High volume of file changes/,                             key: 'issue.alert_high_velocity' },
];

function translateIssue(text) {
  for (const p of ISSUE_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const params = {};
      if (p.extract) p.extract.forEach((k, i) => { params[k] = m[i + 1]; });
      return t(p.key, params);
    }
  }
  return text;
}

function translateCheckName(name) {
  const key = 'check.' + name;
  const translated = t(key);
  return translated !== key ? translated : name;
}

const DETAIL_PATTERNS = [
  { re: /^version (.+)$/,                                              key: 'detail.git_version', extract: ['v'] },
  { re: /^git not found in PATH/,                                      key: 'detail.git_not_found' },
  { re: /^worktree detected \(git-dir: (.+)\)$/,                       key: 'detail.worktree', extract: ['dir'] },
  { re: /^standard repo$/,                                             key: 'detail.standard_repo' },
  { re: /^not a Git repo/,                                             key: 'detail.not_git_repo' },
  { re: /^\.cursor-guard\.json found and valid JSON$/,                 key: 'detail.config_valid' },
  { re: /^JSON parse error: (.+)$/,                                    key: 'detail.config_parse_error', extract: ['err'] },
  { re: /^no \.cursor-guard\.json found/,                              key: 'detail.config_missing' },
  { re: /^backup_strategy='(.+?)' but directory is not a Git repo$/,   key: 'detail.strategy_no_git', extract: ['s'] },
  { re: /^backup_strategy='(.+?)' and Git repo exists$/,               key: 'detail.strategy_ok', extract: ['s'] },
  { re: /^backup_strategy='shadow'/,                                   key: 'detail.strategy_shadow' },
  { re: /^unknown backup_strategy='(.+?)'/,                            key: 'detail.strategy_unknown', extract: ['s'] },
  { re: /^refs\/guard\/auto-backup exists \((.+?) commits?\)$/,        key: 'detail.ref_exists', extract: ['n'] },
  { re: /^legacy refs\/heads\/cursor-guard\/auto-backup found \((.+?) commits?\)/,key: 'detail.ref_legacy', extract: ['n'] },
  { re: /^refs\/guard\/auto-backup not created yet/,                   key: 'detail.ref_not_created' },
  { re: /^(\d+) ref\(s\) found \((\d+) pre-restore snapshots?\)$/,    key: 'detail.guard_refs_found', extract: ['n', 'pre'] },
  { re: /^no guard refs yet/,                                          key: 'detail.guard_refs_none' },
  { re: /^(\d+) snapshot\(s\), (.+?) MB total$/,                       key: 'detail.shadow_stats', extract: ['n', 'mb'] },
  { re: /^\.cursor-guard-backup\/ not found/,                          key: 'detail.shadow_not_found' },
  { re: /^\.cursor-guard-backup\/ is git-ignored$/,                    key: 'detail.gitignore_ok' },
  { re: /^\.cursor-guard-backup\/ may NOT be git-ignored/,             key: 'detail.gitignore_missing' },
  { re: /^invalid value '(.+)'$/,                                      key: 'detail.invalid_value', extract: ['v'] },
  { re: /^set to 'never'/,                                             key: 'detail.pre_restore_never' },
  { re: /^(\d+)s is below minimum/,                                    key: 'detail.interval_low', extract: ['n'] },
  { re: /^(\d+) \/ (\d+) files matched by protect patterns$/,         key: 'detail.protect_count', extract: ['matched', 'total'] },
  { re: /^(.+?) GB free — critically low$/,                            key: 'detail.disk_critical', extract: ['gb'] },
  { re: /^could not determine free space$/,                            key: 'detail.disk_unknown' },
  { re: /^(.+?) GB free$/,                                             key: 'detail.disk_free', extract: ['gb'] },
  { re: /^watcher running \(pid=(\d+), since (.+)\)$/,                  key: 'detail.lock_running', extract: ['pid', 'since'] },
  { re: /^stale lock file \(pid=(\d+) is dead\)/,                      key: 'detail.lock_stale', extract: ['pid'] },
  { re: /^lock file exists — another instance may be running\. ?(.*)$/,key: 'detail.lock_exists', extract: ['info'] },
  { re: /^no lock file/,                                               key: 'detail.lock_none' },
  { re: /^(v\d+\.\d+\.\d+\S*) — recommended >=18$/,                   key: 'detail.node_old', extract: ['v'] },
  { re: /^server\.js found, SDK (.+)$/,                                key: 'detail.mcp_ok', extract: ['v'] },
  { re: /^server\.js found but @modelcontextprotocol/,                 key: 'detail.mcp_no_sdk' },
  { re: /^SDK installed \((.+?)\) but server\.js/,                     key: 'detail.mcp_no_server', extract: ['v'] },
  { re: /^MCP not configured/,                                         key: 'detail.mcp_not_configured' },
  { re: /^running v(.+?) but disk has v(.+?) —/,                       key: 'detail.mcp_version_mismatch', extract: ['mem', 'disk'] },
  { re: /^v(\d+\.\d+\.\d+\S*)$/,                                      key: 'detail.mcp_version_ok', extract: ['v'] },
];

function translateDetail(text) {
  if (!text) return text;
  for (const p of DETAIL_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const params = {};
      if (p.extract) p.extract.forEach((k, i) => { params[k] = m[i + 1]; });
      return t(p.key, params);
    }
  }
  return text;
}

/* ── Time helpers ─────────────────────────────────────────── */

function parseShadowTs(ts) {
  if (!ts) return null;
  const m = String(ts).match(/^(?:pre-restore-)?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
}

function toDate(ts) {
  if (!ts) return null;
  let d = new Date(ts);
  if (!isNaN(d.getTime())) return d;
  d = parseShadowTs(ts);
  return d && !isNaN(d.getTime()) ? d : null;
}

function formatTime(ts) {
  const d = toDate(ts);
  if (!d) return ts || '-';
  return new Intl.DateTimeFormat(state.locale, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d);
}

function relativeTime(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const ms = Date.now() - d.getTime();
  if (ms < 0) return t('time.justNow');
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t('time.secondsAgo', { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t('time.minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('time.hoursAgo', { n: hr });
  return t('time.daysAgo', { n: Math.floor(hr / 24) });
}

/* ── Data fetching ────────────────────────────────────────── */

async function fetchJson(url) {
  const sep = url.includes('?') ? '&' : '?';
  const tokenParam = window.__GUARD_TOKEN__ ? `${sep}token=${window.__GUARD_TOKEN__}` : '';
  const r = await fetch(url + tokenParam);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function loadProjects() {
  state.projects = await fetchJson('/api/projects');
  if (state.projects.length > 0 && !state.currentProjectId) {
    state.currentProjectId = state.projects[0].id;
  }
}

async function loadPageData(opts = {}) {
  if (!state.currentProjectId) return;
  const id = state.currentProjectId;

  if (opts.progressive) {
    state.pageData = { dashboard: null, doctor: null, backups: null };
    const dashPromise = fetchJson(`/api/page-data?id=${id}&scope=dashboard`);
    const restPromise = Promise.allSettled([
      fetchJson(`/api/page-data?id=${id}&scope=backups`),
      fetchJson(`/api/page-data?id=${id}&scope=doctor`),
    ]);

    const dash = await dashPromise;
    state.pageData.dashboard = dash.dashboard;
    state.lastRefreshAt = Date.now();
    showContent();
    if (dash.dashboard && !dash.dashboard.error) {
      renderStrategyBadge(dash.dashboard.strategy);
      renderOverview(dash.dashboard);
      renderProtection(dash.dashboard.protectionScope);
    }

    const [backupsResult, doctorResult] = await restPromise;
    if (backupsResult.status === 'fulfilled') {
      state.pageData.backups = backupsResult.value.backups;
      if (state.pageData.dashboard) {
        renderBackupsSection(state.pageData.dashboard, Array.isArray(state.pageData.backups) ? state.pageData.backups : []);
      }
    }
    if (doctorResult.status === 'fulfilled') {
      state.pageData.doctor = doctorResult.value.doctor;
      if (state.pageData.doctor && !state.pageData.doctor.error) {
        renderDiagnostics(state.pageData.doctor);
      }
    }
  } else {
    state.pageData = await fetchJson(`/api/page-data?id=${state.currentProjectId}`);
    state.lastRefreshAt = Date.now();
  }
}

/* ── Refresh ──────────────────────────────────────────────── */

function startRefresh() {
  stopRefresh();
  state.refreshTimer = setInterval(async () => {
    try { await loadPageData(); renderAll(); } catch { /* keep existing */ }
  }, REFRESH_MS);
  state.tickTimer = setInterval(updateRefreshDisplay, 1000);
}

function stopRefresh() {
  if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
}

async function manualRefresh() {
  const icon = $('#refresh-btn .icon-spin');
  if (icon) icon.classList.add('icon-spin-active');
  stopRefresh();
  try { await loadPageData(); renderAll(); }
  catch (e) { showGlobalError(e.message); }
  if (icon) icon.classList.remove('icon-spin-active');
  startRefresh();
}

function updateRefreshDisplay() {
  const el = $('#last-refresh');
  if (!el || !state.lastRefreshAt) return;
  const sec = Math.floor((Date.now() - state.lastRefreshAt) / 1000);
  el.textContent = `${t('topbar.lastRefresh')}: ${sec}s`;
}

/* ── Rendering: Top bar ───────────────────────────────────── */

function renderProjectSelect() {
  const sel = $('#project-select');
  sel.innerHTML = state.projects.map(p =>
    `<option value="${esc(p.id)}" title="${esc(p.pathLabel)}">${esc(p.name)}</option>`
  ).join('');
  if (state.currentProjectId) sel.value = state.currentProjectId;
}

function renderStrategyBadge(strategy) {
  const el = $('#strategy-badge');
  el.textContent = t('strategy.' + (strategy || 'git'));
  el.className = 'badge badge-strategy';
}

/* ── Rendering: Global states ─────────────────────────────── */

function showSkeleton() {
  hide($('#error-state'));
  $$('.screen').forEach(s => show(s));
}

function showGlobalError(msg) {
  show($('#error-state'));
  $$('.screen').forEach(s => hide(s));
  $('#error-message').textContent = msg || t('error.fetchFailed');
}

function showContent() {
  hide($('#error-state'));
  $$('.screen').forEach(s => show(s));
}

/* ── Rendering: Main dispatch ─────────────────────────────── */

function renderAll() {
  if (!state.pageData) return;
  const { dashboard, doctor, backups } = state.pageData;

  showContent();

  if (dashboard && !dashboard.error) {
    renderStrategyBadge(dashboard.strategy);
    renderOverview(dashboard);
    renderBackupsSection(dashboard, Array.isArray(backups) ? backups : []);
    renderProtection(dashboard.protectionScope);
  } else {
    renderSectionError('overview-grid', dashboard?.error);
    renderSectionError('backup-stats', dashboard?.error);
    renderSectionError('protection-content', dashboard?.error);
  }

  if (doctor && !doctor.error) {
    renderDiagnostics(doctor);
  } else {
    renderSectionError('diagnostics-summary', doctor?.error);
  }

  updateStaticI18n();
  updateRefreshDisplay();
}

/* ── Rendering: Overview ──────────────────────────────────── */

function renderOverview(d) {
  renderHealthCard(d.health);
  renderGitBackupCard(d.lastBackup);
  renderShadowBackupCard(d.lastBackup);
  renderWatcherCard(d.watcher);
  renderAlertCard(d.alerts);
}

function renderHealthCard(health) {
  const el = $('#card-health');
  const st = health?.status || 'unknown';
  const issues = health?.issues || [];
  el.className = `card card-health`;
  el.style.borderLeft = `3px solid var(--${st === 'healthy' ? 'green' : st === 'warning' ? 'yellow' : st === 'critical' ? 'red' : 'gray'})`;
  el.innerHTML = `
    <div class="card-status">
      <span class="status-dot status-${st}"></span>
      <span class="status-text status-${st}">${t('health.' + st)}</span>
    </div>
    ${issues.length > 0 ? `<ul class="issue-list">${issues.map(i => `<li class="text-sm">${esc(translateIssue(i))}</li>`).join('')}</ul>` : ''}
  `;
}

function renderGitBackupCard(lastBackup) {
  const el = $('#card-git-backup');
  const g = lastBackup?.git;
  if (!g) {
    el.innerHTML = `<div class="card-label">${t('gitBackup.title')}</div><div class="card-empty">${t('gitBackup.none')}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="card-label">${t('gitBackup.title')}</div>
    <div class="card-value">${esc(relativeTime(g.timestamp))}</div>
    <div class="card-detail text-muted">
      <span class="text-mono">${esc(g.shortHash)}</span> · <span class="text-sm">${esc(formatTime(g.timestamp))}</span>
    </div>
  `;
}

function renderShadowBackupCard(lastBackup) {
  const el = $('#card-shadow-backup');
  const s = lastBackup?.shadow;
  if (!s) {
    el.innerHTML = `<div class="card-label">${t('shadowBackup.title')}</div><div class="card-empty">${t('shadowBackup.none')}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="card-label">${t('shadowBackup.title')}</div>
    <div class="card-value">${esc(relativeTime(s.timestamp))}</div>
    <div class="card-detail text-muted text-sm">${esc(formatTime(s.timestamp))}</div>
  `;
}

function renderWatcherCard(watcher) {
  const el = $('#card-watcher');
  let st = 'stopped';
  if (watcher?.running) st = 'running';
  else if (watcher?.stale) st = 'stale';
  const lastScan = state.lastRefreshAt ? relativeTime(new Date(state.lastRefreshAt).toISOString()) : null;
  el.innerHTML = `
    <div class="card-label">${t('watcher.title')}</div>
    <div class="card-status">
      <span class="status-dot status-${st}"></span>
      <span>${t('watcher.' + st)}</span>
    </div>
    ${watcher?.pid ? `<div class="card-detail text-muted text-sm">${t('watcher.pid')}: ${watcher.pid}</div>` : ''}
    ${watcher?.startedAt ? `<div class="card-detail text-muted text-sm">${t('watcher.since')}: ${esc(formatTime(watcher.startedAt))}</div>` : ''}
    ${watcher?.running && lastScan ? `<div class="card-detail text-muted text-sm">${t('watcher.lastScan')}: ${esc(lastScan)}</div>` : ''}
  `;
}

function alertFileBreakdown(files) {
  if (!Array.isArray(files) || files.length === 0) return '';
  let added = 0, modified = 0, deleted = 0;
  for (const f of files) {
    if (f.action === 'added') added++;
    else if (f.action === 'deleted') deleted++;
    else modified++;
  }
  return t('alert.breakdown', { added, modified, deleted });
}

function renderAlertCard(alerts) {
  const el = $('#card-alert');
  if (!alerts?.active) {
    let historyHtml = '';
    if (state.alertHistory.length > 0) {
      const count = state.alertHistory.length;
      const rows = state.alertHistory.slice(-5).reverse().map(h => {
        const breakdown = alertFileBreakdown(h.files);
        return `<div class="alert-history-row text-sm text-muted">
          <span class="alert-history-time">${esc(formatTime(h.timestamp))}</span>
          <span>${t('alert.detail', { count: h.fileCount, window: h.windowSeconds, threshold: h.threshold })}</span>
          ${breakdown ? `<span class="alert-history-breakdown">${esc(breakdown)}</span>` : ''}
          <span class="badge badge-expired">${t('alert.expired')}</span>
        </div>`;
      }).join('');
      historyHtml = `
        <div class="alert-history-toggle-wrap">
          <button class="alert-history-toggle-btn text-sm text-muted" data-alert-history-toggle>${t('alert.historyCount', { n: count })}</button>
        </div>
        <div class="alert-history alert-history-collapsed">
          <div class="alert-history-label text-sm">${t('alert.history')}</div>${rows}
        </div>`;
    }
    el.innerHTML = `
      <div class="card-label">${t('alert.title')}</div>
      <div class="card-status"><span class="status-dot status-healthy"></span><span>${t('alert.none')}</span></div>
      ${historyHtml}
    `;
    return;
  }
  const a = alerts.latest || {};

  // Track in history
  if (a.timestamp && !state.alertHistory.some(h => h.timestamp === a.timestamp)) {
    state.alertHistory.push({ timestamp: a.timestamp, fileCount: a.fileCount, windowSeconds: a.windowSeconds, threshold: a.threshold, expiresAt: a.expiresAt, files: a.files });
    if (state.alertHistory.length > 20) state.alertHistory = state.alertHistory.slice(-20);
  }

  const triggeredAt = a.timestamp ? formatTime(a.timestamp) : '-';
  const expiresAt = a.expiresAt ? new Date(a.expiresAt) : null;
  const remainMs = expiresAt ? expiresAt.getTime() - Date.now() : 0;
  const remainSec = Math.max(0, Math.ceil(remainMs / 1000));
  const remainMin = Math.floor(remainSec / 60);
  const remainDisplay = remainMin > 0 ? `${remainMin}m ${remainSec % 60}s` : `${remainSec}s`;
  const detailText = t('alert.detail', { count: a.fileCount || '?', window: a.windowSeconds || '?', threshold: a.threshold || '?' });

  const files = Array.isArray(a.files) ? a.files : [];
  let filesHtml = '';
  if (files.length > 0) {
    filesHtml = `
      <div class="alert-files-section">
        <button class="alert-files-toggle" data-alert-files-modal>${t('alert.viewFiles', { n: files.length })}</button>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="card-label">${t('alert.title')}</div>
    <div class="card-status"><span class="status-dot status-warning"></span><span class="status-text status-warning">${t('alert.active')}</span></div>
    <div class="alert-details">
      <div class="alert-detail-row"><span class="alert-detail-label">${t('alert.triggered')}</span><span>${esc(triggeredAt)}</span></div>
      <div class="alert-detail-row"><span class="alert-detail-label">${t('alert.expires')}</span><span class="alert-countdown">${esc(remainDisplay)}</span></div>
      <div class="alert-detail-row alert-numbers">${esc(detailText)}</div>
      ${alertFileBreakdown(files) ? `<div class="alert-detail-row alert-breakdown text-sm">${esc(alertFileBreakdown(files))}</div>` : ''}
      <div class="alert-detail-row alert-suggestion text-sm text-muted">${t('alert.suggestion')}</div>
    </div>
    ${filesHtml}
  `;
}

/* ── Rendering: Backups Section ───────────────────────────── */

function renderBackupsSection(dashboard, backups) {
  renderBackupStats(dashboard, backups);
  renderFilterBar(backups);
  renderFileSearch();
  renderBackupTable(backups);
}

function renderFileSearch() {
  const el = $('#file-search-wrap');
  if (!el) return;
  el.innerHTML = `<input id="file-search" type="text" class="file-search-input" placeholder="${t('backups.search')}" value="${esc(state.fileSearch)}" />`;
}

function renderBackupStats(d, backups) {
  const gitCount = d.counts?.git?.commits || 0;
  const shadowCount = d.counts?.shadow?.snapshots || 0;
  const preRestoreCount = Array.isArray(backups)
    ? backups.filter(b => b.type === 'git-pre-restore' || b.type === 'shadow-pre-restore').length
    : 0;
  const gitDisk = d.diskUsage?.git?.display || '0B';
  const shadowDisk = d.diskUsage?.shadow?.display || '0B';

  $('#backup-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">${t('backups.gitCommits')}</div><div class="stat-value">${gitCount}</div></div>
    <div class="stat-card"><div class="stat-label">${t('backups.shadowSnapshots')}</div><div class="stat-value">${shadowCount}</div></div>
    <div class="stat-card"><div class="stat-label">${t('backups.preRestore')}</div><div class="stat-value">${preRestoreCount}</div></div>
    <div class="stat-card"><div class="stat-label">${t('backups.gitDisk')}</div><div class="stat-value">${esc(gitDisk)}</div></div>
    <div class="stat-card"><div class="stat-label">${t('backups.shadowDisk')}</div><div class="stat-value">${esc(shadowDisk)}</div></div>
  `;
}

function renderFilterBar(backups) {
  const allBackups = Array.isArray(backups) ? backups : (Array.isArray(state.pageData?.backups) ? state.pageData.backups : []);
  const typeCounts = {};
  for (const b of allBackups) { typeCounts[b.type] = (typeCounts[b.type] || 0) + 1; }

  const types = [
    { key: 'all',                label: 'backups.filterAll' },
    { key: 'git-auto-backup',   label: 'type.git-auto-backup' },
    { key: 'git-pre-restore',   label: 'type.git-pre-restore' },
    { key: 'git-snapshot',      label: 'type.git-snapshot' },
    { key: 'shadow',            label: 'type.shadow' },
    { key: 'shadow-pre-restore',label: 'type.shadow-pre-restore' },
  ];
  const total = allBackups.length;
  $('#backup-filters').innerHTML = types.map(t2 => {
    const count = t2.key === 'all' ? total : (typeCounts[t2.key] || 0);
    if (t2.key !== 'all' && count === 0) return '';
    return `<button class="filter-btn ${state.backupFilter === t2.key ? 'active' : ''}" data-filter="${t2.key}">${t(t2.label)} <span class="filter-count">(${count})</span></button>`;
  }).join('');
}

function translateSummary(raw) {
  if (!raw) return raw;
  return raw
    .replace(/\bModified (\d+)/g, (_, n) => `${t('summary.modified')} ${n}`)
    .replace(/\bAdded (\d+)/g, (_, n) => `${t('summary.added')} ${n}`)
    .replace(/\bDeleted (\d+)/g, (_, n) => `${t('summary.deleted')} ${n}`)
    .replace(/\bRenamed (\d+)/g, (_, n) => `${t('summary.renamed')} ${n}`);
}

/**
 * Parse summary text into structured file array for inline preview.
 * Format: "Modified 3: a.js (+2 -1), b.js (+0 -5), ...; Added 2: c.js (+10 -0), d.js (+3 -0)"
 */
function parseSummaryToFiles(summary) {
  if (!summary) return [];
  const ACTION_MAP = { Modified: 'modified', Added: 'added', Deleted: 'deleted', Renamed: 'renamed' };
  const files = [];
  for (const segment of summary.split('; ')) {
    const headerMatch = segment.match(/^(Modified|Added|Deleted|Renamed)\s+\d+:\s*/);
    if (!headerMatch) continue;
    const action = ACTION_MAP[headerMatch[1]] || 'modified';
    const rest = segment.slice(headerMatch[0].length);
    for (const part of rest.split(/,\s*/)) {
      if (part === '...') continue;
      const fileMatch = part.match(/^(.+?)\s*\(\+(\d+)\s+-(\d+)\)$/);
      if (fileMatch) {
        files.push({ path: fileMatch[1], action, added: parseInt(fileMatch[2], 10), deleted: parseInt(fileMatch[3], 10) });
      } else if (part.trim()) {
        files.push({ path: part.trim(), action, added: 0, deleted: 0 });
      }
    }
  }
  files.sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));
  return files;
}

async function fetchBackupFiles(commitHash) {
  if (!state.currentProjectId || !commitHash) return [];
  try {
    const data = await fetchJson(`/api/backup-files?id=${state.currentProjectId}&hash=${commitHash}`);
    return Array.isArray(data.files) ? data.files : [];
  } catch { return []; }
}

function formatFileActionBadge(action) {
  const cls = action === 'deleted' ? 'alert-action-deleted'
    : action === 'added' ? 'alert-action-added'
    : action === 'renamed' ? 'alert-action-renamed'
    : 'alert-action-modified';
  return `<span class="alert-action-badge ${cls}">${t('alert.action.' + action)}</span>`;
}

function formatSummaryCell(b) {
  let line1 = '';
  if (b.filesChanged != null) {
    line1 = `<div class="summary-meta"><span class="summary-files">${b.filesChanged} ${t('summary.files')}</span></div>`;
  }

  let line2 = '';
  if (b.from && b.restoreTo) {
    const label = b.restoreFile ? `${esc(b.restoreFile)}: ` : '';
    line2 = `<div class="summary-restore-ctx">${label}<span class="text-mono">${esc(b.from)}</span> → <span class="text-mono">${esc(b.restoreTo)}</span></div>`;
  } else if (b.intent) {
    const intentShort = b.intent.length > 70 ? b.intent.substring(0, 67) + '...' : b.intent;
    line2 = `<div class="summary-intent"><span class="summary-intent-label">${t('drawer.field.intent')}:</span> ${esc(intentShort)}</div>`;
  } else if (b.message && !b.message.startsWith('guard:')) {
    const msgShort = b.message.length > 70 ? b.message.substring(0, 67) + '...' : b.message;
    line2 = `<div class="summary-message">${esc(msgShort)}</div>`;
  }
  if (b.trigger && !line2) {
    line2 = `<div class="summary-trigger text-sm text-muted">${t('trigger.' + b.trigger)}</div>`;
  }

  let line3 = '';
  if (b.summary) {
    const parsed = parseSummaryToFiles(b.summary);
    if (parsed.length > 0) {
      const MAX_INLINE = 3;
      const visible = parsed.slice(0, MAX_INLINE).map(f =>
        `<div class="summary-file-row"><span class="text-mono summary-file-path">${esc(f.path)}</span>${formatFileActionBadge(f.action)}<span class="text-mono text-muted">+${f.added} -${f.deleted}</span></div>`
      ).join('');
      const remaining = parsed.length > MAX_INLINE ? parsed.length - MAX_INLINE : 0;
      const truncated = b.summary.includes('...');
      const moreCount = truncated ? (b.filesChanged || '?') - MAX_INLINE : remaining;
      const moreHtml = (remaining > 0 || truncated) ? `<div class="summary-file-more text-sm text-muted">${t('summary.andMore', { n: moreCount > 0 ? moreCount : '…' })}</div>` : '';
      line3 = visible + moreHtml;
    } else {
      const categories = b.summary.split('; ').map(s => translateSummary(s));
      line3 = categories.slice(0, 2).map(c => `<div class="summary-detail-line">${esc(c)}</div>`).join('');
    }
  }

  if (!line1 && !line2 && !line3) return '<span class="text-muted text-sm">-</span>';
  return `<div class="summary-stack">${line1}${line2}${line3}</div>`;
}

function renderBackupTable(backups) {
  if (!Array.isArray(backups)) {
    $('#backup-table-wrap').innerHTML = `<div class="error-panel">${t('error.sectionFailed')}</div>`;
    return;
  }
  let filtered = state.backupFilter === 'all'
    ? backups
    : backups.filter(b => b.type === state.backupFilter);

  if (state.fileSearch) {
    const q = state.fileSearch.toLowerCase();
    filtered = filtered.filter(b =>
      (b.summary && b.summary.toLowerCase().includes(q)) ||
      (b.message && b.message.toLowerCase().includes(q)) ||
      (b.intent && b.intent.toLowerCase().includes(q)) ||
      (b.restoreFile && b.restoreFile.toLowerCase().includes(q))
    );
  }
  state.filteredBackups = filtered;

  if (state.filteredBackups.length === 0) {
    $('#backup-table-wrap').innerHTML = `<div class="empty-state">${t('backups.noBackups')}</div>`;
    return;
  }

  const rows = state.filteredBackups.map((b, i) => {
    const badgeClass = b.type.startsWith('git') ? (b.type.includes('pre') ? 'badge-pre' : 'badge-git') : (b.type.includes('pre') ? 'badge-pre' : 'badge-shadow');
    const summaryCell = formatSummaryCell(b);
    return `<tr data-bi="${i}">
      <td><div>${esc(formatTime(b.timestamp))}</div><div class="text-muted text-sm">${esc(relativeTime(b.timestamp))}</div></td>
      <td><span class="badge ${badgeClass}">${t('type.' + b.type)}</span></td>
      <td class="text-mono">${esc(b.shortHash || b.timestamp || '-')}</td>
      <td class="backup-summary-cell">${summaryCell}</td>
    </tr>`;
  }).join('');

  $('#backup-table-wrap').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>${t('backups.col.time')}</th>
        <th>${t('backups.col.type')}</th>
        <th>${t('backups.col.ref')}</th>
        <th>${t('backups.col.summary')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ── Rendering: Protection Scope ──────────────────────────── */

function renderProtection(scope) {
  const el = $('#protection-content');
  if (!scope) { el.innerHTML = `<div class="empty-state">${t('empty.noData')}</div>`; return; }

  const protectList = scope.protect || [];
  const ignoreList = scope.ignore || [];
  const isAll = protectList.length === 1 && protectList[0] === '**';

  el.innerHTML = `
    <div class="protection-grid">
      <div class="pattern-card">
        <h4>${t('protection.protect')}</h4>
        ${isAll
          ? `<p class="text-muted text-sm">${t('protection.allFiles')}</p>`
          : `<ul class="pattern-list">${protectList.map(p => `<li class="pattern-item">${esc(p)}</li>`).join('')}</ul>`
        }
      </div>
      <div class="pattern-card">
        <h4>${t('protection.ignore')}</h4>
        ${ignoreList.length === 0
          ? `<p class="text-muted text-sm">${t('protection.noIgnore')}</p>`
          : `<ul class="pattern-list">${ignoreList.map(p => `<li class="pattern-item">${esc(p)}</li>`).join('')}</ul>`
        }
      </div>
    </div>
    <div class="protection-count">${t('protection.fileCount', { n: scope.fileCount || 0 })}</div>
    <p class="protection-note">${t('protection.note')}</p>
  `;
}

/* ── Rendering: Diagnostics ───────────────────────────────── */

function renderDiagnostics(doctor) {
  const el = $('#diagnostics-summary');
  const s = doctor.summary || { pass: 0, warn: 0, fail: 0 };

  el.innerHTML = `
    <div class="diag-summary" id="diag-summary-click">
      <div class="diag-counts">
        <div class="diag-count"><span class="num" style="color:var(--green)">${s.pass}</span><span class="label badge-pass">${t('diagnostics.pass')}</span></div>
        <div class="diag-count"><span class="num" style="color:var(--yellow)">${s.warn}</span><span class="label badge-warn">${t('diagnostics.warn')}</span></div>
        <div class="diag-count"><span class="num" style="color:var(--red)">${s.fail}</span><span class="label badge-fail">${t('diagnostics.fail')}</span></div>
      </div>
      <span class="diag-hint">${t('diagnostics.hint')}</span>
    </div>
  `;
}

/* ── Rendering: Error / Empty ─────────────────────────────── */

function renderSectionError(elementId, msg) {
  const el = $(`#${elementId}`);
  if (!el) return;
  el.innerHTML = `<div class="error-panel"><div class="error-icon">⚠</div><p>${esc(msg || t('error.sectionFailed'))}</p></div>`;
}

/* ── File Detail Modal ────────────────────────────────────── */

function openFileModal(title, files, projectPath, commitHash) {
  $('#file-modal-title').textContent = title;
  const body = $('#file-modal-body');
  let sortKey = 'changes';
  const render = () => {
    const sorted = [...files];
    if (sortKey === 'path') sorted.sort((a, b) => a.path.localeCompare(b.path));
    else if (sortKey === 'action') sorted.sort((a, b) => a.action.localeCompare(b.action));
    else sorted.sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));

    const rows = sorted.map(f => {
      const restoreCmd = commitHash
        ? `restore_file({ path: "${projectPath || ''}", file: "${f.path}", source: "${commitHash}" })`
        : '';
      return `<tr>
        <td class="text-mono modal-file-path" title="${esc(f.path)}">${esc(f.path)}</td>
        <td>${formatFileActionBadge(f.action)}</td>
        <td class="text-mono modal-file-changes">+${f.added || 0} -${f.deleted || 0}</td>
        ${commitHash ? `<td><button class="modal-restore-btn" data-restore-cmd="${esc(restoreCmd)}">${t('modal.copyRestore')}</button></td>` : ''}
      </tr>`;
    }).join('');

    body.innerHTML = `<table>
      <thead><tr>
        <th data-msort="path">${t('alert.col.file')} ↕</th>
        <th data-msort="action">${t('alert.col.action')} ↕</th>
        <th data-msort="changes">${t('alert.col.changes')} ↕</th>
        ${commitHash ? `<th>${t('modal.col.restore')}</th>` : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };
  render();

  body.addEventListener('click', (e) => {
    const th = e.target.closest('[data-msort]');
    if (th) {
      sortKey = th.dataset.msort;
      render();
      return;
    }
    const btn = e.target.closest('[data-restore-cmd]');
    if (btn) {
      copyText(btn.dataset.restoreCmd);
      btn.textContent = t('modal.copied');
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = t('modal.copyRestore'); btn.classList.remove('copied'); }, 1500);
    }
  });

  $('#file-modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeFileModal() {
  $('#file-modal-overlay').classList.remove('active');
  document.body.style.overflow = state.drawerOpen ? 'hidden' : '';
}

/* ── Drawers ──────────────────────────────────────────────── */

function openDrawer(name) {
  state.drawerOpen = name;
  $(`#${name}-drawer`).classList.add('active');
  $('#drawer-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  if (!state.drawerOpen) return;
  $(`#${state.drawerOpen}-drawer`).classList.remove('active');
  $('#drawer-overlay').classList.remove('active');
  document.body.style.overflow = '';
  state.drawerOpen = null;
}

function renderDrawerFilesTable(files, sortKey, commitHash, projectPath) {
  const sorted = [...files];
  if (sortKey === 'path') sorted.sort((a, b) => a.path.localeCompare(b.path));
  else if (sortKey === 'action') sorted.sort((a, b) => a.action.localeCompare(b.action));
  else sorted.sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));
  const hasRestore = !!commitHash;
  const rows = sorted.map(f => {
    const cmd = hasRestore ? `restore_file({ path: "${projectPath || ''}", file: "${f.path}", source: "${commitHash}" })` : '';
    return `<tr>
      <td class="text-mono drawer-file-path">${esc(f.path)}</td>
      <td>${formatFileActionBadge(f.action)}</td>
      <td class="text-mono drawer-file-changes">+${f.added} -${f.deleted}</td>
      ${hasRestore ? `<td><button class="modal-restore-btn" data-restore-cmd="${esc(cmd)}">${t('modal.copyRestore')}</button></td>` : ''}
    </tr>`;
  }).join('');
  return `<table class="drawer-files-table">
    <thead><tr>
      <th data-sort="path" class="drawer-sort-header">${t('alert.col.file')} ↕</th>
      <th data-sort="action" class="drawer-sort-header">${t('alert.col.action')} ↕</th>
      <th data-sort="changes" class="drawer-sort-header">${t('alert.col.changes')} ↕</th>
      ${hasRestore ? `<th>${t('modal.col.restore')}</th>` : ''}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function openRestoreDrawer(backup) {
  const body = $('#restore-drawer-body');
  const fields = [
    { key: 'drawer.field.time', val: formatTime(backup.timestamp) },
    { key: 'drawer.field.type', val: t('type.' + backup.type) },
  ];
  if (backup.trigger) fields.push({ key: 'drawer.field.trigger', val: t('trigger.' + backup.trigger) });
  if (backup.filesChanged != null) fields.push({ key: 'drawer.field.filesChanged', val: String(backup.filesChanged) });
  if (backup.ref) fields.push({ key: 'drawer.field.ref', val: backup.ref });
  if (backup.commitHash) fields.push({ key: 'drawer.field.hash', val: backup.commitHash });
  if (backup.path) fields.push({ key: 'drawer.field.path', val: backup.path });
  if (backup.intent) fields.push({ key: 'drawer.field.intent', val: backup.intent });
  if (backup.agent) fields.push({ key: 'drawer.field.agent', val: backup.agent });
  if (backup.session) fields.push({ key: 'drawer.field.session', val: backup.session });
  if (backup.from) fields.push({ key: 'drawer.field.from', val: backup.from });
  if (backup.restoreTo) fields.push({ key: 'drawer.field.restoreTo', val: backup.restoreTo });
  if (backup.restoreFile) fields.push({ key: 'drawer.field.restoreFile', val: backup.restoreFile });
  if (backup.message) fields.push({ key: 'drawer.field.message', val: backup.message });

  const refText = backup.ref || backup.shortHash || backup.timestamp || '';
  const jsonText = JSON.stringify(backup, null, 2);

  const isGit = backup.type?.startsWith('git');
  const hash = backup.commitHash || backup.shortHash || '';
  const restoreProjectCmd = isGit && hash ? `restore_project({ version: "${hash}", mode: "execute" })` : '';
  const restoreFileCmd = isGit && hash ? `restore_file({ file: "<filename>", version: "${hash}" })` : '';

  body.innerHTML = `
    ${fields.map(f => `
      <div class="restore-field">
        <div class="restore-field-label">${t(f.key)}</div>
        <div class="restore-field-value text-mono">${esc(f.val)}</div>
      </div>
    `).join('')}
    ${backup.summary ? `
    <div class="restore-field">
      <div class="restore-field-label">${t('drawer.field.summary')}</div>
      <div id="drawer-files-container" class="drawer-files-container">
        <div class="drawer-files-loading text-muted text-sm">${t('state.loading')}</div>
      </div>
    </div>
    ` : ''}
    <div class="restore-actions">
      <button class="btn btn-sm" data-copy="${esc(refText)}">${t('drawer.copyRef')}</button>
      <button class="btn btn-sm" data-copy-json>${t('drawer.copyJson')}</button>
      <button class="btn btn-sm" id="preview-toggle">${t('drawer.preview')}</button>
    </div>
    ${restoreProjectCmd ? `
    <div class="restore-cmd-section">
      <div class="restore-cmd-label text-sm text-muted">MCP Restore Commands</div>
      <div class="restore-cmd-row">
        <code class="restore-cmd-code">${esc(restoreProjectCmd)}</code>
        <button class="btn btn-sm btn-restore-cmd" data-copy-restore-project>${t('drawer.restoreCmd')}</button>
      </div>
      <div class="restore-cmd-row">
        <code class="restore-cmd-code">${esc(restoreFileCmd)}</code>
        <button class="btn btn-sm btn-restore-cmd" data-copy-restore-file>${t('drawer.restoreCmdFile')}</button>
      </div>
    </div>
    ` : ''}
    <div id="json-preview-wrap" class="hidden">
      <pre class="json-preview">${esc(jsonText)}</pre>
    </div>
  `;

  body.querySelector('[data-copy-json]')?.addEventListener('click', () => copyText(jsonText));
  if (restoreProjectCmd) {
    body.querySelector('[data-copy-restore-project]')?.addEventListener('click', () => copyText(restoreProjectCmd));
    body.querySelector('[data-copy-restore-file]')?.addEventListener('click', () => copyText(restoreFileCmd));
  }
  body.querySelector('#preview-toggle')?.addEventListener('click', () => {
    const wrap = body.querySelector('#json-preview-wrap');
    wrap.classList.toggle('hidden');
  });

  const projPath = backup.path || state.pageData?.status?.config?.path || '';

  // Lazy-load full file list for summary section
  if (backup.summary && isGit && hash) {
    let currentFiles = [];
    let currentSort = 'changes';
    const setupContainer = (container) => {
      container.innerHTML = renderDrawerFilesTable(currentFiles, currentSort, hash, projPath);
      container.addEventListener('click', (e) => {
        const th = e.target.closest('[data-sort]');
        if (th) {
          currentSort = th.dataset.sort;
          container.innerHTML = renderDrawerFilesTable(currentFiles, currentSort, hash, projPath);
          return;
        }
        const restoreBtn = e.target.closest('[data-restore-cmd]');
        if (restoreBtn) {
          copyText(restoreBtn.dataset.restoreCmd);
          restoreBtn.textContent = t('modal.copied');
          restoreBtn.classList.add('copied');
          setTimeout(() => { restoreBtn.textContent = t('modal.copyRestore'); restoreBtn.classList.remove('copied'); }, 1500);
        }
      });
    };
    fetchBackupFiles(hash).then(files => {
      currentFiles = files.length > 0 ? files : parseSummaryToFiles(backup.summary);
      const container = body.querySelector('#drawer-files-container');
      if (container) setupContainer(container);
    });
  } else if (backup.summary) {
    const fallback = parseSummaryToFiles(backup.summary);
    const container = body.querySelector('#drawer-files-container');
    if (container && fallback.length > 0) {
      container.innerHTML = renderDrawerFilesTable(fallback, 'changes', hash, projPath);
    } else if (container) {
      const translated = backup.summary.split('; ').map(s => translateSummary(s)).join('\n');
      container.innerHTML = `<pre class="restore-field-value text-mono summary-pre">${esc(translated)}</pre>`;
    }
  }

  openDrawer('restore');
}

function openDoctorDrawer() {
  const doctor = state.pageData?.doctor;
  if (!doctor || doctor.error) return;
  const body = $('#doctor-drawer-body');

  body.innerHTML = (doctor.checks || []).map(c => {
    const badgeClass = c.status === 'PASS' ? 'badge-pass' : c.status === 'WARN' ? 'badge-warn' : 'badge-fail';
    const shouldOpen = c.status !== 'PASS';
    return `
      <details class="check-item" ${shouldOpen ? 'open' : ''}>
        <summary>
          <span class="badge ${badgeClass}">${t('diagnostics.' + c.status)}</span>
          <span class="check-name">${esc(translateCheckName(c.name))}</span>
        </summary>
        ${c.detail ? `<div class="check-detail">${esc(translateDetail(c.detail))}</div>` : ''}
      </details>
    `;
  }).join('');

  openDrawer('doctor');
}

/* ── Copy to clipboard ────────────────────────────────────── */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast(t('drawer.copied'));
}

function showToast(msg) {
  let toast = $('#copy-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copy-toast';
    toast.className = 'copy-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
}

/* ── Event Listeners ──────────────────────────────────────── */

function setupEvents() {
  $('#project-select').addEventListener('change', async (e) => {
    state.currentProjectId = e.target.value;
    state.backupFilter = 'all';
    stopRefresh();
    showSkeleton();
    try { await loadPageData(); renderAll(); }
    catch (err) { showGlobalError(err.message); }
    startRefresh();
  });

  $('#refresh-btn').addEventListener('click', manualRefresh);
  $('#error-retry').addEventListener('click', manualRefresh);

  $('#lang-toggle').addEventListener('click', () => {
    setLocale(state.locale === 'zh-CN' ? 'en-US' : 'zh-CN');
  });

  // Filter buttons (event delegation)
  $('#backup-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    state.backupFilter = btn.dataset.filter;
    const backups = state.pageData?.backups;
    if (Array.isArray(backups)) {
      renderFilterBar(backups);
      renderBackupTable(backups);
    }
  });

  // File search (event delegation on parent)
  document.addEventListener('input', (e) => {
    if (e.target.id === 'file-search') {
      state.fileSearch = e.target.value;
      const backups = state.pageData?.backups;
      if (Array.isArray(backups)) renderBackupTable(backups);
    }
  });

  // Summary expand toggle (must come before row click to prevent drawer open)
  $('#backup-table-wrap').addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-summary-toggle]');
    if (toggleBtn) {
      e.stopPropagation();
      const cell = toggleBtn.closest('.summary-stack');
      if (cell) cell.classList.toggle('summary-expanded');
      return;
    }
    const row = e.target.closest('tr[data-bi]');
    if (!row) return;
    const idx = parseInt(row.dataset.bi, 10);
    const backup = state.filteredBackups[idx];
    if (backup) openRestoreDrawer(backup);
  });

  // Alert history toggle + file modal (event delegation)
  $('#card-alert').addEventListener('click', (e) => {
    const historyToggle = e.target.closest('[data-alert-history-toggle]');
    if (historyToggle) {
      const card = historyToggle.closest('#card-alert');
      const history = card?.querySelector('.alert-history');
      if (history) history.classList.toggle('alert-history-collapsed');
      return;
    }
    const modalBtn = e.target.closest('[data-alert-files-modal]');
    if (modalBtn) {
      const alerts = state.pageData?.dashboard?.alerts;
      const files = alerts?.latest?.files || [];
      if (files.length > 0) {
        const proj = state.pageData?.dashboard?.watcher?.path || '';
        openFileModal(t('modal.alertFiles'), files, proj, '');
      }
      return;
    }
  });

  // Diagnostics summary click
  $('#diagnostics-summary').addEventListener('click', (e) => {
    if (e.target.closest('#diag-summary-click')) openDoctorDrawer();
  });

  // Copy ref buttons (event delegation on drawers)
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) copyText(copyBtn.dataset.copy);
  });

  // Close drawer
  $('#drawer-overlay').addEventListener('click', closeDrawer);
  document.querySelectorAll('[data-action="close-drawer"]').forEach(btn => {
    btn.addEventListener('click', closeDrawer);
  });

  // Close modal
  $('#file-modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#file-modal-overlay')) closeFileModal();
  });
  document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
    btn.addEventListener('click', closeFileModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeFileModal(); closeDrawer(); }
  });
}

/* ── Init ─────────────────────────────────────────────────── */

async function init() {
  state.locale = detectLocale();
  document.documentElement.lang = state.locale === 'zh-CN' ? 'zh-CN' : 'en';
  document.title = t('app.title');
  updateStaticI18n();
  showSkeleton();

  try {
    await loadProjects();
    renderProjectSelect();
    await loadPageData({ progressive: true });
    renderAll();
    startRefresh();
  } catch (e) {
    showGlobalError(e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  init();
});
