<#
.SYNOPSIS
    Thin wrapper — launches the Node.js auto-backup implementation.
.USAGE
    .\auto-backup.ps1 -Path "D:\MyProject"
    .\auto-backup.ps1 -Path "D:\MyProject" -IntervalSeconds 30
.NOTES
    Requires Node.js >= 18. Run in a SEPARATE terminal, not inside Cursor.
#>
param(
    [Parameter(Mandatory)]
    [string]$Path,
    [int]$IntervalSeconds = 0
)

$nodeCmd = if (Get-Command node -ErrorAction SilentlyContinue) { "node" } else { $null }
if (-not $nodeCmd) {
    Write-Host "[guard] ERROR: Node.js not found. Install Node.js >= 18 first." -ForegroundColor Red
    Write-Host "  https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

$script = Join-Path (Join-Path $PSScriptRoot "bin") "cursor-guard-backup.js"
$args_ = @($script, "--path", $Path)
if ($IntervalSeconds -gt 0) { $args_ += @("--interval", $IntervalSeconds) }

& $nodeCmd @args_
