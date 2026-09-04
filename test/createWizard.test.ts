/**
 * Step 2 of the Create wizard, actually MOUNTED — once per kind of card.
 *
 * Everything else that tests this file greps it. Grepping cannot see the
 * failure that reaches an owner: a screen that throws while it is being built
 * renders nothing, and the wizard shows an empty step with a dead Next button.
 * That is not hypothetical — the dashboard shipped a blank page once already,
 * from a const read before its own declaration.
 *
 * It matters more now than it did, because this one screen asks three genuinely
 * different sets of questions. A stamp card, a points card and a membership
 * card each take their own branch through the same function, and two of those
 * branches are new. Grepping proves the words are in the file; this proves the
 * screen builds.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { dashboardPage } from "../src/dashboardV2.js";
import { makeHarness, type FakeEl } from "./domHarness.js";

const html = dashboardPage({ emailConfigured: true } as never);

/**
 * The wizard, lifted out whole.
 *
 * From the step list down to the campaign screen: the frame, all three steps,
 * and every helper they call that lives beside them. Everything OUTSIDE that
 * range is passed in below, which is also a useful check in itself — the list
 * of stubs is exactly the screen's dependencies, and it is short.
 */
const src = html.slice(html.indexOf("const WIZ_STEPS = ["),
                       html.indexOf("function createCampaignScreen(type)"));

/** A card as the dashboard holds it, mid-wizard: created, not yet published. */
function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c1",
    name: "Kopi Corner",
    shopName: "Kopi Corner",
    kind: "stamp",
    publishedAt: null,
    reward: "",
    rewardType: "item",
    rewardValue: 0,
    rewardPercent: 20,
    rewardCap: 0,
    stampsTarget: 0,
    stampsStart: 1,
    stampsPerVisit: 1,
    memberLabel: "Member",
    benefits: "",
    earnMode: "visit",
    earnPoints: 0,
    earnSpend: 0,
    pointsTarget: 0,
    ...overrides,
  };
}

let mount: (c: Record<string, unknown>) => { screen: FakeEl; saved: unknown[] };

