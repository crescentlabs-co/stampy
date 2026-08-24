# PunchMe — rules for any AI model working on this repo

PunchMe = loyalty stamp cards in Apple Wallet + Google Wallet, no customer app.
Read README.md for the system overview and **DESIGN.md before touching any
UI** — it holds the palette, the type and the rules, and there is exactly one of
each. Do not invent a second palette. The founder is **non-technical**: give
click-by-click browser instructions for anything manual, run all commands for
them, and prefer browser UIs over files for anything they configure.

## Verify before claiming done
```sh
pnpm typecheck && pnpm test && pnpm e2e && pnpm test:migration && pnpm test:backup
```
`pnpm e2e` boots an embedded Postgres and runs the full HTTP flow (190+ checks).
`pnpm test:migration` builds a REAL pre-v1.3 database and upgrades it — the only
cover for the path a deploy actually takes. `pnpm test:backup` dumps, erases and
restores a real database, because a backup nobody has restored is not a backup.
All five must be green before any change is called complete. Commit after
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

**A pass carries its own ruleset**, snapshotted at issue: `stamps_target` and
`reward`. Editing the card never rewrites them — the promise on a card already
in a wallet stands. `redeemPass` is the one exception and the only one there
should be: the reward has just been given, so it restarts the card on **today's**
target and reward, **at zero stamps**. That is what lets a rules change reach
existing customers without asking anyone to delete their card and rescan — raise
a target from 10 to 12 in the morning and this afternoon's redeemer restarts at
0 of 12. The restart ignores `stamps_start`: those are welcome stamps for a NEW
card, and the visit that earned the reward is the stamp a head start would
otherwise hand over.

Because of that, **`card_stamp_strips` is keyed `(card_id, target, filled)`**.
It was keyed without the target, and saving a card replaced the whole set at
whatever the number now was — so lowering 8 → 6 made a customer at 7 of 8
request a strip that no longer existed (404, grid gone), and raising 6 → 10
redrew their 5-of-6 card as 5 of 10. Only a browser can render a grid, so
`/api/overview` reports `targetsInUse` and the designer renders one set per live
target; `setStampStrips` replaces every set at once, which is also what prunes a
target nobody holds any more. Never key card art by a number a card can change.

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
   src/winback.ts — **five messages per customer per rolling 7 days**
   (`MAX_NUDGES_PER_WEEK`; one, then two, then three, five since v2.6). Per
   PERSON, not per pass: their other wallet card must not buy an extra message.
   The Customers tab's `BUCKETS` are that same rule and are WORDED from the
   constant; nothing on screen states the number any more, because a hard-coded
   "two" outlived the rule it described twice. Never police this in the browser;
   it used to live in a `confirm()` dialog and was therefore not a limit at all.
   **Five a week is not five a day.** Google hard-caps THREE notifications per
   card per 24h and drops the rest silently — no error, and `messages` records a
   send no Android phone ever showed. Spread over a week that ceiling is never
   met; five to one customer in an afternoon quietly loses two. Raising the cap
   again means a per-DAY rule in `canNudge`, not a bigger weekly one.
   **`HEALTH` (routes/dashboard.ts) is a different axis and not a second copy
   of this one.** BUCKETS say whether a customer *may* be messaged; HEALTH says
   whether they are a Regular, Returning, New or Lost — judged on lifetime net
   visits, their average GAP between visits, and the shop's own
   `merchants.expected_return_days`. **Signing up is visit 1** (they were in the
   shop to scan the poster); welcome stamps fill the card and are not extra
   visits. Regular is written in counter STAMPS (`REGULAR_STAMPS`, 3) rather
   than visits for exactly that reason — counting the sign-up towards it would
   have loosened the bar to two stamps in the same change that started counting
   it. A count alone is not enough either: three stamps in one afternoon and
   three over three months are the same number, so Regular also needs an
   average gap inside the shop's cycle (`REGULAR_GAP`). The nudge
   dropdown targets a HEALTH group and `canNudge` still filters it, so a group
   send can never outrun the cap. Both are computed over the same
   `onePerCustomer` array so they cannot disagree about who exists.
   **Nothing messages a customer on a timer** — automated win-back was removed
   in v1.5; a nudge is always an owner pressing a button.
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
   `pass_added`/`pass_removed` arrive from **two** places, and
   `metadata.platform_source` says which: `apple-webservice` (Apple's PassKit
   web service) or `google-callback` (Google Wallet issuer callbacks —
   src/routes/googleCallback.ts). This file used to state that Google reports
   neither, ever. **That was wrong**, and it cost the product its only Android
   churn signal for as long as it stood. Anything comparing platforms must still
   check the date: rows before the callback shipped are Apple-only.
