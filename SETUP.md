# VentureGraph Live Pulse — Setup Guide

## 5-Step Activation (all free, ~30 minutes)

---

### Step 1 · Create a Supabase project (free)

1. Go to https://supabase.com and sign in with GitHub
2. Click **New Project** → name it `venturegraph` → choose region nearest to you
3. Wait ~2 minutes for provisioning
4. Go to **Project Settings → API**
5. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon/public** key
   - **service_role** key (keep this secret — Python engine only)

---

### Step 2 · Run the database schema

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Paste the entire contents of `supabase_schema.sql` from the project root
4. Click **Run**
5. You should see 8 tables created in the **Table Editor**

---

### Step 3 · Configure environment variables

**For the Python live engine:**
```bash
cp .env.example .env
# Edit .env and fill in:
#   SUPABASE_URL = your Project URL
#   SUPABASE_SERVICE_KEY = your service_role key
```

**For the Next.js web app:**
```bash
cd venturegraph-web
cp env.local.example .env.local
# Edit .env.local and fill in:
#   NEXT_PUBLIC_SUPABASE_URL = your Project URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY = your anon/public key
```

---

### Step 4 · Install dependencies

**Python (in project root):**
```bash
pip install -r requirements.txt
```

**Node.js (in venturegraph-web/):**
```bash
cd venturegraph-web
npm install
```

---

### Step 5 · Run the live engine once to test

**Run all three loops once (from project root):**
```bash
python live/run_all.py --loop all
```

**Expected output:**
```
== VentureGraph Live Engine · Loop: ALL ==
[run_all] Supabase configured: True
── LOOP 1: INGESTION ──────────────────
[ingest] EDGAR Form D RSS …
  → EDGAR: 25 events
[ingest] RSS: techcrunch …
  → techcrunch: 8 events
...
── LOOP 2: SIGNAL ENGINE ──────────────
[signal] SMS scores computed: 6
  IGV   SMS=0.234  dev=+0.12σ  —
  XBI   SMS=0.412  dev=+2.34σ  🔴 SIGNAL
...
── LOOP 3: MARKET BENCHMARK ───────────
[market] Computed 0 outcome records (signals too recent)
```

**Verify in Supabase Table Editor:**
- `funding_events` should show new rows
- `sms_scores_live` should show sector scores
- `signals` should show any triggered signals

---

### Step 6 · Start the web app

```bash
cd venturegraph-web
npm run dev
```

Open http://localhost:3000 — click **Live Pulse** in the left sidebar (Floor 00).

---

### Step 7 · Enable automated GitHub Actions (optional but recommended)

1. Push the project to a GitHub repository
2. Go to **Settings → Secrets and variables → Actions**
3. Add these repository secrets:
   - `SUPABASE_URL` → your Project URL
   - `SUPABASE_SERVICE_KEY` → your service_role key
   - `COMPANIES_HOUSE_API_KEY` → from https://developer.company-information.service.gov.uk/
4. The workflow at `.github/workflows/live_engine.yml` will automatically:
   - Run ingestion every 15 minutes
   - Run the signal engine every 6 hours
   - Run market benchmarking daily after US close

---

### Optional · UK Companies House API key (free)

1. Go to https://developer.company-information.service.gov.uk/
2. Click **Get an API key** → sign up (free, instant)
3. Add to `.env` as `COMPANIES_HOUSE_API_KEY=your_key_here`
4. This adds UK deal-flow coverage to the ingestion

---

### Verify a receipt

Any sealed signal or entity snapshot can be publicly verified at:
```
http://localhost:3000/verify/[receipt_sha256_hash]
```

The hash is the SHA-256 chain: `SHA256(protocol_hash + input_hash + output_hash + issued_at)`.
Anyone can verify it without trusting VentureGraph — just the OSF public archive and a calculator.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ GitHub Actions (free, public repo)                      │
│   every 15 min → python live/run_all.py --loop ingest   │
│   every 6 hrs  → python live/run_all.py --loop signal   │
│   daily 21:30  → python live/run_all.py --loop market   │
└─────────────────────────────┬───────────────────────────┘
                              │ writes
                              ▼
┌─────────────────────────────────────────────────────────┐
│ Supabase (free tier · 500MB)                            │
│   funding_events · silence_events · sms_scores_live     │
│   signals · receipts · signal_outcomes · track_record   │
└─────────────────────────────┬───────────────────────────┘
                              │ reads (anon key)
                              ▼
┌─────────────────────────────────────────────────────────┐
│ Next.js app (Vercel free)                               │
│   /pulse               → Live Pulse dashboard           │
│   /pulse/track-record  → Lead-time track record         │
│   /verify/[hash]       → Public receipt verification    │
│   /api/entity/search   → Entity search                  │
│   /api/entity/seal     → Seal a snapshot                │
└─────────────────────────────────────────────────────────┘
```

All costs: **$0/month** on free tiers until 500MB DB, 100K daily API calls, or 100GB bandwidth is exceeded.
