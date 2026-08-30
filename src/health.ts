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

/**
 * How long a counter can be silent before we call it churning.
 *
 * Written in exactly one place because three things read it and they must never
 * disagree: the console's hero (shops stamping in the last N days), `stageOf`
 * (stamping vs churning) and the Churning flag below. It was 7, and 7 is a week
 * — a shop that stamps every Saturday looked identical to one that had stopped.
 *
 * It is deliberately tight. A café that closes Sunday and Monday and has a
 * quiet Tuesday WILL appear here. On a portfolio this size that is the right
 * trade; if the list starts crying wolf, this is the one line to change.
 */
export const CHURN_DAYS = 3;

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
 * Exported as DATA so the console's help is generated from the same list the
 * rules are keyed on — a definitions table written as prose in the page would
 * drift the first time a threshold moved, and a threshold you cannot look up is
 * a number you cannot trust. A test asserts every key raised below appears here.
 *
 * SIX rules, down from fourteen. The eight that went were not wrong; they were
 * answering questions the console no longer asks, and a list that fires on
 * everybody trains you to ignore it. Each of them is still reported where it
 * belongs — unclaimed and never-activated are what the Stage column SAYS;
 * one-phone, codes-failing and rewards-owed are on a shop's "Wrong right now"
 * line; signup-leak is the drop its funnel draws; and both trial rules are
 * printed in a shop's own header. Nothing was hidden, only stopped shouting.
 *
 * What survives is: two things that are actively BROKEN, and four that say the
 * loop is failing — the shop stopping, the shop slowing, cards not reaching a
 * wallet, and customers throwing them away.
 */
