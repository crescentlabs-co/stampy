/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 */
import type { SetupStatus } from "./config.js";
import type { CafeRow } from "./db.js";
import { DEFAULT_CAFE_ID } from "./db.js";

const baseCss = /* css */ `
  /* Font face is declared INLINE (not a separate cacheable stylesheet) so a
     content change is never served stale behind an immutable cache. The woff2
     has a unique filename, so it caches safely. */
  @font-face {
    font-family: "Space Grotesk";
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url("/assets/fonts/space-grotesk-latin.woff2") format("woff2");
  }
  :root {
    /* Stone & Sage: cool light neutral + muted sage accent, paired with Space Grotesk. */
    --bg: #f0f1ed; --surface: #ffffff; --ink: #20211d; --ink2: #2f312b;
    --muted: #888d83; --line: #e3e5df; --field-border: #cdd0c8; --ghost-bg: #e7e9e3;
    --accent: #6f8567; --accent-dark: #5c7156;
    --r: 16px; --r-lg: 22px;
    --shadow: 0 10px 30px -14px rgba(32,33,29,.20), 0 2px 6px rgba(32,33,29,.07);
    --display: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --body: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: var(--body); line-height: 1.5;
    background: var(--bg); color: var(--ink); min-height: 100vh;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    display: flex; flex-direction: column; align-items: center;
    padding: 28px 16px 56px;
  }
  .card {
    background: var(--surface); border-radius: var(--r-lg); padding: 28px 26px;
    box-shadow: var(--shadow); width: 100%; max-width: 440px;
  }
  h1 { font-family: var(--display); font-weight: 700; font-size: 1.7rem; letter-spacing: -.015em; margin-bottom: 10px; text-wrap: balance; }
  h2 { font-family: var(--display); font-weight: 700; font-size: 1.15rem; letter-spacing: -.01em; margin: 24px 0 8px; }
  p.sub { color: var(--muted); margin-bottom: 22px; }
  .btn {
    display: block; width: 100%; text-align: center; padding: 15px 20px;
    border-radius: 14px; border: none; font-size: 1.02rem; font-weight: 600;
    cursor: pointer; text-decoration: none;
  }
  .btn-dark { background: var(--ink); color: #fff; }
  .btn-stamp { background: var(--ink); color: #fff; }
  .btn-ghost { background: var(--ghost-bg); color: var(--ink); }
  .btn { transition: transform .09s ease, filter .15s ease; }
  .btn:active { transform: scale(.985); }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:active { transform: none; } }
  .muted { color: var(--muted); font-size: .85rem; }
  input, textarea, select {
    width: 100%; padding: 13px 14px; border: 1px solid var(--field-border); border-radius: 12px;
    font-size: 1rem; font-family: inherit; background: var(--surface); color: var(--ink);
  }
  input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
  label { font-size: .8rem; color: var(--muted); display: block; margin: 14px 0 6px; }
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--ink); color: #fff; padding: 12px 20px; border-radius: 999px;
    font-size: .9rem; opacity: 0; transition: opacity .25s; pointer-events: none;
    max-width: 90vw; text-align: center; z-index: 50;
  }
  .toast.show { opacity: 1; }
`;

function page(title: string, body: string, extraCss = "", script = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${baseCss}${extraCss}</style>
</head>
<body>${body}${script ? `<script>${script}</script>` : ""}</body>
</html>`;
}

// ------------------------------------------------------------- customer ----

export function landingPage(
  cafe: CafeRow,
  appleReady: boolean,
  googleReady: boolean,
  cafeId: string,
): string {
  const base = cafeId === DEFAULT_CAFE_ID ? "" : `/c/${cafeId}`;
  const buttons = [
    appleReady
      ? `<a class="btn btn-dark wbtn" data-w="apple" href="${base}/enroll">&#63743; Add to Apple Wallet</a>`
      : "",
    googleReady
      ? `<a class="btn btn-dark wbtn" data-w="google" style="margin-top:10px" href="${base}/enroll/google">Add to Google Wallet</a>`
      : "",
  ].join("");
  // Lead with the wallet native to the phone (the other stays as a fallback),
  // so scanning the QR lands the customer near-directly on the right Add sheet.
  const script = /* js */ `
    (function () {
      var ua = navigator.userAgent || "";
      var prefer = /iPhone|iPad|iPod/.test(ua) ? "apple" : /Android/.test(ua) ? "google" : "";
      var btns = Array.prototype.slice.call(document.querySelectorAll(".wbtn"));
      if (!prefer || btns.length < 2) return;
      btns.sort(function (a, b) { return (b.dataset.w === prefer) - (a.dataset.w === prefer); });
      btns.forEach(function (b, i) {
        b.classList.toggle("btn-dark", i === 0);
        b.classList.toggle("btn-ghost", i !== 0);
        b.style.marginTop = i === 0 ? "0" : "10px";
        b.parentNode.appendChild(b);
      });
    })();
  `;
  return page(
    `${cafe.name} — Loyalty Card`,
    `<div class="card" style="text-align:center">
      <div style="font-size:3rem; margin-bottom:8px">☕️</div>
      <h1>${cafe.name}</h1>
      <p class="sub">Collect ${cafe.stamps_target} stamps, get a ${cafe.reward.toLowerCase()}.<br>
      Your card lives in your phone’s wallet — no app needed.</p>
      ${
        buttons
          ? `<div id="wallets">${buttons}</div>
             <p class="muted" style="margin-top:14px">You start with a few free stamps as a welcome gift 🎁</p>`
          : `<p class="sub"><strong>Almost ready!</strong> Cards can’t be issued yet — the café is still being set up.</p>`
      }
    </div>`,
    "",
    buttons ? script : "",
  );
}

export function notReadyPage(): string {
  return page(
    "Not ready yet",
    `<div class="card" style="text-align:center">
      <h1>Hang tight ☕️</h1>
      <p class="sub">This card isn’t ready to issue yet. Apple certificates are still being set up — check <a href="/setup">/setup</a>.</p>
    </div>`,
  );
}

// ---------------------------------------------------------------- staff ----

