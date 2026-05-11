# =============================================================
#  VentureGraph — Start Everything
#  Run from PowerShell: .\start.ps1
#  Starts the web server + runs a fresh live engine pass
# =============================================================

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VentureGraph Sovereign · Starting..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Run live engine in background
Write-Host "[1/2] Running live engine (fetching latest data)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$ROOT'; python live/run_all.py --loop all; Write-Host 'Live engine complete.' -ForegroundColor Green" `
    -WindowStyle Normal

Start-Sleep -Seconds 2

# Start web server
Write-Host "[2/2] Starting web server on http://localhost:3001..." -ForegroundColor Yellow
Set-Location "$ROOT\venturegraph-web"
Start-Sleep -Seconds 1

# Open browser
Start-Sleep -Seconds 3
Start-Process "http://localhost:3001/pulse"

Write-Host ""
Write-Host "  Dashboard: http://localhost:3001/pulse" -ForegroundColor Green
Write-Host "  Track Record: http://localhost:3001/pulse/track-record" -ForegroundColor Green
Write-Host "  Verify: http://localhost:3001/verify" -ForegroundColor Green
Write-Host ""
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor White
Write-Host ""

npx next dev --port 3001 --turbopack
