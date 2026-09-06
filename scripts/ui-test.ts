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

    // ---- The Edit screen: two folds, and no way to change the card's type ----
    //
    // Every other suite drives this page's FUNCTIONS. This one is the only
    // place the screen itself is real, which is why the check that the type
    // dropdown is gone lives here: it is still in the DOM, because the panel
    // reads it to draw its own preview, and "gone" therefore means "cannot be
    // seen or used", which only a browser can answer.
    const edit = (await page.evaluate(`(() => {
      const sums = [...document.querySelectorAll("details.grp > summary")]
        .map((s) => s.textContent || "");
      const kind = document.querySelector('[data-f="kind"]');
      const danger = document.querySelector(".dzone");
      return {
        folds: sums,
        kindVisible: kind ? Boolean(kind.offsetParent) : false,
        kindPresent: Boolean(kind),
        danger: danger ? (danger.textContent || "") : "",
        locked: Boolean(document.querySelector(".locknote")),
        rulesSave: Boolean(document.querySelector("[data-saverules]")),
      };
    })()`)) as {
      folds: string[]; kindVisible: boolean; kindPresent: boolean;
      danger: string; locked: boolean; rulesSave: boolean;
    };
    ok(edit.folds.some((s) => s.startsWith("Rules")), "Edit offers a Rules section");
    ok(edit.folds.some((s) => s.startsWith("Design")), "Edit offers a Design section");
    ok(edit.folds.length === 2, "...and no third section — the card's type cannot change");
    ok(edit.kindPresent && !edit.kindVisible,
      "the Card type dropdown is in the DOM for the preview and shown to nobody");
    ok(!edit.locked, "a card nobody has joined is not locked");
    ok(edit.rulesSave, "...so its rules can be saved");
    ok(/Delete this program/.test(edit.danger),
      "the Danger zone offers a real delete on a card nobody holds");
    ok(/End sign-ups/.test(edit.danger), "...and ending it, which is the other way out");

    // ---- Save a rule, then save the design, and check neither undid the other ----
    //
    // THE TRAP THIS GUARDS. The design panel holds its own hidden copy of the
    // rules so it can draw the card it is designing, seeded when it mounted.
    // Save a rule and then save the design, and that stale copy goes back over
    // the change — the owner watches their edit save and then vanish.
    // Force it open rather than toggling: Rules is already open on arrival for
    // a card nobody has joined, so a click here would SHUT it.
    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll("details.grp")) el.open = true;
    })()`);
    await page.waitForTimeout(400);
    // The form is an accordion and it opens on the EARNING half, so the reward
    // boxes are not rendered yet. This is the same two-part form the wizard
    // uses, which is the whole point of the change.
    await page.locator('[data-open="reward"]').click();
    await page.waitForTimeout(500);
    await page.fill('[data-r="rewardName"]', "Free croissant");
    await page.locator("[data-saverules]").click();
    await page.waitForTimeout(3000);

    const afterRules = await readCard(cardId, cookie);
    ok(/croissant/i.test(String(afterRules?.reward ?? "")),
      "a rules change made on the Edit screen reaches the server");

    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll("details.grp")) el.open = true;
    })()`);
    await page.waitForTimeout(600);
    await page.evaluate(`(() => {
      const el = document.querySelector('[data-f="bg"]');
      if (!el) return;
      el.value = "#123456";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await page.waitForTimeout(500);
    await page.locator('[data-a="save"]').click();
    await page.waitForTimeout(700);
    const confirm = page.locator("[data-yes]");
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(4000);

    const afterDesign = await readCard(cardId, cookie);
    ok(/croissant/i.test(String(afterDesign?.reward ?? "")),
      "...and saving the DESIGN afterwards does not write the old rules back over it");
    ok(Boolean(afterDesign?.logoVersion),
      "...while the artwork is still there after both saves");

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