export function staffPage(): string {
  const css = /* css */ `
    .pass { border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-top: 12px; }
    .pass .dots { font-size: 1.15rem; letter-spacing: 2px; margin: 6px 0; }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    .row .btn { padding: 10px 12px; font-size: .95rem; }
    .ready { color: #1a7f37; font-weight: 700; }
    #scanner {
      position: fixed; inset: 0; background: #000; z-index: 40;
      display: none; flex-direction: column;
    }
    #scanner.on { display: flex; }
    #scanner video { flex: 1; object-fit: cover; width: 100%; }
    #scanner .bar { padding: 14px; }
    .codebox { display: flex; gap: 8px; margin-top: 8px; }
    .codebox input { text-transform: uppercase; letter-spacing: 3px; font-weight: 700; text-align: center; }
    .codebox .btn { width: auto; padding: 12px 18px; }
  `;
  const js = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    const cafeId = new URLSearchParams(location.search).get("c") || "default";
    let pin = localStorage.getItem("staffPin:" + cafeId) || "";

    async function api(path, opts = {}) {
      const res = await fetch("/staff/api" + path, {
        ...opts,
        headers: { "Content-Type": "application/json", "x-staff-pin": pin,
                   "x-cafe-id": cafeId, ...(opts.headers||{}) },
      });
      if (res.status === 401) { localStorage.removeItem("staffPin:" + cafeId); pin = ""; render(); throw new Error("pin"); }
      return res.json();
    }

    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }

    let busy = false; // debounce: one tap/scan = one stamp
    async function act(path, body, doneMsg) {
      if (busy) return; busy = true;
      try {
        let out = await api(path, { method: "POST", body: JSON.stringify(body) });
        // Anti-spam: same card stamped moments ago. Let staff override for a
        // genuine repeat order, otherwise stop the double-stamp.
        if (out.error === "too-soon") {
          if (!confirm("This card was just stamped " + out.secondsLeft + "s ago. Add another stamp?")) return;
          out = await api(path, { method: "POST", body: JSON.stringify({ ...body, force: true }) });
        }
        if (out.error) toast("Error: " + out.error);
        else toast(doneMsg + (out.push.registeredDevices === 0
          ? " (card not opened on a phone yet — no push)"
          : out.push.sent > 0 ? " — pushed to phone ✓" : " — push failed ✗"));
        await load();
        return out;
      } finally { busy = false; }
    }

    // ------------------------------------------------------------ scanner ----
    // Primary: native BarcodeDetector. Fallback: jsQR over canvas frames
    // (iPhone Safari has no BarcodeDetector). Final fallback: typed card code.
    let stream = null, scanTimer = null, lastScan = "";
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    async function onScanResult(text) {
      if (!text || busy) return;
      if (text === lastScan) return; // same card still in front of the camera
      lastScan = text;
      stopScanner();
      const value = text.trim();
      if (uuidRe.test(value)) await act("/stamp", { serial: value }, "Stamp added");
      else await act("/stamp-by-code", { code: value.replace(/^Code /i, "") }, "Stamp added");
    }

    async function startScanner() {
      lastScan = "";
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, audio: false,
        });
      } catch { toast("Camera not available — type the card code instead"); return; }
      $("#scanner").classList.add("on");
      const video = $("#scanner video");
      video.srcObject = stream;
      await video.play();

      if ("BarcodeDetector" in window) {
        const det = new BarcodeDetector({ formats: ["qr_code"] });
        scanTimer = setInterval(async () => {
          try {
            const codes = await det.detect(video);
            if (codes.length) onScanResult(codes[0].rawValue);
          } catch {}
        }, 250);
      } else if (window.jsQR) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        scanTimer = setInterval(() => {
          if (!video.videoWidth) return;
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height);
          if (hit && hit.data) onScanResult(hit.data);
        }, 300);
      } else {
        stopScanner();
        toast("Scanning not supported on this phone — type the card code instead");
      }
    }

    function stopScanner() {
      clearInterval(scanTimer); scanTimer = null;
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      $("#scanner").classList.remove("on");
    }

    // --------------------------------------------------------------- views ----
    let allPasses = [];
    async function load() {
      const out = await api("/passes");
      allPasses = out.passes;
      renderList();
    }
    function renderList() {
      const list = $("#list"); if (!list) return;
      const q = ($("#search")?.value || "").trim().toUpperCase();
      const rows = q ? allPasses.filter((p) => p.code.toUpperCase().includes(q)) : allPasses;
      list.innerHTML = "";
      if (!allPasses.length) {
        list.innerHTML = '<p class="muted" style="margin-top:16px">No cards yet — a customer scans the Add-to-Wallet QR to create the first one.</p>';
        return;
      }
      if (!rows.length) { list.innerHTML = '<p class="muted" style="margin-top:16px">No card matches that code.</p>'; return; }
      for (const p of rows) {
        const div = document.createElement("div");
        div.className = "pass";
        div.innerHTML = \`
          <strong>\${p.code}</strong>
          \${p.rewardReady ? '<span class="ready"> — REWARD READY 🎉</span>' : ""}
          <div class="dots">\${p.dots} <span class="muted">\${p.stamps}/\${p.target}</span></div>
          <div class="row">
            <button class="btn btn-stamp" data-a="stamp">+1 Stamp</button>
            \${p.rewardReady ? '<button class="btn btn-ghost" data-a="redeem">Redeem & reset</button>' : ""}
          </div>\`;
        div.querySelector('[data-a=stamp]').onclick = () => act("/stamp", { serial: p.serial }, "Stamp added");
        const r = div.querySelector('[data-a=redeem]');
        if (r) r.onclick = () => confirm("Give the reward and reset this card to 0?") &&
          act("/redeem", { serial: p.serial }, "Redeemed & reset");
        list.appendChild(div);
      }
    }

    function render() {
      if (!pin) {
        $("#app").innerHTML = \`
          <h1>Staff login</h1>
          <p class="sub">Enter the staff PIN.</p>
          <input id="pin" type="password" inputmode="numeric" placeholder="PIN">
          <button class="btn btn-dark" style="margin-top:12px" id="go">Enter</button>\`;
        $("#go").onclick = async () => {
          pin = $("#pin").value.trim();
          try { await api("/passes"); localStorage.setItem("staffPin:" + cafeId, pin); render(); }
          catch { toast("Wrong PIN"); }
        };
      } else {
        $("#app").innerHTML = \`
          <h1>Stamper</h1>
          <p class="sub">Scan the customer’s card, or type its code.</p>
          <button class="btn btn-stamp" id="scan">📷 Scan card</button>
          <div class="codebox">
            <input id="code" placeholder="CARD CODE" maxlength="8" autocomplete="off">
            <button class="btn btn-ghost" id="bycode">Stamp</button>
          </div>
          <h2>Cards</h2>
          <input id="search" placeholder="🔍 Search by card code" autocomplete="off" style="text-transform:uppercase">
          <div id="list" style="margin-top:10px"></div>\`;
        $("#scan").onclick = startScanner;
        $("#bycode").onclick = () => {
          const code = $("#code").value.trim();
          if (!code) return toast("Type the code shown on the customer’s card");
          act("/stamp-by-code", { code }, "Stamp added").then(() => { $("#code").value = ""; });
        };
        $("#search").oninput = renderList;
        load();
        clearInterval(window.__poll); window.__poll = setInterval(load, 10000);
      }
    }
    render();
  `;
  // jsQR loads first (camera fallback for browsers without BarcodeDetector,
  // e.g. iPhone Safari); it's served locally from /staff/jsqr.js — no CDN.
  return page(
    "Stampy — Staff",
    `<div class="card" id="app"></div>
     <div id="scanner"><video playsinline muted></video>
       <div class="bar"><button class="btn btn-ghost" onclick="stopScanner()">Cancel</button></div>
     </div>
     <div class="toast"></div>
     <script src="/staff/jsqr.js"></script>
     <script>${js}</script>`,
    css,
  );
}

// ------------------------------------------------------------ dashboard ----

export function dashboardPage(): string {
  const css = /* css */ `
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 0; }
    .metric { background: var(--surface); border-radius: var(--r); padding: 16px 16px 13px;
              box-shadow: var(--shadow); text-align: left; }
    .metric b { font-family: var(--display); font-weight: 700; font-size: 1.9rem; line-height: 1;
                display: block; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); }
    .metric span { display: block; margin-top: 6px; font-size: .68rem; text-transform: uppercase;
                   letter-spacing: .05em; color: var(--muted); }
    .cafe { border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-top: 14px; }
    .links { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; font-size: .9rem; }
    .row2 { display: flex; gap: 8px; }
    .row2 > div { flex: 1; }
    /* --- live wallet-card preview --- */
    .pv { border-radius: 14px; padding: 16px; margin: 10px 0 4px; box-shadow: 0 4px 16px rgba(43,29,21,.18); }
    .pv-top { display: flex; align-items: center; gap: 10px; }
    .pv-logo { width: 34px; height: 34px; border-radius: 8px; object-fit: contain; background: rgba(255,255,255,.14); }
    .pv-name { font-weight: 700; font-size: 1.02rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-hdr { text-align: right; }
    .pv-lbl { font-size: .62rem; letter-spacing: .08em; font-weight: 600; }
    .pv-progress { font-size: 1.05rem; font-weight: 700; }
    .pv-dots { font-size: 1.25rem; letter-spacing: 3px; margin: 2px 0 10px; }
    .pv-reward { font-size: .95rem; font-weight: 600; }
    .pv-qr { background: #fff; color: #1d1d1f; width: 74px; height: 74px; border-radius: 8px;
             margin: 14px auto 2px; display: flex; align-items: center; justify-content: center;
             font-weight: 700; font-size: .8rem; letter-spacing: 1px; }
    .pv-note { text-align: center; font-size: .72rem; margin-top: 6px; opacity: .75; }
    /* --- designer controls --- */
    .colors { display: flex; gap: 8px; margin-top: 4px; }
    .colors > label { flex: 1; margin: 0; }
    .colors input[type=color] { width: 100%; height: 38px; padding: 2px; border: 1px solid var(--field-border);
                                border-radius: 10px; background: #fff; cursor: pointer; }
    .logorow { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .logorow input[type=file] { display: none; }
    .logorow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    .copyrow { display: flex; gap: 8px; margin-top: 4px; }
    .copyrow input { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; background: var(--ghost-bg); }
    .copyrow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    .account { border-top: 1px solid var(--line); margin-top: 30px; padding-top: 20px; }
    .card { max-width: 480px; }
    /* --- card dropdown selector --- */
    .cardselect { display: flex; gap: 8px; align-items: center; margin: 10px 0 6px; }
    .cardselect select { flex: 1; padding: 11px 12px; border: 1px solid var(--field-border); border-radius: 10px;
                         font: inherit; font-weight: 600; background: var(--surface); color: var(--ink); }
    .cardselect .btn { width: auto; padding: 11px 14px; font-size: .9rem; white-space: nowrap; }
    /* --- sliding segmented control (tabs + toggles) --- */
    .seg { position: relative; display: flex; background: var(--ghost-bg); border-radius: 999px; padding: 5px; gap: 2px; }
    .seg button { position: relative; z-index: 1; flex: 1; border: none; background: none; font: inherit;
                  font-weight: 600; font-size: .9rem; color: var(--muted); padding: 10px 12px; cursor: pointer;
                  border-radius: 999px; white-space: nowrap; transition: color .2s; }
    .seg button.on { color: var(--accent-dark); }
    .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .seg .thumb { position: absolute; z-index: 0; top: 5px; bottom: 5px; left: 0; width: 0; background: var(--surface);
                  border-radius: 999px; box-shadow: 0 2px 6px rgba(32,33,29,.14);
                  transition: transform .28s cubic-bezier(.34,1.1,.4,1), width .28s cubic-bezier(.34,1.1,.4,1); }
    #tabs { margin: 18px 0 24px; }
    .segwrap { margin: 8px 0 4px; }
    .segwrap .lbl { font-size: .8rem; color: var(--muted); margin-bottom: 6px; }
    @media (prefers-reduced-motion: reduce) { .seg .thumb { transition: none; } }
    /* --- colour presets --- */
    .presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .preset { width: 38px; height: 38px; border-radius: 10px; border: 2px solid var(--field-border); cursor: pointer;
              display: grid; place-items: center; font-size: .7rem; font-weight: 700; }
    .preset:hover { border-color: var(--accent); transform: translateY(-1px); }
    /* --- banner templates --- */
    .bantpl { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .bantpl .bt { width: 72px; height: 32px; border-radius: 8px; border: 2px solid transparent; cursor: pointer;
                  position: relative; overflow: hidden; background-size: cover; background-position: center;
                  box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); }
    .bantpl .bt:hover { border-color: var(--accent); }
    .bantpl .bt span { position: absolute; inset: auto 0 2px 0; text-align: center; font-size: .58rem;
                       color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); font-weight: 700; }
    /* --- premium card preview --- */
    .pv { border-radius: 18px; padding: 16px; margin: 10px 0 4px; overflow: hidden;
          box-shadow: 0 10px 30px -8px rgba(43,29,21,.35), 0 2px 6px rgba(43,29,21,.15); }
    .pv-banner { height: 64px; margin: -16px -16px 12px; background-size: cover; background-position: center; display: none; }
    .pv-banner.on { display: block; }
    /* --- share tab --- */
    .sharelist { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 16px; }
    .sharelist a { display: flex; justify-content: space-between; align-items: center; gap: 8px;
                   border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; text-decoration: none;
                   color: var(--ink); font-weight: 600; }
    .sharelist a:hover { border-color: var(--accent); }
    .sharelist a .sub2 { font-weight: 400; color: var(--muted); font-size: .82rem; }
    .sharelist a .arr { color: var(--muted); }
    .sharelist { margin-bottom: 6px; }
    /* --- home: totals + per-card breakdown --- */
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
    .totals .metric { padding: 16px 14px 13px; }
    .totals .metric b { font-size: clamp(1.4rem, 6.5vw, 2rem); }
    .breakdown { width: 100%; border-collapse: collapse; font-size: .9rem; margin-top: 6px; }
    .breakdown th { text-align: left; color: var(--muted); font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .breakdown td { padding: 10px; border-bottom: 1px solid var(--line); }
    .breakdown td.n { text-align: right; font-variant-numeric: tabular-nums; }
    .viewall { margin-top: 18px; }
    /* --- card picker (Cards + Share) --- */
    .cardpick { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 20px; }
    .cardpick button { width: auto; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--field-border);
                       background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
    .cardpick button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    /* --- customer rows (Customers view) — the dashboard's own card style --- */
    .pass { border: 1px solid var(--line); border-radius: 14px; padding: 15px 16px; margin-top: 12px;
            background: var(--surface); box-shadow: var(--shadow); }
    .pass strong { font-size: 1.02rem; }
    .pass .row { display: flex; gap: 8px; margin-top: 12px; }
    .pass .row .btn { width: auto; padding: 9px 16px; font-size: .9rem; }
    .ready { color: #1a7f37; font-weight: 700; }
    /* --- customers view --- */
    .backlink { background: none; border: none; color: var(--muted); font: inherit; font-weight: 600;
                cursor: pointer; padding: 4px 0; margin-bottom: 10px; }
    .backlink:hover { color: var(--accent-dark); }
    .custctl { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
    .custctl > div { flex: 1; min-width: 130px; }
    /* --- show-password toggle --- */
    .eye { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); margin: 8px 0 0; }
    .eye input { width: auto; }
  `;
  const js = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    async function api(path, opts = {}) {
      const res = await fetch("/dashboard/api" + path, {
        ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}) },
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }
    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }

    // Reveal/hide any password field via a "Show" checkbox (data-eye = its selector).
    function wireEyes(root) {
      root.querySelectorAll("[data-eye]").forEach((cb) => {
        cb.onchange = () => { const i = root.querySelector(cb.dataset.eye); if (i) i.type = cb.checked ? "text" : "password"; };
      });
    }

    function authForm(mode) {
      $("#app").innerHTML = \`
        <h1>\${mode === "signup" ? "Create your account" : "Owner login"}</h1>
        <p class="sub">\${mode === "signup"
          ? "Free to start: you’ll get your own loyalty card to design."
          : "Log in to manage your cards."}</p>
        \${mode === "signup" ? '<label>Café name</label><input id="cafename" placeholder="e.g. Kopi Corner">' : ""}
        <label>Email</label><input id="email" type="email" autocomplete="username">
        <label>Password\${mode === "signup" ? " (min 8 characters)" : ""}</label>
        <input id="pw" type="password" autocomplete="\${mode === "signup" ? "new-password" : "current-password"}">
        <label class="eye"><input type="checkbox" data-eye="#pw"> Show password</label>
        <button class="btn btn-dark" style="margin-top:14px" id="go">\${mode === "signup" ? "Create account" : "Log in"}</button>
        \${mode === "login" ? '<p class="muted" style="margin-top:12px;text-align:center"><a href="#" id="forgot">Forgot password?</a></p><div id="forgotbox" style="display:none"><label>Your account email</label><input id="fmail" type="email"><button class="btn btn-ghost" style="margin-top:8px" id="fsend">Send reset link</button></div>' : ""}
        <p class="muted" style="margin-top:14px;text-align:center">
          \${mode === "signup"
            ? 'Already have an account? <a href="#" id="switch">Log in</a>'
            : 'New here? <a href="#" id="switch">Create an account</a>'}
        </p>\`;
      wireEyes(document);
      $("#switch").onclick = (e) => { e.preventDefault(); authForm(mode === "signup" ? "login" : "signup"); };
      if (mode === "login") {
        $("#forgot").onclick = (e) => { e.preventDefault(); const b = $("#forgotbox"); b.style.display = b.style.display === "none" ? "block" : "none"; };
        $("#fsend").onclick = async () => {
          const email = $("#fmail").value.trim();
          if (!email.includes("@")) return toast("Enter your account email");
          await api("/forgot", { method: "POST", body: JSON.stringify({ email }) });
          toast("If that email has an account, a reset link is on its way ✉️");
          $("#forgotbox").style.display = "none";
        };
      }
      $("#go").onclick = async () => {
        const payload = { email: $("#email").value.trim(), password: $("#pw").value };
        if (mode === "signup") payload.cafeName = $("#cafename").value.trim();
        const { status, body } = await api("/" + mode, { method: "POST", body: JSON.stringify(payload) });
        if (body.ok) location.reload();
        else toast(body.error === "email-taken" ? "That email already has an account — log in instead."
                 : body.error || ("Failed (" + status + ")"));
      };
    }

    // Curated palettes so a new card looks good without fiddling. [bg, text, label]
    const PRESETS = [
      { name: "Espresso", bg: "#3b2016", fg: "#fffaf0", label: "#d6b278" },
      { name: "Matcha",   bg: "#2f4a34", fg: "#f3f8ef", label: "#b7d6a0" },
      { name: "Berry",    bg: "#4a1f38", fg: "#fdeef6", label: "#e5a9cd" },
      { name: "Ocean",    bg: "#123047", fg: "#eef7fc", label: "#8fc4e6" },
      { name: "Charcoal", bg: "#1f2124", fg: "#f4f4f5", label: "#a9d0ff" },
      { name: "Sunset",   bg: "#7a2f1c", fg: "#fff2ea", label: "#f6b98f" },
    ];

    function designPanel(c) {
      const div = document.createElement("div");
      const base = c.id === "default" ? "" : "/c/" + c.id;
      const landing = base || "/";
      const bust = (v) => v ? "?v=" + v : "";
      const logoSrc = base + "/art/logo.png" + bust(c.logoVersion);
      div.innerHTML = \`
        <label>Card preview <span class="muted">(live — updates as you type)</span></label>
        <div class="pv" data-pv>
          <div class="pv-banner" data-pv-banner></div>
          <div class="pv-top">
            <img class="pv-logo" data-pv-logo src="\${logoSrc}" alt="">
            <span class="pv-name" data-pv-name></span>
            <div class="pv-hdr"><div class="pv-lbl">STAMPS</div><div class="pv-progress" data-pv-progress></div></div>
          </div>
          <div class="pv-lbl" style="margin-top:10px">YOUR STAMPS</div>
          <div class="pv-dots" data-pv-dots></div>
          <div class="pv-lbl">REWARD</div>
          <div class="pv-reward" data-pv-reward></div>
          <div class="pv-qr">QR</div>
          <div class="pv-note">Code ABC123 · updates by itself</div>
        </div>

        <label style="margin-top:12px">Quick themes</label>
        <div class="presets" data-presets></div>

        <div class="colors">
          <label>Card colour<input data-f="bg" type="color" value="\${c.bg}"></label>
          <label>Text<input data-f="fg" type="color" value="\${c.fg}"></label>
          <label>Labels<input data-f="label" type="color" value="\${c.label}"></label>
        </div>
        <div class="logorow" style="margin-top:8px">
          <label class="btn btn-ghost" style="margin:0">Upload logo<input data-logo type="file" accept="image/*"></label>
          <button class="btn btn-ghost" data-a="rmlogo" style="\${c.logoVersion ? "" : "display:none"}">Remove logo</button>
        </div>

        <label style="margin-top:10px">Banner <span class="muted">(a wide image behind the top of the card)</span></label>
        <div class="bantpl" data-bantpl></div>
        <div class="logorow" style="margin-top:8px">
          <label class="btn btn-ghost" style="margin:0">Upload your own<input data-banner type="file" accept="image/*"></label>
          <button class="btn btn-ghost" data-a="rmbanner" style="\${c.bannerVersion ? "" : "display:none"}">Remove banner</button>
        </div>

        <label style="margin-top:12px">Card name</label><input data-f="name" value="\${c.name}">
        <label>Reward</label><input data-f="reward" value="\${c.reward}">
        <div class="row2">
          <div><label>Stamps to reward</label><input data-f="stampsTarget" type="number" min="1" max="30" value="\${c.stampsTarget}"></div>
          <div><label>Free welcome stamps</label><input data-f="stampsStart" type="number" min="0" max="29" value="\${c.stampsStart}"></div>
        </div>
        <label>Staff PIN <span class="muted">(staff type this to unlock the stamper)</span></label><input data-f="staffPin" value="\${c.staffPin}">
        <button class="btn btn-dark" style="margin-top:14px" data-a="save">Save changes</button>
        <p class="muted" style="margin-top:8px">Changes apply to newly issued cards; existing cards keep their reward. Sharing links live in the <strong>Share</strong> tab.</p>\`;

      const f = (k) => div.querySelector('[data-f=' + k + ']');
      const q = (s) => div.querySelector(s);

      // banner preview
      if (c.bannerVersion) {
        const b = q("[data-pv-banner]");
        b.style.backgroundImage = "url(" + base + "/art/banner.png" + bust(c.bannerVersion) + ")";
        b.classList.add("on");
      }

      function renderPreview() {
        const target = Math.max(1, Math.min(30, Number(f("stampsTarget").value) || 10));
        const start = Math.max(0, Math.min(target, Number(f("stampsStart").value) || 0));
        const pv = q("[data-pv]");
        pv.style.background = f("bg").value;
        pv.style.color = f("fg").value;
        q("[data-pv-name]").textContent = f("name").value || "Your card";
        q("[data-pv-progress]").textContent = start + "/" + target;
        q("[data-pv-dots]").textContent = "●".repeat(start) + "○".repeat(target - start);
        q("[data-pv-reward]").textContent = f("reward").value || "Your reward";
        for (const el of div.querySelectorAll(".pv-lbl, .pv-note")) el.style.color = f("label").value;
      }
      for (const el of div.querySelectorAll("[data-f]")) el.addEventListener("input", renderPreview);
      renderPreview();

      // preset swatches
      const pc = q("[data-presets]");
      for (const p of PRESETS) {
        const sw = document.createElement("div");
        sw.className = "preset"; sw.title = p.name;
        sw.style.background = p.bg; sw.style.color = p.label;
        sw.textContent = p.name[0];
        sw.onclick = () => { f("bg").value = p.bg; f("fg").value = p.fg; f("label").value = p.label; renderPreview(); };
        pc.appendChild(sw);
      }

      // image upload helper: normalise to PNG (square logo, or wide banner) → POST
      function wireUpload(inputSel, kind, w, h, onDone) {
        q(inputSel).onchange = () => {
          const file = q(inputSel).files[0]; if (!file) return;
          const img = new Image();
          img.onload = async () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            const s = Math.max(w / img.width, h / img.height); // cover
            ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
            const dataUrl = canvas.toDataURL("image/png");
            if (!kind) { onDone(dataUrl); return; } // caller saves (e.g. banner via saveBanner)
            const { body } = await api("/cafe/" + c.id + "/" + kind, {
              method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }),
            });
            if (body.ok) { onDone(dataUrl); toast((kind === "logo" ? "Logo" : "Banner") + " saved ✓"); }
            else toast(body.error || "Upload failed");
          };
          img.onerror = () => toast("Couldn't read that image");
          img.src = URL.createObjectURL(file);
        };
      }
      wireUpload("[data-logo]", "logo", 320, 320, (url) => {
        q("[data-pv-logo]").src = url; q("[data-a=rmlogo]").style.display = "";
      });
      q("[data-a=rmlogo]").onclick = async () => {
        const { body } = await api("/cafe/" + c.id + "/logo", { method: "DELETE" });
        if (body.ok) { q("[data-pv-logo]").src = base + "/art/logo.png?v=" + Date.now(); q("[data-a=rmlogo]").style.display = "none"; toast("Logo removed"); }
      };

      // Banner: pre-made templates (drawn on a canvas from the card's colours,
      // so they stay on-brand) plus "upload your own". Both save the same way.
      async function saveBanner(dataUrl) {
        const { body } = await api("/cafe/" + c.id + "/banner", { method: "POST", body: JSON.stringify({ png: dataUrl.split(",")[1] }) });
        if (!body.ok) return toast(body.error || "Banner failed");
        const b = q("[data-pv-banner]"); b.style.backgroundImage = "url(" + dataUrl + ")"; b.classList.add("on");
        q("[data-a=rmbanner]").style.display = ""; toast("Banner saved ✓");
      }
      wireUpload("[data-banner]", null, 1032, 336, saveBanner); // null kind → onDone handles the POST
      q("[data-a=rmbanner]").onclick = async () => {
        const { body } = await api("/cafe/" + c.id + "/banner", { method: "DELETE" });
        if (body.ok) { const b = q("[data-pv-banner]"); b.classList.remove("on"); b.style.backgroundImage = ""; q("[data-a=rmbanner]").style.display = "none"; toast("Banner removed"); }
      };

      function shade(hex, p) { // p in -1..1 → darken/lighten
        const n = parseInt((hex || "#3b2016").slice(1), 16), t = p < 0 ? 0 : 255, a = Math.abs(p);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        r = Math.round((t - r) * a) + r; g = Math.round((t - g) * a) + g; b = Math.round((t - b) * a) + b;
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      function drawBanner(style, c1, c2, w, h) {
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const x = cv.getContext("2d");
        if (style === "diagonal") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          x.fillStyle = c2; x.beginPath(); x.moveTo(0, h); x.lineTo(w, 0); x.lineTo(w, h); x.closePath(); x.fill();
        } else if (style === "glow") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h);
          const g = x.createRadialGradient(w * .5, h * .5, 10, w * .5, h * .5, w * .6);
          g.addColorStop(0, c2); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, w, h);
        } else if (style === "waves") {
          x.fillStyle = c1; x.fillRect(0, 0, w, h); x.fillStyle = c2;
          for (let k = 0; k < 3; k++) { x.globalAlpha = .18 + k * .12; x.beginPath(); x.moveTo(0, h * .4 + k * 34);
            for (let px = 0; px <= w; px += 8) x.lineTo(px, h * .4 + k * 34 + Math.sin(px / 90 + k) * 26);
            x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fill(); } x.globalAlpha = 1;
        } else { // gradient
          const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
          x.fillStyle = g; x.fillRect(0, 0, w, h);
        }
        return cv.toDataURL("image/png");
      }
      const BANNERS = [
        { name: "Gradient", style: "gradient", from: 1 },
        { name: "Glow", style: "glow", from: 1 },
        { name: "Diagonal", style: "diagonal", from: 1 },
        { name: "Waves", style: "waves", from: 1 },
        { name: "Slate", style: "gradient", c1: "#20242b", c2: "#3c434e" },
        { name: "Sand", style: "gradient", c1: "#cdbfa3", c2: "#a98f66" },
      ];
      const btpl = q("[data-bantpl]");
      for (const t of BANNERS) {
        const c1 = t.from ? f("bg").value : t.c1;
        const c2 = t.from ? shade(f("bg").value, 0.4) : t.c2;
        const bt = document.createElement("div"); bt.className = "bt"; bt.title = t.name;
        bt.style.backgroundImage = "url(" + drawBanner(t.style, c1, c2, 144, 64) + ")";
        bt.innerHTML = "<span>" + t.name + "</span>";
        bt.onclick = () => {
          const a = t.from ? f("bg").value : t.c1, b = t.from ? shade(f("bg").value, 0.4) : t.c2;
          saveBanner(drawBanner(t.style, a, b, 1032, 336));
        };
        btpl.appendChild(bt);
      }

      q("[data-a=save]").onclick = async () => {
        const { body } = await api("/cafe/" + c.id, { method: "POST", body: JSON.stringify({
          name: f("name").value, reward: f("reward").value,
          stampsTarget: Number(f("stampsTarget").value), stampsStart: Number(f("stampsStart").value),
          staffPin: f("staffPin").value, bg: f("bg").value, fg: f("fg").value, label: f("label").value,
        })});
        if (body.ok) {
          c.name = f("name").value; toast("Saved ✓");
          // keep the card-picker chip labels in sync without resetting the form
          const pk = document.querySelector("[data-pick]");
          if (pk) pk.querySelectorAll("button[data-ci]").forEach((b) => { b.textContent = S.cafes[Number(b.dataset.ci)].name; });
        } else toast(body.error || "Save failed");
      };
      return div;
    }

    // ---- Home: totals across ALL cards + per-card breakdown + customer preview ----
    function homePanel() {
      const div = document.createElement("div");
      const sum = (k) => S.cafes.reduce((a, c) => a + (c.metrics[k] || 0), 0);
      const breakdown = S.cafes.length > 1
        ? \`<label style="margin-top:16px">By card</label>
           <table class="breakdown"><tr><th>Card</th><th>Customers</th><th>Stamps</th><th>Claimed</th></tr>
           \${S.cafes.map((c) => '<tr><td>' + c.name + '</td><td class="n">' + c.metrics.cards + '</td><td class="n">' + c.metrics.stamps + '</td><td class="n">' + c.metrics.redemptions + '</td></tr>').join("")}
           </table>\`
        : "";
      div.innerHTML = \`
        <div class="segwrap">
          <div class="seg" id="range" role="tablist">
            <button data-r="all" class="on">All time</button>
            <button data-r="30">Last 30 days</button>
            <span class="thumb"></span>
          </div>
        </div>
        <div class="totals" data-totals></div>
        \${breakdown}
        <label style="margin-top:16px">Customers</label>
        <div data-cust><p class="muted">Loading…</p></div>
        <button class="btn btn-ghost viewall" data-viewall>View all customers →</button>\`;

      // The All-time / 30-day toggle swaps the big numbers instantly (tactile).
      function paintTotals(range) {
        const stamps = range === "30" ? sum("stamps30d") : sum("stamps");
        const claimed = range === "30" ? sum("redemptions30d") : sum("redemptions");
        div.querySelector("[data-totals]").innerHTML = \`
          <div class="metric"><b>\${sum("cards")}</b><span>customers</span></div>
          <div class="metric"><b>\${stamps}</b><span>stamps\${range === "30" ? " · 30d" : ""}</span></div>
          <div class="metric"><b>\${claimed}</b><span>rewards\${range === "30" ? " · 30d" : ""}</span></div>\`;
      }
      paintTotals("all");
      wireSeg(div.querySelector("#range"), (btn) => paintTotals(btn.dataset.r));
      (async () => {
        const { body } = await api("/customers?lapsedDays=14");
        const cust = body.customers || [];
        const lapsing = cust.filter((x) => x.lapsing).length;
        const host = div.querySelector("[data-cust]");
        host.innerHTML = cust.length
          ? '<p><strong>' + cust.length + '</strong> customers · <strong>' + lapsing + '</strong> lapsing (14+ days)</p>'
          : '<p class="muted">No customers yet — they appear once a card is stamped.</p>';
      })();
      div.querySelector("[data-viewall]").onclick = () => { S.tab = "customers"; renderTabs(); renderPanel(); };
      return div;
    }

    // ---- Customers view (opens from Home): search, filters, paging, nudge ----
    function customersView() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <button class="backlink" data-back>← Back to Home</button>
        <div class="custctl">
          <div><label>Card</label><select data-card><option value="all">All cards</option></select></div>
          <div><label>Not seen in</label><select data-days>
            <option value="0">everyone</option>
            <option value="7">7+ days</option>
            <option value="14" selected>14+ days</option>
            <option value="30">30+ days</option>
          </select></div>
        </div>
        <input data-search placeholder="🔍 Search by card code" autocomplete="off" style="text-transform:uppercase;margin-top:8px">
        <div data-list style="margin-top:10px"><p class="muted">Loading…</p></div>
        <button class="btn btn-ghost" data-more style="display:none;margin-top:10px">Load more</button>
        <div class="account" style="margin-top:16px">
          <label>Win-back message</label>
          <input data-msg value="We miss you! Your next stamp is waiting ☕️" maxlength="200">
          <button class="btn btn-dark" style="margin-top:10px" data-nudgeall>Nudge everyone shown</button>
          <p class="muted" style="margin-top:6px">Messages the customers currently listed — narrow the card/lapsing filters to choose who. Google limits 3 messages per card per day.</p>
        </div>\`;
      const q = (s) => div.querySelector(s);
      let all = [], shown = [], limit = 50;

      q("[data-back]").onclick = () => { S.tab = "home"; renderTabs(); renderPanel(); };

      async function nudge(serials) {
        const message = q("[data-msg]").value.trim();
        if (!message) return toast("Type a message first");
        if (!serials.length) return toast("No customers to nudge");
        const { body } = await api("/nudge", { method: "POST", body: JSON.stringify({ message, target: serials }) });
        toast(body.ok ? ("Nudged " + body.sent + " of " + body.total + " (rest have no phone yet)") : (body.error || "Failed"));
      }

      function renderRows() {
        const search = (q("[data-search]").value || "").trim().toUpperCase();
        shown = all.filter((x) => !search || x.code.toUpperCase().includes(search));
        const list = q("[data-list]"); list.innerHTML = "";
        if (!all.length) { list.innerHTML = '<p class="muted">Nobody matches that filter 🎉</p>'; q("[data-more]").style.display = "none"; return; }
        if (!shown.length) { list.innerHTML = '<p class="muted">No card matches that code.</p>'; q("[data-more]").style.display = "none"; return; }
        for (const x of shown.slice(0, limit)) {
          const row = document.createElement("div"); row.className = "pass";
          row.innerHTML = \`<strong>\${x.code}</strong>
            <span class="muted"> · \${x.cardName} · \${x.stamps}/\${x.target} · last seen \${x.lastDays}d ago\${x.lapsing ? " · lapsing" : ""}</span>
            <div class="row"><button class="btn btn-ghost" data-n>Nudge</button></div>\`;
          row.querySelector("[data-n]").onclick = () => nudge([x.serial]);
          list.appendChild(row);
        }
        q("[data-more]").style.display = shown.length > limit ? "" : "none";
      }

      async function load() {
        limit = 50;
        const card = q("[data-card]").value, days = q("[data-days]").value;
        const { body } = await api("/customers?cardId=" + encodeURIComponent(card) + "&lapsedDays=" + days);
        let cust = body.customers || [];
        if (Number(days) > 0) cust = cust.filter((x) => x.lapsing);
        all = cust;
        const sel = q("[data-card]");
        if (!sel.dataset.filled) {
          sel.insertAdjacentHTML("beforeend", (body.cards || []).map((c) => '<option value="' + c.id + '">' + c.name + '</option>').join(""));
          sel.dataset.filled = "1";
        }
        renderRows();
      }
      q("[data-card]").onchange = load;
      q("[data-days]").onchange = load;
      q("[data-search]").oninput = renderRows;
      q("[data-more]").onclick = () => { limit += 50; renderRows(); };
      q("[data-nudgeall]").onclick = () => nudge(shown.map((x) => x.serial));
      load();
      return div;
    }

    // ---- Cards: pick a card (chips) + the designer for the selected one ----
    function cardsPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`<div class="cardpick" data-pick></div><div data-design></div>\`;
      const pick = div.querySelector("[data-pick]");
      const host = div.querySelector("[data-design]");
      function draw() {
        pick.innerHTML = "";
        if (S.cafes.length > 1) {
          S.cafes.forEach((c, i) => {
            const b = document.createElement("button");
            b.textContent = c.name; b.dataset.ci = String(i);
            b.className = i === S.selCard ? "on" : "";
            b.onclick = () => { S.selCard = i; draw(); };
            pick.appendChild(b);
          });
        }
        const add = document.createElement("button");
        add.textContent = "+ Add card";
        add.onclick = async () => {
          const name = prompt("Name for the new card (e.g. “Coffee card” or “Pastry card”):");
          if (!name) return;
          const { body: r } = await api("/cafes", { method: "POST", body: JSON.stringify({ name }) });
          if (r.ok) location.reload(); else toast(r.error || "Failed");
        };
        pick.appendChild(add);
        host.innerHTML = ""; host.appendChild(designPanel(S.cafes[S.selCard]));
      }
      draw();
      return div;
    }

    // ---- Share: every card's Add-to-Wallet QR / page / staff stamper ----
    // (the tap-tag link is owner-facing only in the admin console, not here)
    function shareAll() {
      const div = document.createElement("div");
      div.innerHTML = '<p class="sub">Share these with customers and staff. They never change when you edit a card.</p>';
      for (const c of S.cafes) {
        const base = c.id === "default" ? "" : "/c/" + c.id;
        const landing = base || "/";
        const block = document.createElement("div");
        block.innerHTML = \`
          \${S.cafes.length > 1 ? '<label style="font-weight:700;color:var(--ink)">' + c.name + '</label>' : ""}
          <div class="sharelist">
            <a href="\${base + "/qr"}" target="_blank"><span>Add-to-Wallet QR <span class="sub2">print for the counter</span></span><span class="arr">open →</span></a>
            <a href="\${landing}" target="_blank"><span>Add-to-Wallet page <span class="sub2">the sign-up link</span></span><span class="arr">open →</span></a>
            <a href="/staff?c=\${c.id}" target="_blank"><span>Staff stamper <span class="sub2">PIN: \${c.staffPin}</span></span><span class="arr">open →</span></a>
          </div>\`;
        div.appendChild(block);
      }
      return div;
    }

    // ---- Account: identity + change password + log out ----
    function accountPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <label>Signed in as</label>
        <p style="font-weight:600;margin-bottom:6px">\${S.email}</p>
        <label style="margin-top:10px">Change password</label>
        <input data-cur type="password" placeholder="Current password" autocomplete="current-password">
        <input data-new type="password" placeholder="New password (min 8)" autocomplete="new-password" style="margin-top:8px">
        <label class="eye"><input type="checkbox" data-eye="[data-new]"> Show new password</label>
        <button class="btn btn-dark" style="margin-top:10px" data-pwsave>Update password</button>
        <button class="btn btn-ghost" style="margin-top:20px" data-out>Log out</button>\`;
      wireEyes(div);
      div.querySelector("[data-pwsave]").onclick = async () => {
        const { body } = await api("/change-password", { method: "POST", body: JSON.stringify({
          current: div.querySelector("[data-cur]").value, next: div.querySelector("[data-new]").value,
        })});
        if (body.ok) { toast("Password updated ✓"); div.querySelector("[data-cur]").value = ""; div.querySelector("[data-new]").value = ""; }
        else toast(body.error || "Couldn’t update");
      };
      div.querySelector("[data-out]").onclick = async () => { await api("/logout", { method: "POST" }); location.reload(); };
      return div;
    }

    // Slides a segmented control's thumb under its active button. Reused by the
    // tab bar and the Home time toggle — this is the "tap across, watch it glide".
    function moveThumb(seg) {
      const on = seg.querySelector("button.on") || seg.querySelector("button");
      const thumb = seg.querySelector(".thumb");
      if (!on || !thumb) return;
      thumb.style.width = on.offsetWidth + "px";
      thumb.style.transform = "translateX(" + on.offsetLeft + "px)";
    }
    // Wires a segmented control: click → set .on, glide the thumb, run onPick(btn).
    function wireSeg(seg, onPick) {
      seg.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
          seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
          moveThumb(seg);
          onPick && onPick(b);
        };
      });
      requestAnimationFrame(() => moveThumb(seg)); // position once laid out
    }

    // ---- app shell: owner-scoped tabs ----
    const S = { cafes: [], email: "", tab: "home", selCard: 0 };

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      S.cafes = body.cafes; S.email = body.email; S.selCard = 0; S.tab = "home";
      $("#app").innerHTML = \`
        <div><h1 style="margin:0">Dashboard</h1><p class="sub" style="margin:2px 0 14px">\${S.email}</p></div>
        <div class="seg" id="tabs" role="tablist">
          <button data-tab="home" class="on">Home</button>
          <button data-tab="cards">Cards</button>
          <button data-tab="share">Share</button>
          <button data-tab="account">Account</button>
          <span class="thumb"></span>
        </div>
        <div id="panel"></div>\`;
      $("#tabs").querySelectorAll("button").forEach((b) => {
        b.onclick = () => { S.tab = b.dataset.tab; renderTabs(); renderPanel(); };
      });
      renderTabs(); renderPanel();
    }

    function renderTabs() {
      // The Customers view is a sub-page of Home, so keep Home highlighted there.
      const active = S.tab === "customers" ? "home" : S.tab;
      const seg = $("#tabs");
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === active));
      moveThumb(seg);
    }
    function renderPanel() {
      const panel = $("#panel"); panel.innerHTML = "";
      const view = S.tab === "cards" ? cardsPanel()
        : S.tab === "share" ? shareAll()
        : S.tab === "account" ? accountPanel()
        : S.tab === "customers" ? customersView()
        : homePanel();
      panel.appendChild(view);
    }

    // Re-seat every segmented thumb when the layout shifts (window resize) or the
    // webfont swaps in and changes button widths, so the highlight stays aligned.
    const reseat = () => document.querySelectorAll(".seg").forEach((s) => moveThumb(s));
    window.addEventListener("resize", reseat);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reseat);

    (async () => {
      const { body } = await api("/state");
      if (body.loggedIn) app();
      else authForm("login");
    })();
  `;
  return page(
    "Stampy — Dashboard",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    css,
    js,
  );
}

