# Stampy — rules for any AI model working on this repo

Stampy = loyalty stamp cards in Apple Wallet + Google Wallet, no customer app.
Read README.md for the system overview. The founder is **non-technical**: give
click-by-click browser instructions for anything manual, run all commands for
them, and prefer browser UIs over files for anything they configure.

## Verify before claiming done
```sh
pnpm typecheck && pnpm test && pnpm e2e && pnpm test:migration
```
`pnpm e2e` boots an embedded Postgres and runs the full HTTP flow (190+ checks).
`pnpm test:migration` builds a REAL pre-v1.3 database and upgrades it — the only
cover for the path a deploy actually takes. All four must be green before any
change is called complete. Commit after
every working change with a meaningful message.

`pnpm dev:local` runs the whole app on localhost:3010 with an embedded Postgres
and seeded demo customers (no Railway, no secrets) — use it to actually look at
a UI change in a browser, since the dashboard's ~1500 lines of in-page
JavaScript are not covered by the test suites.

## The data model (v1.3)

`merchants` (the business, one per login) → `cards` (a loyalty programme) →
`passes` (one customer's wallet card) → `customers` (a person at one merchant).
`cards` used to be called `cafes` and was all four things at once, which is what
produced a PIN per card and a stamper that resolved to a stranger's counter.

**A card's id can never change.** It is printed on QR posters, forms the Google
class id (`<issuer>.stampy-<card.id>`, re-sent on every stamp), and appears in
the art URLs inside every issued Android card. Re-key one and that customer's
card silently stops updating forever. `/c/:cardId` and `/c/:cardId/art/*` are
permanent routes for the same reason — additive only, never retired.

`/j/:ref` is the merchant join link that goes on posters: the permanent merchant
id, or any slug they have ever held (retired slugs 301 forever, so a rename can
never kill a printed poster).

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
   **Nudge limits are enforced server-side, in one place:** `canNudge` in
   src/winback.ts — max 2 per card per 7 days, and stop entirely after 6 with
   no visit in between. Both the dashboard button and the hourly job go
   through it. Never police this in the browser; it used to live in a
   `confirm()` dialog and was therefore not a limit at all.
4. **Both platforms share one scanner:** the pass barcode content is the serial
   (UUID) on Apple AND Google; `short_code` (6 chars, no 0/O/1/I/L) is the
   typed fallback. Don't diverge them.
5. **A customer is a PERSON, not a pass.** Someone holding an Apple and a
   Google card at one shop is one customer: counted once, messaged once, and
   their "last visit" is the last stamp on anything they hold. Every active
   count uses `count(DISTINCT COALESCE(p.customer_id, p.serial))`. Counting
   passes instead is how the Home headline came to disagree with the list
   under it — twice.
6. **Customer identity is a signed per-merchant cookie and nothing else.** No
   name, email or phone — the privacy page promises exactly that. It therefore
   identifies a BROWSER: a new phone is a new customer, and that is accepted,
   not a bug to fix by collecting PII.
7. **"Customer" has one definition, everywhere:** a pass that was stamped, is
   in a wallet now, or ever was (`ACTIVE_PASS_SQL`, src/db.ts). Deleting the
   pass must NOT un-count someone — that would let churn erase its own
   evidence — so `pass_added` keeps them counted and the pruner skips them.
   `pass_added`/`pass_removed` come from Apple's PassKit web service and are
   **Apple-only**: Google reports neither, ever. Never present them as
   platform-wide numbers.
8. **No browser dialogs for anything that matters.** Browsers let a user
   suppress further dialogs, after which `confirm()` returns false silently —
   on a staff phone that means "Give reward & restart" quietly stops working.
   Destructive actions use the two-tap `arm()` helper instead (relabel the
   button, second tap within 4s). A test asserts the staff page contains none.
9. **Platform dispatch lives in `applyAndPush`** (src/cardActions.ts):
   `apple` → empty APNs push (device re-fetches); `google` → PATCH object /
   addMessage. Staff (stamp/undo/redeem), dashboard (nudge/win-back), and the
   automated win-back job (`src/winback.ts`, hourly from server.ts) all go
   through it — new card-mutating endpoints must too (it also logs the
   `events` row that powers dashboard metrics). Pass `{actor, forced}` so the
   audit columns stay populated. Nudges are an owner action (dashboard or the
   auto job), never staff.
10. **Brute-force limits live in `src/rateLimit.ts`** (in-memory, failure-only:
   `peek()` to gate, `hit()` only on a failed attempt, `clear()` on success —
   so real usage never trips it). Login 8/15min per-email, staff sign-in
   20/10min per owner+IP (deliberately loose — shared café wifi), signup 5/h +
   forgot 3/h. Only `POST /staff/api/login` is limited, not every staff
   request, so a blocked attacker can't stop a signed-in phone mid-shift.
   `trust proxy` is on so `req.ip` is the real client. Blocked = 429
   `{error:"too-many-attempts", retryAfterSeconds}`.
11. **Auth is hand-rolled on node:crypto** (scrypt + HMAC cookies, timing-safe
   compares everywhere). Don't add auth/session dependencies. Three cookies,
   all `payload.signature` via the shared `seal`/`unseal` in src/auth.ts:
   owner session, **per-merchant customer** cookie (dedup), and per-owner staff
   session. The customer cookie replaced a per-card one holding a serial; the
   old reader stays in `src/auth.ts` and MUST NOT be deleted — customers hold
   400-day cookies, and ignoring them mints everyone a duplicate card.
   **There is ONE staff PIN per owner** (`owners.staff_pin_hash`), covering
   every card they run — one counter, one PIN, one stamper page. It used to
   hang off each card row, so "+ Add card" silently minted a second PIN and a
   second stamper link; don't reintroduce that. Which card a staff request is
   about travels in `x-card-id` and is checked against that owner's cards.
   The **PIN is only ever stored as a scrypt hash** — nothing can read it
   back, so the UI shows a new PIN once and otherwise only replaces it. Each
   staff cookie carries the owner's `staff_session_epoch`; `setStaffPin` bumps
   it, signing every staff phone out across every card. Never reintroduce a
   PIN in an API response, a page, or `localStorage`.
12. **No build step.** tsx runs TypeScript directly; pages are template strings
   in src/pages.ts; the only browser lib is jsqr served from node_modules.
   Don't introduce bundlers or frontend frameworks. Because the browser JS is
   nested inside template literals, nothing type-checks it — `test/pages.test.ts`
   compiles every inline `<script>` instead, so keep new pages listed there.
   **Never put a backtick in a comment inside those template strings** — it ends
   the literal. Run `pnpm typecheck` after editing src/pages.ts.

## Stack facts
- pnpm (not npm), Node 22 from `~/.local/node22` (no Homebrew) — prefix
  commands with `export PATH="$HOME/.local/node22/bin:$PATH"` if missing.
- Postgres on Railway; schema is created/migrated idempotently in
  `migrate()` (src/db.ts) — additive changes only, use
  `ADD COLUMN IF NOT EXISTS` for existing deployments.
- Env vars seed the default card once; after that, card content is edited in
  the /dashboard, not env.
