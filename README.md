# Stampy ☕️

Digital loyalty stamp cards that live in Apple Wallet **and Google Wallet** —
no customer app. Staff stamp from a web page; the card updates on the
customer's phone in seconds, with a lock-screen notification.

**How updates flow, per platform:**
- **Apple:** we host the pass + Apple's web-service endpoints; on each stamp we
  send an empty APNs push, the iPhone re-fetches the pass, and iOS renders the
  `changeMessage` banner.
- **Google:** Google hosts the card; on each stamp we `PATCH` the LoyaltyObject
  (`NOTIFY_ON_UPDATE`) — no push tokens, no web service. Nudges use
  `addMessage` with `TEXT_AND_NOTIFY`. Google caps notifications at 3 per card
  per 24 h.

## The pieces

| Piece | Where | What |
|---|---|---|
| Customer card | Apple Wallet / Google Wallet | Branded pass, stamp dots, QR barcode + typed card code. Added by scanning the counter QR — the landing page shows both wallet buttons. |
| Staff stamper | `/staff` (web page, PIN-gated) | 📷 scan the customer's card → +1 stamp; typed-code fallback; redeem & reset; lock-screen nudge. |
| Owner dashboard | `/dashboard` (email + password) | Metrics (cards, stamps, redemptions), edit reward/PIN/targets, add more cafés. |
| Brain | This Node server + Postgres on Railway | Multi-café; issues signed passes, hosts Apple's pass web service, pushes updates via APNs. |

**Multi-café:** every café has its own pages under `/c/<cafeId>` (landing, `/enroll`, `/qr`)
and its own staff PIN (`/staff?c=<cafeId>`). The bare paths serve the default café,
which is seeded from the env vars below on first boot.

**Stamping fallback ladder (staff side):** camera scan (BarcodeDetector, or the
bundled jsQR on iPhone Safari) → typed card code (printed on the pass) → tap the
card in the recent list.

## Key URLs (once deployed)

- `/` — Stampy marketing landing page (CTAs → `/dashboard`)
- `/c/default` — default café's customer Add-to-Wallet page (each café: `/c/<id>`)
- `/qr` — printable counter QR (points at `/c/default`)
- `/staff` — staff stamper (PIN lives in the café row; seeded from `STAFF_PIN`)
- `/dashboard` — owner dashboard (first visit = create the owner account)
- `/setup` — **green/red checklist of what's configured** — start here
- `/health` — uptime check
- `/wallet/v1/...` — Apple's pass web service (Apple calls these, not humans)

## Environment variables (all set in Railway → Variables, never in files)

| Variable | What / where it comes from |
|---|---|
| `DATABASE_URL` | Set automatically by Railway's Postgres plugin |
| `BASE_URL` | This app's public https URL |
| `APPLE_TEAM_ID` | developer.apple.com → Membership details |
| `PASS_TYPE_ID` | e.g. `pass.com.stampy.loyalty` (created on developer.apple.com) |
| `SIGNER_CERT_B64` / `SIGNER_KEY_B64` | From the exported `.p12` — produced by `pnpm prepare-certs` |
| `SIGNER_KEY_PASSPHRASE` | Only if the exported key kept a passphrase (prepare-certs strips it) |
| `APNS_KEY_B64` / `APNS_KEY_ID` | APNs auth key `.p8` + its Key ID |
| `GOOGLE_ISSUER_ID` | From the Google Wallet Business Console (Android cards) |
| `GOOGLE_SERVICE_ACCOUNT_B64` | Produced by `pnpm prepare-google <key.json>` |
| `STAFF_PIN` | Seeds the default café's staff PIN (change it later in the dashboard) |
| `SESSION_SECRET` | Any long random string — keeps dashboard logins valid across deploys |
| `CAFE_NAME` / `CAFE_REWARD` / `STAMPS_TARGET` / `STAMPS_START` | Seed the default café on first boot (Kopi Corner / Free coffee / 10 / 2); edit in the dashboard afterwards |

The app **boots fine with none of these** — `/setup` shows what's missing.

## Local dev

```sh
pnpm install
pnpm dev        # server on :3000 (setup mode without env)
pnpm test       # unit tests (pass content, notification wiring, auth)
pnpm e2e        # full end-to-end run against an embedded local Postgres
pnpm typecheck
pnpm art        # regenerate pass artwork from the SVGs in scripts/generate-art.ts
```

## How a stamp reaches the phone (the hero loop)

1. Staff taps **+1 Stamp** → `POST /staff/api/stamp`.
2. Server bumps `stamp_count`, then sends an **empty** APNs push to every
   device registered for that pass.
3. The phone silently fetches the fresh pass from
   `GET /wallet/v1/passes/...` and iOS itself renders the lock-screen banner
   from the changed field's `changeMessage`.

Only two fields carry a `changeMessage` (stamp progress + the hidden
`message` back-field), so each event produces exactly one banner.

## Founder checklist (in order)

1. Railway: create project from this repo, add **Postgres** plugin.
2. Railway Variables: set `BASE_URL`, `STAFF_PIN`.
3. Apple (needs approved Developer account): create **Pass Type ID**,
   **signing certificate** (export `.p12` from Keychain), **APNs key** (`.p8`).
4. Run `pnpm prepare-certs <p12> <password> <p8>` → paste the printed
   variables into Railway.
5. Open `/setup` → everything green → print `/qr` → scan with iPhone → card
   in Wallet → open `/staff` → **+1 Stamp** → banner on the lock screen. 🎉
