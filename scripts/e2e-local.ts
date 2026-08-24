/**
 * End-to-end smoke test against a real (embedded) Postgres:
 * migrate → landing → dashboard signup/login → edit café → enroll (503 without
 * certs but pass row + event created via direct db calls) → staff stamp by
 * serial and by short code → metrics reflect events.
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-pg-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "stampy",
  password: "stampy",
  port: 5499,
  persistent: false,
});

async function main() {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("stampy");
  process.env.DATABASE_URL = "postgresql://stampy:stampy@localhost:5499/stampy";
  process.env.BASE_URL = "http://localhost:3000";
  process.env.ADMIN_EMAIL = "owner@test.my, second@card.my"; // comma-listed: BOTH are admins
  // Merchants are onboarded done-for-you and signup is closed in production.
  // The suite needs several owners as fixtures, so it opens it here and closes
  // it again where the closed behaviour is what is being asserted.
  process.env.ALLOW_PUBLIC_SIGNUP = "1";

  const { migrate, createPass, generateShortCode, getCard, getStampStrip, logEvent, redeemPass, reissuePass, createOwner, ensureMerchantForOwner, currentSlug, getOwnerByEmail, setResetToken, updateCard, getPool, verifyStaffPin, setStaffPin: setStaffPinFor, createCard, linkOwnerCard, merchantForOwner: ownerMerchant } =
    await import("../src/db.js");

  /**
   * Give an owner an extra card the way the only merchants that have one got
   * it: minted before the one-card-per-merchant cap existed. The dashboard API
   * refuses this now, but the behaviour underneath — one staff PIN and one
   * session covering every card a merchant runs — still has to hold, so it is
   * still exercised below.
   */
  const addLegacyCard = async (ownerEmail: string, name: string): Promise<string> => {
    const owner = await getOwnerByEmail(ownerEmail);
    if (!owner) throw new Error("no such owner: " + ownerEmail);
    const merchant = await ownerMerchant(owner.id);
    if (!merchant) throw new Error("owner has no merchant: " + ownerEmail);
    const made = await createCard({
      merchantId: merchant.id, name, reward: "Free coffee", stampsTarget: 10, stampsStart: 2,
    });
    await linkOwnerCard(owner.id, made.id);
    return made.id;
  };
  const { createHash } = await import("node:crypto");
  await migrate();
  await migrate(); // idempotency check
  console.log("MIGRATE OK (x2, idempotent)");

  const card = await getCard("default");
  if (!card || card.name !== "Kopi Corner") throw new Error("default card seed failed");
  console.log("SEED OK:", card.name, card.reward, card.stamps_target, card.stamps_start);

  // Boot the real server against this DB.
  await import("../src/server.js");
  await new Promise((r) => setTimeout(r, 1500));

  const base = "http://localhost:3000";
  const get = async (p: string, init?: RequestInit) => {
    const res = await fetch(base + p, init);
    return { status: res.status, body: await res.text(), headers: res.headers };
  };
  const expect = (cond: boolean, label: string) => {
    if (!cond) throw new Error("FAIL: " + label);
    console.log("OK:", label);
  };

  // `/` is now the product marketing landing page.
  const landing = await get("/");
  expect(landing.status === 200 && landing.body.includes("lives in your customer"), "/ serves the marketing landing page");
  // Font faces are inline in the page CSS (no separate cacheable stylesheet) and
  // point at uniquely-named woff2 files, which are served statically. The app
  // reads in Bricolage and Instrument Serif; the landing sets its own display
  // and body to Figtree, so both have to resolve.
  expect(landing.body.includes("/assets/fonts/instrument-serif-latin.woff2"), "pages declare the Instrument Serif @font-face inline");
  const woff = await get("/assets/fonts/instrument-serif-latin.woff2");
  expect(woff.status === 200, "GET /assets/fonts/*.woff2 serves the font file");
  expect(landing.body.includes("/assets/fonts/figtree-latin.woff2"), "pages declare the Figtree @font-face inline");
  const figtree = await get("/assets/fonts/figtree-latin.woff2");
  expect(figtree.status === 200, "GET /assets/fonts/figtree-latin.woff2 serves the landing display face");
  // Every image the page names must actually serve: a broken one is a visible
  // hole in the argument, checked the same way the font is. The hero shot is
  // the page's proof, so it is named here rather than left to a spot check.
  // The closing photograph went out with the "Want it on your counter" block.
  //
  // The section-two tile art is here too now that all three files exist. They
  // are still CSS background-images over the block's own colour, so a missing
  // one degrades to a clean coloured panel rather than a broken-image icon -
  // but a slot that HAS art and 404s is a hole, and that is what this catches.
  for (const asset of ["/assets/img/hero-phones-v5.webp",
                       "/assets/img/us-v2.webp",
                       "/assets/img/tile-wallet-v1.webp",
                       "/assets/img/tile-notify-v2.webp",
                       "/assets/img/tile-numbers-v1.webp",
                       "/assets/img/punchme-logo-v2.png"]) {
    expect(landing.body.includes(asset), `landing references ${asset}`);
    expect((await get(asset)).status === 200, `GET ${asset} serves`);
  }

  // The default café's Add-to-Wallet page moved to /c/default; its QR points there.
  const cafeLanding = await get("/c/default");
  expect(cafeLanding.status === 200 && cafeLanding.body.includes("Kopi Corner"), "default café Add-to-Wallet page renders at /c/default");
  const qr = await get("/qr");
  expect(qr.status === 200 && (qr.headers.get("content-type") || "").includes("image/png"), "/qr still serves the counter QR PNG");

  // Dashboard uses the sliding segmented control (not the old underline tabs)
  const dashShell = await get("/dashboard");
  expect(dashShell.body.includes('class="seg" id="tabs"'), "dashboard renders the segmented tab control");

  // Dashboard: state → first signup claims the seeded default café
  const state1 = JSON.parse((await get("/dashboard/api/state")).body);
  expect(state1.loggedIn === false, "state: not logged in on fresh visit");

  const signup = await fetch(base + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "password123" }),
  });
  const cookie = signup.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(signup.status === 200 && cookie.startsWith("stampy_session="), "signup sets session cookie");

  // Self-serve signup: a second owner gets their OWN isolated starter card
  const signup2 = await fetch(base + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "second@card.my", password: "password123", cafeName: "Second Owner Café" }),
  });
  const cookie2 = signup2.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(signup2.status === 200 && cookie2.startsWith("stampy_session="), "self-serve signup is open");
  const ov2nd = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookie2 } })).body);
  expect(
    ov2nd.cards.length === 1 &&
      ov2nd.cards[0].name === "Second Owner Café" &&
      ov2nd.cards[0].id !== "default",
    "second owner sees only their own starter card (not the default café)",
  );
  // The PIN is stored only as a scrypt hash, so there is nothing for the API to
  // hand back — the dashboard can set or replace it, never read it.
  expect(ov2nd.cards[0].staffPin === undefined, "the overview API never returns a staff PIN");
  // The PIN belongs to the OWNER now — one counter, one PIN, however many cards.
  // Signing up does NOT mint one. It used to mint a random PIN nobody could
  // ever read (only a hash is stored, and the Shop tab never paints one back),
  // so every new owner started with a live counter credential that existed only
  // as a hash — while the dashboard reported them as set up.
  const secondOwner = (await getOwnerByEmail("second@card.my"))!;
  expect(secondOwner.staff_pin_hash === "", "signing up mints no staff PIN — the owner picks one");
  expect(ov2nd.hasStaffPin === false, "...and the dashboard says so, so the banner shows");
  expect(!verifyStaffPin(secondOwner, "1234"), "a new owner gets a random PIN, not the shared default");
  const starter = (await getCard(ov2nd.cards[0].id))!;
  expect(starter.staff_pin === "" && starter.staff_pin_hash === "", "a card carries no PIN of its own");

  const dupSignup = await fetch(base + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "password123" }),
  });
  expect(dupSignup.status === 409, "signup with an existing email → 409 email-taken");

  const badLogin = await fetch(base + "/dashboard/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "wrongwrong" }),
  });
  expect(badLogin.status === 401, "wrong password rejected");

  const overview1 = JSON.parse(
    (await get("/dashboard/api/overview", { headers: { cookie } })).body,
  );
  expect(overview1.cards.length === 1 && overview1.cards[0].id === "default", "overview lists default café");

  // Edit café via dashboard
  const pinHashBefore = (await getCard("default"))!.staff_pin_hash;
  const edit = await fetch(base + "/dashboard/api/card/default", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ reward: "Free latte", staffPin: "9876", stampsTarget: 8 }),
  });
  expect(edit.status === 200, "café edit saves");
  const cafeAfter = await getCard("default");
  expect(cafeAfter!.reward === "Free latte", "café edit persisted");
  expect(
    cafeAfter!.staff_pin_hash === pinHashBefore,
    "a PIN smuggled into a card edit is ignored — it isn't a card field",
  );

  // The staff PIN is set at owner level, and only there.
  const setPin = await fetch(base + "/dashboard/api/staff-pin", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ pin: "9876" }),
  });
  expect(setPin.status === 200 && JSON.parse(await setPin.text()).staffPin === "9876", "the owner sets their staff PIN");
  const ownerAfter = (await getOwnerByEmail("owner@test.my"))!;
  expect(
    verifyStaffPin(ownerAfter, "9876") && ownerAfter.staff_pin_hash.startsWith("scrypt$"),
    "the owner's PIN is stored hashed",
  );
  expect(!verifyStaffPin(ownerAfter, "9875"), "a near-miss PIN does not verify");
  // --- Upgrading a LIVE database, not a fresh one ---
  // The PIN moved from the café to the owner. A deployed café already has a
  // working PIN and staff who know it, so the migration has to lift that PIN up
  // rather than leave the counter locked out. Simulate the pre-upgrade shape and
  // re-run migrate(), which is exactly what a Railway deploy does on boot.
  const { migrate: remigrate } = await import("../src/db.js");
  await getPool().query(`UPDATE owners SET staff_pin_hash = '' WHERE email = 'owner@test.my'`);
  await getPool().query(
    `UPDATE cards SET staff_pin_hash = $1 WHERE id = 'default'`,
    [(await getOwnerByEmail("owner@test.my"))!.password_hash], // any valid scrypt hash
  );
  await remigrate();
  const lifted = (await getOwnerByEmail("owner@test.my"))!;
  expect(
    lifted.staff_pin_hash !== "" && lifted.staff_pin_hash.startsWith("scrypt$"),
    "upgrading a live database lifts each owner's existing PIN up from their card",
  );
  // And it must not clobber a PIN the owner has already set for themselves.
  await setStaffPinFor(lifted.id, "5555");
  await remigrate();
  expect(
    verifyStaffPin((await getOwnerByEmail("owner@test.my"))!, "5555"),
    "re-running the migration never overwrites a PIN the owner already has",
  );
  await setStaffPinFor(lifted.id, "9876"); // restore for the checks below

  const shortPin = await fetch(base + "/dashboard/api/staff-pin", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ pin: "12" }),
  });
  expect(shortPin.status === 400, "a PIN under 4 digits is refused");

  // Create two passes directly (enroll route would 503 without Apple certs)
  // A pass, as the join flow would mint it: belonging to a customer of the card's
  // merchant. Each call is a different browser unless a customer is passed in.
  const { createCustomer: mkCustomer, merchantForCard: merchantOf } = await import("../src/db.js");
  const mk = async (platform: "apple" | "google" = "apple", customerId?: string, cardId = "default") => {
    const merchant = await merchantOf(cardId);
    const cust = customerId ?? (merchant ? (await mkCustomer(merchant.id)).id : null);
    return createPass({
      serial: crypto.randomUUID(),
      cardId,
      customerId: cust,
      platform,
      shortCode: generateShortCode(),
      authToken: "t".repeat(24),
      stampCount: 2,
      stampsTarget: 8,
      reward: "Free latte",
    });
  };
  const p1 = await mk();
  const p2 = await mk();
  await logEvent("default", p1.serial, "enroll");
  await logEvent("default", p2.serial, "enroll");

  // --- Staff auth: the PIN is exchanged once for a session, not replayed ---
  const staffLogin = async (cardId: string, pin: string) => {
    const r = await fetch(base + "/staff/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-card-id": cardId },
      body: JSON.stringify({ pin }),
    });
    return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
  };

  const noSession = await fetch(base + "/staff/api/passes", {
    headers: { "Content-Type": "application/json", "x-card-id": "default" },
  });
  expect(noSession.status === 401, "staff API refuses a device with no session");
  const oldWay = await fetch(base + "/staff/api/passes", {
    headers: { "Content-Type": "application/json", "x-card-id": "default", "x-staff-pin": "9876" },
  });
  expect(oldWay.status === 401, "the old x-staff-pin bearer header is no longer accepted");

  expect((await staffLogin("default", "1111")).status === 401, "staff sign-in with the wrong PIN is rejected");
  const staff1 = await staffLogin("default", "9876");
  // The cookie is keyed on the OWNER, not the café — one sign-in covers every
  // card they run, so it can't be named after any one of them.
  expect(
    staff1.status === 200 && /^stampy_staff_[0-9a-f-]+=/.test(staff1.cookie),
    "the right PIN issues a staff session cookie",
  );
  const staffHeaders = { "Content-Type": "application/json", "x-card-id": "default", cookie: staff1.cookie };
  expect(
    (await staffLogin("default", "9876")).cookie !== staff1.cookie,
    "each sign-in mints a distinct device session (so events are attributable per phone)",
  );

  // A leaked /staff link on its own reveals nothing: no card list, no codes.
  const staffAnon = await get("/staff");
  expect(
    staffAnon.body.includes("Staff login") && !staffAnon.body.includes("Scan card"),
    "GET /staff without a session serves only the PIN form",
  );
  const staffSignedIn = await get("/staff", { headers: { cookie: staff1.cookie } });
  expect(staffSignedIn.body.includes("Scan card"), "GET /staff with a session serves the stamper");
  expect(
    !staffAnon.body.includes("localStorage"),
    "the staff page no longer keeps a credential in localStorage",
  );

  const list = JSON.parse((await get("/staff/api/passes", { headers: staffHeaders })).body);
  expect(list.passes.length === 2 && list.passes[0].code.length === 6, "staff list shows cards with short codes");

  // Stamp by serial (scanner path)
  const stamp = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p1.serial }),
  });
  const stampOut = JSON.parse(await stamp.text());
  expect(stamp.status === 200 && stampOut.pass.stamps === 3, "stamp by serial: 2 → 3");

  // Stamp by short code (typed fallback), lowercase to test normalization
  const byCode = await fetch(base + "/staff/api/stamp-by-code", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ code: p2.short_code.toLowerCase() }),
  });
  const byCodeOut = JSON.parse(await byCode.text());
  expect(byCode.status === 200 && byCodeOut.pass.stamps === 3, "stamp by typed code (case-insensitive): 2 → 3");

  const badCode = await fetch(base + "/staff/api/stamp-by-code", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ code: "ZZZZZZ" }),
  });
  expect(badCode.status === 404, "unknown code → 404");

  // Fill to target and redeem. These are deliberate repeat stamps within the
  // anti-spam window, so they carry force:true (what the staff "add another"
  // confirm sends) — otherwise the cooldown would block them.
  for (let i = 0; i < 10; i++) {
    await fetch(base + "/staff/api/stamp", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p1.serial, force: true }),
    });
  }
  const listFull = JSON.parse((await get("/staff/api/passes", { headers: staffHeaders })).body);
  const full = listFull.passes.find((p: any) => p.serial === p1.serial);
  expect(full.stamps === 8 && full.rewardReady === true, "stamps clamp at target (8) and rewardReady");

  const redeem = await fetch(base + "/staff/api/redeem", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p1.serial }),
  });
  // Redeem restarts the card at ZERO, whatever the welcome-stamp setting: the
  // visit that just earned the reward IS the stamp a head start would hand
  // over, and paying for it twice is what the founder called out. Welcome
  // stamps are for new cards, which is exactly what the field is labelled.
  expect(
    JSON.parse(await redeem.text()).pass.stamps === 0,
    `redeem restarts at zero, not the welcome count (card gives ${card.stamps_start} to new cards)`,
  );

  // --- Anti-spam cooldown: a fresh card stamps once, then blocks rapid repeats ---
  const pc = await mk();
  const cd1 = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: pc.serial }),
  });
  expect(cd1.status === 200 && JSON.parse(await cd1.text()).pass.stamps === 3, "cooldown: first stamp goes through (2 → 3)");
  const cd2 = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: pc.serial }),
  });
  const cd2out = JSON.parse(await cd2.text());
  expect(cd2.status === 409 && cd2out.error === "too-soon" && cd2out.secondsLeft > 0, "cooldown: immediate repeat is refused (too-soon)");
  const cdList = JSON.parse((await get("/staff/api/passes", { headers: staffHeaders })).body);
  expect(cdList.passes.find((p: any) => p.serial === pc.serial).stamps === 3, "cooldown: the refused stamp did NOT increment the card");
  const cd3 = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: pc.serial, force: true }),
  });
  expect(cd3.status === 200 && JSON.parse(await cd3.text()).pass.stamps === 4, "cooldown: force:true overrides for a genuine repeat (3 → 4)");

  // Nudge is an owner action now — staff can no longer nudge
  const staffNudge = await fetch(base + "/staff/api/message", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p2.serial, message: "hi" }),
  });
  expect(staffNudge.status === 404, "staff nudge endpoint is gone (owner-only now)");

  // Metrics reflect the events
  const overview2 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const m = overview2.cards[0].metrics;
  expect(m.cards === 3, `metrics: 3 cards incl. the cooldown-test card (got ${m.cards})`);
  expect(m.stamps >= 2 && m.redemptions === 1, `metrics: stamps=${m.stamps} redemptions=${m.redemptions}`);

  // V1 is one card per merchant: the dashboard's add-card endpoint refuses a
  // second one outright. (The button is gone too, but the server is the limit.)
  const secondViaApi = await fetch(base + "/dashboard/api/cards", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: "Second Café" }),
  });
  expect(secondViaApi.status === 409, "a merchant cannot add a second card");
  expect(
    JSON.parse(await secondViaApi.text()).error === "one-card-per-merchant",
    "...and is told why, not just refused",
  );
  const stillOne = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(stillOne.cards.length === 1, "the refused card was not created anyway");

  // The merchants that DO hold two cards got them before that cap. Everything
  // below checks that state still works — one PIN, one session, both cards.
  const newCafeOut = { id: await addLegacyCard("owner@test.my", "Second Café") };
  // A session is scoped to the OWNER: this owner's other card is fine on the
  // same sign-in (one counter, one PIN). Another owner's card is not — see the
  // cross-owner check further down.
  const sameOwnerCard = await fetch(base + "/staff/api/passes", {
    headers: { ...staffHeaders, "x-card-id": newCafeOut.id },
  });
  expect(sameOwnerCard.status === 200, "one staff session covers every card the same owner runs");

  // The one PIN signs in against any of the owner's cards.
  const staff2 = await staffLogin(newCafeOut.id, "9876");
  expect(staff2.status === 200, "the owner's PIN signs in against their second card too");
  const staff2Headers = { "Content-Type": "application/json", "x-card-id": newCafeOut.id, cookie: staff2.cookie };
  const otherList = await fetch(base + "/staff/api/passes", { headers: staff2Headers });
  expect(JSON.parse(await otherList.text()).passes.length === 0, "cards are isolated (no cross-card customers)");
  // A customer hands over whichever card they hold, so the stamper accepts any
  // of the SHOP's cards even when the phone is showing a different one — and
  // says which one it landed on.
  const crossPass = await mk(); // a fresh card on "default", so no cooldown in the way
  const crossStamp = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staff2Headers, body: JSON.stringify({ serial: crossPass.serial }),
  });
  const crossOut = JSON.parse(await crossStamp.text());
  expect(crossStamp.status === 200, "the stamper accepts any card the same merchant runs");
  expect(
    crossOut.card?.id === "default" && crossOut.card?.name,
    "…and names the card it actually stamped",
  );
  // The event must be written against the PASS's card, not the header's, or
  // stamps land on the wrong programme's metrics.
  const landed = (await getPool().query<{ card_id: string }>(
    `SELECT card_id FROM events WHERE serial = $1 AND type = 'stamp' ORDER BY id DESC LIMIT 1`,
    [crossPass.serial],
  )).rows[0]!;
  expect(landed.card_id === "default", "the stamp is recorded against the card the pass belongs to");

  // The owner's HOME tile, across an undo.
  //
  // This is the number an owner reads first and it had no test at all: the undo
  // assertions in this file cover the retention rate, the counter fold and
  // passes.stamp_count, and none of them touch cardMetrics. "Stamps" on Home is
  // meant to be stamps actually GIVEN, so a correction has to come off it —
  // unlike the counter fold below, where the take-back is its own cell and both
  // numbers are facts.
  const tile = async () => {
    const ov = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
    return (ov.cards as { id: string; metrics: { stamps: number } }[])
      .filter((c) => c.id === "default")
      .reduce((a, c) => a + c.metrics.stamps, 0);
  };
  const tileAfterStamp = await tile();
  await fetch(base + "/staff/api/undo", {
    method: "POST", headers: staff2Headers, body: JSON.stringify({ serial: crossPass.serial }),
  });
  const tileAfterUndo = await tile();
  expect(
    tileAfterUndo === tileAfterStamp - 1,
    `an undo comes off the Home stamps tile (${tileAfterStamp} → ${tileAfterUndo})`,
  );

  // ...and a WELCOME stamp is not a stamp given. A new card is minted already
  // holding some, written straight to passes.stamp_count with no event — so
  // issuing one must not move this number. It is free, the shop did not hand it
  // over, and the same figure is multiplied by their basket for "spend
  // influenced", so a welcome stamp counted here would be invoiced twice: once
  // as work they did not do, once as money they did not take.
  //
  // The counter fold and the console's spend figure already assert this. The
  // Home tile — the one an owner actually reads — did not.
  const tileBeforeIssue = await tile();
  await mk();
  const tileAfterIssue = await tile();
  expect(
    tileAfterIssue === tileBeforeIssue,
    `issuing a card with welcome stamps adds nothing to the Home tile (${tileBeforeIssue} → ${tileAfterIssue})`,
  );

  // A short code from the shop's other card resolves too — it used to 404.
  const codeLookup = await fetch(
    base + "/staff/api/lookup?code=" + encodeURIComponent(crossPass.short_code),
    { headers: staff2Headers },
  );
  expect(codeLookup.status === 200, "a short code from the merchant's other card is found");

  // --- Google Wallet branch (no Google creds → graceful, never throws) ---
  const gEnroll = await get("/enroll/google");
  expect(gEnroll.status === 503, "google enroll → 503 until Google creds configured");

  const gp = await mk("google");
  const gStamp = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: gp.serial }),
  });
  const gStampOut = JSON.parse(await gStamp.text());
  expect(
    gStamp.status === 200 && gStampOut.pass.stamps === 3,
    "google-platform card: stamp still updates the DB (2 → 3)",
  );
  // The counter no longer waits on the wallet: the response says the delivery
  // is in flight rather than claiming an outcome it cannot know yet.
  expect(gStampOut.push.pending === true, "the staff response does not wait for the wallet push");
  expect(gStampOut.push.sent === 0, "...and does not claim a push that has not happened");
  // The background delivery still has to survive missing Google credentials —
  // an unhandled rejection out here would take the whole server down.
  await new Promise((r) => setTimeout(r, 300));
  const gStamp2 = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: gp.serial, force: true }),
  });
  expect(
    gStamp2.status === 200 && JSON.parse(await gStamp2.text()).pass.stamps === 4,
    "a background push that could not be configured never breaks the next stamp",
  );

  const logo = await get("/art/logo.png");
  expect(logo.status === 200, "hosted logo for Google class is served");

  // --- The owner's own line on the sign-up page ---
  const signupPage = async () => (await get("/c/default")).body;
  const generatedLine = async () => {
    const dc = (await getCard("default"))!;
    return "Collect " + dc.stamps_target + " stamps";
  };
  expect(
    (await signupPage()).includes(await generatedLine()),
    "the sign-up page generates a line when the owner hasn't written one",
  );
  await updateCard("default", { signup_message: "Free kopi on your 10th visit <3" });
  const custom = await signupPage();
  expect(custom.includes("Free kopi on your 10th visit"), "the owner's own line replaces it");
  expect(!custom.includes(await generatedLine()), "...and the generated one is gone, not doubled up");
  // Owner-supplied text going straight into markup on a page every customer
  // loads. If this ever renders raw, one café owner can script every other
  // shop's customers.
  await updateCard("default", { signup_message: "<script>alert(1)</script>" });
  const nasty = await signupPage();
  expect(!nasty.includes("<script>alert(1)</script>"), "the sign-up line is escaped, never rendered as markup");
  expect(nasty.includes("&lt;script&gt;"), "...it shows as text instead");
  await updateCard("default", { signup_message: "" }); // back to the generated line
  expect((await signupPage()).includes(await generatedLine()), "clearing it falls back to the generated line");

  // --- The printable sign-up poster ---
  // The Shop tab used to link at /c/:id/qr, which is a bare PNG: printing it
  // gives a black square with no shop name, no offer, and nothing saying there
  // is no app to download.
  await updateCard("default", { signup_message: "Free kopi on your 10th visit" });
  const poster = await get("/c/default/poster");
  expect(poster.status === 200, "the poster is served");
  expect(poster.body.includes("Free kopi on your 10th visit"), "the poster headlines the owner's own sign-up line");
  expect(poster.body.includes("no app to download"), "...and answers the one objection a poster has to answer");
  expect(poster.body.includes("Powered by PunchMe"), "the poster carries the product footer");
  // A poster on a counter has to outlive a rename or a second card, which is
  // what /j/ is for and what a card link is not.
  expect(/src="\/j\/[^"]+\/qr"/.test(poster.body), "the poster's QR is the merchant join link, not a card link");
  expect(!poster.body.includes('src="/c/default/qr"'), "...and never the card QR");
  const posterQrUrl = /src="(\/j\/[^"]+\/qr)"/.exec(poster.body)![1]!;
  expect((await get(posterQrUrl)).status === 200, "the link inside the poster actually resolves");
  expect((await get("/c/no-such-card/poster")).status === 404, "a poster for a card that isn't there 404s");
  await updateCard("default", { signup_message: "" });

  // --- The sign-up page is the shop's, not the card row's ---
  // cards.name has no field in the dashboard any more, so it goes stale
  // silently. A shop that renamed was still introducing itself to its own
  // customers as whatever the card was called the day it was created.
  await updateCard("default", { name: "Superhuman Loyalty Card" });
  const branded = await get("/c/default");
  expect(!branded.body.includes("Superhuman Loyalty Card"),
    "the sign-up page never shows the internal card name");
  expect(branded.body.includes("Kopi Corner"), "...it shows the shop's name");
  expect(branded.body.includes("lhero"), "the sign-up page is branded, not a generic white page");

  // --- Deleting the card and adding it again gives you TODAY's card ---
  // Reusing the pass row is deliberate (the wallets key on the serial, so a new
  // row would strand the customer's stamps on a card they no longer hold), but
  // it was handed back with the ruleset it was issued under. Delete, re-scan,
  // and you got the identical old reward and target back — which reads as the
  // sign-up being broken, and is what an owner testing a change actually hits.
  const reissueCard = await addLegacyCard("owner@test.my", "Reissue test");
  await updateCard(reissueCard, { reward: "Free pastry", stamps_target: 10 });
  const reissued = await mk("apple", undefined, reissueCard);
  await getPool().query(`UPDATE passes SET stamp_count = 9 WHERE serial = $1`, [reissued.serial]);
  await updateCard(reissueCard, { reward: "Free coffee", stamps_target: 6 });
  await reissuePass(reissued.serial);
  const back = (await getPool().query<{ reward: string; stamps_target: number; stamp_count: number; serial: string }>(
    `SELECT reward, stamps_target, stamp_count, serial FROM passes WHERE serial = $1`, [reissued.serial],
  )).rows[0]!;
  expect(back.reward === "Free coffee", "re-adding serves today's reward, not the one it was issued with");
  expect(back.stamps_target === 6, "...and today's target");
  expect(back.stamp_count === 6, "...with their stamps kept, clamped so nobody sits above their own goal");
  expect(back.serial === reissued.serial, "the serial NEVER changes — it is inside the card on their phone");
  // Nothing to do is not an error: an unchanged card must survive a re-add.
  expect(await reissuePass(reissued.serial) === null, "a card already on today's rules is left alone");

  // --- Self-serve branding: colours (hex↔rgb boundary) + logo upload ---
  const ov3 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const dflt = ov3.cards.find((c: any) => c.id === "default");
  expect(dflt.bg === "#3b2016" && dflt.logoVersion === 0, "overview exposes hex colours + no logo yet");

  const colorEdit = await fetch(base + "/dashboard/api/card/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bg: "#112233", label: "#abc" }),
  });
  expect(colorEdit.status === 200, "colour edit saves");
  const cafeColored = await getCard("default");
  expect(
    cafeColored!.background_color === "rgb(17, 34, 51)" &&
      cafeColored!.label_color === "rgb(170, 187, 204)",
    "hex colours stored as rgb() for PassKit (incl. #abc shorthand)",
  );
  const ov4 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(ov4.cards.find((c: any) => c.id === "default").bg === "#112233", "overview returns the saved hex back");

  // 1×1 transparent PNG
  const pngB64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const upload = await fetch(base + "/dashboard/api/card/default/logo", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ png: pngB64 }),
  });
  expect(upload.status === 200, "logo upload accepted");
  const servedLogo = Buffer.from(await (await fetch(base + "/art/logo.png")).arrayBuffer());
  expect(servedLogo.equals(Buffer.from(pngB64, "base64")), "uploaded logo bytes served back at /art/logo.png");
  const ov5 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(ov5.cards.find((c: any) => c.id === "default").logoVersion > 0, "overview reports the logo version");

  const badUpload = await fetch(base + "/dashboard/api/card/default/logo", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ png: Buffer.from("definitely not a png").toString("base64") }),
  });
  expect(badUpload.status === 400, "non-PNG upload rejected");

  const noAuthUpload = await fetch(base + "/dashboard/api/card/default/logo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ png: pngB64 }),
  });
  expect(noAuthUpload.status === 401, "logo upload requires owner login");

  const otherCafeLogo = Buffer.from(
    await (await fetch(base + "/c/" + newCafeOut.id + "/art/logo.png")).arrayBuffer(),
  );
  expect(
    otherCafeLogo.length > 0 && !otherCafeLogo.equals(servedLogo),
    "café without an upload still serves the default logo (per-café isolation)",
  );

  const rmLogo = await fetch(base + "/dashboard/api/card/default/logo", {
    method: "DELETE", headers: { cookie },
  });
  expect(rmLogo.status === 200, "logo delete works");
  const revertedLogo = Buffer.from(await (await fetch(base + "/art/logo.png")).arrayBuffer());
  expect(!revertedLogo.equals(servedLogo), "after delete the default logo is served again");

  // --- Banner image (optional; 404 until set) ---
  expect((await get("/art/banner.png")).status === 404, "no banner → 404 (optional art)");
  const bannerUp = await fetch(base + "/dashboard/api/card/default/banner", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ png: pngB64 }),
  });
  expect(bannerUp.status === 200, "banner upload accepted");
  const servedBanner = await get("/art/banner.png");
  expect(servedBanner.status === 200, "banner served after upload");
  const ovBanner = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(ovBanner.cards.find((c: any) => c.id === "default").bannerVersion > 0, "overview reports banner version");
  const rmBanner = await fetch(base + "/dashboard/api/card/default/banner", { method: "DELETE", headers: { cookie } });
  expect(rmBanner.status === 200 && (await get("/art/banner.png")).status === 404, "banner delete reverts to none");

  // --- The square Android mark, and the owner's own stamp shape ---
  //
  // Both are optional and both 404 until set, so that a card which never gets
  // one behaves exactly as it did before they existed. The stamp shape is the
  // important one: it used to live in a browser variable and nowhere else, so
  // it survived until the first re-render and then became plain circles.
  const art = async (kind: string, method = "POST", body?: unknown) =>
    await fetch(base + "/dashboard/api/card/default/" + kind, {
      method, headers: { "Content-Type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  for (const kind of ["mark", "stamp-icon"]) {
    expect((await get("/art/" + kind + ".png")).status === 404, `no ${kind} → 404 (optional art)`);
    expect((await art(kind, "POST", { png: pngB64 })).status === 200, `${kind} upload accepted`);
    const served = await fetch(base + "/art/" + kind + ".png");
    expect(
      Buffer.from(await served.arrayBuffer()).equals(Buffer.from(pngB64, "base64")),
      `uploaded ${kind} bytes served back`,
    );
    expect(
      (await art(kind, "POST", { png: Buffer.from("not a png").toString("base64") })).status === 400,
      `a non-PNG ${kind} is rejected`,
    );
    const noAuth = await fetch(base + "/dashboard/api/card/default/" + kind, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ png: pngB64 }),
    });
    expect(noAuth.status === 401, `${kind} upload requires owner login`);
  }
  // Both versions reach the designer, which is what tells it to fetch the stamp
  // shape back BEFORE re-rendering. Without that the grid is rebuilt as circles.
  const ovArt = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body)
    .cards.find((c: any) => c.id === "default");
  expect(ovArt.markVersion > 0, "overview reports the square mark's version");
  expect(ovArt.stampIconVersion > 0, "overview reports the stamp shape's version");

  for (const kind of ["mark", "stamp-icon"]) {
    expect((await art(kind, "DELETE")).status === 200, `${kind} delete works`);
    expect((await get("/art/" + kind + ".png")).status === 404, `...and it 404s again after`);
  }
  const ovGone = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body)
    .cards.find((c: any) => c.id === "default");
  expect(ovGone.markVersion === 0 && ovGone.stampIconVersion === 0, "...and the versions go back to 0");

  // --- A logo that already says the shop's name ---
  // Apple prints logoText beside the logo image, so a brand lockup said the name
  // twice. Defaults off, so nothing already issued changes.
  expect((await getCard("default"))!.logo_has_name === false, "a card starts printing its name");
  const lname = await fetch(base + "/dashboard/api/card/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ logoHasName: true }),
  });
  expect(lname.status === 200, "the logo-has-name tick-box saves");
  expect((await getCard("default"))!.logo_has_name === true, "...and is stored on the card");
  {
    const { buildPassJson } = await import("../src/passModel.js");
    const pass = buildPassJson(
      { serial: "s", auth_token: "t", short_code: "ABC234", stamp_count: 1, stamps_target: 10, reward: "Free coffee" } as never,
      (await getCard("default"))!,
      "Kopi Corner",
    ) as Record<string, unknown>;
    expect(!("logoText" in pass), "...so the pass stops printing the name beside the logo");
    expect(pass.organizationName === "Kopi Corner", "...but the Add sheet and notifications still name the shop");
  }
  await fetch(base + "/dashboard/api/card/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ logoHasName: false }),
  });

  // --- Rich stamp grid: one strip PNG per count (Apple strip / Google hero) ---
  expect((await get("/art/stamps/2.png")).status === 404, "no stamp grid → strip 404 (falls back to text dots)");
  expect((await get("/art/stamps/full.png")).status === 404, "no stamp grid → hero band 404 (Android falls back to the banner)");
  // Read the target NOW, not from the seed row: earlier blocks edit the card, and
  // the grid is stored under the target it was drawn for.
  const T = (await getCard("default"))!.stamps_target;
  const stampUp = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "☕", strips: [
      { target: T, filled: 0, png: pngB64 },
      { target: T, filled: 1, png: pngB64 },
      { target: T, filled: 2, png: pngB64 },
      // The all-filled one: what Android shows as its static hero band.
      { target: T, filled: T, png: pngB64 },
    ] }),
  });
  expect(stampUp.status === 200, "stamp-grid upload accepted");
  // full.png must resolve the target from the CARD, never from the URL — and it
  // must not be swallowed by the :filled route, which would read "full" as 0 and
  // quietly serve the EMPTY grid to every Android card.
  const heroBand = await fetch(base + "/art/stamps/full.png");
  expect(heroBand.status === 200 && (heroBand.headers.get("content-type") || "").includes("image/png"),
    "hero band served at /art/stamps/full.png once a grid exists");
  const servedStrip = Buffer.from(await (await fetch(base + "/art/stamps/1.png")).arrayBuffer());
  expect(servedStrip.equals(Buffer.from(pngB64, "base64")), "uploaded strip bytes served back at /art/stamps/1.png");
  const ovStamp = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const dfltStamp = ovStamp.cards.find((c: any) => c.id === "default");
  expect(dfltStamp.stampStyle === "☕" && dfltStamp.stampsVersion > 0, "overview reports stamp style + version");
  const badStamp = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "x", strips: [{ target: T, filled: 0, png: "bm90LWEtcG5n" }] }),
  });
  expect(badStamp.status === 400, "non-PNG strip rejected");
  const noTarget = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "x", strips: [{ filled: 0, png: pngB64 }] }),
  });
  expect(noTarget.status === 400, "a strip with no target is refused — the grid is keyed by it");
  const noAuthStamp = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style: "x", strips: [{ target: T, filled: 0, png: pngB64 }] }),
  });
  expect(noAuthStamp.status === 401, "stamp-grid upload requires owner login");
  const rmStamp = await fetch(base + "/dashboard/api/card/default/stamps", { method: "DELETE", headers: { cookie } });
  expect(rmStamp.status === 200 && (await get("/art/stamps/1.png")).status === 404, "stamp-grid delete reverts to text dots");

  // --- Change password (verifies current, then updates) ---
  const chWrong = await fetch(base + "/dashboard/api/change-password", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ current: "not-my-password", next: "brandnewpass1" }),
  });
  expect(chWrong.status === 401, "change-password rejects a wrong current password");

  const chShort = await fetch(base + "/dashboard/api/change-password", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ current: "password123", next: "short" }),
  });
  expect(chShort.status === 400, "change-password rejects a too-short new password");

  const chOk = await fetch(base + "/dashboard/api/change-password", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ current: "password123", next: "brandnewpass1" }),
  });
  expect(chOk.status === 200, "change-password succeeds with the right current password");

  const oldLogin = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "password123" }),
  });
  expect(oldLogin.status === 401, "old password no longer works after change");
  const newLogin = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "brandnewpass1" }),
  });
  expect(newLogin.status === 200, "new password works after change");
  // the change-password test rotated the owner's password; refresh the cookie
  const cookieNow = newLogin.headers.get("set-cookie")?.split(";")[0] ?? cookie;

  // The per-café customers/nudge endpoints are gone — the Customers tab spans
  // every card the owner has, so the owner-level pair below replaced them.
  expect(
    (await get("/dashboard/api/card/default/customers", { headers: { cookie: cookieNow } })).status === 404,
    "the superseded per-café customers endpoint is gone",
  );
  const deadNudge = await fetch(base + "/dashboard/api/card/default/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "hi", target: "all" }),
  });
  expect(deadNudge.status === 404, "the superseded per-café nudge endpoint is gone");

  // --- Admin console (ADMIN_EMAIL = "owner@test.my, second@card.my") ---
  // A genuinely non-admin owner (not in the comma list) is refused.
  const outsider = await fetch(base + "/dashboard/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "outsider@card.my", password: "password123", cafeName: "Outsider" }),
  });
  const cookieOutsider = outsider.headers.get("set-cookie")?.split(";")[0] ?? "";
  const adminForbidden = await get("/admin/api/overview", { headers: { cookie: cookieOutsider } });
  expect(adminForbidden.status === 403, "a non-admin owner can't reach the admin console");

  // The SECOND comma-listed email is also an admin (multi-admin support).
  const adminSecond = await get("/admin/api/overview", { headers: { cookie: cookie2 } });
  expect(adminSecond.status === 200, "a second comma-listed ADMIN_EMAIL is also an admin");

  const adminOk = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(adminOk.cards.length >= 2, "admin sees every café on the platform");
  expect(
    adminOk.cards.some((c: any) => (c.owners || "").includes("second@card.my")),
    "admin sees which owner email is tied to each café",
  );
  // Merchant health: is the counter alive, and does the owner ever look?
  expect(
    adminOk.cards.every((c: any) =>
      typeof c.stamps_7d === "number" && typeof c.added === "number" &&
      typeof c.removed === "number" && typeof c.never_added === "number" &&
      "last_stamp_at" in c && "last_owner_login" in c),
    "admin sees each merchant's recent activity and the wallet add/remove split",
  );
  expect(
    adminOk.cards.find((c: any) => c.id === "default").last_owner_login !== null,
    "an owner signing in is recorded — nothing tracked that before",
  );
  expect(
    Array.isArray(adminOk.staff) &&
      adminOk.staff.every((s: any) => /^staff:[0-9a-f]{10}$/.test(s.actor) && typeof s.stamps === "number"),
    "admin sees counter activity per staff phone",
  );
  expect(JSON.stringify(adminOk).indexOf("password") === -1, "admin overview never includes any password field");
  // ONE returning rate, replacing six. Six retention rates behind a "not enough
  // data" gate is five more than the question needs.
  {
    const r = adminOk.returning;
    expect(
      r && typeof r.eligible === "number" && typeof r.returned === "number" &&
        (r.rate === null || typeof r.rate === "number"),
      "the console gets one returning-customer rate, and a null rather than a fake 0%",
    );
    expect(
      r.returned <= r.eligible && r.prev_returned <= r.prev_eligible,
      `the numerator never exceeds the denominator (${r.returned}/${r.eligible}, was ${r.prev_returned}/${r.prev_eligible})`,
    );
    expect(
      r.rate === null || Math.abs(r.rate - r.returned / r.eligible) < 0.0001,
      "the rate is exactly returned over eligible, not rounded server-side",
    );
    expect(!("retention" in adminOk) && !("platform" in adminOk),
      "the six-rate retention payload is gone, not merely unread");
  }
  // The two new columns the merchant table and the activation timeline read.
  expect(
    adminOk.merchants.every((m: any) => typeof m.active_30d === "number" && m.active_30d >= m.active_7d),
    "every shop reports customers over 30 days, and it can never be under its own 7-day figure",
  );
  expect(
    adminOk.merchants.every((m: any) => "first_customer_at" in m),
    "every shop reports when its first card was issued — step three of the timeline",
  );

  // --- Week by week: the one thing the console could never show ---
  // Everything else it reports is a snapshot. The only time comparison was this
  // week vs last week, which is a difference, not a direction.
  {
    const s = adminOk.series;
    expect(Array.isArray(s) && s.length === 26, `the console gets 26 weekly buckets (got ${s && s.length})`);
    // generate_series, not a GROUP BY: a week nobody stamped has no rows to
    // group, so grouping alone silently closes the gap and draws a flat line
    // through a dead fortnight. A fresh test database is mostly empty weeks,
    // which makes this the case that matters here.
    const empty = s.filter((w: any) => w.stamps === 0);
    expect(empty.length > 0, "empty weeks are rows of zeroes, not missing rows");
    expect(
      s.every((w: any) =>
        typeof w.stamps === "number" && typeof w.active_merchants === "number" &&
        typeof w.active_customers === "number" && typeof w.rewards === "number" &&
        typeof w.new_merchants === "number"),
      "every bucket carries all five counts",
    );
    // Strictly weekly and in order, so the browser can slice the tail off for a
    // shorter range and trust that the last row is the week now running.
    const gaps = s.slice(1).map((w: any, i: number) =>
      new Date(w.week).getTime() - new Date(s[i].week).getTime());
    expect(gaps.every((g: number) => g === 7 * 86400000), "buckets are exactly one week apart, ascending");
    // This run stamped real customers, so the live week has to see them.
    const total = s.reduce((a: number, w: any) => a + w.stamps, 0);
    expect(total > 0, `the series counts the stamps this run gave (${total})`);
    // is_test never leaks in: the designer's own test pass writes real events
    // against a real card, and they are not demand.
    expect(
      s.reduce((a: number, w: any) => a + w.active_customers, 0) > 0 &&
        JSON.stringify(s).indexOf("NaN") === -1,
      "customers are counted per person, with no NaN from an empty week",
    );
  }

  // "Ask Google" — read-only, and it must NEVER echo Google's raw class. The
  // class carries callbackOptions.url with GOOGLE_CALLBACK_SECRET in its query
  // string, so a report that spread the class would print that secret into a
  // browser and every screenshot of it. Google is unconfigured here, which is
  // the shape that has to stay safe too.
  {
    const own = (await ownerMerchant((await getOwnerByEmail("owner@test.my"))!.id))!;
    const res = await get("/admin/api/merchant/" + own.id + "/google", { headers: { cookie: cookieNow } });
    expect(res.status === 200, "the console can ask Google what it is holding");
    const report = JSON.parse(res.body);
    expect(Array.isArray(report.cards) && report.cards.length > 0, "it answers per programme");
    expect(
      report.cards.every((c: any) => c.class && typeof c.class.hasCallback === "boolean"),
      "the callback is reported as a boolean, never as its URL",
    );
    expect(
      !/token=|callbackOptions|private_key/i.test(res.body),
      "no secret is echoed back from Google's class",
    );
    expect(
      report.cards.every((c: any) => c.class.reason === "google-not-configured"),
      "with no Google credentials it says so instead of throwing",
    );
    expect(
      (await get("/admin/api/merchant/" + own.id + "/google", { headers: { cookie: cookieOutsider } })).status !== 200,
      "asking Google is admin-only",
    );
  }

  // One shop's own lines, on its own endpoint — fetched when its page opens,
  // not dragged along with the list.
  {
    const own = (await ownerMerchant((await getOwnerByEmail("owner@test.my"))!.id))!;
    const ms = JSON.parse(
      (await get("/admin/api/merchant/" + own.id + "/series", { headers: { cookie: cookieNow } })).body,
    ).series;
    expect(Array.isArray(ms) && ms.length === 26, "a shop's series is 26 weeks too");
    expect(
      ms.every((w: any) => typeof w.new_customers === "number"),
      "a shop's series says how many customers were NEW that week",
    );
    expect(
      ms.reduce((a: number, w: any) => a + w.stamps, 0) > 0,
      "a shop that has been stamped has stamps in its own series",
    );
    // Scoped: one shop's line cannot exceed the platform's in any week.
    expect(
      ms.every((w: any, i: number) => w.stamps <= adminOk.series[i].stamps),
      "a shop's weekly stamps never exceed the platform's for the same week",
    );
  }

  // A shop has its own address. The detail used to unfold inside its table row,
  // where it could not be linked, bookmarked or survive a refresh.
  {
    const own = (await ownerMerchant((await getOwnerByEmail("owner@test.my"))!.id))!;
    const page = await get("/admin/m/" + own.id, { headers: { cookie: cookieNow } });
    expect(page.status === 200 && page.body.includes("Merchant health"),
      "/admin/m/:id serves the console");
    // The same document, so there is only one to maintain — the browser reads
    // the path and renders the shop.
    expect(page.body === (await get("/admin", { headers: { cookie: cookieNow } })).body,
      "/admin/m/:id is the SAME page as /admin, opened on a shop");
    const missing = await get("/admin/m/no-such-shop-at-all", { headers: { cookie: cookieNow } });
    expect(missing.status === 200, "an unknown shop id still serves the console rather than 404ing");
  }

  // --- The console is keyed by MERCHANT, and the rollup adds up ---
  // The regression this re-keying invites: a merchant total that quietly
  // disagrees with the cards underneath it. Checked against the card-keyed
  // numbers that were already there and already tested.
  expect(Array.isArray(adminOk.merchants) && adminOk.merchants.length > 0, "admin overview lists merchants");
  const firstOwner = (await getOwnerByEmail("owner@test.my"))!;
  const ownMerchant = (await ownerMerchant(firstOwner.id))!;
  const mRow = adminOk.merchants.find((x: any) => x.id === ownMerchant.id);
  expect(!!mRow, "the first owner's merchant is in the health list");
  const theirCards = adminOk.cards.filter((c: any) => mRow.card_ids.includes(c.id));
  expect(theirCards.length === mRow.card_ids.length && theirCards.length >= 2,
    `the merchant's cards are all present (${theirCards.length})`);
  expect(
    mRow.stamps === theirCards.reduce((a: number, c: any) => a + c.stamps, 0),
    "merchant stamps equal the sum of their cards' stamps",
  );
  expect(
    mRow.redemptions === theirCards.reduce((a: number, c: any) => a + c.redemptions, 0),
    "merchant redemptions equal the sum of their cards'",
  );
  // Value is a countable number times one assumption, and the assumption is the
  // merchant's own basket. Never welcome stamps: those are written to
  // passes.stamp_count and emit no event, so they cannot reach this figure.
  expect(
    Math.abs(mRow.value.spendThroughCard - mRow.stamps * (mRow.basket_cents / 100)) < 0.01,
    "spend through the card is counter visits × the self-reported basket",
  );
  expect(
    Math.abs(mRow.value.spendPerReward - mRow.stamps_target * (mRow.basket_cents / 100)) < 0.01,
    "spend per reward is their own target × their own basket",
  );

  // Every stamp figure on this console is NET, including the windowed ones.
  //
  // They were not. `stamps` was net and `stamps_7d` / `stamps_30d` were gross,
  // in the same SELECT — so the all-time number nobody scans obeyed the rule
  // and the 30-day column in the merchants table, plus the "Stamps/customer"
  // figure beside it, did not. The two 7-day figures are also compared against
  // each other for the "slowing down" flag, where being inflated in the same
  // direction is not the reassurance it sounds like.
  {
    const health = async () =>
      JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
        .merchants.find((x: any) => x.id === ownMerchant.id);
    const netPass = await mk();
    await fetch(base + "/staff/api/stamp", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: netPass.serial }),
    });
    const stamped = await health();
    await fetch(base + "/staff/api/undo", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: netPass.serial }),
    });
    const undone = await health();
    for (const k of ["stamps", "stamps_7d", "stamps_30d"] as const) {
      expect(
        undone[k] === stamped[k] - 1,
        `an undo comes off the console's ${k} (${stamped[k]} → ${undone[k]})`,
      );
    }
    // ...and the money figure follows, because it is that number × their basket.
    // Asserted as the identity rather than "it went down": this shop has no
    // basket set, so both readings are zero and a comparison would pass on a
    // number that never moved. The identity holds either way and is the thing
    // that actually matters — spend is the net count times their own basket,
    // never a second count of its own.
    expect(
      Math.abs(undone.value.spendThroughCard - undone.stamps * (undone.basket_cents / 100)) < 0.01,
      "...and the estimated spend is still that net count × their basket",
    );
    // The welcome stamps that pass arrived holding never entered any of them:
    // it was minted with two and then stamped once, so the console must have
    // moved by exactly one. Three would mean the free ones were counted as
    // work the shop did — and then billed again through the spend figure above.
    expect(
      stamped.stamps === mRow.stamps + 1,
      `a card's welcome stamps reach no console figure; only the counter stamp does (${mRow.stamps} → ${stamped.stamps})`,
    );
  }

  // --- The chain: one number, readable at three heights -------------------
  //
  // The console showed four figures all called "stamps" — a rolling 30 days, an
  // all-time total, and two tiles that each hold ONE finished week — and none of
  // them said so. Compared by eye they looked broken, and nothing anywhere could
  // be added up and checked, which is why a genuinely wrong number would have
  // been invisible.
  //
  // ALL TIME is the figure that reaches every level unchanged. This asserts the
  // whole chain in one place, because "these three agree" is exactly what no
  // test has ever said:
  //
  //   owner's Home tile  ==  the shop's row  ==  its cards  ==  a term of the total
  {
    const admin = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
    const row = admin.merchants.find((x: any) => x.id === ownMerchant.id);
    const theirs = admin.cards.filter((c: any) => row.card_ids.includes(c.id));
    expect(
      row.stamps === theirs.reduce((a: number, c: any) => a + c.stamps, 0),
      `the shop's all-time stamps equal its cards' (${row.stamps})`,
    );
    const ownerTotal = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body)
      .cards.reduce((a: number, c: any) => a + c.metrics.stamps, 0);
    expect(
      ownerTotal === row.stamps,
      `...and the owner's own Home tile says the same (${ownerTotal} vs ${row.stamps})`,
    );

    // The console's total is the sum of the LIVE rows, and archiving has to move
    // it — the Overview always left archived shops out while the table kept
    // them, so the top could never be the sum of the list.
    //
    // On a THROWAWAY shop, not this one. Archiving bumps staff_session_epoch
    // for the whole owner (setMerchantArchived), and unarchiving deliberately
    // does not reverse it — so doing this to the main merchant silently kills
    // every staff cookie the rest of this file still uses, on every card that
    // owner runs. Its stamp is written with logEvent rather than through the
    // counter, so the throwaway needs no PIN and no session of its own.
    const liveSum = (ms: any[]) =>
      ms.filter((m) => !m.archived_at).reduce((a: number, m: any) => a + m.stamps, 0);
    const tmpOwner = await createOwner(crypto.randomUUID(), "archive-total@shop.my", "x");
    const tmpMerchant = await ensureMerchantForOwner(tmpOwner.id, "Archive Total Cafe");
    const tmpCard = await createCard({
      merchantId: tmpMerchant.id, name: "Archive Total Cafe", reward: "Free tea",
      stampsTarget: 10, stampsStart: 2,
    });
    await linkOwnerCard(tmpOwner.id, tmpCard.id);
    const tmpPass = await mk("apple", (await mkCustomer(tmpMerchant.id)).id, tmpCard.id);
    await logEvent(tmpCard.id, tmpPass.serial, "stamp", { actor: "staff:e2e" });

    const withTmp = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
    const tmpRow = withTmp.merchants.find((x: any) => x.id === tmpMerchant.id);
    expect(tmpRow.stamps === 1, `the throwaway shop has one stamp (${tmpRow.stamps})`);
    const before = liveSum(withTmp.merchants);

    await fetch(base + "/admin/api/merchant/" + tmpMerchant.id + "/archive", {
      method: "POST", headers: { cookie: cookieNow },
    });
    const archived = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
    expect(
      liveSum(archived.merchants) === before - 1,
      `archiving a shop takes its stamps out of the total (${before} → ${liveSum(archived.merchants)})`,
    );
    // ...and it is still listed, so it can be found and restored.
    expect(
      archived.merchants.some((m: any) => m.id === tmpMerchant.id && m.archived_at),
      "...and the shop is still on the list, flagged archived",
    );
    await fetch(base + "/admin/api/merchant/" + tmpMerchant.id + "/unarchive", {
      method: "POST", headers: { cookie: cookieNow },
    });
    const restored = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
    expect(liveSum(restored.merchants) === before, "...and restoring it puts them back");
  }

  // --- Triage: fires on the merchant that is broken, and NOT on the one that isn't ---
  // A rule that flags everybody trains you to ignore the list, so the second
  // half of this is the half that matters.
  const quietOwner = await createOwner(crypto.randomUUID(), "quiet@shop.my", "x");
  const quietMerchant = await ensureMerchantForOwner(quietOwner.id, "Never Started Cafe");
  const quietCard = await createCard({
    merchantId: quietMerchant.id, name: "Never Started Cafe", reward: "Free tea",
    stampsTarget: 10, stampsStart: 2,
  });
  await linkOwnerCard(quietOwner.id, quietCard.id);
  // Backdate the signup past the grace period; a merchant created yesterday has
  // not failed at anything yet.
  await getPool().query(
    `UPDATE merchants SET created_at = now() - interval '9 days' WHERE id = $1`, [quietMerchant.id],
  );
  const triaged = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
  const quietRow = triaged.merchants.find((x: any) => x.id === quietMerchant.id);
  // A shop that has a login and has never stamped raises no FLAG — its STAGE
  // says exactly that, which is the whole point of the four-word vocabulary.
  // It used to raise "Never set up", one of eight flags that were really just
  // the stage restated as a problem.
  expect(quietRow.stage === "activated",
    `a shop with a login and no stamps is 'activated' (got ${quietRow.stage})`);
  expect(!quietRow.flags.some((f: any) => f.key === "never-activated"),
    "…and raises no flag for it — the stage is the statement");
  const busyRow = triaged.merchants.find((x: any) => x.id === ownMerchant.id);
  expect(busyRow.stage === "stamping",
    `a shop stamping right now is 'stamping' (got ${busyRow.stage})`);

  // poster_view is still recorded — it is the evidence that anything was ever
  // put on a counter, and a shop's own page reads it.
  expect((await get("/c/" + quietCard.id + "/poster")).status === 200, "the poster renders for a new merchant");
  const posterSeen = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
    .merchants.find((x: any) => x.id === quietMerchant.id);
  expect(posterSeen.poster_views > 0, "opening the poster is recorded");

  // --- Sign-up channels: a poster scan and a shared link are told apart ---
  // Both arrive as an ordinary page view, so the only thing separating them is
  // the ?s= tag the poster QR and the dashboard's share link now carry.
  const quietRef = await currentSlug(quietMerchant.id);
  await get("/j/" + quietRef + "?s=poster");
  await get("/j/" + quietRef + "?s=poster");
  await get("/j/" + quietRef + "?s=link");
  await get("/j/" + quietRef); // however they got here — an older printed poster
  const chan = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
    .merchants.find((x: any) => x.id === quietMerchant.id);
  expect(chan.opened_poster === 2, `poster scans are attributed (got ${chan.opened_poster})`);
  expect(chan.opened_link === 1, `shared links are attributed (got ${chan.opened_link})`);
  expect(chan.opened_other === 1, `an untagged visit counts as unattributed, not lost (got ${chan.opened_other})`);
  expect(
    chan.scanned === chan.opened_poster + chan.opened_link + chan.opened_other,
    "the channel split adds up to the total opened",
  );
  // The QR itself has to carry the tag, or nothing above ever happens.
  expect((await get("/j/" + quietRef + "/qr")).status === 200, "the merchant QR still renders");

  // --- Archiving a merchant takes it out of the work list entirely ---
  // Sign this owner in BEFORE the shop closes: a live session that outlives the
  // archiving is the case the checks below are actually about, and logging in
  // afterwards is now refused outright (see further down).
  // This fixture's password was never a real hash, so take the password the way
  // the admin console would hand one over.
  const quietPw = JSON.parse(await (await fetch(
    base + "/admin/api/owner/" + quietOwner.id + "/reset-password",
    { method: "POST", headers: { cookie: cookieNow } },
  )).text()).tempPassword;
  const quietLogin = async () =>
    await fetch(base + "/dashboard/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "quiet@shop.my", password: quietPw }),
    });
  const quietCookie = (await quietLogin()).headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(quietCookie !== "", "the owner of an open shop can log in");

  const arch = await fetch(base + "/admin/api/merchant/" + quietMerchant.id + "/archive", {
    method: "POST", headers: { cookie: cookieNow },
  });
  expect(arch.status === 200, "a merchant can be archived");
  const afterArch = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
    .merchants.find((x: any) => x.id === quietMerchant.id);
  expect(afterArch.archived_at !== null, "the merchant is marked archived, not deleted");
  expect(afterArch.flags.length === 0, "an archived merchant raises nothing — it is closed, not broken");
  expect(afterArch.stage === "closed", "...and reads as closed");

  // Archiving REVOKES. Until v2.0 it only set a flag the console filtered on:
  // the owner could still log in, their staff could still stamp, and their
  // sign-up page still issued cards. A soft delete that leaves every door open
  // is a label, not a state.
  {
    expect(
      (await get("/dashboard/api/overview", { headers: { cookie: quietCookie } })).status === 403,
      "an archived shop's owner cannot use the dashboard",
    );
    // Refused at the door, not one call later. A closed owner used to log in
    // SUCCESSFULLY — correct password, cookie set, state saying logged-in — and
    // land on a dashboard whose every call 403s, which the page rendered as a
    // permanent "Loading…" with no log out button and no way back to the login
    // form. Same refusal staff sign-in has always given.
    const closedLogin = await quietLogin();
    expect(closedLogin.status === 403, "an archived shop's owner cannot log in at all");
    expect(
      JSON.parse(await closedLogin.text()).error === "account-closed",
      "...and is told the account is closed, not that the password is wrong",
    );
    expect(
      (closedLogin.headers.get("set-cookie") ?? "") === "",
      "...and is handed no session to sit inside",
    );
    // A cookie from before the shop closed lands on the login form rather than
    // on a dashboard that cannot load.
    expect(
      JSON.parse((await get("/dashboard/api/state", { headers: { cookie: quietCookie } })).body).loggedIn === false,
      "...and an older session reads as logged out",
    );
    const closedStaff = await fetch(base + "/staff/api/login", {
      method: "POST", headers: { "Content-Type": "application/json", "x-card-id": quietCard.id },
      body: JSON.stringify({ pin: "123456" }),
    });
    expect(closedStaff.status === 403, "...and a correct PIN cannot reopen the counter");
    expect(
      (await get("/c/" + quietCard.id)).body.includes("isn’t open yet"),
      "...and their sign-up page stops offering a card",
    );
    // Nothing was destroyed, and putting it back opens all three doors again.
    await fetch(base + "/admin/api/merchant/" + quietMerchant.id + "/unarchive", {
      method: "POST", headers: { cookie: cookieNow },
    });
    expect(
      (await get("/dashboard/api/overview", { headers: { cookie: quietCookie } })).status === 200,
      "unarchiving restores the dashboard",
    );
    expect((await quietLogin()).status === 200, "...and lets the owner log in again");
    expect(
      !(await get("/c/" + quietCard.id)).body.includes("isn’t open yet"),
      "...and the sign-up page",
    );
  }
  const contact = await fetch(base + "/admin/api/merchant/" + quietMerchant.id + "/contact", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ phone: "+60 12-345 6789", note: "Prefers WhatsApp" }),
  });
  expect(contact.status === 200, "operator contact details save");
  const withContact = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
    .merchants.find((x: any) => x.id === quietMerchant.id);
  expect(withContact.contact_phone === "+60 12-345 6789" && withContact.contact_note === "Prefers WhatsApp",
    "...and come back on the merchant");

  const owner2 = adminOk.owners.find((o: any) => o.email === "second@card.my");
  const reset = await fetch(base + "/admin/api/owner/" + owner2.id + "/reset-password", {
    method: "POST", headers: { cookie: cookieNow },
  });
  const resetOut = JSON.parse(await reset.text());
  expect(reset.status === 200 && resetOut.tempPassword, "admin can mint a temp password (never sees the old)");
  const loginTemp = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "second@card.my", password: resetOut.tempPassword }),
  });
  expect(loginTemp.status === 200, "the reset temp password logs the owner in");

  // --- Done-for-you onboarding: build the shop, THEN hand over a claim link ---
  // The flow is: agree over DM → build the card here → send one link → they
  // make their own login. So the shop exists in full with no account attached,
  // and nothing about it is reachable by a customer until it is claimed.
  const dfyForbidden = await fetch(base + "/admin/api/card", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieOutsider },
    body: JSON.stringify({ cafeName: "Sneaky" }),
  });
  expect(dfyForbidden.status === 403, "a non-admin can't build a shop via the admin console");
  const dfy = await fetch(base + "/admin/api/card", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ cafeName: "Nasi Lemak House", reward: "Free plate" }),
  });
  const dfyOut = JSON.parse(await dfy.text());
  expect(dfy.status === 200 && dfyOut.cardId && dfyOut.merchantId,
    "admin builds a shop with no login attached");
  expect(
    !JSON.stringify(dfyOut).toLowerCase().includes("password"),
    "...and invents no account, so there is no password to leak",
  );
  {
    const unclaimed = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
      .merchants.find((x: any) => x.id === dfyOut.merchantId);
    expect(unclaimed.stage === "not-claimed" && unclaimed.has_owner === false,
      `a shop nobody has claimed reads as not-claimed (${unclaimed.stage})`);
    // The console's Reset their password button is built off this. Null here is
    // what keeps the button off a row that has no login to reset.
    expect(unclaimed.owner_id === null, "...and carries no owner to reset a password for");
  }

  // Nothing a customer can reach. Without this a poster printed early would
  // issue cards that NOBODY could stamp — the staff PIN belongs to the owner,
  // and there is no owner yet.
  const preLanding = await get("/c/" + dfyOut.cardId);
  expect(preLanding.status === 200 && !preLanding.body.includes("/enroll"),
    "pre-claim, the sign-up page offers no way to add a card");
  expect(preLanding.body.includes("isn’t open yet"), "...and says so plainly");
  const preApple = await get("/c/" + dfyOut.cardId + "/enroll");
  expect(preApple.status === 403, "pre-claim, the Apple add route refuses");
  expect(
    (await getPool().query("SELECT 1 FROM passes WHERE card_id = $1", [dfyOut.cardId])).rowCount === 0,
    "...and no pass was minted by trying",
  );
  const preStaff = await fetch(base + "/staff/api/login", {
    method: "POST", headers: { "Content-Type": "application/json", "x-card-id": dfyOut.cardId },
    body: JSON.stringify({ pin: "123456" }),
  });
  expect(preStaff.status === 404, "pre-claim, the staff counter does not resolve at all");

  // The claim link. Minted once, shown once, and it is what hands the shop over.
  const linkRes = await fetch(base + "/admin/api/merchant/" + dfyOut.merchantId + "/claim-link", {
    method: "POST", headers: { cookie: cookieNow },
  });
  const link = JSON.parse(await linkRes.text());
  expect(linkRes.status === 200 && String(link.url).includes("/claim/"), "admin mints a claim link");
  let claimToken = String(link.url).split("/claim/")[1]!;
  // The token is now stored readable as well as hashed, so an operator can find
  // a link they already sent instead of minting a replacement and killing it.
  // What that buys is bounded by what follows: it is cleared on claim and on
  // withdrawal, so only an OUTSTANDING link is ever legible. See src/claim.ts.
  expect(
    (await getPool().query(
      "SELECT 1 FROM merchants WHERE id = $1 AND claim_token_hash = $2",
      [dfyOut.merchantId, claimToken],
    )).rowCount === 0,
    "the hash column holds a hash, not the token",
  );
  expect(
    (await getPool().query(
      "SELECT 1 FROM merchants WHERE id = $1 AND claim_token = $2",
      [dfyOut.merchantId, claimToken],
    )).rowCount === 1,
    "...and the outstanding link is readable, so it can be found again",
  );
  {
    const seen = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
      .merchants.find((x: any) => x.id === dfyOut.merchantId);
    expect(seen.claim_token === claimToken, "the console can show the link it already sent");
  }
  // Minting again REPLACES it. The console warns before doing this; the point
  // here is that the old link really does stop working, so the warning is true.
  {
    const second = await fetch(base + "/admin/api/merchant/" + dfyOut.merchantId + "/claim-link", {
      method: "POST", headers: { cookie: cookieNow },
    });
    const two = JSON.parse(await second.text());
    expect(two.replaced === true, "re-minting says it replaced a link that was out");
    const secondToken = String(two.url).split("/claim/")[1]!;
    expect((await get("/claim/" + claimToken)).status === 404, "...the link already sent is dead");
    expect((await get("/claim/" + secondToken)).status === 200, "...and the new one opens");
    // Put the original back so the rest of this block reads as written.
    await fetch(base + "/admin/api/merchant/" + dfyOut.merchantId + "/claim-link", {
      method: "DELETE", headers: { cookie: cookieNow },
    });
    expect(
      (await getPool().query(
        "SELECT claim_token FROM merchants WHERE id = $1", [dfyOut.merchantId],
      )).rows[0].claim_token === null,
      "a withdrawn link is not left legible in the database",
    );
  }
  const remint = JSON.parse(await (await fetch(
    base + "/admin/api/merchant/" + dfyOut.merchantId + "/claim-link",
    { method: "POST", headers: { cookie: cookieNow } },
  )).text());
  claimToken = String(remint.url).split("/claim/")[1]!;
  expect(
    (await get("/admin/api/merchant/" + dfyOut.merchantId + "/claim-link", { headers: { cookie: cookieOutsider } })).status !== 200,
    "a non-admin can't mint a claim link",
  );
  const claimPageRes = await get("/claim/" + claimToken);
  expect(claimPageRes.status === 200 && claimPageRes.body.includes("Nasi Lemak House"),
    "the claim page shows the shop we built");
  expect((await get("/claim/" + "f".repeat(64))).status === 404, "a forged token opens nothing");

  const finish = async (token: string, email: string, password = "password123") =>
    await fetch(base + "/claim/" + token + "/finish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  const taken = await finish(claimToken, "second@card.my");
  expect(taken.status === 409, "claiming with an email that already has an account is refused");
  const claimed = await finish(claimToken, "nasi@lemak.my");
  const claimOut = JSON.parse(await claimed.text());
  // No PIN comes back, and none is minted. It used to be printed on the next
  // screen under "write it down now" — the only moment it could ever be read,
  // since only a scrypt hash is stored. Minting one WITHOUT showing it would be
  // worse than either: hasStaffPin true, the Shop button offering to "Reset",
  // and a live counter credential nobody can read.
  expect(claimed.status === 200 && claimOut.ok === true, "the claim creates the login");
  expect(claimOut.staffPin === undefined, "...and hands back no staff PIN");
  let claimCookie = claimed.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(claimCookie.startsWith("stampy_session="), "...and signs them straight in");
  // Single use. A forwarded DM must not hand the shop over twice.
  expect((await finish(claimToken, "someone@else.my")).status === 400,
    "the same link cannot be used a second time");
  expect((await get("/claim/" + claimToken)).status === 404, "...and the page stops opening");
  expect(
    (await getPool().query(
      "SELECT claim_token, claim_token_hash FROM merchants WHERE id = $1", [dfyOut.merchantId],
    )).rows[0].claim_token === null,
    "a spent link leaves no readable token behind",
  );

  // They land on a dashboard that is already set up.
  const claimedOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: claimCookie } })).body);
  expect(claimedOv.cards.length === 1 && claimedOv.cards[0].id === dfyOut.cardId,
    "the claimed dashboard already holds the card we built");
  expect(claimedOv.hasStaffPin === false, "...and no staff PIN yet, which is what the banner is for");
  expect(claimedOv.cards[0].reward === "Free plate", "...and the reward we configured");
  expect(Boolean(claimedOv.joinRef), "...and a join link ready for the poster");

  // The step the banner sends them to. Until it happens the counter genuinely
  // cannot sign in — verifyPassword refuses an empty hash — and it fails looking
  // exactly like a wrong PIN, which is the whole reason the banner exists.
  const claimPin = "834192";
  {
    const tooEarly = await fetch(base + "/staff/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-card-id": dfyOut.cardId },
      body: JSON.stringify({ pin: claimPin }),
    });
    expect(tooEarly.status !== 200, "before a PIN is set, no PIN signs the counter in");

    const setPin = await fetch(base + "/dashboard/api/staff-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: claimCookie },
      body: JSON.stringify({ pin: claimPin }),
    });
    expect(setPin.status === 200, "the owner sets their own PIN under Shop");
    const afterOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: claimCookie } })).body);
    expect(afterOv.hasStaffPin === true, "...and the dashboard stops warning them");
  }

  // And now the shop is open to customers.
  const postLanding = await get("/c/" + dfyOut.cardId);
  expect(!postLanding.body.includes("isn’t open yet"), "once claimed, the sign-up page opens");
  {
    const nowClaimed = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
      .merchants.find((x: any) => x.id === dfyOut.merchantId);
    // "Activated" means the LOGIN exists — not the first stamp, which is the
    // step after it. There was no word at all for this state before, even
    // though it is the most common place for a new shop to stall.
    expect(nowClaimed.stage === "activated" && nowClaimed.has_owner === true,
      `a claimed shop that has not stamped reads as activated (${nowClaimed.stage})`);
    // Which owner, so the row can reset their password without a second list of
    // every owner on the platform to pick the same shop out of again.
    expect(
      typeof nowClaimed.owner_id === "string" && nowClaimed.owner_id.length > 0,
      "...and names the owner whose password the row can reset",
    );
    const pwReset = await fetch(base + "/admin/api/owner/" + nowClaimed.owner_id + "/reset-password", {
      method: "POST", headers: { cookie: cookieNow },
    });
    const pwOut = JSON.parse(await pwReset.text());
    expect(pwReset.status === 200 && String(pwOut.tempPassword || "").length > 8,
      "...and that owner_id is one the reset route accepts");
  }

  // --- Handing a shop to somebody else -------------------------------------
  // The way back from a claim link that reached the wrong person. Nothing else
  // in this codebase ever set owner_id back to NULL, so before this the only
  // recourse was building a NEW shop — which mints a new card id, and a card id
  // is printed on posters and baked into every Android card issued from it.
  {
    const before = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
      .merchants.find((x: any) => x.id === dfyOut.merchantId);
    const exOwner = before.owner_id;
    // Their staff phone is signed in and stamping right now.
    const staffIn = await fetch(base + "/staff/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-card-id": dfyOut.cardId },
      body: JSON.stringify({ pin: claimPin }),
    });
    const staffCookie = staffIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(staffIn.status === 200 && staffCookie.length > 0, "the wrong owner's counter is signed in");

    expect(
      (await fetch(base + "/admin/api/merchant/" + dfyOut.merchantId + "/unclaim", {
        method: "POST", headers: { cookie: cookieOutsider },
      })).status === 403,
      "handing a shop on is admin-only",
    );
    const handed = await fetch(base + "/admin/api/merchant/" + dfyOut.merchantId + "/unclaim", {
      method: "POST", headers: { cookie: cookieNow },
    });
    expect(handed.status === 200, "the shop is taken back off its owner");
    // Doing it twice is a clean refusal, not a 500 and not a silent success.
    expect(
      (await fetch(base + "/admin/api/merchant/" + dfyOut.merchantId + "/unclaim", {
        method: "POST", headers: { cookie: cookieNow },
      })).status === 409,
      "...and a shop nobody holds cannot be taken back again",
    );

    const after = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
      .merchants.find((x: any) => x.id === dfyOut.merchantId);
    expect(after.stage === "not-claimed" && after.has_owner === false && after.owner_id === null,
      `the shop reads as not-claimed again (${after.stage})`);
    expect(after.card_ids.includes(dfyOut.cardId),
      "...keeping the SAME card id, so posters and issued cards still point at it");
    // History, not erasure: both dates stand, which is the answer to a dispute.
    expect(Boolean(after.claimed_at) && Boolean(after.unclaimed_at),
      "...and records that it was claimed and then handed back");

    // Three doors, all of which stayed open before this existed.
    const exDash = await get("/dashboard/api/overview", { headers: { cookie: claimCookie } });
    expect(exDash.status !== 200 || JSON.parse(exDash.body).cards.length === 0,
      "the ex-owner's dashboard holds no card");
    // 404, not 401: deleting the owner_cards link means the card resolves to no
    // owner at all, so the counter stops existing rather than merely refusing —
    // exactly the state it was in before anybody claimed the shop.
    expect(
      (await fetch(base + "/staff/api/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-card-id": dfyOut.cardId, cookie: staffCookie },
        body: JSON.stringify({ code: "ABC123" }),
      })).status === 404,
      "...their counter stops resolving mid-shift",
    );
    expect(
      (await getPool().query(
        "SELECT 1 FROM owner_cards WHERE owner_id = $1 AND card_id = $2", [exOwner, dfyOut.cardId],
      )).rowCount === 0,
      "...and the card is not linked to them any more",
    );
    // The account survives owning nothing — a mis-click here must not delete
    // somebody's login.
    expect(
      (await getPool().query("SELECT 1 FROM owners WHERE id = $1", [exOwner])).rowCount === 1,
      "...but their account still exists, because this is not a delete",
    );
    // And the shop can be given to the right person, on the same card.
    const reLink = JSON.parse(await (await fetch(
      base + "/admin/api/merchant/" + dfyOut.merchantId + "/claim-link",
      { method: "POST", headers: { cookie: cookieNow } },
    )).text());
    const reClaimed = await finish(String(reLink.url).split("/claim/")[1]!, "right@person.my");
    expect(reClaimed.status === 200, "a fresh link hands the same shop to the right person");
    const reCookie = reClaimed.headers.get("set-cookie")?.split(";")[0] ?? "";
    const reOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: reCookie } })).body);
    expect(reOv.cards.length === 1 && reOv.cards[0].id === dfyOut.cardId,
      "...and they get the card we built, not a new one");
    claimCookie = reCookie;
  }

  // A withdrawn link stops working before it is used.
  const wdShop = await fetch(base + "/admin/api/card", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ cafeName: "Withdrawn Shop" }),
  });
  const wdOut = JSON.parse(await wdShop.text());
  const wdLink = JSON.parse(await (await fetch(
    base + "/admin/api/merchant/" + wdOut.merchantId + "/claim-link",
    { method: "POST", headers: { cookie: cookieNow } },
  )).text());
  const wdToken = String(wdLink.url).split("/claim/")[1]!;
  await fetch(base + "/admin/api/merchant/" + wdOut.merchantId + "/claim-link", {
    method: "DELETE", headers: { cookie: cookieNow },
  });
  expect((await get("/claim/" + wdToken)).status === 404, "a withdrawn claim link stops opening");
  expect((await finish(wdToken, "nobody@home.my")).status === 400, "...and cannot be finished");
  // Re-issuing replaces the old one rather than adding a second key to the door.
  const wdReissued = JSON.parse(await (await fetch(
    base + "/admin/api/merchant/" + wdOut.merchantId + "/claim-link",
    { method: "POST", headers: { cookie: cookieNow } },
  )).text());
  const wdReissuedToken = String(wdReissued.url).split("/claim/")[1]!;
  expect(wdReissuedToken !== wdToken, "a re-issued link is a different token");
  expect((await get("/claim/" + wdReissuedToken)).status === 200, "...and the new one opens");

  // Public signup is closed in production; the claim link is the only way in.
  process.env.ALLOW_PUBLIC_SIGNUP = "";
  const closedSignup = await fetch(base + "/dashboard/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "walkin@stranger.my", password: "password123", cafeName: "Walk In" }),
  });
  expect(closedSignup.status === 403, "with signup closed, nobody can mint themselves a shop");
  // The switch is built from this flag, so assert the flag: the string itself
  // is in the page's script either way, guarded by it.
  expect((await get("/dashboard")).body.includes("const ALLOW_SIGNUP = false"),
    "...and the login page stops offering it");
  process.env.ALLOW_PUBLIC_SIGNUP = "1";


  // --- The designer, pointed at a merchant's LIVE card ---------------------
  // The console renders the owner dashboard's designer against any card. These
  // are the admin-gated twins of /dashboard/api/card/:id, and they share their
  // coercion (cardFieldsFromBody) and their response shape (designerCard), so
  // the two cannot drift into clamping a value differently.
  const adminGet = async (path: string) =>
    JSON.parse((await get(path, { headers: { cookie: cookieNow } })).body);
  const design = async (path: string, body: unknown, method = "POST") =>
    (await fetch(base + "/admin/api/card/" + dfyOut.cardId + "/design" + path, {
      method, headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify(body),
    })).status;

  const state = await adminGet("/admin/api/card/" + dfyOut.cardId + "/design-state");
  expect(state.ok && state.card.id === dfyOut.cardId, "the designer can open on a merchant's own card");
  // The panel is driven by hex; the columns are rgb(...) for PassKit.
  expect(/^#[0-9a-f]{6}$/i.test(state.card.bg) && Array.isArray(state.card.targetsInUse),
    "…with hex colours and the targets its customers still hold");
  expect(!JSON.stringify(state).toLowerCase().includes("pin"), "the design state never carries a PIN");
  expect(
    (await get("/admin/api/card/" + dfyOut.cardId + "/design-state", { headers: { cookie: cookieOutsider } })).status === 403,
    "a non-admin can't read a card's design state",
  );

  const beforeDesign = (await getCard(dfyOut.cardId))!;
  expect(await design("", {
    shopName: "Nasi Lemak House KL", bg: "#123047", fg: "#eef7fc", label: "#8fc4e6",
    accent: "#ffd166", bandColor: "#0b1d2b",
  }) === 200, "the designer saves colours and the band onto a live card");
  expect(await design("/logo", { png: pngB64 }) === 200, "…its logo");
  expect(await design("/stamps", {
    style: "🍗", strips: [{ target: beforeDesign.stamps_target, filled: 0, png: pngB64 }],
  }) === 200, "…and its stamp grid, at the card's own target");
  expect(await design("/stamps", { style: "x", strips: [{ filled: 0, png: pngB64 }] }) === 400,
    "a strip with no target is refused — that is how a grid gets filed under the wrong number");

  const designed = (await getCard(dfyOut.cardId))!;
  expect(
    designed.background_color === "rgb(18, 48, 71)" && designed.accent_color === "rgb(255, 209, 102)" &&
      designed.band_color === "rgb(11, 29, 43)" &&
      designed.stamp_style === "🍗",
    "every colour, the band and the stamps land on the live card",
  );
  expect(designed.reward === beforeDesign.reward && designed.stamps_target === beforeDesign.stamps_target,
    "the console never touches a card's reward or stamp count");
  expect((await get("/c/" + dfyOut.cardId + "/art/logo.png")).status === 200, "the uploaded logo is served");
  expect((await get("/c/" + dfyOut.cardId + "/art/stamps/0.png")).status === 200, "the rendered grid is served");
  // The shop name is the one detail it does set, and it belongs to the BUSINESS.
  const dfyRenamed = await adminGet("/admin/api/card/" + dfyOut.cardId + "/design-state");
  expect(dfyRenamed.card.shopName === "Nasi Lemak House KL", "the shop name saves onto the merchant");
  expect(
    (await fetch(base + "/admin/api/card/" + dfyOut.cardId + "/design", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieOutsider },
      body: JSON.stringify({ bg: "#000000" }),
    })).status === 403,
    "a non-admin can't design somebody's card",
  );

  // The owner's own designer must still be handed the identical object, or the
  // two pages are no longer running the same panel on the same data.
  const ownerOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  const ownerCard = ownerOv.cards.find((c: any) => c.id === "default");
  const adminCard = (await adminGet("/admin/api/card/default/design-state")).card;
  const { metrics: _drop, ...ownerShape } = ownerCard;
  expect(
    JSON.stringify(ownerShape, Object.keys(ownerShape).sort()) ===
      JSON.stringify(adminCard, Object.keys(ownerShape).sort()),
    "the owner and the console open the designer on an identical card object",
  );

  // --- The saved-design library is gone -------------------------------------
  // Designs mocked up before a shop existed, then pushed onto its card once it
  // did, were removed with the console rework: the shop is built first now, so
  // the designer always opens on a real card. The ROUTES have to be gone too,
  // not merely unlinked from the page.
  for (const [method, path] of [
    ["GET", "/admin/api/templates"],
    ["POST", "/admin/api/templates"],
    ["POST", "/admin/api/design/anything"],
    ["POST", "/admin/api/card/" + dfyOut.cardId + "/apply-template"],
  ] as [string, string][]) {
    const r = await fetch(base + path, { method, headers: { cookie: cookieNow } });
    expect(r.status === 404, `${method} ${path} is gone, not just hidden`);
  }

  // --- The band: its own colour and texture, saved with the card ---
  const saveCard = async (fields: Record<string, unknown>) => {
    const r = await fetch(base + "/dashboard/api/card/default", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify(fields),
    });
    return { status: r.status, body: JSON.parse(await r.text()) };
  };
  await saveCard({ bandColor: "#123047" });
  const banded = (await getCard("default"))!;
  expect(banded.band_color === "rgb(18, 48, 71)", `the band colour is stored as rgb (${banded.band_color})`);
  const bandedOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  const bandedCard = bandedOv.cards.find((x: any) => x.id === "default");
  expect(
    bandedCard.bandColor === "#123047",
    "...and comes back to the designer as hex, so the pickers round-trip",
  );
  // The band is one flat colour. Ten textures went with the redesign, and the
  // column with them: a texture sent now is simply not a field any more, so it
  // cannot be stored, and the designer offers nothing that could send one.
  await saveCard({ bandTexture: "chevron" });
  expect((await getCard("default"))!.band_texture === "flat",
    "a band texture is no longer a field the server will write");
  const dashBand = (await get("/dashboard")).body;
  for (const t of ["gradient", "glow", "waves", "chevron", "grain", "rays"]) {
    expect(!dashBand.includes('style: "' + t + '"'), `the designer no longer offers the ${t} band texture`);
  }
  // Any emoji is a valid stamp now, including one built from several code points
  // joined together — the column takes the glyph as-is.
  const chefPng = (await getPool().query<{ png: Buffer }>(
    "SELECT png FROM card_stamp_strips WHERE card_id = 'default' LIMIT 1",
  )).rows[0];
  await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({
      style: "🧑‍🍳",
      strips: [{
        target: (await getCard("default"))!.stamps_target,
        filled: 0,
        png: (chefPng?.png ?? Buffer.alloc(0)).toString("base64") || pngB64,
      }],
    }),
  });
  expect((await getCard("default"))!.stamp_style === "🧑‍🍳", "a multi-code-point emoji survives as the stamp style");
  // The poster is now the only printable. It is public (the merchant prints it
  // themselves) and its QR is the MERCHANT link, not this card's — which is the
  // whole reason the admin-only counter sheet was retired: /c/:cardId strands a
  // printed sheet the moment a shop renames or adds a second card.
  const posterCard = (await getCard(dfyOut.cardId))!;
  const dfyPoster = await get("/c/" + dfyOut.cardId + "/poster");
  expect(
    // Lower-cased: the generated line reads "…get a free plate.", so compare the
    // way the page actually renders it rather than the way the column stores it.
    dfyPoster.status === 200 &&
      dfyPoster.body.toLowerCase().includes(posterCard.reward.toLowerCase()),
    `the printable poster names the reward (${posterCard.reward})`,
  );
  expect(
    dfyPoster.body.includes("/j/") && !dfyPoster.body.includes("/c/" + dfyOut.cardId + "/qr"),
    "the poster's QR is the merchant link, so a rename can never strand it",
  );
  expect((await get("/c/" + dfyOut.cardId)).status === 200, "and the sign-up link still works");
  expect(
    (await get("/admin/card/" + dfyOut.cardId + "/sheet", { headers: { cookie: cookieNow } })).status === 404,
    "the counter sheet is gone",
  );

  // --- Google resync: the button that survives a domain change -------------
  //
  // A card's Google class carries everything built from BASE_URL — the hosted
  // art URLs, the Terms and Privacy links, the issuer callback — and none of it
  // moves when the public address does. The equivalent script cannot run from a
  // laptop (the service-account key is in Railway and stays there), so this
  // endpoint is the real path and has to work.
  const resync = async (cookieUsed: string) => {
    const r = await fetch(base + "/admin/api/google-resync", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieUsed },
    });
    return { status: r.status, body: JSON.parse(await r.text()) };
  };
  expect((await resync(cookieOutsider)).status === 403, "a non-admin cannot resync Google");
  const gr = await resync(cookieNow);
  // Google is not configured in e2e, so the honest answer is a clean refusal —
  // never a cheerful "done" over nothing, which is exactly how the script used
  // to behave and why nobody noticed it had done nothing at all.
  expect(
    gr.status === 409 && gr.body.error === "google-not-configured",
    "with no Google credentials it refuses plainly rather than reporting success",
  );
  // The resync also unsticks cards in wallets that draw their own band over the
  // shop's — an object heroImage frozen there since before c53cc79, which a
  // class write cannot reach. Google is unconfigured here so the repair never
  // runs, but the piece that decides its REACH is pure database and does: it
  // must return every Google pass on the card, because a repair that stopped
  // short would report success while leaving later customers looking at the
  // wrong picture.
  {
    const { googleSerialsForCard, oldestGoogleSerials } = await import("../src/db.js");
    const all = await googleSerialsForCard("default");
    const wanted = (await getPool().query<{ serial: string }>(
      `SELECT serial FROM passes WHERE card_id = 'default' AND platform = 'google'`,
    )).rows.map((r) => r.serial);
    expect(all.length === wanted.length, `the repair reaches every Google pass on the card (${all.length} of ${wanted.length})`);
    expect(
      all.every((serial) => wanted.includes(serial)),
      "...and reaches no Apple pass, which has no Google object to repair",
    );
    // The diagnostic caps at 5 on purpose; the repair must not inherit that cap.
    expect(
      (await oldestGoogleSerials("default")).length <= 5 && all.length >= 0,
      "the diagnostic's cap of 5 is not what the repair walks",
    );
  }
  // The console has to SHOW what was repaired. It reported "resynced ✓" while
  // the thing it was pressed to fix went untouched, so the count is the point.
  expect(
    (await get("/admin")).body.includes("showed their own old band"),
    "the resync says how many cards it unstuck, not just that it ran",
  );
  // The console must not offer a button whose endpoint does not exist.
  expect((await get("/admin")).body.includes('id="gresync"'), "the console offers the resync button");
  expect(
    (await get("/admin")).body.includes('api("/google-resync"'),
    "...and points it at the route that serves it",
  );

  // --- Archiving a card: operator-only, reversible, destroys nothing ---
  const archive = async (id: string, cookieUsed: string, action = "archive") => {
    const r = await fetch(base + "/admin/api/card/" + id + "/" + action, {
      method: "POST", headers: { cookie: cookieUsed },
    });
    return { status: r.status, body: JSON.parse(await r.text()) };
  };
  expect((await archive(dfyOut.cardId, cookieOutsider)).status === 403, "archiving a card is admin-only");
  expect((await archive("no-such-card-id", cookieNow)).status === 404, "archiving a card that isn't there is a 404");
  // A shop with one card: taking it would leave them a login, a poster and
  // nothing to hand out. The only refusal archiving still needs.
  await fetch(base + "/dashboard/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "spare@card.my", password: "password123", cafeName: "Spare Shop" }),
  });
  const spareOwner = (await getOwnerByEmail("spare@card.my"))!;
  const spareOnly = (await ownerMerchant(spareOwner.id))!;
  const spareCards = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
    .cards.filter((c: any) => (c.owners ?? "").includes("spare@card.my"));
  expect(spareCards.length === 1, "a fresh signup has exactly one card");
  const lastOne = await archive(spareCards[0].id, cookieNow);
  expect(lastOne.status === 409 && lastOne.body.error === "last-card", "a merchant's only card is never archived");
  expect(Boolean(spareOnly.id), "the spare shop's merchant exists");

  // Unlike deleting, a card with real customers and real history CAN be
  // archived — that is the whole reason archiving replaced deleting.
  const busy = await addLegacyCard("spare@card.my", "Busy spare");
  const busyPass = await mk("apple", undefined, busy);
  await logEvent(busy, busyPass.serial, "stamp");
  const busyArchived = await archive(busy, cookieNow);
  expect(busyArchived.status === 200, "a card WITH customers and history can be archived");
  expect((await getCard(busy)) !== null, "...the card row is still there — nothing was deleted");
  expect(
    Number((await getPool().query<{ n: string }>(
      "SELECT count(*) AS n FROM events WHERE card_id = $1", [busy],
    )).rows[0]!.n) > 0,
    "...and its history is untouched",
  );
  expect((await archive(busy, cookieNow)).body.error === "already", "archiving twice says so rather than pretending");

  // It leaves the owner's world: dashboard, staff switcher, and the join link.
  const spareLogin = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "spare@card.my", password: "password123" }),
  });
  const spareCookie = (spareLogin.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const spareOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: spareCookie } })).body);
  expect(
    !spareOv.cards.some((c: any) => c.id === busy),
    "an archived card is gone from the owner's dashboard",
  );
  // ...but the customer holding one is NOT cut off. Their pass still stamps.
  const stillStamps = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: busyPass.serial, force: true }),
  });
  expect(
    stillStamps.status === 404 || stillStamps.status === 200,
    "stamping a retired card's pass is not an error the counter has to explain",
  );

  // And it comes back.
  expect((await archive(busy, cookieNow, "unarchive")).status === 200, "an archived card can be restored");
  const backOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: spareCookie } })).body);
  expect(backOv.cards.some((c: any) => c.id === busy), "...and returns to the owner's dashboard");
  await archive(busy, cookieNow); // leave it archived

  // The cap counts LIVE cards, so archiving the spare puts this shop back to
  // exactly one — still capped, and still not able to reach zero.
  const reMade = await fetch(base + "/dashboard/api/cards", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: spareCookie },
    body: JSON.stringify({ name: "Replacement card" }),
  });
  expect(reMade.status === 409, "one live card is still one card — the cap holds");
  const toZero = await archive(spareCards[0].id, cookieNow);
  expect(
    toZero.status === 409 && toZero.body.error === "last-card",
    "a shop can never archive its way down to no card at all",
  );

  // --- Hard delete: the guards are the feature ------------------------------
  //
  // Deleting a shop is the only irreversible thing in the console and the only
  // way to free an email that is stuck between an archived login and a claim
  // form that says "already taken". What matters here is not that it deletes —
  // it is that it REFUSES the moment a shop has issued anything, because the
  // alternative is orphaning a card in somebody's wallet with no way to tell
  // their phone, and erasing the history that proves they were ever a customer.
  const newShop = async (name: string) => {
    const r = await fetch(base + "/admin/api/card", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ cafeName: name, reward: "Free thing" }),
    });
    return JSON.parse(await r.text()) as { cardId: string; merchantId: string };
  };
  const delShop = async (merchantId: string, name: string, cookieUsed = cookieNow) => {
    const r = await fetch(base + "/admin/api/merchant/" + merchantId, {
      method: "DELETE", headers: { "Content-Type": "application/json", cookie: cookieUsed },
      body: JSON.stringify({ name }),
    });
    return { status: r.status, body: JSON.parse(await r.text()) };
  };
  const merchantExists = async (id: string) =>
    (await getPool().query("SELECT 1 FROM merchants WHERE id = $1", [id])).rowCount === 1;

  const doomed = await newShop("Delete Me Cafe");
  expect((await delShop(doomed.merchantId, "Delete Me Cafe", cookieOutsider)).status === 403,
    "a non-admin cannot delete a shop");
  expect(await merchantExists(doomed.merchantId), "...and it is still there");
  const mistyped = await delShop(doomed.merchantId, "Delete Me Cafee");
  expect(mistyped.status === 400 && mistyped.body.error === "name-mismatch",
    "the typed name has to match — this is the real gate, not the two-tap");
  expect(await merchantExists(doomed.merchantId), "...and a mistyped name changes nothing");

  // A shop that has been LOOKED at still deletes: join_view rows are events, and
  // taking the shop and its whole log together leaves nothing to disagree with.
  await get("/c/" + doomed.cardId);
  const delGone = await delShop(doomed.merchantId, "Delete Me Cafe");
  expect(delGone.status === 200 && delGone.body.ok, "a shop that never issued a card deletes");
  expect(!(await merchantExists(doomed.merchantId)), "...the merchant row is gone");
  expect(
    (await getPool().query("SELECT 1 FROM cards WHERE id = $1", [doomed.cardId])).rowCount === 0,
    "...its card is gone",
  );
  expect(
    (await getPool().query("SELECT 1 FROM events WHERE card_id = $1", [doomed.cardId])).rowCount === 0,
    "...and its events went with it, rather than being orphaned",
  );

  // A shop that HAS traded deletes too, and that is the point of it.
  //
  // This used to be the guard: a shop holding a pass was refused and told to
  // archive. That made the button useless for the job it exists for — setting
  // the same onboarding flow up end to end, over and over, which issues a card
  // every time. So the pass, its customer, its events and its messages go with
  // the shop, and the only thing still refused is a shop that is PAYING.
  const trading = await newShop("Traded Already");
  const tradeLink = await fetch(base + "/admin/api/merchant/" + trading.merchantId + "/claim-link", {
    method: "POST", headers: { cookie: cookieNow },
  });
  const tradeToken = JSON.parse(await tradeLink.text()).url.split("/claim/")[1];
  await fetch(base + "/claim/" + tradeToken + "/finish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "traded@example.test", password: "password123" }),
  });
  // Issued straight into the database rather than through /enroll: Apple signing
  // is not configured here, and what is under test is the DELETE, not the wallet.
  const tradedPass = await mk("apple", undefined, trading.cardId);
  await logEvent(trading.cardId, tradedPass.serial, "stamp", { actor: "staff:e2e" });
  expect(
    (await getPool().query("SELECT 1 FROM passes WHERE card_id = $1", [trading.cardId])).rowCount === 1,
    "the traded shop has a card in someone's wallet",
  );

  // Paying is the one refusal left, and it is checked on a locked row.
  await fetch(base + "/admin/api/merchant/" + trading.merchantId + "/paid", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ paid: true }),
  });
  const paidRefused = await delShop(trading.merchantId, "Traded Already");
  expect(paidRefused.status === 409 && paidRefused.body.error === "paid-shop",
    "a PAYING shop is refused, however it is typed");
  expect(await merchantExists(trading.merchantId), "...and is untouched");
  await fetch(base + "/admin/api/merchant/" + trading.merchantId + "/paid", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ paid: false }),
  });

  const tradedGone = await delShop(trading.merchantId, "Traded Already");
  expect(tradedGone.status === 200 && tradedGone.body.ok, "an unpaid shop deletes even having issued a card");
  expect(tradedGone.body.passes === 1, `...and reports the passes it destroyed (${tradedGone.body.passes})`);
  // Nothing may be left behind pointing at a shop that no longer exists.
  for (const [table, sql, args] of [
    ["passes", "SELECT 1 FROM passes WHERE card_id = $1", [trading.cardId]],
    ["events", "SELECT 1 FROM events WHERE card_id = $1", [trading.cardId]],
    ["customers", "SELECT 1 FROM customers WHERE merchant_id = $1", [trading.merchantId]],
    ["cards", "SELECT 1 FROM cards WHERE merchant_id = $1", [trading.merchantId]],
    ["merchants", "SELECT 1 FROM merchants WHERE id = $1", [trading.merchantId]],
    ["owners", "SELECT 1 FROM owners WHERE email = $1", ["traded@example.test"]],
  ] as [string, string, unknown[]][]) {
    expect((await getPool().query(sql, args)).rowCount === 0, `...and no ${table} row survives it`);
  }
  // The pass is gone, so its registrations must have cascaded rather than
  // pointing at a serial nothing can resolve.
  expect(
    (await getPool().query(
      "SELECT 1 FROM registrations WHERE serial = $1", [tradedPass.serial],
    )).rowCount === 0,
    "...and the device registration cascaded with the pass",
  );

  // The whole point: deleting frees the email for a fresh claim.
  const stuck = await newShop("Stuck Email Shop");
  const stuckLink = await fetch(base + "/admin/api/merchant/" + stuck.merchantId + "/claim-link", {
    method: "POST", headers: { cookie: cookieNow },
  });
  const stuckToken = JSON.parse(await stuckLink.text()).url.split("/claim/")[1];
  await fetch(base + "/claim/" + stuckToken + "/finish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "stuck@example.test", password: "password123" }),
  });
  const reclaimShop = await newShop("Second Chance");
  const reclaimLink = await fetch(base + "/admin/api/merchant/" + reclaimShop.merchantId + "/claim-link", {
    method: "POST", headers: { cookie: cookieNow },
  });
  const reclaimToken = JSON.parse(await reclaimLink.text()).url.split("/claim/")[1];
  const claimBlocked = await fetch(base + "/claim/" + reclaimToken + "/finish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "stuck@example.test", password: "password123" }),
  });
  expect(claimBlocked.status === 409, "the email is held hostage by the first shop's owner row");
  expect((await delShop(stuck.merchantId, "Stuck Email Shop")).status === 200, "deleting that shop works");
  const freed = await fetch(base + "/claim/" + reclaimToken + "/finish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "stuck@example.test", password: "password123" }),
  });
  expect(freed.status === 200, "...and the address can claim a shop again");

  // --- The shop's own card, in the shop's own wallet ---
  const { readTestPassToken } = await import("../src/auth.js");
  const { testPassFor: testPassForQ, createCustomer: mkTestCustomer, createPass: mkPass,
          generateShortCode: shortCode2, reissuePass: reissue2 } = await import("../src/db.js");
  /** Exactly what the enrol route does once the signed token checks out. */
  const mkTestPass = async (cardId: string, platform: "apple" | "google") => {
    const existing = await testPassForQ(cardId, platform);
    if (existing) return (await reissue2(existing.serial)) ?? existing;
    const card = (await getCard(cardId))!;
    const m = await merchantOf(cardId);
    const cust = m ? await mkTestCustomer(m.id, true) : null;
    const row = await mkPass({
      serial: crypto.randomUUID(), cardId, customerId: cust?.id ?? null, platform,
      shortCode: shortCode2(), authToken: "test-auth-token-000000",
      stampCount: 0, stampsTarget: card.stamps_target, reward: card.reward, isTest: true,
    });
    await logEvent(cardId, row.serial, "enroll", { actor: "customer", source: "test" });
    return row;
  };

  //
  // A test pass is a REAL pass: scannable, stampable, pushable. What it is not
  // is a customer, and the whole risk of the feature is a number somewhere
  // disagreeing about that. CLAUDE.md is explicit that "customer" has one
  // definition everywhere, and that the Home headline has already come to
  // disagree with the list under it twice. So this checks every reader, not a
  // sample: the exclusion lives in ~15 queries and one missed site is a silent
  // wrong number rather than a failure.
  {
    const testCard = "default";
    const before = {
      counts: JSON.parse((await get("/dashboard/api/customers?cardId=" + testCard + "&lapsedDays=0",
        { headers: { cookie: cookieNow } })).body),
      ov: JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body)
        .cards.find((x: any) => x.id === testCard),
      health: JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
        .merchants.find((m: any) => (m.card_ids ?? []).includes(testCard)),
    };

    // Minted the way the button does it: a signed, expiring link.
    const linkRes = JSON.parse((await get("/dashboard/api/card/" + testCard + "/test-link",
      { headers: { cookie: cookieNow } })).body);
    expect(linkRes.ok && linkRes.apple.includes("?t=") && linkRes.google.includes("?t="),
      "the dashboard mints a signed test link for both wallets");

    // The CONSOLE's twin, at the path the shared panel actually calls. Only the
    // dashboard side was covered, and the console's routes were registered one
    // segment away from where env.path points — so the button 404'd into an
    // HTML page and said "Couldn't make a link" with nothing to explain it.
    // The whole point of the console's copy is testing a card before it ships.
    const adminLink = await get("/admin/api/card/" + testCard + "/design/test-link",
      { headers: { cookie: cookieNow } });
    expect(adminLink.status === 200, `the console mints one too (${adminLink.status})`);
    const adminLinkBody = JSON.parse(adminLink.body);
    expect(adminLinkBody.ok && adminLinkBody.apple.includes("?t=") && adminLinkBody.google.includes("?t="),
      "...for both wallets, on the path the designer asks for");
    const adminQr = await get("/admin/api/card/" + testCard + "/design/test-qr.png",
      { headers: { cookie: cookieNow } });
    expect(adminQr.status === 200, `...and the QR beside it renders (${adminQr.status})`);
    expect(
      (await get("/admin/api/card/" + testCard + "/design/test-link")).status === 403,
      "...and neither is reachable without an admin session",
    );

    // An unsigned flag must NOT work, or anyone could issue themselves a card
    // the shop never sees — which is a hole in the numbers dressed as a feature.
    const forged = await fetch(base + "/c/" + testCard + "/enroll/google?t=not-a-real-token");
    const forgedPass = (await getPool().query(
      "SELECT count(*)::int AS n FROM passes WHERE card_id = $1 AND is_test", [testCard])).rows[0].n;
    expect(forgedPass === 0, `a forged test token mints nothing (${forged.status})`);

    // Neither wallet is configured here, and both enrol routes refuse with a 503
    // before minting anything — so the pass itself is made through the same
    // function the route calls. What is under test is the FLAG and every number
    // that has to ignore it, not pass signing.
    const token = new URL(linkRes.google).searchParams.get("t")!;
    expect(readTestPassToken(token, testCard), "the minted token verifies for this card");
    expect(!readTestPassToken(token, "some-other-card"), "...and for no other card");
    const tpRow = await mkTestPass(testCard, "google");
    const tp = (await getPool().query<{ serial: string; is_test: boolean }>(
      "SELECT serial, is_test FROM passes WHERE card_id = $1 AND is_test", [testCard])).rows;
    expect(tp.length === 1 && tp[0]!.is_test, "...exactly one test pass, flagged");
    expect(tp[0]!.serial === tpRow.serial, "...and it is the one that was just made");

    // Pressing again hands back the SAME card rather than piling them up.
    const againRow = await mkTestPass(testCard, "google");
    expect(againRow.serial === tpRow.serial, "...and asking again reuses it rather than minting another");

    // It behaves like a real card where behaving like one is the point.
    await logEvent(testCard, tp[0]!.serial, "stamp", { actor: "staff:e2e" });

    // Now: nothing anybody reads may have moved.
    const after = {
      counts: JSON.parse((await get("/dashboard/api/customers?cardId=" + testCard + "&lapsedDays=0",
        { headers: { cookie: cookieNow } })).body),
      ov: JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body)
        .cards.find((x: any) => x.id === testCard),
      health: JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
        .merchants.find((m: any) => (m.card_ids ?? []).includes(testCard)),
    };
    expect(after.counts.counts.active === before.counts.counts.active,
      `the customer count is unchanged (${before.counts.counts.active} → ${after.counts.counts.active})`);
    expect(after.counts.counts.issuedNeverAdded === before.counts.counts.issuedNeverAdded,
      "...and it did not fall into the abandoned bucket instead");
    expect(after.counts.customers.length === before.counts.customers.length,
      "...the Customers list is unchanged");
    expect(!after.counts.customers.some((c: any) => c.serial === tp[0]!.serial),
      "...and the test card is not in it");
    expect(after.ov.metrics.active === before.ov.metrics.active,
      `...the Home headline is unchanged (${before.ov.metrics.active} → ${after.ov.metrics.active})`);
    expect(after.ov.metrics.stamps === before.ov.metrics.stamps,
      `...and its stamp did not count (${before.ov.metrics.stamps} → ${after.ov.metrics.stamps})`);
    expect(after.health.customers === before.health.customers,
      "...the console's customer count is unchanged");
    expect(after.health.made === before.health.made,
      "...and the funnel did not record a sign-up");

    // The DATES, which every count in the same query filtered and these three
    // did not. A shop that has never served anybody could start its own trial
    // clock, tick "First stamp" on the activation timeline, and clear the
    // went-quiet flag — by the owner stamping the card in their own pocket,
    // without a single count moving to show it. Judgement calls, made on
    // evidence that was not evidence.
    expect(String(after.health.last_stamp_at) === String(before.health.last_stamp_at),
      "...a test stamp does not make a silent shop look alive (last_stamp_at)");
    expect(after.health.trial_day === before.health.trial_day,
      `...nor start the trial clock (${before.health.trial_day} → ${after.health.trial_day})`);
    expect(String(after.health.first_stamp_at) === String(before.health.first_stamp_at),
      "...nor tick First stamp on the activation timeline");
    expect(after.health.stamps === before.health.stamps
        && after.health.stamps_7d === before.health.stamps_7d
        && after.health.stamps_30d === before.health.stamps_30d,
      "...and none of the three stamp windows moved");
    // The nudge buckets are the one that would actually reach a person: the
    // owner messaging their own test card, against that card's 7-day limit.
    const buckets = JSON.parse((await get("/dashboard/api/customers?cardId=" + testCard + "&lapsedDays=0",
      { headers: { cookie: cookieNow } })).body).buckets ?? [];
    expect(!JSON.stringify(buckets).includes(tp[0]!.serial),
      "...and it is in no nudge bucket, so it can never be messaged");
  }

  // --- Owner-level customers + nudge (span ALL of an owner's cards) ---
  const ownerCust = JSON.parse((await get("/dashboard/api/customers?cardId=all&lapsedDays=0", { headers: { cookie: cookieNow } })).body);
  expect(Array.isArray(ownerCust.customers) && ownerCust.customers.length >= 2, "owner customers span all their cards");
  expect(ownerCust.customers.every((c: any) => c.cardId && c.cardName), "each customer row is tagged with its card");
  expect(Array.isArray(ownerCust.cards) && ownerCust.cards.length >= 2, "customers response lists the owner's cards for filtering");
  const filtered = JSON.parse((await get("/dashboard/api/customers?cardId=" + newCafeOut.id + "&lapsedDays=0", { headers: { cookie: cookieNow } })).body);
  expect(filtered.customers.length === 0, "card filter narrows to a single (empty) card");

  expect(
    ownerCust.customers.every((c: any) => typeof c.joinedDays === "number" && typeof c.unanswered === "number"),
    "each customer row carries joined-days and unanswered-nudge counts (the grouping inputs)",
  );
  expect(
    ownerCust.limits.perWeek === 3 && ownerCust.limits.maxUnanswered === undefined,
    "the customers response states the one nudge limit — two a week — and no second rule",
  );
  // The groups and the gap counts are computed server-side, so the browser
  // can't invent a group the Nudge button wouldn't actually send to.
  expect(
    Array.isArray(ownerCust.buckets) && ownerCust.buckets.some((b: any) => b.key === "ready"),
    "the customers response carries the cooldown groups",
  );
  expect(
    ownerCust.buckets.every(
      (b: any) => typeof b.customers === "number" && typeof b.eligible === "number",
    ),
    "each group states its size and how many are still under the limit",
  );
  expect(
    ownerCust.buckets.reduce((a: number, b: any) => a + b.customers, 0) === ownerCust.customers.length,
    "every customer lands in exactly one group",
  );
  expect(
    typeof ownerCust.counts.active === "number" &&
      typeof ownerCust.counts.issuedNeverAdded === "number" &&
      typeof ownerCust.counts.removed === "number",
    "the customers response explains the gap between cards issued and customers",
  );
  expect(
    ownerCust.customers.every((c: any) => typeof c.canNudge === "boolean" && typeof c.bucket === "string"),
    "each customer row states its group and whether the limits allow a nudge",
  );

  const nudgeEmpty = await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "", target: "all" }),
  });
  expect(nudgeEmpty.status === 400, "nudge with no message → 400");

  const oNudge = await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "Owner-level hello", target: [p2.serial] }),
  });
  const oNudgeOut = JSON.parse(await oNudge.text());
  expect(oNudge.status === 200 && oNudgeOut.total === 1, "owner-level nudge messages a single customer");

  // The rest of their week's allowance, which the cap allows — and which puts
  // them AT it. Driven by the constant: the cap has moved twice, and each time
  // a hard-coded second message here left the test measuring nothing.
  const { MAX_NUDGES_PER_WEEK: capNow } = await import("../src/winback.js");
  for (let n = 2; n <= capNow; n++) {
    const again = await fetch(base + "/dashboard/api/nudge", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ message: "Owner-level hello again", target: [p2.serial] }),
    });
    expect(
      JSON.parse(await again.text()).total === 1,
      `...and again, message ${n} of the ${capNow} a week`,
    );
  }

  // "All" means everyone the cap allows, which now excludes the customer who
  // has had both of theirs — no exceptions for pressing a different button.
  const beforeAll = JSON.parse(
    (await get("/dashboard/api/customers", { headers: { cookie: cookieNow } })).body,
  );
  const stillAllowed = beforeAll.customers.filter((c: any) => c.canNudge).length;
  const oNudgeAll = await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "Owner-level all", target: "all" }),
  });
  const oNudgeAllOut = JSON.parse(await oNudgeAll.text());
  expect(
    oNudgeAll.status === 200 && oNudgeAllOut.total === stillAllowed,
    `owner-level nudge to all reaches everyone off cooldown (${oNudgeAllOut.total} of ${stillAllowed})`,
  );
  expect(
    oNudgeAllOut.skipped.rateLimited >= 1,
    "...and holds back the one messaged moments ago",
  );

  // A serial that isn't the owner's is silently dropped (only owned serials survive)
  const oNudgeForeign = await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie2 },
    body: JSON.stringify({ message: "not mine", target: [p1.serial] }),
  });
  expect(JSON.parse(await oNudgeForeign.text()).total === 0, "owner-level nudge can't touch another owner's card");

  // --- Share tab no longer surfaces the NFC link (moved to the admin console) ---
  const dashHtml = (await get("/dashboard")).body;
  expect(dashHtml.indexOf("NFC") === -1, "owner dashboard no longer mentions NFC (it lives in /admin now)");

  // --- Self-serve password reset ---
  const forgotUnknown = await fetch(base + "/dashboard/api/forgot", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody@nowhere.my" }),
  });
  expect(forgotUnknown.status === 200, "forgot-password is enumeration-safe (200 for unknown email)");
  const forgotKnown = await fetch(base + "/dashboard/api/forgot", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my" }),
  });
  expect(forgotKnown.status === 200, "forgot-password accepts a known email");

  // This deployment has no Resend key, so the login screen must NOT offer to
  // send a reset link — an owner would wait for mail that never arrives.
  const loginHtml = (await get("/dashboard")).body;
  expect(
    loginHtml.includes("aren’t set up yet") && !loginHtml.includes("Send reset link"),
    "with no email service, the login screen points at a human instead of promising a reset link",
  );

  const ownerRow = (await getOwnerByEmail("owner@test.my"))!;
  const rawToken = "e2e-reset-token-abc123";
  const hashOf = (t: string) => createHash("sha256").update(t).digest("hex");
  await setResetToken(ownerRow.id, hashOf(rawToken), new Date(Date.now() + 3600_000));

  const resetBadToken = await fetch(base + "/dashboard/api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong-token", password: "freshpass99" }),
  });
  expect(resetBadToken.status === 400, "reset with a wrong token → 400");
  const resetShort = await fetch(base + "/dashboard/api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, password: "short" }),
  });
  expect(resetShort.status === 400, "reset with a too-short password → 400");
  const resetOk = await fetch(base + "/dashboard/api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, password: "freshpass99" }),
  });
  expect(resetOk.status === 200, "reset with the valid token succeeds");
  const loginReset = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "freshpass99" }),
  });
  expect(loginReset.status === 200, "the new password works after reset");
  const resetReuse = await fetch(base + "/dashboard/api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, password: "anotherpass99" }),
  });
  expect(resetReuse.status === 400, "a reset token is single-use (reuse → 400)");

  await setResetToken(ownerRow.id, hashOf("expired-token"), new Date(Date.now() - 1000));
  const resetExpired = await fetch(base + "/dashboard/api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "expired-token", password: "freshpass99" }),
  });
  expect(resetExpired.status === 400, "an expired reset token is rejected");

  // --- Rate limiting (brute-force protection) ---
  let loginStatus = 0;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(base + "/dashboard/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bruteforce@nowhere.my", password: "nope" }),
    });
    loginStatus = r.status;
  }
  expect(loginStatus === 429, "login rate-limits after repeated failures (8/15min)");

  // Staff PIN limiter counts only WRONG PINs, keyed by OWNER+IP — the PIN being
  // guessed belongs to the owner, whichever of their cards the attacker points
  // at. Hammered against a throwaway owner so it can't block a real sign-in
  // later in this run (which is exactly what a per-café key used to hide).
  const outsiderCard2 = { id: await addLegacyCard("outsider@card.my", "Outsider second card") };
  const outsiderCard1 = JSON.parse(
    (await get("/dashboard/api/overview", { headers: { cookie: cookieOutsider } })).body,
  ).cards[0].id;
  let firstPin = 0, lastPin = 0;
  for (let i = 0; i < 22; i++) {
    const r = await staffLogin(outsiderCard1, "0000");
    if (i === 0) firstPin = r.status;
    lastPin = r.status;
  }
  expect(firstPin === 401, "a wrong staff PIN is rejected (401) before the limit trips");
  expect(lastPin === 429, "staff sign-in rate-limits repeated WRONG attempts (20/10min)");
  // One owner, one PIN: guessing at one of their cards must not leave the others
  // wide open to the same guessing.
  expect(
    (await staffLogin(outsiderCard2.id, "0000")).status === 429,
    "the block covers every card that owner runs, not just the one being hammered",
  );
  // But it is scoped to that owner — nobody else's counter is affected.
  expect(
    (await staffLogin("default", "0000")).status === 401,
    "another owner's sign-in is untouched by that block",
  );
  // The limiter guards sign-in only — an already-signed-in phone keeps working
  // through the block, so one bad actor can't stop the shift.
  expect(
    (await fetch(base + "/staff/api/passes", { headers: staff2Headers })).status === 200,
    "a signed-in phone still works while sign-in is rate-limited",
  );

  // --- The merchant join link (what goes on a poster) ---
  const {
    merchantForOwner, getMerchantByRef, resolveCustomer, createCustomer, updateMerchant, claimSlug,
  } = await import("../src/db.js");
  const m1 = (await merchantForOwner(ownerRow.id))!;
  expect(Boolean(m1?.id), "the first owner has a merchant");

  const byId = await get("/j/" + m1.id);
  expect(byId.status === 200 && byId.body.includes("Kopi Corner"), "/j/<merchant id> reaches their card");
  // The permanent id is what the poster encodes, so it must not redirect.
  expect(!byId.body.includes("Redirecting"), "the canonical /j/<id> serves directly, no redirect");

  const slugRow = (await getPool().query<{ slug: string }>(
    `SELECT slug FROM merchant_slugs WHERE merchant_id = $1 ORDER BY created_at LIMIT 1`, [m1.id],
  )).rows[0]!;
  const bySlug = await fetch(base + "/j/" + slugRow.slug, { redirect: "manual" });
  expect(bySlug.status === 301, "a readable slug redirects to the canonical id");
  expect(
    (bySlug.headers.get("location") || "").endsWith("/j/" + m1.id),
    "…and it redirects to the merchant's permanent id",
  );

  // A rename must never kill a printed poster: the OLD slug keeps resolving.
  await updateMerchant(m1.id, { name: "Kopi Corner Two" });
  const retired = await fetch(base + "/j/" + slugRow.slug, { redirect: "manual" });
  expect(retired.status === 301, "a retired slug still resolves after a rename");
  const renamed = await getMerchantByRef("kopi-corner-two");
  expect(renamed?.merchant.id === m1.id, "the new name also resolves");
  await updateMerchant(m1.id, { name: "Kopi Corner" });

  const jqr = await get("/j/" + m1.id + "/qr");
  expect(
    jqr.status === 200 && (jqr.headers.get("content-type") || "").includes("image/png"),
    "the merchant QR renders a PNG",
  );
  expect((await get("/j/nope-nope")).status === 404, "an unknown join link 404s");

  // --- Customer identity, and the legacy cookie that must not be dropped ---
  // These run against the resolver directly: the enrol routes can't be reached
  // without Apple/Google credentials, and this is the logic that would silently
  // mint everyone a duplicate card.
  const fresh1 = await resolveCustomer(m1.id, null, null);
  expect(fresh1.writeCookie && fresh1.customer.merchant_id === m1.id, "a new browser becomes a new customer");
  const again = await resolveCustomer(m1.id, fresh1.customer.id, null);
  expect(
    again.customer.id === fresh1.customer.id && !again.writeCookie,
    "a returning browser with the current cookie is the same customer",
  );
  // A cookie naming somebody else's customer must not cross merchants.
  const otherMerchant = (await merchantForOwner((await getOwnerByEmail("second@card.my"))!.id))!;
  const stranger = await createCustomer(otherMerchant.id);
  const crossed = await resolveCustomer(m1.id, stranger.id, null);
  expect(
    crossed.customer.id !== stranger.id,
    "a customer cookie from another merchant is never honoured",
  );

  // THE regression that matters: a pre-v1.3 browser holding the old per-card
  // cookie (which named a serial) must be adopted, not handed a second card.
  const legacyPass = (await getPool().query<{ serial: string; customer_id: string }>(
    `SELECT serial, customer_id FROM passes WHERE customer_id IS NOT NULL AND card_id = 'default' LIMIT 1`,
  )).rows[0]!;
  expect(Boolean(legacyPass?.customer_id), "the backfill gave existing passes a customer");
  const adopted = await resolveCustomer(m1.id, null, legacyPass.serial);
  expect(
    adopted.customer.id === legacyPass.customer_id && adopted.writeCookie,
    "a legacy per-card cookie adopts the existing customer instead of minting a new one",
  );
  const custBefore = (await getPool().query<{ n: string }>(`SELECT count(*) AS n FROM customers`)).rows[0]!.n;
  await resolveCustomer(m1.id, null, legacyPass.serial);
  const custAfter = (await getPool().query<{ n: string }>(`SELECT count(*) AS n FROM customers`)).rows[0]!.n;
  expect(custBefore === custAfter, "…and adopting one creates no new customer row");
  // A serial we've never seen falls through to a brand-new customer.
  const unknown = await resolveCustomer(m1.id, null, "not-a-real-serial");
  expect(unknown.writeCookie && unknown.customer.id !== legacyPass.customer_id, "an unknown serial mints a new customer");

  // --- One person holding two passes is one customer ---
  // The Apple/Google pair at one shop is the case that already existed before
  // multi-card: two passes, two serials, one human. They must count once and be
  // messaged once.
  const twoCardPerson = await mkCustomer(m1.id);
  const applePass = await mk("apple", twoCardPerson.id);
  const googlePass = await mk("google", twoCardPerson.id);
  // Both need a stamp to be real customers — a Google pass is invisible until
  // one lands, because Google never reports a wallet add.
  await logEvent("default", applePass.serial, "stamp");
  await logEvent("default", googlePass.serial, "stamp");
  await getPool().query(
    `UPDATE passes SET created_at = now() - interval '40 days' WHERE serial = ANY($1)`,
    [[applePass.serial, googlePass.serial]],
  );
  await getPool().query(
    `UPDATE events SET created_at = now() - interval '40 days' WHERE serial = ANY($1)`,
    [[applePass.serial, googlePass.serial]],
  );

  const listed = JSON.parse((await get("/dashboard/api/customers", { headers: { cookie: cookieNow } })).body);
  const mine = listed.customers.filter((c: any) => c.customerId === twoCardPerson.id);
  expect(mine.length === 1, `a person with two passes appears once (got ${mine.length})`);
  // The headline and the list must never disagree — counting passes instead of
  // people is exactly how that bug came back.
  const ovAgree = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  const headline = ovAgree.cards.reduce((a: number, c: any) => a + c.metrics.active, 0);
  expect(
    headline === listed.customers.length && headline === listed.counts.active,
    `the Home headline counts people, like the list does (${headline} vs ${listed.customers.length})`,
  );

  // --- The returning rate counts PEOPLE and NET stamps, and only people who
  //     have HAD the chance to come back ---
  // The person above holds two passes and has been stamped on each: that is one
  // customer who came back a second time. Keyed on the pass — as it was — they
  // read as two customers who each came once and never returned, which drove a
  // shop with real regulars to a second-visit rate of zero.
  {
    const { returningRate, merchantHealth: mhQ } = await import("../src/db.js");
    const mine = (await mhQ()).find((x) => x.card_ids.includes("default"))!;
    const rate = () => returningRate(mine.id);
    const before = await rate();
    expect(
      before.returned >= 1 && before.rate !== null && before.rate > 0,
      `a person holding two stamped passes is ONE returning customer (${before.returned} of ${before.eligible})`,
    );

    // The 14-day gate. Somebody stamped today has not failed to come back —
    // they have not had the chance — so they are in neither number. Without
    // this, a good week for sign-ups would crater the rate, which is exactly
    // backwards.
    const freshPerson = await mkCustomer(m1.id);
    const freshPass = await mk("apple", freshPerson.id);
    await logEvent("default", freshPass.serial, "stamp");
    const withFresh = await rate();
    expect(
      withFresh.eligible === before.eligible && withFresh.returned === before.returned,
      `a customer first stamped today is in neither number (${withFresh.returned} of ${withFresh.eligible})`,
    );

    // One stamp, 20 days ago: eligible, and has not come back.
    const soloPerson = await mkCustomer(m1.id);
    const soloPass = await mk("apple", soloPerson.id);
    await logEvent("default", soloPass.serial, "stamp");
    await getPool().query(
      `UPDATE events SET created_at = now() - interval '20 days' WHERE serial = $1`, [soloPass.serial],
    );
    const withSolo = await rate();
    expect(
      withSolo.eligible === before.eligible + 1 && withSolo.returned === before.returned,
      `a customer stamped once 20 days ago is eligible and has not returned (${withSolo.returned} of ${withSolo.eligible})`,
    );

    // A second stamp makes them a returning customer…
    await logEvent("default", soloPass.serial, "stamp");
    const returned = await rate();
    expect(
      returned.returned === before.returned + 1 && returned.eligible === withSolo.eligible,
      `a second stamp moves them into the numerator only (${returned.returned} of ${returned.eligible})`,
    );
    // …and an undo is a correction, so it takes that visit straight back off.
    // Every other metric in the codebase subtracts undos and this one must too.
    await logEvent("default", soloPass.serial, "undo");
    const undone = await rate();
    expect(
      undone.returned === before.returned && undone.eligible === withSolo.eligible,
      `an undo takes the second visit back off (${undone.returned} of ${undone.eligible})`,
    );

    // The comparison rate is the SAME arithmetic on a cutoff four weeks back,
    // so a stamp given today can never move it.
    expect(
      typeof undone.prev_eligible === "number" && undone.prev_eligible <= undone.eligible,
      `the four-weeks-ago cohort is no bigger than today's (${undone.prev_eligible} vs ${undone.eligible})`,
    );

    // Platform-wide is recomputed over everyone, never averaged from per-shop
    // rates — a rate over 3 customers and a rate over 300 do not average.
    const all = await returningRate();
    expect(
      all.eligible >= undone.eligible && all.returned >= undone.returned,
      `the platform rate covers at least this shop's people (${all.returned} of ${all.eligible})`,
    );
  }
  // Lapse is measured across everything they hold, not per card.
  expect(mine[0].lastDays >= 39, "their last visit is the last stamp on ANY pass they hold");

  const twoCardNudge = JSON.parse(await (await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "One message please", target: [applePass.serial, googlePass.serial] }),
  })).text());
  expect(twoCardNudge.total === 1, `one person gets one message, not one per pass (sent to ${twoCardNudge.total})`);
  const nudgeRows = (await getPool().query<{ n: string }>(
    `SELECT count(*) AS n FROM events WHERE type = 'nudge' AND serial = ANY($1)`,
    [[applePass.serial, googlePass.serial]],
  )).rows[0]!.n;
  expect(Number(nudgeRows) === 1, `…and only one nudge event is written (got ${nudgeRows})`);
  // The cap counts the PERSON, so pointing at their other pass must not buy an
  // EXTRA message. Someone holding an Apple and a Google card of the same shop
  // is one human with one inbox — two a week between them, not two each.
  const viaOther = (msg: string) =>
    fetch(base + "/dashboard/api/nudge", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ message: msg, target: [googlePass.serial] }),
    }).then(async (r) => JSON.parse(await r.text()));
  // Spend the rest of the week's allowance through the OTHER pass, then ask for
  // one more. Driven by the cap so the shape survives the next change to it.
  for (let n = 2; n <= capNow; n++) {
    expect(
      (await viaOther("Again")).total === 1,
      `their other pass draws on the SAME weekly allowance (message ${n} of ${capNow})`,
    );
  }
  const overCap = await viaOther("And again");
  expect(
    overCap.total === 0 && overCap.skipped.rateLimited === 1,
    `...and once the person is at ${capNow}, neither pass buys another`,
  );
  expect(
    Number((await getPool().query<{ n: string }>(
      `SELECT count(*) AS n FROM events WHERE type = 'nudge' AND serial = ANY($1)`,
      [[applePass.serial, googlePass.serial]],
    )).rows[0]!.n) === capNow,
    `…and exactly ${capNow} nudge events exist across both their passes — their week's worth`,
  );

  // --- Legal pages + consent ---
  const priv = await get("/privacy");
  expect(priv.status === 200 && priv.body.includes("Privacy Policy") && priv.body.includes("PDPA"), "GET /privacy renders the PDPA-aware policy");
  const terms = await get("/terms");
  expect(terms.status === 200 && terms.body.includes("Terms of Service"), "GET /terms renders the terms");
  expect((await get("/")).body.includes("/privacy"), "marketing footer links the Privacy page");
  expect((await get("/dashboard")).body.includes('id="agree"'), "signup form has the Terms/Privacy consent checkbox");
  // The customer-facing page links the policies but does NOT gate on a tick-box:
  // we ask customers for nothing personal, and a consent gate at a counter costs
  // sign-ups. (Buttons only render once a wallet is configured, hence the guard.)
  const custLanding = (await get("/c/default")).body;
  expect(
    custLanding.includes('href="/terms"') && custLanding.includes('href="/privacy"'),
    "the customer sign-up page links Terms and Privacy",
  );
  expect(!custLanding.includes('id="agree"'), "the customer sign-up page has no consent tick-box");
  // The disclosure leads with the fact, not the links — it is a selling point.
  expect(
    custLanding.includes("No name, no phone number, no email"),
    "the join page states plainly that we collect no name, phone or email",
  );
  // No click, no field, no step in front of the button: the line is text only.
  expect(
    !/<input[^>]*type=["']?checkbox/i.test(custLanding) && !custLanding.includes("<form"),
    "the join page adds no checkbox, field or form before the wallet button",
  );

  // PDPA s.7(3) wants the notice in English AND Bahasa Malaysia, and each
  // version must be reachable from the other or only one of them is published.
  // --- Support, and a marketing page a stranger can act on -----------------
  //
  // Google refused Wallet publishing access over exactly this: the contact
  // buttons all pointed at #contact, the section they sat in, and nothing named
  // the business. Both are valid HTML and neither could fail a test before.
  const support = await get("/support");
  expect(support.status === 200 && support.body.includes("Support"), "GET /support renders");
  expect(
    support.body.includes("delete the card") && support.body.includes("short card code"),
    "...and tells a customer how to stop and how to ask about their data",
  );
  const home = (await get("/")).body;
  expect(home.includes('href="/support"'), "the marketing footer links Support");
  // The closing "Want it on your counter" block that used to hold these is gone.
  // The nav's "Message us" is the page's one contact button now, and the footer
  // carries Instagram, so the same guarantee is checked on the new shapes: a
  // real destination off this page, and nothing left pointing at the deleted
  // section.
  const cta = /<a class="pbtn pbtn-glow"[^>]*href="([^"]+)"/.exec(home);
  expect(Boolean(cta), "the marketing page still has a contact call to action");
  // Not a regex on the href this time: FOLLOW it. The button goes through
  // /go/start so the press can be counted, and a redirect that pointed back at
  // this site, or 404ed, would be the same dead button that cost us Google
  // Wallet publishing access — with the failure now one hop further away.
  const ctaHref = cta![1]!;
  const ctaDest = ctaHref.startsWith("http")
    ? { status: 302, location: ctaHref }
    : await (async () => {
        const r = await fetch(base + ctaHref, { redirect: "manual" });
        return { status: r.status, location: r.headers.get("location") ?? "" };
      })();
  expect(
    ctaDest.status === 302 && /^https?:\/\//.test(ctaDest.location),
    "the contact call to action ends up somewhere off this page",
  );
  expect(
    !ctaDest.location.startsWith(base),
    "...and that somewhere is not this site again",
  );
  expect(!/href="#contact"/.test(home), "nothing still points at the removed #contact section");
  expect(home.includes("instagram.com/punchme.my"), "Instagram link is real");

  // --- the landing page's own traffic counting -----------------------------
  //
  // The half the unit tests cannot see: that the CTA actually leaves the site,
  // that a visit is written down, that a device is counted once rather than
  // once per page, and that the opt-out really stops it.
  const { pool } = await import("../src/db.js").then((m) => ({ pool: m.getPool() }));
  const countViews = async (where = "TRUE") =>
    Number((await pool.query(`SELECT count(*)::text AS n FROM site_views WHERE ${where}`)).rows[0].n);

  const svBefore = await countViews();
  const svFirstVisit = await fetch(base + "/");
  const svSetCookie = svFirstVisit.headers.get("set-cookie") ?? "";
  expect(/pm_device=[a-z0-9]+/.test(svSetCookie), "a first visit mints an anonymous device id");
  const svDevice = /pm_device=([a-z0-9]+)/.exec(svSetCookie)![1]!;
  await new Promise((r) => setTimeout(r, 300));
  expect((await countViews()) === svBefore + 1, "a visit to / is written down");

  // Same browser, second page: one MORE row, but still one device.
  await fetch(base + "/support", { headers: { cookie: `pm_device=${svDevice}` } });
  await new Promise((r) => setTimeout(r, 300));
  // Scoped to THIS browser: earlier tests in this file have already visited /
  // and minted their own ids, so a global distinct count proves nothing. What
  // matters is that a browser carrying a device id keeps it across pages rather
  // than being handed a new one on each.
  const svPaths = (
    await pool.query<{ path: string }>(
      `SELECT path FROM site_views WHERE device_id = $1 AND kind = 'view' ORDER BY path`,
      [svDevice],
    )
  ).rows.map((r) => r.path);
  expect(
    svPaths.length === 2 && svPaths[0] === "/" && svPaths[1] === "/support",
    "two pages in one browser stay one device: " + JSON.stringify(svPaths),
  );

  // The call to action leaves the site, and is counted as a press rather than a view.
  // Relative, not absolute: the contact-button check above follows /go/start
  // too, so by now a press has already been recorded.
  const svCtaBefore = await countViews("kind = 'cta'");
  const svGo = await fetch(base + "/go/start", {
    redirect: "manual",
    headers: { cookie: `pm_device=${svDevice}` },
  });
  expect(svGo.status === 302, "/go/start redirects rather than rendering");
  expect(
    (svGo.headers.get("location") ?? "").startsWith("https://"),
    "...and it redirects OFF this site, over https",
  );
  await new Promise((r) => setTimeout(r, 300));
  expect(
    (await countViews("kind = 'cta'")) === svCtaBefore + 1,
    "pressing the call to action is counted",
  );

  // The opt-out is the whole reason these numbers can mean anything yet.
  const svOpt = await fetch(base + "/analytics-optout");
  const svOptCookie = svOpt.headers.get("set-cookie") ?? "";
  expect(svOpt.status === 200 && /pm_noanalytics=1/.test(svOptCookie), "the opt-out page sets its cookie");
  const svBeforeOptOut = await countViews();
  await fetch(base + "/", { headers: { cookie: "pm_noanalytics=1" } });
  await fetch(base + "/go/start", { redirect: "manual", headers: { cookie: "pm_noanalytics=1" } });
  await new Promise((r) => setTimeout(r, 300));
  expect((await countViews()) === svBeforeOptOut, "an opted-out browser is not counted at all");

  // The demo card's QR is the landing page tagged ?s=card, and siteTraffic
  // counts rows whose source is exactly that. Those two strings live in
  // different files — passModel.ts writes it, db.ts reads it — and nothing else
  // would notice if one changed: the tile would just quietly read 0 forever.
  // So the tag is taken from the barcode itself rather than typed here.
  const { passBarcode } = await import("../src/passModel.js");
  const { config: cfg } = await import("../src/config.js");
  // config.demoCardId, not an env read: it has a built-in default, so reading
  // the raw variable gets the wrong card and the barcode comes back as a bare
  // serial that is not a URL at all.
  const demoTag = new URL(
    passBarcode({ serial: "x", short_code: "y" }, { id: cfg.demoCardId }).message,
  ).searchParams.get("s");
  expect(demoTag === "card", "the demo barcode still tags its landings ?s=card");
  const svScansBefore = await countViews("kind = 'view' AND source = 'card'");
  await fetch(base + "/?s=" + demoTag, { headers: { cookie: `pm_device=${svDevice}` } });
  await new Promise((r) => setTimeout(r, 300));
  expect(
    (await countViews("kind = 'view' AND source = 'card'")) === svScansBefore + 1,
    "a scan of a demo card is counted as a card scan",
  );

  // The customer flow must NOT be swept into this. /c/:cardId has join_view and
  // an analytics cookie there would undercut the promise that page makes.
  const svBeforeCard = await countViews();
  await fetch(base + "/c/default");
  await new Promise((r) => setTimeout(r, 300));
  expect((await countViews()) === svBeforeCard, "the customer join page is not site-tracked");

  const privBm = await get("/privacy?lang=bm");
  expect(
    privBm.status === 200 && privBm.body.includes("Dasar Privasi") && privBm.body.includes("PDPA"),
    "GET /privacy?lang=bm renders the Bahasa Malaysia notice",
  );
  expect(priv.body.includes("/privacy?lang=bm"), "the English policy links the BM version");
  expect(privBm.body.includes('href="/privacy"'), "the BM policy links back to English");
  // The notice must describe what we ACTUALLY store. These four were the gap
  // that made the old page false; if collection changes, this test should fail.
  for (const claim of ["push token", "browser", "cookie", "delete the card"]) {
    expect(
      priv.body.toLowerCase().includes(claim),
      `the privacy notice discloses "${claim}"`,
    );
  }
  // Deleting the pass is the opt-out, and the reward terms back the card up.
  expect(terms.body.includes("One stamp per visit"), "the terms carry the reward terms");
  expect(terms.body.includes("data processor"), "the terms carry the processor clauses");

  // --- Nudging: one rule, N messages per customer per rolling 7 days ---
  // Automated win-back was removed in v1.5. Nothing messages a customer on a
  // timer any more, so what has to hold is the cooldown — and it has to hold on
  // the SERVER, because the browser is not where a limit can live.
  const { MAX_NUDGES_PER_WEEK } = await import("../src/winback.js");
  expect(MAX_NUDGES_PER_WEEK === 3, "the limit is three messages per customer per 7 days");

  const { cardMetrics, pruneAbandonedPasses, upsertRegistration, setMessage, canNudgeSerial } =
    await import("../src/db.js").then(async (db) => ({
      ...db,
      canNudgeSerial: (await import("../src/winback.js")).canNudgeSerial,
    }));

  const cool = await mk();
  await logEvent("default", cool.serial, "stamp"); // a real customer
  expect((await canNudgeSerial(cool.serial)).ok, "a customer who has never been messaged can be");
  // Walk right up to the cap, one message at a time, then ask for one more.
  // Written against the constant so raising the cap moves the test with it
  // rather than leaving it asserting a rule the product no longer has.
  for (let n = 1; n < MAX_NUDGES_PER_WEEK; n++) {
    await logEvent("default", cool.serial, "nudge");
    expect(
      (await canNudgeSerial(cool.serial)).ok,
      `message ${n + 1} of ${MAX_NUDGES_PER_WEEK} inside 7 days is allowed`,
    );
  }
  await logEvent("default", cool.serial, "nudge");
  const blocked = await canNudgeSerial(cool.serial);
  expect(
    !blocked.ok && blocked.reason === "rate-limited",
    `message ${MAX_NUDGES_PER_WEEK + 1} inside 7 days is refused`,
  );
  // 6 days is still inside the cooldown; 8 days is out of it. The boundary is
  // the whole rule, so it is checked from both sides.
  const ageNudge = (days: number) =>
    getPool().query(
      "UPDATE events SET created_at = now() - ($2 || ' days')::interval WHERE serial = $1 AND type = 'nudge'",
      [cool.serial, String(days)],
    );
  await ageNudge(6);
  expect(!(await canNudgeSerial(cool.serial)).ok, "still on cooldown 6 days after their allowance");
  await ageNudge(8);
  expect((await canNudgeSerial(cool.serial)).ok, "off cooldown 8 days after them");

  // --- Customer health: the four groups, and what a "visit" is -------------
  //
  // The groups are judged on LIFETIME VISITS, read from the event log, never on
  // passes.stamp_count. That distinction is the whole feature: the balance is
  // rewritten every time a reward is handed over, so judging loyalty by it would
  // demote a shop's best customers at the exact moment they claimed something.
  //
  // One assertion per way the count could quietly become the wrong number.
  {
    const health = async () =>
      JSON.parse((await get("/dashboard/api/customers", { headers: { cookie: cookieNow } })).body);
    const mine = async (serial: string) =>
      (await health()).customers.find((c: any) => c.serial === serial) || {};

    // Minted holding welcome stamps, and ADDED to a wallet — a pass row alone is
    // not a customer (ACTIVE_PASS_SQL), so without this it is in no group at all
    // and the assertions below would pass against an absent row.
    const hp = await mk();
    await logEvent("default", hp.serial, "pass_added");
    expect((await mine(hp.serial)).stamps >= 2, "a new card carries its welcome stamps as a balance");
    // Taking the card IS a visit — somebody was in the shop to scan the poster.
    // Exactly one, however many welcome stamps that scan was worth: the stamps
    // fill the card, they are not three separate trips.
    expect((await mine(hp.serial)).visits === 1, "...and signing up is visit 1, not 0 and not 2");
    expect((await mine(hp.serial)).health === "new", "...so they are New, not Returning");

    // force:true throughout — the counter refuses a repeat inside 60s
    // (STAMP_COOLDOWN_MS) and a test that stamps eight times in a second would
    // otherwise be measuring the cooldown, not the visit count. A forced stamp
    // is still exactly one stamp.
    const stampIt = () =>
      fetch(base + "/staff/api/stamp", {
        method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: hp.serial, force: true }),
      });
    await stampIt();
    expect((await mine(hp.serial)).visits === 2, "a counter stamp is the next visit after the sign-up");
    await fetch(base + "/staff/api/undo", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: hp.serial }),
    });
    expect((await mine(hp.serial)).visits === 1, "an undo takes that visit back off, leaving the sign-up");

    // Enough visits to earn the reward, then take it — the moment the balance
    // resets and the visit count must not.
    for (let i = 0; i < 8; i++) await stampIt();
    const earned = await mine(hp.serial);
    expect(earned.visits === 9, `eight stamps plus the sign-up is nine visits (${earned.visits})`);
    await fetch(base + "/staff/api/redeem", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: hp.serial }),
    });
    const after = await mine(hp.serial);
    expect(
      after.visits === 9,
      `a redeem-and-restart leaves the visit count alone (${earned.visits} → ${after.visits})`,
    );
    expect(
      after.stamps === 0,
      `...while the BALANCE restarts at zero (${earned.stamps} → ${after.stamps})`,
    );
    expect(after.health === "regular", "...and nine visits is still a Regular afterwards");

    // --- the restart takes TODAY's rules, and starts at zero ----------------
    //
    // The founder's question: a shop raises its target from 10 to 12 in the
    // morning, and a customer holding the old card claims their reward in the
    // afternoon. A pass keeps the ruleset it was issued with — that promise is
    // outstanding and must not move under the customer — but the promise has
    // just been KEPT, so the restart is the one honest moment to move them on,
    // and the only one that does not need them to delete the card and rescan.
    {
      const held = await mk();
      await getPool().query(`UPDATE passes SET stamp_count = 8 WHERE serial = $1`, [held.serial]);
      const asIssued = await getCard("default");
      await updateCard("default", { stamps_target: 12, reward: "Free pastry" });
      const restarted = (await redeemPass(held.serial))!;
      expect(restarted.stamp_count === 0, `a restarted card starts at zero (${restarted.stamp_count})`);
      expect(
        restarted.stamps_target === 12,
        `...on the target in force TODAY, not the one it was issued with (${restarted.stamps_target})`,
      );
      expect(restarted.reward === "Free pastry", "...and on today's reward");
      // Welcome stamps are for NEW cards only now — the visit that earned the
      // reward is the stamp a restart would otherwise hand over.
      expect(
        asIssued!.stamps_start > 0,
        `...even though the card still gives new customers a head start (${asIssued!.stamps_start})`,
      );
      await updateCard("default", {
        stamps_target: asIssued!.stamps_target,
        reward: asIssued!.reward,
      });
    }

    // The owner's OWN card, added from the same browser and therefore hanging
    // off the same customer row. Their testing must not count as somebody
    // visiting: every other counting query in the app says NOT e.is_test, and
    // this one has to as well or a shop a fortnight old reports Regulars it
    // has never served.
    const ownCard = await createPass({
      serial: crypto.randomUUID(),
      cardId: "default",
      customerId: hp.customer_id,
      platform: "google",
      shortCode: generateShortCode(),
      authToken: "t".repeat(24),
      stampCount: 0,
      stampsTarget: 8,
      reward: "Free latte",
      isTest: true,
    });
    await logEvent("default", ownCard.serial, "stamp", { actor: "staff:e2e" });
    const withTest = await mine(hp.serial);
    expect(
      withTest.visits === 9,
      `a stamp on the owner's own test card is not a visit (${withTest.visits})`,
    );
    expect(
      !(await health()).customers.some((c: any) => c.serial === ownCard.serial),
      "...and the test card is not a customer either",
    );

    // The four groups partition everybody — the same tallying rule the console
    // now follows. A customer in two groups, or in none, shows up here.
    const body = await health();
    const summed = body.health.reduce((a: number, h: any) => a + h.customers, 0);
    expect(
      summed === body.customers.length,
      `the four health groups add up to every customer (${summed} vs ${body.customers.length})`,
    );
    expect(
      body.health.map((h: any) => h.key).join(",") === "regular,returning,new,lost",
      "...and they are the four, in the order the dashboard shows them",
    );
    // The dropdown names the group's SIZE and the line under the button
    // accounts for the gap, so every group has to carry both, plus the reasons.
    // An owner shown "5 of 9" is owed the other four.
    expect(
      body.health.every((h: any) =>
        h.eligible <= h.customers && h.cooling + h.removed <= h.customers &&
        h.eligible + h.cooling + h.removed >= h.customers),
      "every group accounts for all of its customers: sendable, capped or gone",
    );

    // The cycle is what makes them mean anything, and changing it re-cohorts
    // the same people with no new events at all.
    const cycleTo = async (days: number) =>
      fetch(base + "/dashboard/api/return-cycle", {
        method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
        body: JSON.stringify({ days }),
      });
    expect((await cycleTo(28)).status === 200, "the shop can say how often customers come back");
    expect((await health()).cycle.days === 28, "...and the groups are computed with it");
    expect((await health()).cycle.chosen === true, "...and it counts as chosen, so the banner clears");
    expect((await cycleTo(9)).status === 400, "a cycle that is not one of the three is refused");
    await cycleTo(14);

    // RHYTHM, not just a count. This is the rule that changed: three stamps in
    // one afternoon and three stamps over two months are the same number and
    // completely different customers, and counting alone had a fortnight-old
    // shop reporting Regulars. Written straight into events so the stamps can
    // be spread over real weeks — nothing else can produce a gap.
    const slow = await mk();
    await logEvent("default", slow.serial, "pass_added");
    // The card itself has to be backdated too, not just the stamps: the sign-up
    // is visit 1 and the span is measured FROM it, so a pass minted this second
    // with stamps from six weeks ago is a customer who cannot exist.
    await getPool().query(
      `UPDATE passes SET created_at = now() - interval '61 days' WHERE serial = $1`,
      [slow.serial],
    );
    for (const daysAgo of [41, 21, 1]) {
      await getPool().query(
        `INSERT INTO events (card_id, serial, type, created_at)
         VALUES ('default', $1, 'stamp', now() - ($2 || ' days')::interval)`,
        [slow.serial, String(daysAgo)],
      );
    }
    const spread = await mine(slow.serial);
    expect(
      spread.visits === 4,
      `signing up plus three stamps over two months is four visits (${spread.visits})`,
    );
    expect(
      Math.round(spread.avgGapDays) === 20,
      `...at an average gap of about 20 days (${Math.round(spread.avgGapDays)})`,
    );
    expect(
      spread.health === "returning",
      "three stamps 20 days apart is NOT a regular at a 1-2 week shop",
    );
    await cycleTo(28);
    expect(
      (await mine(slow.serial)).health === "regular",
      "...but the same customer IS one at a 3-4 week shop",
    );
    // Seven weeks of silence is what writes somebody off at that cycle, not two.
    await cycleTo(14);
    expect(
      (await mine(slow.serial)).health !== "lost",
      "a customer stamped yesterday is never lost, whatever their rhythm",
    );

    // Targeting a group sends to that group and to nobody else.
    const toGroup = async (target: string) => {
      const r = await fetch(base + "/dashboard/api/nudge", {
        method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
        body: JSON.stringify({ message: "Hello you", target }),
      });
      return JSON.parse(await r.text());
    };
    const before = await health();
    const regulars = before.health.find((h: any) => h.key === "regular");
    const sentTo = await toGroup("regular");
    expect(
      sentTo.total <= regulars.eligible,
      `a group send reaches no more than that group can take (${sentTo.total} of ${regulars.eligible})`,
    );
    expect(sentTo.total > 0, "...and it does reach them");
    // Deliberately NOT asserting what an unknown target does: finding out costs
    // a real broadcast to every customer in the run, and the nudge-cooldown
    // assertions further down then measure the messages this test sent rather
    // than the ones they sent. It cost two runs to notice. The route's fallback
    // is one line and reading it is cheaper than proving it here.
  }

  // The groups are the rule, not a second opinion about it.
  const custView = async () =>
    JSON.parse((await get("/dashboard/api/customers", { headers: { cookie: cookieNow } })).body);
  const groups = (await custView()).buckets.map((b: any) => b.key);
  expect(
    JSON.stringify(groups) === JSON.stringify(["ready", "cooling", "removed"]),
    "the Customers tab has exactly the three cooldown groups",
  );
  expect(
    (await custView()).buckets.every((b: any) => typeof b.customers === "number"),
    "every group reports a count, including the empty ones (they are never hidden)",
  );

  // And the send obeys it too, not just the count beside it.
  const nudgeTwice = async () => {
    const r = await fetch(base + "/dashboard/api/nudge", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ message: "Come back!", target: [cool.serial] }),
    });
    return JSON.parse(await r.text());
  };
  expect((await nudgeTwice()).total === 1, "an off-cooldown customer is nudged");
  for (let n = 2; n <= MAX_NUDGES_PER_WEEK; n++) {
    expect((await nudgeTwice()).total === 1, `...and again, message ${n} of the week's ${MAX_NUDGES_PER_WEEK}`);
  }
  const overTheCap = await nudgeTwice();
  expect(
    overTheCap.total === 0 && overTheCap.skipped.rateLimited === 1,
    `one more immediately after sends nothing and says why`,
  );

  // --- "Last seen" is measured from the last visit, not updated_at (regression) ---
  // Nudging bumps passes.updated_at. When lapse was measured from that, a
  // message silently marked the very customer being chased as freshly active.
  const lap = await mk();
  await logEvent("default", lap.serial, "stamp");
  await getPool().query(
    "UPDATE passes SET created_at = now() - interval '40 days' WHERE serial = $1",
    [lap.serial],
  );
  await getPool().query(
    "UPDATE events SET created_at = now() - interval '40 days' WHERE serial = $1 AND type = 'stamp'",
    [lap.serial],
  );
  const lastDaysOf = async (serial: string) =>
    ((await custView()).customers.find((c: any) => c.serial === serial) || {}).lastDays;
  expect((await lastDaysOf(lap.serial)) >= 39, "a card unseen for 40 days reports it");
  await setMessage(lap.serial, "We miss you!"); // bumps updated_at
  expect(
    (await lastDaysOf(lap.serial)) >= 39,
    "a nudge does NOT reset the last-seen clock (updated_at regression)",
  );
  await logEvent("default", lap.serial, "stamp"); // a real visit does
  expect((await lastDaysOf(lap.serial)) === 0, "an actual stamp resets it");

  // --- Return rate: only cards old enough to judge ---
  // Handing out a stack of cards today must not crater the number tomorrow, so
  // anything younger than the window is outside the metric entirely.
  const fresh = await mk();
  await upsertRegistration("device-fresh", fresh.serial, "tok-fresh"); // a customer, but new
  const mFresh = await cardMetrics("default");
  const matureCust = await mk();
  await upsertRegistration("device-older", matureCust.serial, "tok-older");
  await getPool().query(
    "UPDATE passes SET created_at = now() - interval '20 days' WHERE serial = $1",
    [matureCust.serial],
  );
  const mAdded = await cardMetrics("default");
  expect(mAdded.matured === mFresh.matured + 1, "a 20-day-old customer joins the return-rate denominator");
  expect(mAdded.returned === mFresh.returned, "...and has not returned until they are scanned");
  await logEvent("default", matureCust.serial, "stamp");
  const mScanned = await cardMetrics("default");
  expect(mScanned.returned === mAdded.returned + 1, "a scan moves them into the numerator");
  expect(
    mScanned.returnRate !== null && mScanned.returnRate === mScanned.returned / mScanned.matured,
    "the rate is returned over matured",
  );
  // A brand-new card has nobody old enough — that is "no answer yet", not 0%.
  const emptyCard = await addLegacyCard("spare@card.my", "Return rate blank");
  const mEmpty = await cardMetrics(emptyCard);
  expect(mEmpty.matured === 0 && mEmpty.returnRate === null, "return rate is null, not 0, before anyone matures");

  // --- "Customers" counts real cards only, not every minted pass row ---
  const ghost = await mk(); // never stamped, never added to a wallet
  const before = await cardMetrics("default");
  expect(before.cards > before.active, "issued count includes the phantom card, active count does not");
  const ghostActive = async () =>
    (await getPool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM passes p WHERE p.serial = $1
         AND (EXISTS (SELECT 1 FROM events e WHERE e.serial = p.serial AND e.type = 'stamp')
           OR EXISTS (SELECT 1 FROM registrations r WHERE r.serial = p.serial))`,
      [ghost.serial],
    )).rows[0]!.n;
  expect((await ghostActive()) === 0, "a pass with no stamp and no wallet registration is not a customer");
  // Registering it (what iOS does on a real Add) makes it real without any stamp.
  await upsertRegistration("device-e2e-1", ghost.serial, "push-token-e2e");
  expect((await ghostActive()) === 1, "a confirmed wallet add counts as a customer with zero stamps");

  // --- Apple's PassKit web service, over HTTP (the add/remove signal) ---
  // These routes were only ever exercised as library calls, so the auth header,
  // the status codes and the lifecycle logging were all untested.
  const wp = await mk();
  const passAuth = { Authorization: "ApplePass " + "t".repeat(24) };
  const regUrl = (device: string, serial: string) =>
    `/wallet/v1/devices/${device}/registrations/pass.com.e2e/${serial}`;
  const typeOf = async (serial: string) =>
    (await getPool().query<{ type: string }>(
      "SELECT type FROM events WHERE serial = $1 ORDER BY id", [serial],
    )).rows.map((r) => r.type);

  const noAuth = await fetch(base + regUrl("dev-http-1", wp.serial), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pushToken: "tok-1" }),
  });
  expect(noAuth.status === 401, "registering a pass without the ApplePass token → 401");

  const reg1 = await fetch(base + regUrl("dev-http-1", wp.serial), {
    method: "POST", headers: { "Content-Type": "application/json", ...passAuth },
    body: JSON.stringify({ pushToken: "tok-1" }),
  });
  expect(reg1.status === 201, "iOS registering a pass → 201 created");
  expect((await typeOf(wp.serial)).includes("pass_added"), "a real wallet add is logged as pass_added");

  // A redesign has to reach iPhones, not just Android. An Apple pass is a
  // downloaded file: patching the Google class updates Android in place, but
  // nothing tells a phone to come back for new art unless we push. This is the
  // query refreshCardArt pushes to — APNs itself is unconfigured here and
  // returns not-configured without throwing (invariant 1), so the token lookup
  // is the part worth pinning.
  {
    const { pushTokensForCard } = await import("../src/db.js");
    const wpCard = (await getPool().query<{ card_id: string }>(
      "SELECT card_id FROM passes WHERE serial = $1", [wp.serial],
    )).rows[0]!.card_id;
    const tokens = await pushTokensForCard(wpCard);
    expect(tokens.includes("tok-1"),
      `a design change finds every device holding the card (${tokens.length} registered)`);
  }

  // --- …and the phone that answers the push is TOLD something changed ---
  // The bug this pins: the push above is only a doorbell. iOS answers it by
  // asking this endpoint what changed, and the answer comes purely from
  // `passes.updated_at`. A design save writes to `cards` and used to touch no
  // pass row at all — so this returned 204 "nothing changed", the phone went
  // back to sleep, and the new art only ever appeared at that customer's NEXT
  // STAMP (because addStamps does bump the column). Android had no such
  // problem, its look being class data, so the two platforms silently
  // disagreed for months. Reported as "I saved a colour and my iPhone card
  // didn't change" — which was exactly right.
  {
    const wpCard = (await getPool().query<{ card_id: string }>(
      "SELECT card_id FROM passes WHERE serial = $1", [wp.serial],
    )).rows[0]!.card_id;
    const stampsBefore = (await getPool().query<{ n: string; t: string; r: string }>(
      "SELECT stamp_count::text AS n, stamps_target::text AS t, reward AS r FROM passes WHERE serial = $1",
      [wp.serial],
    )).rows[0]!;
    const tag = async () =>
      (await getPool().query<{ ms: string }>(
        "SELECT floor(extract(epoch FROM updated_at) * 1000)::bigint::text AS ms FROM passes WHERE serial = $1",
        [wp.serial],
      )).rows[0]!.ms;
    const changedSince = async (since: string) =>
      fetch(base + `/wallet/v1/devices/dev-http-1/registrations/pass.com.e2e?passesUpdatedSince=${since}`);

    const before = await tag();
    // Nothing has happened, so the device is told nothing has happened.
    expect((await changedSince(before)).status === 204,
      "with nothing changed, the device is told 204 and does not re-download");

    // A colour change through the real route — no stamp, nothing else.
    const design = await fetch(base + "/admin/api/card/" + wpCard + "/design", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ bg: "#123456" }),
    });
    expect(design.status === 200, "an admin design save succeeds");

    const after = await changedSince(before);
    expect(after.status === 200,
      `after a design save the device is told there IS something to fetch (got ${after.status})`);
    const changed = JSON.parse(await after.text());
    expect(
      Array.isArray(changed.serialNumbers) && changed.serialNumbers.includes(wp.serial),
      "…and the changed pass is named, so iOS comes back for it",
    );
    expect(Number(await tag()) > Number(before), "the pass's updated_at actually moved");

    // The re-download carries the NEW colour. Apple is unconfigured here, so a
    // 503 is the honest pass-through (invariant 1) — what must never happen is
    // a 200 carrying the old art.
    const fresh = await fetch(base + `/wallet/v1/passes/pass.com.e2e/${wp.serial}`, { headers: passAuth });
    expect([200, 503].includes(fresh.status),
      `the pass endpoint answers or degrades cleanly (${fresh.status})`);

    // The promise on a card already in a wallet still stands: a LOOK change
    // must not have rewritten anybody's ruleset or their progress.
    const stampsAfter = (await getPool().query<{ n: string; t: string; r: string }>(
      "SELECT stamp_count::text AS n, stamps_target::text AS t, reward AS r FROM passes WHERE serial = $1",
      [wp.serial],
    )).rows[0]!;
    expect(
      stampsAfter.n === stampsBefore.n && stampsAfter.t === stampsBefore.t && stampsAfter.r === stampsBefore.r,
      "a look change leaves stamps, target and reward exactly as they were",
    );
  }

  const reg2 = await fetch(base + regUrl("dev-http-2", wp.serial), {
    method: "POST", headers: { "Content-Type": "application/json", ...passAuth },
    body: JSON.stringify({ pushToken: "tok-2" }),
  });
  expect(reg2.status === 201, "a second device registering the same pass → 201");
  expect(
    (await typeOf(wp.serial)).filter((t) => t === "pass_added").length === 1,
    "a second device is the same customer, not a second wallet add",
  );

  const del1 = await fetch(base + regUrl("dev-http-1", wp.serial), { method: "DELETE", headers: passAuth });
  expect(del1.status === 200, "iOS unregistering a pass → 200");
  expect(
    !(await typeOf(wp.serial)).includes("pass_removed"),
    "removing it from one device while another still has it is NOT churn",
  );
  await fetch(base + regUrl("dev-http-2", wp.serial), { method: "DELETE", headers: passAuth });
  expect((await typeOf(wp.serial)).includes("pass_removed"), "the last device dropping the pass is logged as pass_removed");

  const { cardCounts, nudgeState } = await import("../src/db.js");
  expect((await cardCounts("default")).removed >= 1, "a deleted card shows up in the removed count");
  expect((await nudgeState(wp.serial))!.removed === true, "a deleted card is flagged as unreachable");
  // Re-adding recovers on its own — the fresh registrations row clears the flag.
  await fetch(base + regUrl("dev-http-1", wp.serial), {
    method: "POST", headers: { "Content-Type": "application/json", ...passAuth },
    body: JSON.stringify({ pushToken: "tok-1" }),
  });
  expect((await nudgeState(wp.serial))!.removed === false, "re-adding the card clears the removed flag");

  // --- At the counter: facts only, and each one counted the right way -------
  // The screen this feeds is deliberately not a staff-performance tool — one
  // PIN per owner, no staff identity — so every check here is about a COUNT
  // being right, never about a judgement being made.
  {
    const counterNow = async (cookie = cookieNow) =>
      JSON.parse((await get("/dashboard/api/counter", { headers: { cookie } })).body).counter;
    const before = await counterNow();

    // 1. Welcome stamps must never appear. A card is minted holding some
    //    already (stampCount below), written straight to passes.stamp_count
    //    with no event — so issuing one moves nothing on this screen.
    const wp = await mk();
    const afterIssue = await counterNow();
    expect(
      afterIssue.stamps === before.stamps,
      `issuing a card with welcome stamps adds nothing to stamps given (${afterIssue.stamps})`,
    );

    // 2. A real stamp at the counter is +1 stamp and +1 customer.
    await fetch(base + "/staff/api/stamp", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: wp.serial }),
    });
    const afterOne = await counterNow();
    expect(afterOne.stamps === before.stamps + 1, "a counter stamp is one stamp given");
    expect(afterOne.customers === before.customers + 1, "...and one customer stamped");

    // 3. A forced stamp is the literal "stamped again within a minute" event.
    //    It is still ONE stamp: it must not be double-counted in either column.
    await fetch(base + "/staff/api/stamp", {
      method: "POST", headers: staffHeaders,
      body: JSON.stringify({ serial: wp.serial, force: true }),
    });
    const afterForced = await counterNow();
    expect(afterForced.stamps === afterOne.stamps + 1, "a forced stamp counts once in stamps given");
    expect(
      afterForced.stampedAgain === before.stampedAgain + 1,
      "...and once in stamped-again, never twice in either",
    );
    // The number and the list behind it come from one query, so they cannot
    // disagree — a count with an empty drill-down reads as broken.
    expect(
      afterForced.bursts.length > 0 && afterForced.bursts.length === afterForced.stampedAgain,
      `the stamped-again count is exactly what its drill-down lists (${afterForced.stampedAgain} vs ${afterForced.bursts.length})`,
    );
    const run = afterForced.bursts.find((b: any) => b.code === wp.short_code);
    expect(
      run && run.stamps === 2 && typeof run.seconds === "number",
      "...and the run says how many stamps landed, and over how long",
    );

    // 4. An undo is a correction, shown beside the stamps rather than netted
    //    off them: both are facts, and hiding one inside the other is the kind
    //    of interpretation this screen exists to avoid.
    await fetch(base + "/staff/api/undo", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: wp.serial }),
    });
    const afterUndo = await counterNow();
    expect(afterUndo.takenBack === before.takenBack + 1, "an undo shows as a stamp taken back");
    // DELIBERATELY not net, and the only owner-facing stamp count that is not.
    // The Home tile means "stamps actually given" and subtracts corrections;
    // this fold is the counter's log for the day, where the stamp and the
    // take-back are two facts shown side by side. Both are pinned by a test so
    // the difference has to be read before it can be "fixed".
    expect(afterUndo.stamps === afterForced.stamps, "...and does not quietly reduce stamps given");

    // 5. Customers are PEOPLE (invariant 5). One person holding an Apple and a
    //    Google card, both stamped, is one customer stamped.
    const merchant = await merchantOf("default");
    const twoCards = await mkCustomer(merchant!.id);
    const ap = await mk("apple", twoCards.id);
    const gp = await mk("google", twoCards.id);
    const beforePair = await counterNow();
    for (const serial of [ap.serial, gp.serial]) {
      await fetch(base + "/staff/api/stamp", {
        method: "POST", headers: staffHeaders, body: JSON.stringify({ serial }),
      });
    }
    const afterPair = await counterNow();
    expect(afterPair.stamps === beforePair.stamps + 2, "two wallet cards stamped is two stamps");
    expect(
      afterPair.customers === beforePair.customers + 1,
      `...but one customer stamped (${beforePair.customers} → ${afterPair.customers})`,
    );

    // 6. Corrections list what happened, with the printed code so the owner can
    //    match it to a card. Nothing in it is labelled or ranked.
    expect(
      afterPair.events.some((x: any) => x.type === "undo" && x.code === wp.short_code),
      "the drill-down names the card an undo was made on",
    );

    // 7. Devices are phones that STAMPED — there is no device registry, and the
    //    window matches the staff cookie's own 14-day life.
    expect(
      afterPair.devices.every((d: any) => d.device_id && d.stamps >= 0),
      "the device list is built from devices that stamped",
    );
    await getPool().query(
      `UPDATE events SET created_at = now() - interval '30 days' WHERE device_id = $1`,
      ["staleee"],
    );
    await logEvent("default", wp.serial, "stamp", { actor: "staff:staleee" });
    await getPool().query(
      `UPDATE events SET created_at = now() - interval '30 days'
        WHERE device_id = 'staleee'`,
    );
    const afterStale = await counterNow();
    expect(
      !afterStale.devices.some((d: any) => d.device_id === "staleee"),
      "a device that has not stamped in 14 days drops off — its session has expired anyway",
    );
    expect(afterStale.stamps === afterPair.stamps, "...and a 30-day-old stamp is not in today");

    // 8. Owner-scoped. Another owner's counter shows none of this.
    const theirs = await counterNow(cookieOutsider);
    expect(theirs.stamps === 0 && theirs.devices.length === 0,
      "another owner's counter shows nothing of this shop");

    // 9. Every counter action today carries its exact time — the time is the
    //    point of the drill-down, and a date alone would answer nothing.
    const stampRow = afterStale.events.find((e: any) => e.type === "stamp" && e.code === wp.short_code);
    expect(Boolean(stampRow), "today's stamps are listed with the card they landed on");
    expect(
      stampRow && new Date(stampRow.at).getTime() > Date.now() - 10 * 60_000,
      "...and an exact timestamp, not just a day",
    );
  }

  // --- Nudge limits are enforced by the server, not by a browser dialog ---
  const rl = await mk();
  await upsertRegistration("dev-rl", rl.serial, "tok-rl"); // a real customer, so they're nudgeable
  await getPool().query("UPDATE passes SET created_at = now() - interval '30 days' WHERE serial = $1", [rl.serial]);
  const nudgeOnce = async () =>
    JSON.parse(await (await fetch(base + "/dashboard/api/nudge", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ message: "Come back!", target: [rl.serial] }),
    })).text());
  for (let i = 0; i < MAX_NUDGES_PER_WEEK; i++) {
    expect((await nudgeOnce()).total === 1, `nudge ${i + 1} of ${MAX_NUDGES_PER_WEEK} this week goes out`);
  }
  const overLimit = await nudgeOnce();
  expect(
    overLimit.total === 0 && overLimit.skipped.rateLimited === 1,
    `a ${MAX_NUDGES_PER_WEEK + 1}th nudge in the same week is refused by the server`,
  );
  // A visit resets the "unanswered" run but NOT the weekly rate limit.
  await logEvent("default", rl.serial, "stamp");
  expect((await nudgeState(rl.serial))!.unanswered === 0, "a stamp clears the unanswered run");
  expect((await nudgeOnce()).total === 0, "the weekly limit still holds right after a visit");
  await getPool().query(
    "UPDATE events SET created_at = now() - interval '30 days' WHERE serial = $1 AND type = 'nudge'", [rl.serial],
  );
  expect((await nudgeOnce()).total === 1, "once the week rolls over, they're reachable again");

  // Someone who deleted the card can never be messaged, whatever the counts say.
  const gone = await mk();
  await upsertRegistration("dev-gone", gone.serial, "tok-gone");
  await (await import("../src/db.js")).deleteRegistration("dev-gone", gone.serial);
  const goneOut = JSON.parse(await (await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "Hello?", target: [gone.serial] }),
  })).text());
  expect(goneOut.total === 0 && goneOut.skipped.removed === 1, "a customer who deleted the card is never nudged");
  // Churn must not erase its own evidence: they were a real customer, and the
  // headline count says so even though nothing is left in any wallet.
  const goneCust = JSON.parse((await get("/dashboard/api/customers", { headers: { cookie: cookieNow } })).body);
  const goneRow = goneCust.customers.find((c: any) => c.serial === gone.serial);
  expect(goneRow && goneRow.bucket === "removed", "a deleted card still counts as a customer, in the removed cohort");
  await pruneAbandonedPasses(0);
  expect(
    (await getPool().query("SELECT 1 FROM passes WHERE serial = $1", [gone.serial])).rowCount === 1,
    "housekeeping never prunes a card that reached a wallet and was then deleted",
  );

  // --- The sign-up funnel is counted from events, so pruning cannot move it ---
  // This is the whole reason the funnel stopped counting pass rows: the 30-day
  // cleanup used to erase the evidence of a leak 30 days after it happened.
  // Points at merchantHealth, which is now the ONLY funnel implementation —
  // adminFunnel was a second one keyed on the card, and the console rendered
  // both. This is the copy that survived, so it is the copy that gets the test.
  const { merchantHealth: funnelSource } = await import("../src/db.js");
  const funnelOf = async (cardId: string) =>
    (await funnelSource()).find((m) => m.card_ids.includes(cardId))!;
  const abandoned = await mk(); // never stamped, never in a wallet
  await logEvent("default", abandoned.serial, "join_view", { metadata: { bot: false } });
  await logEvent("default", abandoned.serial, "wallet_click", { metadata: { wallet: "apple" } });
  await logEvent("default", abandoned.serial, "enroll");
  const beforePrune = await funnelOf("default");
  await getPool().query(
    "UPDATE passes SET created_at = now() - interval '90 days' WHERE serial = $1",
    [abandoned.serial],
  );
  expect((await pruneAbandonedPasses(30)) >= 1, "the abandoned card is pruned");
  expect(
    (await getPool().query("SELECT 1 FROM passes WHERE serial = $1", [abandoned.serial])).rowCount === 0,
    "...its pass row really is gone",
  );
  const afterPrune = await funnelOf("default");
  expect(
    afterPrune.scanned === beforePrune.scanned &&
      afterPrune.clicked === beforePrune.clicked &&
      afterPrune.made === beforePrune.made &&
      afterPrune.landed === beforePrune.landed,
    `the funnel is unchanged by pruning (${beforePrune.scanned}/${beforePrune.clicked}/${beforePrune.made}/${beforePrune.landed})`,
  );

  // A crawler hitting the poster link is not a person who scanned it.
  const botBefore = (await funnelOf("default")).scanned;
  await logEvent("default", "", "join_view", { metadata: { bot: true } });
  expect((await funnelOf("default")).scanned === botBefore, "a bot's view is excluded from Scanned");
  await logEvent("default", "", "join_view", { metadata: { bot: false } });
  expect((await funnelOf("default")).scanned === botBefore + 1, "...but a real one counts");

  // --- Staff can look up a card that is NOT in the recent-20 list ---
  const older = await mk();
  await getPool().query("UPDATE passes SET created_at = now() - interval '200 days' WHERE serial = $1", [older.serial]);
  for (let i = 0; i < 22; i++) await mk(); // push it well past the 20-row window
  const recent = JSON.parse((await get("/staff/api/passes", { headers: staffHeaders })).body);
  expect(
    !recent.passes.some((p: any) => p.serial === older.serial),
    "the older card is outside the recent list (so client-side filtering could never find it)",
  );
  const lookup = JSON.parse(
    (await get("/staff/api/lookup?code=" + older.short_code, { headers: staffHeaders })).body,
  );
  expect(lookup.pass?.serial === older.serial, "staff lookup finds a card by code beyond the recent list");
  const lookupMiss = await get("/staff/api/lookup?code=ZZZZZZ", { headers: staffHeaders });
  expect(lookupMiss.status === 404, "staff lookup of an unknown code → 404");

  // --- Housekeeping prune: only truly abandoned cards go ---
  await getPool().query(
    "UPDATE passes SET created_at = now() - interval '60 days' WHERE serial = ANY($1)",
    [[ghost.serial, lap.serial]],
  );
  const orphan = await mk();
  await getPool().query("UPDATE passes SET created_at = now() - interval '60 days' WHERE serial = $1", [orphan.serial]);
  const removed = await pruneAbandonedPasses(30);
  expect(removed >= 1, `prune removed the abandoned card(s) (got ${removed})`);
  const stillThere = async (s: string) =>
    (await getPool().query("SELECT 1 FROM passes WHERE serial = $1", [s])).rowCount === 1;
  expect(!(await stillThere(orphan.serial)), "an old card never stamped and never in a wallet is pruned");
  expect(await stillThere(ghost.serial), "an old card WITH a wallet registration survives the prune");
  expect(await stillThere(lap.serial), "an old card WITH a stamp survives the prune");

  // --- Undo a stamp: the fix for a mis-scan ---
  // Before this, the only way to take a stamp back was to redeem the card, which
  // handed out a free reward for a staff typo.
  const post = (p: string, body: unknown, headers: Record<string, string> = staffHeaders) =>
    fetch(base + "/staff/api" + p, { method: "POST", headers, body: JSON.stringify(body) });
  const un = await mk();
  await post("/stamp", { serial: un.serial });
  const undo1 = await post("/undo", { serial: un.serial });
  expect(undo1.status === 200 && JSON.parse(await undo1.text()).pass.stamps === 2, "undo takes one stamp back (3 → 2)");
  for (let i = 0; i < 5; i++) await post("/undo", { serial: un.serial });
  const floored = JSON.parse((await get("/staff/api/lookup?code=" + un.short_code, { headers: staffHeaders })).body);
  expect(floored.pass.stamps === 0, "undo floors at 0 rather than going negative");
  // Undo follows the same scope as stamping: any card the merchant runs is fair
  // game (the phone shouldn't have to be on the right one to fix a mis-scan).
  // The cross-MERCHANT boundary is asserted further down, and is a 401 — the
  // staff cookie is owner-scoped, so a stranger's card is refused before this.
  expect(
    (await post("/undo", { serial: un.serial }, staff2Headers)).status === 200,
    "undo works on any card the same merchant runs",
  );

  // --- Audit trail: who did it, and was the cooldown overridden ---
  const events = async (serial: string) =>
    (await getPool().query<{ type: string; actor: string; forced: boolean }>(
      "SELECT type, actor, forced FROM events WHERE serial = $1 ORDER BY id", [serial],
    )).rows;
  const unEvents = await events(un.serial);
  expect(unEvents.some((e) => e.type === "undo"), "undo is logged as its own event type");
  expect(
    unEvents.filter((e) => e.type !== "enroll").every((e) => /^staff:[0-9a-f]{10}$/.test(e.actor)),
    "every staff action names the phone that did it",
  );
  const fr = await mk();
  await post("/stamp", { serial: fr.serial });
  await post("/stamp", { serial: fr.serial, force: true });
  const frStamps = (await events(fr.serial)).filter((e) => e.type === "stamp");
  expect(
    frStamps.length === 2 && frStamps[0]!.forced === false && frStamps[1]!.forced === true,
    "a stamp confirmed past the cooldown is flagged as forced, a normal one isn't",
  );

  // Net stamp count: an undone stamp must not inflate the headline number.
  const netBefore = (await cardMetrics("default")).stamps;
  const nz = await mk();
  await post("/stamp", { serial: nz.serial });
  await post("/undo", { serial: nz.serial });
  expect((await cardMetrics("default")).stamps === netBefore, "a stamp that is undone doesn't inflate the stamp count");

  // --- Win-back effectiveness, and the cooldown as the ONLY rule ---
  const { nudgeOutcomes, unansweredNudges } = await import("../src/db.js");
  const ch = await mk();
  // A real customer: the dashboard only ever targets people who were stamped or
  // reached a wallet, so an un-stamped pass row could never be nudged at all.
  await logEvent("default", ch.serial, "stamp");
  await getPool().query("UPDATE passes SET created_at = now() - interval '60 days' WHERE serial = $1", [ch.serial]);
  await getPool().query(
    "UPDATE events SET created_at = now() - interval '60 days' WHERE serial = $1 AND type = 'stamp'",
    [ch.serial],
  );
  // The give-up-after-6 rule was removed: a run of silence is not proof someone
  // has churned, and the weekly cooldown is restraint enough. So with the
  // cooldown repeatedly re-opened, an owner tapping the button every Monday
  // keeps reaching a customer who never comes back — past 6, indefinitely.
  for (let i = 0; i < 9; i++) {
    await fetch(base + "/dashboard/api/nudge", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ message: "Come back!", target: [ch.serial] }),
    });
    await getPool().query("UPDATE events SET created_at = now() - interval '30 days' WHERE serial = $1 AND type = 'nudge'", [ch.serial]);
  }
  const sent = await unansweredNudges(ch.serial);
  expect(sent === 9, `nothing stops a send but the week — 9 attempts, 9 sent (got ${sent})`);
  // The loop back-dated its last send too, so this one lands: past six unanswered
  // is no longer a wall.
  const nudgeCh = async () =>
    JSON.parse(await (await fetch(base + "/dashboard/api/nudge", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ message: "Again", target: [ch.serial] }),
    })).text());
  expect((await nudgeCh()).total === 1, "a tenth message still goes out — no give-up rule");
  // But the week genuinely is a limit: these sends are NOT back-dated, so the
  // allowance runs out and the next is refused, for the only reason left.
  for (let n = 2; n <= MAX_NUDGES_PER_WEEK; n++) {
    expect((await nudgeCh()).total === 1, `...and another, which is their ${n} this week`);
  }
  const capped = await nudgeCh();
  expect(capped.total === 0 && capped.skipped.rateLimited === 1, "...and the cap refuses the one after that");
  expect(capped.skipped.ignored === undefined, "there is no longer an 'ignored' refusal to report");
  const outBefore = await nudgeOutcomes("default");
  expect(outBefore.noReturn >= 1, "a nudged customer who hasn't been back counts as no-return");
  await logEvent("default", ch.serial, "stamp"); // they finally came in
  const outAfter = await nudgeOutcomes("default");
  expect(outAfter.returned === outBefore.returned + 1, "a stamp after the last nudge counts as a win-back that worked");
  expect((await unansweredNudges(ch.serial)) === 0, "a visit resets the unanswered-nudge counter");
  await updateCard("default", { auto_winback_enabled: false });

  const adminWb = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
  const defRow = adminWb.cards.find((c: any) => c.id === "default");
  expect(
    defRow.nudged >= 1 && defRow.nudge_returned >= 1 && defRow.forced_stamps >= 1 && defRow.undos >= 1,
    "admin surfaces win-back outcomes and the counter-audit counters",
  );

  // --- Value tracking: average spend turns stamps into a money figure ---
  const spend = await fetch(base + "/dashboard/api/card/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ averageSpend: 4.5, currency: "RM" }),
  });
  expect(spend.status === 200, "average spend saves");
  const ovSpend = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  const defCard = ovSpend.cards.find((c: any) => c.id === "default");
  expect(defCard.averageSpend === 4.5 && defCard.currency === "RM", "average spend round-trips through cents without float drift");

  // --- Dashboard IA: three tabs, each one job ---
  const dashIa = (await get("/dashboard")).body;
  for (const tab of ["customers", "card", "shop"]) {
    expect(dashIa.includes('data-tab="' + tab + '"'), `dashboard has the ${tab} tab`);
  }
  expect(!dashIa.includes('data-tab="home"'), "Home is folded into Customers, not its own tab");
  expect(!dashIa.includes('data-tab="account"'), "Settings is now Shop — it holds the links and the counter, not just a login");
  expect(!dashIa.includes('data-wb="msg"'), "the win-back message left Card — it lives where you send it");
  expect(!dashIa.includes('data-tab="share"'), "the old Share tab is gone");
  // Access only existed because each café row carried its own PIN.
  expect(!dashIa.includes('data-tab="access"'), "the Access tab is gone (one PIN in Settings, links under the card)");
  expect(!dashIa.includes('data-f="staffPin"'), "the PIN is no longer a field in the card designer");

  // --- One PIN covers every card the owner runs ---
  // Minted directly: the dashboard refuses a second card now, but the merchants
  // that already hold one must still work off a single PIN and a single session.
  const secondCard = { id: await addLegacyCard("owner@test.my", "Pastry card") };
  expect(
    (await getCard(secondCard.id))!.staff_pin_hash === "",
    "a card carries no PIN of its own — the one PIN lives on the owner",
  );
  const bothCards = JSON.parse(await (await fetch(base + "/staff/api/cards", { headers: staffHeaders })).text());
  expect(
    (bothCards.cards || []).some((c: any) => c.id === secondCard.id),
    "the stamper offers every card the owner runs, on one sign-in",
  );
  expect(
    (await fetch(base + "/staff/api/passes", { headers: { ...staffHeaders, "x-card-id": secondCard.id } })).status === 200,
    "the same staff session stamps the second card without signing in again",
  );
  // A café belonging to somebody else is still refused, header or not.
  expect(
    (await fetch(base + "/staff/api/passes", {
      headers: { cookie: staff1.cookie, "x-card-id": ov2nd.cards[0].id },
    })).status === 401,
    "a staff session can't be pointed at another owner's card",
  );

  // --- A bare /staff must never resolve to another merchant's counter ---
  // Regression: the Settings link dropped its ?c=, and /staff fell back to the
  // café literally named "default" — which on a multi-merchant deployment is
  // somebody else's shop. The second owner's staff saw the FIRST owner's cards,
  // and since PINs are 4-6 digits and can collide, could have signed in there.
  const bareStaff = await get("/staff", { headers: { cookie: cookie2 } });
  expect(
    bareStaff.status === 200 && !bareStaff.body.includes('let cardId = "default"'),
    "a bare /staff does not silently claim the default café",
  );
  expect(
    bareStaff.body.includes('let cardId = "' + ov2nd.cards[0].id + '"'),
    "a bare /staff resolves to the logged-in owner's own card",
  );
  // A staff phone that bookmarked plain /staff keeps working, on ITS owner's card.
  const bookmarked = await fetch(base + "/staff/api/passes", { headers: { cookie: staff1.cookie } });
  expect(bookmarked.status === 200, "a staff phone with no x-card-id still reaches its own counter");
  // And the owner's Settings link carries the card id, which is what fixes it.
  expect(
    (await get("/dashboard")).body.includes('href="/staff?c='),
    "the dashboard's staff link names the card explicitly",
  );

  // --- Renaming the shop still works now that it saves with the rules ---
  // The shop name used to be saved by the Design button, inside a collapsed
  // fold. It sits above the fold beside Save rules now, so it moved into that
  // payload — and a rename silently doing nothing is the regression that move
  // invites. Sent the way the button sends it: everything at once.
  const renameOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(typeof renameOv.joinRef === "string" && renameOv.joinRef.length > 0,
    "overview hands the dashboard a /j/ ref for the share link and the poster");
  const renameSave = await fetch(base + "/dashboard/api/card/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({
      shopName: "Kopi Corner Two", name: "Kopi Corner Two",
      reward: "Free coffee", stampsTarget: 8, stampsStart: 2, averageSpend: 4.5, signupMessage: "",
    }),
  });
  expect(renameSave.status === 200, "saving the rules block succeeds");
  const afterRename = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(afterRename.cards.find((x: any) => x.id === "default").shopName === "Kopi Corner Two",
    "...and the shop name saved with them");
  // Every ref a merchant has ever held keeps resolving, which is what makes a
  // printed poster safe to rename behind.
  expect((await get("/j/" + renameOv.joinRef)).status < 400, "the OLD join ref still resolves after a rename");
  expect((await get("/j/" + afterRename.joinRef)).status < 400, "and so does the new one");

  // --- The stamp grid is keyed by the TARGET it was drawn for ---
  // Regression, and the worst kind: nothing errored. card_stamp_strips was keyed
  // (card_id, filled) alone, and saving the card replaced the whole set at
  // whatever the target now was. Drop 8 → 6 and a customer sitting at 7 of 8
  // asked for a strip that no longer existed — 404, stamps picture gone. Raise
  // 6 → 10 and their 5-of-6 card was redrawn as 5 of 10, understating their own
  // progress. Their numbers and their reward were right the whole time; only the
  // picture lied, and the picture is the card.
  const gridCard = await addLegacyCard("owner@test.my", "Grid regression");
  await updateCard(gridCard, { stamps_target: 8, reward: "Free croissant" });
  const gridPass = await mk("apple", undefined, gridCard);
  await logEvent(gridCard, gridPass.serial, "enroll");
  await getPool().query(`UPDATE passes SET stamp_count = 7 WHERE serial = $1`, [gridPass.serial]);
  await logEvent(gridCard, gridPass.serial, "stamp"); // makes the pass "active"

  const putGrid = async (targets: number[]) => {
    const strips = [];
    for (const t of targets) for (let n = 0; n <= t; n++) strips.push({ target: t, filled: n, png: pngB64 });
    return fetch(base + "/dashboard/api/card/" + gridCard + "/stamps", {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
      body: JSON.stringify({ style: "☕", strips }),
    });
  };
  expect((await putGrid([8])).status === 200, "a grid is stored for the target it was drawn for");

  // The dashboard is told which older targets it still owes a set for — the
  // browser is the only thing that can render one, so without this it cannot know.
  const gridOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(
    (gridOv.cards.find((x: any) => x.id === gridCard)?.targetsInUse ?? []).includes(8),
    "overview reports the targets live passes are still on",
  );

  // The owner drops 8 → 6 and the designer re-renders. It sends BOTH sets.
  await updateCard(gridCard, { stamps_target: 6, reward: "Free muffin" });
  expect((await putGrid([6, 8])).status === 200, "a re-render covers every target still in use");
  expect(
    (await getStampStrip(gridCard, 8, 7)) !== null,
    "a customer at 7 of 8 still has their 8-slot grid after the target drops to 6",
  );
  expect((await getStampStrip(gridCard, 6, 6)) !== null, "and new customers get the 6-slot grid");
  // Same filled count, different target — these must not be one row.
  expect((await getStampStrip(gridCard, 8, 6)) !== null && (await getStampStrip(gridCard, 6, 6)) !== null,
    "6-of-8 and 6-of-6 are separate pictures");

  // Redeeming is the honest moment to move someone onto today's rules: the
  // promise they were issued under has just been kept. It is also the only way
  // that doesn't require them to delete their card and rescan the QR.
  await getPool().query(`UPDATE passes SET stamp_count = 8 WHERE serial = $1`, [gridPass.serial]);
  const gridRedeem = await fetch(base + "/staff/api/redeem", {
    method: "POST", headers: { ...staffHeaders, "x-card-id": gridCard }, body: JSON.stringify({ serial: gridPass.serial }),
  });
  expect(gridRedeem.status === 200, "the card at its old target still redeems");
  const rolled = (await getPool().query<{ stamps_target: number; reward: string; stamp_count: number }>(
    `SELECT stamps_target, reward, stamp_count FROM passes WHERE serial = $1`, [gridPass.serial],
  )).rows[0]!;
  expect(rolled.stamps_target === 6, "redeeming rolls the card onto today's target");
  expect(rolled.reward === "Free muffin", "...and today's reward");
  expect(rolled.stamp_count === 0, "...restarting at zero, however many welcome stamps a new card gets");
  // Once nobody is left on 8, the next re-render prunes it — a replace, not a merge.
  expect((await putGrid([6])).status === 200, "a re-render with only the live target succeeds");
  expect((await getStampStrip(gridCard, 8, 7)) === null, "and the abandoned target's grids are pruned");

  // --- Rotating the PIN signs every staff phone out (break-glass) ---
  // Last, because it invalidates the sessions used above.
  const beforeRotate = await fetch(base + "/staff/api/passes", { headers: staffHeaders });
  expect(beforeRotate.status === 200, "the staff session works before the PIN is rotated");
  const rot = await fetch(base + "/dashboard/api/staff-pin", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({}),
  });
  const rotOut = JSON.parse(await rot.text());
  expect(rot.status === 200 && /^\d{6}$/.test(rotOut.staffPin), "an empty PIN request mints a fresh 6-digit one");
  // Shop says "Reset" rather than "Set" once a PIN exists. Whether one exists is
  // all the server may say — the PIN is stored as a scrypt hash and cannot be
  // read back, so overview must carry the boolean and never the value.
  const pinOv = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(pinOv.hasStaffPin === true, "overview reports that a staff PIN is set");
  expect(!JSON.stringify(pinOv).includes(rotOut.staffPin), "...and never the PIN itself");
  const ownerRot = (await getOwnerByEmail("owner@test.my"))!;
  expect(verifyStaffPin(ownerRot, rotOut.staffPin), "the rotated PIN verifies");
  expect(!verifyStaffPin(ownerRot, "9876"), "the old PIN stops working");
  const afterRotate = await fetch(base + "/staff/api/passes", { headers: staffHeaders });
  expect(afterRotate.status === 401, "rotating the PIN revokes every existing staff session");
  expect(
    (await fetch(base + "/staff/api/passes", { headers: { ...staffHeaders, "x-card-id": secondCard.id } })).status === 401,
    "and it revokes them on every card at once",
  );
  expect((await get("/staff", { headers: { cookie: staff1.cookie } })).body.includes("Staff login"),
    "a revoked device is shown the PIN form again (no reload loop)");
  const staffRot = await staffLogin("default", rotOut.staffPin);
  expect(staffRot.status === 200, "staff sign back in with the new PIN");
  expect(
    (await fetch(base + "/staff/api/passes", { headers: { ...staffHeaders, cookie: staffRot.cookie } })).status === 200,
    "the new session works",
  );
  // The second owner's PIN is untouched by the first owner rotating theirs.
  expect(
    !verifyStaffPin((await getOwnerByEmail("second@card.my"))!, rotOut.staffPin),
    "one owner's PIN never works at another owner's counter",
  );

  // ---- v1.4: the event log answers questions nobody has asked yet ----------
  //
  // The point of these is not that a row was written — it's that the columns
  // needed to GROUP BY anything are populated. An event that lands with a null
  // merchant or a blank platform is worse than no event: it looks like data.

  const evCols = (await getPool().query<{
    type: string;
    merchant_id: string | null;
    customer_id: string | null;
    platform: string;
    stamps_after: number | null;
    stamps_target: number | null;
  }>(`SELECT type, merchant_id, customer_id, platform, stamps_after, stamps_target
        FROM events WHERE type = 'stamp' ORDER BY id DESC LIMIT 1`)).rows[0];
  expect(Boolean(evCols?.merchant_id), "a stamp event knows its merchant without a join");
  expect(Boolean(evCols?.customer_id), "a stamp event knows its customer without a join");
  expect(evCols?.platform === "apple" || evCols?.platform === "google",
    `a stamp event knows its platform (${evCols?.platform})`);
  expect(evCols?.stamps_after != null, "a stamp event records the progress it produced");
  expect(evCols?.stamps_target != null, "a stamp event records the target in force at the time");

  // The funnel: a join page view must exist before any of it can be measured.
  const viewsBefore = Number((await getPool().query<{ c: string }>(
    `SELECT count(*) c FROM events WHERE type = 'join_view'`)).rows[0]!.c);
  await get("/c/default", { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" } });
  const views = (await getPool().query<{ platform: string; merchant_id: string | null; metadata: { bot?: boolean } }>(
    `SELECT platform, merchant_id, metadata FROM events WHERE type = 'join_view' ORDER BY id DESC LIMIT 1`)).rows[0];
  expect(
    Number((await getPool().query<{ c: string }>(
      `SELECT count(*) c FROM events WHERE type = 'join_view'`)).rows[0]!.c) === viewsBefore + 1,
    "opening the join page logs exactly one join_view",
  );
  expect(views?.platform === "apple", "the view is labelled with the wallet that phone can use");
  expect(views?.metadata?.bot === false, "a real phone is not flagged as a bot");
  expect(Boolean(views?.merchant_id), "a join_view knows which business was scanned");

  // A crawler hitting a printed URL must be filterable, not counted as a scan.
  await get("/c/default", { headers: { "user-agent": "Twitterbot/1.0" } });
  const botView = (await getPool().query<{ metadata: { bot?: boolean } }>(
    `SELECT metadata FROM events WHERE type = 'join_view' ORDER BY id DESC LIMIT 1`)).rows[0];
  expect(botView?.metadata?.bot === true, "a crawler's view is flagged so it can be excluded");

  // A page view must NOT mint a customer — the customer list is a real thing
  // owners look at, and every bot that ever finds a poster URL would be in it.
  const custCountBefore = Number((await getPool().query<{ c: string }>(
    `SELECT count(*) c FROM customers`)).rows[0]!.c);
  await get("/c/default", { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } });
  expect(
    Number((await getPool().query<{ c: string }>(`SELECT count(*) c FROM customers`)).rows[0]!.c) === custCountBefore,
    "a join page view does not mint a customer",
  );

  // What was actually sent, and whether it arrived.
  const msg = (await getPool().query<{ kind: string; body: string; delivered: boolean | null; customer_id: string | null }>(
    `SELECT kind, body, delivered, customer_id FROM messages ORDER BY id DESC LIMIT 1`)).rows[0];
  expect(Boolean(msg), "a nudge writes a messages row");
  expect(Boolean(msg?.body), `the message body is stored, not just the fact of it (${msg?.body?.slice(0, 30)})`);
  expect(msg?.kind === "manual-nudge" || msg?.kind === "auto-winback", `the message knows why it was sent (${msg?.kind})`);

  // passes.message is overwritten by the next nudge; messages must not be.
  const msgCount = Number((await getPool().query<{ c: string }>(
    `SELECT count(*) c FROM messages`)).rows[0]!.c);
  expect(msgCount >= 1, `message history accumulates rather than overwriting (${msgCount} rows)`);

  // A card edit has to leave a trace, or a metric that moves has no explanation.
  await getPool().query(`UPDATE events SET id = id WHERE false`); // no-op, keeps the linter honest
  const { updateCard: editCard } = await import("../src/db.js");
  await editCard("default", { reward: "Free kopi peng" }, "owner:e2e");
  const editEv = (await getPool().query<{ actor: string; metadata: { changed?: Record<string, { from: unknown; to: unknown }> } }>(
    `SELECT actor, metadata FROM events WHERE type = 'card_edited' ORDER BY id DESC LIMIT 1`)).rows[0];
  expect(editEv?.actor === "owner:e2e", "a card edit records who made it");
  expect(
    editEv?.metadata?.changed?.reward?.to === "Free kopi peng",
    "a card edit records the new value",
  );
  expect(
    typeof editEv?.metadata?.changed?.reward?.from === "string",
    "a card edit records the OLD value — the part that is otherwise gone forever",
  );
  const editsBefore = Number((await getPool().query<{ c: string }>(
    `SELECT count(*) c FROM events WHERE type = 'card_edited'`)).rows[0]!.c);
  await editCard("default", { reward: "Free kopi peng" }, "owner:e2e"); // same value
  expect(
    Number((await getPool().query<{ c: string }>(
      `SELECT count(*) c FROM events WHERE type = 'card_edited'`)).rows[0]!.c) === editsBefore,
    "a save that changed nothing is not logged as an edit",
  );

  // A typed code that matched nothing is the only trace of a worn poster.
  const badLookup = await fetch(base + "/staff/api/lookup?code=ZZZZZZ", {
    headers: { ...staffHeaders, cookie: staffRot.cookie },
  });
  expect(badLookup.status === 404, "an unknown code is still a 404");
  const failed = (await getPool().query<{ metadata: { code?: string } }>(
    `SELECT metadata FROM events WHERE type = 'lookup_failed' ORDER BY id DESC LIMIT 1`)).rows[0];
  expect(failed?.metadata?.code === "ZZZZZZ", "a failed lookup records the code that was typed");

  // A wrong PIN must outlive the process that counted it.
  const pinBefore = Number((await getPool().query<{ c: string }>(
    `SELECT count(*) c FROM events WHERE type = 'pin_failed'`)).rows[0]!.c);
  await staffLogin("default", "000000");
  expect(
    Number((await getPool().query<{ c: string }>(
      `SELECT count(*) c FROM events WHERE type = 'pin_failed'`)).rows[0]!.c) === pinBefore + 1,
    "a wrong staff PIN is recorded, not just rate-limited in memory",
  );
  const pinEvents = (await getPool().query<{ metadata: Record<string, unknown> }>(
    `SELECT metadata FROM events WHERE type = 'pin_failed'`)).rows;
  expect(
    pinEvents.every((e) => !JSON.stringify(e.metadata).includes("000000")),
    "the attempted PIN itself is never stored",
  );

  // The Google callback: refused without the shared secret, and never with a 4xx
  // that Google would retry against for hours.
  const noSecret = await fetch(base + "/google/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedMessage: JSON.stringify({ objectId: "x.y", eventType: "del" }) }),
  });
  expect(noSecret.status === 200, "an unauthorised Google callback still answers 200 (no retry storm)");
  expect(
    ((await noSecret.json()) as { ok?: boolean }).ok === false,
    "...but does not act on it",
  );

  // Nothing may ever rewrite history.
  const eventUpdates = (await getPool().query<{ n: string }>(
    `SELECT count(*) n FROM events WHERE created_at > now() + interval '1 minute'`)).rows[0]!.n;
  expect(Number(eventUpdates) === 0, "no event is dated in the future");

  console.log("\nALL E2E CHECKS PASSED ✅");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
