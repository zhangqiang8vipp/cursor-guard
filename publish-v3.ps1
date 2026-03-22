# publish-v3.ps1
# 运行方式：powershell -ExecutionPolicy Bypass -File publish-v3.ps1
# 每个版本 npm publish 会弹浏览器 OTP 认证，请逐一完成

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

$versions = @("3.0.0", "3.1.0", "3.2.0", "3.3.0", "3.4.0")

$already = (npm view cursor-guard versions --json 2>$null | ConvertFrom-Json)
Write-Host "npm 已发布版本: $($already -join ', ')" -ForegroundColor Gray

git checkout e818889 --detach 2>&1 | Out-Null

foreach ($v in $versions) {
    if ($already -contains $v) {
        Write-Host "`n=== $v already published, skipping ===" -ForegroundColor Yellow
        continue
    }

    Write-Host "`n=== Publishing cursor-guard@$v ===" -ForegroundColor Cyan
    npm version $v --no-git-tag-version 2>&1 | Out-Null
    npm publish --tag legacy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "cursor-guard@$v publish failed." -ForegroundColor Red
        Write-Host "Please complete OTP in browser and re-run this script (already published versions will be skipped)." -ForegroundColor Yellow
        git checkout -- package.json package-lock.json 2>&1 | Out-Null
        git checkout master 2>&1 | Out-Null
        exit 1
    }
    Write-Host "cursor-guard@$v published!" -ForegroundColor Green
}

git checkout -- package.json package-lock.json 2>&1 | Out-Null
git checkout master 2>&1 | Out-Null
Write-Host "`nAll v3.x versions published to npm!" -ForegroundColor Green
Write-Host "Verify: npm view cursor-guard versions --json" -ForegroundColor Gray
