/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 */
import type { SetupStatus } from "./config.js";
import type { CafeRow } from "./db.js";
import { DEFAULT_CAFE_ID } from "./db.js";

const baseCss = /* css */ `
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f6f1ea; color: #2b1d15; min-height: 100vh;
    display: flex; flex-direction: column; align-items: center;
    padding: 24px 16px 48px;
  }
  .card {
    background: #fff; border-radius: 16px; padding: 24px;
    box-shadow: 0 2px 12px rgba(43,29,21,.08); width: 100%; max-width: 420px;
  }
  h1 { font-size: 1.5rem; margin-bottom: 8px; }
  h2 { font-size: 1.1rem; margin: 18px 0 6px; }
  p.sub { color: #7a6a5d; margin-bottom: 20px; }
  .btn {
    display: block; width: 100%; text-align: center; padding: 14px 20px;
    border-radius: 12px; border: none; font-size: 1.05rem; font-weight: 600;
    cursor: pointer; text-decoration: none;
  }
  .btn-dark { background: #1d1d1f; color: #fff; }
  .btn-stamp { background: #3b2016; color: #fff; }
  .btn-ghost { background: #efe7dd; color: #3b2016; }
  .muted { color: #9b8b7d; font-size: .85rem; }
  input, textarea, select {
    width: 100%; padding: 12px; border: 1px solid #d9cbbb; border-radius: 10px;
    font-size: 1rem; font-family: inherit; background: #fff;
  }
  label { font-size: .8rem; color: #7a6a5d; display: block; margin: 10px 0 4px; }
  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #1d1d1f; color: #fff; padding: 10px 18px; border-radius: 999px;
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
    .pass { border: 1px solid #eee2d5; border-radius: 12px; padding: 14px; margin-top: 12px; }
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
        const out = await api(path, { method: "POST", body: JSON.stringify(body) });
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
    .metric { background: #f6f1ea; border-radius: 10px; padding: 10px; text-align: center; }
    .metric b { font-size: 1.3rem; display: block; }
    .cafe { border: 1px solid #eee2d5; border-radius: 12px; padding: 16px; margin-top: 14px; }
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
    .colors input[type=color] { width: 100%; height: 38px; padding: 2px; border: 1px solid #d9cbbb;
                                border-radius: 10px; background: #fff; cursor: pointer; }
    .logorow { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    .logorow input[type=file] { display: none; }
    .logorow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    .copyrow { display: flex; gap: 8px; margin-top: 4px; }
    .copyrow input { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; background: #f6f1ea; }
    .copyrow .btn { width: auto; padding: 10px 14px; font-size: .9rem; }
    .account { border-top: 1px solid #eee2d5; margin-top: 24px; padding-top: 14px; }
    /* --- card switcher --- */
    .switcher { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 14px; }
    .switcher button { border: 1px solid #d9cbbb; background: #fff; color: #3b2016; border-radius: 999px;
                       padding: 6px 14px; font: inherit; font-size: .88rem; cursor: pointer; }
    .switcher button.on { background: #3b2016; color: #fff; border-color: #3b2016; }
    /* --- tabs --- */
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid #eee2d5; margin: 6px 0 14px; }
    .tabs button { border: none; background: none; color: #7a6a5d; font: inherit; font-weight: 600;
                   padding: 10px 14px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tabs button.on { color: #3b2016; border-bottom-color: #3b2016; }
    /* --- colour presets --- */
    .presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 2px; }
    .preset { width: 38px; height: 38px; border-radius: 10px; border: 2px solid #d9cbbb; cursor: pointer;
              display: grid; place-items: center; font-size: .7rem; font-weight: 700; }
    .preset:hover { border-color: #3b2016; }
    /* --- banner --- */
    .pv-banner { height: 46px; border-radius: 8px 8px 0 0; margin: -16px -16px 10px; background-size: cover;
                 background-position: center; display: none; }
    .pv-banner.on { display: block; }
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
        <button class="btn btn-dark" style="margin-top:14px" id="go">\${mode === "signup" ? "Create account" : "Log in"}</button>
        <p class="muted" style="margin-top:14px;text-align:center">
          \${mode === "signup"
            ? 'Already have an account? <a href="#" id="switch">Log in</a>'
            : 'New here? <a href="#" id="switch">Create an account</a>'}
        </p>\`;
      $("#switch").onclick = (e) => { e.preventDefault(); authForm(mode === "signup" ? "login" : "signup"); };
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
        <div class="logorow">
          <label class="btn btn-ghost" style="margin:0">Upload banner<input data-banner type="file" accept="image/*"></label>
          <button class="btn btn-ghost" data-a="rmbanner" style="\${c.bannerVersion ? "" : "display:none"}">Remove banner</button>
        </div>
        <p class="muted" style="margin-top:4px">Banner = a wide image behind the top of the card (a gradient or photo). Optional.</p>

        <label style="margin-top:10px">Card name</label><input data-f="name" value="\${c.name}">
        <label>Reward</label><input data-f="reward" value="\${c.reward}">
        <div class="row2">
          <div><label>Stamps to reward</label><input data-f="stampsTarget" type="number" min="1" max="30" value="\${c.stampsTarget}"></div>
          <div><label>Free welcome stamps</label><input data-f="stampsStart" type="number" min="0" max="29" value="\${c.stampsStart}"></div>
        </div>
        <label>Staff PIN</label><input data-f="staffPin" value="\${c.staffPin}">
        <button class="btn btn-dark" style="margin-top:12px" data-a="save">Save changes</button>

        <div class="links">
          <a href="\${landing}" target="_blank">Add-to-Wallet page</a>
          <a href="\${base + "/qr"}" target="_blank">Add-to-Wallet QR</a>
          <a href="/staff?c=\${c.id}" target="_blank">Staff stamper</a>
        </div>
        <label style="margin-top:12px">Add-to-Wallet NFC link <span class="muted">(optional — a tap opens the same page as the QR)</span></label>
        <div class="copyrow">
          <input data-nfc readonly value="\${location.origin}\${landing}">
          <button class="btn btn-ghost" data-a="copynfc">Copy link</button>
        </div>
        <p class="muted" style="margin-top:6px">Write this link onto a blank NFC sticker with a free app like “NFC Tools”. It never changes when you edit settings. The QR always works too.</p>
        <p class="muted" style="margin-top:8px">Changes apply to newly issued cards; existing cards keep their reward.</p>\`;

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
      wireUpload("[data-banner]", "banner", 640, 200, (url) => {
        const b = q("[data-pv-banner]"); b.style.backgroundImage = "url(" + url + ")"; b.classList.add("on");
        q("[data-a=rmbanner]").style.display = "";
      });
      q("[data-a=rmlogo]").onclick = async () => {
        const { body } = await api("/cafe/" + c.id + "/logo", { method: "DELETE" });
        if (body.ok) { q("[data-pv-logo]").src = base + "/art/logo.png?v=" + Date.now(); q("[data-a=rmlogo]").style.display = "none"; toast("Logo removed"); }
      };
      q("[data-a=rmbanner]").onclick = async () => {
        const { body } = await api("/cafe/" + c.id + "/banner", { method: "DELETE" });
        if (body.ok) { const b = q("[data-pv-banner]"); b.classList.remove("on"); b.style.backgroundImage = ""; q("[data-a=rmbanner]").style.display = "none"; toast("Banner removed"); }
      };

      q("[data-a=copynfc]").onclick = async () => {
        try { await navigator.clipboard.writeText(q("[data-nfc]").value); toast("Link copied ✓"); }
        catch { q("[data-nfc]").select(); toast("Select + copy the link"); }
      };
      q("[data-a=save]").onclick = async () => {
        const { body } = await api("/cafe/" + c.id, { method: "POST", body: JSON.stringify({
          name: f("name").value, reward: f("reward").value,
          stampsTarget: Number(f("stampsTarget").value), stampsStart: Number(f("stampsStart").value),
          staffPin: f("staffPin").value, bg: f("bg").value, fg: f("fg").value, label: f("label").value,
        })});
        if (body.ok) { c.name = f("name").value; toast("Saved ✓"); renderSwitcher(); }
        else toast(body.error || "Save failed");
      };
      return div;
    }

    function metricsPanel(c) {
      const div = document.createElement("div");
      const m = c.metrics;
      div.innerHTML = \`
        <div class="metrics">
          <div class="metric"><b>\${m.cards}</b><span class="muted">cards issued</span></div>
          <div class="metric"><b>\${m.stamps}</b><span class="muted">stamps (\${m.stamps30d} in 30d)</span></div>
          <div class="metric"><b>\${m.redemptions}</b><span class="muted">rewards claimed</span></div>
          <div class="metric"><b>\${m.redemptions30d}</b><span class="muted">claimed in 30d</span></div>
        </div>
        <p class="muted" style="margin-top:10px">Numbers update as staff stamp and redeem cards.</p>\`;
      return div;
    }

    // Customers tab: list, lapsing filter, per-customer + bulk win-back nudge.
    function renderCustomers(c) {
      const div = document.createElement("div");
      div.innerHTML = \`
        <label>Show customers not seen in</label>
        <select data-lap>
          <option value="0">everyone</option>
          <option value="7">7+ days</option>
          <option value="14" selected>14+ days (lapsing)</option>
          <option value="30">30+ days</option>
        </select>
        <div data-list style="margin-top:10px"><p class="muted">Loading…</p></div>
        <div class="account" style="margin-top:16px">
          <label>Win-back message</label>
          <input data-msg value="We miss you! Your next stamp is waiting ☕️" maxlength="200">
          <button class="btn btn-dark" style="margin-top:10px" data-a="nudgeshown">Nudge everyone shown</button>
          <p class="muted" style="margin-top:6px">Sends a lock-screen message. Google limits 3 messages per card per day.</p>
        </div>\`;
      const q = (s) => div.querySelector(s);
      let shown = [];

      async function sendNudge(serials) {
        const message = q("[data-msg]").value.trim();
        if (!message) return toast("Type a message first");
        if (!serials.length) return toast("No customers to nudge");
        const { body } = await api("/cafe/" + c.id + "/nudge", {
          method: "POST", body: JSON.stringify({ message, target: serials }),
        });
        toast(body.ok ? ("Nudged " + body.sent + " of " + body.total + " (rest had no phone yet)") : (body.error || "Failed"));
      }

      async function load() {
        const days = Number(q("[data-lap]").value);
        const { body } = await api("/cafe/" + c.id + "/customers?lapsedDays=" + days);
        const cust = body.customers || [];
        shown = days === 0 ? cust : cust.filter((x) => x.lapsing);
        const list = q("[data-list]"); list.innerHTML = "";
        if (!cust.length) { list.innerHTML = '<p class="muted">No customers yet.</p>'; return; }
        if (!shown.length) { list.innerHTML = '<p class="muted">Nobody is lapsing by that filter 🎉</p>'; return; }
        for (const x of shown) {
          const row = document.createElement("div"); row.className = "pass";
          row.innerHTML = \`<strong>\${x.code}</strong>
            <span class="muted"> · \${x.stamps}/\${x.target} · last seen \${x.lastDays}d ago\${x.lapsing ? " · lapsing" : ""}</span>
            <div class="row"><button class="btn btn-ghost" data-a="n1">Nudge</button></div>\`;
          row.querySelector('[data-a=n1]').onclick = () => sendNudge([x.serial]);
          list.appendChild(row);
        }
      }
      q("[data-lap]").onchange = load;
      q("[data-a=nudgeshown]").onclick = () => sendNudge(shown.map((x) => x.serial));
      load();
      return div;
    }

    // ---- app shell: card switcher + tabs ----
    const S = { cafes: [], sel: 0, tab: "design", email: "" };

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      S.cafes = body.cafes; S.email = body.email; S.sel = 0;
      $("#app").innerHTML = \`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div><h1 style="margin:0">Dashboard</h1><p class="sub" style="margin:2px 0 0">\${S.email}</p></div>
        </div>
        <div class="switcher" id="switcher"></div>
        <div class="tabs" id="tabs">
          <button data-tab="design">Design</button>
          <button data-tab="customers">Customers</button>
          <button data-tab="metrics">Metrics</button>
        </div>
        <div id="panel"></div>
        <div class="account">
          <button class="btn btn-ghost" id="add">+ Add another card</button>
          <button class="btn btn-ghost" style="margin-top:8px" id="chpw">Change password</button>
          <div id="pwform" style="display:none">
            <label>Current password</label><input id="pwcur" type="password" autocomplete="current-password">
            <label>New password (min 8 characters)</label><input id="pwnew" type="password" autocomplete="new-password">
            <button class="btn btn-dark" style="margin-top:12px" id="pwsave">Update password</button>
          </div>
          <button class="btn btn-ghost" style="margin-top:8px" id="out">Log out</button>
        </div>\`;
      $("#tabs").querySelectorAll("button").forEach((b) => {
        b.onclick = () => { S.tab = b.dataset.tab; renderTabs(); renderPanel(); };
      });
      $("#add").onclick = async () => {
        const name = prompt("New card name (e.g. your café, or a second card like “Pastry card”):");
        if (!name) return;
        const { body: r } = await api("/cafes", { method: "POST", body: JSON.stringify({ name }) });
        if (r.ok) location.reload(); else toast(r.error || "Failed");
      };
      $("#chpw").onclick = () => { const el = $("#pwform"); el.style.display = el.style.display === "none" ? "block" : "none"; };
      $("#pwsave").onclick = async () => {
        const { body: r } = await api("/change-password", { method: "POST", body: JSON.stringify({ current: $("#pwcur").value, next: $("#pwnew").value }) });
        if (r.ok) { toast("Password updated ✓"); $("#pwform").style.display = "none"; $("#pwcur").value = ""; $("#pwnew").value = ""; }
        else toast(r.error || "Couldn’t update");
      };
      $("#out").onclick = async () => { await api("/logout", { method: "POST" }); location.reload(); };
      renderSwitcher(); renderTabs(); renderPanel();
    }

    function renderSwitcher() {
      const sw = $("#switcher"); if (!sw) return;
      sw.style.display = S.cafes.length > 1 ? "flex" : "none";
      sw.innerHTML = "";
      S.cafes.forEach((c, i) => {
        const b = document.createElement("button");
        b.textContent = c.name; b.className = i === S.sel ? "on" : "";
        b.onclick = () => { S.sel = i; renderSwitcher(); renderPanel(); };
        sw.appendChild(b);
      });
    }
    function renderTabs() {
      $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    }
    function renderPanel() {
      const panel = $("#panel"); const c = S.cafes[S.sel];
      panel.innerHTML = "";
      panel.appendChild(S.tab === "design" ? designPanel(c) : S.tab === "metrics" ? metricsPanel(c) : renderCustomers(c));
    }

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
      </ul>
      <hr style="border:none;border-top:1px solid #eee2d5;margin:16px 0">
      <p><strong>Apple — can issue cards:</strong> ${s.canSignPasses ? "YES ✅" : "not yet"}</p>
      <p><strong>Apple — can push updates:</strong> ${s.canPush ? "YES ✅" : "not yet"}</p>
      <p><strong>Google Wallet (Android):</strong> ${s.canGoogleWallet ? "YES ✅" : "not yet"}</p>
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