8. **No browser dialogs for anything that matters.** Browsers let a user
   suppress further dialogs, after which `confirm()` returns false silently —
   on a staff phone that means "Give reward & restart" quietly stops working.
   Destructive actions use the two-tap `arm()` helper instead (relabel the
   button, second tap within 4s). A test asserts the staff page contains none.
9. **Platform dispatch lives in `applyAndPush`** (src/cardActions.ts):
   `apple` → empty APNs push (device re-fetches); `google` → PATCH object /
   addMessage. Both staff (stamp/undo/redeem) and the dashboard (nudge) go
   through it — new card-mutating endpoints must too (it also logs the
   `events` row that powers dashboard metrics). Pass `{actor, forced}` so the
   audit columns stay populated. Nudges are an owner action, never staff.
   **Staff actions pass `deferPush: true`**: the stamp is committed and logged,
   then delivery runs in the background, chained per serial so two quick stamps
   can't land out of order. A counter must never wait on Google, which can take
   seconds to reach an Android phone. Nudges stay synchronous — `logMessage`
   records whether the message arrived, and that row is the only history of it.
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
13. **The product's NAME is `PRODUCT_NAME` in src/pages.ts and nowhere else.**
   The product was called Stampy and is now **PunchMe**. Three lowercase
   `stampy` strings survived that rename on purpose, and renaming any of them
   breaks something no deploy can repair:
   - **`stampy_session`, `stampy_cust_*`, `stampy_card_*`, `stampy_staff_*`**
     (src/auth.ts) are cookie names sitting in people's browsers now. The
     customer one lasts 400 days and is the only record that a browser already
     holds a card — rename it and every customer is minted a duplicate.
   - **`<issuer>.stampy-<cardId>`** (src/googleModel.ts) is the Google Wallet
     class id, re-sent on every stamp. Rename it and every Android card ever
     issued stops updating, forever, with no way to tell the phone.
   - **`pass.com.stampy.*`** is Apple's Pass Type ID, registered with Apple and
     baked into every issued .pkpass. It comes from `PASS_TYPE_ID` in Railway.

   Same rule, different shape: **`BASE_URL` is baked into issued passes** —
   Apple's `webServiceURL` and the art URLs inside every Android card. Changing
   the domain does not migrate them. Point a new domain at the service and
   **keep the old one resolving**, or every pass already in a wallet goes dark.

## The event log is the source of truth

`events` is append-only — nothing in this codebase may ever UPDATE or DELETE a
row in it. Metrics are **derived by query** (`cardMetrics`, src/db.ts computes
stamps as `count(stamp) - count(undo)`); `passes.stamp_count` is a cache that
can be rebuilt. Keep it that way: a stored aggregate that drifts from the log is
how the Home headline came to disagree with the list under it.

**There is exactly one exception, and it is not a precedent.**
`hardDeleteMerchant` (src/db.ts) deletes a shop and its entire history in one
transaction — events included — so the same onboarding flow can be set up and
torn down repeatedly while testing. The rule exists so a correction can never
rewrite history and leave a metric disagreeing with the log; here the shop and
its whole log go together, leaving nothing to disagree. It also destroys
`passes`, whose `serial` and `auth_token` are inside cards already on customers'
phones, so every card that shop issued is orphaned permanently with no way to
tell the phone. A **paid** shop is refused, the operator must type the shop's
name, and archiving stays the default. Do not widen this, and do not copy the
pattern into anything that deletes less than a whole merchant.

