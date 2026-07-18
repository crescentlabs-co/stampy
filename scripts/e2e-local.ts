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

  const { migrate, createPass, generateShortCode, getCafe, logEvent } = await import(
    "../src/db.js"
  );
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

  // Dashboard bootstrap: state → signup → overview
  const state1 = JSON.parse((await get("/dashboard/api/state")).body);
  expect(state1.needsSignup === true, "state: needs signup on fresh DB");

  const signup = await fetch(base + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@test.my", password: "password123" }),
  });
  const cookie = signup.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(signup.status === 200 && cookie.startsWith("stampy_session="), "signup sets session cookie");

  const signup2 = await fetch(base + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "intruder@evil.com", password: "password123" }),
  });
  expect(signup2.status === 403, "second signup is closed");

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
  const mk = async () =>
    createPass({
      serial: crypto.randomUUID(),
      cafeId: "default",
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

  // Fill to target and redeem
  for (let i = 0; i < 10; i++) {
    await fetch(base + "/staff/api/stamp", {
      method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p1.serial }),
    });
  }
  const listFull = JSON.parse((await get("/staff/api/passes", { headers: staffHeaders })).body);
  const full = listFull.passes.find((p: any) => p.serial === p1.serial);
  expect(full.stamps === 8 && full.rewardReady === true, "stamps clamp at target (8) and rewardReady");

  const redeem = await fetch(base + "/staff/api/redeem", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p1.serial }),
  });
  expect(JSON.parse(await redeem.text()).pass.stamps === 0, "redeem resets to 0");

  // Nudge
  const nudge = await fetch(base + "/staff/api/message", {
    method: "POST", headers: staffHeaders, body: JSON.stringify({ serial: p2.serial, message: "We miss you!" }),
  });
  expect(nudge.status === 200, "nudge accepted");

  // Metrics reflect the events
  const overview2 = JSON.parse((await get("/dashboard/api/overview", { headers: { cookie } })).body);
  const m = overview2.cafes[0].metrics;
  expect(m.cards === 2, `metrics: 2 cards (got ${m.cards})`);
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

  console.log("\nALL E2E CHECKS PASSED ✅");
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
