/**
 * Merchant triage: turning a row of counts into "who needs me today, and why".
 *
 * Pure functions over `MerchantHealthRow`, deliberately kept out of db.ts and
 * out of SQL. These rules are the part of the console most likely to be quietly
 * wrong — a threshold that fires on everybody is worse than no rule at all,
 * because it trains you to ignore the list — so they have to be unit-testable
 * without a database, and `now` is a parameter for the same reason.
 *
 * Every signal here reads data the product already writes. Five of the event
 * types it depends on (`pin_failed`, `lookup_failed`, `pass_dropped`,
 * `card_edited`, `poster_view`) were being logged and read by nothing.
 */
import { TRIAL_DAYS, type MerchantHealthRow } from "./db.js";

const DAY = 86_400_000;

export type Severity = "critical" | "warn" | "info";

export interface Flag {
  key: string;
  severity: Severity;
  /** Chip text. Short enough to sit in a table cell. */
  label: string;
  /** One line: what is happening, with the number that says so. */
  detail: string;
  /** What to actually do about it. */
  action: string;
}

const RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

/**
 * Every flag this file can raise, with the exact rule that fires it.
 *
 * Exported as DATA so the console's legend is generated from the same list the
 * rules are keyed on — a definitions table written as prose in the page would
 * drift the first time a threshold moved, and a threshold you cannot look up is
 * a number you cannot trust. A test asserts every key raised below appears here.
 */
export const FLAG_GUIDE: { key: string; label: string; rule: string; why: string }[] = [
  { key: "locked-out", label: "Staff locked out",
    rule: "3+ failed staff PINs in 24h, and nothing stamped in the last 24h",
    why: "The counter cannot sign in. Identical to apathy in every other number, and a two-minute fix." },
  { key: "messages-failing", label: "Messages not arriving",
    rule: "Any nudge recorded as undelivered",
    why: "They think they are reaching customers and are not." },
  { key: "unclaimed", label: "Never claimed",
    rule: "Built 3+ days ago and the claim link has not been used",
    why: "Nothing else can happen until they claim it — no login, no staff PIN, and their sign-up page stays closed so no customer can be issued a card nobody could stamp." },
  { key: "never-activated", label: "Never set up / No stamps yet",
    rule: "Zero stamps ever, claimed, and 3+ days old",
    why: "Reads 'Never set up' when they have never opened their poster — nothing is on the counter — and 'No stamps yet' when they have." },
  { key: "went-quiet", label: "Went quiet",
    rule: "Has stamped before, but nothing in the last 7 days",
    why: "The single best predictor of churn." },
  { key: "slowing", label: "Slowing down",
    rule: "5+ stamps last week, and this week is less than half of it",
    why: "Caught before it becomes a dead counter." },
  { key: "one-phone", label: "One phone only",
    rule: "20+ stamps, all from a single staff device",
    why: "If that person leaves or their phone dies, the programme stops." },
  { key: "codes-failing", label: "Codes not matching",
    rule: "5+ typed codes matched nothing in 7 days",
    why: "Usually a worn poster or staff typing the wrong thing." },
  { key: "signup-leak", label: "Scans not converting",
    rule: "10+ join pages opened, and under 30% tapped Add",
    why: "The poster is working and the sign-up page is losing them." },
  { key: "not-landing", label: "Cards not landing",
    rule: "10+ cards made, and under 40% confirmed in a wallet",
    why: "The wallet's own Add sheet is failing. Apple-only figure — Google only reports since the issuer callback was set up." },
  { key: "churning", label: "Customers deleting",
    rule: "5+ cards landed, and over 30% later removed or dropped",
    why: "'Removed' is the wallet telling us it was deleted; 'dropped' is Apple answering 410 for a device that no longer holds it." },
  { key: "rewards-owed", label: "N rewards owed",
    rule: "3+ customers sitting at their target un-redeemed",
    why: "Staff are missing the reward banner. These customers did everything asked and got nothing, so they are the likeliest of all to give up." },
  { key: "trial-ending", label: "Nd of trial left",
    rule: "7 or fewer days left of the 30, counted from their FIRST STAMP",
    why: "The advice differs by whether they are actually stamping: one is a sale, the other is a decision." },
  { key: "trial-expired", label: "Trial ended Nd ago",
    rule: "Past 30 days from their first stamp",
    why: "The clock starts when they first serve a customer, not when they sign up — a shop that has never stamped has not begun, and raises 'Never set up' instead." },
];

function daysSince(d: Date | string | null, now: number): number | null {
  if (!d) return null;
  return (now - new Date(d).getTime()) / DAY;
}

/** Days left in the trial. Negative once it has run out. */
export function trialDaysLeft(m: Pick<MerchantHealthRow, "trial_day">): number {
  return TRIAL_DAYS - m.trial_day;
}

