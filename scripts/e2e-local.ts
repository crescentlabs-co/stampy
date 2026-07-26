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
  process.env.ADMIN_EMAIL = "owner@test.my, second@cafe.my"; // comma-listed: BOTH are admins

  const { migrate, createPass, generateShortCode, getCafe, logEvent, getOwnerByEmail, setResetToken, updateCafe, getPool, verifyStaffPin, setStaffPin: setStaffPinFor } =
    await import("../src/db.js");
  const { createHash } = await import("node:crypto");
  await migrate();
  await migrate(); // idempotency check
  console.log("MIGRATE OK (x2, idempotent)");

  const cafe = await getCafe("default");
  if (!cafe || cafe.name !== "Kopi Corner") throw new Error("default cafe seed failed");
  console.log("SEED OK:", cafe.name, cafe.reward, cafe.stamps_target, cafe.stamps_start);

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
    body: JSON.stringify({ email: "second@cafe.my", password: "password123", cafeName: "Second Owner Café" }),
  });
  const cookie2 = signup2.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(signup2.status === 200 && cookie2.startsWith("stampy_session="), "self-serve signup is open");
  const ov2nd = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookie2 } })).body);
  expect(
    ov2nd.cafes.length === 1 &&
      ov2nd.cafes[0].name === "Second Owner Café" &&
      ov2nd.cafes[0].id !== "default",
    "second owner sees only their own starter card (not the default café)",
  );
  // The PIN is stored only as a scrypt hash, so there is nothing for the API to
  // hand back — the dashboard can set or replace it, never read it.
  expect(ov2nd.cafes[0].staffPin === undefined, "the overview API never returns a staff PIN");
  // The PIN belongs to the OWNER now — one counter, one PIN, however many cards.
  const secondOwner = (await getOwnerByEmail("second@cafe.my"))!;
  expect(secondOwner.staff_pin_hash.startsWith("scrypt$"), "a new owner's PIN is stored hashed, never in plaintext");
  expect(!verifyStaffPin(secondOwner, "1234"), "a new owner gets a random PIN, not the shared default");
  const starter = (await getCafe(ov2nd.cafes[0].id))!;
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
  expect(overview1.cafes.length === 1 && overview1.cafes[0].id === "default", "overview lists default café");

  // Edit café via dashboard
  const pinHashBefore = (await getCafe("default"))!.staff_pin_hash;
  const edit = await fetch(base + "/dashboard/api/cafe/default", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ reward: "Free latte", staffPin: "9876", stampsTarget: 8 }),
  });
  expect(edit.status === 200, "café edit saves");
  const cafeAfter = await getCafe("default");
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
    `UPDATE cafes SET staff_pin_hash = $1 WHERE id = 'default'`,
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
  const mk = async (platform: "apple" | "google" = "apple") =>
    createPass({
      serial: crypto.randomUUID(),
      cafeId: "default",
      platform,
      shortCode: generateShortCode(),
      authToken: "t".repeat(24),
      stampCount: 2,
      stampsTarget: 8,
      reward: "Free latte",
    });
  const p1 = await mk();
  const p2 = await mk();
  await logEvent("default", p1.serial, "enroll");
  await logEvent("default", p2.serial, "enroll");

  // --- Staff auth: the PIN is exchanged once for a session, not replayed ---
  const staffLogin = async (cafeId: string, pin: string) => {
    const r = await fetch(base + "/staff/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cafe-id": cafeId },
      body: JSON.stringify({ pin }),
    });
    return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
  };

  const noSession = await fetch(base + "/staff/api/passes", {
    headers: { "Content-Type": "application/json", "x-cafe-id": "default" },
  });
  expect(noSession.status === 401, "staff API refuses a device with no session");
  const oldWay = await fetch(base + "/staff/api/passes", {
    headers: { "Content-Type": "application/json", "x-cafe-id": "default", "x-staff-pin": "9876" },
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
  const staffHeaders = { "Content-Type": "application/json", "x-cafe-id": "default", cookie: staff1.cookie };
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
    JSON.parse(await redeem.text()).pass.stamps === cafe.stamps_start,
    `redeem restarts at the welcome-stamp count (${cafe.stamps_start})`,
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
  const m = overview2.cafes[0].metrics;
  expect(m.cards === 3, `metrics: 3 cards incl. the cooldown-test card (got ${m.cards})`);
  expect(m.stamps >= 2 && m.redemptions === 1, `metrics: stamps=${m.stamps} redemptions=${m.redemptions}`);

  // New café via dashboard, isolated from default
  const newCafe = await fetch(base + "/dashboard/api/cafes", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: "Second Café" }),
  });
  const newCafeOut = JSON.parse(await newCafe.text());
  expect(newCafeOut.ok && newCafeOut.id, "second café created");
  // A session is scoped to the OWNER: this owner's other card is fine on the
  // same sign-in (one counter, one PIN). Another owner's card is not — see the
  // cross-owner check further down.
  const sameOwnerCard = await fetch(base + "/staff/api/passes", {
    headers: { ...staffHeaders, "x-cafe-id": newCafeOut.id },
  });
  expect(sameOwnerCard.status === 200, "one staff session covers every card the same owner runs");

  // The one PIN signs in against any of the owner's cards.
  const staff2 = await staffLogin(newCafeOut.id, "9876");
  expect(staff2.status === 200, "the owner's PIN signs in against their second card too");
  const staff2Headers = { "Content-Type": "application/json", "x-cafe-id": newCafeOut.id, cookie: staff2.cookie };
  const otherList = await fetch(base + "/staff/api/passes", { headers: staff2Headers });
  expect(JSON.parse(await otherList.text()).passes.length === 0, "cards are isolated (no cross-card customers)");
  // Sharing a sign-in must NOT let one card's stamper touch another's customers
  // — the serial still has to belong to the card named in the header.
  const crossStamp = await fetch(base + "/staff/api/stamp", {
    method: "POST", headers: staff2Headers, body: JSON.stringify({ serial: p1.serial }),
  });
  expect(crossStamp.status === 404, "cannot stamp a card that belongs to a different programme");

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
  expect(
    gStampOut.push.detail[0].reason === "google-not-configured",
    "google dispatch reports google-not-configured gracefully (no throw)",
  );

  const logo = await get("/art/logo.png");
  expect(logo.status === 200, "hosted logo for Google class is served");

  // --- Self-serve branding: colours (hex↔rgb boundary) + logo upload ---
  const ov3 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const dflt = ov3.cafes.find((c: any) => c.id === "default");
  expect(dflt.bg === "#3b2016" && dflt.logoVersion === 0, "overview exposes hex colours + no logo yet");

  const colorEdit = await fetch(base + "/dashboard/api/cafe/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bg: "#112233", label: "#abc" }),
  });
  expect(colorEdit.status === 200, "colour edit saves");
  const cafeColored = await getCafe("default");
  expect(
    cafeColored!.background_color === "rgb(17, 34, 51)" &&
      cafeColored!.label_color === "rgb(170, 187, 204)",
    "hex colours stored as rgb() for PassKit (incl. #abc shorthand)",
  );
  const ov4 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(ov4.cafes.find((c: any) => c.id === "default").bg === "#112233", "overview returns the saved hex back");

  // 1×1 transparent PNG
  const pngB64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const upload = await fetch(base + "/dashboard/api/cafe/default/logo", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ png: pngB64 }),
  });
  expect(upload.status === 200, "logo upload accepted");
  const servedLogo = Buffer.from(await (await fetch(base + "/art/logo.png")).arrayBuffer());
  expect(servedLogo.equals(Buffer.from(pngB64, "base64")), "uploaded logo bytes served back at /art/logo.png");
  const ov5 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(ov5.cafes.find((c: any) => c.id === "default").logoVersion > 0, "overview reports the logo version");

  const badUpload = await fetch(base + "/dashboard/api/cafe/default/logo", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ png: Buffer.from("definitely not a png").toString("base64") }),
  });
  expect(badUpload.status === 400, "non-PNG upload rejected");

  const noAuthUpload = await fetch(base + "/dashboard/api/cafe/default/logo", {
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

  const rmLogo = await fetch(base + "/dashboard/api/cafe/default/logo", {
    method: "DELETE", headers: { cookie },
  });
  expect(rmLogo.status === 200, "logo delete works");
  const revertedLogo = Buffer.from(await (await fetch(base + "/art/logo.png")).arrayBuffer());
  expect(!revertedLogo.equals(servedLogo), "after delete the default logo is served again");

  // --- Banner image (optional; 404 until set) ---
  expect((await get("/art/banner.png")).status === 404, "no banner → 404 (optional art)");
  const bannerUp = await fetch(base + "/dashboard/api/cafe/default/banner", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ png: pngB64 }),
  });
  expect(bannerUp.status === 200, "banner upload accepted");
  const servedBanner = await get("/art/banner.png");
  expect(servedBanner.status === 200, "banner served after upload");
  const ovBanner = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  expect(ovBanner.cafes.find((c: any) => c.id === "default").bannerVersion > 0, "overview reports banner version");
  const rmBanner = await fetch(base + "/dashboard/api/cafe/default/banner", { method: "DELETE", headers: { cookie } });
  expect(rmBanner.status === 200 && (await get("/art/banner.png")).status === 404, "banner delete reverts to none");

  // --- Rich stamp grid: one strip PNG per count (Apple strip / Google hero) ---
  expect((await get("/art/stamps/2.png")).status === 404, "no stamp grid → strip 404 (falls back to text dots)");
  const stampUp = await fetch(base + "/dashboard/api/cafe/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "☕", strips: [
      { filled: 0, png: pngB64 }, { filled: 1, png: pngB64 }, { filled: 2, png: pngB64 },
    ] }),
  });
  expect(stampUp.status === 200, "stamp-grid upload accepted");
  const servedStrip = Buffer.from(await (await fetch(base + "/art/stamps/1.png")).arrayBuffer());
  expect(servedStrip.equals(Buffer.from(pngB64, "base64")), "uploaded strip bytes served back at /art/stamps/1.png");
  const ovStamp = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const dfltStamp = ovStamp.cafes.find((c: any) => c.id === "default");
  expect(dfltStamp.stampStyle === "☕" && dfltStamp.stampsVersion > 0, "overview reports stamp style + version");
  const badStamp = await fetch(base + "/dashboard/api/cafe/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ style: "x", strips: [{ filled: 0, png: "bm90LWEtcG5n" }] }),
  });
  expect(badStamp.status === 400, "non-PNG strip rejected");
  const noAuthStamp = await fetch(base + "/dashboard/api/cafe/default/stamps", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style: "x", strips: [{ filled: 0, png: pngB64 }] }),
  });
  expect(noAuthStamp.status === 401, "stamp-grid upload requires owner login");
  const rmStamp = await fetch(base + "/dashboard/api/cafe/default/stamps", { method: "DELETE", headers: { cookie } });
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
    (await get("/dashboard/api/cafe/default/customers", { headers: { cookie: cookieNow } })).status === 404,
    "the superseded per-café customers endpoint is gone",
  );
  const deadNudge = await fetch(base + "/dashboard/api/cafe/default/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "hi", target: "all" }),
  });
  expect(deadNudge.status === 404, "the superseded per-café nudge endpoint is gone");

  // --- Admin console (ADMIN_EMAIL = "owner@test.my, second@cafe.my") ---
  // A genuinely non-admin owner (not in the comma list) is refused.
  const outsider = await fetch(base + "/dashboard/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "outsider@cafe.my", password: "password123", cafeName: "Outsider" }),
  });
  const cookieOutsider = outsider.headers.get("set-cookie")?.split(";")[0] ?? "";
  const adminForbidden = await get("/admin/api/overview", { headers: { cookie: cookieOutsider } });
  expect(adminForbidden.status === 403, "a non-admin owner can't reach the admin console");

  // The SECOND comma-listed email is also an admin (multi-admin support).
  const adminSecond = await get("/admin/api/overview", { headers: { cookie: cookie2 } });
  expect(adminSecond.status === 200, "a second comma-listed ADMIN_EMAIL is also an admin");

  const adminOk = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(adminOk.cafes.length >= 2, "admin sees every café on the platform");
  expect(
    adminOk.cafes.some((c: any) => (c.owners || "").includes("second@cafe.my")),
    "admin sees which owner email is tied to each café",
  );
  // Merchant health: is the counter alive, and does the owner ever look?
  expect(
    adminOk.cafes.every((c: any) =>
      typeof c.stamps_7d === "number" && typeof c.added === "number" &&
      typeof c.removed === "number" && typeof c.never_added === "number" &&
      "last_stamp_at" in c && "last_owner_login" in c),
    "admin sees each merchant's recent activity and the wallet add/remove split",
  );
  expect(
    adminOk.cafes.find((c: any) => c.id === "default").last_owner_login !== null,
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

  const owner2 = adminOk.owners.find((o: any) => o.email === "second@cafe.my");
  const reset = await fetch(base + "/admin/api/owner/" + owner2.id + "/reset-password", {
    method: "POST", headers: { cookie: cookieNow },
  });
  const resetOut = JSON.parse(await reset.text());
  expect(reset.status === 200 && resetOut.tempPassword, "admin can mint a temp password (never sees the old)");
  const loginTemp = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "second@cafe.my", password: resetOut.tempPassword }),
  });
  expect(loginTemp.status === 200, "the reset temp password logs the owner in");

  // --- Done-for-you: admin creates a fully-designed café + owner account ---
  const dfyForbidden = await fetch(base + "/admin/api/cafe", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieOutsider },
    body: JSON.stringify({ cafeName: "Sneaky", ownerEmail: "x@y.my" }),
  });
  expect(dfyForbidden.status === 403, "a non-admin can't create a café via the admin console");
  const dfy = await fetch(base + "/admin/api/cafe", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({
      cafeName: "Nasi Lemak House", ownerEmail: "nasi@lemak.my", reward: "Free plate",
      bg: "#7a2f1c", fg: "#fff2ea", label: "#f6b98f", stampStyle: "🍗",
      banner: pngB64, strips: [{ filled: 0, png: pngB64 }, { filled: 1, png: pngB64 }],
    }),
  });
  const dfyOut = JSON.parse(await dfy.text());
  expect(dfy.status === 200 && dfyOut.cafeId && dfyOut.tempPassword, "admin creates a café + owner in one step");
  const dfyLogin = await fetch(base + "/dashboard/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nasi@lemak.my", password: dfyOut.tempPassword }),
  });
  expect(dfyLogin.status === 200, "the new owner logs in with their temp password");
  const dfyDup = await fetch(base + "/admin/api/cafe", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ cafeName: "Dup", ownerEmail: "nasi@lemak.my" }),
  });
  expect(dfyDup.status === 409, "creating a café for an existing email → 409 email-taken");
  // The created café carries its rendered stamp grid + isolation from other owners.
  expect((await get("/c/" + dfyOut.cafeId + "/art/stamps/1.png")).status === 200, "the done-for-you café serves its rendered stamp strip");

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

  const applied = await fetch(base + "/admin/api/cafe/" + dfyOut.cafeId + "/apply-template", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ templateId: tplOut.id, strips: [{ filled: 0, png: pngB64 }, { filled: 1, png: pngB64 }] }),
  });
  expect(applied.status === 200, "a design pushes onto a merchant's existing card");
  const appliedCafe = (await getCafe(dfyOut.cafeId))!;
  expect(
    appliedCafe.reward === "Free kopi" && appliedCafe.stamp_style === "☕" &&
      appliedCafe.background_color === "rgb(18, 48, 71)",
    "the design's reward, stamp style and colours land on the card",
  );
  // The card's identity and links are NOT part of a design.
  expect(appliedCafe.name === "Nasi Lemak House", "applying a design never renames the card");
  expect((await get("/c/" + dfyOut.cafeId)).status === 200, "and the sign-up link still works");

  expect(
    (await get("/admin/api/cafe/" + dfyOut.cafeId + "/apply-template", { headers: { cookie: cookieNow } })).status === 404,
    "applying a design is a POST, not something a stray GET can trigger",
  );
  const sheet = await get("/admin/cafe/" + dfyOut.cafeId + "/sheet", { headers: { cookie: cookieNow } });
  expect(
    sheet.status === 200 && sheet.body.includes("/c/" + dfyOut.cafeId + "/qr") && sheet.body.includes("Free kopi"),
    "the printable counter sheet carries the card's QR and reward",
  );
  expect(
    (await get("/admin/cafe/" + dfyOut.cafeId + "/sheet", { headers: { cookie: cookieOutsider } })).status === 403,
    "the counter sheet is admin-only",
  );

  await fetch(base + "/admin/api/templates/" + tplOut.id, { method: "DELETE", headers: { cookie: cookieNow } });
  const tplGone = JSON.parse((await get("/admin/api/templates", { headers: { cookie: cookieNow } })).body);
  expect(!tplGone.templates.some((t: any) => t.id === tplOut.id), "a design can be deleted");

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
  const outsiderCard2 = JSON.parse(await (await fetch(base + "/dashboard/api/cafes", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieOutsider },
    body: JSON.stringify({ name: "Outsider second card" }),
  })).text());
  const outsiderCard1 = JSON.parse(
    (await get("/dashboard/api/overview", { headers: { cookie: cookieOutsider } })).body,
  ).cafes[0].id;
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
    !custLanding.includes('id="wallets"') ||
      (custLanding.includes('href="/terms"') && custLanding.includes('href="/privacy"')),
    "the customer sign-up page links Terms and Privacy",
  );
  expect(!custLanding.includes('id="agree"'), "the customer sign-up page has no consent tick-box");

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

  await updateCafe("default", { auto_winback_enabled: true, auto_winback_days: 14, auto_winback_message: "Auto: we miss you" });
  await runAutoWinback();
  expect((await nudgeCount()) === 1, "auto win-back nudges a lapsing customer once opted in");
  await runAutoWinback(); // immediate re-run
  expect((await nudgeCount()) === 1, "auto win-back does NOT re-nudge within the window");
  await updateCafe("default", { auto_winback_enabled: false }); // leave it off for cleanliness

  // --- Lapse is measured from the last visit, not updated_at (regression) ---
  // Nudging used to bump passes.updated_at, which lapse was measured from, so
  // win-back messages silently un-lapsed the very customers being chased.
  const { lapsingSerials, cafeMetrics, pruneAbandonedPasses, upsertRegistration, setMessage } =
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
  const before = await cafeMetrics("default");
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

  const { cafeCardCounts, nudgeState } = await import("../src/db.js");
  expect((await cafeCardCounts("default")).removed >= 1, "a deleted card shows up in the removed count");
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
  expect((await post("/undo", { serial: un.serial }, staff2Headers)).status === 404, "cannot undo another café's card");

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
  const netBefore = (await cafeMetrics("default")).stamps;
  const nz = await mk();
  await post("/stamp", { serial: nz.serial });
  await post("/undo", { serial: nz.serial });
  expect((await cafeMetrics("default")).stamps === netBefore, "a stamp that is undone doesn't inflate the stamp count");

  // --- Win-back effectiveness + the churn stop-rule ---
  const { nudgeOutcomes, unansweredNudges } = await import("../src/db.js");
  const ch = await mk();
  await getPool().query("UPDATE passes SET created_at = now() - interval '60 days' WHERE serial = $1", [ch.serial]);
  await updateCafe("default", { auto_winback_enabled: true, auto_winback_days: 14 });
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
  await updateCafe("default", { auto_winback_enabled: false });

  const adminWb = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
  const defRow = adminWb.cafes.find((c: any) => c.id === "default");
  expect(
    defRow.nudged >= 1 && defRow.nudge_returned >= 1 && defRow.forced_stamps >= 1 && defRow.undos >= 1,
    "admin surfaces win-back outcomes and the counter-audit counters",
  );

  // --- Value tracking: average spend turns stamps into a money figure ---
  const spend = await fetch(base + "/dashboard/api/cafe/default", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ averageSpend: 4.5, currency: "RM" }),
  });
  expect(spend.status === 200, "average spend saves");
  const ovSpend = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie: cookieNow } })).body);
  const defCard = ovSpend.cafes.find((c: any) => c.id === "default");
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
  const secondCard = JSON.parse((await (await fetch(base + "/dashboard/api/cafes", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ name: "Pastry card" }),
  })).text()));
  expect(secondCard.ok && !secondCard.staffPin, "adding a card no longer mints a PIN of its own");
  const bothCards = JSON.parse(await (await fetch(base + "/staff/api/cards", { headers: staffHeaders })).text());
  expect(
    (bothCards.cards || []).some((c: any) => c.id === secondCard.id),
    "the stamper offers every card the owner runs, on one sign-in",
  );
  expect(
    (await fetch(base + "/staff/api/passes", { headers: { ...staffHeaders, "x-cafe-id": secondCard.id } })).status === 200,
    "the same staff session stamps the second card without signing in again",
  );
  // A café belonging to somebody else is still refused, header or not.
  expect(
    (await fetch(base + "/staff/api/passes", {
      headers: { cookie: staff1.cookie, "x-cafe-id": ov2nd.cafes[0].id },
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
    bareStaff.status === 200 && !bareStaff.body.includes('let cafeId = "default"'),
    "a bare /staff does not silently claim the default café",
  );
  expect(
    bareStaff.body.includes('let cafeId = "' + ov2nd.cafes[0].id + '"'),
    "a bare /staff resolves to the logged-in owner's own card",
  );
  // A staff phone that bookmarked plain /staff keeps working, on ITS owner's card.
  const bookmarked = await fetch(base + "/staff/api/passes", { headers: { cookie: staff1.cookie } });
  expect(bookmarked.status === 200, "a staff phone with no x-cafe-id still reaches its own counter");
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
    (await fetch(base + "/staff/api/passes", { headers: { ...staffHeaders, "x-cafe-id": secondCard.id } })).status === 401,
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
    !verifyStaffPin((await getOwnerByEmail("second@cafe.my"))!, rotOut.staffPin),
    "one owner's PIN never works at another owner's counter",
  );

  console.log("\nALL E2E CHECKS PASSED ✅");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
