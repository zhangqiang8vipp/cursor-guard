<#
.SYNOPSIS
    Cursor Guard Doctor — one-command health check for your guard setup.

.USAGE
    .\guard-doctor.ps1 -Path "D:\MyProject"

.NOTES
    Checks: Git availability, worktree layout, .cursor-guard.json validity,
    backup strategy vs environment compatibility, ignore effectiveness,
    pre-restore refs, shadow copy directory, disk space, and more.
#>

param(
    [Parameter(Mandatory)]
    [string]$Path
)

$ErrorActionPreference = "Continue"
$resolved = (Resolve-Path $Path -ErrorAction Stop).Path
Set-Location $resolved

$pass = 0; $warn = 0; $fail = 0

function Write-Check {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    switch ($Status) {
        "PASS" { $color = "Green";  $script:pass++ }
        "WARN" { $color = "Yellow"; $script:warn++ }
        "FAIL" { $color = "Red";    $script:fail++ }
        default { $color = "Gray" }
    }
    $line = "  [$Status] $Name"
    if ($Detail) { $line += " — $Detail" }
    Write-Host $line -ForegroundColor $color
}

Write-Host ""
Write-Host "=== Cursor Guard Doctor ===" -ForegroundColor Cyan
Write-Host "  Target: $resolved" -ForegroundColor Cyan
Write-Host ""

# ── 1. Git availability ──────────────────────────────────────────
$hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
if ($hasGit) {
    $gitVer = (git --version 2>$null) -replace 'git version ',''
    Write-Check "Git installed" "PASS" "version $gitVer"
} else {
    Write-Check "Git installed" "WARN" "git not found in PATH; only shadow strategy available"
}

# ── 2. Git repo status ───────────────────────────────────────────
$isRepo = $false
$gitDir = $null
if ($hasGit) {
    $isRepo = (git rev-parse --is-inside-work-tree 2>$null) -eq "true"
    if ($isRepo) {
        $gitDir = (Resolve-Path (git rev-parse --git-dir 2>$null) -ErrorAction SilentlyContinue).Path
        $isWorktree = (git rev-parse --is-inside-work-tree 2>$null) -eq "true" -and
                      (git rev-parse --git-common-dir 2>$null) -ne (git rev-parse --git-dir 2>$null)
        if ($isWorktree) {
            Write-Check "Git repository" "PASS" "worktree detected (git-dir: $gitDir)"
        } else {
            Write-Check "Git repository" "PASS" "standard repo"
        }
    } else {
        Write-Check "Git repository" "WARN" "not a Git repo; git/both strategies won't work"
    }
}

# ── 3. .cursor-guard.json ────────────────────────────────────────
$cfgPath = Join-Path $resolved ".cursor-guard.json"
$cfg = $null
if (Test-Path $cfgPath) {
    try {
        $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
        Write-Check "Config file" "PASS" ".cursor-guard.json found and valid JSON"
    } catch {
        Write-Check "Config file" "FAIL" "JSON parse error: $_"
    }
} else {
    Write-Check "Config file" "WARN" "no .cursor-guard.json found; using defaults (protect everything)"
}

# ── 4. Strategy vs environment ────────────────────────────────────
$strategy = "git"
if ($cfg -and $cfg.backup_strategy) { $strategy = $cfg.backup_strategy }
if ($strategy -eq "git" -or $strategy -eq "both") {
    if (-not $isRepo) {
        Write-Check "Strategy compatibility" "FAIL" "backup_strategy='$strategy' but directory is not a Git repo"
    } else {
        Write-Check "Strategy compatibility" "PASS" "backup_strategy='$strategy' and Git repo exists"
    }
} elseif ($strategy -eq "shadow") {
    Write-Check "Strategy compatibility" "PASS" "backup_strategy='shadow' — no Git required"
} else {
    Write-Check "Strategy compatibility" "FAIL" "unknown backup_strategy='$strategy' (must be git/shadow/both)"
}

# ── 5. Backup branch ─────────────────────────────────────────────
if ($isRepo) {
    $branchRef = "refs/heads/cursor-guard/auto-backup"
    $branchExists = git rev-parse --verify $branchRef 2>$null
    if ($branchExists) {
        $commitCount = (git rev-list --count $branchRef 2>$null)
        Write-Check "Backup branch" "PASS" "cursor-guard/auto-backup exists ($commitCount commits)"
    } else {
        Write-Check "Backup branch" "WARN" "cursor-guard/auto-backup not created yet (will be created on first backup)"
    }
}

# ── 6. Guard refs ────────────────────────────────────────────────
if ($isRepo) {
    $guardRefs = git for-each-ref refs/guard/ --format="%(refname)" 2>$null
    if ($guardRefs) {
        $refCount = @($guardRefs).Count
        $preRestoreRefs = @($guardRefs | Where-Object { $_ -match 'pre-restore/' })
        Write-Check "Guard refs" "PASS" "$refCount ref(s) found ($($preRestoreRefs.Count) pre-restore snapshots)"
    } else {
        Write-Check "Guard refs" "WARN" "no guard refs yet (created on first snapshot or restore)"
    }
}

