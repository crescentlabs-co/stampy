import { DEFAULT_CARD_ID } from "../db.js";
import { MODAL_CSS, MODAL_JS, esc, page } from "./kit.js";

/**
 * Camera-first counter UI. Merchant data is passed only after the server has
 * verified the signed staff session; the signed-out page is just the access
 * code gate.
 */
export function staffPage(
  signedIn: boolean,
  cardId = DEFAULT_CARD_ID,
  merchantId = "",
  business = "",
): string {
  const css = /* css */ `
    body { display: block; padding: 0; align-items: stretch; background: var(--bg); }
    button, input { font-family: var(--body); }
    .scanner-shell { width: min(100%, 720px); min-height: 100vh; margin: 0 auto;
      display: flex; flex-direction: column;
      padding: calc(24px + env(safe-area-inset-top, 0px)) 20px
        calc(24px + env(safe-area-inset-bottom, 0px)); }
    .scanner-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .scanner-head h1 { font-size: 22px; line-height: 1.15; font-weight: 700; letter-spacing: -.025em; }
    .live-dot { display: inline-flex; align-items: center; gap: 7px; color: var(--muted);
      font-size: 12px; font-weight: 600; }
    .live-dot::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
    .camera { position: relative; width: 100%; aspect-ratio: 4 / 3; overflow: hidden;
      border-radius: 24px; background: var(--slab); color: var(--on-slab); }
    .camera video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .camera.waiting video { opacity: .18; }
    .camera-message { position: absolute; inset: 0; display: grid; place-content: center;
      justify-items: center; gap: 12px; padding: 24px; text-align: center; font-size: 12px; }
    .camera:not(.waiting) .camera-message { display: none; }
    .camera-message p { color: var(--on-slab); max-width: 32ch; }
    .camera-message .btn { width: auto; min-width: 150px; }
    .scan-frame { position: absolute; inset: 20%; pointer-events: none; }
    .scan-frame i { position: absolute; width: 42px; height: 42px; border-color: #fff; border-style: solid; }
    .scan-frame i:nth-child(1) { left: 0; top: 0; border-width: 4px 0 0 4px; border-radius: 14px 0 0; }
    .scan-frame i:nth-child(2) { right: 0; top: 0; border-width: 4px 4px 0 0; border-radius: 0 14px 0 0; }
    .scan-frame i:nth-child(3) { right: 0; bottom: 0; border-width: 0 4px 4px 0; border-radius: 0 0 14px; }
    .scan-frame i:nth-child(4) { left: 0; bottom: 0; border-width: 0 0 4px 4px; border-radius: 0 0 0 14px; }
    .instruction { margin: 14px 0; color: var(--muted); text-align: center; font-size: 12px; line-height: 1.45; }
    .search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .search-row input { min-width: 0; height: 52px; margin: 0; font-size: 16px; }
    .search-row .btn { width: auto; min-width: 76px; min-height: 52px; margin: 0; padding: 0 20px; font-size: 14px; }
    .search-results { display: grid; gap: 6px; margin-top: 8px; }
    .search-hit { min-height: 56px; width: 100%; padding: 10px 12px; text-align: left;
      background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 12px;
      cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; }
    .search-hit strong { font-size: 14px; font-weight: 700; }
    .search-hit span { color: var(--muted); font-size: 12px; }
    .empty-search { padding: 12px 2px; color: var(--muted); font-size: 12px; }
    .signup-link { display: block; width: max-content; max-width: 100%; margin: 18px auto 0;
      padding: 10px; border: 0; background: none; color: var(--ink); font-size: 12px;
      font-weight: 600; text-decoration: underline; cursor: pointer; }
    .home-prompt { margin-top: 14px; padding: 10px 12px; border: 1px solid var(--line);
      border-radius: 12px; display: flex; gap: 10px; align-items: center; font-size: 12px; }
    .home-prompt span { flex: 1; }
    .home-prompt button { border: 0; background: none; color: var(--ink); font: inherit;
      font-weight: 700; text-decoration: underline; cursor: pointer; padding: 7px 3px; }
    .home-prompt .dismiss { color: var(--muted); text-decoration: none; font-size: 18px; }
    .scanner-foot { margin-top: auto; padding-top: 34px;
      color: var(--muted); text-align: center; font-size: 12px; }
    .scanner-foot nav { display: flex; justify-content: center; flex-wrap: wrap; gap: 4px 16px; margin-top: 7px; }
    .link-btn { border: 0; background: none; color: var(--muted); padding: 8px 2px;
      font: inherit; text-decoration: underline; cursor: pointer; }
    .sheet-backdrop { position: fixed; inset: 0; z-index: 45; background: rgba(12,14,13,.5);
      display: grid; align-items: end; padding-top: 24px; }
    .sheet-backdrop[hidden] { display: none; }
    .action-sheet { width: min(100%, 720px); max-height: calc(100vh - 24px); overflow: auto;
      margin: 0 auto; padding: 22px 20px calc(22px + env(safe-area-inset-bottom, 0px));
      background: var(--bg); border-radius: 24px 24px 0 0; }
    .sheet-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .sheet-top h2 { font-size: 18px; line-height: 1.15; font-weight: 700; letter-spacing: -.02em; }
    .sheet-close { width: 48px; height: 48px; flex: none; margin: -10px -10px 0 0; border: 0;
      border-radius: 50%; background: var(--surface); color: var(--ink); font-size: 22px; cursor: pointer; }
    .customer-meta, .programme-meta { margin-top: 5px; color: var(--muted); font-size: 12px; }
    .progress-card { margin-top: 16px; padding: 16px; border-radius: 16px; background: var(--surface); }
    .progress-card strong { display: block; font-size: 18px; line-height: 1.2; }
    .progress-card span { color: var(--muted); font-size: 12px; }
    .action-stack { display: grid; gap: 8px; margin-top: 16px; }
    .action-stack .btn { min-height: 54px; margin: 0; font-size: 14px; }
    .reward-btn { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .spend-box { margin-top: 16px; }
    .spend-box label, .profile-form label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; }
    .money-row { position: relative; }
    .money-row span { position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      font-size: 14px; font-weight: 700; }
    .money-row input { padding-left: 43px; font-size: 16px; }
    .spend-preview { min-height: 20px; margin-top: 7px; color: var(--muted); font-size: 12px; }
    .profile-toggle { margin-top: 14px; }
    .profile-form { display: grid; gap: 10px; margin-top: 10px; padding: 14px;
      border: 1px solid var(--line); border-radius: 14px; }
    .profile-form input { font-size: 16px; }
    .consent-row { display: flex !important; gap: 9px; align-items: flex-start; font-weight: 400 !important;
      line-height: 1.4; }
    .consent-row input { width: 18px; height: 18px; min-height: 0; margin-top: 1px; flex: none; }
    .success-note { margin-top: 16px; padding: 14px; background: var(--accent-wash);
      border: 1px solid var(--accent); border-radius: 14px; font-size: 14px; font-weight: 700; }
    .simple-modal { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center;
      padding: 20px; background: rgba(12,14,13,.55); }
    .simple-modal[hidden] { display: none; }
    .simple-modal section { width: min(100%, 390px); max-height: 90vh; overflow: auto; padding: 22px;
      border-radius: 20px; background: var(--bg); box-shadow: var(--shadow); }
    .simple-modal h2 { font-size: 18px; font-weight: 700; }
    .simple-modal p, .simple-modal li { margin-top: 9px; font-size: 12px; line-height: 1.5; color: var(--muted); }
    .simple-modal ol { padding-left: 20px; }
    .simple-modal img { display: block; width: min(260px, 80vw); height: auto; margin: 16px auto; border-radius: 12px; }
    .login-wrap { width: min(100% - 32px, 430px); margin: 9vh auto 0; }
    .login-wrap h1 { font-size: 22px; font-weight: 700; }
    .login-wrap input { font-size: 16px; }
    .toast { z-index: 80; font-size: 14px; font-weight: 700; background: var(--accent); color: var(--on-accent); }
    ${MODAL_CSS}
    @media (min-width: 721px) {
      .sheet-backdrop { align-items: center; padding: 24px; }
      .action-sheet { border-radius: 24px; max-height: calc(100vh - 48px); }
    }
  `;

  const sharedJs = /* js */ `
    const $ = (s, el=document) => el.querySelector(s);
    const cardId = ${JSON.stringify(cardId)};
    async function api(path, opts = {}) {
      const res = await fetch("/staff/api" + path, {
        ...opts,
        headers: { "Content-Type": "application/json", "x-card-id": cardId, ...(opts.headers || {}) },
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401) { location.reload(); throw new Error("signed-out"); }
      out._status = res.status;
      return out;
    }
    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }
  `;

  const loginJs = /* js */ `
    async function signIn() {
      const pin = $("#pin").value.trim();
      if (!pin) return toast("Type the staff access code");
      const out = await api("/login", { method: "POST", body: JSON.stringify({ pin }) });
      if (out.ok) location.reload();
      else if (out.error === "too-many-attempts") toast("Too many tries — wait a few minutes");
      else toast("Wrong staff access code");
    }
    $("#go").onclick = signIn;
    $("#pin").onkeydown = (e) => { if (e.key === "Enter") signIn(); };
  `;

  const scannerJs = /* js */ `
    ${MODAL_JS}
    const escText = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);
    let stream = null, scanTimer = null, paused = false, resolving = false, lastScan = "";
    let current = null, completedAction = "", previewTimer = null;

    function typeName(kind) {
      return kind === "points" ? "Points" : kind === "membership" ? "Membership"
        : kind === "milestones" ? "Milestones" : "Stamps";
    }
    function progressText(p) {
      if (p.kind === "membership") return p.stamps + (p.stamps === 1 ? " recorded visit" : " recorded visits");
      if (p.kind === "points") return p.stamps + (p.stamps === 1 ? " point" : " points");
      return p.stamps + " of " + p.target + (p.total !== p.target ? " · " + p.total + " total" : "");
    }
    function nextCustomer() {
      current = null; completedAction = ""; paused = false; resolving = false; lastScan = "";
      $("#action").hidden = true; $("#search").value = ""; $("#results").innerHTML = "";
      $("#search").focus();
    }
    async function resolveCard(value) {
      const clean = String(value || "").trim().replace(/^Code\s+/i, "");
      if (!clean || resolving) return;
      resolving = true; paused = true; lastScan = clean;
      const out = await api("/resolve", { method: "POST", body: JSON.stringify({ value: clean }) });
      resolving = false;
      if (out.error) {
        toast(out.error === "no-such-card" ? "That card is not from this shop" : "Couldn’t read that card");
        setTimeout(() => { paused = false; lastScan = ""; }, 1200); return;
      }
      current = out; completedAction = ""; renderAction();
    }
    async function runAction(path, body, message) {
      if (!current || resolving) return;
      resolving = true;
      let out = await api(path, { method: "POST", body: JSON.stringify(body) });
      if (out.error === "too-soon") {
        const again = await modal("Record another visit?",
          "<p>This card was updated <strong>" + Number(out.secondsLeft || 0) +
            " seconds</strong> ago. Continue only for another purchase or visit.</p>", "Continue");
        if (again) out = await api(path, { method: "POST", body: JSON.stringify({ ...body, force: true }) });
      }
      resolving = false;
      if (out.error) { toast("Couldn’t complete that action"); return; }
      current = out; completedAction = message; renderAction();
    }
    function profileBlock(u) {
      if (u.profileComplete || current.test) return "";
      return '<div class="profile-toggle"><button class="link-btn" id="profileOpen">Add customer details</button>' +
        '<form class="profile-form" id="profileForm" hidden>' +
          '<div><label for="profileName">Customer name</label><input id="profileName" maxlength="80" autocomplete="name"></div>' +
          '<div><label for="profilePhone">Phone number</label><input id="profilePhone" maxlength="30" inputmode="tel" autocomplete="tel"></div>' +
          '<label class="consent-row"><input id="profileConsent" type="checkbox">' +
            '<span>The customer agrees to their name and phone number being saved for loyalty account lookup.</span></label>' +
          '<button class="btn btn-ghost" type="submit">Save details</button></form></div>';
    }
    function earningAction(p, c) {
      if (p.kind === "membership") return '<button class="btn btn-stamp" data-act="stamp">Record visit</button>';
      if (p.kind === "points" && c.earnMode === "spend") {
        return '<div class="spend-box"><label for="spend">How much did they spend?</label>' +
          '<div class="money-row"><span>RM</span><input id="spend" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal"></div>' +
          '<div class="spend-preview" id="spendPreview" aria-live="polite">Enter the till total.</div>' +
          '<button class="btn btn-stamp" id="spendConfirm" disabled>Confirm points</button></div>';
      }
      if (p.kind === "points") {
        const n = Number(c.earnPoints || 1);
        return '<button class="btn btn-stamp" data-act="stamp">Add ' + n + (n === 1 ? " point" : " points") + '</button>';
      }
      const n = Number(p.visitAmount || 1);
      return '<button class="btn btn-stamp" data-act="stamp">Add ' + n + (n === 1 ? " stamp" : " stamps") + '</button>';
    }
    function rewardActions(p) {
      if (p.kind === "points") return (p.canBuy || []).map((m, i) =>
        '<button class="btn reward-btn" data-reward="' + i + '">Give ' + escText(m.reward) +
          ' · ' + Number(m.at) + ' points</button>').join("");
      return p.rewardReady
        ? '<button class="btn reward-btn" data-act="redeem">Give ' + escText(p.reward || "reward") + '</button>' : "";
    }
    function renderAction() {
      if (!current) return;
      const p = current.pass, c = current.card, u = current.customer;
      const earn = p.kind !== "points" && p.rewardReady ? "" : earningAction(p, c);
      const action = completedAction
        ? '<div class="success-note">' + escText(completedAction) + ' · ' + escText(progressText(p)) + '</div>' +
          '<div class="action-stack"><button class="btn btn-stamp" id="next">Next customer</button>' +
          (p.stamps > 0 ? '<button class="btn btn-ghost" data-act="undo">Undo last action</button>' : "") + '</div>'
        : '<div class="action-stack">' + rewardActions(p) + earn + '</div>';
      $("#actionBody").innerHTML =
        '<div class="sheet-top"><div><h2>' + escText(u.name || "Customer") + '</h2>' +
          '<p class="customer-meta">' + escText([u.phoneMasked, "Card " + p.code].filter(Boolean).join(" · ")) + '</p>' +
          '<p class="programme-meta">' + escText(c.name) + ' · ' + typeName(p.kind) +
            (current.test ? " · Test card" : "") + '</p></div>' +
          '<button class="sheet-close" id="actionClose" aria-label="Close and scan next customer">×</button></div>' +
        '<div class="progress-card"><strong>' + escText(progressText(p)) + '</strong><span>' +
          escText(p.kind === "membership" ? (c.memberLabel || "Member") : p.reward || "Loyalty progress") + '</span></div>' +
        profileBlock(u) + action;
      $("#action").hidden = false; $("#actionClose").onclick = nextCustomer;
      if ($("#next")) $("#next").onclick = nextCustomer;
      if ($("#profileOpen")) $("#profileOpen").onclick = () => {
        $("#profileForm").hidden = false; $("#profileOpen").hidden = true; $("#profileName").focus();
      };
      if ($("#profileForm")) $("#profileForm").onsubmit = saveProfile;
      for (const b of $("#actionBody").querySelectorAll("[data-act]")) {
        b.onclick = () => {
          const actionName = b.getAttribute("data-act");
          if (actionName === "stamp") runAction("/stamp", { serial: p.serial },
            p.kind === "membership" ? "Visit recorded" : p.kind === "points" ? "Points added" : "Stamp added");
          if (actionName === "redeem") runAction("/redeem", { serial: p.serial },
            p.finalReward ? "Reward given — card restarted" : "Reward given — card carries on");
          if (actionName === "undo") runAction("/undo", { serial: p.serial }, "Last action undone");
        };
      }
      for (const b of $("#actionBody").querySelectorAll("[data-reward]")) {
        b.onclick = () => {
          const m = (p.canBuy || [])[Number(b.getAttribute("data-reward"))];
          if (m) runAction("/redeem", { serial: p.serial, at: m.at }, m.reward + " given");
        };
      }
      if ($("#spend")) { $("#spend").oninput = previewSpend; $("#spend").focus(); }
      const first = $("#actionBody .reward-btn, #actionBody .btn-stamp");
      if (first && !$("#spend")) first.focus();
    }
    async function previewSpend() {
      clearTimeout(previewTimer);
      const value = $("#spend").value; $("#spendConfirm").disabled = true;
      if (!value) { $("#spendPreview").textContent = "Enter the till total."; return; }
      previewTimer = setTimeout(async () => {
        const out = await api("/points-preview", {
          method: "POST", body: JSON.stringify({ serial: current.pass.serial, spend: value }),
        });
        if (out.error) { $("#spendPreview").textContent = "Enter a valid amount up to RM1,000,000."; return; }
        $("#spendPreview").textContent = "This visit earns " + out.points + (out.points === 1 ? " point." : " points.");
        $("#spendConfirm").disabled = false;
        $("#spendConfirm").onclick = () => runAction(
          "/stamp", { serial: current.pass.serial, spend: $("#spend").value }, "Points added");
      }, 180);
    }
    async function saveProfile(e) {
      e.preventDefault();
      const body = { serial: current.pass.serial, displayName: $("#profileName").value,
        phoneNumber: $("#profilePhone").value, consent: $("#profileConsent").checked ? "yes" : "" };
      const out = await api("/customer-profile", { method: "POST", body: JSON.stringify(body) });
      if (out.error) {
        toast(out.error === "consent-required" ? "Ask the customer to agree first" : "Check the name and phone number"); return;
      }
      current = out; toast("Customer details saved"); renderAction();
    }
    async function search() {
      const query = $("#search").value.trim();
      if (query.length < 2) return toast("Type at least 2 characters");
      const out = await api("/search", { method: "POST", body: JSON.stringify({ query }) });
      const host = $("#results"); host.innerHTML = "";
      if (out.error || !out.results || !out.results.length) {
        host.innerHTML = '<p class="empty-search">No matching card found.</p>'; return;
      }
      out.results.forEach((r) => {
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "search-hit";
        const name = document.createElement("strong"); name.textContent = r.name || "Customer";
        const code = document.createElement("strong"); code.textContent = r.code;
        const meta = document.createElement("span"); meta.textContent = [r.phoneMasked, r.cardName].filter(Boolean).join(" · ");
        const kind = document.createElement("span"); kind.textContent = typeName(r.kind);
        btn.append(name, code, meta, kind); btn.onclick = () => resolveCard(r.serial); host.appendChild(btn);
      });
    }
    async function onScanResult(text) {
      if (!text || paused || resolving || text === lastScan) return;
      await resolveCard(text);
    }
    async function startCamera() {
      clearInterval(scanTimer); scanTimer = null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      const camera = $("#camera"), retry = $("#cameraRetry"), status = $("#cameraStatus");
      camera.classList.add("waiting"); retry.hidden = true; status.textContent = "Starting camera…";
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const video = $("#cameraVideo"); video.srcObject = stream; await video.play(); camera.classList.remove("waiting");
        if ("BarcodeDetector" in window) {
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          scanTimer = setInterval(async () => {
            if (paused || resolving) return;
            try { const hits = await detector.detect(video); if (hits.length) onScanResult(hits[0].rawValue); } catch (_) {}
          }, 250);
        } else if (window.jsQR) {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          scanTimer = setInterval(() => {
            if (paused || resolving || !video.videoWidth) return;
            canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = jsQR(img.data, img.width, img.height); if (hit && hit.data) onScanResult(hit.data);
          }, 350);
        } else {
          camera.classList.add("waiting"); status.textContent = "Camera scanning isn’t supported here. Search still works.";
        }
      } catch (_) {
        camera.classList.add("waiting"); retry.hidden = false;
        status.textContent = "Camera access is off. Enable it, or use search below.";
      }
    }
    let modalReturnFocus = null;
    function openSimple(id) {
      modalReturnFocus = document.activeElement;
      $(id).hidden = false; $(id + " .modal-close").focus();
    }
    function closeSimple(id) {
      $(id).hidden = true;
      if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
      modalReturnFocus = null;
    }
    function rememberHome() {
      document.cookie = "punchme-scanner-home=done; Max-Age=31536000; Path=/staff; SameSite=Lax";
      $("#homePrompt").hidden = true;
    }
    function homePrompt() {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      if (standalone) { rememberHome(); return; }
      if (!document.cookie.includes("punchme-scanner-home=done")) $("#homePrompt").hidden = false;
    }

    $("#find").onclick = search;
    $("#search").onkeydown = (e) => { if (e.key === "Enter") search(); };
    $("#cameraRetry").onclick = startCamera;
    $("#showSignup").onclick = () => openSimple("#signupModal");
    $("#homeOpen").onclick = () => openSimple("#homeModal");
    $("#homePromptOpen").onclick = () => openSimple("#homeModal");
    $("#homeDismiss").onclick = rememberHome;
    for (const b of document.querySelectorAll(".modal-close")) {
      b.onclick = () => closeSimple("#" + b.closest(".simple-modal").id);
    }
    for (const backdrop of document.querySelectorAll(".simple-modal")) {
      backdrop.onclick = (e) => { if (e.target === backdrop) closeSimple("#" + backdrop.id); };
    }
    $("#action").onclick = (e) => { if (e.target === $("#action")) nextCustomer(); };
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const openModal = Array.from(document.querySelectorAll(".simple-modal")).find((m) => !m.hidden);
      if (openModal) closeSimple("#" + openModal.id);
      else if (!$("#action").hidden) nextCustomer();
    });
    $("#homeDone").onclick = () => { rememberHome(); closeSimple("#homeModal"); };
    $("#signout").onclick = async () => {
      const yes = await modal("Sign this phone out?", "<p>The staff access code will be needed here again.</p>", "Sign out");
      if (!yes) return; await api("/logout", { method: "POST" }); location.reload();
    };
    window.addEventListener("pagehide", () => {
      clearInterval(scanTimer); if (stream) stream.getTracks().forEach((track) => track.stop());
    });
    homePrompt(); startCamera();
  `;

  const login = `<main class="login-wrap"><div class="card" id="app">
      <h1>Scanner access</h1>
      <p class="sub">Enter the staff access code. This phone stays signed in for two weeks.</p>
      <label for="pin">Staff access code</label>
      <input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Access code">
      <button class="btn btn-dark" style="margin-top:12px" id="go">Open Scanner</button>
    </div></main>`;
  const scanner = `<main class="scanner-shell" id="app">
      <header class="scanner-head"><h1>Scanner</h1><span class="live-dot">Ready</span></header>
      <section class="camera waiting" id="camera" aria-label="QR code camera">
        <video id="cameraVideo" playsinline muted></video>
        <div class="scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="camera-message"><p id="cameraStatus">Starting camera…</p>
          <button class="btn btn-ghost" id="cameraRetry" hidden>Enable camera</button></div>
      </section>
      <p class="instruction">Aim at the QR code on the customer’s wallet card.</p>
      <div class="search-row"><input id="search" aria-label="Find customer or card"
        placeholder="Name, phone, or card code" autocomplete="off"><button class="btn btn-dark" id="find">Find</button></div>
      <div class="search-results" id="results" aria-live="polite"></div>
      <button class="signup-link" id="showSignup">New customer? Show sign-up QR</button>
      <div class="home-prompt" id="homePrompt" hidden><span>Add Scanner to your Home Screen for faster access.</span>
        <button id="homePromptOpen">Show me</button><button class="dismiss" id="homeDismiss" aria-label="Dismiss">×</button></div>
      <footer class="scanner-foot"><p>Scanner for ${esc(business)}</p><nav>
        <button class="link-btn" id="homeOpen">Add Scanner to Home Screen</button>
        <button class="link-btn" id="signout">Sign out</button></nav></footer>
    </main>
    <div class="sheet-backdrop" id="action" role="dialog" aria-modal="true" aria-label="Customer action" hidden>
      <section class="action-sheet" id="actionBody"></section></div>
    <div class="simple-modal" id="signupModal" role="dialog" aria-modal="true" aria-labelledby="signupTitle" hidden>
      <section><h2 id="signupTitle">New customer sign-up</h2>
        <img src="/j/${encodeURIComponent(merchantId)}/qr" alt="QR code to join ${esc(business)} loyalty">
        <p>Ask the customer to scan this code with their phone camera.</p>
        <button class="btn btn-dark modal-close" id="homeDone" style="margin-top:16px">Done</button></section></div>
    <div class="simple-modal" id="homeModal" role="dialog" aria-modal="true" aria-labelledby="homeTitle" hidden>
      <section><h2 id="homeTitle">Add Scanner to Home Screen</h2>
        <p><strong>iPhone:</strong></p><ol><li>Tap the Share button in Safari.</li><li>Scroll and tap Add to Home Screen.</li><li>Tap Add.</li></ol>
        <p><strong>Android:</strong></p><ol><li>Open the browser menu (three dots).</li><li>Tap Install app or Add to Home screen.</li><li>Confirm.</li></ol>
        <button class="btn btn-dark modal-close" style="margin-top:16px">Done</button></section></div>
    <script src="/staff/jsqr.js"></script>`;

  return page(
    "PunchMe — Scanner",
    `${signedIn ? scanner : login}<div class="toast"></div>
      <script>${sharedJs}${signedIn ? scannerJs : loginJs}</script>`,
    css,
  );
}
