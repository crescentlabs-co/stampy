# PunchMe — rules for any AI model working on this repo

PunchMe = loyalty stamp cards in Apple Wallet + Google Wallet, no customer app.
Read README.md for the system overview and **DESIGN.md before touching any
UI** — it holds the palette, the type and the rules, and there is exactly one of
each. Do not invent a second palette. The founder is **non-technical**: give
click-by-click browser instructions for anything manual, run all commands for
them, and prefer browser UIs over files for anything they configure.

## Staging only. Never live, unless the founder says so in words.

**Push to `main` and nothing else.** `main` deploys to staging
(staging.punchme.my) and merchants never see it. That is where every change
goes, always, by default — including a change the founder is waiting on, a
one-line fix, and a fix for something broken on live.

**Live moves only when the founder says so, in words, in that message.** Not
implied by "ship it", not inherited from approving a plan, not carried over
from the last time they said it. "Push live", "promote", "put it on live" —
something that names live. If they have not said it in the message in front of
you, you are working on staging and you say so.

When they do say it, the ONLY way is `pnpm promote` — it re-runs the five
suites and refuses if any fail. Never `git push origin …:live`, never repoint
Railway, never hand-deploy. If a change needs a NEW Railway variable, set it on
the LIVE service BEFORE promoting: invariant 1 means live will not error, it
will silently skip the feature.

Also, and separately: `main` is not a safe place for a half-finished thing
either. Staging is a real site issuing real wallet cards to real phones — the
founder's, and anyone holding a link. Commit working changes, not broken ones.

## Verify before claiming done
```sh
pnpm typecheck && pnpm test && pnpm e2e && pnpm test:migration && pnpm test:backup
pnpm test:ui
```
`pnpm e2e` boots an embedded Postgres and runs the full HTTP flow (190+ checks).
`pnpm test:migration` builds a REAL pre-v1.3 database and upgrades it — the only
cover for the path a deploy actually takes. `pnpm test:backup` dumps, erases and
restores a real database, because a backup nobody has restored is not a backup.
`pnpm test:ui` drives the Create → Design → Publish → Manage flow in a REAL
Chromium and then reads the server back. It exists because every other suite
here drives the page's code directly — it mounts the design panel and calls its
functions — which proves the functions work and proves nothing about the SCREEN.
Three rounds of "fixed" reached the founder still broken that way, the worst
being a photograph that was too big to store: the save was refused, the refusal
was swallowed, and "Finish and publish" published a card with no artwork on it.
**Its test images are deliberately photographic noise.** A flat logo compresses
to a few kilobytes and slips under every size limit in the app, which is exactly
why nothing caught this. Never swap them for a simple shape to make a test pass.
All six must be green before any change is called complete. Commit after
every working change with a meaningful message.

`pnpm dev:local` runs the whole app on localhost:3010 with an embedded Postgres
and seeded demo customers (no Railway, no secrets) — use it to actually look at
a UI change in a browser, since the dashboard's ~3,500 lines of in-page
JavaScript are not covered by the test suites. Walk all five destinations, open
a customer and a programme, and check the back button — the dashboard pushes a
real address now, so back is part of the product.

## The data model (v1.3)

