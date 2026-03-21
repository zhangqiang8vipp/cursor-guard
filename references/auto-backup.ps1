<#
.SYNOPSIS
    Auto-backup script for Cursor Guard.
    Periodically snapshots protected files to a local Git branch using
    plumbing commands — never switches branches or disturbs the main index.
    Reads .cursor-guard.json for scope, secrets, and retention settings.

.USAGE
    # Run in a separate PowerShell window while working in Cursor:
    .\auto-backup.ps1 -Path "D:\MyProject"

    # Custom interval (default 60 seconds):
    .\auto-backup.ps1 -Path "D:\MyProject" -IntervalSeconds 30

    # Stop: Ctrl+C or close the PowerShell window.

.NOTES
    - Snapshots go to branch `cursor-guard/auto-backup` via plumbing commands.
    - Never switches branches, never touches the main index.
    - Does NOT push to any remote.
    - Sensitive files matching secrets_patterns are auto-excluded.
    - Shadow copies are cleaned per retention policy (default: keep 30 days).
    - Log file: .cursor-guard-backup/backup.log
    - IMPORTANT: Run this script in a SEPARATE PowerShell window, NOT inside
      Cursor's integrated terminal. Cursor's terminal injects --trailer flags
      into git commit commands, which corrupts plumbing calls like commit-tree.
#>

param(
    [Parameter(Mandatory)]
    [string]$Path,

    [int]$IntervalSeconds = 0
)

$ErrorActionPreference = "Stop"
$resolved = (Resolve-Path $Path).Path
Set-Location $resolved

# ── Paths (worktree-safe: uses git rev-parse instead of hard-coding .git) ──
$gitDir      = (git rev-parse --git-dir 2>$null)
if (-not $gitDir) {
    $gitDir = Join-Path $resolved ".git"
} else {
    $gitDir = (Resolve-Path $gitDir -ErrorAction SilentlyContinue).Path
    if (-not $gitDir) { $gitDir = Join-Path $resolved ".git" }
}
$lockFile    = Join-Path $gitDir "cursor-guard.lock"
$guardIndex  = Join-Path $gitDir "cursor-guard-index"
$backupDir   = Join-Path $resolved ".cursor-guard-backup"
$logFilePath = Join-Path $backupDir "backup.log"

# ── Cleanup on exit ───────────────────────────────────────────────
function Invoke-Cleanup {
    $env:GIT_INDEX_FILE = $null
    Remove-Item $guardIndex -Force -ErrorAction SilentlyContinue
    Remove-Item $lockFile   -Force -ErrorAction SilentlyContinue
}
trap { Invoke-Cleanup; break }

# ── Defaults ──────────────────────────────────────────────────────
$protectPatterns  = @()
$ignorePatterns   = @()
$secretsPatterns  = @(".env", ".env.*", "*.key", "*.pem", "*.p12", "*.pfx", "credentials*")
$backupStrategy   = "git"
$retentionMode    = "days"
$retentionDays    = 30
$retentionMaxCnt  = 100
$retentionMaxMB   = 500

# ── Load .cursor-guard.json ──────────────────────────────────────
$cfgPath = Join-Path $resolved ".cursor-guard.json"
if (Test-Path $cfgPath) {
    try {
        $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
        if ($cfg.protect)                       { $protectPatterns = @($cfg.protect) }
        if ($cfg.ignore)                        { $ignorePatterns  = @($cfg.ignore) }
        if ($cfg.secrets_patterns)              { $secretsPatterns = @($cfg.secrets_patterns) }
        if ($cfg.backup_strategy)              { $backupStrategy  = $cfg.backup_strategy }
        if ($cfg.auto_backup_interval_seconds -and $IntervalSeconds -eq 0) {
            $IntervalSeconds = $cfg.auto_backup_interval_seconds
        }
        if ($cfg.retention) {
            if ($cfg.retention.mode)        { $retentionMode   = $cfg.retention.mode }
            if ($cfg.retention.days)        { $retentionDays   = $cfg.retention.days }
            if ($cfg.retention.max_count)   { $retentionMaxCnt = $cfg.retention.max_count }
            if ($cfg.retention.max_size_mb) { $retentionMaxMB  = $cfg.retention.max_size_mb }
        }
        Write-Host "[guard] Config loaded  protect=$($protectPatterns.Count)  ignore=$($ignorePatterns.Count)  retention=$retentionMode" -ForegroundColor Cyan
    }
    catch {
        Write-Host "[guard] WARNING: .cursor-guard.json parse error - using defaults." -ForegroundColor Yellow
        Write-Host "  $_" -ForegroundColor Yellow
    }
}
if ($IntervalSeconds -eq 0) { $IntervalSeconds = 60 }

