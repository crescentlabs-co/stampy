/**
 * All HTML pages, server-rendered from template strings — no frontend build,
 * nothing for the founder to compile. Mobile-first (staff use their phones).
 */
import type { CafeConfig, SetupStatus } from "./config.js";

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

export function landingPage(cafe: CafeConfig, ready: boolean): string {
  return page(
    `${cafe.name} — Loyalty Card`,
    `<div class="card" style="text-align:center">
      <div style="font-size:3rem; margin-bottom:8px">☕️</div>
      <h1>${cafe.name}</h1>
      <p class="sub">Collect ${cafe.stampsTarget} stamps, get a ${cafe.reward.toLowerCase()}.<br>
      Your card lives in Apple Wallet — no app needed.</p>
      ${
        ready
          ? `<a class="btn btn-dark" href="/enroll">&#63743; Add to Apple Wallet</a>
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
    .toast {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #1d1d1f; color: #fff; padding: 10px 18px; border-radius: 999px;
      font-size: .9rem; opacity: 0; transition: opacity .25s; pointer-events: none;
    }
    .toast.show { opacity: 1; }
    input, textarea {
      width: 100%; padding: 12px; border: 1px solid #d9cbbb; border-radius: 10px;
      font-size: 1rem; font-family: inherit;
    }
    .ready { color: #1a7f37; font-weight: 700; }
  `;
  const js = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    let pin = localStorage.getItem("staffPin") || "";

    async function api(path, opts = {}) {
      const res = await fetch("/staff/api" + path, {
        ...opts,
        headers: { "Content-Type": "application/json", "x-staff-pin": pin, ...(opts.headers||{}) },
      });
      if (res.status === 401) { localStorage.removeItem("staffPin"); pin = ""; render(); throw new Error("pin"); }
      return res.json();
    }

    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2200);
    }

    let busy = false; // debounce: one tap = one stamp
    async function act(path, body, doneMsg) {
      if (busy) return; busy = true;
      try {
        const out = await api(path, { method: "POST", body: JSON.stringify(body) });
        if (out.error) toast("Error: " + out.error);
        else toast(doneMsg + (out.push.registeredDevices === 0
          ? " (card not opened on a phone yet — no push)"
          : out.push.sent > 0 ? " — pushed to phone ✓" : " — push failed ✗"));
        await load();
      } finally { busy = false; }
    }

    async function load() {
      const out = await api("/passes");
      const list = $("#list"); list.innerHTML = "";
      if (!out.passes.length) list.innerHTML = '<p class="muted" style="margin-top:16px">No cards yet — scan the counter QR with a phone to create the first one.</p>';
      for (const p of out.passes) {
        const div = document.createElement("div");
        div.className = "pass";
        div.innerHTML = \`
          <strong>Card \${p.shortId}</strong>
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
          try { await api("/passes"); localStorage.setItem("staffPin", pin); render(); }
          catch { toast("Wrong PIN"); }
        };
      } else {
        $("#app").innerHTML = \`
          <h1>Stamper</h1>
          <p class="sub">Newest cards first. Tap +1 when a customer orders.</p>
          <div id="list"></div>\`;
        load();
        clearInterval(window.__poll); window.__poll = setInterval(load, 10000);
      }
    }
    render();
  `;
  return page(
    "Stampy — Staff",
    `<div class="card" id="app"></div><div class="toast"></div>`,
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
      ${
        s.canSignPasses
          ? `<p style="margin-top:14px">Counter QR (print me): <a href="/qr">${baseUrl}/qr</a></p>
             <p>Staff page: <a href="/staff">${baseUrl}/staff</a></p>`
          : ""
      }
    </div>`,
  );
}
