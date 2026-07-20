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
  process.env.ADMIN_EMAIL = "owner@test.my"; // first signup below becomes the platform admin

  const { migrate, createPass, generateShortCode, getCafe, logEvent, getOwnerByEmail, setResetToken } =
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

  // Landing shows café name from DB now
  const landing = await get("/");
  expect(landing.status === 200 && landing.body.includes("Kopi Corner"), "landing renders café from DB");

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
  expect(ov2nd.cafes[0].staffPin !== "1234", "starter card gets a random PIN, not the shared default");

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
  const edit = await fetch(base + "/dashboard/api/cafe/default", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ reward: "Free latte", staffPin: "9876", stampsTarget: 8 }),
  });
  expect(edit.status === 200, "café edit saves");
  const cafeAfter = await getCafe("default");
  expect(cafeAfter!.reward === "Free latte" && cafeAfter!.staff_pin === "9876", "edit persisted");

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

  const staffHeaders = { "Content-Type": "application/json", "x-staff-pin": "9876", "x-cafe-id": "default" };

  const wrongPin = await fetch(base + "/staff/api/passes", { headers: { ...staffHeaders, "x-staff-pin": "1111" } });
  expect(wrongPin.status === 401, "staff wrong PIN rejected (per-café PIN from DB)");

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
  expect(JSON.parse(await redeem.text()).pass.stamps === 0, "redeem resets to 0");

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
    body: JSON.stringify({ name: "Second Café", staffPin: "2222" }),
  });
  const newCafeOut = JSON.parse(await newCafe.text());
  expect(newCafeOut.ok && newCafeOut.id, "second café created");
  const otherList = await fetch(base + "/staff/api/passes", {
    headers: { ...staffHeaders, "x-cafe-id": newCafeOut.id, "x-staff-pin": "2222" },
  });
  expect(JSON.parse(await otherList.text()).passes.length === 0, "cafés are isolated (no cross-café cards)");
  const crossStamp = await fetch(base + "/staff/api/stamp", {
    method: "POST",
    headers: { ...staffHeaders, "x-cafe-id": newCafeOut.id, "x-staff-pin": "2222" },
    body: JSON.stringify({ serial: p1.serial }),
  });
  expect(crossStamp.status === 404, "cannot stamp another café's card");

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

  // --- Win-back: customers list + owner nudge (single + all) ---
  const custRes = JSON.parse((await get("/dashboard/api/cafe/default/customers?lapsedDays=0", { headers: { cookie: cookieNow } })).body);
  expect(Array.isArray(custRes.customers) && custRes.customers.length >= 2, "customers list returns this café's cards");
  expect(custRes.customers[0].code && typeof custRes.customers[0].lastDays === "number", "each customer has a code + last-seen days");

  const nudgeOne = await fetch(base + "/dashboard/api/cafe/default/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "We miss you!", target: [p2.serial] }),
  });
  const nudgeOneOut = JSON.parse(await nudgeOne.text());
  expect(nudgeOne.status === 200 && nudgeOneOut.total === 1, "owner nudges a single customer");

  const nudgeAll = await fetch(base + "/dashboard/api/cafe/default/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "New menu!", target: "all" }),
  });
  const nudgeAllOut = JSON.parse(await nudgeAll.text());
  expect(nudgeAll.status === 200 && nudgeAllOut.total === custRes.customers.length, "owner bulk-nudges all customers");

  const nudgeEmpty = await fetch(base + "/dashboard/api/cafe/default/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookieNow },
    body: JSON.stringify({ message: "", target: "all" }),
  });
  expect(nudgeEmpty.status === 400, "nudge with no message → 400");

  const nudgeNotMine = await fetch(base + "/dashboard/api/cafe/default/nudge", {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie2 },
    body: JSON.stringify({ message: "hi", target: "all" }),
  });
  expect(nudgeNotMine.status === 403, "an owner can't nudge another owner's café");

  // --- Admin console (ADMIN_EMAIL = owner@test.my) ---
  const adminForbidden = await get("/admin/api/overview", { headers: { cookie: cookie2 } });
  expect(adminForbidden.status === 403, "a normal owner can't reach the admin console");

  const adminOk = JSON.parse((await get("/admin/api/overview", { headers: { cookie: cookieNow } })).body);
  expect(adminOk.cafes.length >= 2, "admin sees every café on the platform");
  expect(
    adminOk.cafes.some((c: any) => (c.owners || "").includes("second@cafe.my")),
    "admin sees which owner email is tied to each café",
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

  // --- Owner-level customers + nudge (span ALL of an owner's cards) ---
  const ownerCust = JSON.parse((await get("/dashboard/api/customers?cardId=all&lapsedDays=0", { headers: { cookie: cookieNow } })).body);
  expect(Array.isArray(ownerCust.customers) && ownerCust.customers.length >= 2, "owner customers span all their cards");
  expect(ownerCust.customers.every((c: any) => c.cardId && c.cardName), "each customer row is tagged with its card");
  expect(Array.isArray(ownerCust.cards) && ownerCust.cards.length >= 2, "customers response lists the owner's cards for filtering");
  const filtered = JSON.parse((await get("/dashboard/api/customers?cardId=" + newCafeOut.id + "&lapsedDays=0", { headers: { cookie: cookieNow } })).body);
  expect(filtered.customers.length === 0, "card filter narrows to a single (empty) card");

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

  console.log("\nALL E2E CHECKS PASSED ✅");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
