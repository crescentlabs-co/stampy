/**
 * Pure pass-content logic — no certificates, no I/O — so the card's look and
 * notification wording are unit-testable before Apple approval even lands.
 */
import { config } from "./config.js";
import type { CardKind, CardRow, PassRow } from "./db.js";

/**
 * The stamp grid as text: filled vs empty slots, spaced, over two rows.
 *
 * One unbroken run of ten circles is a thing you have to count rather than
 * read. This is the same 2×N grid the Apple strip image draws (see stampGrid,
 * which has always said two rows) — spaces between the circles and a line break
 * at the halfway point, so a glance lands on a shape instead of a queue.
 *
 * Still a STRING, so still free. Size, alignment and wrapping belong to Google
 * on the Android card — these are text modules, and characters are the only
 * lever we have. Anything more would mean sending an image per stamp, which is
 * the ~20s path buildLoyaltyPatch exists to avoid.
 *
 * One row below four stamps: two rows of one or two circles is not a grid, it
 * is a stack, and the break costs more than it gives.
 */
export function stampDots(count: number, target: number): string {
  const filled = Math.max(0, Math.min(count, target));
  const slots = Array.from({ length: Math.max(0, target) }, (_, i) =>
    i < filled ? DOT_FULL : DOT_EMPTY);
  if (slots.length < 5) return slots.join(" ");
  // Ceiling on the top row, so an odd target leaves the SHORT row underneath —
  // the same way the strip image centres its last row rather than its first.
  const top = Math.ceil(slots.length / 2);
  return slots.slice(0, top).join(" ") + "\n" + slots.slice(top).join(" ");
}

/**
 * The large circles, not ● and ○.
 *
 * These are read at arm's length on an Android card, where they are TEXT —
 * Google renders textModulesData in its own typography and we cannot set a size
 * or an alignment. Bigger characters are the only lever that costs nothing;
 * bigger *and* centred would mean sending an image, which is what made a stamp
 * take ~20s to reach a phone instead of 3-5s (see buildLoyaltyPatch).
 *
 * Deliberately NOT the emoji circles (⚫ ⚪), which are larger still but locked
 * black-and-white by the emoji font — they ignore the card's text colour and
 * all but disappear on a dark card.
 */
const DOT_FULL = "⬤";
const DOT_EMPTY = "◯";

export function isRewardReady(
  row: Pick<PassRow, "stamp_count" | "stamps_target" | "kind">,
): boolean {
  // A membership card has no target to reach, so it is never "ready" — its
  // count is a lifetime visit tally, and without this every long-standing
  // member would light up the staff phone's redeem button forever.
  if (row.kind === "membership") return false;
  return row.stamp_count >= row.stamps_target;
}

/** "7/10" — the plain tally. One wording, so nothing drifts between surfaces. */
export function progressText(earned: number, total: number): string {
  return `${earned}/${total}`;
}

/**
 * The one-line status shown as the card's header, with no label beside it.
 *
 * It counts UP while that is the encouraging number and flips to counting DOWN
 * once the customer is at least halfway — "3 left" pulls harder than "7 earned"
 * when the reward is close.
 *
 * Every count from 0 to total yields a DIFFERENT string, which is what makes the
 * lock-screen banner fire on every stamp: iOS only shows one when the field's
 * value actually changed. A test enforces that distinctness — if you edit this,
 * keep it true or stamps go silent.
 */
export function getHeaderFieldValue(earned: number, total: number, kind: CardKind = "stamp"): string {
  // A membership card has nothing to count towards, so the header is a status,
  // not a number. It therefore never changes, and this card never fires a
  // lock-screen banner of its own — which is correct: there is no event to
  // announce. A nudge still banners through the `message` field below.
  if (kind === "membership") return "Member";
  const filled = Math.max(0, Math.min(earned, total));
  if (filled >= total) return "Reward ready";
  const remaining = total - filled;
  return remaining <= filled ? `${remaining} left` : `${filled} earned`;
}

/**
 * The perks list as the wallets want it: one per line, blank lines dropped.
 *
 * Stored as free text the owner types into a textarea, so it arrives with
 * whatever spacing they left behind. Both platforms render it as a single
 * block of text, so the tidying has to happen before it gets there.
 */
