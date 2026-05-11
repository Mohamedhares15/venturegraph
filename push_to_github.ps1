# =============================================================
#  VentureGraph — Push to GitHub (one command)
#  Run: .\push_to_github.ps1
#  Creates a GitHub repo and pushes everything automatically
# =============================================================

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VentureGraph — Push to GitHub" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check git installed
try {
    git --version | Out-Null
} catch {
    Write-Host "  ERROR: Git is not installed." -ForegroundColor Red
    Write-Host "  Download from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Init git if needed
if (-not (Test-Path "$ROOT\.git")) {
    Write-Host "[1/4] Initialising git repository..." -ForegroundColor Yellow
    git init
    Write-Host "  ✓ Git initialised" -ForegroundColor Green
} else {
    Write-Host "[1/4] Git already initialised" -ForegroundColor Green
}

# Create .gitignore if missing
if (-not (Test-Path "$ROOT\.gitignore")) {
    @"
.env
.env.local
venturegraph-web/.env.local
venturegraph-web/node_modules/
venturegraph-web/.next/
__pycache__/
*.pyc
.DS_Store
"@ | Set-Content "$ROOT\.gitignore" -Encoding UTF8
    Write-Host "  ✓ .gitignore created" -ForegroundColor Green
}

# Stage and commit
Write-Host "[2/4] Staging all files..." -ForegroundColor Yellow
git add -A
git commit -m "feat: VentureGraph 2.0 — live engine + sovereign dashboard" 2>&1 | Out-Null
Write-Host "  ✓ Changes committed" -ForegroundColor Green

# GitHub repo creation
Write-Host ""
Write-Host "[3/4] Create GitHub repository" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Opening GitHub new-repo page in your browser..." -ForegroundColor White
Start-Process "https://github.com/new"
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "  ┌─ IN YOUR BROWSER ──────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  1. Repository name:  venturegraph                     │" -ForegroundColor White
Write-Host "  │  2. Set to: Public  (required for free GitHub Actions)  │" -ForegroundColor White
Write-Host "  │  3. DO NOT add README/gitignore/licence                 │" -ForegroundColor White
Write-Host "  │  4. Click 'Create repository'                           │" -ForegroundColor White
Write-Host "  │  5. Copy the repo URL (https://github.com/YOU/NAME.git) │" -ForegroundColor White
Write-Host "  └────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

$repoUrl = Read-Host "  Paste the GitHub repo URL (https://github.com/your-name/venturegraph.git)"
if (-not $repoUrl) { Write-Host "Skipped GitHub push." -ForegroundColor Yellow; exit 0 }

# Add secrets reminder
Write-Host ""
Write-Host "[4/4] Pushing to GitHub..." -ForegroundColor Yellow
git branch -M main
git remote remove origin 2>&1 | Out-Null
git remote add origin $repoUrl
git push -u origin main

Write-Host ""
Write-Host "  ✓ Pushed to GitHub!" -ForegroundColor Green
Write-Host ""
Write-Host "  Now add 2 repository secrets for GitHub Actions:" -ForegroundColor Cyan
$repoSettingsUrl = $repoUrl -replace "\.git$", "/settings/secrets/actions/new"
Start-Process $repoSettingsUrl
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "  ┌─ IN YOUR BROWSER ──────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  Add these 2 secrets (one at a time):                   │" -ForegroundColor White
Write-Host "  │                                                          │" -ForegroundColor White

# Read env to display the values
if (Test-Path "$ROOT\.env") {
    $envContent = Get-Content "$ROOT\.env" -Raw
    $urlLine     = ($envContent -split "`n" | Where-Object { $_ -match "SUPABASE_URL=" } | Select-Object -First 1).Trim()
    $keyLine     = ($envContent -split "`n" | Where-Object { $_ -match "SUPABASE_SERVICE_KEY=" } | Select-Object -First 1).Trim()
    Write-Host "  │  Name: SUPABASE_URL                                  │" -ForegroundColor White
    Write-Host "  │  Value: (from your .env file)                        │" -ForegroundColor White
    Write-Host "  │                                                          │" -ForegroundColor White
    Write-Host "  │  Name: SUPABASE_SERVICE_KEY                          │" -ForegroundColor White
    Write-Host "  │  Value: (from your .env file)                        │" -ForegroundColor White
}

Write-Host "  └────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Write-Host "  After adding secrets, GitHub Actions will run automatically:" -ForegroundColor White
Write-Host "  • Every 15 minutes: ingest live funding events" -ForegroundColor White
Write-Host "  • Every 6 hours:    compute signals" -ForegroundColor White
Write-Host "  • Daily:            update market benchmarks" -ForegroundColor White
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  GITHUB SETUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
