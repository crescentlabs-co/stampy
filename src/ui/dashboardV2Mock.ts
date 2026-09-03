/**
 * Every made-up number in the dashboard, in one file.
 *
 * V2's shape is bigger than what the product can do yet: several loyalty
 * programmes, campaigns, ended programmes. Those screens are built now so the
 * whole thing can be walked through and judged before any of the machinery
 * behind them is written — and a screen built against nothing looks broken
 * rather than unfinished.
 *
 * Two rules hold this in place:
 *
 *   1. **Everything fed from here is labelled "Example" on screen.** A number
 *      an owner cannot tell apart from their own is worse than no number. The
 *      chip is rendered by `EG` below and a test checks every section that
 *      reads a MOCK_ value also renders it.
 *   2. **Every name in here starts MOCK_.** When the real thing lands, deleting
 *      this file and its one splice line takes all of it out at once, and the
 *      compiler finds every place that was leaning on it.
 *
 * Nothing here is written to a database, sent to a customer, or counted in a
 * real total. The real numbers come from /api/overview and /api/customers.
 */

export const DASHBOARD_MOCK_CSS = /* css */ `
  /* The "Example" chip. --ghost-bg and --muted on purpose: never neon, which
     marks the next action, and never one of the four semantic hues, which are
     spoken for by the customer segments. It has to read as a label, not as a
     status. */
  .egchip { display: inline-block; vertical-align: middle; margin-left: 8px;
            background: var(--ghost-bg); color: var(--muted); border-radius: 999px;
            padding: var(--s1) var(--s2); font-size: var(--t-xs); font-weight: 700;
            letter-spacing: var(--tr-caps); text-transform: uppercase; }
  h2 .egchip, h3 .egchip { position: relative; top: -2px; }
  /* A whole row that is an example, rather than a section. Quieter than the
     real rows beside it, so the eye sorts them without reading. */
  .egrow { opacity: .78; }
`;

export const MOCK_JS = /* js */ `
  /** The chip that marks anything on this page as not-your-data-yet. */
  const EG = '<span class="egchip">Example</span>';

  /**
   * Other loyalty programmes, so the multi-programme and ended-programme
   * states can be seen. A shop can only hold one programme today — the server
   * refuses a second — so these are the only way to look at either.
   */
  const MOCK_PROGRAMS = [
    { id: "eg-points", name: "Points card", kind: "points", status: "active",
      customers: 38, visits: 214, rewards: 9, avgGapDays: 11.4,
      // Days ago, not a date: a fixed date would age until "newest first" put
      // an example above a programme created this morning.
      createdDaysAgo: 40,
      reward: "RM10 off", stampsTarget: 100,
      bg: "#1f2933", fg: "#f4f6f2", label: "#9fb3c8", band: "#2d3b47",
      setup: "1 point per RM1 spent · 100 points = RM10 off" },
    { id: "eg-winter", name: "Winter stamps", kind: "stamp", status: "ended",
      customers: 61, visits: 402, rewards: 47, avgGapDays: 19.8,
      createdDaysAgo: 210,
      reward: "A free pastry", stampsTarget: 8,
      bg: "#3d2a3f", fg: "#fdf6ff", label: "#c9a7d1", band: "#513a54",
      setup: "Collect 8 stamps, get a free pastry" },
  ];

  /**
   * An example, shaped like a real card so the SAME preview draws it.
   *
   * The tiles beside it are the actual Apple and Android faces, rendered by the
   * designer; a flat placeholder next to those reads as a broken tile rather
   * than as an example. Every art version is 0 so nothing is fetched — there is
   * no /c/eg-points/art/logo.png to fetch — and the id keeps its eg- prefix, so
   * anything that reaches for a real card with it finds nothing rather than
   * somebody else's.
   */
  function mockCard(m) {
    return {
      id: m.id, name: m.name, shopName: m.name,
      reward: m.reward, stampsTarget: m.stampsTarget, stampsStart: 0,
      averageSpend: 0, currency: "RM",
      bg: m.bg, fg: m.fg, label: m.label, accent: m.label, bandColor: m.band,
      bandTexture: "flat", stampStyle: "",
      logoHasName: false,
      logoVersion: 0, bannerVersion: 0, markVersion: 0, stampIconVersion: 0, stampsVersion: 0,
      targetsInUse: [m.stampsTarget],
      winbackMessage: "", signupMessage: "",
      kind: m.kind, benefits: "", milestones: [], pointPresets: "",
      createdAt: new Date(Date.now() - m.createdDaysAgo * 86400000).toISOString(),
      endedAt: m.status === "ended" ? new Date().toISOString() : null,
      metrics: { active: m.customers, stamps: m.visits, redemptions: m.rewards,
                 avgGapDays: m.avgGapDays },
    };
  }

  /** Campaigns. None of this exists yet — there is no campaign table at all. */
  const MOCK_CAMPAIGNS = [
    { id: "eg-winback", name: "Come back for a coffee", kind: "winback", type: "Win-back",
      status: "active", targeted: 42, returned: 11, sent: "3 Aug", createdDaysAgo: 30 },
    { id: "eg-quiet", name: "Tuesday afternoons", kind: "quiet", type: "Quiet period",
      status: "ended", targeted: 88, returned: 24, sent: "12 Jul", createdDaysAgo: 52 },
    { id: "eg-progress", name: "Two stamps to go", kind: "progress", type: "Progress reminder",
      status: "active", targeted: 19, returned: 9, sent: "21 Aug", createdDaysAgo: 12 },
  ];

  // MOCK_ACCOUNT was here. The plan, the status and the trial deadline are real
  // columns now (merchants.plan, merchants.archived_at, merchants.trial_ends_at)
  // and the Shop tab reads them through /api/overview. Billing is still not
  // built — nothing is charged — but nothing on that screen is invented either.
`;