# ── Git repo check ───────────────────────────────────────────────
$isRepo = git rev-parse --is-inside-work-tree 2>$null
if ($isRepo -ne "true") {
    $ans = Read-Host "Directory is not a Git repo. Initialize? (y/n)"
    if ($ans -eq 'y') {
        git init
        $gi = Join-Path $resolved ".gitignore"
        $entry = ".cursor-guard-backup/"
        if (Test-Path $gi) {
            $content = Get-Content $gi -Raw
            if ($content -notmatch [regex]::Escape($entry)) {
                Add-Content $gi "`n$entry"
            }
        } else {
            Set-Content $gi $entry
        }
        git add -A; git commit -m "guard: initial snapshot" --no-verify
        Write-Host "[guard] Repo initialized with snapshot." -ForegroundColor Green
    } else {
        Write-Host "[guard] Git is required. Exiting." -ForegroundColor Red
        exit 1
    }
}

# ── Lock file (prevent multiple instances) ───────────────────────
if (Test-Path $lockFile) {
    Write-Host "[guard] ERROR: Lock file exists ($lockFile)." -ForegroundColor Red
    Write-Host "  If no other instance is running, delete it and retry." -ForegroundColor Red
    exit 1
}
Set-Content $lockFile "pid=$PID`nstarted=$(Get-Date -Format 'o')"

# ── Backup branch ───────────────────────────────────────────────
$branch    = "cursor-guard/auto-backup"
$branchRef = "refs/heads/$branch"
if (-not (git rev-parse --verify $branchRef 2>$null)) {
    git branch $branch HEAD 2>$null
    Write-Host "[guard] Created branch: $branch" -ForegroundColor Green
}

# ── Ensure .cursor-guard-backup/ is git-ignored ─────────────────
$excludeFile = Join-Path $gitDir "info/exclude"
$excludeDir  = Split-Path $excludeFile
if (-not (Test-Path $excludeDir)) { New-Item -ItemType Directory -Force $excludeDir | Out-Null }
$excludeEntry = ".cursor-guard-backup/"
if (Test-Path $excludeFile) {
    $content = Get-Content $excludeFile -Raw -ErrorAction SilentlyContinue
    if (-not $content -or $content -notmatch [regex]::Escape($excludeEntry)) {
        Add-Content $excludeFile "`n$excludeEntry"
    }
} else {
    Set-Content $excludeFile $excludeEntry
}

# ── Log directory & helpers ──────────────────────────────────────
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Force $backupDir | Out-Null }

function Write-Log {
    param([string]$Msg, [ConsoleColor]$Color = "Green")
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Msg"
    Add-Content -Path $logFilePath -Value $line -ErrorAction SilentlyContinue
    Write-Host "[guard] $line" -ForegroundColor $Color
}

# ── Secrets filter ───────────────────────────────────────────────
function Remove-SecretsFromIndex {
    $files = git ls-files --cached 2>$null
    if (-not $files) { return }
    $excluded = @()
    foreach ($f in $files) {
        $leaf = Split-Path $f -Leaf
        foreach ($pat in $secretsPatterns) {
            $re = '^' + [regex]::Escape($pat).Replace('\*','.*').Replace('\?','.') + '$'
            if ($f -match $re -or $leaf -match $re) {
                git rm --cached --ignore-unmatch -q -- $f 2>$null
                $excluded += $f
                break
            }
        }
    }
    if ($excluded.Count -gt 0) {
        Write-Log "Secrets auto-excluded: $($excluded -join ', ')" Yellow
    }
}

# ── Retention cleanup ────────────────────────────────────────────
function Invoke-RetentionCleanup {
    # Clean shadow-copy directories named yyyyMMdd_HHmmss
    $dirs = Get-ChildItem $backupDir -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d{8}_\d{6}$' } |
            Sort-Object Name -Descending
    if ($dirs -and $dirs.Count -gt 0) {
        $removed = 0
        switch ($retentionMode) {
            "days" {
                $cutoff = (Get-Date).AddDays(-$retentionDays)
                foreach ($d in $dirs) {
                    try {
                        $dt = [datetime]::ParseExact($d.Name, "yyyyMMdd_HHmmss", $null)
                        if ($dt -lt $cutoff) { Remove-Item $d.FullName -Recurse -Force; $removed++ }
                    } catch {}
                }
            }
            "count" {
                if ($dirs.Count -gt $retentionMaxCnt) {
                    $dirs | Select-Object -Skip $retentionMaxCnt |
                        ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $removed++ }
                }
            }
            "size" {
                $totalMB = (Get-ChildItem $backupDir -Recurse -File -ErrorAction SilentlyContinue |
                            Measure-Object Length -Sum).Sum / 1MB
                $oldest = $dirs | Sort-Object Name
                foreach ($d in $oldest) {
                    if ($totalMB -le $retentionMaxMB) { break }
                    $sz = (Get-ChildItem $d.FullName -Recurse -File |
                           Measure-Object Length -Sum).Sum / 1MB
                    Remove-Item $d.FullName -Recurse -Force
                    $totalMB -= $sz; $removed++
                }
            }
        }
        if ($removed -gt 0) {
            Write-Log "Retention ($retentionMode): cleaned $removed old snapshot(s)" DarkGray
        }
    }

    # Disk-space warning
    try {
        $letter = (Split-Path $resolved -Qualifier) -replace ':$',''
        $drv    = Get-PSDrive $letter
        $freeGB = [math]::Round($drv.Free / 1GB, 1)
        if     ($freeGB -lt 1) { Write-Log "WARNING: disk critically low - ${freeGB} GB free" Red }
        elseif ($freeGB -lt 5) { Write-Log "Disk note: ${freeGB} GB free" Yellow }
    } catch {}
}