export function benefitLines(benefits: string): string[] {
  return benefits.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Which stored strip image a card of this kind should ask for.
 *
 * Strips are keyed (card_id, target, filled) because a stamp card needs one
 * pre-rendered picture per count. A membership card has no counter and no
 * ceiling — its tally climbs for as long as somebody keeps visiting — so there
 * is no count to key on. It stores exactly ONE band, at (0, 0), and every
 * member's card asks for that.
 *
 * One function so the writer (the designer's applyStamps) and the four readers
 * cannot disagree about where the picture lives.
 */
export function stripKey(
  kind: CardKind,
  target: number,
  count: number,
): { target: number; filled: number } {
  if (kind === "membership") return { target: 0, filled: 0 };
  return { target, filled: Math.max(0, Math.min(count, target)) };
}

/** The perks, ready to print on the back of a card. '' when there are none. */
export function benefitsText(benefits: string): string {
  return benefitLines(benefits).map((l) => `• ${l}`).join("\n");
}

/**
 * The stamp grid is derived from the total, never merchant-configurable: always
 * two rows, so the strip image has a consistent shape at any target. An odd
 * total leaves the last row one short, and the renderer centres it.
 */
export function stampGrid(total: number): { rows: number; cols: number } {
  return { rows: 2, cols: Math.max(1, Math.ceil(total / 2)) };
}

/**
 * The reward terms printed on the back of the card, on BOTH platforms — Apple
 * reads it from here, googleModel.ts imports the same function. One wording, so
 * an Android customer and an iPhone customer are never shown different terms.
 *
 * Expiry is stated as a reserved right, not a promise: nothing in the code
 * expires a stamp, and there is no per-card expiry setting. Say "may" or say
 * nothing — a card that claims an automatic behaviour we don't implement is
 * worse than one that stays quiet. If a real expiry mechanism ever lands, this
 * string is where the number comes from.
 */
export function membershipTerms(business: string): string {
  return [
    `${business} decides what the membership includes and provides it — PunchMe only runs the card.`,
    `${business} may change or withdraw a benefit, or end the membership programme, at any time.`,
    "This card proves membership only. It holds no money and cannot be exchanged, sold or transferred.",
  ].join(" ");
}

/** Whichever terms fit the card in hand. One call site, so neither can be missed. */
export function cardTerms(business: string, kind: CardKind): string {
  return kind === "membership" ? membershipTerms(business) : rewardTerms(business);
}

export function rewardTerms(business: string): string {
  return [
    "One stamp per visit.",
    `${business} decides what earns a stamp and provides the reward — PunchMe only runs the card.`,
    "Stamps may expire after 12 months without a visit.",
    `${business} may substitute a reward of similar value or end the programme at any time.`,
    "Stamps have no cash value and cannot be exchanged, sold or transferred.",
  ].join(" ");
}

/**
 * Two zero-width characters, used as the digits of an invisible number.
 *
 * U+200B (space) and U+200C (non-joiner) both render as nothing, in the
 * notification banner and on the back of the card. They are ordinary text to a
 * string comparison and invisible to a reader, which is exactly the pair of
 * properties this needs.
 */
const MARK_DIGITS = ["​", "‌"];

/** Strip the invisible send marker — for tests, and for anything that must read the words. */
export function visibleMessage(value: string): string {
  return value.replace(/[​‌]/g, "");
}

/**
 * The message field's value: the shop's words, and an INVISIBLE marker saying
 * which send this is.
 *
 * iOS only shows a changeMessage banner when the field's VALUE differs from the
 * pass already on the phone. The send box is pre-filled with the shop's stored
 * message, so most sends are the same wording — and identical wording meant an
 * identical value, so every send after the first updated the card silently: no
 * banner, no error, and an owner concluding notifications were broken.
 *
 * So the value has to change on every send while the banner still reads exactly
 * what the shop typed. `changeMessage: "%@"` puts the whole value in the
 * banner, so the difference cannot be visible text — a "Sent 25 Aug, 4:12pm"
 * line was tried and appeared in the notification, which is not what anybody
 * wants to read. Zero-width characters carry it instead: the send time in
 * binary, which is unique per second, and shows as nothing at all.
 */
export function messageFieldValue(
  row: Pick<PassRow, "message" | "message_sent_at">,
  business = "",
): string {
  if (!row.message) return `Welcome to ${business}!`;
  if (!row.message_sent_at) return row.message;
  const secs = Math.floor(new Date(row.message_sent_at).getTime() / 1000);
  const mark = secs
    .toString(2)
    .split("")
    .map((bit) => MARK_DIGITS[Number(bit)])
    .join("");
  return row.message + mark;
}

/** Links to the policies, for the back of the card. PassKit linkifies bare URLs. */
export function legalText(): string {
  const base = config.baseUrl || "";
  return `We never ask for your name, phone number or email. To stop, delete this card from your wallet.\n\nTerms: ${base}/terms\nPrivacy: ${base}/privacy`;
}

/**
 * Builds the complete pass.json content for a card, branded per café.
 *
 * Notification design (the hero feature): iOS shows a lock-screen banner when
 * a field that carries `changeMessage` changes. Exactly two fields carry one:
 *  - the `progress` header      → fires on every stamp ("3 left — free coffee at 10")
 *  - the hidden `message` field → fires when we set a win-back message
 * Everything else changes silently, so customers get one clean banner per event.
 *
 * `%@` is substituted by iOS with the field's NEW value, so the header's
 * changeMessage has to read correctly for every shape getHeaderFieldValue can
 * return ("4 earned", "3 left", "Reward ready") — hence the bare "%@ — …" form
 * rather than a sentence built around a specific one.
 *
 * The stamp grid itself lives in the strip IMAGE (pre-rendered per count into
 * card_stamp_strips), not in a field — nothing is overlaid on top of it, which is
 * why there is no primary field and why the old unicode-dots field is gone.
 */
/**
 * What goes in the QR on the card, for BOTH platforms.
 *
 * It lives in one function because CLAUDE.md invariant 4 says Apple and Google
 * carry the same barcode and must not diverge — and until now that was kept true
 * by writing `row.serial` out twice, in two files, and hoping. One decision
 * point means they cannot drift apart, whatever rules get added here later.
 *
 * The demo card is the one exception, and it is deliberate. That card exists to
 * be handed out at a pitch and passed around afterwards; a stranger scanning it
 * is the best moment this product gets, and a serial does nothing for them. So
 * its QR opens the landing page instead. It stops being stampable by camera as
 * a result — the staff scanner keys on a UUID shape (src/pages.ts) and a URL
 * fails that test. The typed short code and the recent-customer list still
 * work on it.
 *
 * `altText` is printed under the barcode, so it has to describe what the code
 * actually IS. "Code K8FFZ3" under a QR that is not that code is a small lie
 * told to whoever is squinting at it.
 *
 * NOTE: this bakes BASE_URL into every demo pass ever issued, alongside
 * webServiceURL and the art URLs. Point a new domain at the service and keep the
 * old one resolving, or these QRs go dark like everything else.
 */
export function passBarcode(
  row: Pick<PassRow, "serial" | "short_code">,
  card: Pick<CardRow, "id">,
): { message: string; altText: string } {
  if (config.demoCardId && card.id === config.demoCardId) {
    return {
      message: `${config.baseUrl || ""}/?s=card`,
      // An instruction, not the address. On a normal card this line is the
      // typed fallback for when a camera will not read the code - but there is
      // nothing to type here, because this card cannot be stamped and the
      // barcode is a URL with a query string nobody would key in by hand. So it
      // does the only useful job left: telling whoever is looking at the card
      // why they would point a phone at it.
      altText: "Scan for more info",
    };
  }
  return { message: row.serial, altText: `Code ${row.short_code}` };
}

/**
 * "Aug 2026" — the month a member joined, for the front of a membership card.
 *
 * Built from a literal month list rather than toLocaleDateString: the wallet
 * renders whatever string we hand it, and a server whose ICU data differs would
 * otherwise print a different card for the same customer.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function memberSince(at: Date | string): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildPassJson(
  row: PassRow,
  card: CardRow,
  /** The shop's name. Defaults to the card's, which is right until a merchant runs two. */
  business = card.name,
): Record<string, unknown> {
  const ready = isRewardReady(row);
  const member = row.kind === "membership";
  const barcode = passBarcode(row, card);
  const perks = benefitsText(card.benefits ?? "");

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    organizationName: business,
    // The SHOP's name, never the card's. Apple shows this on the Add sheet and
    // again in the pass's info panel, and `cards.name` is an internal label the
    // owner has no field for any more — a shop that renamed was still being
    // introduced to its own customers by whatever the card was called on the day
    // it was created.
    description: `${business} loyalty card`,
    serialNumber: row.serial,
    webServiceURL: `${config.baseUrl}/wallet`,
    authenticationToken: row.auth_token,
    sharingProhibited: true,
    // Apple draws this BESIDE the logo image, so a brand lockup that already
    // contains the shop's name printed it twice. The owner ticks
    // "my logo includes my name" and the field is dropped entirely — omitted,
    // not empty-stringed, because Wallet reserves the slot for an empty string
    // and leaves a gap where the text was. organizationName and description
    // above keep the name regardless: those are the Add sheet and the
    // notification, where an unnamed card is the worse failure.
    ...(card.logo_has_name ? {} : { logoText: business }),
    backgroundColor: card.background_color,
    foregroundColor: card.foreground_color,
    labelColor: card.label_color,
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        // Shared with the Google object through passBarcode, so the two
        // platforms cannot disagree about what is in the QR.
        message: barcode.message,
        messageEncoding: "iso-8859-1",
        // Staff fallback: if the camera won't read, they type this code.
        altText: barcode.altText,
      },
    ],
    storeCard: {
      headerFields: [
        {
          // No `label`: the value stands alone beside the logo. Keeping the key
          // as "progress" keeps Apple diffing it against the same field on cards
          // already issued, and keeps the documented changeMessage pair intact.
          key: "progress",
          value: getHeaderFieldValue(row.stamp_count, row.stamps_target, row.kind),
          // A membership card's value never changes, so this never fires — but
          // the field keeps its changeMessage so the pass still carries exactly
          // the documented pair (progress + message) whatever kind it is.
          changeMessage: member
            ? `%@ at ${business}`
            : ready
              ? `%@ — your ${row.reward.toLowerCase()} is waiting 🎉`
              : `%@ — ${row.reward.toLowerCase()} at ${row.stamps_target}`,
        },
      ],
      // Empty, but the keys stay: the strip image carries the stamp grid and
      // nothing may sit on top of it. passkit-generator emits these as [] either
      // way, and test/passModel.test.ts spreads all five arrays.
      primaryFields: [],
      // Same two keys on both kinds, deliberately. Apple diffs a pass against
      // the one already on the phone field by field, so reusing `reward` and
      // `tally` means a card that changes kind updates in place instead of
      // leaving two dead slots behind.
      secondaryFields: member
        ? [
            { key: "reward", label: "Member no.", value: row.short_code },
            { key: "tally", label: "Member since", value: memberSince(row.created_at) },
          ]
        : [
            {
              key: "reward",
              label: "Reward",
              value: ready ? `${row.reward} — show this to staff!` : row.reward,
            },
            {
              key: "tally",
              label: "Progress",
              value: progressText(row.stamp_count, row.stamps_target),
            },
          ],
      auxiliaryFields: [],
      backFields: [
        {
          key: "message",
          label: business,
          value: messageFieldValue(row, business),
          changeMessage: "%@",
        },
        // Only on a membership card, and only when the shop has typed some.
        // An empty field renders as a labelled blank on the back of the card,
        // which reads as something we failed to fill in.
        ...(member && perks
          ? [{ key: "benefits", label: "What you get", value: perks }]
          : []),
        {
          key: "code",
          label: member ? "MEMBER NO." : "CARD CODE",
          value: row.short_code,
        },
        {
          key: "howto",
          label: "How it works",
          value: member
            ? `Show this card at ${business} and we will check you in. Your card updates by itself — no app needed.`
            : `Show this card when you order. Collect ${row.stamps_target} stamps and your next ${row.reward.toLowerCase()} is on us. Your card updates by itself — no app needed.`,
        },
        // No changeMessage on either of these: they never change, and Apple
        // shows a lock-screen banner for every back field that carries one.
        // test/passModel.test.ts holds the line at exactly two.
        {
          key: "terms",
          label: member ? "Membership terms" : "Reward terms",
          value: cardTerms(business, row.kind),
        },
        {
          key: "legal",
          label: "Terms & privacy",
          value: legalText(),
        },
      ],
    },
  };
}
