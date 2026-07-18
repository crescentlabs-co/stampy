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

export function landingPage(cafe: CafeRow, ready: boolean, cafeId: string): string {
  const enrollHref = cafeId === DEFAULT_CAFE_ID ? "/enroll" : `/c/${cafeId}/enroll`;
  return page(
    `${cafe.name} — Loyalty Card`,
    `<div class="card" style="text-align:center">
      <div style="font-size:3rem; margin-bottom:8px">☕️</div>
      <h1>${cafe.name}</h1>
      <p class="sub">Collect ${cafe.stamps_target} stamps, get a ${cafe.reward.toLowerCase()}.<br>
      Your card lives in Apple Wallet — no app needed.</p>
      ${
        ready
          ? `<a class="btn btn-dark" href="${enrollHref}">&#63743; Add to Apple Wallet</a>
             <p class="muted" style="margin-top:14px">You start with stamps already on your card 🎁</p>`
          : `<p class="sub"><strong>Almost ready!</strong> Cards can’t be issued yet — the café is still being set up.</p>`
      }
    </div>`,
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
    async function load() {
      const out = await api("/passes");
      const list = $("#list"); list.innerHTML = "";
      if (!out.passes.length) list.innerHTML = '<p class="muted" style="margin-top:16px">No cards yet — scan the counter QR with a phone to create the first one.</p>';
      for (const p of out.passes) {
        const div = document.createElement("div");
        div.className = "pass";
        div.innerHTML = \`
          <strong>\${p.code}</strong>
          \${p.rewardReady ? '<span class="ready"> — REWARD READY 🎉</span>' : ""}
          <div class="dots">\${p.dots} <span class="muted">\${p.stamps}/\${p.target}</span></div>
          <div class="row">
            <button class="btn btn-stamp" data-a="stamp">+1 Stamp</button>
            \${p.rewardReady ? '<button class="btn btn-ghost" data-a="redeem">Redeem & reset</button>' : ""}
            <button class="btn btn-ghost" data-a="nudge">Nudge</button>
          </div>\`;
        div.querySelector('[data-a=stamp]').onclick = () => act("/stamp", { serial: p.serial }, "Stamp added");
        const r = div.querySelector('[data-a=redeem]');
        if (r) r.onclick = () => confirm("Give the reward and reset this card to 0?") &&
          act("/redeem", { serial: p.serial }, "Redeemed & reset");
        div.querySelector('[data-a=nudge]').onclick = () => {
          const m = prompt("Message to send to this customer’s lock screen:",
            "We miss you! Your next stamp is waiting ☕️");
          if (m) act("/message", { serial: p.serial, message: m }, "Nudge sent");
        };
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
          <h2>Recent cards</h2>
          <div id="list"></div>\`;
        $("#scan").onclick = startScanner;
        $("#bycode").onclick = () => {
          const code = $("#code").value.trim();
          if (!code) return toast("Type the code shown on the customer’s card");
          act("/stamp-by-code", { code }, "Stamp added").then(() => { $("#code").value = ""; });
        };
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
        <h1>\${mode === "signup" ? "Create your owner account" : "Owner login"}</h1>
        <p class="sub">\${mode === "signup"
          ? "First-time setup: this account manages your café."
          : "Log in to see your café’s numbers."}</p>
        <label>Email</label><input id="email" type="email" autocomplete="username">
        <label>Password\${mode === "signup" ? " (min 8 characters)" : ""}</label>
        <input id="pw" type="password" autocomplete="\${mode === "signup" ? "new-password" : "current-password"}">
        <button class="btn btn-dark" style="margin-top:14px" id="go">\${mode === "signup" ? "Create account" : "Log in"}</button>\`;
      $("#go").onclick = async () => {
        const { status, body } = await api("/" + mode, { method: "POST",
          body: JSON.stringify({ email: $("#email").value.trim(), password: $("#pw").value }) });
        if (body.ok) location.reload();
        else toast(body.error || ("Failed (" + status + ")"));
      };
    }

    function cafeCard(c) {
      const div = document.createElement("div");
      div.className = "cafe";
      const landing = c.id === "default" ? "/" : "/c/" + c.id;
      const qr = c.id === "default" ? "/qr" : "/c/" + c.id + "/qr";
      div.innerHTML = \`
        <h2 style="margin-top:0">\${c.name}</h2>
        <div class="metrics">
          <div class="metric"><b>\${c.metrics.cards}</b><span class="muted">cards issued</span></div>
          <div class="metric"><b>\${c.metrics.stamps}</b><span class="muted">stamps (\${c.metrics.stamps30d} in 30d)</span></div>
          <div class="metric"><b>\${c.metrics.redemptions}</b><span class="muted">rewards claimed</span></div>
          <div class="metric"><b>\${c.metrics.redemptions30d}</b><span class="muted">claimed in 30d</span></div>
        </div>
        <label>Café name</label><input data-f="name" value="\${c.name}">
        <label>Reward</label><input data-f="reward" value="\${c.reward}">
        <div class="row2">
          <div><label>Stamps to reward</label><input data-f="stampsTarget" type="number" min="1" max="30" value="\${c.stampsTarget}"></div>
          <div><label>Free starting stamps</label><input data-f="stampsStart" type="number" min="0" max="29" value="\${c.stampsStart}"></div>
        </div>
        <label>Staff PIN</label><input data-f="staffPin" value="\${c.staffPin}">
        <button class="btn btn-dark" style="margin-top:12px" data-a="save">Save changes</button>
        <div class="links">
          <a href="\${landing}" target="_blank">Customer page</a>
          <a href="\${qr}" target="_blank">Counter QR</a>
          <a href="/staff?c=\${c.id}" target="_blank">Staff stamper</a>
        </div>
        <p class="muted" style="margin-top:8px">Changes apply to newly issued cards; existing cards keep their reward.</p>\`;
      div.querySelector('[data-a=save]').onclick = async () => {
        const f = (k) => div.querySelector('[data-f=' + k + ']').value;
        const { body } = await api("/cafe/" + c.id, { method: "POST", body: JSON.stringify({
          name: f("name"), reward: f("reward"),
          stampsTarget: Number(f("stampsTarget")), stampsStart: Number(f("stampsStart")),
          staffPin: f("staffPin"),
        })});
        toast(body.ok ? "Saved ✓" : (body.error || "Save failed"));
      };
      return div;
    }

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      $("#app").innerHTML = \`
        <h1>Your cafés</h1>
        <p class="sub">\${body.email}</p>
        <div id="cafes"></div>
        <button class="btn btn-ghost" style="margin-top:14px" id="add">+ Add another café</button>
        <button class="btn btn-ghost" style="margin-top:8px" id="out">Log out</button>\`;
      for (const c of body.cafes) $("#cafes").appendChild(cafeCard(c));
      $("#add").onclick = async () => {
        const name = prompt("New café name:");
        if (!name) return;
        const { body: r } = await api("/cafes", { method: "POST", body: JSON.stringify({ name }) });
        if (r.ok) location.reload(); else toast(r.error || "Failed");
      };
      $("#out").onclick = async () => { await api("/logout", { method: "POST" }); location.reload(); };
    }

    (async () => {
      const { body } = await api("/state");
      if (body.needsSignup) authForm("signup");
      else if (body.loggedIn) app();
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
      </ul>
      <hr style="border:none;border-top:1px solid #eee2d5;margin:16px 0">
      <p><strong>Can issue cards:</strong> ${s.canSignPasses ? "YES ✅" : "not yet"}</p>
      <p><strong>Can push updates:</strong> ${s.canPush ? "YES ✅" : "not yet"}</p>
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
