# Stampy ☕️

Digital loyalty stamp cards that live in Apple Wallet — no customer app.
Staff stamp from a web page; the card updates on the customer's phone in
seconds, with a lock-screen banner.

## The three pieces

| Piece | Where | What |
|---|---|---|
| Customer card | Apple Wallet | Branded pass, stamp dots, QR barcode. Added by scanning the counter QR. |
| Staff stamper | `/staff` (web page, PIN-gated) | +1 stamp, redeem & reset, send a lock-screen nudge. |
| Brain | This Node server + Postgres on Railway | Issues signed passes, hosts Apple's pass web service, pushes updates via APNs. |

## Key URLs (once deployed)

- `/` — customer landing → "Add to Apple Wallet"
- `/qr` — printable counter QR (points at `/`)
- `/staff` — staff stamper (PIN = `STAFF_PIN` env var)
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
| `STAFF_PIN` | Shared staff PIN (default `1234` — change it) |
| `CAFE_NAME` / `CAFE_REWARD` / `STAMPS_TARGET` / `STAMPS_START` | Card content (defaults: Kopi Corner / Free coffee / 10 / 2) |

The app **boots fine with none of these** — `/setup` shows what's missing.

## Local dev

```sh
pnpm install
pnpm dev        # server on :3000 (setup mode without env)
pnpm test       # unit tests (pass content, notification wiring)
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
