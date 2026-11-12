# NexusX Esports India — Official BGMI Platform & Web Admin Dashboard

**Tagline:** `COMPETE. CONNECT. CONQUER.`  
**Primary Game:** Battlegrounds Mobile India (BGMI)  
**Architecture:** Static Public Website (GitHub Pages) + Private-URL Web Admin Dashboard (`/#/your-private-access-path`) + Cloudflare Worker Backend (`worker/`)

---

## 1. Project Overview

NexusX Esports India delivers a responsive static tournament portal paired with a secure browser-based Admin Dashboard backed by a Cloudflare Worker and a minimum-permissions GitHub App:

1. **Public Website (`src/`, `public/`, `dist/`)**
   - Static React 19 + TypeScript + Vite + Tailwind CSS website deployed to **GitHub Pages**.
   - Loads tournament listings, Solo/Duo/Squad divisions, official results, and announcements from split JSON datasets in `public/data/` (pre-publish drafts remain hidden cleanly until verified & published via Admin).
   - Validates official Google Forms URLs (`https://docs.google.com/forms/...` and `https://forms.gle/...`), handles **Open**, **Full** (`Registration Full`), **Closing Soon / Opening Soon**, and **Closed** states, and opens verified registration links safely in a new tab (`rel="noopener noreferrer"`).
   - **Leaderboard & Match Schedule Policy**: Both `/leaderboard` and `/schedule` remain published public pages informing players that official standings and lobby timings are delivered directly via participant email (with optional static JSON rendering if manually populated). Neither page has fake/demo entries or Admin editing modules.
   - **Real Data & Resilience**: Fails closed on network timeout (`8s`), HTTP errors, or schema validation failures, rendering explicit retryable `DataErrorCard` alerts instead of silent empty or fake fallback records. All official BGMI tournaments, results, and announcements remain organizer-managed via GitHub JSON because Krafton does not offer a public self-serve BGMI tournament API (`developer.krafton.com` public telemetry covers PUBG PC/Console only).

2. **Web-Based Admin Dashboard (`src/admin/`, configured build-time private route `VITE_ADMIN_PATH` / `VITE_ADMIN_PATH_HASH`)**
   - Strictly excluded from public navigation, footer links, `robots.txt`, and `sitemap.xml`, with dynamic `<meta name="robots" content="noindex, nofollow" />` directives on the login and dashboard screens and SHA-256 route-hash matching so the secret URL is never committed in plaintext.
   - Lazy-loaded authenticated console (`AdminAppPage`) featuring an explicit **Initial Owner Setup** flow (`ADMIN_SETUP_TOKEN`), header **Light / Dark Theme Toggle** (scoped exclusively to Admin), header **Owner Security Settings** (`Change Admin ID`, `Change Owner Password`, `Active Sessions`, sanitized `Security Activity`), and strictly **only 4 Sidebar Management Modules**:
     1. **Tournament Management**: Create, edit, duplicate, publish/unpublish, archive, and confirmed-delete Solo, Duo & Squad tournaments from blank real-data forms; generate server-backed IDs (`POST /api/admin/tournaments/generate-id`); manage banners, dates, times, seasons, match formats, maps, modes, prizes, rules, and lifecycle statuses.
     2. **Registration Management**: Configure individual Google Forms URLs per tournament (`docs.google.com/forms` & `forms.gle`), toggle **Open / Full / Closed** registration with custom messages, validate URLs, preview live public CTA states, and attach **Private Organizer Google Sheets** (`docs.google.com/spreadsheets/...`) stored solely in Cloudflare Worker `SECURITY_KV` (blocked from publishing into `public/data/*.json`).
     3. **Results Management**: Add/edit tournament results (Solo, Duo, Squad), publish or unpublish results on the public site, manage winners & final positions, associate results with tournaments, and delete results via confirmation modal.
     4. **News & Updates**: Create/edit announcements, publish or unpublish updates, manage categories, dates, descriptions, featured banners, archive old announcements, and delete announcements via confirmation modal.
     5. **Site Settings & Social Links**: Edit Hero tagline/ticker, WhatsApp/Instagram/YouTube/Discord/contact email links, About story cards, and Terms policy sections directly in Admin (`public/data/site-config.json`).
   - Contains **no** Leaderboard, Match Schedule, Player, Team, Match Room, or Email admin modules, **zero** hardcoded credentials or GitHub tokens, and **zero** session/CSRF tokens written to `localStorage` or `sessionStorage`.