A correction is a new row, never an edit. An `undo` is its own event and the
stamp it reverses stays. The pruner (`pruneAbandonedPasses`) refuses to delete
any pass that was ever stamped or ever reached a wallet, because that would let
churn erase its own evidence.

**There is exactly ONE exception, and it is `hardDeleteMerchant` (src/db.ts).**
It removes a shop that never traded — refused outright if the merchant has any
pass, any customer or any sent message — and takes its `events` rows with it, in
the same transaction. The rule above exists so a *correction* can never rewrite
history and leave a metric disagreeing with the log; here the shop and its
entire log go together, so nothing survives to disagree. It exists because
archiving cannot free an email address: login refuses an archived owner and the
claim form refuses an existing one, so a demo shop or a typo can leave an
address unable to do either. Do not widen this. Any other need to remove event
rows is a new row, or it is a bug.

**`logEvent` fills in what the caller omits** — merchant, customer, platform,
progress, and the target in force — from the pass, in the same statement. Don't
work around it. Those columns exist because they must be true of every row, and
a call site that skipped one would leave a hole that surfaces months later as a
query that quietly under-counts.

Two things are written down because they cannot be recovered later:
- **`join_view` / `wallet_click`** — the funnel above `enroll`. A scan nobody
  recorded is gone; nothing downstream implies it.
- **`messages`** — what was ACTUALLY sent and whether it arrived.
  `passes.message` keeps only the latest wording and the next nudge overwrites
  it, so the table is the only place message history exists.

`metadata` (jsonb) is the escape hatch for the next unforeseen field. Event type
names and metadata keys are effectively permanent: every historical query keys
off those strings, so renaming one later means rewriting stored rows *and* every
query together.

**`pass_dropped`** (APNs 410) records that a device no longer holds a pass. It
deliberately does NOT gate nudges the way `pass_removed` does — a delivery
failure silently changing who gets messaged would be a behaviour change, not a
logging one. Revisit that deliberately or not at all.

## Backups — there is no safety net but this one

Railway only offers snapshots on a paid plan, and this project is on the free
one, so **`pnpm db:backup` is the only backup that exists.** Take one before any
migration that is not purely additive, and before anything else irreversible.

```sh
DATABASE_URL='<Railway DATABASE_PUBLIC_URL>' pnpm db:backup     # → ~/Stampy-backups/
DATABASE_URL='…' pnpm db:restore ~/Stampy-backups/stampy-….json [--force]
```

`DATABASE_PUBLIC_URL` (Postgres service → Variables), not `DATABASE_URL` — the
latter is `.railway.internal` and only resolves inside Railway. Dumps land
**outside the repo** on purpose: they hold password hashes, staff PIN hashes and
pass auth tokens, so no `git add -A` may ever reach them.

The dump is data only. Restoring means: check out the commit that was live when
it was taken, let its `migrate()` build that schema in an EMPTY database, then
restore into it. `src/backup.ts` refuses a dump whose tables or columns don't
match the target — that guard is what stops a `cafes`-era dump being replayed
into a `cards`-era database and turning a recovery into a second outage.

**`passes` is the table that cannot be rebuilt.** `serial` and `auth_token` are
inside wallet cards already on customers' phones; lose those rows and every
issued card is orphaned permanently, with no way to tell the phone about a new
serial. Everything else could be retyped in an afternoon.

## Stack facts
- pnpm (not npm), Node 22 from `~/.local/node22` (no Homebrew) — prefix
  commands with `export PATH="$HOME/.local/node22/bin:$PATH"` if missing.
- Postgres on Railway; schema is created/migrated idempotently in
  `migrate()` (src/db.ts) — additive changes only, use
  `ADD COLUMN IF NOT EXISTS` for existing deployments.
- Env vars seed the default card once; after that, card content is edited in
  the /dashboard, not env.
