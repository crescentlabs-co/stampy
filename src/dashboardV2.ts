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
    /* The gap between the two tiles matches the sheet's own side padding, so
       the gutter down the middle is the same width as the gutters at the edges.
       At --s2 the pair read as one wide box someone had drawn a line through. */
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s3);
               margin: 0 0 var(--s3); }
    /* ONE card look, everywhere: a --surface fill, --r, and nothing drawn round
       it. Fifteen things on this screen used to carry a 1px outline — several
       with a fill AND a shadow as well, which is three separators doing one
       job. An outline makes a screen read as a form; a fill makes it read as
       an app. Rule 9 still holds: a box INSIDE a --surface box goes back to
       --bg with a hairline, and that is the one place a border earns itself. */
    /* A tile is three lines: a label, the number, and how to read it. It was
       two — a number and a label — in a box with the rest of the box empty,
       which is what "a lot of unused space" meant. The third line is also the
       one that turns a figure into something you can act on. */
    .metric { background: var(--bg); border-radius: var(--r);
              padding: var(--s3); text-align: left; }
    .metric b { font-family: var(--display); font-weight: 800; font-size: var(--t-xl);
                line-height: var(--lh-tight); display: block; letter-spacing: var(--tr-hero);
                font-variant-numeric: tabular-nums; color: var(--ink); }
    /* --- Home has THREE text sizes and no others ------------------------
       --t-xl (24px) is the title, both section headings and every NUMBER.
       --t-md (14px) is a row's name and a row's figure.
       --t-sm (12px) is every other word: labels, subtext, dates, the tooltip.

       It reached five by adding one sensible step at a time, which is what made
       it read as generated. These three each have a job you can say out loud,
       and a test holds them. --t-xs (11px) is not one of them: off Home it is
       the size for UPPERCASE tags and it stays that.

       Home's two, and only those two. .metric is also the health tiles on
       Customers and the three-up grids on the detail screens — four of these
       across a phone at hero size is a number that does not fit its own box. */
    .metrics .metric b { font-size: var(--t-xl); line-height: var(--lh-num); }
    /* Every name on this screen is set the same way: sentence case, reading
       size, muted. A tile's label, the chart's two series and the chart's hint
       line are all the same kind of thing — the name of the number beside it —
       and they used to be three different treatments, one of them uppercase.
       --t-xs is 11px and stays reserved for UPPERCASE tags: caps read larger
       than lowercase at the same size, so 11px caps and 13px sentence text look
       like one size, which is the point. A test holds that rule. */
    .mlabel { display: flex; align-items: center; gap: var(--s2); font-size: var(--t-sm);
              font-weight: 500; color: var(--muted); margin-bottom: var(--s1); }
    /* And the reading of it sits under, quieter than the number and never the
       same size as the label above — two small lines at one size would read as
       a pair rather than as a top and a bottom. */
    /* What the change is measured against, on its own line under the number —
       the sentence does not have to fit beside a 32px figure in half a phone,
       and the coloured part is then the only thing colour is doing. */
    .mnote { display: block; margin-top: var(--s1); font-size: var(--t-sm);
             line-height: var(--lh-body); color: var(--muted); }
    /* The label under a number in every OTHER metric grid — the health tiles
       and the detail screens. Home's tiles use .mlabel above and lead with it. */
    .metric span:not(.mlabel):not(.mnote) { display: block; margin-top: var(--s2);
                   font-size: var(--t-sm); letter-spacing: var(--tr-sm); color: var(--muted); }
    /* --- Home's header row: the title, and the window it is all measured over.
       The selector belongs beside the title and not above the chart, because it
       governs the tiles as well — one control, everything on the screen. */
    /* The title and the window it is all measured over, on one line. The
       selector governs the tiles as well as the chart, so there is one of it
       and it belongs beside the title rather than above the chart. */
    .homehead { display: flex; align-items: center; justify-content: space-between;
                gap: var(--s3); flex-wrap: wrap; margin: var(--s3) 0 var(--s3); }
    .homehead .sec { margin: 0; }
    /* Every heading on Home, not only the title: Programmes and Campaigns sit
       at the same rank as it and as the numbers. .sec elsewhere keeps --t-lg,
       which is why this hangs off the screen's own class. */
    .home .sec { font-size: var(--t-xl); }
    /* A .seg shrunk to sit on a heading row without towering over it: reading
       size, and the smallest padding on the scale top and bottom. The labels
       are "7d" and "30d" for the same reason — three words would not fit beside
       a title on a 360px phone. */
    .winsel { flex: none; margin: 0; padding: var(--s1); }
    .winsel button { font-size: var(--t-sm); padding: var(--s1) var(--s3); }
    .winsel .thumb { top: var(--s1); bottom: var(--s1); }
    /* The number and its change share a line, sitting on the same baseline. It
       wraps on a narrow phone rather than shrinking: two tiles across 360px is
       about 150px each, and "+3 vs last week" does not always fit beside a
       four-figure number. */
    .mrow { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; }
    /* Green up, rust down — the SAME two hues the customer segments use below
       (.h-regular and .h-lost). DESIGN.md rule 6: read the four, never pick a
       fifth. Never the neon: that marks the next thing to press, and a change
       since last week is not something you can press. */
    /* The change is a COLOUR and nothing else — not bigger, not heavier. It
       sits on the number's baseline so the pair read as one figure. */
    .delta { font-size: var(--t-sm); font-weight: 600;
             font-variant-numeric: tabular-nums; white-space: nowrap; }
    .delta.up { color: #15803d; }
    .delta.down { color: #9a3412; }
    .delta.flat { color: var(--muted); }
    /* --- the one chart -------------------------------------------------------
       Two series on one pair of axes, so the shape of the week can be read once
       instead of twice. They are told apart by FILL as much as by colour: the
       visits line carries a filled area, the rewards line is a bare stroke. */
    .chart { background: var(--bg); border-radius: var(--r); padding: var(--s4);
             margin: var(--s2) 0 0; }
    /* The chart's two figures are set exactly like the two tiles above: label,
       then the number under it. They were a legend with the number tucked in
       beside the word, which made them a third kind of thing on a screen that
       only has two. The swatch is what still ties each one to its line. */
    .chartfigs { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s3); }
    .cfig b { font-family: var(--display); font-weight: 800; font-size: var(--t-xl);
              line-height: var(--lh-num); letter-spacing: var(--tr-hero); color: var(--ink);
              font-variant-numeric: tabular-nums; }
    .sw { width: 10px; height: 10px; border-radius: 999px; flex: none; }
    .sw.v { background: var(--accent); border: 1.5px solid var(--accent-2); }
    .sw.r { background: var(--ink); }
    /* The tooltip. --bg on a --bg card would vanish, so this is the one place
       rule 9 runs the other way: it earns its hairline by floating. */
    .ctip { position: absolute; z-index: 2; pointer-events: none;
            background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-sm);
            box-shadow: var(--shadow); padding: var(--s2) var(--s3);
            transform: translate(-50%, -100%); white-space: nowrap; }
    .ctip .cd { display: block; font-size: var(--t-sm); font-weight: 700; color: var(--ink);
                margin-bottom: var(--s1); }
    .ctip .cr { display: flex; align-items: center; gap: var(--s2);
                font-size: var(--t-sm); color: var(--muted); }
    .ctip .cr b { margin-left: var(--s4); color: var(--ink); font-weight: 700;
                  font-variant-numeric: tabular-nums; }
    .chartwrap { position: relative; margin-top: var(--s2); touch-action: pan-y;
                 cursor: crosshair; }
    .chartwrap svg { display: block; width: 100%; height: 132px; }
    /* Neon, and the one place on the dashboard it is not marking an action —
       the founder asked for it by name. It is a FILL under a line, never text
       and never the stroke on its own: #c9f73d on white cannot be read, which
       is what --accent-2 is doing on top of it. See DESIGN.md rule 1.
       It fades out downwards so the fill reads as depth under the line rather
       than as a solid block of colour with a line on top. */
    .chart .carea { fill: url(#pmChartFade); }
    .chart .cg0 { stop-color: var(--accent); stop-opacity: .62; }
    .chart .cg1 { stop-color: var(--accent); stop-opacity: .02; }
    .chart .cvis { fill: none; stroke: var(--accent-2); stroke-width: 2.5;
                   stroke-linecap: round; stroke-linejoin: round;
                   vector-effect: non-scaling-stroke; }
    .chart .crew { fill: none; stroke: var(--ink); stroke-width: 2;
                   stroke-linecap: round; stroke-linejoin: round;
                   vector-effect: non-scaling-stroke; }
    /* The marker and its dots are HTML, not SVG. The paths are drawn into a
       viewBox stretched to the card's width, and that same stretch would turn a
       circle into an ellipse — so these sit over the top in percentages. */
    .chart .cmark { position: absolute; top: 0; bottom: 0; width: 1px;
                    background: var(--ink); opacity: .3; transform: translateX(-.5px); }
    .chart .cdot { position: absolute; width: 11px; height: 11px; border-radius: 999px;
                   border: 2px solid var(--bg); transform: translate(-50%, -50%); }
    .chart .cdot.v { background: var(--accent-2); }
    .chart .cdot.r { background: var(--ink); }
    .chart .hidden { display: none; }
    /* Dates, read as dates. They were 11px uppercase, which is a TAG size and
       made the scale under the chart a fifth thing on a screen that wants
       three. Three marks, not two: the middle one is what tells you the line
       is a month rather than a week. */
    .chartax { display: flex; justify-content: space-between; margin-top: var(--s2);
               font-size: var(--t-sm); color: var(--muted); }
    .chartax span:nth-child(2) { text-align: center; }
    .chartax span:last-child { text-align: right; }
    .chartax span { flex: 1; min-width: 0; }
    .chartempty { margin-top: var(--s3); font-size: var(--t-sm); line-height: var(--lh-read);
                  color: var(--muted); }
    /* --- the two summary lists ------------------------------------------
       ONE container with the rows spaced inside it, the shape a transaction
       list takes. Not a card per row: five cards stacked is five separators
       doing the work of four gaps, and it was the stacked-boxes rhythm that
       made this screen read as generated.

       Two facts a side and no more. The full picture is on Manage, which still
       carries customers, stamps and rewards per programme; Home answers "how
       are they doing against each other" and nothing else. */
    .slist { background: var(--bg); border-radius: var(--r); padding: var(--s2); }
    .slist > * + * { margin-top: var(--s1); }
    .srow { display: flex; align-items: center; gap: var(--s3); padding: var(--s3);
            border-radius: var(--r-sm); text-decoration: none; color: inherit; }
    a.srow:active { background: var(--surface); }
    .srow .sl { flex: 1; min-width: 0; }
    /* The name can be anything the owner typed, so it truncates rather than
       wrapping under the figure beside it and breaking the row's rhythm. */
    .srow .sn { display: block; font-size: var(--t-md); font-weight: 600; color: var(--ink);
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .srow .st { display: block; margin-top: var(--s1); font-size: var(--t-sm); color: var(--muted); }
    .srow .sr { flex: none; text-align: right; }
    /* A row is FOUR facts at ONE size, two a side. The figure was --t-lg
       display and the words around it 13px, which made a row carry three sizes
       on its own. Left and right are peers here; neither is the headline. */
    .srow .sv { display: block; font-size: var(--t-md); font-weight: 600; color: var(--ink);
                font-variant-numeric: tabular-nums; }
    /* The unit rides with the number: "3" alone does not say what it counts,
       and a third line would make the row taller than two facts deserve. */
    .srow .sv i { font-style: normal; font-weight: 400; color: var(--muted); }
    .srow .sp { display: block; margin-top: var(--s1); font-size: var(--t-sm); color: var(--muted);
                font-variant-numeric: tabular-nums; }
    .slistempty { padding: var(--s3); font-size: var(--t-sm); line-height: var(--lh-read);
                  color: var(--muted); }
    .card { border: 1px solid var(--line); border-radius: var(--r);
            padding: var(--s3); margin-top: var(--s3); }
    .links { display: flex; gap: var(--s3); margin-top: var(--s2); flex-wrap: wrap; font-size: var(--t-sm); }
    ${DESIGN_PANEL_CSS}
    .account { margin-top: var(--s5); }
    .card { max-width: 480px; }
    /* --- card dropdown selector --- */
    .cardselect { display: flex; gap: var(--s2); align-items: center; margin: var(--s2) 0 var(--s2); }
    .cardselect select { flex: 1; padding: var(--s2) var(--s3); border: 1px solid var(--field-border); border-radius: var(--r-sm);
                         font: inherit; font-weight: 600; background: var(--surface); color: var(--ink); }
    .cardselect .btn { width: auto; padding: var(--s2) var(--s3); font-size: var(--t-sm); white-space: nowrap; }
    ${SEG_CSS}
    /* --- the app chrome ------------------------------------------------------
       A shaped neon block at the top that says whose shop this is, and a
       floating pill at the bottom that is the whole of the navigation.

       THE TOP BAR IS NEON, and it is DESIGN.md rule 1's one fenced exception
       inside the app — decided by the founder, the same call that was made for
       the .greet header this bar replaced. It earns it on the same grounds:
       it is the shop's identity, it is the only thing on the dashboard that
       never changes as you move around, and it carries no control except the
       menu — so it cannot compete with whatever the owner came here to do.

       Its text is --on-accent (near-black) and NEVER white: #c9f73d is a pale
       green, so white on it lands near 1.3:1 and is unreadable. That is the
       whole reason --on-accent exists and is always dark.

       THE BOX IS THE CONTENT, NOT THE BAR. The bar is a flat neon block and
       the sheet under it is what has the rounded corners — rounded at the TOP,
       tucked under the bar. That is the right way round for one reason: the
       sheet is also the only thing on the screen that scrolls.

       Sticky was not enough. A sticky bar still has the page sliding behind it,
       and with a rounded bottom you could watch content pass through the corner
       notches and up into the staging strip. Now nothing outside the sheet
       scrolls at all — the app is a fixed-height column, the bar is locked, and
       there is no "behind" for anything to fall into. */
    /* The page is a 480px column, and inside it a full-height flex column: a bar
       that cannot move, and a sheet that scrolls inside itself.

       Scoped to .shelled / .shell, which the script adds only once the chrome
       is mounted. The login form and the broken-page screen render into the
       same #app and have no bars — they keep the ordinary padded card, and the
       ordinary scrolling page, which is what they have always been. */
    body.shelled { padding: 0; height: 100vh; height: 100dvh; overflow: hidden; }
    /* The staging strip is a sibling above #app and keeps its own height, so
       the column below it is what shrinks. */
    body.shelled .envstrip { flex: none; }
    /* width:100% because body is a centred flex column — without it the column
       shrinks to whatever its widest child happens to be. min-height:0 is what
       lets the sheet inside actually scroll rather than stretching the column. */
    #app.shell { width: 100%; max-width: 480px; margin: 0 auto; padding: 0;
                 flex: 1; min-height: 0; display: flex; flex-direction: column;
                 border: 0; box-shadow: none; border-radius: 0;
                 /* Neon behind the sheet, so its rounded top corners have
                    something to show through. */
                 background: var(--accent); }
    /* position:relative so the ⋯ menu has something to hang off now that the
       bar is no longer sticky; z-index so it stays above the sheet's corners. */
    .topbar { flex: none; position: relative; z-index: 40; display: flex; align-items: center;
              gap: var(--s2); background: var(--accent); color: var(--on-accent);
              /* The green runs to the very top of the phone. The page paints
                 into the notch now (viewport-fit=cover), so the bar's own
                 padding carries the status bar rather than leaving a white
                 strip above it with the green starting underneath — which read
                 as a band stuck across the screen rather than as the top of
                 the app. Paying for the notch in padding also means the bar
                 itself can be shorter, which is where the room below came
                 from. */
              min-height: 52px; padding: var(--s2) var(--s4) var(--s2);
              padding-top: calc(var(--s2) + env(safe-area-inset-top, 0px)); }
    /* ...unless the staging strip is above it and has already paid for the
       notch. Two elements both adding the inset would leave a gap the height
       of the status bar. Live renders no strip, so this never matches there. */
    .envstrip ~ #app.shell .topbar { padding-top: var(--s2); }
    /* THE BOX. The only scrolling thing on the screen, and the only thing with
       a shape. Its bottom padding clears the floating nav and the gap the nav
       floats in — the page itself no longer scrolls, so it cannot carry that. */
/* Inverted: the ground is grey and the cards on it are white, so WHITE is
       what the eye reads as the content. It was the other way round — white
       page, grey boxes — which made every card read as a hole rather than as a
       thing sitting on the page. */
    .sheet { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
             background: var(--surface); border-radius: var(--r-lg) var(--r-lg) 0 0;
             padding: 0 var(--s3) calc(96px + env(safe-area-inset-bottom, 0px)); }
    /* The Powered by line is a sibling of #app in the shared shell, which with
       nothing scrolling would strand it under the floating nav. The script
       moves it inside the sheet instead — see app(). */
    .sheet .pby { margin-top: var(--s5); }
    .topbar img { width: 26px; height: 26px; border-radius: var(--r-sm); flex: none; }
    /* The shop name, centred. min-width:0 is what lets the ellipsis actually
       happen inside a flex row — without it a long name pushes the menu button
       off the end instead of truncating. */
    .topbar .shop { flex: 1; min-width: 0; text-align: center; font-family: var(--display);
                    font-weight: 800; font-size: var(--t-md); letter-spacing: var(--tr-lg);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar .dots { flex: none; width: 36px; height: 36px; border: 0; border-radius: 999px;
                    background: transparent; color: var(--on-accent); font-size: var(--t-lg);
                    /* Not type: the glyph is centred in a 36px circle, so the
                       line box has to be the glyph and nothing else. */
                    line-height: 1; cursor: pointer; padding: 0; }
    .topbar .dots:hover { background: rgba(12,14,13,.1); }
    /* INK, not neon, per rule 3 — the ring goes dark on a light ground, and
       #c9f73d is a light ground. A neon ring on neon is no ring at all. */
    .topbar .dots:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    /* The menu. It carries the login email, which is the only thing left on
       screen answering "which account am I in?" once the header stopped saying
       so, and it matters the moment somebody runs two shops. */
    .tmenu { position: absolute; top: calc(100% - 4px); right: 10px; z-index: 41; min-width: 210px;
             background: var(--bg); color: var(--ink); border: 1px solid var(--line);
             border-radius: var(--r); box-shadow: var(--shadow); padding: var(--s2); }
    .tmenu .mwho { font-size: var(--t-sm); color: var(--muted); padding: var(--s2) var(--s2) var(--s1);
                   word-break: break-all; border-bottom: 1px solid var(--line); margin-bottom: var(--s1); }
    .tmenu button { width: 100%; text-align: left; background: transparent; border: 0;
                    font: inherit; font-weight: 600; color: var(--ink); padding: var(--s2) var(--s3);
                    border-radius: var(--r-sm); cursor: pointer; }
    .tmenu button:hover { background: var(--surface); }

    /* The bottom bar — a pill that floats clear of the screen edges rather than
       a strip welded to the bottom. Fixed, because navigation that scrolls away
       is not navigation.

       It has a real border and a real shadow because it now sits ON the page
       rather than below it: content passes underneath, and without a lifted
       edge the two would read as one surface. */
    .botnav { position: fixed; left: 50%; transform: translateX(-50%);
              bottom: calc(12px + env(safe-area-inset-bottom, 0px));
              width: calc(100% - 28px); max-width: 420px; z-index: 40;
              display: flex; align-items: center; justify-content: space-between;
              gap: var(--s1); padding: var(--s2);
              background: var(--bg); border: 1px solid var(--line); border-radius: 999px;
              box-shadow: 0 10px 30px -10px rgba(12,14,13,.28), 0 2px 8px rgba(12,14,13,.06); }
    .botnav a { flex: 1; min-width: 0; display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: var(--s1);
                min-height: 52px; border-radius: 999px; text-decoration: none;
                /* The one --t-xs that is not uppercase. Five labels share one
                   pill on a 360px phone and "Customers" at --t-sm does not fit;
                   every phone sets its nav in sentence case anyway. */
                color: var(--muted); font-size: var(--t-xs); font-weight: 600;
                letter-spacing: var(--tr-code); padding: var(--s2) 0; }
    .botnav a svg { width: 20px; height: 20px; fill: none; stroke: currentColor;
                    stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    /* Active is marked by WEIGHT and ink, never by a fill. Three nav controls
       share this screen — this bar, Manage's tab pill and the designer's
       preview switch — and DESIGN.md's rule is that they differ by shape, so
       only one of them may be a filled pill. */
    .botnav a.on { color: var(--ink); font-weight: 800; }
    .botnav a.on svg { stroke-width: 2.4; }
    .botnav a:focus-visible { outline: 2px solid var(--ink); outline-offset: -3px; }
    /* The primary action. Inside the pill rather than raised out of it: a bar
       that already floats does not need a second thing floating off it. Its
       glyph is --on-accent and never white, for the same reason the header's
       text is. */
    .botnav .navadd { flex: 0 0 auto; padding: 0 var(--s1); }
    .botnav .navadd .plus { width: 42px; height: 42px; border-radius: 999px;
                            background: var(--accent); color: var(--on-accent);
                            display: flex; align-items: center; justify-content: center; }
    .botnav .navadd .plus svg { width: 22px; height: 22px; stroke: var(--on-accent); stroke-width: 2.6; }
    .botnav .navadd.on .plus { background: var(--accent-2); }
    /* The word under it would crowd a pill this size, and a (+) needs no label. */
    .botnav .navadd span:not(.plus) { display: none; }

    /* The toast is fixed to the viewport, so the sheet's bottom padding does
       nothing for it. baseCss pins it 24px from the bottom, which is inside the
       floating bar exactly. Lifted here rather than in baseCss: the stamper and
       the console read that too, and neither of them has a bottom bar. */
    body.shelled .toast { bottom: calc(104px + env(safe-area-inset-bottom, 0px)); }

    /* Rule 9 inverts with everything else. baseCss steps a ghost button inside
       a tinted box back to --bg, which was the step DOWN when boxes were grey.
       Inside a white card that is no step at all, so in here it goes to
       --surface. Alternate; never repeat. */
    body.shelled :is(.fold, .grp, .bucket, .mdetail) .btn-ghost { background: var(--surface); }
    body.shelled :is(.fold, .grp, .bucket, .mdetail) .btn-ghost:hover { background: var(--ghost-bg); }

    /* --- Home: one row per programme, and one line about the numbers --- */
    .prow { display: block; text-decoration: none; color: var(--ink);
            border-radius: var(--r); padding: var(--s3);
            margin-bottom: var(--s2); background: var(--bg); }
    /* Hover moves the FILL, since there is no longer a border to tint. */
    .prow:hover { background: var(--surface); }
    .ptop { display: flex; align-items: center; gap: var(--s2); }
    .ptop strong { font-size: var(--t-md); }
    /* Status sits at the far end, so the eye finds it in the same place on
       every row however long the name is. */
    .pstat { margin-left: auto; font-size: var(--t-xs); font-weight: 700; letter-spacing: var(--tr-caps);
             text-transform: uppercase; color: #15803d; background: #e9f7ee;
             border-radius: 999px; padding: var(--s1) var(--s2); white-space: nowrap; }
    /* Ended is not a failure and is not red: the programme did its job and
       stopped taking new sign-ups. Grey, like any other finished thing. */
    .pstat.off { color: var(--muted); background: var(--ghost-bg); }
    .pmeta { color: var(--muted); font-size: var(--t-sm); margin-top: var(--s1); }
    .pnums { display: flex; gap: var(--s3); margin-top: var(--s2); }
    .pnums span { font-size: var(--t-sm); color: var(--muted); }
    .pnums b { display: block; font-family: var(--display); font-weight: 800; font-size: var(--t-lg);
               line-height: var(--lh-num); letter-spacing: var(--tr-hero); font-variant-numeric: tabular-nums;
               color: var(--ink); }
    /* --- Customers: search, segment chips, and one row per person --- */
    .cfilter { display: flex; gap: var(--s2); flex-wrap: wrap; margin: var(--s3) 0 var(--s2); }
    .cfilter input[type="search"] { flex: 1; min-width: 160px; margin: 0; }
    .cfilter select { padding: var(--s2) var(--s3); border: 1px solid var(--field-border); border-radius: var(--r);
                      font: inherit; background: var(--bg); color: var(--ink); }
    /* Segment filters. Ink when chosen, never neon — the neon on this screen
       belongs to the next action, and a filter is not one. */
    .segchip { width: auto; padding: var(--s2) var(--s3); border-radius: 999px; border: 1px solid var(--field-border);
               background: var(--bg); color: var(--muted); font: inherit; font-size: var(--t-sm);
               font-weight: 600; cursor: pointer; }
    .segchip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    /* A person, as a row you can open. Four columns that line up down the list
       so the eye reads a column rather than re-reading each row. */
    /* A customer is a ROW in a list, not a card of its own. Sixty bordered boxes
       stacked down a screen is the shape this replaces: one block, with the
       hairline BETWEEN rows and never around them. */
    .ccard { display: flex; align-items: center; gap: var(--s2); text-decoration: none;
             color: var(--ink); padding: var(--s3); background: var(--bg); }
    .ccard:first-child { border-radius: var(--r) var(--r) 0 0; }
    .ccard:last-child { border-radius: 0 0 var(--r) var(--r); }
    .ccard:only-child { border-radius: var(--r); }
    .ccard + .ccard { box-shadow: inset 0 1px 0 var(--line); }
    .ccard:hover { background: var(--surface); }
    .ccard .cid { font-weight: 800; letter-spacing: var(--tr-code); font-family: var(--display); }
    .ccard .cprog { margin-left: auto; color: var(--muted); font-size: var(--t-sm);
                    font-variant-numeric: tabular-nums; }
    .ccard .cwhen { color: var(--muted); font-size: var(--t-sm); white-space: nowrap; }
    /* The segment, in the same four hues the tiles above use — read those, do
       not pick a fifth (DESIGN.md rule 6). */
    .cseg { font-size: var(--t-xs); font-weight: 700; letter-spacing: var(--tr-code); text-transform: uppercase;
            color: var(--hue); background: var(--hue-bg); border-radius: 999px; padding: var(--s1) var(--s2);
            white-space: nowrap; }
    h2 .cseg { margin-left: var(--s2); position: relative; top: -3px; }
    /* --- one customer: a label and its answer, per line --- */
    /* Label and answer, one per line, grouped into a single block — the shape a
       detail screen wants. The hairline sits between rows and the block itself
       is a fill, so a page of these reads as one object rather than a stack of
       ruled lines. */
    .drow { display: flex; align-items: baseline; gap: var(--s3);
            padding: var(--s3); background: var(--bg); font-size: var(--t-sm); }
    .drow:first-of-type { border-radius: var(--r) var(--r) 0 0; }
    .drow:last-of-type { border-radius: 0 0 var(--r) var(--r); }
    .drow + .drow { box-shadow: inset 0 1px 0 var(--line); }
    .drow span { color: var(--muted); }
    .drow b { margin-left: auto; text-align: right; }
    /* --- today at the counter --- */
    .acts { background: var(--bg); border-radius: var(--r); overflow: hidden; }
    .act { display: flex; gap: var(--s3); padding: var(--s3); font-size: var(--t-sm); }
    .act + .act { box-shadow: inset 0 1px 0 var(--line); }
    .act .at { color: var(--muted); font-variant-numeric: tabular-nums; min-width: 62px; }
    .act .aw strong { letter-spacing: var(--tr-code); }
    textarea { width: 100%; padding: var(--s2) var(--s3); border: 1px solid var(--field-border);
               border-radius: var(--r); font: inherit; resize: vertical; }
    /* --- Manage: the two lists, and one programme's page --- */
    #mtabs { margin: var(--s3) 0 0; }
    /* Shown once anyone is enrolled. A note, not a lock: changing a live
       programme is working behaviour — a card already in a wallet carries its
       own copy of the rules — so this explains what actually happens rather
       than disabling a field that is meant to work. */
    .locknote { background: var(--ghost-bg); border-radius: var(--r); padding: var(--s3);
                margin-top: var(--s3); font-size: var(--t-sm); line-height: var(--lh-read); color: var(--ink2); }
    /* Every programme has its own QR, which is the whole of "multiple
       programmes means multiple QRs" said in one picture. */
    /* The QR sits on a --surface block rather than being outlined. The code
       itself stays on white and keeps a quiet zone round it — that is a
       scanning requirement, not a style choice. */
    .qrbox { text-align: center; background: var(--bg); border-radius: var(--r);
             padding: var(--s4); margin: var(--s2) 0 var(--s1); }
    .qrbox img { width: 168px; height: 168px; image-rendering: pixelated;
                 border-radius: var(--r-sm); padding: var(--s2); background: #fff; }
    .qrbox p { margin: var(--s3) 0 0; }
    /* The armed state of a two-tap button. Deep red, the same one the counter
       uses — this is the app's one "you are about to do something" colour. */
    .btn.armed { background: #9a3412; color: #fff; border-color: #9a3412; }
    /* --- Create: pick a type, then set it up --- */
    .picks { display: flex; flex-direction: column; gap: var(--s2); margin-top: var(--s3); }
    /* A feature card: the choice deserves a sentence each, so it takes the
       roomier of the two card paddings. */
    .pick { display: grid; grid-template-columns: 1fr auto; align-items: center;
            gap: var(--s1) var(--s2); text-decoration: none; color: var(--ink);
            border-radius: var(--r); padding: var(--s4);
            background: var(--bg); }
    .pick:hover { background: var(--surface); }
    .pick strong { font-size: var(--t-md); }
    .pick .sub2 { grid-column: 1; color: var(--muted); font-size: var(--t-sm); line-height: var(--lh-read); }
    .pick .arr { grid-row: 1 / span 2; color: var(--muted); }
    /* Says the quiet part out loud: nothing on this screen is saved. Amber like
       the setup banner — nothing is broken, something is outstanding. */
    .draftnote { background: #fef3c7; color: #7c2d12; border: 1px solid #fcd34d;
                 border-radius: var(--r); padding: var(--s3); margin: var(--s3) 0;
                 font-size: var(--t-sm); line-height: var(--lh-read); }
    /* Three steps, so it is obvious there are three and which one you are on. */
    .steps { display: flex; gap: var(--s2); list-style: none; padding: 0; margin: var(--s3) 0 var(--s1);
             counter-reset: s; }
    .steps li { counter-increment: s; flex: 1; font-size: var(--t-xs); font-weight: 700;
                text-transform: uppercase;
                letter-spacing: var(--tr-caps); color: var(--muted); padding-top: 8px;
                border-top: 3px solid var(--line); }
    .steps li::before { content: counter(s) ". "; }
    .steps li.on { color: var(--ink); border-top-color: var(--ink); }
    /* The message, roughly as a phone shows it. A frame, not a picture of an
       iPhone: the point is the wording, and a photorealistic handset would
       promise a fidelity this preview does not have. */
    .phone { background: var(--slab); border-radius: var(--r-lg); padding: var(--s3); margin-top: var(--s2); }
    .pnote { background: var(--bg); border-radius: var(--r); padding: var(--s3); }
    .pnote strong { font-size: var(--t-sm); }
    .pnote p { margin: var(--s1) 0 0; font-size: var(--t-sm); line-height: var(--lh-read); }
    /* The logo, at the size a row can hold. Boxed on white because a logo made
       for a dark card is invisible on a light page otherwise. */
    .logothumb { height: 30px; max-width: 130px; object-fit: contain; background: #fff;
                 border: 1px solid var(--line); border-radius: var(--r-sm); padding: var(--s1) var(--s2);
                 vertical-align: middle; }
    .segwrap { margin: var(--s2) 0 var(--s1); }
    .segwrap .lbl { font-size: var(--t-sm); color: var(--muted); margin-bottom: var(--s2); }
    /* --- share tab --- */
    .sharelist { display: flex; flex-direction: column; gap: var(--s2); margin: var(--s2) 0 var(--s3); }
    .sharelist a { display: flex; justify-content: space-between; align-items: center; gap: var(--s2);
                   background: var(--bg); border-radius: var(--r); padding: var(--s3);
                   text-decoration: none; color: var(--ink); font-weight: 600; }
    .sharelist a:hover { background: var(--surface); }
    /* A row that is switched off. Still readable and still clickable — it goes
       to Shop, where the reason is — but it never takes the accent, because the
       accent means "the next thing to press" and this is not it (DESIGN.md). */
    .sharelist a.locked { opacity: .55; cursor: pointer; }
    .sharelist a.locked:hover { border-color: var(--line); }
    /* Block, not inline: on a phone the description otherwise wrapped between
       the title and the "open →" and the row read as three broken fragments. */
    .sharelist a .sub2 { display: block; font-weight: 400; color: var(--muted); font-size: var(--t-sm); margin-top: var(--s1); }
    .sharelist a .arr { white-space: nowrap; }
    .sharelist a .arr { color: var(--muted); }
    .sharelist { margin-bottom: var(--s2); }
    /* --- home: totals + per-card breakdown --- */
    /* Always four tiles, always 2×2 — a square hero card, not a row that
       stretches to four-across once a wider viewport allows it. Tracked spend
       stays IN the grid even with nothing to show yet (an em dash, not a
       missing tile): a metric that vanishes when it has no answer reads as
       broken, not as "not set up yet". */
    .totals { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s2); margin: var(--s3) 0; }
    .totals .metric { padding: var(--s3); }
    .totals .metric b { font-size: var(--t-xl); }
    /* Customer health: four more tiles under the four above, and the SAME size.
       They were smaller, on the theory that the shape of the base should read
       quieter than its size; on screen it just looked like two grids that had
       not been designed together. Colour is what separates them now. */
    .totals.health { margin-top: var(--s2); }
    .totals.health .metric { background: var(--hue-bg);
                             border-color: transparent; border-left: 3px solid var(--hue); }
    .totals.health .metric b { color: var(--hue); }
    /* The share of the base, beside the count and deliberately smaller: the
       count is the fact, the percentage is how to read it. Tabular so four
       tiles line up down the column instead of shuffling by digit width. */
    .totals.health .metric b i { font-style: normal; font-size: .48em; font-weight: 700;
                                 letter-spacing: var(--tr-body); margin-left: var(--s2); opacity: .72; }
    .totals.health .metric span { color: var(--ink2); font-weight: 600; }
    /* Semantic colour, rule 6 of DESIGN.md, plus the one blue this app has:
       these four are read against each other at a glance, and the hue does the
       sorting the eye would otherwise have to do by reading every label. */
    .h-regular   { --hue: #15803d; --hue-bg: #e9f7ee; }
    .h-returning { --hue: #1d4ed8; --hue-bg: #e9eefb; }
    .h-new       { --hue: #b45309; --hue-bg: #fdf4e3; }
    .h-lost      { --hue: #9a3412; --hue-bg: #fbedeb; }
    .breakdown { width: 100%; border-collapse: collapse; font-size: var(--t-sm);
                 margin-top: var(--s2); background: var(--bg); border-radius: var(--r);
                 overflow: hidden; }
    .breakdown th { text-align: left; color: var(--muted); font-size: var(--t-xs);
                    text-transform: uppercase; letter-spacing: var(--tr-caps); padding: var(--s3); }
    .breakdown td { padding: var(--s3); }
    .breakdown tr + tr td { box-shadow: inset 0 1px 0 var(--line); }
    .breakdown td.n { text-align: right; font-variant-numeric: tabular-nums; }
    .viewall { margin-top: var(--s3); }
    /* --- card picker (Cards + Share) --- */
    .cardpick { display: flex; gap: var(--s2); flex-wrap: wrap; margin: var(--s2) 0 var(--s4); }
    .cardpick button { width: auto; padding: var(--s2) var(--s3); border-radius: 999px; border: 1px solid var(--field-border);
                       background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
    .cardpick button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    /* --- customer rows (Customers view) — the dashboard's own card style --- */
    .pass { border-radius: var(--r); padding: var(--s3); margin-top: var(--s3);
            background: var(--bg); box-shadow: var(--shadow); }
    .pass strong { font-size: var(--t-md); }
    .pass .row { display: flex; gap: var(--s2); margin-top: var(--s3); }
    .pass .row .btn { width: auto; padding: var(--s2) var(--s3); font-size: var(--t-sm); }
    .ready { color: #1a7f37; font-weight: 700; }
    /* --- customers view: one collapsible section per recency group --- */
    .custctl { display: flex; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s1); }
    .custctl > div { flex: 1; min-width: 130px; }
    .grp { border-radius: var(--r); padding: 0 var(--s3) var(--s3); margin-bottom: var(--s2); background: var(--bg); }
    .grp summary { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; cursor: pointer;
                   padding: var(--s3) 0; font-weight: 700; list-style: none; }
    .grp summary::-webkit-details-marker { display: none; }
    .grp summary::before { content: "▸"; color: var(--muted); font-weight: 400; transition: transform .18s; }
    .grp[open] summary::before { transform: rotate(90deg); }
    .grp .gc { background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); border-radius: 999px;
               padding: var(--s1) var(--s2); font-size: var(--t-sm); font-variant-numeric: tabular-nums; }
    .grp .gh { color: var(--muted); font-weight: 400; font-size: var(--t-sm); }
    .grp .gnudge { width: auto; padding: var(--s2) var(--s3); font-size: var(--t-sm); margin-bottom: var(--s1); }
    /* Rows sit inside a group box already, so they're separated by a rule rather
       than being a second card-in-a-card. */
    .crow { padding: var(--s3) 0; box-shadow: inset 0 1px 0 var(--line); }
    .ctop { display: flex; align-items: center; gap: var(--s2); }
    .ctop strong { font-size: var(--t-md); letter-spacing: var(--tr-code); }
    .cprog { flex: 1; color: var(--muted); font-size: var(--t-sm); font-variant-numeric: tabular-nums; }
    .cn { width: auto; padding: var(--s2) var(--s3); font-size: var(--t-sm); }
    .cmeta { color: var(--muted); font-size: var(--t-sm); margin-top: var(--s1); }
    .warn { color: #9a3412; font-weight: 600; }
    /* "Your counter can't stamp yet." Its own class, not .warn: that one is a
       colour applied to a word inside a row, and giving it a box here would put
       a box round every one of them. Amber rather than red — nothing is broken,
       a step is outstanding — and the button is ghost, because the neon one on
       the page belongs to whatever the owner came here to do (DESIGN.md 1). */
    /* The gap between the top bar and whatever screen is under it. The banner
       takes it when there is one, so the two never stack their margins. */
    #pinwarn:not(:empty), #screen { margin-top: var(--s4); }
    #pinwarn:not(:empty) + #screen { margin-top: 0; }
    .pinwarn { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2);
               background: #fef3c7; color: #7c2d12; border: 1px solid #fcd34d;
               border-radius: var(--r); padding: var(--s3); margin-bottom: var(--s3);
               font-size: var(--t-sm); line-height: var(--lh-read); }
    .pinwarn p { margin: 0; flex: 1; min-width: 200px; }
    .pinwarn .btn { width: auto; padding: var(--s2) var(--s3); font-size: var(--t-sm); flex: none;
                    background: #fff; border-color: #d9a441; color: #7c2d12; }
    /* --- Customers: one standalone row per lapse cohort (not a collapsible) --- */
    .bucket { border-radius: var(--r); padding: var(--s3);
              margin-bottom: var(--s2); background: var(--bg); }
    .bucket .cprog { text-align: right; padding-right: 6px; }
    .bucket .cn:disabled { opacity: .4; }
    /* --- a value shown exactly once (a new PIN) --- */
    .temp { font-family: ui-monospace, Menlo, monospace; background: var(--ghost-bg); padding: var(--s2) var(--s3);
            border-radius: var(--r-sm); margin-top: var(--s2); font-size: var(--t-sm); line-height: var(--lh-read); }
    /* --- Card tab: Design / Rules section headings --- */
    /* Sections are separated by SPACE and a heading, never by a rule. A line
       above every heading is most of what made this read as a wiki page. */
    .sec { font-size: var(--t-lg); line-height: var(--lh-tight);
           margin: var(--s5) 0 var(--s3); }
    /* --- counter activity: facts, and nothing that looks like a verdict --- */
    /* Deliberately has no state styling at all. There is no red, no bold-on-
       threshold, no chip: the moment one number can look different from
       another, the screen starts telling the owner what to think, which is the
       one thing it must not do. One weight, one colour, every row. */
    /* Two rows of three, not six lines. Every cell is the same size and the
       same weight whatever its number says — the moment one can look louder
       than another, the screen starts having an opinion. */
    .cact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: var(--s1) 0 var(--s1);
            background: var(--line); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
    /* White cells, because the grid opens inside a tinted fold and --surface on
       --surface left six invisible boxes. The 1px gaps ARE the --line grid
       showing through, so the cells have to be a colour that differs from it. */
    .cact .ccell { background: var(--bg); border: none; font: inherit; color: var(--ink);
                   text-align: left; padding: var(--s2) var(--s3); min-width: 0; }
    .cact button.ccell { cursor: pointer; }
    .cact button.ccell:hover { background: var(--surface); }
    /* Display 800, tabular — the same treatment as the hero metrics, because
       these are metrics. Every cell gets it equally: the weight says "this is a
       number", never "this number is the interesting one". */
    .cact .cn { display: block; font-family: var(--display); font-weight: 800; font-size: var(--t-xl);
                line-height: var(--lh-num); letter-spacing: var(--tr-hero); font-variant-numeric: tabular-nums; }
    .cact .cl { display: block; margin-top: var(--s1); font-size: var(--t-sm); color: var(--muted); line-height: var(--lh-body); }
    .cact .cgo { color: var(--muted); font-size: var(--t-sm); }
    .clist { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
    .clist th { text-align: left; color: var(--muted); font-size: var(--t-xs); text-transform: uppercase;
                letter-spacing: var(--tr-caps); padding: var(--s2) var(--s2) var(--s2) 0; }
    .clist td { padding: var(--s2) var(--s2) var(--s2) 0; vertical-align: top; }
    .clist tr + tr td { box-shadow: inset 0 1px 0 var(--line); }
    .clist td.mono { font-family: ui-monospace, Menlo, monospace; font-size: var(--t-sm); }
    .sec.first { margin-top: 0; }
    /* Design is a set-it-once job, so it folds away (.fold lives in
       DESIGN_PANEL_CSS, with the panel that emits it). Rules — the reward, the
       stamp count, the win-back — is what owners come back to, and stays open. */
    /* --- show-password toggle --- */
    .eye { display: flex; align-items: center; gap: var(--s2); font-size: var(--t-sm); color: var(--muted); margin: var(--s2) 0 0; }
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

    // ---- Shop: every link you hand out, then the counter, then your login ----
    // The links used to sit under the card designer, which put "print this for
    // the counter" on the page you visit to change a colour. They are all
    // set-up-once things, so they live together, split by who they are for.
    /**
     * Shop — everything you set once and then forget.
     *
     * Three sections: what the shop is, who stamps for it, and the login that
     * owns it. The sharing links that used to sit here moved to the programme
     * they share: a poster is a fact about one programme, and once a shop can
     * have more than one, "the" sign-up link stops meaning anything.
     */
    /**
     * What the account IS, in the owner's words rather than the column's.
     *
     * All four read S.account and nothing else, so there is one answer on the
     * screen and it is the server's. No account block (an operator looking at
     * something odd) reads as a dash rather than an invented plan.
     */
    function planLabel() {
      if (!S.account) return "\u2014";
      return S.account.plan === "pro" ? "Pro \u2014 RM79 a month" : "Free";
    }
    function statusLabel() {
      if (!S.account) return "\u2014";
      return S.account.status === "suspended" ? "Suspended" : "Active";
    }
    function trialLabel() {
      if (!S.account) return "\u2014";
      if (S.account.plan === "pro") return "Not on trial";
      // A shop nobody has stamped at has not STARTED a trial. Counting down
      // from signup would run the clock on the shops that never got going,
      // which are the ones least deserving of losing anything.
      if (!S.account.trialStarted) return "Starts at your first stamp";
      if (!S.account.trialEndsAt) return "\u2014";
      const d = new Date(S.account.trialEndsAt);
      const over = d.getTime() <= Date.now();
      return (over ? "Ended " : "") +
        d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    }
    function planNote() {
      if (!S.account) return "";
      if (S.account.plan === "pro") return "Billing is not switched on yet, so nothing is charged.";
      if (!campaignsAllowed()) {
        return "Your free trial has ended, so campaigns are switched off. Everything else \u2014 " +
          "your card, your stamps and your rewards \u2014 keeps working exactly as it did.";
      }
      return "First month free. Billing is not switched on yet, so nothing is charged.";
    }

    /**
     * The one place this page asks whether campaigns are on.
     *
     * The SERVER decided it and sent the answer; this only reads it. Defaulting
     * to allowed matters: an older server that sends no account block must not
     * silently switch a paying shop's campaigns off, and the endpoints behind
     * them check the plan again anyway, so an optimistic browser cannot let
     * anything through.
     */
    function campaignsAllowed() {
      return !S.account || !S.account.allows || S.account.allows.campaigns !== false;
    }

    function accountPanel() {
      const div = document.createElement("div");
      const c = S.cards[0] || {};
      const artBase = c.id === "default" ? "" : "/c/" + (c.id || "");
      div.innerHTML = \`
        <h2 class="sec first">Shop information</h2>
        <!-- Shown, and edited one tap away rather than here. The name and the
             logo are already fields in the card designer, and two boxes setting
             one value is how they come to disagree. -->
        <div class="drow"><span>Shop name</span><b>\${esc(c.shopName || c.name || "—")}</b></div>
        <div class="drow"><span>Logo</span><b><img class="logothumb" alt="" src="\${artBase}/art/logo.png?v=\${c.logoVersion || 0}"></b></div>
        <p class="muted">The name and the logo are part of your card, so they are set where the
          card is — <a href="#" data-golook>on your programme’s page</a>.</p>

        <label style="margin-top:18px">Visit frequency</label>
        <p class="muted">How often should a customer come back?\${info("How often you'd expect a regular to come in. It only sorts your customers into New, Returning, Regular and Lost on the Customers screen. It changes nothing about your card, your stamps or your reward.")}</p>
        <select data-cycle style="margin-top:8px">
          <option value="">Choose one…</option>
          <option value="14">Once every 1–2 weeks</option>
          <option value="21">Once every 2–3 weeks</option>
          <option value="28">Once every 3–4 weeks</option>
        </select>
        <p class="muted" data-cycleout style="margin:6px 0 0;font-size:.84rem"></p>

        <h2 class="sec">Staff</h2>
        <p class="muted">Staff use the stamper to punch cards.\${info("One PIN for your whole counter. It is stored scrambled, so nobody can look it up. Setting a new one signs every staff phone out.")}</p>
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

        <h2 class="sec">Account</h2>
        <label>Signed in as</label>
        <p style="font-weight:600;margin-bottom:6px">\${S.email}</p>
        <label style="margin-top:10px">Change password</label>
        <input data-cur type="password" placeholder="Current password" autocomplete="current-password">
        <input data-new type="password" placeholder="New password (min 8)" autocomplete="new-password" style="margin-top:8px">
        <label class="eye"><input type="checkbox" data-eye="[data-cur],[data-new]"> Show passwords</label>
        <button class="btn btn-dark" style="margin-top:20px" data-pwsave>Update password</button>

        <!-- Real, all three: merchants.plan, merchants.archived_at, and the
             trial deadline (stored on the shop, or derived from its first
             stamp). Billing itself is still not built — no card is charged —
             but what the account IS no longer comes from a mock. -->
        <h2 class="sec">Plan</h2>
        <div class="drow"><span>Plan</span><b>\${planLabel()}</b></div>
        <div class="drow"><span>Status</span><b>\${statusLabel()}</b></div>
        <div class="drow"><span>Trial ends</span><b>\${trialLabel()}</b></div>
        <p class="muted">\${planNote()}</p>

        <p class="muted" style="margin-top:22px">Signing out is in the ⋯ menu, top right.</p>\`;
      const look = div.querySelector("[data-golook]");
      if (look) look.onclick = (e) => { e.preventDefault(); navigate("/manage/rewards/" + c.id); };
      wireEyes(div);
      // No wireInfo here: render() delegates from the screen this sits inside,
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
      const sheet = document.querySelector(".sheet");
      if (sheet) sheet.scrollTop = 0;
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
      // The server's answer about the plan, kept whole. Never recomputed here:
      // The allows flag decides what this dashboard offers, and a browser that
      // its own gate out is a gate anyone can switch off in devtools.
      S.account = body.account || null;
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
        '<div class="sheet"><div id="pinwarn"></div><div id="screen"></div></div>' +
        botNavHtml();
      // The shared shell prints "Powered by PunchMe" as a sibling of #app. With
      // nothing outside the sheet scrolling, that would strand it off-screen
      // under the floating nav, so it moves inside the thing that does scroll.
      const pby = document.querySelector("body > .pby");
      if (pby) $(".sheet").appendChild(pby);
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
        if (!params) continue;
        // A screen that throws used to render NOTHING, which looks exactly
        // like a screen with nothing on it — which is how a handler wired to a
        // button that had been deleted sat on the Shop screen unnoticed. Say
        // it broke, and leave the navigation working so there is a way out.
        try {
          el = build(params);
        } catch (e) {
          console.error("[dashboard] screen failed:", S.path, e);
          el = brokenScreen();
        }
        break;
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

    /** A screen that threw. Honest, and never a blank page. */
    function brokenScreen() {
      const d = document.createElement("div");
      d.innerHTML = '<h2 class="sec first">This screen didn’t load</h2>' +
        '<p class="muted">Something went wrong drawing it. The rest of the dashboard still works.</p>' +
        '<button class="btn btn-ghost" style="width:auto;margin-top:var(--s3)" data-retry>Try again</button>';
      d.querySelector("[data-retry]").onclick = () => render();
      return d;
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
    /**
     * Home.
     *
     * A heading, the window everything is measured over, two figures and one
     * chart. It carried four tiles, a sign-ups sparkline, a sentence of
     * commentary, the programme list and a campaigns block; the founder asked
     * for the short version, and Manage still holds the programmes and the
     * campaigns, so nothing here was the only way to reach anything.
     *
     * ONE request fills the whole screen (/api/series). The tiles and the chart
     * therefore cannot disagree about the window, which is the failure this
     * codebase has had twice — a headline and the list under it answering the
     * same question differently because each fetched its own numbers.
     */
    function homeScreen() {
      const d = document.createElement("div");
      // Named so its headings can be a rank bigger than every other screen's
      // without a rule that reaches out and resizes theirs too.
      d.className = "home";
      d.innerHTML =
        '<div class="homehead"><h2 class="sec first">Dashboard</h2>' +
          '<div class="seg winsel" data-win>' +
            '<span class="thumb"></span>' +
            '<button class="on" data-w="7" type="button">7d</button>' +
            '<button data-w="30" type="button">30d</button>' +
            '<button data-w="all" type="button">All</button>' +
          "</div>" +
        "</div>" +
        '<div class="metrics" data-totals></div>' +
        '<div data-chart></div>' +
        '<h2 class="sec">Programmes' + EG + "</h2>" +
        '<div data-programs></div>' +
        '<h2 class="sec">Campaigns' + EG + "</h2>" +
        '<div data-campaigns></div>';

      const totals = d.querySelector("[data-totals]");
      const chart = d.querySelector("[data-chart]");
      const seg = d.querySelector("[data-win]");
      d.querySelector("[data-programs]").innerHTML = homeProgrammes();
      d.querySelector("[data-campaigns]").innerHTML = homeCampaigns();

      const tile = (label, value, change, note) =>
        '<div class="metric"><span class="mlabel">' + label + "</span>" +
        '<div class="mrow"><b>' + value + "</b>" + change + "</div>" +
        '<span class="mnote">' + note + "</span></div>";

      /**
       * The change since the start of the window, coloured by direction.
       *
       * Both figures are STOCKS — where the number stands now, and where the
       * same number stood a week ago — so this is a subtraction and not a
       * comparison of two different measures. All-time has nothing before it,
       * and says so rather than showing a confident zero.
       */
      function delta(now, before, fmt) {
        if (before === null || before === undefined) return "";
        const diff = now - before;
        const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
        const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
        return '<span class="delta ' + dir + '">' + sign + fmt(Math.abs(diff)) + "</span>";
      }

      const plain = (n) => n.toLocaleString();

      function paint(s) {
        // All-time has nothing before it, and says so rather than showing a
        // confident zero change.
        const word = s.window === 30 ? "vs last month" : s.window === 7 ? "vs last week" : "all time";
        const cur = s.currency || "RM";
        const money = (cents) => Math.round(cents / 100).toLocaleString();
        totals.innerHTML =
          tile("Customers", plain(s.customers.now),
               delta(s.customers.now, s.customers.before, plain), word) +
          tile("Loyalty revenue (" + esc(cur) + ")", money(s.revenueCents.now),
               delta(s.revenueCents.now, s.revenueCents.before, money), word);
        shopChart(chart, s);
      }

      /** Nothing on screen until the numbers land, rather than zeros that move. */
      totals.innerHTML = tile("Customers", "—", "", "") +
        tile("Loyalty revenue (RM)", "—", "", "");

      let live = 0;
      async function load(win) {
        const mine = ++live;
        const { body } = await api("/series?window=" + win);
        // A slow first request must not overwrite a faster second one: tapping
        // 7 → 30 → 7 can land out of order, and the tiles would then disagree
        // with the tab that is lit.
        if (mine !== live) return;
        if (body && body.ok && body.series) paint(body.series);
      }
      load("7");

      seg.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-w]");
        if (!b || b.classList.contains("on")) return;
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        moveThumb(seg);
        load(b.dataset.w);
      });
      // Not moveThumb(seg) here: this element is not in the document yet, so
      // offsetWidth is 0 and the highlight is drawn zero pixels wide — which is
      // why the selector looked like it had nothing selected until you tapped
      // it. One frame later it has been laid out and can be measured.
      requestAnimationFrame(() => moveThumb(seg));
      return d;
    }

    /**
     * One row: a name and its type on the left, one figure and its share on the
     * right. The same shape serves programmes and campaigns, because they are
     * the same question asked twice — how is this one doing against the others.
     */
    function summaryRow(r) {
      const inner =
        '<span class="sl"><span class="sn">' + esc(r.name) + "</span>" +
          '<span class="st">' + esc(r.type) + "</span></span>" +
        '<span class="sr"><span class="sv">' + r.value + "<i> " + esc(r.unit) + "</i></span>" +
          '<span class="sp">' + esc(r.share) + "</span></span>";
      // No chip and no dimming on the row itself. Both sections carry ONE
      // "Example" on their heading instead — a chip on every row was more
      // marking than reading, and the founder asked for the quiet version.
      return r.href
        ? '<a class="srow" href="' + ROOT + r.href + '" data-nav="' + r.href + '">' + inner + "</a>"
        : '<div class="srow">' + inner + "</div>";
    }

    /** A share of a total, without dividing by zero and without a bare "0%". */
    function shareOf(part, total, suffix) {
      if (!total) return "—";
      return Math.round((part / total) * 100) + "% " + suffix;
    }

    /**
     * Programmes: customers, and what share of them each one holds.
     *
     * Counted per PERSON, the same definition as everywhere else (invariant 5)
     * — c.metrics.active, so somebody holding an Apple and a Google card of the
     * same programme is one customer here as well.
     *
     * The share is of every programme's customers ADDED TOGETHER, not of the
     * headline figure above. Those two are different totals on purpose: a
     * person on two programmes is one customer to the shop and belongs to both
     * rows, so the rows sum to memberships. Dividing by the headline instead
     * would let the shares add up past 100%, which is the worse of the two
     * lies. It is also why the list is not offered as a breakdown of the
     * number above it.
     */
    function homeProgrammes() {
      const real = S.cards.map((c) => ({
        href: "/manage/rewards/" + c.id,
        name: c.shopName || c.name,
        type: KIND_LABEL[c.kind] || "Stamps",
        customers: c.metrics.active,
      }));
      const eg = MOCK_PROGRAMS.map((m) => ({
        href: "/manage/rewards/" + m.id,
        name: m.name,
        type: (KIND_LABEL[m.kind] || "Stamps") + (m.status === "ended" ? " · Ended" : ""),
        customers: m.customers,
      }));
      const all = real.concat(eg);
      const total = all.reduce((a, r) => a + r.customers, 0);
      if (!all.length) return '<div class="slist"><p class="slistempty">No programmes yet.</p></div>';
      return '<div class="slist">' + all.map((r) => summaryRow({
        href: r.href, name: r.name, type: r.type,
        value: r.customers.toLocaleString(), unit: r.customers === 1 ? "customer" : "customers",
        share: shareOf(r.customers, total, "of customers"),
      })).join("") + "</div>";
    }

    /**
     * Campaigns: how many came back, and what share of the people it was sent
     * to that is — the return rate, which is the only number that says whether
     * a campaign worked. Entirely example data: there is no campaign table.
     */
    function homeCampaigns() {
      return '<div class="slist">' + MOCK_CAMPAIGNS.map((c) => summaryRow({
        href: "/manage/campaigns/" + c.id,
        name: c.name,
        type: c.type + (c.status === "ended" ? " · Ended" : ""),
        value: c.returned.toLocaleString(), unit: "returned",
        share: shareOf(c.returned, c.targeted, "return rate"),
      })).join("") + "</div>";
    }

    /**
     * The one chart: visits and rewards, on one pair of axes, tappable.
     *
     * Both series share a y-scale so the two can be read against each other —
     * that is the whole reason they are in one chart rather than two. They are
     * told apart by FILL as well as colour: visits carry a filled area, rewards
     * are a bare line. Colour alone would exclude anyone who cannot separate
     * these two hues.
     *
     * The paths are drawn into a viewBox that is STRETCHED to the card's width
     * (preserveAspectRatio="none"), which keeps the geometry simple but would
     * squash a circle into an ellipse. So the marker and its two dots are plain
     * HTML positioned in percentages over the top, not SVG.
     */
    function shopChart(host, s) {
      if (!host) return;
      const pts = s.points || [];
      const vis = pts.map((p) => p.visits);
      const rew = pts.map((p) => p.rewards);
      const totalV = vis.reduce((a, n) => a + n, 0);
      const totalR = rew.reduce((a, n) => a + n, 0);
      const fig = (cls, label, n) =>
        '<div class="cfig"><span class="mlabel"><i class="sw ' + cls + '"></i>' + label + "</span>" +
        "<b>" + n.toLocaleString() + "</b></div>";
      const keys = '<div class="chartfigs">' +
        fig("v", "Visits", totalV) + fig("r", "Rewards", totalR) + "</div>";

      // Two points make a line; one does not, and a flat run of zeros drawn
      // along the floor reads as a collapse rather than as an empty shop.
      if (pts.length < 2 || (!totalV && !totalR)) {
        host.innerHTML = '<div class="chart">' + keys +
          '<p class="chartempty">No stamps in this window yet. The chart fills in ' +
          "as your counter is used.</p></div>";
        return;
      }

      const g = chartGeometry(vis, rew);

      host.innerHTML =
        '<div class="chart">' + keys +
          '<div class="chartwrap" data-wrap>' +
            '<svg viewBox="' + g.box + '" preserveAspectRatio="none" ' +
              'aria-hidden="true" focusable="false">' +
              '<defs><linearGradient id="pmChartFade" x1="0" y1="0" x2="0" y2="1">' +
                '<stop class="cg0" offset="0"></stop><stop class="cg1" offset="1"></stop>' +
              "</linearGradient></defs>" +
              '<path class="carea" d="' + g.area + '"></path>' +
              '<path class="cvis" d="' + g.vis + '"></path>' +
              '<path class="crew" d="' + g.rew + '"></path>' +
            "</svg>" +
            '<span class="cmark hidden" data-mark></span>' +
            '<span class="cdot v hidden" data-dotv></span>' +
            '<span class="cdot r hidden" data-dotr></span>' +
            '<div class="ctip hidden" data-tip></div>' +
          "</div>" +
          '<div class="chartax">' +
            "<span>" + esc(edgeLabel(pts[0].at, s.bucketDays)) + "</span>" +
            "<span>" + esc(edgeLabel(pts[Math.floor((pts.length - 1) / 2)].at, s.bucketDays)) + "</span>" +
            "<span>" + esc(edgeLabel(pts[pts.length - 1].at, s.bucketDays)) + "</span>" +
          "</div>" +
        "</div>";

      const wrap = host.querySelector("[data-wrap]");
      const mark = host.querySelector("[data-mark]");
      const dotV = host.querySelector("[data-dotv]");
      const dotR = host.querySelector("[data-dotr]");
      const tip = host.querySelector("[data-tip]");
      const floating = [mark, dotV, dotR, tip];

      function clear() {
        floating.forEach((el) => el.classList.add("hidden"));
      }

      function show(i) {
        const p = pts[i];
        tip.innerHTML =
          '<span class="cd">' + esc(bucketLabel(p.at, s.bucketDays)) + "</span>" +
          '<span class="cr"><i class="sw v"></i>Visits<b>' + p.visits + "</b></span>" +
          '<span class="cr"><i class="sw r"></i>Rewards<b>' + p.rewards + "</b></span>";
        mark.style.left = g.left[i] + "%";
        dotV.style.left = g.left[i] + "%";
        dotR.style.left = g.left[i] + "%";
        dotV.style.top = g.topV[i] + "%";
        dotR.style.top = g.topR[i] + "%";
        floating.forEach((el) => el.classList.remove("hidden"));
        placeTip(i);
      }

      /**
       * The tooltip sits over the point, above the higher of the two dots.
       *
       * Measured rather than guessed, because it is wider than the gap at
       * either end of the chart: left at 0% would hang half of it off the side
       * of the card, where it is clipped and unreadable. Near the top it flips
       * underneath instead, for the same reason.
       */
      function placeTip(i) {
        const wide = wrap.clientWidth || 1;
        const tall = wrap.clientHeight || 1;
        const w = tip.offsetWidth;
        const half = w / 2 + 4;
        const wanted = (g.left[i] / 100) * wide;
        tip.style.left = Math.max(half, Math.min(wide - half, wanted)) + "px";
        const topPct = Math.min(g.topV[i], g.topR[i]);
        const above = (topPct / 100) * tall - 12;
        const below = above + tip.offsetHeight + 36;
        const flip = above < tip.offsetHeight;
        tip.style.top = (flip ? below : above) + "px";
        tip.style.transform = flip ? "translate(-50%, 0)" : "translate(-50%, -100%)";
      }

      function pick(e) {
        const r = wrap.getBoundingClientRect();
        if (!r.width) return;
        const f = (e.clientX - r.left) / r.width;
        show(Math.max(0, Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))));
      }

      // A finger reports no buttons, so dragging is tracked with a flag rather
      // than read off the event. Pointer capture keeps the readout following a
      // finger that slides off the side of the card mid-drag.
      let down = false;
      wrap.addEventListener("pointerdown", (e) => {
        down = true;
        if (wrap.setPointerCapture) wrap.setPointerCapture(e.pointerId);
        pick(e);
      });
      wrap.addEventListener("pointermove", (e) => { if (down) pick(e); });
      wrap.addEventListener("pointerup", () => { down = false; });
      wrap.addEventListener("pointercancel", () => { down = false; });
      // A mouse leaving puts the summary back; a finger lifting does not, so
      // the number stays readable after the finger that chose it has gone.
      wrap.addEventListener("mouseleave", () => { if (!down) clear(); });
      clear();
    }

    /**
     * Where every point sits. Separated from the drawing so it can be run
     * without a DOM — the failure modes of chart maths are all silent. A NaN
     * anywhere in a path makes the WHOLE svg vanish, with no error, and a
     * divide-by-zero on an all-quiet window is the easiest way to produce one.
     *
     * Both series share one y-scale, which is the reason they are in one chart:
     * scaled separately, two rewards and two hundred visits would draw the same
     * height and the picture would be a lie.
     *
     * Positions come back as PERCENTAGES because the marker and its dots are
     * HTML over the top of a stretched viewBox, not SVG inside it.
     */
    function chartGeometry(rawVis, rawRew) {
      // Clean BEFORE taking the maximum, not inside the y function. One NaN
      // anywhere makes Math.max return NaN, which makes every coordinate NaN,
      // which makes the browser drop the whole svg — silently, with a
      // correct-looking card and no chart in it.
      const num = (a) => (a || []).map((v) => {
        const n = Number(v);
        return isFinite(n) && n > 0 ? n : 0;
      });
      const vis = num(rawVis), rew = num(rawRew);
      const n = vis.length;
      const W = 320, H = 132, padY = 10;
      // Floor the scale at 1: a window where nothing happened divides by zero.
      const max = Math.max(1, Math.max.apply(null, vis.concat(rew, [0])));
      const xAt = (i) => (n > 1 ? (i * W) / (n - 1) : 0);
      const yAt = (v) => H - padY - (v / max) * (H - padY * 2);
      const path = (a) =>
        a.map((v, i) => (i ? "L" : "M") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1)).join(" ");
      const visLine = path(vis);
      return {
        box: "0 0 " + W + " " + H,
        vis: visLine,
        rew: path(rew),
        // Closed on the ZERO line, not on the bottom of the box. Closing at
        // H hangs the fill ten pixels BELOW zero, which draws a green band
        // under a day with nothing in it and reads as a negative number.
        area: visLine + " L" + W + " " + yAt(0).toFixed(1) + " L0 " + yAt(0).toFixed(1) + " Z",
        left: vis.map((_, i) => (xAt(i) / W) * 100),
        topV: vis.map((v) => (yAt(v) / H) * 100),
        topR: rew.map((v) => (yAt(v) / H) * 100),
      };
    }

    /** "Mon 25 Aug", or the week it starts. Used in the readout. */
    function bucketLabel(iso, bucketDays) {
      const d = new Date(iso);
      if (!isFinite(d.getTime())) return "";
      return bucketDays > 1
        ? "Week of " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
        : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    }

    /** The left-hand end of the axis. Shorter than the readout — it is a scale. */
    function edgeLabel(iso, bucketDays) {
      const d = new Date(iso);
      if (!isFinite(d.getTime())) return "";
      return d.toLocaleDateString(undefined,
        bucketDays > 1 ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" });
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
     * Everything here is real, the marketing state included. It used to be an
     * Example chip: there was no consent column, and a switch that looked live
     * but did not stop messages would have been this product lying about
     * consent on the one subject its privacy page makes a promise about. There
     * is a column now (customers.opted_out_at) and the state below is read from
     * it.
     *
     * It is READ-ONLY here, and that is the point. Only the customer may change
     * it, from the link on the back of their own card — an owner who could
     * switch someone's consent back on from a dashboard would make the whole
     * mechanism worthless.
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
        // Same order canNudge refuses in, so the screen and the server never
        // give different reasons for the same person.
        const reach = x.optedOut
          ? ["Asked not to be messaged",
             "They turned marketing off from their own card. Only they can turn it " +
             "back on. Stamps still reach them normally."]
          : x.removed
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
          '<div class="drow"><span>Marketing messages</span><b>' +
            (x.optedOut ? "Off" : "On") + "</b></div>" +
          '<p class="muted">' + (x.optedOut
            ? "They switched this off themselves. You cannot switch it back on — " +
              "only they can, from the link on the back of their card."
            : "They can turn this off themselves from the back of their card. " +
              "Being stamped still notifies them either way.") + "</p>" +
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
          // Shown either way, and greyed rather than hidden when the trial has
          // run out: a feature that silently disappears reads as a bug, and an
          // owner cannot decide to pay for something they can no longer see.
          (campaignsAllowed()
            ? '<a href="' + ROOT + '/create/campaign" data-nav="/create/campaign">' +
                '<span>Campaign<span class="sub2">Bring customers back with a message</span></span>' +
                '<span class="arr">→</span></a>'
            : '<a class="locked" aria-disabled="true" data-golocked>' +
                '<span>Campaign<span class="sub2">Your free trial has ended</span></span>' +
                '<span class="arr">🔒</span></a>') +
        "</div>";
      const locked = d.querySelector("[data-golocked]");
      if (locked) locked.onclick = (e) => { e.preventDefault(); navigate("/shop"); };
      wireLinks(d);
      return d;
    }

    /**
     * The four reward types, and they are the four the database already holds
     * (CardKind: stamp / milestones / membership / points). Labelling them from
     * the same four means wiring this up later is a rename, not a migration.
     */
    const REWARD_TYPES = [
      { k: "stamp", name: "Stamps", blurb: "Collect a stamp a visit. Fill the card, get the reward. The one most shops want." },
      { k: "milestones", name: "Stamps + milestones", blurb: "The same card, with a smaller reward on the way — something at 4, the big one at 10." },
      { k: "membership", name: "Membership", blurb: "A card that is the perk itself: a members' price, a members' menu, a members' door." },
      { k: "points", name: "Points", blurb: "Points for what they spend, traded in for rewards. Best where baskets differ a lot." },
    ];

    /**
     * The four campaign types. All four run the same three steps and the same
     * sender; the first three arrive with the audience and the wording already
     * suggested, which is the whole of what makes them different today.
     */
    const CAMPAIGN_TYPES = [
      { k: "winback", name: "Win-back", blurb: "For customers who have stopped coming. One message asking them back.",
        seg: "lost", msg: "We haven’t seen you in a while — your card is still here, and so is your next reward." },
      { k: "quiet", name: "Quiet period", blurb: "For filling a slow afternoon. Aimed at the people who already come in.",
        seg: "regular", msg: "It’s quiet this afternoon — come in and we’ll look after you." },
      { k: "progress", name: "Progress reminder", blurb: "For customers part-way to a reward, to nudge them over the line.",
        seg: "returning", msg: "You’re close — a couple more visits and your reward is yours." },
      { k: "custom", name: "Custom", blurb: "Your own message, to whichever group you choose.",
        seg: "", msg: "" },
    ];

    /** Pick a type. Cards, because the choice deserves a sentence each. */
    function createPickScreen(kind) {
      if (kind !== "reward" && kind !== "campaign") return notFoundScreen();
      // Every campaign address is real and refreshable, so the gate has to live
      // on the SCREEN and not only on the tile that links to it — a bookmark
      // from during the trial would otherwise walk straight past it.
      if (kind === "campaign" && !campaignsAllowed()) {
        return placeholder(
          "Campaigns have paused",
          "Your free trial has ended, so campaigns are switched off. Your card, your stamps " +
          "and your rewards all keep working exactly as they did \u2014 nothing your customers " +
          "hold has changed. The Shop tab shows where your account stands.",
        );
      }
      const reward = kind === "reward";
      const types = reward ? REWARD_TYPES : CAMPAIGN_TYPES;
      const d = document.createElement("div");
      d.innerHTML =
        '<p class="muted" data-back style="margin:0 0 6px;cursor:pointer">← Create</p>' +
        '<h2 class="sec first">' + (reward ? "What kind of programme?" : "What kind of campaign?") + "</h2>" +
        '<p class="muted">' + (reward
          ? "Pick the shape of the card. You can see exactly what it will look like before anything is made."
          : "Pick what you are trying to do. You choose who it goes to and what it says next.") + "</p>" +
        '<div class="picks">' + types.map((t) =>
          '<a class="pick" href="' + ROOT + "/create/" + kind + "/" + t.k +
          '" data-nav="/create/' + kind + "/" + t.k + '">' +
          "<strong>" + esc(t.name) + "</strong>" +
          '<span class="sub2">' + esc(t.blurb) + "</span>" +
          '<span class="arr">→</span></a>',
        ).join("") + "</div>" +
        (reward
          ? '<p class="muted" style="margin-top:14px">Your shop can hold one programme today. ' +
            "Running more than one is coming — you can look at any of these in the meantime.</p>"
          : "");
      d.querySelector("[data-back]").onclick = () => navigate("/create");
      return d;
    }

    function createStepScreen(kind, type) {
      if (kind === "reward") return createRewardScreen(type);
      if (kind === "campaign") return createCampaignScreen(type);
      return notFoundScreen();
    }

    /**
     * Design a new programme — for real, on screen, saving nothing.
     *
     * This is the actual card designer, in draft mode. A shop can only hold one
     * programme today (the server refuses a second), so its Save says what it
     * cannot do rather than sending a request that 409s and looks broken. What
     * an owner gets out of it is the honest thing: they can see precisely what
     * each type produces before deciding they want it.
     */
    function createRewardScreen(type) {
      const t = REWARD_TYPES.find((x) => x.k === type);
      if (!t) return notFoundScreen();
      const base = S.cards[0];
      const d = document.createElement("div");
      d.innerHTML =
        '<p class="muted" data-back style="margin:0 0 6px;cursor:pointer">← Reward types</p>' +
        '<h2 class="sec first">' + esc(t.name) + "</h2>" +
        '<p class="muted">' + esc(t.blurb) + "</p>" +
        '<div class="draftnote"><strong>This is a preview.</strong> Change anything and watch the ' +
        "card change with it. Nothing here is saved, and your live programme is not touched.</div>" +
        '<div data-design></div>';
      d.querySelector("[data-back]").onclick = () => navigate("/create/reward");
      if (!base) {
        d.querySelector("[data-design]").innerHTML =
          '<p class="muted">There is no card to preview from yet.</p>';
        return d;
      }
      // A COPY of the real card, with the chosen type applied, so nothing the
      // designer does in draft can reach into S and change the live programme's
      // fields under the programme page.
      const draft = Object.assign({}, base, { kind: t.k });
      d.querySelector("[data-design]").appendChild(designerFor(draft, {
        draft: true,
        saveLabel: "Save programme",
        // No live count to offer: this programme has no customers because it
        // does not exist. The panel drops to its "no customers" wording.
        customersPath: null,
      }));
      return d;
    }

    /**
     * A campaign: choose, preview, send.
     *
     * All four types run this one flow and the one sender that already works.
     * The three named types differ only in the audience and the wording they
     * arrive with — no new machinery, and nothing new on the server.
     *
     * What this deliberately does NOT do is schedule anything. Nothing in
     * PunchMe messages a customer on a timer; every message is an owner
     * pressing a button, and that stays true.
     */
    function createCampaignScreen(type) {
      const t = CAMPAIGN_TYPES.find((x) => x.k === type);
      if (!t) return notFoundScreen();
      const d = document.createElement("div");
      d.innerHTML =
        '<p class="muted" data-back style="margin:0 0 6px;cursor:pointer">← Campaign types</p>' +
        '<h2 class="sec first">' + esc(t.name) + "</h2>" +
        '<p class="muted">' + esc(t.blurb) + "</p>" +
        '<ol class="steps"><li class="on">Who and what</li><li>Preview</li><li>Send</li></ol>' +
        "<label>Who it goes to</label>" +
        '<select data-aud><option value="ready">Everyone</option></select>' +
        "<label>What it says</label>" +
        '<textarea data-cmsg rows="3" maxlength="200" placeholder="Type your message"></textarea>' +
        '<p class="muted" data-reach style="margin-top:8px"></p>' +
        '<button class="btn btn-neon" style="margin-top:14px" data-preview>Preview it</button>' +
        '<div data-prev></div>' +
        '<p class="muted" style="margin-top:16px">Scheduling and repeats are coming. ' +
        "Today a campaign is you pressing send, which is why nothing goes out without you.</p>";
      d.querySelector("[data-back]").onclick = () => navigate("/create/campaign");
      d.querySelector("[data-cmsg]").value = t.msg;

      let health = [], everyone = 0;
      const sel = d.querySelector("[data-aud]");

      /** How many this actually reaches, and where the rest went. */
      function paintReach() {
        const key = sel.value;
        const g = key === "ready" ? null : health.find((h) => h.key === key);
        const total = g ? g.customers : everyone;
        const ready = g ? g.eligible : health.reduce((a, h) => a + h.eligible, 0);
        const held = Math.max(0, total - ready);
        d.querySelector("[data-reach]").innerHTML =
          "Goes to " + ready + " of " + total + (total === 1 ? " customer" : " customers") +
          (held ? "<br>" + held + " are at the weekly limit and will be skipped" : "");
        return ready;
      }

      (async () => {
        const { body } = await api("/customers?cardId=all");
        health = body.health || [];
        everyone = health.reduce((a, h) => a + h.customers, 0);
        sel.innerHTML = '<option value="ready">Everyone (' + everyone + ")</option>" +
          health.map((h) =>
            '<option value="' + h.key + '">' + esc(h.label) + " (" + h.customers + ")</option>",
          ).join("");
        if (t.seg && health.some((h) => h.key === t.seg)) sel.value = t.seg;
        paintReach();
      })();
      sel.onchange = paintReach;

      d.querySelector("[data-preview]").onclick = () => {
        const message = d.querySelector("[data-cmsg]").value.trim();
        if (!message) return toast("Type a message first");
        const ready = paintReach();
        d.querySelectorAll(".steps li").forEach((li, i) => li.classList.toggle("on", i < 2));
        const box = d.querySelector("[data-prev]");
        box.innerHTML =
          '<h2 class="sec">Preview</h2>' +
          '<div class="phone"><div class="pnote"><strong>' + esc(shopName()) + "</strong>" +
          "<p>" + esc(message) + "</p></div></div>" +
          '<p class="muted">This is roughly how it lands on their phone.</p>' +
          '<button class="btn btn-neon" style="margin-top:14px" data-launch>Send to ' + ready +
          (ready === 1 ? " customer" : " customers") + "</button>";
        box.querySelector("[data-launch]").onclick = async () => {
          if (await confirmAndSend(ready, { target: sel.value || "ready" }, message)) {
            d.querySelectorAll(".steps li").forEach((li) => li.classList.add("on"));
            paintReach();
          }
        };
        box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      return d;
    }

    /** Manage — what is running, in two lists. */
    function manageScreen(tab) {
      if (tab !== "rewards" && tab !== "campaigns") return notFoundScreen();
      const d = document.createElement("div");
      d.innerHTML =
        '<h2 class="sec first">Manage</h2>' +
        '<div class="seg" id="mtabs" role="tablist">' +
          '<button data-mt="rewards"' + (tab === "rewards" ? ' class="on"' : "") + ">Rewards</button>" +
          '<button data-mt="campaigns"' + (tab === "campaigns" ? ' class="on"' : "") + ">Campaigns</button>" +
          '<span class="thumb"></span>' +
        "</div>" +
        '<div data-mlist style="margin-top:16px"></div>';
      const seg = d.querySelector("#mtabs");
      seg.querySelectorAll("[data-mt]").forEach((b) => {
        b.onclick = () => navigate("/manage/" + b.dataset.mt);
      });
      // The thumb measures the button it sits under, so it can only be placed
      // once the strip is in the document.
      setTimeout(() => moveThumb(seg), 0);

      d.querySelector("[data-mlist]").innerHTML =
        tab === "rewards" ? programRows() : campaignRows();
      return d;
    }

    /** Campaigns, all example — there is no campaign table to read. */
    function campaignRows() {
      return MOCK_CAMPAIGNS.map((c) => {
        return '<a class="prow egrow" href="' + ROOT + "/manage/campaigns/" + c.id +
        '" data-nav="/manage/campaigns/' + c.id + '">' +
        '<div class="ptop"><strong>' + esc(c.name) + "</strong>" + EG +
          '<span class="pstat' + (c.status === "ended" ? " off" : "") + '">' +
            (c.status === "ended" ? "Ended" : "Active") + "</span></div>" +
        '<div class="pmeta">' + esc(c.type) + " · sent " + esc(c.sent) + "</div>" +
        '<div class="pnums"><span><b>' + c.targeted + "</b>targeted</span>" +
          "<span><b>" + c.returned + "</b>came back</span>" +
          "<span><b>" + Math.round((c.returned / c.targeted) * 100) + "%</b>activation</span></div>" +
        "</a>";
      }).join("") +
      '<p class="muted" style="margin-top:10px">Not your data yet — campaigns are set up ' +
      "under Create, and this is what the list will look like once they run.</p>";
    }

    function manageDetailScreen(tab, id) {
      if (tab === "rewards") return rewardDetailScreen(id);
      if (tab === "campaigns") return campaignDetailScreen(id);
      return notFoundScreen();
    }

    /**
     * One programme: how it is doing, how it is set up, how to share it, and
     * the designer that changes what it looks like.
     */
    function rewardDetailScreen(id) {
      const card = S.cards.find((c) => c.id === id);
      const eg = MOCK_PROGRAMS.find((m) => m.id === id);
      if (!card && !eg) return notFoundScreen();

      const d = document.createElement("div");
      const back = '<p class="muted" data-back style="margin:0 0 6px;cursor:pointer">← Rewards</p>';

      // An example programme. Everything about it is made up, so it says so
      // once at the top and does not pretend to have a designer behind it.
      if (!card) {
        d.innerHTML = back +
          '<h2 class="sec first">' + esc(eg.name) + EG +
            '<span class="pstat' + (eg.status === "ended" ? " off" : "") + '">' +
              (eg.status === "ended" ? "Ended" : "Active") + "</span></h2>" +
          '<p class="muted">This is an example programme, so you can see what running more ' +
          "than one looks like. Your shop can hold one programme today.</p>" +
          '<h2 class="sec">Performance' + EG + "</h2>" +
          '<div class="totals" style="grid-template-columns:repeat(3,1fr)">' +
            '<div class="metric"><b>' + eg.customers + "</b><span>customers</span></div>" +
            '<div class="metric"><b>' + eg.visits + "</b><span>stamps</span></div>" +
            '<div class="metric"><b>' + eg.rewards + "</b><span>rewards</span></div>" +
          "</div>" +
          '<h2 class="sec">Setup</h2>' +
          '<div class="drow"><span>Type</span><b>' + (KIND_LABEL[eg.kind] || "Stamps") + "</b></div>" +
          '<div class="drow"><span>The deal</span><b>' + esc(eg.setup) + "</b></div>" +
          (eg.status === "ended" ? endedNote() : "");
        d.querySelector("[data-back]").onclick = () => navigate("/manage/rewards");
        return d;
      }

      const m = card.metrics || {};
      const enrolled = m.active > 0;
      d.innerHTML = back +
        '<h2 class="sec first">' + esc(card.shopName || card.name) +
          '<span class="pstat">Active</span></h2>' +
        '<h2 class="sec">Performance</h2>' +
        '<div class="totals" style="grid-template-columns:repeat(3,1fr)">' +
          '<div class="metric"><b>' + (m.active || 0) + "</b><span>customers</span></div>" +
          '<div class="metric"><b>' + (m.stamps || 0) + "</b><span>stamps</span></div>" +
          '<div class="metric"><b>' + (m.redemptions || 0) + "</b><span>rewards</span></div>" +
        "</div>" +
        '<h2 class="sec">Setup</h2>' +
        '<div class="drow"><span>Type</span><b>' + (KIND_LABEL[card.kind] || "Stamps") + "</b></div>" +
        '<div class="drow"><span>The deal</span><b>' + esc(dealLine(card)) + "</b></div>" +
        (card.stampsStart ? '<div class="drow"><span>Welcome stamps</span><b>' +
          card.stampsStart + "</b></div>" : "") +
        (enrolled ? lockNote(m.active) : "") +
        '<h2 class="sec">Share it</h2>' +
        '<div class="sharelist">' +
          '<a href="/j/' + esc(S.joinRef) + '?s=link" target="_blank">' +
            '<span>Sign-up page<span class="sub2">The link and the QR customers scan</span></span>' +
            '<span class="arr">open →</span></a>' +
          '<a href="/c/' + esc(card.id) + '/poster" target="_blank">' +
            '<span>Printable poster<span class="sub2">The QR, ready for the counter</span></span>' +
            '<span class="arr">open →</span></a>' +
          '<a href="/c/' + esc(card.id) + '/me" target="_blank">' +
            '<span>Customer page<span class="sub2">What a customer sees when they open their card</span></span>' +
            '<span class="arr">open →</span></a>' +
        "</div>" +
        '<div class="qrbox"><img alt="Sign-up QR code" src="/j/' + esc(S.joinRef) + '/qr">' +
        '<p class="muted">Every programme has its own QR. This one is yours.</p></div>' +
        '<h2 class="sec">Status</h2>' +
        '<p class="muted">Ending a programme stops new sign-ups. Everyone already holding ' +
        "a card keeps collecting on it, and keeps getting their reward.</p>" +
        '<button class="btn btn-ghost" style="width:auto;padding:11px 18px;margin-top:10px" data-end>' +
        "End sign-ups</button>" +
        '<h2 class="sec">What it looks like</h2>' +
        '<div data-design></div>';

      d.querySelector("[data-back]").onclick = () => navigate("/manage/rewards");
      // Two taps, never a browser dialog: a browser lets somebody silence
      // those, after which confirm() answers "no" in silence.
      arm(d.querySelector("[data-end]"), "Tap again to end sign-ups", () => {
        toast("Ending a programme arrives with V2 — nothing has changed.");
      });
      d.querySelector("[data-design]").appendChild(designerFor(card));
      return d;
    }

    /** The offer, in the owner's own words where they wrote any. */
    function dealLine(card) {
      if (card.kind === "membership") return card.reward || "Membership card";
      if (card.kind === "points") return card.reward || "Points on every visit";
      return "Collect " + card.stampsTarget + " stamps, get " + (card.reward || "a reward");
    }

    function endedNote() {
      return '<h2 class="sec">Status</h2><p class="muted">This programme has ended, so nobody ' +
        "new can sign up. Everyone who already holds a card keeps collecting on it.</p>";
    }

    /**
     * Shown once anyone is enrolled — and shown, not enforced.
     *
     * Changing a live programme is deliberate, working behaviour: a card
     * already in a wallet carries its own copy of the rules, so raising a
     * target from 10 to 12 this morning only affects people from their next
     * reward onwards. Actually disabling these fields would delete a feature.
     */
    function lockNote(n) {
      return '<div class="locknote"><strong>' + n +
        (n === 1 ? " customer is" : " customers are") + " already on this programme.</strong> " +
        "You can still change it — but the deal each of them was promised stays as it was " +
        "until they claim their next reward.</div>";
    }

    function campaignDetailScreen(id) {
      const c = MOCK_CAMPAIGNS.find((x) => x.id === id);
      if (!c) return notFoundScreen();
      const d = document.createElement("div");
      d.innerHTML = '<p class="muted" data-back style="margin:0 0 6px;cursor:pointer">← Campaigns</p>' +
        '<h2 class="sec first">' + esc(c.name) + EG +
          '<span class="pstat' + (c.status === "ended" ? " off" : "") + '">' +
            (c.status === "ended" ? "Ended" : "Active") + "</span></h2>" +
        '<p class="muted">An example campaign, so you can see the shape of one. ' +
        "Campaigns are set up under Create.</p>" +
        '<h2 class="sec">Performance' + EG + "</h2>" +
        '<div class="totals" style="grid-template-columns:repeat(3,1fr)">' +
          '<div class="metric"><b>' + c.targeted + "</b><span>targeted</span></div>" +
          '<div class="metric"><b>' + c.returned + "</b><span>came back</span></div>" +
          '<div class="metric"><b>' + Math.round((c.returned / c.targeted) * 100) +
            "%</b><span>activation</span></div>" +
        "</div>" +
        '<h2 class="sec">Setup' + EG + "</h2>" +
        '<div class="drow"><span>Type</span><b>' + esc(c.type) + "</b></div>" +
        '<div class="drow"><span>Sent</span><b>' + esc(c.sent) + "</b></div>";
      d.querySelector("[data-back]").onclick = () => navigate("/manage/campaigns");
      return d;
    }

    /**
     * The card designer, mounted. One function, so the programme page and the
     * Create flow cannot drift apart — and so the settings object the admin
     * console also passes stays in one recognisable shape.
     */
    function designerFor(card, extra) {
      const artBase = card.id === "default" ? "" : "/c/" + card.id;
      return designPanel(card, Object.assign({
        api, toast, modal, info,
        path: (suffix) => "/card/" + card.id + suffix,
        apiBase: "/dashboard/api",
        artUrl: (kind, v) => artBase + "/art/" + kind + ".png" + (v ? "?v=" + v : ""),
        customersPath: "/customers?cardId=" + encodeURIComponent(card.id),
        rulesNote: "",
        showDetails: true,
        // The programme's own page names it above, so the panel does not.
        titled: false,
        saveLabel: "Save changes",
        onRulesSaved: () => {},
      }, extra || {}));
    }

    /**
     * The two-tap confirm, from the counter page.
     *
     * Browsers let somebody tick "prevent additional dialogs", after which
     * confirm() returns false silently — on a staff phone that meant "give
     * reward" quietly stopped working. Relabel the button and wait for a second
     * tap instead; it disarms itself after four seconds.
     */
    let armedBtn = null, armedTimer = null;
    function disarm() {
      if (armedTimer) clearTimeout(armedTimer);
      if (armedBtn) { armedBtn.textContent = armedBtn.dataset.label; armedBtn.classList.remove("armed"); }
      armedBtn = null; armedTimer = null;
    }
    function arm(btn, prompt, go) {
      if (!btn) return;
      btn.dataset.label = btn.textContent;
      btn.onclick = () => {
        if (armedBtn === btn) { disarm(); go(); return; }
        disarm();
        armedBtn = btn; btn.textContent = prompt; btn.classList.add("armed");
        armedTimer = setTimeout(disarm, 4000);
      };
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