beforeAll(() => {
  mount = (c) => {
    const h = makeHarness();
    const saved: unknown[] = [];
    const stubs: Record<string, unknown> = {
      ...h.globals,
      // Repeated verbatim from the page rather than stubbed: a lenient
      // stand-in would let a real escaping bug through.
      esc: (s: unknown) => String(s == null ? "" : s)
        .replace(/[&<>"]/g, (ch: string) => (
          { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>
        )[ch]!),
      info: () => "",
      S: { cards: [c], cycleDays: 14 },
      REWARD_TYPES: [{ k: "stamp", name: "Stamps", icon: "", blurb: "" }],
      EARN_MODES: [
        { k: "visit", name: "Visit", icon: "", blurb: "A flat number of points for each visit" },
        { k: "spend", name: "Spend", icon: "", blurb: "Customers earn automatically from what they pay" },
        { k: "manual", name: "Manual", icon: "", blurb: "…at the counter" },
      ],
      shopName: () => "Kopi Corner",
      navigate: () => {},
      toast: () => {},
      modal: async () => true,
      refreshCards: async () => {},
      notFoundScreen: () => h.globals.document as unknown,
      designerFor: () => (h.globals.document as { createElement(t: string): FakeEl }).createElement("div"),
      api: async (_p: string, opts: { body?: string } = {}) => {
        saved.push(opts.body ? JSON.parse(opts.body) : {});
        return { status: 200, body: {} };
      },
    };
    const names = Object.keys(stubs);
    const make = new Function(...names, src + "\nreturn createRulesScreen;")(
      ...names.map((n) => stubs[n]),
    ) as (id: string) => FakeEl;
    return { screen: make("c1"), saved };
  };
});

/** Every field this kind of card asks for, and none that belong to another. */
const at = (el: FakeEl, k: string) => el.querySelector('[data-r="' + k + '"]');

/** Type into a field the way an owner does, so the form's own state moves. */
function type(el: FakeEl, k: string, v: string): void {
  const f = at(el, k)!;
  f.value = v;
  f.fire("input");
}

/**
 * Press Next and wait for the save.
 *
 * The card name starts EMPTY on purpose — step 1 creates the card using the
 * shop's name, and a box that arrives full reads as answered — so every one of
 * these has to fill it in before Next will do anything, exactly as an owner
 * does.
 */
async function next(screen: FakeEl): Promise<void> {
  type(screen, "name", "Coffee card");
  (screen.querySelector("[data-wnext]") as FakeEl).onclick!({} as never);
  await new Promise((r) => setTimeout(r, 0));
}

describe("a stamp card", () => {
  it("builds, and asks for stamps", () => {
    const { screen } = mount(card());
    expect(at(screen, "name")).toBeTruthy();
    expect(at(screen, "shopName")).toBeTruthy();
    expect(at(screen, "perVisit")).toBeTruthy();
    expect(at(screen, "target")).toBeTruthy();
    expect(at(screen, "welcome")).toBeTruthy();
    // Nothing from the other two kinds leaks in.
    expect(at(screen, "memberLabel")).toBe(null);
    expect(at(screen, "pointsTarget")).toBe(null);
  });

  /**
   * The order the founder asked for: what a visit is worth, how many of those
   * make a reward, then the head start. Welcome stamps used to come first,
   * which put the smallest decision in front of the two that shape the card.
   */
  it("asks what a visit is worth before the head start", () => {
    const { screen } = mount(card());
    const order = screen.all().filter((e) => e.attrs["data-r"]).map((e) => e.attrs["data-r"]);
    expect(order.indexOf("perVisit")).toBeLessThan(order.indexOf("target"));
    expect(order.indexOf("target")).toBeLessThan(order.indexOf("welcome"));
  });
});

describe("a points card", () => {
  it("builds, and asks how it earns", () => {
    const { screen } = mount(card({ kind: "points" }));
    expect(screen.querySelectorAll("[data-earn]").length).toBe(3);
    expect(at(screen, "pointsTarget")).toBeTruthy();
    expect(at(screen, "welcome")).toBeTruthy();
    // A points card counts to a price, not to a number of circles.
    expect(at(screen, "target")).toBe(null);
    expect(at(screen, "perVisit")).toBe(null);
  });

  it("shows one number on visit and two on spend", () => {
    const visit = mount(card({ kind: "points", earnMode: "visit" })).screen;
    expect(at(visit, "earnPoints")).toBeTruthy();
    expect(at(visit, "earnSpend")).toBe(null);

    const spend = mount(card({ kind: "points", earnMode: "spend" })).screen;
    expect(at(spend, "earnPoints")).toBeTruthy();
    expect(at(spend, "earnSpend")).toBeTruthy();
  });

  /** Manual has no rate at all: the amount is decided at the counter. */
  it("shows no rate on manual", () => {
    const { screen } = mount(card({ kind: "points", earnMode: "manual" }));
    expect(at(screen, "earnPoints")).toBe(null);
    expect(at(screen, "earnSpend")).toBe(null);
    expect(at(screen, "pointsTarget")).toBeTruthy();
  });

  it("sends the rate and one price, and no stamp target", async () => {
    const { screen, saved } = mount(card({
      kind: "points", earnMode: "spend", publishedAt: "2026-01-01T00:00:00Z",
      rewardType: "amount", rewardValue: 5,
    }));
    type(screen, "pointsTarget", "500");
    await next(screen);
    const body = saved[0] as Record<string, unknown>;
    expect(body.earnMode).toBe("spend");
    expect(body.pointsTarget).toBe(500);
    expect(body.stampsTarget).toBe(undefined);
  });
});

describe("a membership card", () => {
  it("builds, and asks only what it can answer", () => {
    const { screen } = mount(card({ kind: "membership" }));
    expect(at(screen, "memberLabel")).toBeTruthy();
    expect(at(screen, "benefits")).toBeTruthy();
    // It counts nothing, so it has neither half of the form.
    expect(at(screen, "target")).toBe(null);
    expect(at(screen, "welcome")).toBe(null);
    expect(at(screen, "rewardType")).toBe(null);
    expect(screen.querySelector("[data-guidewrap]")).toBe(null);
  });

  /**
   * "Member" is the column's DEFAULT — what a card holds before anyone chose —
   * so it means "not answered yet", and the box offers the suggestion instead.
   */
  it("suggests VIP on a card nobody has named yet, and keeps a real answer", () => {
    expect(at(mount(card({ kind: "membership" })).screen, "memberLabel")!.attrs.value).toBe("VIP");
    expect(
      at(mount(card({ kind: "membership", memberLabel: "Regular" })).screen, "memberLabel")!.attrs.value,
    ).toBe("Regular");
  });

  /**
   * A membership card must send no reward. cardFieldsFromBody writes the reward
   * SENTENCE whenever rewardType arrives, so sending one would stamp a reward
   * onto a card with no counter to earn it on.
   */
  it("sends the perks and no reward at all", async () => {
    const { screen, saved } = mount(card({ kind: "membership", benefits: "10% off" }));
    await next(screen);
    const body = saved[0] as Record<string, unknown>;
    expect(body.memberLabel).toBe("VIP");
    expect(body.benefits).toBe("10% off");
    expect(body.rewardType).toBe(undefined);
    expect(body.stampsTarget).toBe(undefined);
  });

  /** Nothing on the back of the card is a card that promises nothing. */
  it("will not go on without perks", () => {
    const { screen } = mount(card({ kind: "membership" }));
    expect((screen.querySelector("[data-wnext]") as FakeEl).disabled).toBe(true);
  });
});
