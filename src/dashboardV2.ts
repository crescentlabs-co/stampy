/**
 * The owner dashboard — the whole of it, one document.
 *
 * Carved out of src/pages.ts, which held it alongside every other page and had
 * grown past 8,000 lines. Nothing about the screen changed in the move.
 *
 * src/pages.ts re-exports dashboardPage, so src/routes/dashboard.ts and the
 * test suites keep importing it from "../pages.js" exactly as before.
 * Dependencies point one way: pages.ts → dashboardV2.ts → ui/kit.ts.
 */
import { DASHBOARD_MOCK_CSS, MOCK_JS } from "./ui/dashboardV2Mock.js";
import {
  DESIGN_PANEL_CSS,
  DESIGN_PANEL_JS,
  HEALTH_JS,
  MODAL_CSS,
  MODAL_JS,
  page,
  PALETTE_JS,
  SEG_CSS,
  SEG_JS,
} from "./ui/kit.js";

/**
 * The owner dashboard. `canEmail` says whether transactional email is actually
 * configured — with no email service, offering to "send a reset link" would be
 * a lie, and the owner would sit waiting for mail that never arrives. The honest
 * alternative is rendered server-side so the wrong promise never reaches the page.
 */
export function dashboardPage(canEmail: boolean, contactEmail = "", allowSignup = false): string {
  // Strict allowlist: this value is an env var that ends up inside an inline
  // script, and a stray backtick or ${ would break the whole page.
  const contact = contactEmail.replace(/[^A-Za-z0-9._%+@-]/g, "");
  const resetBox = canEmail
    ? `<label>Your account email</label><input id="fmail" type="email"><button class="btn btn-ghost" style="margin-top:8px" id="fsend">Send reset link</button>`
    : `<p class="muted" style="margin:0">Password resets by email aren’t set up yet — ${
        contact
          ? `<a href="mailto:${contact}">email us at ${contact}</a>`
          : "message whoever set up your PunchMe account"
      } and we’ll set a new password for you.</p>`;
  const css = /* css */ `
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 0; }
    .metric { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
              padding: 16px 16px 13px; text-align: left; }
    .metric b { font-family: var(--display); font-weight: 800; font-size: 2rem; line-height: 1;
                display: block; letter-spacing: -.035em; font-variant-numeric: tabular-nums; color: var(--ink); }
    .metric span { display: block; margin-top: 6px; font-size: .78rem;
                   letter-spacing: .01em; color: var(--muted); }
    .card { border: 1px solid var(--line); border-radius: var(--r);
            padding: 16px; margin-top: 14px; }
    .links { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; font-size: .9rem; }
    ${DESIGN_PANEL_CSS}
    .account { border-top: 1px solid var(--line); margin-top: 30px; padding-top: 20px; }
    .card { max-width: 480px; }
    /* --- card dropdown selector --- */
    .cardselect { display: flex; gap: 8px; align-items: center; margin: 10px 0 6px; }
    .cardselect select { flex: 1; padding: 11px 12px; border: 1px solid var(--field-border); border-radius: 10px;
                         font: inherit; font-weight: 600; background: var(--surface); color: var(--ink); }
    .cardselect .btn { width: auto; padding: 11px 14px; font-size: .9rem; white-space: nowrap; }
    ${SEG_CSS}
    /* --- the app chrome ------------------------------------------------------
       A bar at the top that says whose shop this is, and a bar at the bottom
       that is the whole of the navigation. They replaced a neon block that held
       the shop name, the login email and a three-tab strip all at once.

       That block was DESIGN.md rule 1's third fenced exception, and it is gone,
       so the exception went with it — the rule is down to two. The one neon
       object on this screen is now the Create button in the bottom bar, which
       needs no exception at all: rule 1 has always allowed the accent on a
       primary action. Nothing else here takes it as a fill.

       The top bar is --slab. That is rule 2 applied as written — weight comes
       from the black panel, not from colour — and it is what the Components
       section always said a dashboard header should be. */
    /* The page is a 480px column, so both bars are that column's full width and
       break out of its 16px side padding. On a phone — which is what this is
       read on — that is edge to edge.

       Scoped to .shelled / .shell, which the script adds only once the chrome
       is mounted. The login form and the broken-page screen render into the
       same #app and have no bars — they keep the ordinary padded card, which is
       what they have always looked like. */
    body.shelled { padding: 0; }
    /* width:100% because body is a centred flex column — without it the column
       shrinks to whatever its widest child happens to be. */
    #app.shell { width: 100%; max-width: 480px; margin: 0 auto; padding: 0 16px;
                 border: 0; box-shadow: none; border-radius: 0; background: var(--bg); }
    .topbar { position: sticky; top: 0; z-index: 40; display: flex; align-items: center;
              gap: 10px; background: var(--slab); color: var(--on-slab);
              height: 56px; margin: 0 -16px; padding: 0 14px; }
    /* On a staging copy the "not the real site" strip is also stuck to the top,
       and it sits above everything by design. Start below it rather than under
       it. Live renders no strip, so this rule never matches there. */
    .envstrip ~ #app.shell .topbar { top: 31px; }
    .topbar img { width: 24px; height: 24px; border-radius: 6px; flex: none; }
    /* The shop name, centred. min-width:0 is what lets the ellipsis actually
       happen inside a flex row — without it a long name pushes the menu button
       off the end instead of truncating. */
    .topbar .shop { flex: 1; min-width: 0; text-align: center; font-family: var(--display);
                    font-weight: 800; font-size: .95rem; letter-spacing: -.01em;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar .dots { flex: none; width: 34px; height: 34px; border: 0; border-radius: 999px;
                    background: transparent; color: var(--on-slab); font-size: 1.25rem;
                    line-height: 1; cursor: pointer; padding: 0; }
    .topbar .dots:hover { background: rgba(244,246,242,.12); }
    /* Neon on dark, per rule 3 — an ink ring vanishes on --slab. */
    .topbar .dots:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    /* The menu. It carries the login email, which is the only thing left on
       screen answering "which account am I in?" once the header stopped saying
       so, and it matters the moment somebody runs two shops. */
    .tmenu { position: absolute; top: 50px; right: 8px; z-index: 41; min-width: 210px;
             background: var(--bg); color: var(--ink); border: 1px solid var(--line);
             border-radius: var(--r); box-shadow: var(--shadow); padding: 6px; }
    .tmenu .mwho { font-size: .76rem; color: var(--muted); padding: 8px 10px 6px;
                   word-break: break-all; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
    .tmenu button { width: 100%; text-align: left; background: transparent; border: 0;
                    font: inherit; font-weight: 600; color: var(--ink); padding: 11px 10px;
                    border-radius: 10px; cursor: pointer; }
    .tmenu button:hover { background: var(--surface); }

    /* The bottom bar. Fixed, because navigation that scrolls away is not
       navigation. --bg with a hairline rather than a fill: the screen above it
       is the content, and a solid bar would compete with it. */
    .botnav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
              width: 100%; max-width: 480px; z-index: 40;
              display: flex; align-items: flex-end; justify-content: center;
              background: var(--bg); border-top: 1px solid var(--line);
              padding-bottom: env(safe-area-inset-bottom, 0px); }
    .botnav a { flex: 1; max-width: 96px; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 3px;
                min-height: 56px; text-decoration: none; color: var(--muted);
                font-size: .62rem; font-weight: 600; letter-spacing: .05em; padding: 6px 0 8px; }
    .botnav a svg { width: 20px; height: 20px; fill: none; stroke: currentColor;
                    stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    /* Active is marked by WEIGHT and ink, never by a fill. Three nav controls
       share this screen — this bar, Manage's tab pill and the designer's
       preview switch — and DESIGN.md's rule is that they differ by shape, so
       only one of them may be a filled pill. */
    .botnav a.on { color: var(--ink); font-weight: 800; }
    .botnav a.on svg { stroke-width: 2.4; }
    .botnav a:focus-visible { outline: 2px solid var(--ink); outline-offset: -4px; border-radius: 10px; }
    /* The one neon object on the dashboard: the primary action, raised out of
       the bar so it reads as a button rather than a fifth tab. Its glyph is
       --on-accent (near-black) and never white — #c9f73d is a pale green, and
       white on it is about 1.3:1. */
    .botnav .navadd { max-width: 72px; }
    .botnav .navadd .plus { width: 44px; height: 44px; border-radius: 999px;
                            background: var(--accent); color: var(--on-accent);
                            display: flex; align-items: center; justify-content: center;
                            margin-top: -14px; box-shadow: 0 6px 16px -6px rgba(12,14,13,.4); }
    .botnav .navadd .plus svg { width: 22px; height: 22px; stroke: var(--on-accent); stroke-width: 2.6; }
    .botnav .navadd.on .plus { background: var(--accent-2); }

    /* The nav floats over the page, so the page has to end above it. */
    body.shelled { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 20px); }
    /* And so does the toast. baseCss pins it 24px from the bottom, which put
       every confirmation on this screen UNDERNEATH the new bar. Lifted here
       rather than in baseCss: the stamper and the console read that too, and
       neither of them has a bottom bar. */
    body.shelled .toast { bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }

    /* --- Home: one row per programme, and one line about the numbers --- */
    .prow { display: block; text-decoration: none; color: var(--ink);
            border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px;
            margin-bottom: 8px; background: var(--surface); }
    .prow:hover { border-color: var(--accent); }
    .ptop { display: flex; align-items: center; gap: 8px; }
    .ptop strong { font-size: 1rem; }
    /* Status sits at the far end, so the eye finds it in the same place on
       every row however long the name is. */
    .pstat { margin-left: auto; font-size: .7rem; font-weight: 700; letter-spacing: .05em;
             text-transform: uppercase; color: #15803d; background: #e9f7ee;
             border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
    /* Ended is not a failure and is not red: the programme did its job and
       stopped taking new sign-ups. Grey, like any other finished thing. */
    .pstat.off { color: var(--muted); background: var(--ghost-bg); }
    .pmeta { color: var(--muted); font-size: .82rem; margin-top: 3px; }
    .pnums { display: flex; gap: 18px; margin-top: 10px; }
    .pnums span { font-size: .72rem; color: var(--muted); }
    .pnums b { display: block; font-family: var(--display); font-weight: 800; font-size: 1.15rem;
               line-height: 1.1; letter-spacing: -.02em; font-variant-numeric: tabular-nums;
               color: var(--ink); }
    /* The one interpretive line on the page. Bordered rather than filled: it is
       a note about the numbers above it, not a fifth number. */
    .insight { border-left: 3px solid var(--ink); background: var(--surface);
               border-radius: 0 12px 12px 0; padding: 12px 14px; margin: 14px 0 4px; }
    .insight p { margin: 0; font-size: .88rem; line-height: 1.5; }
    /* --- Customers: search, segment chips, and one row per person --- */
    .cfilter { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 8px; }
    .cfilter input[type="search"] { flex: 1; min-width: 160px; margin: 0; }
    .cfilter select { padding: 13px 12px; border: 1px solid var(--field-border); border-radius: 12px;
                      font: inherit; background: var(--bg); color: var(--ink); }
    /* Segment filters. Ink when chosen, never neon — the neon on this screen
       belongs to the next action, and a filter is not one. */
    .segchip { width: auto; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--field-border);
               background: var(--bg); color: var(--muted); font: inherit; font-size: .8rem;
               font-weight: 600; cursor: pointer; }
    .segchip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    /* A person, as a row you can open. Four columns that line up down the list
       so the eye reads a column rather than re-reading each row. */
    .ccard { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink);
             border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;
             margin-bottom: 6px; background: var(--surface); }
    .ccard:hover { border-color: var(--accent); }
    .ccard .cid { font-weight: 800; letter-spacing: .04em; font-family: var(--display); }
    .ccard .cprog { margin-left: auto; color: var(--muted); font-size: .85rem;
                    font-variant-numeric: tabular-nums; }
    .ccard .cwhen { color: var(--muted); font-size: .78rem; white-space: nowrap; }
    /* The segment, in the same four hues the tiles above use — read those, do
       not pick a fifth (DESIGN.md rule 6). */
    .cseg { font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
            color: var(--hue); background: var(--hue-bg); border-radius: 999px; padding: 3px 8px;
            white-space: nowrap; }
    h2 .cseg { margin-left: 8px; position: relative; top: -3px; }
    /* --- one customer: a label and its answer, per line --- */
    .drow { display: flex; align-items: baseline; gap: 12px; padding: 11px 0;
            border-bottom: 1px solid var(--line); font-size: .9rem; }
    .drow span { color: var(--muted); }
    .drow b { margin-left: auto; text-align: right; }
    /* --- today at the counter --- */
    .acts { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .act { display: flex; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line);
           font-size: .88rem; }
    .act:last-child { border-bottom: 0; }
    .act .at { color: var(--muted); font-variant-numeric: tabular-nums; min-width: 62px; }
    .act .aw strong { letter-spacing: .04em; }
    textarea { width: 100%; padding: 13px 14px; border: 1px solid var(--field-border);
               border-radius: 12px; font: inherit; resize: vertical; }
    .segwrap { margin: 8px 0 4px; }
    .segwrap .lbl { font-size: .8rem; color: var(--muted); margin-bottom: 6px; }
    /* --- share tab --- */
    .sharelist { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 16px; }
    .sharelist a { display: flex; justify-content: space-between; align-items: center; gap: 8px;
                   border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; text-decoration: none;
                   color: var(--ink); font-weight: 600; }
    .sharelist a:hover { border-color: var(--accent); }
    /* Block, not inline: on a phone the description otherwise wrapped between
       the title and the "open →" and the row read as three broken fragments. */
    .sharelist a .sub2 { display: block; font-weight: 400; color: var(--muted); font-size: .82rem; margin-top: 2px; }
    .sharelist a .arr { white-space: nowrap; }
    .sharelist a .arr { color: var(--muted); }
    .sharelist { margin-bottom: 6px; }
    /* --- home: totals + per-card breakdown --- */
    /* Always four tiles, always 2×2 — a square hero card, not a row that
       stretches to four-across once a wider viewport allows it. Tracked spend
       stays IN the grid even with nothing to show yet (an em dash, not a
       missing tile): a metric that vanishes when it has no answer reads as
       broken, not as "not set up yet". */
    .totals { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 14px 0; }
    .totals .metric { padding: 16px 14px 13px; }
    .totals .metric b { font-size: clamp(1.4rem, 6.5vw, 2rem); }
    /* Customer health: four more tiles under the four above, and the SAME size.
       They were smaller, on the theory that the shape of the base should read
       quieter than its size; on screen it just looked like two grids that had
       not been designed together. Colour is what separates them now. */
    .totals.health { margin-top: 6px; }
    .totals.health .metric { background: var(--hue-bg);
                             border-color: transparent; border-left: 3px solid var(--hue); }
    .totals.health .metric b { color: var(--hue); }
    /* The share of the base, beside the count and deliberately smaller: the
       count is the fact, the percentage is how to read it. Tabular so four
       tiles line up down the column instead of shuffling by digit width. */
    .totals.health .metric b i { font-style: normal; font-size: .48em; font-weight: 700;
                                 letter-spacing: 0; margin-left: 6px; opacity: .72; }
    .totals.health .metric span { color: var(--ink2); font-weight: 600; }
    /* Semantic colour, rule 6 of DESIGN.md, plus the one blue this app has:
       these four are read against each other at a glance, and the hue does the
       sorting the eye would otherwise have to do by reading every label. */
    .h-regular   { --hue: #15803d; --hue-bg: #e9f7ee; }
    .h-returning { --hue: #1d4ed8; --hue-bg: #e9eefb; }
    .h-new       { --hue: #b45309; --hue-bg: #fdf4e3; }
    .h-lost      { --hue: #9a3412; --hue-bg: #fbedeb; }
    .breakdown { width: 100%; border-collapse: collapse; font-size: .9rem; margin-top: 6px; }
    .breakdown th { text-align: left; color: var(--muted); font-size: .78rem; letter-spacing: .01em; padding: 8px 10px; border-bottom: 1px solid var(--line); }
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
    /* --- customers view: one collapsible section per recency group --- */
    .custctl { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
    .custctl > div { flex: 1; min-width: 130px; }
    .grp { border: 1px solid var(--line); border-radius: 14px; padding: 4px 14px 14px; margin-bottom: 10px; background: var(--surface); }
    .grp summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; cursor: pointer;
                   padding: 12px 0; font-weight: 700; list-style: none; }
    .grp summary::-webkit-details-marker { display: none; }
    .grp summary::before { content: "▸"; color: var(--muted); font-weight: 400; transition: transform .18s; }
    .grp[open] summary::before { transform: rotate(90deg); }
    .grp .gc { background: var(--bg); box-shadow: inset 0 0 0 1px var(--line); border-radius: 999px;
               padding: 2px 10px; font-size: .8rem; font-variant-numeric: tabular-nums; }
    .grp .gh { color: var(--muted); font-weight: 400; font-size: .8rem; }
    .grp .gnudge { width: auto; padding: 8px 14px; font-size: .85rem; margin-bottom: 4px; }
    /* Rows sit inside a group box already, so they're separated by a rule rather
       than being a second card-in-a-card. */
    .crow { padding: 12px 0; border-top: 1px solid var(--line); }
    .ctop { display: flex; align-items: center; gap: 8px; }
    .ctop strong { font-size: 1rem; letter-spacing: .04em; }
    .cprog { flex: 1; color: var(--muted); font-size: .85rem; font-variant-numeric: tabular-nums; }
    .cn { width: auto; padding: 7px 14px; font-size: .82rem; }
    .cmeta { color: var(--muted); font-size: .8rem; margin-top: 3px; }
    .warn { color: #9a3412; font-weight: 600; }
    /* "Your counter can't stamp yet." Its own class, not .warn: that one is a
       colour applied to a word inside a row, and giving it a box here would put
       a box round every one of them. Amber rather than red — nothing is broken,
       a step is outstanding — and the button is ghost, because the neon one on
       the page belongs to whatever the owner came here to do (DESIGN.md 1). */
    /* The gap between the top bar and whatever screen is under it. The banner
       takes it when there is one, so the two never stack their margins. */
    #pinwarn:not(:empty), #screen { margin-top: 22px; }
    #pinwarn:not(:empty) + #screen { margin-top: 0; }
    .pinwarn { display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
               background: #fef3c7; color: #7c2d12; border: 1px solid #fcd34d;
               border-radius: 14px; padding: 12px 14px; margin-bottom: 14px;
               font-size: .88rem; line-height: 1.45; }
    .pinwarn p { margin: 0; flex: 1; min-width: 200px; }
    .pinwarn .btn { width: auto; padding: 8px 14px; font-size: .82rem; flex: none;
                    background: #fff; border-color: #d9a441; color: #7c2d12; }
    /* --- Customers: one standalone row per lapse cohort (not a collapsible) --- */
    .bucket { border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px;
              margin-bottom: 8px; background: var(--surface); }
    .bucket .cprog { text-align: right; padding-right: 6px; }
    .bucket .cn:disabled { opacity: .4; }
    /* --- a value shown exactly once (a new PIN) --- */
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: 10px 12px;
            border-radius: 10px; margin-top: 10px; font-size: .85rem; line-height: 1.5; }
    /* --- Card tab: Design / Rules section headings --- */
    .sec { font-size: 1.1rem; margin: 28px 0 2px; padding-top: 20px; border-top: 1px solid var(--line); }
    /* --- counter activity: facts, and nothing that looks like a verdict --- */
    /* Deliberately has no state styling at all. There is no red, no bold-on-
       threshold, no chip: the moment one number can look different from
       another, the screen starts telling the owner what to think, which is the
       one thing it must not do. One weight, one colour, every row. */
    /* Two rows of three, not six lines. Every cell is the same size and the
       same weight whatever its number says — the moment one can look louder
       than another, the screen starts having an opinion. */
    .cact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 4px 0 2px;
            background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    /* White cells, because the grid opens inside a tinted fold and --surface on
       --surface left six invisible boxes. The 1px gaps ARE the --line grid
       showing through, so the cells have to be a colour that differs from it. */
    .cact .ccell { background: var(--bg); border: none; font: inherit; color: var(--ink);
                   text-align: left; padding: 11px 12px; min-width: 0; }
    .cact button.ccell { cursor: pointer; }
    .cact button.ccell:hover { background: var(--surface); }
    /* Display 800, tabular — the same treatment as the hero metrics, because
       these are metrics. Every cell gets it equally: the weight says "this is a
       number", never "this number is the interesting one". */
    .cact .cn { display: block; font-family: var(--display); font-weight: 800; font-size: 1.5rem;
                line-height: 1.1; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
    .cact .cl { display: block; margin-top: 3px; font-size: .72rem; color: var(--muted); line-height: 1.3; }
    .cact .cgo { color: var(--muted); font-size: .72rem; }
    .clist { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .clist th { text-align: left; color: var(--muted); font-size: .7rem; text-transform: uppercase;
                letter-spacing: .06em; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); }
    .clist td { padding: 9px 8px 9px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
    .clist td.mono { font-family: ui-monospace, Menlo, monospace; font-size: .82rem; }
    .sec.first { margin-top: 4px; padding-top: 0; border-top: none; }
    /* Design is a set-it-once job, so it folds away (.fold lives in
       DESIGN_PANEL_CSS, with the panel that emits it). Rules — the reward, the
       stamp count, the win-back — is what owners come back to, and stays open. */
    /* --- show-password toggle --- */
    .eye { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); margin: 8px 0 0; }
    .eye input { width: auto; }
    ${MODAL_CSS}
    ${DASHBOARD_MOCK_CSS}
  `;
  const js = /* js */ `
    ${PALETTE_JS}
    ${MODAL_JS}
    const $ = (s, el=document) => el.querySelector(s);
    // Decided by the server from whether an email service is configured.
    const RESET_BY_EMAIL = ${canEmail ? "true" : "false"};
    // Shops are built for merchants and handed over with a claim link, so there
    // is nothing to sign up FOR here. Offering the form would only produce
    // empty shops nobody asked for.
    const ALLOW_SIGNUP = ${allowSignup ? "true" : "false"};
    const RESET_BOX = ${JSON.stringify(resetBox)};
    // Never rejects. A dropped connection used to throw out of whichever click
    // handler called this, unnoticed — no toast, a button that looked dead. It
    // reports status 0 instead, which every caller already treats as "not ok".
    async function api(path, opts = {}) {
      let res;
      try {
        res = await fetch("/dashboard/api" + path, {
          ...opts, headers: { "Content-Type": "application/json", ...(opts.headers||{}) },
        });
      } catch (e) {
        return { status: 0, body: { error: "network" } };
      }
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }
    function toast(msg) {
      const t = $(".toast"); t.textContent = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2600);
    }
    // Escaping for the handful of screens built by string concatenation rather
    // than a template literal. Same helper as the admin console's.
    const esc = (s) => String(s == null ? "" : s)
      .replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

    // Reveal/hide password fields via a "Show" checkbox (data-eye = their
    // selector). querySelectorAll, not querySelector: one checkbox drives every
    // field it names, so changing a password is one box for both instead of two
    // that do the same job on adjacent lines.
    function wireEyes(root) {
      root.querySelectorAll("[data-eye]").forEach((cb) => {
        cb.onchange = () => {
          root.querySelectorAll(cb.dataset.eye).forEach((i) => { i.type = cb.checked ? "text" : "password"; });
        };
      });
    }

    // The two-tap arm() helper used to live here for "Generate a new PIN". That
    // button is gone — an owner types their own PIN now — and it was the only
    // thing on this page that used it, so the helper went with it. The stamper
    // and the admin console each keep their own copy; both are still used.

    /**
     * Drop the app chrome's layout. authForm() and deadEnd() each replace the
     * whole of #app with a screen that has no bars, and the shell's layout —
     * no padding, no card, room reserved at the bottom for a nav — leaves those
     * two screens flush against the edge of the phone with a gap under them.
     */
    function unshell() {
      document.body.classList.remove("shelled");
      $("#app").classList.remove("shell");
    }

    function authForm(mode) {
      unshell();
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
        \${mode === "signup" ? '<label class="eye" style="margin-top:12px"><input type="checkbox" id="agree"> I agree to the <a href="/terms" target="_blank">Terms</a>&nbsp;&amp;&nbsp;<a href="/privacy" target="_blank">Privacy Policy</a></label>' : ""}
        <button class="btn btn-dark" style="margin-top:14px" id="go"\${mode === "signup" ? " disabled" : ""}>\${mode === "signup" ? "Create account" : "Log in"}</button>
        \${mode === "login" ? '<p class="muted" style="margin-top:12px;text-align:center"><a href="#" id="forgot">Forgot password?</a></p><div id="forgotbox" style="display:none">' + RESET_BOX + '</div>' : ""}
        \${ALLOW_SIGNUP
          ? '<p class="muted" style="margin-top:14px;text-align:center">' + (mode === "signup"
              ? 'Already have an account? <a href="#" id="switch">Log in</a>'
              : 'New here? <a href="#" id="switch">Create an account</a>') + "</p>"
          : ""}\`;
      wireEyes(document);
      const sw = $("#switch");
      if (sw) sw.onclick = (e) => { e.preventDefault(); authForm(mode === "signup" ? "login" : "signup"); };
      if (mode === "signup") {
        // Consent gates account creation.
        const ag = $("#agree");
        ag.onchange = () => { $("#go").disabled = !ag.checked; };
      }
      if (mode === "login") {
        $("#forgot").onclick = (e) => { e.preventDefault(); const b = $("#forgotbox"); b.style.display = b.style.display === "none" ? "block" : "none"; };
        // Without an email service there is no form to wire — the box just
        // explains how to actually get a reset.
        if (RESET_BY_EMAIL) $("#fsend").onclick = async () => {
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
        else if (status === 429) toast("Too many attempts — try again in " + (body.retryAfterSeconds || 60) + "s.");
        else if (status === 0) toast("Couldn't reach PunchMe — check your connection.");
        else if (body.error === "account-closed") toast("This account is closed — message whoever set your PunchMe up.");
        else toast(body.error === "email-taken" ? "That email already has an account — log in instead."
                 : body.error || ("Failed (" + status + ")"));
      };
    }

    // Curated palettes so a new card looks good without fiddling. [bg, text, label]

    // The card editor: DESIGN (what it looks like) and RULES (how it behaves) as
    // two sections with their own Save, because they're two different jobs — the
    // old single panel mixed a colour picker with the staff PIN behind one button.
    ${DESIGN_PANEL_JS}
    ${HEALTH_JS}
    ${MOCK_JS}

    /**
     * Customer health: the shape of the base, not its size.
     *
     * The four tiles above say how many customers and how many stamps. These
     * four say whether the same people keep coming back, which is the question
     * a shop actually lives or dies on. Every customer is in exactly one, so
     * the four ALWAYS add up to the customers tile — checkable by eye, which is
     * the only reason a number like this can be trusted.
     *
     * The groups are computed server-side (HEALTH / healthOf) against the
     * shop's own expected return cycle, so a cafe and a barber both get an
     * honest answer without either of them tuning anything.
     */
    // ---- Notifications: one message, one button, one line saying who gets it ----
    // This was three cohort rows, a card dropdown and two paragraphs explaining
    // the limit. All of it said what one sentence under the button says, and the
    // limit was never enforced here anyway — canNudge (src/winback.ts) decides,
    // server-side, and reports back what actually went out. The groups came from
    // that same rule, so the subtitle can't disagree with the button either.
    /**
     * PARKED, not deleted. Both folds below are built and working; neither is
     * on screen while these are false.
     *
     * "Today's Activity" answers a question no owner has asked yet — it was
     * hard to tell what it was FOR — and "Find a customer" assumes a shop wants
     * to look someone up, which no one has needed. Rather than guess, they wait
     * for feedback from real shops. Flip either to true to bring it straight
     * back; the markup, the loaders and the drill-down sheets are all still
     * here, and test/pages.test.ts asserts that they are.
     */
    const SHOW_COUNTER_FOLD = false;
    const SHOW_FIND_FOLD = false;

    function customersPanel() {
      const div = document.createElement("div");
      div.innerHTML = \`
        <!-- No hint here on purpose. The two lines under the send button already
             say who this reaches and who it does not, in this shop's own
             numbers; a bubble restating the rule in words was one more thing to
             open and one more place for the cap to be written down wrongly. -->
        <h2 class="sec">Notifications</h2>
        <!-- Who first, then what. Choosing the audience changes what the line
             under the button says, so the count is always about the people
             actually being messaged. -->
        <label>Send to</label>
        <select data-audience></select>
        <label style="margin-top:12px">Message</label>
        <!-- Button UNDER the field, not beside it. Side by side, "Push
             notification" ate most of a phone's width and left the message —
             the thing being written — in a sliver. -->
        <input data-msg maxlength="200">
        <button class="btn btn-dark" style="margin-top:10px" data-send>Push notification</button>
        <p class="muted" style="margin-top:6px" data-who></p>
        <!-- Both parked behind the flags above. Folded, ahead of the customer
             search: it is what an owner checks first, and it must not push the
             message box off the screen — loaded only when opened. -->
        \${SHOW_COUNTER_FOLD ? \`
        <details class="grp" style="margin-top:22px" data-counter>
          <summary><span class="gt">Today's Activity</span>\${info("What happened at your counter today. Nobody is named — everyone shares one PIN. Tap a number for the times.")}<span class="gh" data-clast></span></summary>
          <div data-cbody style="margin-top:10px"></div>
        </details>\` : ""}
        \${SHOW_FIND_FOLD ? \`
        <details class="grp" style="margin-top:20px" data-find>
          <summary><span class="gt">Find a customer</span></summary>
          <input data-search placeholder="🔍 Card code" autocomplete="off" style="text-transform:uppercase;margin-top:10px">
          <div data-results style="margin-top:10px"></div>
        </details>\` : ""}\`;
      const q = (s) => div.querySelector(s);
      let all = [], ready = 0, everyone = 0, health = [], readyAll = 0;

      /**
       * Who the chosen audience IS, and how many of them this will reach.
       *
       * The dropdown names the group's real size — nine customers is nine
       * customers — and this line accounts for the gap between that and the
       * number the button will actually send. Showing only the sendable figure
       * made a group of nine read as five with no explanation, which looks like
       * customers going missing rather than a limit doing its job.
       *
       * The server filters again on the way out regardless: this is the honest
       * preview of that, never a substitute for it.
       */
      function paintAudience() {
        const sel = q("[data-audience]");
        const key = sel.value || "ready";
        const group = health.find((h) => h.key === key);
        ready = group ? group.eligible : readyAll;
        const total = group ? group.customers : everyone;
        // EVERYBODY the message will not reach, described as the weekly limit.
        // Some of them deleted the card instead, and the server knows exactly
        // which — see health[].removed — but that is a number an owner can do
        // nothing about and reads as a scoreline against themselves. One reason
        // on screen, both counted behind it, and the two lines always add up to
        // the number in the dropdown.
        const held = Math.max(0, total - ready);
        const lines = [];
        lines.push(ready
          ? "Will be sent to <strong>" + ready + "</strong> of " + total +
            (total === 1 ? " customer" : " customers")
          : "Nobody to message in this group right now");
        if (held) lines.push(held + (held === 1 ? " is" : " are") + " at the weekly limit");
        q("[data-who]").innerHTML = lines.join("<br>");
        q("[data-send]").disabled = !ready;
      }

      // ---- At the counter ---------------------------------------------------
      // Every cell is a count, and tapping one shows the times behind it. The
      // times ARE the answer: a count says something happened, the clock says
      // when, and "when" is the only thing an owner away from the shop can
      // actually judge. Nothing here computes a rate, compares two numbers, or
      // styles one differently from another — the owner knows their own shop.
      const hhmmss = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
      const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const dayOf = (d) => new Date(d).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
      // The sheet is titled with the same words as the cell that opened it, so
      // there is never a moment of wondering whether you tapped the right one.
      const named = { stamp: "Stamps given", undo: "Stamps taken back", redeem: "Rewards given" };

      // Loaded when the fold is first opened, not with the tab: this is a
      // second request and the message box above must never wait on it.
      const cfold = q("[data-counter]");
      let counterLoaded = false;
      if (cfold) cfold.addEventListener("toggle", async () => {
        if (!cfold.open || counterLoaded) return;
        counterLoaded = true;
        const { body } = await api("/counter");
        if (!body.ok) { counterLoaded = false; return; }
        const k = body.counter;

        // The last stamp is deliberately NOT limited to today — on a quiet day
        // it is the most useful fact there is. Which means it carries its date
        // when it isn't today, or "4:12pm" reads as this afternoon when it was
        // Tuesday. It sits on the closed fold, so it costs no row.
        if (k.lastStampAt) {
          const d = new Date(k.lastStampAt), now = new Date();
          const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
            && d.getDate() === now.getDate();
          q("[data-clast]").textContent = "last stamp " +
            (sameDay ? hhmm(k.lastStampAt) : dayOf(k.lastStampAt) + ", " + hhmm(k.lastStampAt));
        } else {
          q("[data-clast]").textContent = "nothing stamped yet";
        }

        // A cell is a button only when there is something behind it to open.
        const cell = (label, n, key) => {
          const inner = '<span class="cn">' + n + '</span><span class="cl">' + label +
            (key && n > 0 ? ' <span class="cgo">›</span>' : "") + "</span>";
          return key && n > 0
            ? '<button type="button" class="ccell" data-open="' + key + '">' + inner + "</button>"
            : '<div class="ccell">' + inner + "</div>";
        };
        q("[data-cbody]").innerHTML =
          '<div class="cact">' +
            cell("Stamps given", k.stamps, "stamps") +
            cell("Customers stamped", k.customers) +
            cell("Rewards given", k.rewards, "rewards") +
            // The literal event: staff confirmed a second stamp on the same card
            // inside a minute. Named for what happened, because there are plenty
            // of ordinary reasons for it — a paper card being transferred, most
            // obviously.
            cell("Stamped again within a minute", k.stampedAgain, "bursts") +
            cell("Stamps taken back", k.takenBack, "undos") +
            cell("Phones that stamped", k.phones, "devices") +
          "</div>";

        const list = (rows, head, cells) =>
          rows.length
            ? '<table class="clist"><tr>' + head.map((h) => "<th>" + h + "</th>").join("") + "</tr>" +
              rows.map((r) => "<tr>" + cells(r).map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") +
              "</table>"
            : "<p>Nothing today.</p>";

        q("[data-cbody]").querySelectorAll("[data-open]").forEach((b) => {
          b.onclick = () => {
            const kind = b.dataset.open;
            if (kind === "bursts") {
              return sheet("Stamped again within a minute",
                list(k.bursts, ["Time", "Stamps", "Over", "Card"], (r) =>
                  [hhmmss(r.at), r.stamps, r.seconds + "s", '<span class="mono">' + (r.code || "—") + "</span>"]) +
                // Otherwise "4 stamps over 66s" under a heading that says "within
                // a minute" reads as a contradiction. The minute is the gap
                // between stamps, not the length of the whole run.
                '<p class="muted" style="margin-top:12px;font-size:.82rem">Each stamp landed under a ' +
                "minute after the one before it, so a run of several can span longer than that.</p>");
            }
            if (kind === "devices") {
              return sheet("Phones that stamped",
                list(k.devices, ["Phone", "First seen", "Last seen", "Stamps"], (r) =>
                  ['<span class="mono">' + r.device_id.slice(0, 6) + "</span>",
                   dayOf(r.first_seen), dayOf(r.last_seen), r.stamps]) +
                // Both of these would mislead if left unsaid, and neither is a
                // judgement — they are how the list is built.
                '<p class="muted" style="margin-top:12px;font-size:.82rem">Phones that have stamped in ' +
                "the last 14 days, not phones signed in. A phone whose browser data is cleared comes " +
                "back as a new one here. To sign every phone out, reset the staff PIN under Shop.</p>");
            }
            const want = kind === "stamps" ? "stamp" : kind === "rewards" ? "redeem" : "undo";
            sheet(named[want],
              list(k.events.filter((e) => e.type === want), ["Time", "Card"], (r) =>
                [hhmmss(r.at), '<span class="mono">' + (r.code || "—") + "</span>"]));
          };
        });
      });

      /** Send. The confirm and the POST live in confirmAndSend, which a
       *  customer's own page uses too — one place deciding what an owner reads
       *  before a message reaches a real phone. Reloads afterwards, because who
       *  is still inside the weekly limit has just changed. */
      async function confirmSend(count, payload) {
        if (await confirmAndSend(count, payload, q("[data-msg]").value.trim())) load();
      }

      // Code and progress on one line, the story underneath.
      function row(x) {
        const el = document.createElement("div"); el.className = "crow";
        const seen = x.lastDays === 0 ? "in today" : x.lastDays + " days ago";
        const why = x.blocked === "rate-limited" ? "messaged in the last 7 days"
          : x.blocked === "removed" ? "deleted the card" : "";
        el.innerHTML = \`
          <div class="ctop">
            <strong>\${x.code}</strong>
            <span class="cprog">\${x.stamps}/\${x.target}</span>
            \${x.canNudge ? '<button class="btn btn-ghost cn" data-n>Message</button>' : ""}
          </div>
          <div class="cmeta">last \${seen}\${why ? ' · <span class="warn">' + why + "</span>" : ""}</div>\`;
        const btn = el.querySelector("[data-n]");
        if (btn) btn.onclick = () => confirmSend(1, { target: [x.serial] });
        return el;
      }

      // Hidden until they type: the list is a lookup tool, not a view.
      function renderResults() {
        const box = q("[data-search]");
        if (!box) return; // parked — see SHOW_FIND_FOLD
        const search = (box.value || "").trim().toUpperCase();
        const host = q("[data-results]"); host.innerHTML = "";
        if (!search) return;
        const shown = all.filter((x) => x.code.toUpperCase().includes(search));
        if (!shown.length) { host.innerHTML = '<p class="muted">No card has that code.</p>'; return; }
        for (const x of shown.slice(0, 25)) host.appendChild(row(x));
      }

      async function load() {
        // Always every card. The dropdown is gone with the one-card-per-merchant
        // cap; the two legacy merchants running two cards message both at once,
        // which is what a person at their shop expects anyway.
        const { body } = await api("/customers?cardId=all");
        all = body.customers || [];
        const buckets = body.buckets || [];
        const find = (k) => (buckets.find((b) => b.key === k) || {});
        health = body.health || [];
        readyAll = find("ready").eligible || 0;
        // Everyone means everyone, so the count is every customer — not the
        // sendable ones. The four health groups partition the same people, so
        // this is also the number the tiles above add up to.
        everyone = health.reduce((a, h) => a + h.customers, 0);

        // Everyone, then one option per health group. The groups are the
        // audiences worth choosing — chase the Lost, thank the Regulars — while
        // the cooldown buckets stay a read-out: "messaged this week" is a
        // reason somebody is skipped, never a group to aim at.
        const sel = q("[data-audience]");
        const keep = sel.value;
        // Group SIZE in the dropdown, not the sendable count: the dropdown is
        // for choosing who to talk to, and "Regulars (2)" when a shop has five
        // regulars is simply a wrong label. What will actually go out is the
        // line under the button.
        sel.innerHTML =
          '<option value="ready">Everyone (' + everyone + ")</option>" +
          health.map((h) =>
            '<option value="' + h.key + '">' + esc(h.label) + " (" + h.customers + ")</option>",
          ).join("");
        if (keep) sel.value = keep;
        paintAudience();
        // Pre-fill with the shop's stored starting message, so the box is never
        // empty. It is edited here and nowhere else now — the duplicate field in
        // Card → Rules was two places to set one message, on a page the owner
        // wasn't on when they sent it.
        if (!q("[data-msg]").dataset.touched) q("[data-msg]").value = (S.cards[0] || {}).winbackMessage || "";
        renderResults();
      }
      q("[data-msg]").oninput = (e) => { e.target.dataset.touched = "1"; };
      q("[data-audience]").onchange = paintAudience;
      q("[data-send]").onclick = () =>
        confirmSend(ready, { target: q("[data-audience]").value || "ready" });
      const searchBox = q("[data-search]");
      if (searchBox) searchBox.oninput = renderResults;
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
        if (S.cards.length > 1) {
          S.cards.forEach((c, i) => {
            const b = document.createElement("button");
            b.textContent = c.name; b.dataset.ci = String(i);
            b.className = i === S.selCard ? "on" : "";
            b.onclick = () => { S.selCard = i; draw(); };
            pick.appendChild(b);
          });
        }
        // No "+ Add card" button: V1 is one card per merchant, and the server
        // refuses a second one. The chips above still render for the few
        // merchants that added a card before that cap existed, so they can edit
        // both until an operator removes the spare.
        host.innerHTML = "";
        // The owner edits their real card, so every path points at it and the
        // customer count is a live number. The console passes a different env
        // and gets the same panel — see DESIGN_PANEL_JS.
        const card = S.cards[S.selCard];
        const artBase = card.id === "default" ? "" : "/c/" + card.id;
        host.appendChild(designPanel(card, {
          api, toast, modal, info,
          path: (suffix) => "/card/" + card.id + suffix,
        apiBase: "/dashboard/api",
          artUrl: (kind, v) => artBase + "/art/" + kind + ".png" + (v ? "?v=" + v : ""),
          customersPath: "/customers?cardId=" + encodeURIComponent(card.id),
          rulesNote: "",
          showDetails: true,
          // Nothing above the Card tab names this panel, so it names itself.
          titled: true,
          saveLabel: "Save changes",
          // Keep the card-picker chip labels in sync without resetting the form.
          onRulesSaved: () => {
            const pk = document.querySelector("[data-pick]");
            if (pk) pk.querySelectorAll("button[data-ci]").forEach((b) => {
              b.textContent = S.cards[Number(b.dataset.ci)].name;
            });
          },
        }));
      }
      draw();
      return div;
    }

    // ---- Shop: every link you hand out, then the counter, then your login ----
    // The links used to sit under the card designer, which put "print this for
    // the counter" on the page you visit to change a colour. They are all
    // set-up-once things, so they live together, split by who they are for.
    function accountPanel() {
      const div = document.createElement("div");
      const c = S.cards[0] || {};
      div.innerHTML = \`
        <!-- Above the PIN on purpose. Both are set-once answers a shop owes
             before anything works properly, and the setup banner asks for both
             — so they are the first two things on this tab, in that order. -->
        <h2 class="sec first">Your customers</h2>
        <p class="muted">How often should a customer come back?\${info("How often you'd expect a regular to come in. It only sorts your customers into New, Returning, Regular and Lost on the Customers tab. It changes nothing about your card, your stamps or your reward.")}</p>
        <select data-cycle style="margin-top:8px">
          <option value="">Choose one…</option>
          <option value="14">Once every 1–2 weeks</option>
          <option value="21">Once every 2–3 weeks</option>
          <option value="28">Once every 3–4 weeks</option>
        </select>
        <p class="muted" data-cycleout style="margin:6px 0 0;font-size:.84rem"></p>

        <h2 class="sec">Staff stamper</h2>
        <p class="muted">Staff use this tool to punch cards.\${info("One PIN for your whole counter. It is stored scrambled, so nobody can look it up. Setting a new one signs every staff phone out.")}</p>
        <label style="margin-top:14px" data-pinlabel>Staff PIN</label>
        <div class="copyrow" style="margin-top:6px">
          <input data-pin placeholder="4–12 digits" inputmode="numeric" autocomplete="off">
          <button class="btn btn-ghost" data-setpin>Set</button>
        </div>
        <div data-pinout></div>
        <!-- The card id MUST be in this link. Without it a bare /staff has to
             guess which counter it is, and on a deployment with several
             merchants the guess used to be "whoever owns the café named
             default" — a stranger. -->
        <div class="sharelist" style="margin-top:12px">
          <a href="/staff?c=\${c.id || ""}" target="_blank"><span>Open the stamper <span class="sub2">staff sign in here with the PIN</span></span><span class="arr">open →</span></a>
        </div>

        <h2 class="sec">Share</h2>
        <!-- Both are /j/ links: the merchant ref survives a rename, a second
             card and a change of ownership, and every ref a shop has ever held
             keeps resolving — which is what makes a printed poster safe. Card
             links stay live forever too, so nothing already shared breaks. -->
        <div class="sharelist">
          <!-- ?s=link so a shared link is told apart from a poster scan. Both
               are plain page views otherwise, and knowing which channel works
               is the difference between printing more posters and posting more. -->
          <a href="/j/\${S.joinRef || c.id || ""}?s=link" target="_blank"><span>Sign-up link <span class="sub2">send it, or put it in a bio</span></span><span class="arr">open →</span></a>
          <a href="/c/\${c.id || ""}/poster" target="_blank"><span>Sign-up poster <span class="sub2">print this for the counter</span></span><span class="arr">open →</span></a>
        </div>

        <h2 class="sec">Your account</h2>
        <label>Signed in as</label>
        <p style="font-weight:600;margin-bottom:6px">\${S.email}</p>
        <label style="margin-top:10px">Change password</label>
        <input data-cur type="password" placeholder="Current password" autocomplete="current-password">
        <input data-new type="password" placeholder="New password (min 8)" autocomplete="new-password" style="margin-top:8px">
        <label class="eye"><input type="checkbox" data-eye="[data-cur],[data-new]"> Show passwords</label>
        <button class="btn btn-dark" style="margin-top:20px" data-pwsave>Update password</button>
        <button class="btn btn-ghost" style="margin-top:20px" data-out>Log out</button>\`;
      wireEyes(div);
      // No wireInfo here: renderPanel delegates from the panel this sits inside,
      // and a second listener on an ancestor would fire on the same click and
      // close what the first just opened.

      // "Set" or "Reset" — an owner who already has a PIN is replacing one, and
      // the button saying "Set" made that look like a first-time action they had
      // somehow missed. The PIN itself is never sent back here: only its scrypt
      // hash is stored, so all the server can say is whether one exists.
      if (S.hasStaffPin) {
        div.querySelector("[data-pinlabel]").textContent = "Reset staff PIN";
        div.querySelector("[data-setpin]").textContent = "Reset";
        div.querySelector("[data-pin]").placeholder = "New PIN (4–12 digits)";
      }

      const pinOut = div.querySelector("[data-pinout]");
      // The PIN is NOT painted back. "Generate a new PIN" is gone, so the owner
      // always typed the one they just set and reading it back to them serves
      // nobody — while putting a live counter credential on a screen that may be
      // sitting open on the till does. What they do need is the consequence.
      const setPin = async (pin) => {
        const { body } = await api("/staff-pin", { method: "POST", body: JSON.stringify({ pin }) });
        if (!body.ok) {
          return toast(body.error === "pin-too-short" ? "Use at least 4 digits" : (body.error || "Couldn’t set the PIN"));
        }
        pinOut.innerHTML = '<div class="temp">PIN saved. Every staff phone has been signed out — ' +
          'they each need to sign in again with the new one.</div>';
        div.querySelector("[data-pinlabel]").textContent = "Reset staff PIN";
        div.querySelector("[data-setpin]").textContent = "Reset";
        // The first PIN also clears the banner above. Without this it sits there
        // contradicting the confirmation directly beneath it until a reload.
        S.hasStaffPin = true;
        renderPinWarning();
      };
      /**
       * How often customers should come back.
       *
       * Saves on the tap — like the logo upload, not like the colours. There is
       * one value, it is instantly reversible, and a Save button for a single
       * radio is a step that only exists to be forgotten. The health groups
       * re-cohort the same people with no new events, so pressing it is safe to
       * do twice while you decide.
       */
      const cycles = div.querySelector("[data-cycle]");
      const cycleOut = div.querySelector("[data-cycleout]");
      const paintCycle = () => {
        cycles.value = S.cycleDays ? String(S.cycleDays) : "";
        cycleOut.textContent = S.cycleDays
          ? "Used to group your customers."
          : "Not set — we're assuming every 2 weeks for now.";
      };
      paintCycle();
      cycles.onchange = async () => {
        const days = Number(cycles.value);
        if (!days) return paintCycle();
        const { body } = await api("/return-cycle", { method: "POST", body: JSON.stringify({ days }) });
        if (!body.ok) { paintCycle(); return toast(body.error || "Couldn't save that"); }
        S.cycleDays = days;
        paintCycle();
        renderPinWarning();
        toast("Saved ✓");
      };

      div.querySelector("[data-setpin]").onclick = () => {
        const el = div.querySelector("[data-pin]");
        const pin = el.value.trim();
        if (pin.length < 4) return toast("Use at least 4 digits");
        el.value = "";
        setPin(pin);
      };

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

    ${SEG_JS}
    // ---- app shell: five destinations, each with a real address ----
    //
    // \`path\` is the address the browser is on, minus the /dashboard prefix, and
    // it is the only thing that decides what is on screen. It replaced a \`tab\`
    // string that lived in memory: three tabs all shared one address, so the
    // back button did nothing, a refresh dropped you back at the first one, and
    // nothing deeper than a tab had anywhere to live.
    const S = { cards: [], email: "", path: "/", selCard: 0, hasStaffPin: false,
                joinRef: "", cycleDays: 0 };

    const ROOT = "/dashboard";
    /** The address inside the app, always starting with "/" and never trailing one. */
    function here() {
      const p = location.pathname.startsWith(ROOT) ? location.pathname.slice(ROOT.length) : "";
      return (p.replace(/\\/+$/, "") || "/");
    }

    /**
     * Go somewhere. \`replace\` swaps the current entry instead of adding one —
     * used when a screen redirects on arrival, so the back button does not land
     * you on the address that immediately bounced you again.
     *
     * Every path handed to this must also exist in V2_SCREENS on the server, or
     * it 404s the moment somebody refreshes. A test checks that.
     */
    function navigate(path, opts) {
      const to = ROOT + (path === "/" ? "" : path);
      if (opts && opts.replace) history.replaceState({}, "", to);
      else history.pushState({}, "", to);
      render();
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", () => { render(); });

    /**
     * A screen with no tabs behind it: a message and a way out. EVERY dead end
     * on this page goes through here, because the page's server-rendered body
     * is the word "Loading…" and nothing else — whatever fails to paint over it
     * leaves an owner staring at a spinner that is not a spinner, with no log
     * out button and therefore no way to reach the login form again. The retry
     * argument is optional; the log out button never is.
     */
    function deadEnd(email, message, retry) {
      unshell();
      $("#app").innerHTML =
        '<div><h1 style="margin:0">Dashboard</h1>' +
        (email ? '<p class="sub" style="margin:2px 0 14px">' + esc(email) + "</p>" : "") + "</div>" +
        '<p class="muted">' + esc(message) + "</p>" +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
        (retry ? '<button class="btn btn-ghost" style="width:auto;padding:10px 16px" data-retry>Try again</button>' : "") +
        '<button class="btn btn-ghost" style="width:auto;padding:10px 16px" data-out>Log out</button></div>';
      if (retry) $("[data-retry]").onclick = () => retry();
      // Logging out must work even when the server is the thing that is broken:
      // reload regardless, so a failed request cannot pin somebody to this
      // screen. The cookie clear is best-effort, the escape is not.
      $("[data-out]").onclick = async () => {
        try { await api("/logout", { method: "POST" }); } finally { location.reload(); }
      };
    }

    async function app() {
      const { status, body } = await api("/overview");
      if (status === 401) return authForm("login");
      // An archived shop is closed and requireOwner refuses every call behind
      // it. Say which it is; the alternative was reading cards off a body that
      // does not have any.
      if (status === 403) {
        return void deadEnd("", "This account is closed. If that is a surprise, message whoever set your PunchMe up.");
      }
      // Anything else that is not the overview: a 5xx, a proxy's HTML error
      // page, a dropped connection. Offer the retry rather than crash on a
      // body that has no cards in it.
      if (!Array.isArray(body.cards)) {
        return void deadEnd("", "Couldn't load your dashboard. Check your connection and try again.", app);
      }
      S.cards = body.cards; S.email = body.email; S.selCard = 0;
      S.hasStaffPin = !!body.hasStaffPin;
      // 0 means never chosen — the setup banner asks for it, and the Shop tab
      // shows nothing selected rather than a default they never picked.
      S.cycleDays = Number(body.returnCycleDays) || 0;
      S.joinRef = body.joinRef || "";
      // An account that holds no shop. It happens when a shop is handed to
      // somebody else: the login survives — deleting it would take an account
      // away over a mis-click — but it owns nothing, and every tab below reads
      // S.cards[0]. Say so plainly rather than render three empty tabs.
      if (!S.cards.length) {
        return void deadEnd(
          S.email,
          "This account does not have a shop. If that is a surprise, message whoever set your PunchMe up — they can hand it back.",
        );
      }
      // The chrome is built HERE, inside app(), and never in the page the
      // server sends. authForm() and deadEnd() both take the whole of #app
      // over — so a navigation bar in the server's body would be visible to a
      // logged-out visitor who cannot use any of it, and would still be there
      // on the screen whose entire job is to offer a way out.
      document.body.classList.add("shelled");
      $("#app").classList.add("shell");
      $("#app").innerHTML =
        topBarHtml() +
        '<div id="pinwarn"></div>' +
        '<div id="screen"></div>' +
        botNavHtml();
      wireChrome();
      renderPinWarning();
      render();
    }

    /** The shop's own name, which is what the top bar says instead of "Dashboard". */
    function shopName() { return (S.cards[0] || {}).shopName || "your shop"; }

    function topBarHtml() {
      return '<header class="topbar">' +
        '<img src="/assets/img/punchme-favicon-v1.png" alt="PunchMe">' +
        '<div class="shop">' + esc(shopName()) + "</div>" +
        '<button class="dots" data-menu aria-label="Account menu" aria-haspopup="true">⋯</button>' +
        "</header>";
    }

    /**
     * The five destinations. \`d\` is the icon path; \`p\` is the address, and every
     * one of them is in V2_SCREENS on the server, so a refresh on any of them
     * serves this same page instead of a 404.
     */
    const NAV = [
      { p: "/", label: "Home", d: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" },
      { p: "/customers", label: "Customers", d: "M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2.1.6 3.5 2.4 3.5 5.2" },
      { p: "/create", label: "Create", d: "M12 6v12M6 12h12", add: true },
      { p: "/manage", label: "Manage", d: "M4 6h16M4 12h16M4 18h10" },
      { p: "/shop", label: "Shop", d: "M4 9h16l-1 11H5L4 9ZM8.5 9V6.5a3.5 3.5 0 0 1 7 0V9" },
    ];

    function botNavHtml() {
      return '<nav class="botnav" aria-label="Main">' + NAV.map((n) => {
        const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + n.d + '"></path></svg>';
        return '<a href="' + ROOT + (n.p === "/" ? "" : n.p) + '" data-nav="' + n.p + '"' +
          (n.add ? ' class="navadd"' : "") + ">" +
          (n.add ? '<span class="plus">' + icon + "</span>" : icon) +
          "<span>" + n.label + "</span></a>";
      }).join("") + "</nav>";
    }

    function wireChrome() {
      // Real hrefs, intercepted. Middle-click and open-in-new-tab still do the
      // ordinary thing, because the server answers every one of these addresses.
      $(".botnav").querySelectorAll("[data-nav]").forEach((a) => {
        a.onclick = (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
          e.preventDefault();
          navigate(a.dataset.nav);
        };
      });
      $("[data-menu]").onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    }

    /**
     * The three-dot menu. A plain element rather than a browser dialog: this
     * app does not use confirm()/alert() anywhere an owner has to press
     * something, because a browser lets people silence those and they then
     * answer "no" in silence.
     */
    function toggleMenu() {
      const open = $(".tmenu");
      if (open) return void open.remove();
      const box = document.createElement("div");
      box.className = "tmenu";
      box.innerHTML = '<p class="mwho">' + esc(S.email) + "</p>" +
                      "<button data-signout>Sign out</button>";
      $(".topbar").appendChild(box);
      box.querySelector("[data-signout]").onclick = async () => {
        try { await api("/logout", { method: "POST" }); } finally { location.reload(); }
      };
      // One document-level listener, added with the menu and removed with it.
      setTimeout(() => {
        document.addEventListener("click", function close(ev) {
          if (box.contains(ev.target)) return;
          box.remove();
          document.removeEventListener("click", close);
        });
      }, 0);
    }

    /**
     * The counter cannot stamp until a PIN exists, and nothing used to say so.
     *
     * No PIN is minted at signup or at claim any more — an owner picks their own
     * under Shop. That is the right trade (a PIN can only ever be read once, and
     * a "write this down now" screen is a memory test at the worst moment), but
     * it leaves a real gap: verifyPassword refuses an empty hash, so every staff
     * sign-in fails, and it fails looking exactly like a wrong PIN. Above the
     * panels, on every tab, because the tab it sends you to is not the one an
     * owner opens first.
     */
    function renderPinWarning() {
      const box = $("#pinwarn");
      if (!box) return;
      // Two set-once answers a shop owes before the product works properly, in
      // ONE banner rather than two stacked warnings — a second amber box beside
      // the first is how a page teaches people to ignore both. Each line names
      // what is broken meanwhile, not what the field is called.
      const todo = [];
      if (!S.hasStaffPin) {
        todo.push("<strong>Your counter can’t stamp yet.</strong> " +
          "Staff sign in to the stamper with a PIN, and you haven’t picked one.");
      }
      if (!S.cycleDays) {
        todo.push("<strong>Pick how often customers should come back.</strong> " +
          "It's what sorts your customers into New, Returning, Regular and Lost.");
      }
      if (!todo.length) { box.innerHTML = ""; return; }
      box.innerHTML =
        '<div class="pinwarn"><p>' + todo.join('</p><p style="margin-top:6px">') + "</p>" +
        '<button class="btn btn-ghost" id="gopin">' +
          (todo.length > 1 ? "Finish setting up" : !S.hasStaffPin ? "Set a staff PIN" : "Set it") +
        "</button></div>";
      // Straight to the section that is missing, not just to Shop: the PIN and
      // the visit cycle live under different headings now.
      $("#gopin").onclick = () => navigate(!S.hasStaffPin ? "/shop/staff" : "/shop");
    }

    /**
     * The screens, matched in order against the address.
     *
     * Each pattern is a plain string with :placeholders. The first one that
     * matches wins, so the more specific address goes above the less specific
     * one — "/manage/reward/:id" before "/manage".
     *
     * Every screen is a function returning an element, exactly as the panels
     * always were. The router wipes and rebuilds, which is what the tab
     * switcher already did.
     */
    const ROUTES = [
      ["/", () => homeScreen()],
      ["/customers/:code", (p) => customerScreen(p.code)],
      ["/customers", () => customersScreen()],
      ["/create/:kind/:type", (p) => createStepScreen(p.kind, p.type)],
      ["/create/:kind", (p) => createPickScreen(p.kind)],
      ["/create", () => createScreen()],
      ["/manage/:tab/:id", (p) => manageDetailScreen(p.tab, p.id)],
      ["/manage/:tab", (p) => manageScreen(p.tab)],
      ["/manage", () => manageScreen("rewards")],
      ["/shop/:section", (p) => shopScreen(p.section)],
      ["/shop", () => shopScreen("")],
    ];

    /** Match one pattern against one path; returns the :params, or null. */
    function matchRoute(pattern, path) {
      const pp = pattern.split("/"), ap = path.split("/");
      if (pp.length !== ap.length) return null;
      const out = {};
      for (let i = 0; i < pp.length; i++) {
        if (pp[i].charAt(0) === ":") out[pp[i].slice(1)] = decodeURIComponent(ap[i]);
        else if (pp[i] !== ap[i]) return null;
      }
      return out;
    }

    function render() {
      S.path = here();
      const host = $("#screen");
      if (!host) return;
      host.innerHTML = "";
      let el = null;
      for (const [pattern, build] of ROUTES) {
        const params = matchRoute(pattern, S.path);
        if (params) { el = build(params); break; }
      }
      // An address inside /dashboard that no screen claims. The server only
      // serves the ones in V2_SCREENS, so this is reachable by typing — say so
      // and offer the way back rather than painting an empty page.
      if (!el) el = notFoundScreen();
      host.appendChild(el);
      // Screens carry [data-nav] links of their own — a programme row, a
      // customer card. Wired here rather than in each screen, so a new screen
      // cannot ship a link that reloads the whole page.
      wireLinks(host);
      // Which nav item is lit. The deep screens light their section: a customer
      // is still Customers, a programme is still Manage.
      $(".botnav").querySelectorAll("[data-nav]").forEach((a) => {
        const p = a.dataset.nav;
        a.classList.toggle("on", p === "/" ? S.path === "/" : S.path.indexOf(p) === 0);
      });
      wireInfo(host);
    }

    function notFoundScreen() {
      const d = document.createElement("div");
      d.innerHTML = '<h2 class="sec first">Nothing here</h2>' +
        '<p class="muted">That address isn’t part of your dashboard.</p>' +
        '<button class="btn btn-ghost" style="width:auto;padding:10px 16px;margin-top:12px" data-home>Go to Home</button>';
      d.querySelector("[data-home]").onclick = () => navigate("/");
      return d;
    }

    // ---- the five screens ---------------------------------------------------
    // Home, Customers, Manage and Shop each wrap a panel that already existed
    // and already works. They get rebuilt in the commits after this one; this
    // commit is the address bar and the two bars, and moving working screens
    // and rewriting them in the same change is how you lose track of which of
    // the two broke something.

    /**
     * Home — how the whole shop is doing, in one screen.
     *
     * Four numbers for the business, then the same question asked twice more:
     * once of the programmes, once of the campaigns.
     *
     * **Every number here is worked out from the same list the screen under it
     * uses.** "The headline disagreed with the list beneath it" is a bug this
     * codebase has shipped twice, and both times it was two different queries
     * answering one question. There is one request for the people
     * (/api/customers) and one for the programmes (/api/overview, already in
     * S), and nothing is counted a third way.
     */
    function homeScreen() {
      const d = document.createElement("div");
      const sum = (k) => S.cards.reduce((a, c) => a + (c.metrics[k] || 0), 0);
      d.innerHTML =
        '<h2 class="sec first">How your shop is doing</h2>' +
        '<div class="totals" data-totals></div>' +
        '<p class="muted" data-gap style="margin:-6px 0 4px"></p>' +
        '<div data-insight></div>' +
        '<h2 class="sec">Programmes</h2>' +
        '<div data-programs></div>' +
        '<h2 class="sec">Campaigns' + EG + "</h2>" +
        '<div data-campaigns></div>';

      // The four headline tiles. Painted with what is already in S so the shape
      // of the page is right before the request lands; the two that need the
      // people are filled in below rather than left as a hole.
      const tiles = (customers, freq) =>
        '<div class="metric"><b>' + customers + "</b><span>customers</span></div>" +
        '<div class="metric"><b>' + visitsLabel() + "</b><span>visits</span></div>" +
        '<div class="metric"><b>' + sum("redemptions") + "</b><span>rewards given</span></div>" +
        '<div class="metric"><b>' + freq + "</b><span>visit frequency</span></div>";

      // Filled once the people arrive. Held in a closure so both the tiles and
      // the insight below read the same numbers.
      let people = null;
      function visitsLabel() {
        // VISITS, not stamps. A stamp is something that happened at the
        // counter; a visit is a lifetime visit by a person, and signing up is
        // visit 1. They are different numbers and reading one as the other is
        // exactly how the headline came to disagree with the list.
        if (!people) return "—";
        return people.reduce((a, c) => a + (c.visits || 0), 0).toLocaleString();
      }
      /** The average gap between visits, across everyone who has two or more. */
      function freqLabel() {
        if (!people) return "—";
        const gaps = people.map((c) => c.avgGapDays).filter((g) => isFinite(g) && g > 0);
        if (!gaps.length) return "—";
        const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
        return mean < 1.5 ? "Daily" : "Every " + Math.round(mean) + " days";
      }

      const host = d.querySelector("[data-totals]");
      host.innerHTML = tiles("—", "—");
      d.querySelector("[data-programs]").innerHTML = programRows();
      d.querySelector("[data-campaigns]").innerHTML = campaignBlock();

      (async () => {
        const { body } = await api("/customers");
        people = Array.isArray(body.customers) ? body.customers : [];
        const counts = body.counts || { active: 0 };
        host.innerHTML = tiles(counts.active, freqLabel());
        d.querySelector("[data-gap]").innerHTML = counts.active
          ? ""
          : "No customers yet — they appear once someone adds your card and gets their first stamp.";
        drawInsight(d.querySelector("[data-insight]"), body);
      })();
      return d;
    }

    /**
     * One sentence about what the numbers mean, and no more than one.
     *
     * There is no insights engine and this is not pretending to be one: it is
     * three or four rules reading the segment split that is already on screen.
     * It says the most useful true thing it can find, or it says nothing —
     * a box that always has an opinion is a box that is sometimes wrong.
     */
    function drawInsight(host, body) {
      const groups = {};
      for (const g of body.health || []) groups[g.key] = g.customers;
      const total = Object.values(groups).reduce((a, n) => a + n, 0);
      if (!total) return;
      let line = "";
      if (groups.lost && groups.lost / total >= 0.4) {
        line = "<strong>" + groups.lost + " of your " + total + " customers have gone quiet.</strong> " +
          "A win-back campaign is the usual answer.";
      } else if (groups.new && groups.new / total >= 0.5) {
        line = "<strong>Most of your customers are new.</strong> " +
          "Whether they come back a second time is the number worth watching next.";
      } else if (groups.regular && groups.regular / total >= 0.3) {
        line = "<strong>" + groups.regular + " regulars.</strong> " +
          "That is the group that pays for the rest of this.";
      } else if (groups.returning) {
        line = "<strong>" + groups.returning + " customers are on their way to becoming regulars.</strong> " +
          "They have been back, but not often enough yet.";
      }
      if (!line) return;
      host.innerHTML = '<div class="insight"><p>' + line + "</p></div>";
    }

    /**
     * Programmes, with the real one first.
     *
     * Tracked spend lives here rather than in the headline: it is stamps ×
     * that programme's own average basket, so it is a fact about a programme,
     * not about the shop. It was a fourth headline tile and the four headline
     * slots are spoken for now.
     */
    function programRows() {
      const real = S.cards.map((c) => {
        const money = c.averageSpend > 0
          ? (c.currency || "") + Math.round(c.metrics.stamps * c.averageSpend).toLocaleString()
          : "";
        return progRow({
          href: "/manage/rewards/" + c.id,
          name: c.shopName || c.name, kind: c.kind, status: "active",
          customers: c.metrics.active, visits: c.metrics.stamps, rewards: c.metrics.redemptions,
        }, money);
      }).join("");
      const eg = MOCK_PROGRAMS.map((m) => progRow({
        href: "/manage/rewards/" + m.id, example: true,
        name: m.name, kind: m.kind, status: m.status,
        customers: m.customers, visits: m.visits, rewards: m.rewards,
      }, "")).join("");
      return real + eg;
    }

    /** Type names an owner would recognise, from the four the database holds. */
    const KIND_LABEL = { stamp: "Stamps", milestones: "Stamps + milestones",
                         membership: "Membership", points: "Points" };

    function progRow(p, money) {
      return '<a class="prow' + (p.example ? " egrow" : "") + '" href="' + ROOT + p.href +
        '" data-nav="' + p.href + '">' +
        '<div class="ptop"><strong>' + esc(p.name) + "</strong>" +
          (p.example ? EG : "") +
          '<span class="pstat' + (p.status === "ended" ? " off" : "") + '">' +
            (p.status === "ended" ? "Ended" : "Active") + "</span></div>" +
        '<div class="pmeta">' + (KIND_LABEL[p.kind] || "Stamps") +
          (money ? " · " + money + " tracked" : "") + "</div>" +
        '<div class="pnums"><span><b>' + p.customers + "</b>customers</span>" +
          "<span><b>" + p.visits + "</b>stamps</span>" +
          "<span><b>" + p.rewards + "</b>rewards</span></div>" +
        "</a>";
    }

    /** Campaigns performance. Entirely example data — there is no campaign table. */
    function campaignBlock() {
      const t = mockCampaignTotals();
      return '<div class="totals" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="metric"><b>' + t.targeted + "</b><span>targeted</span></div>" +
        '<div class="metric"><b>' + t.returned + "</b><span>came back</span></div>" +
        '<div class="metric"><b>' + t.activation + "%</b><span>activation</span></div>" +
        "</div>" +
        '<p class="muted" style="margin-top:8px">Not your data yet — this is what it will look like ' +
        "once campaigns are running.</p>";
    }

    /**
     * Customers — who is in the shop, and what they have been doing.
     *
     * The four segments were on Home; the search was built and switched off
     * behind SHOW_FIND_FOLD, on the theory that a list of codes is a lookup
     * tool rather than a view. With a screen of its own it is both: an owner
     * comes here to find one person OR to read the shape of the base.
     */
    function customersScreen() {
      const d = document.createElement("div");
      d.innerHTML =
        '<h2 class="sec first">Your customers</h2>' +
        '<div data-health></div>' +
        '<div class="cfilter">' +
          '<input data-q type="search" placeholder="Search by card code" autocomplete="off">' +
          '<select data-sort>' +
            '<option value="recent">Most recent visit</option>' +
            '<option value="visits">Most visits</option>' +
            '<option value="lapsed">Longest away</option>' +
          "</select>" +
        "</div>" +
        '<div class="cfilter" data-seg></div>' +
        '<p class="muted" data-count style="margin:2px 0 6px"></p>' +
        '<div data-list></div>' +
        '<h2 class="sec">Today at the counter</h2>' +
        '<div data-activity><p class="muted">Loading…</p></div>';

      // Which segment is being looked at. "" is everyone.
      let all = [], filter = "";
      const segHost = d.querySelector("[data-seg]");
      const listHost = d.querySelector("[data-list]");

      function paint() {
        const q = (d.querySelector("[data-q]").value || "").trim().toUpperCase();
        const sort = d.querySelector("[data-sort]").value;
        let shown = all.filter((x) => (!filter || x.health === filter) &&
                                      (!q || x.code.toUpperCase().includes(q)));
        // lastDays counts UP as somebody stays away, so "most recent" is
        // ascending and "longest away" is the same list backwards.
        if (sort === "visits") shown = shown.slice().sort((a, b) => b.visits - a.visits);
        else if (sort === "lapsed") shown = shown.slice().sort((a, b) => b.lastDays - a.lastDays);
        else shown = shown.slice().sort((a, b) => a.lastDays - b.lastDays);

        d.querySelector("[data-count]").textContent =
          shown.length === all.length
            ? all.length + (all.length === 1 ? " customer" : " customers")
            : shown.length + " of " + all.length;
        listHost.innerHTML = shown.length
          ? shown.slice(0, 200).map(custCard).join("")
          : '<p class="muted">Nobody matches that.</p>';
        // Only the first 200 are drawn: a shop with thousands of customers
        // should not pay for a list nobody scrolls to the end of.
        if (shown.length > 200) {
          listHost.insertAdjacentHTML("beforeend",
            '<p class="muted">Showing the first 200. Search to narrow it down.</p>');
        }
        wireLinks(listHost);
      }

      d.querySelector("[data-q]").oninput = paint;
      d.querySelector("[data-sort]").onchange = paint;

      (async () => {
        const { body } = await api("/customers?cardId=all");
        all = body.customers || [];
        drawHealth(d.querySelector("[data-health]"), body);
        // One chip per segment, from the server's own groups — so the filter
        // can never offer a group the tiles above do not show.
        segHost.innerHTML = '<button class="segchip on" data-f="">Everyone</button>' +
          (body.health || []).map((h) =>
            '<button class="segchip" data-f="' + h.key + '">' + esc(h.label) + " (" + h.customers + ")</button>",
          ).join("");
        segHost.querySelectorAll("[data-f]").forEach((b) => {
          b.onclick = () => {
            filter = b.dataset.f;
            segHost.querySelectorAll("[data-f]").forEach((o) => o.classList.toggle("on", o === b));
            paint();
          };
        });
        paint();
      })();

      drawActivity(d.querySelector("[data-activity]"));
      return d;
    }

    /**
     * One customer as a row you can open.
     *
     * The code, not a name. This product asks customers for no name, no email
     * and no phone — the privacy page promises exactly that in writing — so the
     * 6-character code on their card is the only thing there is to call them,
     * and inventing "Customer #4" would imply an identity it refuses to hold.
     */
    function custCard(x) {
      const seen = x.lastDays === 0 ? "in today"
        : x.lastDays === 1 ? "yesterday" : x.lastDays + " days ago";
      return '<a class="ccard" href="' + ROOT + "/customers/" + encodeURIComponent(x.code) +
        '" data-nav="/customers/' + encodeURIComponent(x.code) + '">' +
        '<span class="cid">' + esc(x.code) + "</span>" +
        '<span class="cseg h-' + x.health + '">' + segLabel(x.health) + "</span>" +
        '<span class="cprog">' + x.stamps + "/" + x.target + "</span>" +
        '<span class="cwhen">' + seen + "</span>" +
        "</a>";
    }

    const SEG_LABEL = { regular: "Regular", returning: "Returning", new: "New", lost: "Lost" };
    function segLabel(k) { return SEG_LABEL[k] || k; }

    /**
     * What happened at the counter today.
     *
     * Today only, and it says so in the heading. /api/counter is the one thing
     * that reads the event log back for an owner and it covers one day — the
     * log holds everything, but nothing reads further back yet, and a feed
     * labelled "recent" that silently stops at midnight is a lie.
     */
    async function drawActivity(host, code) {
      const { body } = await api("/counter");
      const events = ((body.counter || {}).events || [])
        .filter((e) => !code || e.code === code);
      if (!events.length) {
        host.innerHTML = '<p class="muted">Nothing at the counter yet today.</p>';
        return;
      }
      const WORD = { stamp: "got a stamp", undo: "had a stamp taken back", redeem: "claimed a reward" };
      host.innerHTML = '<div class="acts">' + events.slice(0, 40).map((e) => {
        const t = new Date(e.at);
        const when = isNaN(t) ? "" : t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        return '<div class="act"><span class="at">' + esc(when) + "</span>" +
          '<span class="aw">' + (code ? "" : "<strong>" + esc(e.code || "—") + "</strong> ") +
          (WORD[e.type] || esc(e.type)) + "</span></div>";
      }).join("") + "</div>";
    }

    /**
     * One customer's own page.
     *
     * Everything here is real except the marketing toggle, which is marked as
     * an example: there is no consent column in the database, and a switch that
     * looked live but did not actually stop messages would be this product
     * lying about consent on the one subject its privacy page makes a promise
     * about. What IS real sits above it, under Reachability.
     */
    function customerScreen(code) {
      const d = document.createElement("div");
      d.innerHTML = '<p class="muted" data-back style="margin:0 0 6px">← Customers</p>' +
        '<div data-who><h2 class="sec first">' + esc(code) + "</h2>" +
        '<p class="muted">Loading…</p></div>';
      d.querySelector("[data-back]").onclick = () => navigate("/customers");
      d.querySelector("[data-back]").style.cursor = "pointer";

      (async () => {
        const { body } = await api("/customers?cardId=all");
        const x = (body.customers || []).find((c) => c.code === code);
        const host = d.querySelector("[data-who]");
        if (!x) {
          host.innerHTML = '<h2 class="sec first">' + esc(code) + "</h2>" +
            '<p class="muted">No card with that code. It may have been deleted, ' +
            "or the code may have been mistyped.</p>";
          return;
        }
        const freq = isFinite(x.avgGapDays) && x.avgGapDays > 0
          ? "Every " + Math.round(x.avgGapDays) + " days"
          : "Not enough visits yet";
        // Real, and the honest version of "can I contact this person".
        const reach = x.removed
          ? ["Card removed", "They deleted the card from their wallet. Nothing can reach them."]
          : x.canNudge
            ? ["Can be messaged", "They are inside the weekly limit."]
            : ["At the weekly limit", "They have had the most messages allowed in the last 7 days."];

        host.innerHTML =
          '<h2 class="sec first">' + esc(x.code) +
            '<span class="cseg h-' + x.health + '">' + segLabel(x.health) + "</span></h2>" +
          '<p class="muted">Their card code. This shop asks customers for no name, ' +
          "email or phone — the code is the only thing that identifies them.</p>" +
          '<div class="totals" style="grid-template-columns:repeat(2,1fr)">' +
            '<div class="metric"><b>' + x.visits + "</b><span>visits</span></div>" +
            '<div class="metric"><b>' + x.stamps + "/" + x.target + "</b><span>towards their reward</span></div>" +
          "</div>" +
          '<div class="drow"><span>Programme</span><b>' + esc(x.cardName) + "</b></div>" +
          '<div class="drow"><span>Visit frequency</span><b>' + freq + "</b></div>" +
          '<div class="drow"><span>Joined</span><b>' + x.joinedDays + " days ago</b></div>" +
          '<div class="drow"><span>Last visit</span><b>' +
            (x.lastDays === 0 ? "Today" : x.lastDays + " days ago") + "</b></div>" +
          '<h2 class="sec">Reachability</h2>' +
          '<div class="drow"><span>' + reach[0] + "</span></div>" +
          '<p class="muted">' + reach[1] + "</p>" +
          '<div class="drow"><span>Marketing messages' + EG + "</span><b>On</b></div>" +
          '<p class="muted">Letting a customer opt out of marketing is coming. ' +
          "Today the only limit is the weekly one above.</p>" +
          (x.canNudge
            ? '<h2 class="sec">Message them</h2>' +
              '<textarea data-msg1 rows="3" placeholder="Type your message"></textarea>' +
              '<button class="btn btn-dark" style="margin-top:10px" data-send1>Send message</button>'
            : "") +
          '<h2 class="sec">Today at the counter</h2>' +
          '<div data-act><p class="muted">Loading…</p></div>' +
          '<p class="muted">Anything before today is in the log but not yet on this page.</p>';

        const send = host.querySelector("[data-send1]");
        if (send) {
          send.onclick = async () => {
            const message = host.querySelector("[data-msg1]").value.trim();
            if (!message) return toast("Type a message first");
            if (await confirmAndSend(1, { target: [x.serial] }, message)) {
              host.querySelector("[data-msg1]").value = "";
            }
          };
        }
        drawActivity(host.querySelector("[data-act]"), x.code);
      })();
      return d;
    }

    /**
     * Confirm, then send. The one thing an owner has to read before sending is
     * here rather than as grey subtext: it goes out exactly as typed, to real
     * phones, and it cannot be taken back.
     *
     * Shared by the one-off message on a customer's page and by the sender
     * below, so there is one place that decides what the warning says. The
     * server still decides who is actually eligible and reports back — the
     * weekly cap is enforced there, never here.
     */
    async function confirmAndSend(count, payload, message) {
      if (!message) { toast("Type a message first"); return false; }
      if (!count) { toast("Nobody to message right now"); return false; }
      const ok = await modal(
        "Send to " + count + (count === 1 ? " customer?" : " customers?"),
        "<p>It goes out exactly as written, to their phone, and cannot be taken back.</p>" +
          '<p style="margin-top:8px"><strong>' + mdlEsc(message) + "</strong></p>" +
          '<p style="margin-top:8px">Anyone messaged in the last 7 days is skipped automatically.</p>',
        "Send it",
      );
      if (!ok) return false;
      const { body } = await api("/nudge", {
        method: "POST", body: JSON.stringify(Object.assign({ message }, payload)),
      });
      if (!body.ok) { toast(body.error || "Failed"); return false; }
      const s = body.skipped || {};
      const held = (s.rateLimited || 0) + (s.removed || 0);
      toast("Sent to " + body.sent + " of " + body.total +
        (held ? " · " + held + " held back by the limit" : ""));
      return true;
    }

    function createScreen() {
      const d = document.createElement("div");
      d.innerHTML = '<h2 class="sec first">Create</h2>' +
        '<p class="muted">Start a new reward programme, or a campaign to bring customers back.</p>' +
        '<div class="sharelist" style="margin-top:14px">' +
          '<a href="' + ROOT + '/create/reward" data-nav="/create/reward">' +
            '<span>Reward programme<span class="sub2">Stamps, milestones, membership or points</span></span>' +
            '<span class="arr">→</span></a>' +
          '<a href="' + ROOT + '/create/campaign" data-nav="/create/campaign">' +
            '<span>Campaign<span class="sub2">Bring customers back with a message</span></span>' +
            '<span class="arr">→</span></a>' +
        "</div>";
      wireLinks(d);
      return d;
    }

    /** The reward-type and campaign-type pickers. Built in the Create commit. */
    function createPickScreen(kind) {
      if (kind !== "reward" && kind !== "campaign") return notFoundScreen();
      return placeholder(kind === "reward" ? "New reward programme" : "New campaign",
        kind === "reward"
          ? "Choosing between stamps, milestones, membership and points arrives with the Create screens."
          : "Win-back, quiet period, progress reminder and custom campaigns arrive with the Create screens.");
    }

    function createStepScreen(kind, type) {
      if (kind !== "reward" && kind !== "campaign") return notFoundScreen();
      return placeholder("Set up your " + (kind === "reward" ? "programme" : "campaign"),
        "Setting up “" + type + "” arrives with the Create screens.");
    }

    function manageScreen(tab) {
      if (tab !== "rewards" && tab !== "campaigns") return notFoundScreen();
      const d = document.createElement("div");
      // Rewards is the card editor as it stands today, so the programme you
      // actually run is editable from the moment this shell lands. The list, the
      // detail page and the Campaigns tab arrive with the Manage commit.
      if (tab === "rewards") d.appendChild(cardsPanel());
      else d.appendChild(placeholder("Campaigns", "Your campaigns will be listed here."));
      return d;
    }

    function manageDetailScreen(tab, id) {
      if (tab !== "rewards" && tab !== "campaigns") return notFoundScreen();
      return placeholder(tab === "rewards" ? "Programme" : "Campaign",
        "The detail page for “" + id + "” arrives with the Manage screens.");
    }

    function shopScreen() {
      const d = document.createElement("div");
      d.appendChild(accountPanel());
      return d;
    }

    /**
     * A screen that is not built yet. It says so in plain words and offers the
     * way on, rather than rendering nothing — an empty page reads as broken,
     * and there is no way to tell the two apart from the outside.
     */
    function placeholder(title, body) {
      const d = document.createElement("div");
      d.innerHTML = '<h2 class="sec first">' + esc(title) + "</h2>" +
        '<p class="muted">' + esc(body) + "</p>";
      return d;
    }

    /** Turn every [data-nav] inside a freshly built screen into an in-app move. */
    function wireLinks(root) {
      root.querySelectorAll("[data-nav]").forEach((a) => {
        a.onclick = (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
          e.preventDefault();
          navigate(a.dataset.nav);
        };
      });
    }

    // The last line of defence. The body this script boots into is the word
    // "Loading…", so ANY exception before something paints over it leaves an
    // owner on a dead screen with no log out button and no way back to the
    // login form — which is exactly what one undefined helper did. Awaited, not
    // fired and forgotten: an un-awaited app() would reject past this catch.
    async function boot() {
      try {
        const { body } = await api("/state");
        if (body.loggedIn) await app();
        else authForm("login");
      } catch (e) {
        console.error("[dashboard] boot failed:", e);
        deadEnd("", "Something went wrong loading this page.", boot);
      }
    }
    boot();
  `;
  return page(
    "PunchMe — Dashboard",
    `<div class="card" id="app"><p class="sub">Loading…</p></div><div class="toast"></div>`,
    css,
    js,
  );
}
