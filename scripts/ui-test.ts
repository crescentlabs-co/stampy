/**
 * `pnpm test:ui` — the Create → Design → Publish → Manage flow, in a REAL
 * browser, asserting what actually reached the server.
 *
 * Every other suite here drives the page's code directly: it mounts the design
 * panel and calls its functions. That proves the functions work and proves
 * nothing about the SCREEN. Three separate rounds of "fixed" reached the
 * founder still broken, because the thing that was broken was never the
 * function — it was what the button next to it did, or did not do.
 *
 * The bug this was written for: a photograph uploaded as a logo or a banner is
 * too big to store, the save is refused, and "Finish and publish" published
 * anyway — so the owner designed a card and got the default one, and Manage
 * correctly showed them a card with no logo on it.
 *
 * So the pictures here are PHOTOGRAPHS, generated as real noisy PNGs. A flat
 * logo compresses to nothing and slips under every size limit in the app,
 * which is exactly why the existing tests never saw this.
 */
import EmbeddedPostgres from "embedded-postgres";
import { chromium, type Browser, type Page } from "playwright";
import { deflateSync } from "node:zlib";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "stampy-ui-"));
const shots = mkdtempSync(path.join(tmpdir(), "stampy-shots-"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: "s", password: "s", port: 5477, persistent: false,
});
const BASE = "http://localhost:3011";

let failures = 0;
function ok(pass: boolean, what: string): void {
  console.log((pass ? "OK: " : "FAIL: ") + what);
  if (!pass) failures++;
}

/**
 * A PHOTOGRAPH, as a PNG. Noise, not flat colour — the whole point.
 *
 * A logo on a white square compresses to a few kilobytes and sails under any
 * limit; a photo of the same size does not, and that difference is the bug.
 * Written by hand because there is no image library here and no build step to
 * add one — a PNG is a header, one deflated block of scanlines and a footer.
 */