export const FLAG_GUIDE: { key: string; label: string; rule: string; why: string }[] = [
  { key: "locked-out", label: "Staff locked out",
    rule: "3+ failed staff PINs in 24h, and nothing stamped in the last 24h",
    why: "The counter cannot sign in. Identical to apathy in every other number, and a two-minute fix." },
  { key: "messages-failing", label: "Messages not arriving",
    rule: "Any nudge recorded as undelivered",
    why: "They think they are reaching customers and are not." },
  // NOTE: this key is `went-quiet` and its label is "Churning", while the key
  // `churning` below is labelled "Customers deleting". That is not a mix-up and
  // must not be "fixed": this one is the SHOP going silent, that one is
  // CUSTOMERS deleting the card. The keys are what FLAG_HELP, the console's
  // info dots and every test are keyed on, so they stay put; only the words a
  // human reads changed.
  { key: "went-quiet", label: "Churning",
    rule: `Has stamped before, but nothing in the last ${CHURN_DAYS} days`,
    why: "The single best predictor of churn, and the whole reason to open this page." },
  { key: "slowing", label: "Slowing down",
    rule: "5+ stamps last week, and this week is less than half of it",
    why: "Caught before it becomes a dead counter." },
  { key: "not-landing", label: "Cards not landing",
    rule: "10+ cards made, and under 40% confirmed in a wallet",
    why: "The wallet's own Add sheet is failing. Apple-only figure — Google only reports since the issuer callback was set up." },
  { key: "churning", label: "Customers deleting",
    rule: "5+ cards landed, and over 30% later removed or dropped",
    why: "'Removed' is the wallet telling us it was deleted; 'dropped' is Apple answering 410 for a device that no longer holds it." },
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
 * The date this shop's trial actually runs out.
 *
 * A stored `trial_ends_at` wins outright — it exists so ONE shop can be given
 * longer, and a derived date can never express that. Otherwise it is derived
 * exactly as before: TRIAL_DAYS from the first stamp at a real counter.
 *
 * Null when a shop has never been stamped at. That is not "no trial" — it is a
 * trial that has not STARTED, and showing a countdown to a shop that has never
 * served a customer would be counting down something they never began. The
 * console already says "never stamped" for these; the dashboard says the same.
 */
export function trialEndsAt(
  m: Pick<MerchantHealthRow, "trial_day" | "trial_ends_at" | "first_stamp_at">,
  now = Date.now(),
): Date | null {
  if (m.trial_ends_at) return new Date(m.trial_ends_at);
  if (!m.first_stamp_at) return null;
  return new Date(now + trialDaysLeft(m) * DAY);
}

/**
 * Is this shop's trial over? Only ever true once the trial has STARTED.
 *
 * A shop that has never been stamped at is not "expired", it is unstarted —
 * treating the two the same would switch features off for the shops that have
 * not managed to use the product yet, which is precisely backwards.
 */
export function trialExpired(
  m: Pick<MerchantHealthRow, "trial_day" | "trial_ends_at" | "first_stamp_at">,
  now = Date.now(),
): boolean {
  const ends = trialEndsAt(m, now);
  return ends !== null && ends.getTime() <= now;
}

/**
 * What a shop can use right now.
 *
 * Two inputs and one rule: 'pro' has everything, and 'free' has everything
 * until its trial runs out. Campaigns are the first thing behind it. Written
 * once, here, because a feature gate copied into a page is a gate the server
 * does not have — the browser is not where this may be decided.
 *
 * `campaigns` is the only gated capability today. Adding a tier means adding a
 * case here, not a column.
 */
export interface PlanAllows {
  campaigns: boolean;
}

export function planAllows(
  plan: "free" | "pro",
  m: Pick<MerchantHealthRow, "trial_day" | "trial_ends_at" | "first_stamp_at">,
  now = Date.now(),
): PlanAllows {
  const inTrial = !trialExpired(m, now);
  return { campaigns: plan === "pro" || inTrial };
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

  // --- was working, then stopped --------------------------------------------

  // Both branches are gated on the merchant having stamped at ALL. Without that
  // guard, a merchant with no history could be reported as "slowing down" —
  // you cannot slow down from a standstill, and a shop that has never started
  // is a different conversation entirely. That one has no flag any more: its
  // Stage says "Activated", which is precisely the statement that they have a
  // login and have never used it.
  if (m.stamps > 0) {
    if (sinceStamp === null || sinceStamp >= CHURN_DAYS) {
      // Off the LAST STAMP, not off a 7-day bucket. The bucket meant a shop
      // that stamped last Saturday and nothing since read as healthy all week.
      add({
        key: "went-quiet",
        severity: "critical",
        label: "Churning",
        detail: `Was stamping, nothing for ${Math.floor(sinceStamp ?? 0)} days.`,
        action: "The one that predicts churn. Ring them today.",
      });
    } else if (m.stamps_prev_7d >= 5 && m.stamps_7d * 2 < m.stamps_prev_7d) {
      // Churning and slowing are the same story at different stages, so they
      // are mutually exclusive — raising both double-counts one merchant.
      add({
        key: "slowing",
        severity: "warn",
        label: "Slowing down",
        detail: `${m.stamps_7d} stamps this week against ${m.stamps_prev_7d} last week.`,
        action: "Worth a check-in before it becomes a quiet counter.",
      });
    }
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

  // Nothing about the trial clock is raised here any more. It was two `info`
  // flags on every shop in its final week, which is a calendar, not a problem —
  // and a shop's own header already prints "day N of 30" and "trial ended Nd
  // ago", where it is read next to whether they are actually stamping.

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/**
 * Where this shop is in its life, derived rather than stored.
 *
 * Every one of these is already a fact in the database — no owner, an owner, a
 * first stamp, a last stamp, an archived_at — so a status column would be a
 * second source of truth that drifts the moment one write is missed. That is
 * the failure this codebase already has scar tissue from: a stored aggregate
 * disagreeing with the log it was meant to summarise.
 *
 * **`paid` is deliberately NOT one of these.** It used to be, ranked above
 * everything else, which meant a paying shop that had not stamped in a month
 * still read as the healthiest state on the board — the one shop whose silence
 * matters most was the one the console could not report. Paying is a separate
 * field (`plan`) shown beside the stage, because a shop can be paying AND
 * churning and that pair is the most useful thing this page can tell you.
 * (It was `paid_at`; that column is now only the date they FIRST went pro, and
 * it keeps its value through a downgrade, so reading it here would have shown
 * a shop that left as still paying.)
 *
 * "Activated" means the LOGIN EXISTS. It used to mean the first stamp, which
 * left no word at all for the state in between — claimed, able to stamp, and
 * never having done it — even though that is the single most common place for a
 * new shop to stall.
 */
export type Stage = "not-claimed" | "activated" | "stamping" | "churning" | "closed";

export function stageOf(m: MerchantHealthRow, now = Date.now()): Stage {
  if (m.archived_at) return "closed";
  // Owner presence, not claimed_at: an account made by signup or by the
  // first-owner bootstrap never used a claim link, and is not unclaimed.
  if (!m.has_owner) return "not-claimed";
  if (!m.first_stamp_at) return "activated";
  const since = daysSince(m.last_stamp_at, now);
  return since !== null && since < CHURN_DAYS ? "stamping" : "churning";
}

/** The stage as a human reads it. One place, so the table and a shop agree. */
export const STAGE_LABEL: Record<Stage, string> = {
  "not-claimed": "Not claimed",
  activated: "Activated",
  stamping: "Stamping",
  churning: "Churning",
  closed: "Archived",
};

/** Sort key for the table: worst first, then the loudest, then quietest merchant. */
export function triageScore(flags: Flag[]): number {
  if (!flags.length) return 1000;
  return RANK[flags[0]!.severity] * 100 - flags.length;
}
