# PunchMe ☕️

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
| Owner dashboard | `/dashboard` (email + password) | Three tabs: Customers (the numbers, then the message you send), Card (shop name, rules, design), Shop (every link you hand out, the staff PIN, your login). |
| Brain | This Node server + Postgres on Railway | Multi-merchant; issues signed passes, hosts Apple's pass web service, pushes updates via APNs. |

**The model:** a **merchant** is the business (one per login). It runs one or more
**cards** (loyalty programmes), each with its own design, reward and QR. A
**customer** is a person at that merchant; the wallet cards they hold are
**passes**.

**Links:** `/j/<merchant>` is the join link that goes on a poster — it survives a
rename and a second card, so the poster is printed once and never again. Each card
also keeps its own `/c/<cardId>` pages (landing, `/enroll`, `/qr`), which can never
be retired: they're on printed QRs and inside every issued Android card.

There is **one staff PIN and one stamper page per owner** (`/staff`), covering every
card they run. Staff can scan whichever card a customer hands over — the stamper
doesn't need to be showing that one.

**Who counts as a customer:** a *person* whose card has been stamped, is in a wallet
now, or ever was — counted once however many passes they hold, so adding the card on
both an iPhone and an Android is one customer. Apple tells us when a pass is added and
when it's deleted; Google reports neither, so an Android card only counts once it's
stamped. Deleting a pass doesn't un-count someone — they move to the "Deleted the
card" cohort instead.

Identity is a signed cookie per merchant, holding no name, email or phone. It
identifies a *browser*: a new phone reads as a new customer, which is the deliberate
cost of asking customers for nothing.

**Stamping fallback ladder (staff side):** camera scan (BarcodeDetector, or the
bundled jsQR on iPhone Safari) → typed card code (printed on the pass) → tap the
card in the recent list.

## Key URLs (once deployed)

- `/` — PunchMe marketing landing page (CTAs → `/dashboard`)
- `/j/<merchant>` — **the join link to print**; survives a rename and a 2nd card
- `/c/<cardId>` — one card's Add-to-Wallet page (permanent; never retire these)
- `/qr` — printable counter QR (points at `/c/default`)
- `/staff` — staff stamper (one PIN per owner; seeded from `STAFF_PIN`)
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
| `STAFF_PIN` | Seeds the default café's PIN on first boot; the first owner to sign up inherits it, and changes it under Shop afterwards |
| `SESSION_SECRET` | Any long random string — keeps dashboard logins valid across deploys |
| `ENV_NAME` | Which copy this is: unset/`live` (production) or `staging`. Staging gets a banner on every page, `noindex`, no email, and a database stamp that refuses a cross-wired `DATABASE_URL` |
| `GOOGLE_CLASS_PREFIX` | Leave unset on live (defaults to `stampy`, baked into every issued Android card). Staging sets `stampy-stg` so its Google card templates can never overwrite live's |
| `CAFE_NAME` / `CAFE_REWARD` / `STAMPS_TARGET` / `STAMPS_START` | Seed the default café on first boot (Kopi Corner / Free coffee / 10 / 2); edit in the dashboard afterwards |

The app **boots fine with none of these** — `/setup` shows what's missing.

## Staging vs live

Two Railway services run this same repo: **staging** deploys automatically from
`main`, **live** deploys from the `live` branch and only moves when
`pnpm promote` pushes `main` there — after the five verification suites pass.
Each service has its own Postgres; on first boot a database stamps itself with
its `ENV_NAME` (the `app_env` table) and the app refuses to start against a
database stamped for the other copy, so a pasted-wrong `DATABASE_URL` fails
loudly instead of writing test data into real shops. If a promoted change reads
a NEW variable, set it on the live service **before** promoting — a missing
variable never crashes this app, it just silently turns the feature off.

## Local dev

```sh
pnpm install
pnpm dev        # server on :3000 (setup mode without env)
pnpm test       # unit tests (pass content, notification wiring, auth)
pnpm e2e        # full end-to-end run against an embedded local Postgres
pnpm test:migration  # upgrades a REAL pre-v1.3 database and checks nothing moved
pnpm test:backup     # dumps, erases and restores a real database
pnpm typecheck
pnpm art        # regenerate pass artwork from the SVGs in scripts/generate-art.ts
```

## Backups

Railway snapshots are a paid feature, so `pnpm db:backup` is the backup:

```sh
DATABASE_URL='<DATABASE_PUBLIC_URL from Railway>' pnpm db:backup
```

It writes one JSON file to `~/Stampy-backups/` — outside the repo, because it
holds password hashes and pass auth tokens. `pnpm db:restore <file> [--force]`
replays it into a database whose schema already matches, and refuses otherwise.
Take one before any migration that isn't purely additive.

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