function photo(file: string, w: number, h: number): string {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  let seed = 12345;
  let i = 0;
  for (let y = 0; y < h; y++) {
    raw[i++] = 0; // no per-scanline filter, so nothing helps the compressor
    for (let x = 0; x < w; x++) {
      // A cheap deterministic PRNG. Real photo bytes are not random, but they
      // are not flat either, and random is the honest worst case for PNG.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      raw[i++] = (seed >> 16) & 0xff;
      raw[i++] = (seed >> 8) & 0xff;
      raw[i++] = seed & 0xff;
    }
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const t = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(t));
    return Buffer.concat([len, t, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const at = path.join(shots, file);
  writeFileSync(at, png);
  return at;
}

let CRC: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!CRC) {
    CRC = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Confirm the cropper, which every picture upload now goes through. */
async function useIt(page: Page): Promise<void> {
  await page.waitForTimeout(700);
  const btn = page.locator(".mdl button", { hasText: /^Use it$/ });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(1800);
  }
}

async function main(): Promise<void> {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("stampy");
  process.env.DATABASE_URL = "postgresql://s:s@localhost:5477/stampy";
  process.env.BASE_URL = BASE;
  process.env.PORT = "3011";
  process.env.SESSION_SECRET = "ui-test-secret";
  process.env.ALLOW_PUBLIC_SIGNUP = "1";

  const db = await import("../src/db.js");
  await db.migrate();
  await import("../src/server.js");
  await new Promise((r) => setTimeout(r, 1500));

  await fetch(BASE + "/dashboard/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ui@test.my", password: "password123" }),
  });

  const logo = photo("logo.png", 900, 900);      // a square photo, as a shop would upload
  const banner = photo("banner.png", 1600, 600); // a wide photo for the band

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(e.message));

    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
    await page.fill("input[type=email]", "ui@test.my");
    await page.fill("input[type=password]", "password123");
    await page.locator("button", { hasText: /sign in|log in/i }).first().click();
    await page.waitForTimeout(2500);

    // ---- Create → Rules ----
    await page.goto(BASE + "/dashboard/create/card", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.locator("[data-wnext]").click();
    await page.waitForTimeout(2000);
    const cardId = page.url().split("/create/")[1]!.split("/")[0]!;
    ok(/\/rules$/.test(page.url()), "choosing a card type lands on its rules");

    await page.fill('[data-r="name"]', "Photo card");
    // The average order value. Every money figure the owner reads is built on
    // it, and it used to be taken from the reward's value instead — which is
    // how a shop that priced its free coffee at RM88 was told it had earned
    // RM88 a stamp.
    await page.fill('[data-r="basket"]', "20");
    await page.locator("[data-cont]").click();
    await page.waitForTimeout(400);
    await page.fill('[data-r="rewardName"]', "Free coffee");
    await page.fill('[data-r="value"]', "12");
    await page.locator("[data-wnext]").click();
    await page.waitForTimeout(2500);
    ok(/\/design$/.test(page.url()), "the rules step moves on to design");

    // ---- Design: a PHOTOGRAPH as the logo and the band ----
    await page.setInputFiles("[data-logo]", logo);
    await useIt(page);
    await page.setInputFiles("[data-band]", banner);
    await useIt(page);
    await page.selectOption("[data-stamppick]", "★");
    await page.waitForTimeout(2500);

    // Whatever the owner is looking at is a real picture, not a broken one.
    const shown = (await page.evaluate(`(() => {
      const src = (q) => { const e = document.querySelector(q); return e ? (e.getAttribute("src") || "") : ""; };
      return { apple: src("[data-pv-logo]"), android: src("[data-pvg-logo]"), notify: src("[data-pvn-logo]") };
    })()`)) as Record<string, string>;
    for (const [where, url] of Object.entries(shown)) {
      ok(url.startsWith("data:image/"), `the ${where} preview shows the picture just chosen`);
    }

    // ---- Publish ----
    await page.locator("[data-wnext]").click();
    await page.waitForTimeout(6000);

    const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    // Read the card back from the server. Every claim this file makes about a
    // save ends here: the screen saying it worked is exactly what it said the
    // three times it reached the founder broken.
    const readCard = async (id: string, jar: string) => {
      const ov = (await (await fetch(BASE + "/dashboard/api/overview", { headers: { cookie: jar } })).json()) as {
        cards?: Record<string, unknown>[];
      };
      return (ov.cards ?? []).find((c) => c.id === id) as Record<string, unknown> | undefined;
    };
    const overview = (await (await fetch(BASE + "/dashboard/api/overview", { headers: { cookie } })).json()) as {
      cards?: Record<string, unknown>[];
    };
    const card = (overview.cards ?? []).find((c) => c.id === cardId) as Record<string, unknown> | undefined;
    ok(Boolean(card), "the card is on the shop after publishing");

    // THE POINT OF THIS FILE. What the owner designed is what got stored.
    ok(Boolean(card?.logoVersion), "the logo they uploaded actually reached the server");
    ok(card?.bandTexture === "image", "the banner they uploaded actually reached the server");
    ok(card?.stampStyle === "★", "the stamp shape they picked actually reached the server");
    ok(card?.bg !== "#3b2016", "the card kept its own colours rather than the defaults");
    ok(Number(card?.averageSpend) === 20, "the average order value reached the server");
    // And it is NOT the reward's value, which is what used to set it.
    ok(Number(card?.rewardValue) === 12, "...while the reward keeps its own, different, price");

    // A published card must never be published with a design that failed to
    // save. Either both happened or neither did.
    ok(
      !card?.publishedAt || Boolean(card?.logoVersion),
      "a card is never published with its design missing",
    );

    // ---- Manage shows the same card ----
    await page.goto(BASE + "/dashboard/manage/rewards/" + cardId, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const onManage = (await page.evaluate(`(() => {
      const img = document.querySelector("[data-pv-logo]");
      return { logo: img ? (img.getAttribute("src") || "") : "",
               visible: img ? getComputedStyle(img).display !== "none" : false };
    })()`)) as { logo: string; visible: boolean };
    ok(onManage.visible && onManage.logo !== "", "Manage shows the logo the card was designed with");
    const logoFetch = await fetch(BASE + onManage.logo.replace(BASE, ""), { headers: { cookie } });
    ok(logoFetch.status === 200, "...and that picture actually loads rather than 404ing");

    // ---- The Edit screen: two sections, and no way to change the card's type ----
    //
    // Every other suite drives this page's FUNCTIONS. This one is the only
    // place the screen itself is real, which is why the check that the type
    // dropdown is gone lives here: it is still in the DOM, because the panel
    // reads it to draw its own preview and to render the stamp grids, and
    // "gone" therefore means "cannot be seen or used", which only a browser
    // can answer.
    const edit = (await page.evaluate(`(() => {
      const sums = [...document.querySelectorAll("details.grp > summary")]
        .map((s) => s.textContent || "");
      const kind = document.querySelector('[data-f="kind"]');
      const danger = document.querySelector(".dzone");
      const head = document.querySelector(".ehead");
      return {
        folds: sums,
        kindVisible: kind ? Boolean(kind.offsetParent) : false,
        kindPresent: Boolean(kind),
        danger: danger ? (danger.textContent || "") : "",
        locked: Boolean(document.querySelector(".locknote")),
        head: head ? (head.textContent || "") : "",
        // Every control on the page that could save something.
        saves: [...document.querySelectorAll("[data-savecard], [data-a=save], [data-saverules]")]
          .filter((el) => el.offsetParent !== null).length,
        sharing: Boolean(document.querySelector(".sharelist, .qrbox")),
      };
    })()`)) as {
      folds: string[]; kindVisible: boolean; kindPresent: boolean; danger: string;
      locked: boolean; head: string; saves: number; sharing: boolean;
    };
    ok(edit.folds.some((s) => s.startsWith("Setup")), "Edit offers a Setup section");
    ok(edit.folds.some((s) => s.startsWith("Design")), "Edit offers a Design section");
    ok(edit.folds.length === 2, "...and no third section — the card's type cannot change");
    ok(edit.kindPresent && !edit.kindVisible,
      "the Card type dropdown is in the DOM for the preview and shown to nobody");
    ok(/Edit card/.test(edit.head), "the title says what the screen is");
    ok(/Active/.test(edit.head), "...with the card's state beside it, not on a bar of its own");
    ok(!edit.locked, "a card nobody has joined is not locked");
    // ONE save, for both sections. Two made the owner sort their own change
    // into the right half before they could keep it.
    ok(edit.saves === 1, "there is exactly one save on the screen, not one per section");
    ok(!edit.sharing, "sharing is not duplicated here — it is on the carousel's Share button");
    ok(/Delete this program/.test(edit.danger),
      "the Danger zone offers a real delete on a card nobody holds");
    ok(/End sign-ups/.test(edit.danger), "...and ending it, which is the other way out");

    // ---- Change a RULE and the DESIGN, press one button, read the server ----
    //
    // THE TRAP THIS GUARDS, and it is not cosmetic. The design half renders the
    // stamp-grid pictures from the panel's OWN copy of the stamps target, and
    // it replaces the whole set for the card at once. So if one button saves a
    // target change and then saves the design, a panel still holding the old
    // number writes grids for the OLD target over everything — and the new one
    // is left with no picture at all, which is a 404 where the stamps go on
    // every card already in a wallet.
    //
    // Moving the target from 10 to 7 is what makes that visible: the check at
    // the end asks the server for the grid at the NEW number.
    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll("details.grp")) el.open = true;
    })()`);
    await page.waitForTimeout(400);
    // The form is an accordion and opens on the EARNING half, so the reward
    // boxes are not rendered yet. Same two-part form the wizard uses.
    await page.selectOption('[data-r="target"]', "7");
    await page.waitForTimeout(300);
    await page.locator('[data-open="reward"]').click();
    await page.waitForTimeout(500);
    await page.fill('[data-r="rewardName"]', "Free croissant");
    // And a design change in the same breath, so the one button carries both.
    await page.evaluate(`(() => {
      const el = document.querySelector('[data-f="bg"]');
      if (!el) return;
      el.value = "#123456";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await page.waitForTimeout(400);

    await page.locator("[data-savecard]").click();
    await page.waitForTimeout(900);
    const confirm = page.locator("[data-yes]");
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(9000);

    const saved = await readCard(cardId, cookie);
    ok(/croissant/i.test(String(saved?.reward ?? "")),
      "one press saves the rules half");
    ok(Number(saved?.stampsTarget) === 7, "...including the new stamps target");
    ok(String(saved?.bg ?? "").toLowerCase() === "#123456",
      "...and the design half, in the same press");
    ok(Boolean(saved?.logoVersion), "...while the artwork survives both");
    // THE ONE THAT MATTERS. A grid for the target the card now has.
    // No target in the URL by design: serveStampStrip reads the card's CURRENT
    // stamps_target and looks the strip up under it. So this 200 is precisely
    // the claim "a grid was written for the number the card now has".
    const grid = await fetch(BASE + "/c/" + cardId + "/art/stamps/0.png", { headers: { cookie } });
    ok(grid.status === 200,
      "...and the stamp grid exists for the NEW target, not the one the panel was built with");

    // ---- And now somebody joins, which settles the rules for good ----
    //
    // The e2e suite proves the SERVER refuses to move them. This proves the
    // screen an owner actually looks at says so, and stops offering a save it
    // could not honour. A real pass with a real stamp, because that is what
    // ACTIVE_PASS_SQL asks for and cardCounts is what the lock reads.
    const merchant = await db.merchantForOwner(
      (await db.getOwnerByEmail("ui@test.my"))!.id);
    const joinCustomer = await db.createCustomer(merchant!.id);
    const joinPass = await db.createPass({
      serial: crypto.randomUUID(), cardId, customerId: joinCustomer.id, platform: "apple",
      shortCode: db.generateShortCode(), authToken: "t".repeat(24),
      stampCount: 1, stampsTarget: 10, reward: "Free croissant",
    });
    await db.logEvent(cardId, joinPass.serial, "stamp", { merchantId: merchant!.id });

    await page.goto(BASE + "/dashboard/manage/rewards/" + cardId, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll("details.grp")) el.open = true;
    })()`);
    await page.waitForTimeout(400);
    const shut = (await page.evaluate(`(() => {
      const note = document.querySelector(".locknote");
      const danger = document.querySelector(".dzone");
      const sums = [...document.querySelectorAll("details.grp > summary")]
        .map((s) => s.textContent || "");
      return {
        note: note ? (note.textContent || "") : "",
        // NOT "is the field disabled" — there is no field. A greyed-out form is
        // still a form, and a screen full of controls that cannot be used
        // invites an owner to keep trying them.
        fields: [...document.querySelectorAll("[data-r]")]
          .map((el) => el.getAttribute("data-r")),
        folds: document.querySelectorAll("[data-open]").length,
        summaries: sums,
        saves: [...document.querySelectorAll("[data-savecard], [data-a=save], [data-saverules]")]
          .filter((el) => el.offsetParent !== null).length,
        designPanel: Boolean(document.querySelector('[data-f="bg"]')),
        danger: danger ? (danger.textContent || "") : "",
      };
    })()`)) as {
      note: string; fields: string[]; folds: number; summaries: string[];
      saves: number; designPanel: boolean; danger: string;
    };
    ok(/rules are locked/.test(shut.note), "once somebody joins, Setup says so");
    // EXACTLY one field, and it is not a rule. The average order value is a
    // fact about the shop's till, and every money figure on Home is built on
    // it — lock that away and a shop that mistyped it reads a wrong revenue
    // number for the life of the programme. Everything that IS a promise to a
    // customer is gone, not greyed out.
    ok(shut.fields.join(",") === "basket",
      "...shows the average order value and nothing else (got: " + shut.fields.join(",") + ")");
    ok(shut.folds === 0, "...nor the earn/reward accordion inside it");
    ok(shut.summaries.some((s) => s.startsWith("Setup")), "...the section is still there to read");
    ok(shut.designPanel, "...and Design is untouched, which is the point of keeping it");
    ok(shut.saves === 1, "...with the same single save, which now only has Design to carry");
    ok(/Remove from my dashboard/.test(shut.danger),
      "...and the Danger zone stops offering a delete once a card is out there");
    ok(!/Delete this program/.test(shut.danger), "...it really is gone, not just reworded");

    // ---- Home's programme chart keeps up without a log out ----
    //
    // It was drawn ONCE while the screen was being built, off the cards loaded
    // at sign-in, and nothing ever drew it again — so a stamp taken since only
    // appeared after logging out and back in, beside tiles that refetch every
    // time. This walks the way an owner does: look, get stamped, come back.
    await page.evaluate(`document.querySelector('[data-nav="/"]').click()`);
    await page.waitForTimeout(3500);
    const chartVal = () => page.evaluate(`(() => {
      const v = document.querySelector("[data-programs] .vval");
      return v ? v.textContent : "(none)";
    })()`);
    const before = await chartVal();
    // A stamp at the counter, while the dashboard is open.
    await db.logEvent(cardId, joinPass.serial, "stamp", { merchantId: merchant!.id });
    await page.evaluate(`document.querySelector('[data-nav="/customers"]').click()`);
    await page.waitForTimeout(1200);
    await page.evaluate(`document.querySelector('[data-nav="/"]').click()`);
    await page.waitForTimeout(3500);
    const after = await chartVal();
    ok(Number(after) === Number(before) + 1,
      "the programme chart catches up without a log out (" + before + " then " + after + ")");
    // And it is labelled the way the rest of the product labels it.
    const metricName = await page.evaluate(`(() => {
      const m = document.querySelector("[data-programs] .cmpmetric span");
      return m ? m.textContent : "";
    })()`);
    ok(metricName === "Visits", "...under the same word the tiles use (got: " + metricName + ")");

    // ---- THE COUNTER, on a second phone ----
    //
    // The scanner is the one screen used by somebody who is not the owner, in a
    // hurry, with a customer waiting — and finishing an action used to replace
    // the buttons with "Next customer". So the tenth stamp filled the card and
    // then hid the Give reward button the very same reply had just earned, and
    // a second stamp for a second coffee meant searching the customer out
    // again. Both cost a whole round trip at the till. Neither is visible to a
    // test that calls the page's functions: they were the SHEET.
    await db.setStaffPin((await db.getOwnerByEmail("ui@test.my"))!.id, "1234");
    await db.getPool().query(
      "UPDATE passes SET stamp_count = 8, stamps_target = 10 WHERE serial = $1", [joinPass.serial]);
    const till = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const tillCrashes: string[] = [];
    till.on("pageerror", (e) => tillCrashes.push(e.message));
    await till.goto(BASE + "/staff?c=" + cardId, { waitUntil: "networkidle" });
    await till.fill("#pin", "1234");
    await till.locator("#go").click();
    await till.waitForTimeout(2500);
    // Found by the typed code, which is the fallback when a camera will not read.
    await till.fill("#search", joinPass.short_code);
    await till.press("#search", "Enter");
    await till.waitForTimeout(1500);
    await till.locator(".search-hit").first().click();
    await till.waitForTimeout(1500);
    const sheet = () => till.evaluate(`(() => ({
      buttons: [...document.querySelectorAll("#actionBody .btn")].map((b) => (b.textContent || "").trim()),
      progress: (document.querySelector("#actionBody .progress-card strong") || {}).textContent || "",
    }))()`) as Promise<{ buttons: string[]; progress: string }>;

    const opened = await sheet();
    ok(/8 of 10/.test(opened.progress), "the counter opens the customer at their real progress");
    ok(opened.buttons.some((b) => /Add 1 stamp/.test(b)), "...and offers the stamp");

    // A stamp taken soon after the last one asks first — staff confirm it is a
    // second purchase and not a double tap. That popup is the app's own, never
    // the browser's, so it can be answered here the way a thumb answers it.
    const addStamp = async () => {
      await till.locator('#actionBody [data-act="stamp"]').click();
      await till.waitForTimeout(1200);
      const again = till.locator(".mdl button", { hasText: /^Continue$/ });
      if (await again.count()) { await again.first().click(); }
      await till.waitForTimeout(1800);
    };

    await addStamp();
    const stamped = await sheet();
    ok(/9 of 10/.test(stamped.progress), "a stamp lands");
    // THE SECOND COMPLAINT: keep going without searching the customer out again.
    ok(stamped.buttons.some((b) => /Add 1 stamp/.test(b)),
      "...and the stamp button is still there for the next one");

    await addStamp();
    const full = await sheet();
    ok(/10 of 10/.test(full.progress), "the tenth stamp fills the card");
    // THE FIRST COMPLAINT: the reward is offered there and then.
    ok((await till.locator('#actionBody [data-act="redeem"]').count()) > 0,
      "...and Give reward is offered without scanning the card again");
    ok(!full.buttons.some((b) => /Add 1 stamp/.test(b)),
      "...while a full card takes no more stamps");

    await till.locator('#actionBody [data-act="redeem"]').click();
    await till.waitForTimeout(2000);
    const done = await sheet();
    // 0 of SEVEN, not of ten, and that is the whole point of redeemPass: the
    // pass was issued at a target of 10 and this walk lowered the card to 7
    // earlier on, so the customer restarts on TODAY'S rules. It is the one
    // moment a rules change reaches somebody already holding a card, and it
    // happening here proves the counter reads the card and not a stale pass.
    ok(/0 of 7/.test(done.progress),
      "handing the reward over restarts the card on today's rules, in the same sheet"
        + " (got: " + done.progress + ")");
    ok(done.buttons.some((b) => /Add 1 stamp/.test(b)), "...ready to start again");
    ok(tillCrashes.length === 0,
      "nothing threw on the counter" + (tillCrashes[0] ? ": " + tillCrashes[0] : ""));

    // ---- the customer's page carries the design ----
    const signup = await fetch(BASE + "/c/" + cardId);
    ok(signup.status === 200, "the customer's sign-up page opens");
    ok((await fetch(BASE + "/c/" + cardId + "/poster")).status === 200, "the printable poster opens");

    ok(crashes.length === 0, "nothing threw in the browser" + (crashes[0] ? ": " + crashes[0] : ""));
  } finally {
    if (browser) await browser.close();
    // Close the pool BEFORE stopping Postgres. Pulling the database out from
    // under a live pool makes node-postgres emit an unhandled 'error', which
    // takes the process down before the summary prints — so a run where every
    // assertion passed still exited 1 and reported as a failure.
    await db.getPool().end().catch(() => {});
    await pg.stop();
  }

  console.log(failures ? `\nUI WALKTHROUGH FAILED (${failures})` : "\nUI WALKTHROUGH OK ✅");
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