/**
 * What the merchant got, in money, from numbers that are countable rather than
 * modelled.
 *
 * `stamps` is net staff stamps from the event log — welcome stamps and the
 * post-reward reset are written straight to `passes.stamp_count` and emit no
 * event, so free stamps have never been in it. One stamp is one visit to the
 * counter. The basket is self-reported, so this is a fact times one assumption,
 * and it is NOT claimed as incremental: some of these people would have come
 * anyway, and we cannot see the counterfactual.
 */
export function value(m: MerchantHealthRow): {
  spendThroughCard: number;
  spendPerReward: number;
  rewardsGiven: number;
  hasBasket: boolean;
} {
  const basket = m.basket_cents / 100;
  return {
    spendThroughCard: m.stamps * basket,
    // What a customer spends to earn one reward. The honest cost-per-reward
    // ratio: it is the merchant's own target times their own basket, so they
    // can check it on the back of an envelope.
    spendPerReward: m.stamps_target * basket,
    rewardsGiven: m.redemptions,
    hasBasket: m.basket_cents > 0,
  };
}

/**
 * Every problem this merchant currently has, worst first.
 *
 * A healthy merchant returns an empty array, and that is the point: the triage
 * list only shows rows with something on them.
 */
export function triage(m: MerchantHealthRow, now = Date.now()): Flag[] {
  const out: Flag[] = [];
  const add = (f: Flag) => out.push(f);
  const sinceStamp = daysSince(m.last_stamp_at, now);
  const left = trialDaysLeft(m);

  // Archived merchants are not problems to solve; they are closed accounts.
  if (m.archived_at) return [];

  // --- broken right now -----------------------------------------------------

  // The single highest-value signal in the log, and nothing surfaced it before.
  // A counter whose staff cannot sign in looks exactly like a counter that
  // stopped caring — one is a two-minute phone call, the other is a lost
  // merchant, and they need completely different responses.
  if (m.pin_failed_24h >= 3 && (sinceStamp === null || sinceStamp > 1)) {
    add({
      key: "locked-out",
      severity: "critical",
      label: "Staff locked out",
      detail: `${m.pin_failed_24h} failed PIN attempts in 24h and nothing stamped since.`,
      action: "Ring them and read out the PIN, or set a new one from their account.",
    });
  }

  if (m.messages_failed > 0) {
    add({
      key: "messages-failing",
      severity: "critical",
      label: "Messages not arriving",
      detail: `${m.messages_failed} notification${m.messages_failed === 1 ? "" : "s"} failed to deliver.`,
      action: "Check the wallet credentials — they think they are reaching customers.",
    });
  }

  // --- never got going ------------------------------------------------------

  if (m.stamps === 0 && m.days_since_signup >= 3 && m.has_owner) {
    // Distinguish "no poster on the counter" from "poster up, nobody scanning".
    // Same symptom, completely different conversation.
    const noPoster = m.poster_views === 0;
    add({
      key: "never-activated",
      severity: "critical",
      label: noPoster ? "Never set up" : "No stamps yet",
      detail: noPoster
        ? `${m.days_since_signup} days in and they have never even opened their poster.`
        : `${m.days_since_signup} days in, poster opened, still not one stamp.`,
      action: noPoster
        ? "Nothing is on their counter. Print it and take it to them."
        : "The poster is up but nobody is stamping — walk the staff through it.",
    });
  }

  // --- was working, then stopped --------------------------------------------

  // Both branches are gated on the merchant having stamped at ALL. Without that
  // guard, a merchant with no history could be reported as "slowing down" —
  // you cannot slow down from a standstill, and it would push a never-activated
  // merchant into the wrong conversation entirely.
  if (m.stamps > 0) {
    if (m.stamps_7d === 0) {
      add({
        key: "went-quiet",
        severity: "critical",
        label: "Went quiet",
        detail: `Was stamping, nothing for ${Math.floor(sinceStamp ?? 0)} days.`,
        action: "The one that predicts churn. Call before the trial runs out.",
      });
    } else if (m.stamps_prev_7d >= 5 && m.stamps_7d * 2 < m.stamps_prev_7d) {
      // Quiet and slowing are the same story at different stages, so they are
      // mutually exclusive — raising both double-counts one merchant.
      add({
        key: "slowing",
        severity: "warn",
        label: "Slowing down",
        detail: `${m.stamps_7d} stamps this week against ${m.stamps_prev_7d} last week.`,
        action: "Worth a check-in before it becomes a quiet counter.",
      });
    }
  }

  // --- the counter is fragile ----------------------------------------------

  if (m.staff_devices === 1 && m.stamps >= 20) {
    add({
      key: "one-phone",
      severity: "warn",
      label: "One phone only",
      detail: `All ${m.stamps} stamps came from a single staff phone.`,
      action: "If that person leaves or their phone dies, the programme stops.",
    });
  }

  if (m.lookup_failed_7d >= 5) {
    add({
      key: "codes-failing",
      severity: "warn",
      label: "Codes not matching",
      detail: `${m.lookup_failed_7d} typed codes matched nothing this week.`,
      action: "Usually a worn poster or staff typing the wrong thing.",
    });
  }

  // --- sign-up leaks --------------------------------------------------------

  if (m.scanned >= 10 && m.clicked / m.scanned < 0.3) {
    add({
      key: "signup-leak",
      severity: "warn",
      label: "Scans not converting",
      detail: `${m.scanned} scans, only ${m.clicked} tapped Add.`,
      action: "The poster is working and the sign-up page is losing them.",
    });
  }

  // Apple reports pass_added reliably; Google only since the issuer callback was
  // configured, so this reads low for older Android sign-ups. Held to a higher
  // bar for that reason, and the console prints the caveat.
  if (m.made >= 10 && m.landed / m.made < 0.4) {
    add({
      key: "not-landing",
      severity: "warn",
      label: "Cards not landing",
      detail: `${m.made} cards made, ${m.landed} confirmed in a wallet.`,
      action: "Check the Add sheet on a real phone — Apple-only figure, so read it with that in mind.",
    });
  }

  if (m.landed >= 5 && (m.removed + m.dropped) / m.landed > 0.3) {
    add({
      key: "churning",
      severity: "warn",
      label: "Customers deleting",
      detail: `${m.removed + m.dropped} of ${m.landed} cards left a wallet again.`,
      action: "Something about the card is not worth keeping — check the reward.",
    });
  }

  // --- the merchant is not delivering on their side -------------------------

  // Not an accounting line: these are customers who did everything asked and
  // got nothing, which makes them the likeliest of all to give up.
  if (m.unclaimed_rewards >= 3) {
    add({
      key: "rewards-owed",
      severity: "warn",
      label: `${m.unclaimed_rewards} rewards owed`,
      detail: `${m.unclaimed_rewards} customers are sitting at their target un-redeemed.`,
      action: "Staff are missing the reward banner. Those customers are about to churn.",
    });
  }

  // --- the clock ------------------------------------------------------------

  // No first stamp, no trial — there is nothing to run out. Without this gate
  // an unstarted shop would read as "trial ended 0d ago" on the day it was
  // built, which is the opposite of true.
  if (!m.first_stamp_at) {
    // Built, sent, and never opened. The one thing that stalls before any of
    // the usage flags can apply.
    if (!m.has_owner && m.days_since_signup >= 3) {
      add({
        key: "unclaimed",
        severity: "warn",
        label: "Never claimed",
        detail: `Built ${m.days_since_signup} days ago and the claim link has not been used.`,
        action: m.claim_expires && new Date(m.claim_expires).getTime() < now
          ? "Their link has expired. Issue a new one and send it again."
          : "Chase the DM — nothing can happen until they claim it.",
      });
    }
  } else if (left < 0) {
    add({
      key: "trial-expired",
      severity: "info",
      label: `Trial ended ${Math.abs(left)}d ago`,
      detail: `Signed up ${m.trial_day} days ago.`,
      action: m.stamps_7d > 0 ? "Still stamping — this is the conversion call." : "Not stamping. Decide whether to chase.",
    });
  } else if (left <= 7) {
    add({
      key: "trial-ending",
      severity: "info",
      label: `${left}d of trial left`,
      detail: `${m.stamps_7d} stamps this week, ${m.customers} customers.`,
      action: m.stamps_7d > 0 ? "Going well — make the ask now." : "Fix the usage before the clock runs out.",
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/**
 * Where this shop is in the funnel, derived rather than stored.
 *
 * Every one of these except `paid` is already a fact in the database — no
 * owner, an owner, a first stamp, an archived_at — so a status column would be
 * a second source of truth that drifts the moment one write is missed. That is
 * the failure this codebase already has scar tissue from: a stored aggregate
 * disagreeing with the log it was meant to summarise.
 *
 * `paid` is stored (`merchants.paid_at`) because nothing else implies it. There
 * is no billing here yet, so it is an operator's assertion.
 */
export type Stage = "unclaimed" | "claimed" | "active" | "paid" | "closed";

export function stageOf(m: MerchantHealthRow): Stage {
  if (m.archived_at) return "closed";
  if (m.paid_at) return "paid";
  if (m.first_stamp_at) return "active";
  // Owner presence, not claimed_at: an account made by signup or by the
  // first-owner bootstrap never used a claim link, and is not unclaimed.
  if (m.has_owner) return "claimed";
  return "unclaimed";
}

/** Sort key for the table: worst first, then the loudest, then quietest merchant. */
export function triageScore(flags: Flag[]): number {
  if (!flags.length) return 1000;
  return RANK[flags[0]!.severity] * 100 - flags.length;
}