# ── Shadow copy helper ────────────────────────────────────────────
function Invoke-ShadowCopy {
    $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
    $snapDir = Join-Path $backupDir $ts
    New-Item -ItemType Directory -Force $snapDir | Out-Null

    $files = if ($protectPatterns.Count -gt 0) {
        $protectPatterns | ForEach-Object { Get-ChildItem $resolved -Recurse -File -Filter $_ -ErrorAction SilentlyContinue }
    } else {
        Get-ChildItem $resolved -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '[\\/](\.git|\.cursor-guard-backup|node_modules)[\\/]' }
    }

    $copied = 0
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($resolved.Length + 1)
        $skip = $false
        foreach ($ig in $ignorePatterns) {
            $re = '^' + [regex]::Escape($ig).Replace('\*\*','.*').Replace('\*','[^/\\]*').Replace('\?','.') + '$'
            if ($rel -match $re) { $skip = $true; break }
        }
        foreach ($pat in $secretsPatterns) {
            $re = '^' + [regex]::Escape($pat).Replace('\*','.*').Replace('\?','.') + '$'
            if ($rel -match $re -or $f.Name -match $re) { $skip = $true; break }
        }
        if ($skip) { continue }
        $dest = Join-Path $snapDir $rel
        $destDir = Split-Path $dest
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force $destDir | Out-Null }
        Copy-Item $f.FullName $dest -Force
        $copied++
    }
    if ($copied -gt 0) {
        Write-Log "Shadow copy $ts ($copied files)"
    } else {
        Remove-Item $snapDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    return $copied
}

# ── Banner ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[guard] Watching '$resolved' every ${IntervalSeconds}s  (Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host "[guard] Strategy: $backupStrategy  |  Branch: $branch  |  Retention: $retentionMode ($retentionDays days / $retentionMaxCnt count / ${retentionMaxMB} MB)" -ForegroundColor Cyan
Write-Host "[guard] Log: $logFilePath" -ForegroundColor Cyan
Write-Host ""

# ── Main loop ────────────────────────────────────────────────────
$cycle = 0
try {
    while ($true) {
        Start-Sleep -Seconds $IntervalSeconds
        $cycle++

        $dirty = git status --porcelain 2>$null
        if (-not $dirty) { continue }

        # ── Git branch snapshot ──────────────────────────────────
        if ($backupStrategy -eq "git" -or $backupStrategy -eq "both") {
            try {
                $env:GIT_INDEX_FILE = $guardIndex

                $parentHash = git rev-parse --verify $branchRef 2>$null
                if ($parentHash) { git read-tree $branchRef 2>$null }

                if ($protectPatterns.Count -gt 0) {
                    foreach ($p in $protectPatterns) { git add -- $p 2>$null }
                } else {
                    git add -A 2>$null
                }
                foreach ($ig in $ignorePatterns) {
                    git rm --cached --ignore-unmatch -rq -- $ig 2>$null
                }

                Remove-SecretsFromIndex

                $newTree    = git write-tree
                $parentTree = if ($parentHash) { git rev-parse "${branchRef}^{tree}" 2>$null } else { $null }

                if ($newTree -eq $parentTree) {
                    Write-Host "[guard] $(Get-Date -Format 'HH:mm:ss') tree unchanged, skipped." -ForegroundColor DarkGray
                } else {
                    $ts  = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    $msg = "guard: auto-backup $ts"
                    $commitHash = if ($parentHash) {
                        git commit-tree $newTree -p $parentHash -m $msg
                    } else {
                        git commit-tree $newTree -m $msg
                    }

                    if (-not $commitHash) {
                        Write-Log "ERROR: commit-tree failed, snapshot skipped" Red
                    } else {
                        git update-ref $branchRef $commitHash
                        $short = $commitHash.Substring(0, 7)
                        if ($parentTree) {
                            $diff  = git diff-tree --no-commit-id --name-only -r $parentTree $newTree 2>$null
                            $count = if ($diff) { @($diff).Count } else { 0 }
                        } else {
                            $all   = git ls-tree --name-only -r $newTree 2>$null
                            $count = if ($all) { @($all).Count } else { 0 }
                        }
                        Write-Log "Git snapshot $short ($count files)"
                    }
                }
            }
            finally {
                $env:GIT_INDEX_FILE = $null
                Remove-Item $guardIndex -Force -ErrorAction SilentlyContinue
            }
        }

        # ── Shadow copy ──────────────────────────────────────────
        if ($backupStrategy -eq "shadow" -or $backupStrategy -eq "both") {
            Invoke-ShadowCopy | Out-Null
        }

        # Periodic retention cleanup every 10 cycles
        if ($cycle % 10 -eq 0) { Invoke-RetentionCleanup }
    }
}
finally {
    Invoke-Cleanup
    Write-Host "`n[guard] Stopped." -ForegroundColor Cyan
}