3. **Cloudflare Worker Publishing API (`worker/`)**
   - **KV-Backed Mutable Owner Auth + Cookie + CSRF**: Supports initial owner setup (`POST /api/auth/setup`), credential rotation (`Change Admin ID` / `Change Owner Password` with password reuse checks and immediate revocation of all sessions via `tokenInvalidBefore`), and fallback env credentials. Verifies WebCrypto PBKDF2-SHA256 password hashes at **100,000 iterations** (explicitly documented cap imposed by Cloudflare Workers' WebCrypto runtime ceiling vs OWASP 600k baseline) compensated by mandatory **14+ character mixed passphrases**, SHA-256 constant-time usernames, and progressive KV IP + account lockouts. Issues 1-hour HMAC-SHA256 session tokens exclusively inside an `__Host-nexusx_admin_session` (`HttpOnly; Secure; SameSite=None; Partitioned` cross-origin or `SameSite=Strict` same-origin custom domain) cookie plus an in-memory HMAC-bound `X-CSRF-Token`. Bearer tokens and query/storage tokens are rejected.
   - **Persistent Security KV (`SECURITY_KV`)**: In production (`ENVIRONMENT = "production"` or non-local HTTPS origins), the Worker fails closed (`503`) unless `SECURITY_KV` is bound to persist owner credentials (`auth:owner`), private organizer Google Sheet links (`private:sheets`), active `session:<jti>` metadata (masked IP + browser summary), immediate revocations (`revoked:<jti>`), sanitized security audit events (`audit:log`), and brute-force lockouts.
   - **Request & Payload Hardening**: Enforces `Origin` + `Sec-Fetch-Site` verification, exact `Content-Type: application/json` media-type checks, bounded streaming request sizes (`4 KiB` auth / `256 KiB` publish -> `413 Payload Too Large`), strict nested object key whitelists (blocking prototype pollution and disallowed modules), Google Sheet URL leak rejection inside public payloads, upstream error masking, and security headers (`Strict-Transport-Security`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'`).
   - Uses a **single-repository GitHub App** with minimum permissions (**Repository -> Contents: Read and Write**, plus implicit Metadata Read) and verifies `ALLOWED_GITHUB_OWNER` / `ALLOWED_GITHUB_REPO` before committing updates exclusively to:
     - `public/data/tournaments.json`
     - `public/data/results.json`
     - `public/data/news.json`
     - `public/data/site-config.json`

---

## 2. Public Routes

- `/` — Home
- `/tournaments` — Tournaments Hub (dynamic meaningful filters)
- `/tournaments/solo` — Solo Division Tournament Details
- `/tournaments/duo` — Duo Division Tournament Details
- `/tournaments/squad` — Squad Division Tournament Details
- `/tournaments/:slug` — Individual Tournament Details
- `/leaderboard` — Leaderboard (email-delivery policy notice + optional static table)
- `/schedule` — Match Schedule (email-delivery policy notice + optional static schedule)
- `/results` — Published Tournament Results
- `/news` — Published News & Updates
- `/about` — About Us
- `/contact` — Contact Us
- `/privacy` — Privacy Policy
- `/terms` — Terms & Conditions
- `/#/<your-private-admin-path>` — Restricted Web Admin Dashboard (build-time `VITE_ADMIN_PATH` / `VITE_ADMIN_PATH_HASH`; predictable `/admin`, `/dashboard`, `/login` return `404`)
- `*` — Branded 404 Drop Zone Not Found

---

## 3. Project Structure

```text
NexusX Esports India/
├── .github/workflows/deploy.yml   # JSON validation + frontend/worker typecheck & tests + build + Pages deploy
├── public/
│   ├── 404.html                   # Static GitHub Pages 404 fallback
│   ├── favicon.svg                # NexusX emblem SVG
│   ├── robots.txt
│   ├── data/
│   │   ├── site-config.json       # Brand & community metadata (Admin Module 5)
│   │   ├── tournaments.json       # Managed via Admin Module 1 & 2
│   │   ├── results.json           # Managed via Admin Module 3
│   │   ├── news.json              # Managed via Admin Module 4
│   │   ├── leaderboard.json       # Clean empty static file (email delivery policy)
│   │   └── schedule.json        # Clean empty static file (email delivery policy)
│   └── images/                    # Arena and division tactical artwork
├── src/
│   ├── admin/                     # Lazy-loaded Web Admin Command Center (Overview + 5 modules + Security Vault)
│   ├── components/                # Public navigation, badges, registration CTA, modals
│   ├── pages/                     # Public website pages
│   ├── test/                      # Frontend & Admin Dashboard Vitest suites
│   └── utils/                     # Schema validation, CTA resolver, data loader
├── worker/
│   ├── scripts/hash-password.mjs  # Generate PBKDF2-SHA256 hash for ADMIN_PASSWORD_HASH secret
│   ├── src/                       # Cloudflare Worker (auth, validators, GitHub App RS256 client)
│   ├── tests/worker.test.ts       # Worker auth, CORS, path guard, RS256, and commit tests
│   └── wrangler.toml              # Worker bindings & non-secret config
├── package.json                   # Frontend & test scripts
└── README.md
```

---

## 4. Local Development & Testing

### Prerequisites

- **Node.js `22.12+` (or `24+`)** and **npm `10+`** (matches `.github/workflows/deploy.yml` Node `22`)

### Run & Verify Locally

```bash
# 1. Install root & Worker dependencies
npm install
npm --prefix worker install

# 2. Provision your custom private Admin URL hash & fresh CSPRNG Worker dev tokens
# (Stores only SHA-256 route hash in .env.local; never commits defaults or passwords)
npm run setup:local

# 3. Start Vite frontend dev server & Cloudflare Worker local dev server
npm run dev -- --port 5173
# In a second terminal:
cd worker && npx wrangler dev --port 8787
# Then open http://localhost:5173/#/<your-private-path> to create your fresh owner account.

# 4. Run TypeScript checks (frontend + Worker)
npm run typecheck
npm run typecheck:worker

# 5. Run automated Vitest suites (frontend + Worker)
npm test
npm run test:worker

# 6. Build production static site into ./dist
npm run build

# 7. Preview production static build locally
npm run preview
```

*(Or configure `VITE_ADMIN_PATH_HASH` / `VITE_ADMIN_PATH` and `VITE_ADMIN_API_URL` explicitly in `.env.local` / build env, or enter the Worker URL directly inside the private login screen's **Configure Worker API Endpoint** field.)*

---

## 5. Deployment Guide (GitHub Pages + Cloudflare Worker + GitHub App)

### Prerequisites on Local Machine

- **Node.js `22.12+` (or `24+`)** and **npm `10+`** (matches `.github/workflows/deploy.yml` Node `22`)
- **Git for Windows** (if `git --version` fails, install via `winget install --id Git.Git -e --source winget` or from `https://git-scm.com/download/win`, then open a new terminal).

### Step A — Create a Minimum-Permission GitHub App

1. On GitHub, open **Settings -> Developer settings -> GitHub Apps -> New GitHub App**.
2. Set **Repository permissions -> Contents: Read and write** (leave all other permissions on *No access*).
3. Generate and download a **Private Key (`.pem`)** and keep it strictly outside the repository (`*.pem` is excluded by `.gitignore`). Both PKCS#1 (`BEGIN RSA PRIVATE KEY`) and PKCS#8 (`BEGIN PRIVATE KEY`) PEM keys are supported automatically by the Worker.
4. Click **Install App** and select **Only select repositories -> `NexusX-Esports-India`**. Note the numeric **App ID** and **Installation ID** (from the installation URL).

### Step B — Configure & Deploy the Cloudflare Worker (`worker/`)

1. Install Worker dependencies inside `worker/`:
   ```bash
   cd worker
   npm install
   npx wrangler --version
   ```
2. Update `worker/wrangler.toml` (only replace placeholders with your real GitHub account/origin):
   - `ENVIRONMENT`: `"production"`
   - `GITHUB_OWNER`: your GitHub username or organization
   - `GITHUB_REPO`: `"NexusX-Esports-India"`
   - `GITHUB_BRANCH`: `"main"`
   - `ALLOWED_GITHUB_OWNER` & `ALLOWED_GITHUB_REPO`: match your target repository owner/name
   - `ALLOWED_ORIGINS`: `"https://<your-username>.github.io"` *(keep `http://localhost:5173` only if needed for local Vite testing)*
3. Create and bind the mandatory production KV namespace (`SECURITY_KV`) in `worker/wrangler.toml`:
   ```bash
   npx wrangler kv namespace create SECURITY_KV
   ```
   Paste the resulting `id` into `[[kv_namespaces]]` (`binding = "SECURITY_KV"`). Without this binding in production, `/api/auth/*` and `/api/admin/*` fail closed with HTTP `503`.
4. Authenticate Wrangler (`npx wrangler login`) and generate a strong PBKDF2 password hash (minimum 14 characters with upper, lower, digit, and symbol):
   ```bash
   node scripts/hash-password.mjs
   ```
5. Upload all six secrets cleanly via Wrangler (never commit secrets or hashes to Git; generate a 32+ character cryptographic `SESSION_SECRET` and rotate quarterly, and rotate GitHub App keys annually):
   ```bash
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put GITHUB_APP_ID
   npx wrangler secret put GITHUB_APP_INSTALLATION_ID
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY
   # Mandatory for one-time Initial Owner Setup via web UI:
   npx wrangler secret put ADMIN_SETUP_TOKEN
   ```
6. Deploy the Worker and verify the health endpoint:
   ```bash
   npx wrangler deploy
   curl https://<your-worker>.<your-subdomain>.workers.dev/api/health
   ```
7. *(Cross-Origin Cookie vs Custom Domain Architecture)* Because standalone GitHub Pages (`<user>.github.io`) and Cloudflare Workers (`<worker>.workers.dev`) sit on different eTLD+1 sites, strict browser third-party cookie blocking (Safari ITP, Chrome Incognito) can drop `SameSite=None; Partitioned` cookies during admin logins. To achieve first-party `SameSite=Strict` cookies and strongest protection:
   - **Recommended Option A (Same-Site Custom Domain)**: Serve both public site and `/api/*` Worker under your own apex/subdomain (e.g. `https://nexusxesports.in` + `https://nexusxesports.in/api/*` via Cloudflare DNS & Worker Route).
   - **Recommended Option B (Cloudflare Access Zero Trust)**: Protect the private Admin path and Worker `/api/*` behind Cloudflare Access SSO/OTP policies in front of the Worker.
8. *(Recommended Edge WAF Hardening)* In **Cloudflare Dashboard -> Security -> WAF -> Rate limiting rules**, add an edge-wide rate limit rule on `POST /api/auth/login` (this layers in front of the Worker's KV-backed progressive lockout, origin/CSRF guard, and session revocation).

### Step C — Enable GitHub Pages

1. Initialize and push the repository cleanly to branch `main` on GitHub (`NexusX-Esports-India`). Verify `git status` shows zero `.env`, `.dev.vars`, or `.pem` files.
2. Open **Settings -> Pages -> Build and deployment -> Source** and select **GitHub Actions**.
3. Under **Settings -> Secrets and variables -> Actions -> Variables**, configure:
   - `VITE_ADMIN_PATH` (your private route slug) or `VITE_ADMIN_PATH_HASH` (preferred: 64-char SHA-256 hex digest of `nexusx:admin-route:v1:<slug>`)
   - `VITE_ADMIN_API_URL` (optional: your deployed `https://<your-worker>.workers.dev` URL)
4. On every push (or content update committed from the Admin Dashboard), `.github/workflows/deploy.yml` validates JSON files, runs frontend and Worker typechecks & tests, builds `./dist` with a strict production Content Security Policy `<meta>` tag, and deploys automatically to GitHub Pages.

### Step D — Initial Owner Setup, Emergency Recovery & Private Google Sheets

1. **One-Time Initial Owner Setup**: Open your configured private Admin URL (`/#/<your-private-path>`). When `SECURITY_KV` `auth:owner` is empty and no env bootstrap secret is active (and `ADMIN_SETUP_TOKEN` is provisioned), the login screen displays **Initial Setup** so the owner creates their Admin ID and 14+ character passphrase once. Repeat setup requests fail with `409 Conflict`.
2. **Rotating Owner Credentials & Sessions**: Inside the Dashboard header -> **Security**, you can rotate your Admin ID or Password anytime (which immediately revokes all active cookies via `tokenInvalidBefore`), view masked active sessions, revoke other devices, and inspect sanitized Security Activity.
3. **Emergency Recovery (Locked Out / Forgotten Password)**: Run `npx wrangler kv key delete --binding=SECURITY_KV auth:owner` (after removing stale hash secrets or setting a fresh `ADMIN_SETUP_TOKEN` via `npx wrangler secret put ADMIN_SETUP_TOKEN`), then complete Initial Setup again at your private Admin URL.
4. **Organizer Private Google Sheets**: In Admin Module 2 (**Registration Management**), link your response spreadsheet (`https://docs.google.com/spreadsheets/d/...`) per tournament and click **Save Sheet**. Links are stored strictly in Worker `SECURITY_KV` (`private:sheets`) and actively rejected from public GitHub publishes so competitor response sheets are never exposed.

---

## Disclaimer

NexusX Esports India is an independent competitive gaming community platform. *Battlegrounds Mobile India (BGMI)* and related marks belong to Krafton, Inc.