// ---------------------------------------------------------------- admin ----

export function adminPage(): string {
  const css = /* css */ `
    body { max-width: none; }
    .awrap { width: 100%; max-width: 960px; }
    table { border-collapse: collapse; width: 100%; font-size: .9rem; margin-top: 12px; }
    th { text-align: left; color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .flags { font-size: .78rem; color: var(--muted); }
    .tw { overflow-x: auto; }
    .rst { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: end; }
    .rst select { width: auto; }
    .rst .btn { width: auto; padding: 10px 14px; }
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: 8px 10px; border-radius: 8px; margin-top: 10px; }
    .nfc { font-family: ui-monospace, Menlo, monospace; word-break: break-all; }
    .cbtn { width: auto; padding: 5px 10px; font-size: .78rem; margin-top: 4px; }
  `;
  const js = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    async function api(p, o={}) {
      const r = await fetch("/admin/api" + p, { ...o, headers: { "Content-Type": "application/json", ...(o.headers||{}) } });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
    async function load() {
      const { status, body } = await api("/overview");
      if (status === 403) {
        // Tell the founder EXACTLY why it's closed rather than a vague bounce.
        const msg = body.error === "admin-closed"
          ? 'The admin console is closed because <strong>ADMIN_EMAIL</strong> isn’t set. In Railway → your app service → Variables, add <strong>ADMIN_EMAIL</strong> = your dashboard login email (you can list several, comma-separated, e.g. <em>you@x.com, partner@x.com</em>), then redeploy.'
          : 'You’re not signed in as an admin account. Log in at <a href="/dashboard">/dashboard</a> with an email listed in <strong>ADMIN_EMAIL</strong>, then reopen this page.';
        $("#app").innerHTML = '<h1>Admin</h1><p class="sub">' + msg + '</p>';
        return;
      }
      const origin = location.origin;
      const nfcUrl = (id) => origin + (id === "default" ? "/" : "/c/" + id);
      const rows = body.cafes.map((c) => \`
        <tr>
          <td><strong>\${c.name}</strong><br><span class="flags">\${c.id}</span></td>
          <td>\${c.owners || "—"}</td>
          <td>\${c.cards}</td>
          <td>\${c.stamps}</td>
          <td>\${c.redemptions}</td>
          <td class="flags">\${c.has_logo ? "logo " : ""}\${c.has_banner ? "banner" : ""}\${!c.has_logo && !c.has_banner ? "—" : ""}<br>\${new Date(c.created_at).toLocaleDateString()}</td>
          <td class="flags"><span class="nfc">\${nfcUrl(c.id)}</span><br><button class="btn btn-ghost cbtn" data-nfc="\${nfcUrl(c.id)}">Copy</button></td>
        </tr>\`).join("");
      const opts = body.owners.map((o) => '<option value="' + o.id + '">' + o.email + '</option>').join("");
      $("#app").innerHTML = \`
        <h1>Platform admin</h1>
        <p class="sub">\${body.cafes.length} cards · \${body.owners.length} owners. Read-only, plus password resets.</p>
        <div class="tw"><table>
          <tr><th>Card</th><th>Owner(s)</th><th>Cards</th><th>Stamps</th><th>Redeemed</th><th>Art / created</th><th>Sign-up / NFC link</th></tr>
          \${rows}
        </table></div>
        <p class="muted" style="margin-top:8px">The sign-up / NFC link is the Add-to-Wallet URL to program onto a card's NFC sticker — you set these up for merchants (they don't see it).</p>
        <h2>Reset an owner's password</h2>
        <p class="muted">Passwords are stored scrambled and can never be viewed — this sets a NEW temporary one to hand over.</p>
        <div class="rst">
          <div><label>Owner</label><select id="who">\${opts}</select></div>
          <button class="btn btn-dark" id="reset">Generate temp password</button>
        </div>
        <div id="tempout"></div>\`;
      $("#app").querySelectorAll(".cbtn").forEach((b) => {
        b.onclick = async () => {
          try { await navigator.clipboard.writeText(b.dataset.nfc); b.textContent = "Copied ✓"; }
          catch { b.textContent = b.dataset.nfc; }
        };
      });
      $("#reset").onclick = async () => {
        const { body: r } = await api("/owner/" + $("#who").value + "/reset-password", { method: "POST" });
        if (r.ok) $("#tempout").innerHTML = '<div class="temp">New password for <strong>' + r.email + '</strong>: <strong>' + r.tempPassword + '</strong><br>Give it to them; they can change it in their dashboard.</div>';
        else $("#tempout").textContent = r.error || "Failed";
      };
    }
    load();
  `;
  return page(
    "Stampy — Admin",
    `<div class="card awrap" id="app"><p class="sub">Loading…</p></div>`,
    css,
    js,
  );
}

// ---------------------------------------------------------------- setup ----

export function setupPage(s: SetupStatus, baseUrl: string): string {
  const check = (ok: boolean, label: string, hint: string) =>
    `<li style="margin:10px 0; list-style:none">
       <span style="font-size:1.1rem">${ok ? "✅" : "❌"}</span> <strong>${label}</strong>
       ${ok ? "" : `<div class="muted" style="margin-left:28px">${hint}</div>`}
     </li>`;
  return page(
    "Stampy — Setup status",
    `<div class="card">
      <h1>Setup status</h1>
      <p class="sub">Green across the board = ready to demo.</p>
      <ul style="padding:0">
        ${check(s.database, "Database connected", "Add the Postgres plugin in Railway (it sets DATABASE_URL automatically).")}
        ${check(s.baseUrl, "Public URL set (BASE_URL)", "In Railway → Variables, set BASE_URL to this app’s https URL.")}
        ${check(s.teamId, "Apple Team ID (APPLE_TEAM_ID)", "From developer.apple.com → Membership details.")}
        ${check(s.passTypeId, "Pass Type ID (PASS_TYPE_ID)", "e.g. pass.com.stampy.loyalty — created at developer.apple.com.")}
        ${check(s.signerCert, "Signing certificate (SIGNER_CERT_B64 + SIGNER_KEY_B64)", "Exported from Keychain — Claude walks you through this.")}
        ${check(s.apnsKey, "Push key (APNS_KEY_B64 + APNS_KEY_ID)", "An APNs auth key (.p8) from developer.apple.com.")}
        ${check(s.googleIssuer, "Google Wallet Issuer ID (GOOGLE_ISSUER_ID)", "From the Google Wallet Business Console — needed for Android cards.")}
        ${check(s.googleServiceAccount, "Google service account (GOOGLE_SERVICE_ACCOUNT_B64)", "Produced by pnpm prepare-google from the downloaded JSON key.")}
        ${check(s.canEmail, "Email for password resets (RESEND_API_KEY + EMAIL_FROM)", "Optional but recommended: make a free Resend account, verify a sender, then set both in Railway → Variables. Without it, owners recover via the admin console instead.")}
      </ul>
      <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
      <p><strong>Apple — can issue cards:</strong> ${s.canSignPasses ? "YES ✅" : "not yet"}</p>
      <p><strong>Apple — can push updates:</strong> ${s.canPush ? "YES ✅" : "not yet"}</p>
      <p><strong>Google Wallet (Android):</strong> ${s.canGoogleWallet ? "YES ✅" : "not yet"}</p>
      <p><strong>Email (password resets):</strong> ${s.canEmail ? "YES ✅" : "not yet"}</p>
      <p style="margin-top:14px">Owner dashboard: <a href="/dashboard">${baseUrl || ""}/dashboard</a></p>
      ${
        s.canSignPasses
          ? `<p>Counter QR (print me): <a href="/qr">${baseUrl}/qr</a></p>
             <p>Staff page: <a href="/staff">${baseUrl}/staff</a></p>`
          : ""
      }
    </div>`,
  );
}

// ------------------------------------------------------------ reset ----

/** The page a password-reset email link opens: set a new password, then log in. */
export function resetPage(): string {
  const js = /* js */ `
    const $ = (s) => document.querySelector(s);
    const token = new URLSearchParams(location.search).get("token") || "";
    function toast(msg) { const t = $(".toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }
    if (!token) {
      $("#app").innerHTML = '<h1>Reset link invalid</h1><p class="sub">This link is missing its code. Request a new one from the <a href="/dashboard">login page</a>.</p>';
    } else {
      $("#app").innerHTML = \`
        <h1>Set a new password</h1>
        <p class="sub">Choose a new password for your Stampy account.</p>
        <label>New password (min 8 characters)</label>
        <input id="pw" type="password" autocomplete="new-password">
        <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);margin-top:6px"><input id="eye" type="checkbox" style="width:auto"> Show password</label>
        <button class="btn btn-dark" style="margin-top:14px" id="go">Save new password</button>\`;
      $("#eye").onchange = () => { $("#pw").type = $("#eye").checked ? "text" : "password"; };
      $("#go").onclick = async () => {
        const password = $("#pw").value;
        if (!password || password.length < 8) return toast("Password needs at least 8 characters");
        const r = await fetch("/dashboard/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
        const body = await r.json().catch(() => ({}));
        if (body.ok) { toast("Password set — signing you in…"); setTimeout(() => location.href = "/dashboard", 900); }
        else toast(body.error === "invalid-or-expired-link" ? "This link has expired — request a new one." : (body.error || "Couldn’t reset"));
      };
    }
  `;
  return page(
    "Stampy — Reset password",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    "",
    js,
  );
}
