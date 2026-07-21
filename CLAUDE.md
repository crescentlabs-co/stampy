# Stampy — rules for any AI model working on this repo

Stampy = loyalty stamp cards in Apple Wallet + Google Wallet, no customer app.
Read README.md for the system overview. The founder is **non-technical**: give
click-by-click browser instructions for anything manual, run all commands for
them, and prefer browser UIs over files for anything they configure.

## Verify before claiming done
```sh
pnpm typecheck && pnpm test && pnpm e2e
```
`pnpm e2e` boots an embedded Postgres and runs the full HTTP flow (28+ checks).
All three must be green before any change is called complete. Commit after
every working change with a meaningful message.

## Invariants — do not break these

1. **Boots with zero secrets.** The app must start and serve /setup with no env
   vars at all. Anything needing credentials degrades gracefully:
   Apple signing throws `NotConfiguredError` (caught → 503 page); APNs,
   Google Wallet, and the email client (`src/email.ts`, Resend) return
   `{ok:false, reason:"…-not-configured"}` and NEVER throw. Preserve this
   contract in new code. Password reset degrades to the admin console when
   email is unconfigured.
2. **Secrets live in Railway's Variables UI only** — never in files, never
   committed. (`certs/wwdr.pem` is a public Apple cert, committed on purpose.)
3. **One notification per event.** Apple: exactly two pass fields carry
   `changeMessage` (`progress`, `message`) — a test enforces this. Google:
   one NOTIFY_ON_UPDATE patch or one TEXT_AND_NOTIFY message per event;
   Google hard-caps 3 notifications/card/24h.
4. **Both platforms share one scanner:** the pass barcode content is the serial
   (UUID) on Apple AND Google; `short_code` (6 chars, no 0/O/1/I/L) is the
   typed fallback. Don't diverge them.
5. **Platform dispatch lives in `applyAndPush`** (src/cardActions.ts):
   `apple` → empty APNs push (device re-fetches); `google` → PATCH object /
   addMessage. Staff (stamp/redeem), dashboard (nudge/win-back), and the
   automated win-back job (`src/winback.ts`, hourly from server.ts) all go
   through it — new card-mutating endpoints must too (it also logs the
   `events` row that powers dashboard metrics). Nudges are an owner action
   (dashboard or the auto job), never staff.
8. **Brute-force limits live in `src/rateLimit.ts`** (in-memory, failure-only:
   `peek()` to gate, `hit()` only on a failed attempt, `clear()` on success —
   so real usage never trips it). Login 8/15min per-email, staff PIN 20/10min
   per café+IP (deliberately loose — shared café wifi), signup 5/h + forgot
   3/h. `trust proxy` is on so `req.ip` is the real client. Blocked = 429
   `{error:"too-many-attempts", retryAfterSeconds}`.
6. **Auth is hand-rolled on node:crypto** (scrypt + HMAC cookies, timing-safe
   compares everywhere). Don't add auth/session dependencies.
7. **No build step.** tsx runs TypeScript directly; pages are template strings
   in src/pages.ts; the only browser lib is jsqr served from node_modules.
   Don't introduce bundlers or frontend frameworks.

## Stack facts
- pnpm (not npm), Node 22 from `~/.local/node22` (no Homebrew) — prefix
  commands with `export PATH="$HOME/.local/node22/bin:$PATH"` if missing.
- Postgres on Railway; schema is created/migrated idempotently in
  `migrate()` (src/db.ts) — additive changes only, use
  `ADD COLUMN IF NOT EXISTS` for existing deployments.
- Env vars seed the default café once; after that, café content is edited in
  the /dashboard, not env.