# ── 7. Shadow copy directory ─────────────────────────────────────
$backupDir = Join-Path $resolved ".cursor-guard-backup"
if (Test-Path $backupDir) {
    $snapDirs = Get-ChildItem $backupDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^\d{8}_\d{6}$' -or $_.Name -match '^pre-restore-' }
    $snapCount = if ($snapDirs) { @($snapDirs).Count } else { 0 }
    $totalMB = [math]::Round(((Get-ChildItem $backupDir -Recurse -File -ErrorAction SilentlyContinue |
                Measure-Object Length -Sum).Sum / 1MB), 1)
    Write-Check "Shadow copies" "PASS" "$snapCount snapshot(s), ${totalMB} MB total"
} else {
    Write-Check "Shadow copies" "WARN" ".cursor-guard-backup/ not found (will be created on first shadow backup)"
}

# ── 8. .gitignore / exclude coverage ────────────────────────────
if ($isRepo) {
    $checkIgnored = git check-ignore ".cursor-guard-backup/test" 2>$null
    if ($checkIgnored) {
        Write-Check "Backup dir ignored" "PASS" ".cursor-guard-backup/ is git-ignored"
    } else {
        Write-Check "Backup dir ignored" "WARN" ".cursor-guard-backup/ may NOT be git-ignored — backup changes could trigger commits"
    }
}

# ── 9. Config field validation ────────────────────────────────────
if ($cfg) {
    $validStrategies = @("git", "shadow", "both")
    if ($cfg.backup_strategy -and $cfg.backup_strategy -notin $validStrategies) {
        Write-Check "Config: backup_strategy" "FAIL" "invalid value '$($cfg.backup_strategy)'"
    }

    $validPreRestore = @("always", "ask", "never")
    if ($cfg.pre_restore_backup -and $cfg.pre_restore_backup -notin $validPreRestore) {
        Write-Check "Config: pre_restore_backup" "FAIL" "invalid value '$($cfg.pre_restore_backup)'"
    } elseif ($cfg.pre_restore_backup -eq "never") {
        Write-Check "Config: pre_restore_backup" "WARN" "set to 'never' — restores won't auto-preserve current version"
    }

    if ($cfg.auto_backup_interval_seconds -and $cfg.auto_backup_interval_seconds -lt 5) {
        Write-Check "Config: interval" "WARN" "$($cfg.auto_backup_interval_seconds)s is below minimum (5s), will be clamped"
    }

    if ($cfg.retention -and $cfg.retention.mode) {
        $validModes = @("days", "count", "size")
        if ($cfg.retention.mode -notin $validModes) {
            Write-Check "Config: retention.mode" "FAIL" "invalid value '$($cfg.retention.mode)'"
        }
    }
}

# ── 10. Protect / Ignore effectiveness ───────────────────────────
if ($cfg -and $cfg.protect) {
    $allFiles = Get-ChildItem $resolved -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch '[\\/](\.git|\.cursor-guard-backup|node_modules)[\\/]' }
    $protectedCount = 0
    foreach ($f in $allFiles) {
        $rel = $f.FullName.Substring($resolved.Length + 1) -replace '\\','/'
        foreach ($pat in @($cfg.protect)) {
            $p = $pat -replace '\\','/'
            if ($rel -like $p -or (Split-Path $rel -Leaf) -like $p) { $protectedCount++; break }
        }
    }
    $totalCount = if ($allFiles) { @($allFiles).Count } else { 0 }
    Write-Check "Protect patterns" "PASS" "$protectedCount / $totalCount files matched by protect patterns"
}

# ── 11. Disk space ────────────────────────────────────────────────
try {
    $letter = (Split-Path $resolved -Qualifier) -replace ':$',''
    $drv = Get-PSDrive $letter -ErrorAction Stop
    $freeGB = [math]::Round($drv.Free / 1GB, 1)
    if ($freeGB -lt 1) {
        Write-Check "Disk space" "FAIL" "${freeGB} GB free — critically low"
    } elseif ($freeGB -lt 5) {
        Write-Check "Disk space" "WARN" "${freeGB} GB free"
    } else {
        Write-Check "Disk space" "PASS" "${freeGB} GB free"
    }
} catch {
    Write-Check "Disk space" "WARN" "could not determine free space"
}

# ── 12. Lock file ────────────────────────────────────────────────
$lockFile = if ($gitDir) { Join-Path $gitDir "cursor-guard.lock" } else { Join-Path $backupDir "cursor-guard.lock" }
if (Test-Path $lockFile) {
    $lockContent = Get-Content $lockFile -Raw -ErrorAction SilentlyContinue
    Write-Check "Lock file" "WARN" "lock file exists — another instance may be running. Content: $lockContent"
} else {
    Write-Check "Lock file" "PASS" "no lock file (no running instance)"
}

# ── Summary ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "  PASS: $pass  |  WARN: $warn  |  FAIL: $fail" -ForegroundColor $(if ($fail -gt 0) { "Red" } elseif ($warn -gt 0) { "Yellow" } else { "Green" })
Write-Host ""
if ($fail -gt 0) {
    Write-Host "  Fix FAIL items before relying on Cursor Guard." -ForegroundColor Red
} elseif ($warn -gt 0) {
    Write-Host "  Review WARN items to ensure everything works as expected." -ForegroundColor Yellow
} else {
    Write-Host "  All checks passed. Cursor Guard is ready." -ForegroundColor Green
}
Write-Host ""
