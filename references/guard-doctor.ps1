<#
.SYNOPSIS
    Thin wrapper — launches the Node.js guard-doctor implementation.
.USAGE
    .\guard-doctor.ps1 -Path "D:\MyProject"
.NOTES
    Requires Node.js >= 18.
#>
param(
    [Parameter(Mandatory)]
    [string]$Path
)

$nodeCmd = if (Get-Command node -ErrorAction SilentlyContinue) { "node" } else { $null }
if (-not $nodeCmd) {
    Write-Host "[guard] ERROR: Node.js not found. Install Node.js >= 18 first." -ForegroundColor Red
    Write-Host "  https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

$script = Join-Path $PSScriptRoot "bin" "cursor-guard-doctor.js"
& $nodeCmd $script --path $Path