`merchants` (the business, one per login) → `cards` (a loyalty programme) →
`passes` (one customer's wallet card) → `customers` (a person at one merchant).
`cards` used to be called `cafes` and was all four things at once, which is what
produced an access code per card and a Scanner that resolved to a stranger's counter.

**A card's id can never change.** It is printed on QR posters, forms the Google
class id (`<issuer>.stampy-<card.id>`, re-sent on every stamp), and appears in
the art URLs inside every issued Android card. Re-key one and that customer's
card silently stops updating forever. `/c/:cardId` and `/c/:cardId/art/*` are
permanent routes for the same reason — additive only, never retired.

`/j/:ref` is the merchant join link that goes on posters: the permanent merchant
id, or any slug they have ever held (retired slugs 301 forever, so a rename can
never kill a printed poster).

**A card has TWO ways of being over, and they are different columns.**
`cards.archived_at` means GONE: `cardsForMerchant` filters those rows out and the
owner stops seeing it. `cards.ended_at` (v2.10) means FINISHED: no new sign-ups,
and nothing else changes — it is still listed, still stamped, still redeemed,
still counted in every metric. Never overload archiving to mean ending. A shop
that finishes a promotion has not withdrawn the promise made to everyone already
holding the card, and that promise is the whole product.

**The gate is `shopOpen` (src/routes/public.ts) and it is the only one.** Both
wallets' enrol routes and the landing page ask it, so they close together; the
page it renders takes a REASON, because telling somebody scanning last season's
poster that the shop "isn't open yet" reads as "this business does not exist" and
leaves the one thing they need to know — their card still works — unsaid.
`joinTargetCard` skips ended cards, so a poster falls through to whichever card is
still running. **The one-card-per-merchant cap counts only cards that have not
ended**, which is what lets a shop start next season's card without deleting last
season's — and deleting it would take `passes` with it, orphaning every card
already on a phone.

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

**That machinery still works, and the product no longer offers it.** As of the
Edit-flow rework, **a card's earning rules and its reward are frozen once one
real customer has joined** — the owner cannot change them at all. The paragraph
above describes what WOULD happen safely; the founder's decision is that a
programme's terms should not move under the people on it, full stop. A shop that
wants different terms ends the card and starts another, which is exactly what
`ended_at` is for. The list of frozen fields is `LOCKED_ONCE_JOINED`
(src/routes/dashboard.ts) and **the server is where it is enforced** — the Edit
screen greys the fields out, but a gate the browser computes is a gate anyone
can switch off in devtools. The route DROPS those fields rather than rejecting
the request: the design panel posts them on every save (it holds them hidden so
it can draw the card it is designing), so a 400 would break saving the design of
every live card. "One real customer" is `cardCounts(...).active`, so **a test
card on the owner's own phone locks nothing** — a test pass is not a customer,
and every count in the product already agrees.

**Only two sections, and no Type step.** Editing a finished card is Rules and
Design, both mounted from the same components the Create wizard uses —
`rulesForm` (src/dashboardV2.ts) and `designerFor(card, { showDetails: false,
showShop: false })`. Those two flags matter: `showDetails: true` switches on a
SECOND rules editor buried inside the design panel, with no guidance, no
validation, and a Card type dropdown that could turn a live stamp card into a
membership card. Never turn it back on for an owner. A card's `kind` cannot
change once the card exists — everything a customer holds was built from it.

**A rules save re-renders that screen, and that is not politeness.** The design
panel keeps its own hidden copy of the rules, seeded when it mounted; leave it
mounted after a rules save and the next design save writes that stale copy back
over the change. `pnpm test:ui` covers exactly this.

**A POINTS card's EARN RATE is the one thing deliberately NOT frozen on the
pass, and that is not an oversight.** `cards.earn_mode` (`visit` / `spend` /
`manual`), `cards.earn_spend_cents` and `cards.earn_points` live on the card
only. A stamp card's promise is "ten stamps and the eleventh is free", so
halving `stamps_per_visit` mid-card moves the finish line under somebody already
running at it — which is why THAT one is frozen. A points card's promise is the
PRICE, and the price already is frozen, in the pass's own `milestones`. How fast
you earn towards it is today's rate, and points already banked are untouched by
a change to it. Every real points scheme works this way. Do not "fix" this by
copying the rate onto `passes`.

**The ringgit→points sum happens on the SERVER and only there** (`stampAmount`,
src/routes/staff.ts). On a spend card the counter sends `spend` in ringgit and
never `amount`; a request sending points to a spend card is ignored. Same reason
`/staff/api/redeem` prices a reward off the card's own catalogue instead of
trusting the `at` it was handed — a browser that can name its own rate can mint
whatever it likes. `earn_mode` also decides what staff SEE after a scan: one tap
on visit, a ringgit box on spend, a points box on manual. `point_presets` are
manual-only; the other two work the amount out themselves.

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
   The Customers screen's `BUCKETS` are that same rule and are WORDED from the
   constant; nothing on screen states the number any more, because a hard-coded
   "two" outlived the rule it described twice. Never police this in the browser;
   it used to live in a `confirm()` dialog and was therefore not a limit at all.
   **Five a week is not five a day.** Google hard-caps THREE notifications per
   card per 24h and drops the rest silently — no error, and `messages` records a
   send no Android phone ever showed. Spread over a week that ceiling is never
   met; five to one customer in an afternoon quietly loses two. Raising the cap
   again means a per-DAY rule in `canNudge`, not a bigger weekly one.
   **A customer can switch marketing off, and only they can switch it back on**
   (`customers.opted_out_at`, v2.9). It is on the CUSTOMER, so one press covers
   every card that person holds. `canNudge` refuses it FIRST — before the
   deleted card and before the weekly cap — because it is a decision they made
   rather than a state they are passing through, and "at the weekly limit" reads
   as "try again next week". The dashboard shows the state and offers no control
   to reverse it: an owner who could re-consent someone would make the whole
   mechanism worthless. The gate is in TWO places on purpose — `canNudge`
   pre-filters the route's list, and `applyAndPush` refuses a nudge outright, so
   the raw entry point is not left open. It stops MARKETING ONLY: a stamp still
   notifies, because that push carries no wording of ours and silencing it would
   leave their card showing stale progress until they happened to open it.
   `refreshCardArt` is deliberately NOT blocked — it raises no notification.
   A suppressed nudge still writes a `messages` row (`kind:"suppressed-opt-out"`)
   because "we correctly did not send" is worth as much as a delivery, and that
   table is the only history messaging has. **Two audience numbers, never one:**
   `counts.active` is everyone, `counts.reachable` is who a campaign can reach,
   and opted-out people stay in visits and health groups — dropping them would
   make opting out look like churn.
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
6. **Customer identity is still the signed per-merchant cookie.** Name and phone
   are required lookup details, not credentials: never deduplicate, merge, or
   authenticate customers by either field. A new phone can therefore create a
   new customer record even when a family shares a phone number. Profile reads
   and writes stay merchant-scoped, require consent, and never log the details.
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
   every card they run — one counter, one access code, one Scanner. It used to
   hang off each card row, so "+ Add card" silently minted a second PIN and a
   second Scanner link; don't reintroduce that. Which card a staff request is
   about travels in `x-card-id` and is checked against that owner's cards.
   The **PIN is only ever stored as a scrypt hash** — nothing can read it
   back, so the UI shows a new PIN once and otherwise only replaces it. Each
   staff cookie carries the owner's `staff_session_epoch`; `setStaffPin` bumps
   it, signing every staff phone out across every card. Never reintroduce a
   PIN in an API response, a page, or `localStorage`.
12. **No build step.** tsx runs TypeScript directly; pages are template strings;
   the only browser lib is jsqr served from node_modules. Don't introduce
   bundlers or frontend frameworks. Four files hold the front end, and they
   depend on each other in ONE direction — never make an arrow point back:
   - **`src/ui/kit.ts`** — the shell every page is served in (`page()`), the
     design tokens (`baseCss`), and every block of browser code more than one
     page renders: `MODAL_JS`, `SEG_CSS`/`SEG_JS`, `HEALTH_JS`, `PALETTE_JS`
     and the 2,200-line card designer (`DESIGN_PANEL_JS`).
   - **`src/dashboardV2.ts`** — the whole owner dashboard.
   - **`src/ui/dashboardV2Mock.ts`** — every placeholder number in the
     dashboard, each named `MOCK_`, so deleting the file removes all of it.
   - **`src/pages.ts`** — every other page, and it RE-EXPORTS the kit and the
     dashboard. Six route files and both test suites import those names from
     here, so keep the re-exports.

   Because the browser JS is nested inside template literals, nothing
   type-checks it — `test/pages.test.ts` compiles every inline `<script>`
   instead, so **keep new pages listed in its `pages` array**; a page that is
   not there is tested by nothing. A page with no inline script at all must be
   named in that file's `SCRIPTLESS` set, or the guard that stops the
   extraction silently matching nothing will fail it.
   **Never put a backtick in a comment inside those template strings** — it ends
   the literal, and neither does a bare `${`. Run `pnpm typecheck` after editing
   any of the four.

   **The dashboard is one document with a real address per screen.** Five
   destinations — Home, Customers, Create, Manage, Shop — pushed with
   `history.pushState`, plus the deeper ones (`/dashboard/customers/:code`,
   `/dashboard/manage/rewards/:id`). Every one of those addresses must have an
   entry in **`V2_SCREENS`** (src/routes/dashboard.ts) or it 404s the moment
   somebody refreshes on it; a test walks every link in the page and checks.
   It is a LIST and not a catch-all on purpose: `/dashboard` also carries every
   `/api/…` endpoint, and a catch-all would answer a mistyped one with an HTML
   page and a 200, which `api()` reads as an empty answer rather than an error.
   An unknown `/dashboard/api/…` path must stay a 404.
13. **The product's NAME is `PRODUCT_NAME` in src/ui/kit.ts and nowhere else.**
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

14. **Two copies, one codebase — live and staging.** `ENV_NAME` (default
   `live`, so production needs no variable) is what a deployment IS; everything
   staging-specific keys off it via `envName()` in src/config.ts: the banner and
   noindex in `page()`, the hard email block in src/email.ts, robots.txt, and
   the `app_env` stamp. On first boot a database stamps itself with its
   ENV_NAME (`ensureEnvStamp`, src/db.ts) and boot REFUSES a database stamped
   for the other copy — that refusal is what stands between a pasted-wrong
   `DATABASE_URL` and a test site writing into real shops, so never weaken it
   and never hand-edit `app_env`. Backups exclude `app_env` on purpose (the
   stamp describes the deployment, not the data — src/backup.ts says why).
   `GOOGLE_CLASS_PREFIX` defaults to `stampy` and live must NEVER set it —
   that default is the invariant-13 string inside every issued Android card,
   and a test pins it. Staging sets `stampy-stg` because the card id `default`
   exists in both databases and would otherwise map both copies onto ONE
   Google class, letting staging overwrite the live card template. Staging
   deploys from `main`; live deploys from the `live` branch and moves only via
   `pnpm promote` (runs the five suites, then pushes main → live). A change
   that reads a NEW env var must have it set on the LIVE service before
   promoting: invariant 1 means live will not complain, it will silently skip
   the feature.

15. **A shop's plan is `merchants.plan`, and nothing else.** `paid_at` still
   exists and is still written, but it now means only *when they FIRST went
   pro* — history, kept through a downgrade the way an undone stamp does not
   erase the stamp. **Never branch on `paid_at` again**: a shop that stopped
   paying keeps its date, so the console showed it as Paying for ever. The
   plan is TEXT (`free` / `pro`) rather than a flag because a second tier is
   expected, and a yes/no column would have to be replaced to get one.
   `merchants.trial_ends_at` is NULL for almost every shop, meaning "derive
   it" — `TRIAL_DAYS` from the FIRST STAMP, never from signup — and exists
   solely so one shop can be given longer, which a derived date cannot express.
   A shop that has never been stamped at has **not started** a trial and must
   never read as expired; that is the difference between "not begun" and
   "finished", and getting it backwards switches features off for exactly the
   shops that have not managed to use the product yet. What a plan unlocks
   lives in **`planAllows` (src/health.ts) and nowhere else** — the dashboard
   is SENT the answer (`account.allows`) and only reads it, because a gate the
   browser computes is a gate anyone can switch off in devtools. Gate the
   SCREEN as well as the link to it: every dashboard address is real and
   refreshable, so a bookmark walks straight past a tile-only check.

## The event log is the source of truth

`events` is append-only — nothing in this codebase may ever UPDATE or DELETE a
row in it. Metrics are **derived by query** (`cardMetrics`, src/db.ts computes
stamps as `count(stamp) - count(undo)`); `passes.stamp_count` is a cache that
can be rebuilt. Keep it that way: a stored aggregate that drifts from the log is
how the Home headline came to disagree with the list under it.

**There are exactly TWO exceptions, and neither is a precedent.** Both delete
a whole THING together with its whole log, in one transaction, so nothing
survives to disagree with anything. That is the only shape this is ever allowed
to take. A correction is still a new row, always.

**One — `hardDeleteMerchant`** (src/db.ts) deletes a shop and its entire history in one
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

**Two — `removeCard`** (src/db.ts) deletes a card that never issued a real
pass, and takes its `events` and `messages` rows with it. The test is
`CARD_HAS_REAL_PASS_SQL`: has this card ever minted a pass that was not the
owner's own `is_test` one? It used to be "has ANYTHING ever touched this card",
which meant one test card on the owner's own phone — or opening their own
sign-up page once — made the card un-deletable for ever, while the button still
said "Delete". Note what the test does NOT use: `ACTIVE_PASS_SQL`. A Google card
can be sitting in a wallet before it has been stamped or confirmed, and deleting
that orphans it with no way to tell the phone. **A card ONE real customer has
held is archived, and stays archived.** The dashboard labels its button off the
same predicate (`deletable` on the overview payload), so the button and the
server cannot promise different things.

**Restating the first, because it is written out twice:**
`hardDeleteMerchant` removes a shop that never traded — refused outright if the merchant has any
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
