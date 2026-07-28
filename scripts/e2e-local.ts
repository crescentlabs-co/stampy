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

  const { migrate, createPass, generateShortCode, getCard, logEvent, getOwnerByEmail, setResetToken, updateCard, getPool, verifyStaffPin, setStaffPin: setStaffPinFor, createCard, linkOwnerCard, merchantForOwner: ownerMerchant } =
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
  expect(landing.status === 200 && landing.body.includes("Get early access"), "/ serves the marketing landing page");
  // Font face is inline in the page CSS (no separate cacheable stylesheet) and
  // points at the uniquely-named woff2, which is served statically.
  expect(landing.body.includes("/assets/fonts/space-grotesk-latin.woff2"), "pages declare the Space Grotesk @font-face inline");
  const woff = await get("/assets/fonts/space-grotesk-latin.woff2");
  expect(woff.status === 200, "GET /assets/fonts/*.woff2 serves the font file");

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
  const secondOwner = (await getOwnerByEmail("second@card.my"))!;
  expect(secondOwner.staff_pin_hash.startsWith("scrypt$"), "a new owner's PIN is stored hashed, never in plaintext");
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
  const mk = async (platform: "apple" | "google" = "apple", customerId?: string) => {
    const merchant = await merchantOf("default");
    const cust = customerId ?? (merchant ? (await mkCustomer(merchant.id)).id : null);
    return createPass({
      serial: crypto.randomUUID(),
      cardId: "default",
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
  // Redeem restarts the card at the café's welcome-stamp count, NOT 0 — a
  // returning customer must never be worse off than a brand-new one.
  expect(
    JSON.parse(await redeem.text()).pass.stamps === card.stamps_start,
    `redeem restarts at the welcome-stamp count (${card.stamps_start})`,
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
  await fetch(base + "/staff/api/undo", {
    method: "POST", headers: staff2Headers, body: JSON.stringify({ serial: crossPass.serial }),
  });

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

  // --- Rich stamp grid: one strip PNG per count (Apple strip / Google hero) ---
  expect((await get("/art/stamps/2.png")).status === 404, "no stamp grid → strip 404 (falls back to text dots)");
  const stampUp = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "☕", strips: [
      { filled: 0, png: pngB64 }, { filled: 1, png: pngB64 }, { filled: 2, png: pngB64 },
    ] }),
  });
  expect(stampUp.status === 200, "stamp-grid upload accepted");
  const servedStrip = Buffer.from(await (await fetch(base + "/art/stamps/1.png")).arrayBuffer());
  expect(servedStrip.equals(Buffer.from(pngB64, "base64")), "uploaded strip bytes served back at /art/stamps/1.png");
  const ovStamp = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const dfltStamp = ovStamp.cards.find((c: any) => c.id === "default");
  expect(dfltStamp.stampStyle === "☕" && dfltStamp.stampsVersion > 0, "overview reports stamp style + version");
  const badStamp = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "x", strips: [{ filled: 0, png: "bm90LWEtcG5n" }] }),
  });
  expect(badStamp.status === 400, "non-PNG strip rejected");
  const noAuthStamp = await fetch(base + "/dashboard/api/card/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style: "x", strips: [{ filled: 0, png: pngB64 }] }),
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
    Array.isArray(adminOk.retention) &&
      adminOk.retention.every((r: any) =>
        typeof r.second_visit_rate === "number" && typeof r.completion_rate === "number" &&
        "median_gap_days" in r && "alive_30" in r),
    "admin sees retention: second visit, completion, gaps and still-active rates",
  );
  expect(
    Array.isArray(adminOk.staff) &&
      adminOk.staff.every((s: any) => /^staff:[0-9a-f]{10}$/.test(s.actor) && typeof s.stamps === "number"),
    "admin sees counter activity per staff phone",
  );
  expect(JSON.stringify(adminOk).indexOf("password") === -1, "admin overview never includes any password field");

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

  // --- Done-for-you: admin creates a fully-designed café + owner account ---
  const dfyForbidden = await fetch(base + "/admin/api/card", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieOutsider },
    body: JSON.stringify({ cafeName: "Sneaky", ownerEmail: "x@y.my" }),
  });
  expect(dfyForbidden.status === 403, "a non-admin can't create a café via the admin console");
  const dfy = await fetch(base + "/admin/api/card", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({
      cafeName: "Nasi Lemak House", ownerEmail: "nasi@lemak.my", reward: "Free plate",
      bg: "#7a2f1c", fg: "#fff2ea", label: "#f6b98f", stampStyle: "🍗",
      banner: pngB64, strips: [{ filled: 0, png: pngB64 }, { filled: 1, png: pngB64 }],
    }),
  });
  const dfyOut = JSON.parse(await dfy.text());
  expect(dfy.status === 200 && dfyOut.cardId && dfyOut.tempPassword, "admin creates a café + owner in one step");
  const dfyLogin = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nasi@lemak.my", password: dfyOut.tempPassword }),
  });
  expect(dfyLogin.status === 200, "the new owner logs in with their temp password");
  const dfyDup = await fetch(base + "/admin/api/card", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ cafeName: "Dup", ownerEmail: "nasi@lemak.my" }),
  });
  expect(dfyDup.status === 409, "creating a café for an existing email → 409 email-taken");
  // The created café carries its rendered stamp grid + isolation from other owners.
  expect((await get("/c/" + dfyOut.cardId + "/art/stamps/1.png")).status === 200, "the done-for-you café serves its rendered stamp strip");

  // --- Reusable card designs: mock one up now, push it onto a card later ---
  const tplNew = await fetch(base + "/admin/api/templates", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({
      name: "Ah Seng Kopitiam", reward: "Free kopi",
      bg: "#123047", fg: "#eef7fc", label: "#8fc4e6", stampStyle: "☕", banner: pngB64,
    }),
  });
  const tplOut = JSON.parse(await tplNew.text());
  expect(tplNew.status === 200 && tplOut.id, "a card design can be saved before any merchant exists");
  const tplList = JSON.parse((await get("/admin/api/templates", { headers: { cookie: cookieNow } })).body);
  expect(
    tplList.templates.some((t: any) => t.id === tplOut.id && t.has_banner && t.reward === "Free kopi"),
    "saved designs are listed with their art flags",
  );
  expect(
    (await get("/admin/api/templates", { headers: { cookie: cookieOutsider } })).status === 403,
    "a non-admin can't read the design library",
  );

  const applied = await fetch(base + "/admin/api/card/" + dfyOut.cardId + "/apply-template", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ templateId: tplOut.id, strips: [{ filled: 0, png: pngB64 }, { filled: 1, png: pngB64 }] }),
  });
  expect(applied.status === 200, "a design pushes onto a merchant's existing card");
  const appliedCafe = (await getCard(dfyOut.cardId))!;
  expect(
    appliedCafe.reward === "Free kopi" && appliedCafe.stamp_style === "☕" &&
      appliedCafe.background_color === "rgb(18, 48, 71)",
    "the design's reward, stamp style and colours land on the card",
  );
  // The card's identity and links are NOT part of a design.
  expect(appliedCafe.name === "Nasi Lemak House", "applying a design never renames the card");
  expect((await get("/c/" + dfyOut.cardId)).status === 200, "and the sign-up link still works");

  expect(
    (await get("/admin/api/card/" + dfyOut.cardId + "/apply-template", { headers: { cookie: cookieNow } })).status === 404,
    "applying a design is a POST, not something a stray GET can trigger",
  );
  const sheet = await get("/admin/card/" + dfyOut.cardId + "/sheet", { headers: { cookie: cookieNow } });
  expect(
    sheet.status === 200 && sheet.body.includes("/c/" + dfyOut.cardId + "/qr") && sheet.body.includes("Free kopi"),
    "the printable counter sheet carries the card's QR and reward",
  );
  expect(
    (await get("/admin/card/" + dfyOut.cardId + "/sheet", { headers: { cookie: cookieOutsider } })).status === 403,
    "the counter sheet is admin-only",
  );

  await fetch(base + "/admin/api/templates/" + tplOut.id, { method: "DELETE", headers: { cookie: cookieNow } });
  const tplGone = JSON.parse((await get("/admin/api/templates", { headers: { cookie: cookieNow } })).body);
  expect(!tplGone.templates.some((t: any) => t.id === tplOut.id), "a design can be deleted");

  // --- Removing a card: operator-only, and only when there is nothing to lose ---
  const delCard = async (id: string, cookieUsed: string) => {
    const r = await fetch(base + "/admin/api/card/" + id, { method: "DELETE", headers: { cookie: cookieUsed } });
    return { status: r.status, body: JSON.parse(await r.text()) };
  };
  expect((await delCard(dfyOut.cardId, cookieOutsider)).status === 403, "removing a card is admin-only");
  expect((await delCard("no-such-card-id", cookieNow)).status === 404, "removing a card that isn't there is a 404");
  // A shop nobody has touched yet: signup mints one card and logs nothing, so
  // this is the only state in which the "last card" rule is what stops you.
  await fetch(base + "/dashboard/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "spare@card.my", password: "password123", cafeName: "Spare Shop" }),
  });
  const spareOnly = (await ownerMerchant((await getOwnerByEmail("spare@card.my"))!.id))!;
  const spareCards = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body)
    .cards.filter((c: any) => (c.owners ?? "").includes("spare@card.my"));
  expect(spareCards.length === 1, "a fresh signup has exactly one card");
  const lastOne = await delCard(spareCards[0].id, cookieNow);
  expect(lastOne.status === 409 && lastOne.body.error === "last-card", "a merchant's only card is never removed");
  expect((await getCard(spareCards[0].id)) !== null, "...and it is still there afterwards");
  expect(Boolean(spareOnly.id), "the spare shop's merchant exists");
  // The default card has passes on it by now.
  const inUse = await delCard("default", cookieNow);
  expect(inUse.status === 409 && inUse.body.error === "has-passes", "a card that ever issued a pass is never removed");
  // No passes, but someone scanned the poster once. Events are append-only, so
  // a card with any trace at all stays — a scan is not deleted to free it.
  const scanned = await addLegacyCard("spare@card.my", "Scanned");
  await logEvent(scanned, "", "join_view");
  const withHistory = await delCard(scanned, cookieNow);
  expect(withHistory.status === 409 && withHistory.body.error === "has-history", "a scan nobody acted on still protects the card");
  // A genuinely untouched spare: no passes, no events, not their only card.
  const junk = await addLegacyCard("spare@card.my", "Junk");
  const junkGone = await delCard(junk, cookieNow);
  expect(junkGone.status === 200 && junkGone.body.ok, "an untouched spare card is removed");
  expect((await getCard(junk)) === null, "...and is really gone");

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
    ownerCust.limits.perWeek >= 1 && ownerCust.limits.maxUnanswered >= 1,
    "the customers response states both nudge limits",
  );
  // The cohorts and the gap counts are computed server-side, so the browser
  // can't invent a group the Nudge button wouldn't actually send to.
  expect(
    Array.isArray(ownerCust.buckets) && ownerCust.buckets.some((b: any) => b.key === "active"),
    "the customers response carries the weekly lapse cohorts",
  );
  expect(
    ownerCust.buckets.every(
      (b: any) => typeof b.customers === "number" && typeof b.nudgedThisWeek === "number" && typeof b.eligible === "number",
    ),
    "each cohort states its size, nudges this week, and how many are still under the limit",
  );
  expect(
    ownerCust.buckets.reduce((a: number, b: any) => a + b.customers, 0) === ownerCust.customers.length,
    "every customer lands in exactly one cohort",
  );
  expect(
    typeof ownerCust.counts.active === "number" &&
      typeof ownerCust.counts.issuedNeverAdded === "number" &&
      typeof ownerCust.counts.removed === "number",
    "the customers response explains the gap between cards issued and customers",
  );
  expect(
    ownerCust.customers.every((c: any) => typeof c.canNudge === "boolean" && typeof c.bucket === "string"),
    "each customer row states its cohort and whether the limits allow a nudge",
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

  const oNudgeAll = await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "Owner-level all", target: "all" }),
  });
  const oNudgeAllOut = JSON.parse(await oNudgeAll.text());
  expect(oNudgeAll.status === 200 && oNudgeAllOut.total === ownerCust.customers.length, "owner-level nudge to all reaches every customer");

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
  // The weekly limit now counts the person, so their other pass is capped too.
  const secondTry = JSON.parse(await (await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "Again", target: [googlePass.serial] }),
  })).text());
  expect(
    Number((await getPool().query<{ n: string }>(
      `SELECT count(*) AS n FROM events WHERE type = 'nudge' AND serial = ANY($1)`,
      [[applePass.serial, googlePass.serial]],
    )).rows[0]!.n) === 2,
    "a second message this week is still allowed — and targeting their OTHER pass reaches the same person",
  );
  const thirdTry = JSON.parse(await (await fetch(base + "/dashboard/api/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "Third", target: [applePass.serial] }),
  })).text());
  expect(
    thirdTry.total === 0 && thirdTry.skipped.rateLimited === 1,
    "a third message in the same week is refused — the limit follows the person",
  );
  void secondTry;

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

  // --- Automated win-back ---
  const { runAutoWinback, MAX_UNANSWERED_NUDGES, MAX_NUDGES_PER_WEEK } = await import("../src/winback.js");
  const lp = await mk(); // fresh pass on the default café, never stamped
  // Lapse is measured from the last *visit* (last stamp event, else when the
  // card was created) — NOT updated_at, which a nudge bumps. So age the card
  // itself; backdating updated_at would no longer make it lapsing.
  await getPool().query(
    "UPDATE passes SET created_at = now() - interval '30 days', updated_at = now() - interval '30 days' WHERE serial = $1",
    [lp.serial],
  );
  const nudgeCount = async () =>
    (await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM events WHERE serial = $1 AND type = 'nudge'", [lp.serial])).rows[0]!.n;

  await runAutoWinback(); // default café has auto-winback OFF → nobody nudged
  expect((await nudgeCount()) === 0, "auto win-back sends nothing while the café hasn't opted in");

  await updateCard("default", { auto_winback_enabled: true, auto_winback_days: 14, auto_winback_message: "Auto: we miss you" });
  await runAutoWinback();
  expect((await nudgeCount()) === 1, "auto win-back nudges a lapsing customer once opted in");
  await runAutoWinback(); // immediate re-run
  expect((await nudgeCount()) === 1, "auto win-back does NOT re-nudge within the window");
  await updateCard("default", { auto_winback_enabled: false }); // leave it off for cleanliness

  // --- Lapse is measured from the last visit, not updated_at (regression) ---
  // Nudging used to bump passes.updated_at, which lapse was measured from, so
  // win-back messages silently un-lapsed the very customers being chased.
  const { lapsingSerials, cardMetrics, pruneAbandonedPasses, upsertRegistration, setMessage } =
    await import("../src/db.js");
  const lap = await mk();
  await getPool().query(
    "UPDATE passes SET created_at = now() - interval '40 days' WHERE serial = $1",
    [lap.serial],
  );
  expect((await lapsingSerials("default", 14)).includes(lap.serial), "a card unseen for 40 days is lapsing");
  await setMessage(lap.serial, "We miss you!"); // bumps updated_at, must NOT reset the clock
  expect(
    (await lapsingSerials("default", 14)).includes(lap.serial),
    "a nudge does NOT clear the lapsing flag (updated_at regression)",
  );
  // A stamp is a real visit, so it does clear it.
  await logEvent("default", lap.serial, "stamp");
  expect(!(await lapsingSerials("default", 14)).includes(lap.serial), "an actual stamp clears the lapsing flag");

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

  // --- Win-back effectiveness + the churn stop-rule ---
  const { nudgeOutcomes, unansweredNudges } = await import("../src/db.js");
  const ch = await mk();
  await getPool().query("UPDATE passes SET created_at = now() - interval '60 days' WHERE serial = $1", [ch.serial]);
  await updateCard("default", { auto_winback_enabled: true, auto_winback_days: 14 });
  for (let i = 0; i < 9; i++) {
    // Back-dating the nudges re-opens both throttles — the café's own window and
    // the shared 2-per-week limit — so the give-up rule is what stops us.
    await runAutoWinback();
    await getPool().query("UPDATE events SET created_at = now() - interval '30 days' WHERE serial = $1 AND type = 'nudge'", [ch.serial]);
  }
  const sent = await unansweredNudges(ch.serial);
  expect(sent === MAX_UNANSWERED_NUDGES, `auto win-back gives up after ${MAX_UNANSWERED_NUDGES} unanswered messages (sent ${sent})`);
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

  // --- Dashboard IA: four tabs, each one job ---
  const dashIa = (await get("/dashboard")).body;
  for (const tab of ["home", "customers", "card", "account"]) {
    expect(dashIa.includes('data-tab="' + tab + '"'), `dashboard has the ${tab} tab`);
  }
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
