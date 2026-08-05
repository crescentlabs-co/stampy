# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Shop owners** — the buyer and the account holder. One login owns one business
(`merchants`), which runs one loyalty programme (`cards`; capped at one per
merchant in V1). They set up the card, read the numbers, and press the button
that sends a win-back message.

**Counter staff** — use `/staff`, a PIN-gated web page, on a shared phone
mid-queue. One PIN and one stamper page per owner, covering every card that
owner runs. Their fallback ladder is camera scan → typed card code → tap the
customer in the recent list.

**Customers** — hold the card in Apple Wallet or Google Wallet. They install
nothing and are never asked for a name, email or phone.

*Undecided (asked, deliberately deferred):* which of the three wins when a design
decision cannot satisfy all of them. Raise the specific conflict with the owner
rather than assuming a ranking.

## Product Purpose

Replace the paper stamp card with one that lives in the wallet the customer
already carries, so it cannot be lost, forgotten or left at home — and so the
shop can bring a lapsed customer back, which paper cannot do.

Success is a customer returning. The counter QR gets the card into the wallet in
one tap; each visit is a stamp that updates the card on their phone in seconds
with a lock-screen notification.

## Positioning

The mechanism a neighbouring product cannot truthfully copy without building the
same thing: **no customer app, both wallets, one QR, and no personal data
collected.** Apple and Google are handled with one scanner and one printed code;
the customer installs nothing and hands over nothing.

## Operating Context

- **The counter.** A shared staff phone, a queue, poor café wifi, possibly wet
  hands. Stamping commits and logs first and delivers the update afterwards, so
  the counter never waits on Apple or Google.
- **Printed material.** A poster or counter card carrying a QR. `/j/<merchant>`
  is the join link to print — it survives a rename and a second card. Card ids
  and `/c/<cardId>` routes are permanent because they are on printed QRs and
  inside every issued Android card.
- **Two wallets, two update paths.** Apple: we host the pass and Apple's web
  service, and push an empty APNs notification so the phone re-fetches. Google:
  Google hosts the card and we PATCH it. Google caps notifications at 3 per card
  per 24h.
- **Hosting.** Node + Postgres on Railway; deploys automatically on push to
  `main`. Secrets live only in Railway's Variables UI.

## Capabilities and Constraints

- **A customer is a person, not a pass.** Someone holding an Apple and a Google
  card at one shop is one customer — counted once, messaged once.
- **Identity is a signed per-merchant cookie and nothing else.** No name, email
  or phone; the privacy page promises exactly that. It therefore identifies a
  *browser*: a new phone reads as a new customer. That is the accepted cost of
  asking customers for nothing, not a defect to fix by collecting personal data.
- **Nothing messages a customer on a timer.** A nudge is always an owner
  pressing a button. Automated win-back existed and was deliberately removed.
  Limits are one message per customer per 7 days, and none at all after 6 with
  no visit in between.
- **The event log is the source of truth.** `events` is append-only; metrics are
  derived by query, never stored as aggregates. A correction is a new row.
- **Boots with zero secrets.** The app starts and serves `/setup` with no
  configuration; anything needing credentials degrades rather than crashing.
- Stamp targets run 1–20. The stamp grid is always two rows, system-decided, not
  merchant-configurable.
- Terminology, used consistently in code and copy: **merchant** (the business) →
  **card** (a loyalty programme) → **pass** (one customer's wallet card) →
  **customer** (a person at one merchant).

## Brand Commitments

- Name: **Stampy**.
- Currency is RM and is not an owner-facing choice.
- The privacy promise is a product commitment, not marketing copy: the card and
  the privacy page both state that no name, phone or email is collected.

## Evidence on Hand

**Pre-launch. There are no customers yet.** Onboarding the first shops.

**Price is confirmed: RM79 a month, first month free.** Founder-confirmed on
4 Aug 2026; it may be stated on marketing surfaces.

Future work must not claim, invent or imply: merchant counts, user numbers,
testimonials, case studies, logos, "trusted by", or retention statistics.

What may be stated truthfully: that it is free during the beta, that it needs no
app, that it works with Apple Wallet and Google Wallet, and that setup takes
minutes.

Real assets that exist: the live product at
`stampy-production-cd7d.up.railway.app`, the marketing landing page at `/`, and
a working demo path via `pnpm dev:local` with seeded customers.

## Product Principles

1. **Ask the customer for nothing.** No app, no sign-up, no personal data. Any
   feature that needs PII is out of scope by default.
2. **The counter never waits.** A stamp is committed and logged before anything
   is delivered to a phone; delivery failures lose a notification, never a stamp.
3. **A shop messages its customers deliberately, or not at all.** Owner-pressed
   only, rate-limited server-side in one place, never on a schedule.
4. **Anything printed must keep working forever.** Ids and public routes are
   additive only; a rename, a redesign or a second card can never kill a poster
   that is already on a wall.
5. **What happened is written down once and derived thereafter.** Never store an
   aggregate that can drift from the log.

## Market

Any small business with repeat customers — the built-in templates cover cafés,
bubble tea, bakery, chicken rice and dessert, but the product is not limited to
food. Malaysia first (RM, local habits), wider later.

Note for future copy: existing surfaces still speak café-specifically (the
landing page says "Made for cafés in Malaysia", `package.json` says "Malaysian
cafés"). That is current copy, not a constraint — broadening it is allowed.
