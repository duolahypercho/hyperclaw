# Fix Windows Privilege Issue for Electron Builder
# This script helps resolve the "Cannot create symbolic link" error

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Electron Builder Privilege Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Developer Mode is enabled
$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
$devMode = Get-ItemProperty -Path $regPath -Name "AllowDevelopmentWithoutDevLicense" -ErrorAction SilentlyContinue

if ($devMode -and $devMode.AllowDevelopmentWithoutDevLicense -eq 1) {
    Write-Host "[OK] Developer Mode is already enabled!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[X] Developer Mode is NOT enabled" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To enable Developer Mode:" -ForegroundColor Yellow
    Write-Host "1. Press Windows + I to open Settings" -ForegroundColor White
    Write-Host "2. Go to Privacy and Security -> For developers" -ForegroundColor White
    Write-Host "3. Enable Developer Mode" -ForegroundColor White
    Write-Host "4. Restart your terminal and try building again" -ForegroundColor White
    Write-Host ""
    Write-Host "Alternatively, run this PowerShell as Administrator:" -ForegroundColor Yellow
    $cmd = 'Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name "AllowDevelopmentWithoutDevLicense" -Value 1'
    Write-Host "  $cmd" -ForegroundColor Gray
    Write-Host ""
}

# Clear electron-builder cache
Write-Host "Clearing electron-builder cache..." -ForegroundColor Cyan
$cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cachePath) {
    Remove-Item -Recurse -Force $cachePath -ErrorAction SilentlyContinue
    Write-Host "[OK] Cache cleared!" -ForegroundColor Green
} else {
    Write-Host "[OK] Cache already clear" -ForegroundColor Green
}
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Write-Host "[OK] Running as Administrator" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[INFO] Not running as Administrator" -ForegroundColor Yellow
    Write-Host "  (This is fine if Developer Mode is enabled)" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If Developer Mode is enabled, you can now run:" -ForegroundColor White
Write-Host "  npm run electron:build:win" -ForegroundColor Green
Write-Host ""
Write-Host "Or use the portable build (no installer):" -ForegroundColor White
Write-Host "  npm run electron:build:win:portable" -ForegroundColor Green
Write-Host ""
