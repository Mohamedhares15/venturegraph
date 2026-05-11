# =============================================================
#  VentureGraph Live Engine — One-Command Setup Wizard
#  Run from PowerShell: .\setup.ps1
#  Does everything automatically. You only need to:
#    1. Sign up at supabase.com (2 minutes, free)
#    2. Paste 3 API keys when asked
# =============================================================

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VentureGraph Live Engine — Setup Wizard" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Python dependencies ──────────────────────────────
Write-Host "[1/6] Installing Python dependencies..." -ForegroundColor Yellow
pip install -r "$ROOT\requirements.txt" --quiet
Write-Host "  ✓ Python dependencies installed" -ForegroundColor Green

# ── Step 2: Node dependencies ─────────────────────────────────
Write-Host "[2/6] Installing Node.js dependencies..." -ForegroundColor Yellow
Set-Location "$ROOT\venturegraph-web"
npm install --silent
Set-Location $ROOT
Write-Host "  ✓ Node.js dependencies installed" -ForegroundColor Green

# ── Step 3: Supabase credentials ─────────────────────────────
Write-Host ""
Write-Host "[3/6] Supabase setup" -ForegroundColor Yellow
Write-Host ""
Write-Host "  You need a FREE Supabase account. It takes 2 minutes." -ForegroundColor White
Write-Host "  Opening browser to supabase.com now..." -ForegroundColor White
Write-Host ""
Start-Process "https://supabase.com/dashboard/sign-up"
Start-Sleep -Seconds 3

Write-Host "  Follow these steps in the browser:" -ForegroundColor Cyan
Write-Host "  1. Sign up with GitHub (fastest) or email" -ForegroundColor White
Write-Host "  2. Click 'New Project', name it 'venturegraph'" -ForegroundColor White
Write-Host "  3. Choose any region, set a password, click Create" -ForegroundColor White
Write-Host "  4. Wait ~2 minutes for the project to provision" -ForegroundColor White
Write-Host "  5. Go to: Project Settings → API" -ForegroundColor White
Write-Host "  6. Copy the three values below" -ForegroundColor White
Write-Host ""

$supabaseUrl     = Read-Host "  Paste your Supabase Project URL (https://xxxx.supabase.co)"
$supabaseAnon    = Read-Host "  Paste your anon/public key"
$supabaseService = Read-Host "  Paste your service_role key"

if (-not $supabaseUrl -or -not $supabaseAnon -or -not $supabaseService) {
    Write-Host "  ERROR: All three values are required." -ForegroundColor Red
    exit 1
}

# ── Step 4: Write .env files ──────────────────────────────────
Write-Host ""
Write-Host "[4/6] Writing environment files..." -ForegroundColor Yellow

$pythonEnv = @"
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_KEY=$supabaseService
COMPANIES_HOUSE_API_KEY=
OSF_TOKEN=
"@
Set-Content -Path "$ROOT\.env" -Value $pythonEnv -Encoding UTF8

$nextEnv = @"
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseAnon
NEXT_PUBLIC_APP_URL=http://localhost:3001
"@
Set-Content -Path "$ROOT\venturegraph-web\.env.local" -Value $nextEnv -Encoding UTF8

Write-Host "  ✓ .env created (Python engine)" -ForegroundColor Green
Write-Host "  ✓ venturegraph-web/.env.local created (web app)" -ForegroundColor Green

# ── Step 5: Run Supabase schema ───────────────────────────────
Write-Host ""
Write-Host "[5/6] Setting up Supabase database schema..." -ForegroundColor Yellow

# Auto-copy schema to clipboard
$schemaSql = Get-Content "$ROOT\supabase_schema.sql" -Raw
Set-Clipboard -Value $schemaSql
Write-Host "  ✓ Schema SQL copied to your clipboard automatically" -ForegroundColor Green
Write-Host ""

$projectRef = ($supabaseUrl -replace "https://", "" -replace ".supabase.co", "")
Write-Host "  Opening Supabase SQL Editor in your browser..." -ForegroundColor White
Start-Process "https://supabase.com/dashboard/project/$projectRef/sql/new"
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "  ┌─ DO THESE 3 STEPS IN THE BROWSER ──────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  1. Click inside the SQL editor box                     │" -ForegroundColor White
Write-Host "  │  2. Press  CTRL + A  (select all), then  DELETE         │" -ForegroundColor White
Write-Host "  │  3. Press  CTRL + V  (paste — schema is already copied) │" -ForegroundColor White
Write-Host "  │  4. Click the green  RUN  button                        │" -ForegroundColor White
Write-Host "  │  5. You should see: 'Success. No rows returned'         │" -ForegroundColor White
Write-Host "  └─────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

Read-Host "  Press ENTER once you see 'Success' in Supabase"

# ── Step 6: First live run ────────────────────────────────────
Write-Host ""
Write-Host "[6/6] Running the live engine for the first time..." -ForegroundColor Yellow
Write-Host ""
Set-Location $ROOT
python live/run_all.py --loop all

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Your live engine is now running. To start the dashboard:" -ForegroundColor White
Write-Host ""
Write-Host "    .\start.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Then open: http://localhost:3001/pulse" -ForegroundColor Cyan
Write-Host ""
