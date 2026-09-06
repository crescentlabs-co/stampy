# Design

The house style, set by the marketing page and now carried through the whole
app. If you are adding a surface, this file is the answer — do not invent a
second palette, and do not reach for a colour that is not listed here.

## The idea in one line

A white page, near-black panels for weight, and **one** neon green that only
ever marks the next thing to press.

## Tokens

Declared once, in `:root` inside `baseCss` (src/ui/kit.ts). Everything reads
them through `var()`. There are no hardcoded colours in `src/routes/*.ts` and it
should stay that way.

| Token | Value | What it is |
|---|---|---|
| `--bg` | `#ffffff` | the page |
| `--surface` | `#f2f4f1` | a panel sitting on the page |
| `--slab` | `#101312` | a panel that needs weight; light text on it |
| `--ink` | `#0c0e0d` | headings and body |
| `--ink2` | `#3b403a` | body on a tinted panel |
| `--muted` | `#5f6560` | secondary text, labels, hints |
| `--line` | `#e3e7e1` | hairlines and card borders |
| `--field-border` | `#cdd2cb` | input borders, which need to be seen |
| `--ghost-bg` | `#eceee9` | secondary button fill |
| `--accent` | `#c9f73d` | the neon. Fills and borders only |
| `--accent-2` | `#b8e82c` | the neon, pressed |
| `--on-accent` | `#0c0e0d` | text **on** neon. Always dark, never white |
| `--accent-dark` | `#2f3630` | an active label's text. Dark on purpose |
| `--on-slab` | `#f4f6f2` | text on `--slab` |
| `--r-sm` / `--r` / `--r-lg` | `10px` / `16px` / `24px` | radii — plus `999px` for pills |
| `--good` / `--info` / `--warn` / `--bad` | see rule 6 | semantic colour, each with a `-bg` pair |

Neutrals carry a slight green bias so they sit under the accent rather than
fighting it. A pure grey here reads as unconsidered.

## Type

**One variable family, with distinct roles.** Inter (`inter-latin.woff2`,
400–700) is declared inline in `baseCss` (src/ui/kit.ts) and served from
`/assets` with a long immutable cache, so the filename must change if the file
ever does. It uses `font-optical-sizing: auto` and antialiased rendering.

| Role | Size | Weight | Line-height | Letter spacing |
|---|---:|---:|---:|---:|
| Page title | 44px | 700 | 1.05 | -0.04em |
| Section heading | 28px | 700 | 1.1 | -0.025em |
| Card title | 22px | 600 | 1.2 | -0.015em |
| Body | 17px | 400 | 1.45 | natural (no override) |
| Navigation | 10px | 600 | inherited | natural (no override) |
| Uppercase eyebrow | 16px | 600 | inherited | 0.06em |

Use the semantic classes (`.type-page-title`, `.type-section-heading`,
`.type-card-title`, `.type-body`, `.type-eyebrow`) where the matching semantic
element is not available. Do not put a `letter-spacing` value on `body` or a
universal selector: tracking adds to Inter's own spacing and only belongs where
the role explicitly calls for it.

### Merchant dashboard compact scale

The signed-in merchant workspace is intentionally denser than the public
customer pages and the staff counter. Its overrides live only inside
`#app.shell`, so the customer journey stays comfortably readable:

| Role | Size | Weight | Where it appears |
|---|---:|---:|---|
| Page title | 22px | 700 | `Dashboard`, `Customers`, `Manage` |
| Section heading | 22px | 700 | `Loyalty cards`, `Campaigns`, `Get ready to launch` |
| Card/list title | 16px | 600 | card names and programme names |
| Metric labels and buttons | 14px | 500–600 | metric labels, controls and actions |
| Body and supporting text | 12px | 400–600 | dates, explanations, chart labels and status detail |
| Navigation | 10px | 600 | bottom navigation labels |

Inputs remain 16px so iPhone Safari does not zoom when someone edits a form.

**The six supporting sizes and the four weights**, chosen by the founder in
Sept 2026 over the smaller set that came before them (body was 14px and the
floor was 11px). Navigation is the one semantic exception: its 10px label is
always paired with an icon and a full-size tap target. A test pins the values,
so a drift back is a failing suite rather than a discovery:

| Token | Size | Its job |
|---|---|---|
| `--t-hero` | 32px | page headings |
| `--t-xl` | 24px | section headings, a metric's number |
| `--t-lg` | 20px | card titles, large body |
| `--t-md` | 16px | body — the default |
| `--t-sm` | 14px | secondary labels, helper text |
| `--t-xs` | 12px | fine print, metadata, uppercase tags |

Headings **700**, buttons and important labels **600**, body **400**, small and
secondary labels **400–500**.

**The font is ours, served from `/assets`** — Inter is downloaded once and
cached hard, rather than fetched from Google on every visit. Do not swap this
for a `<link>` to a font CDN: it adds a third-party round trip to the first paint
of every page and buys nothing.

**A third family is named in exactly two places**, both monospace, both for a
code or a link somebody has to read one character at a time — where telling `1`
from `l` and `0` from `O` matters and the two house faces genuinely cannot help.
Nothing else may name a family.

**These two aliases in `:root` are the only place a font family is named.**
Every rule in the product goes through `var(--display)` or `var(--body)`. They
currently point to the same Inter variable family so hierarchy comes from the
role's size, weight, leading and only its deliberate tracking.

Figtree, Bricolage Grotesque and Instrument Serif are still in `assets/fonts`
and still declared, because dropping a face is not free — an unused `@font-face`
is never downloaded, so they cost nothing. Nothing should reach for them in new
work.

Numbers that line up in a column get `font-variant-numeric: tabular-nums`.

## Rules

1. **Neon marks the next action and nothing else.** A primary button, an active
   tab, a filled stamp, a live-state pill. Never a large background, never
   decoration, and **never text** — `#c9f73d` on white is unreadable, which is
   why `--on-accent` exists and why `--accent-dark` is dark. There are exactly
   **four** fenced exceptions, each described below: the marketing page's three
   tile colours, the neon reassurance band pinned to the bottom of that page,
   **Home's charts**, and Home's launch checklist.

   **The top bar used to be the fourth, and is not any more.** It is a thin
   white bar that tucks away as the sheet scrolls and comes back on the way up,
   so the accent has one job again on that screen: the next thing to press. The
   `.greet` header before it was neon on the same grounds and went the same way.
   Nothing was lost by it — the bar carries the shop's name and the ⋯ menu, and
   neither needed a colour to be found.

   Home's charts are neon, also the founder's call: the area **under** the
   visits line, and the bars in the two comparison cards. Always a FILL and
   never a stroke on its own — `#c9f73d` is too pale to read as a line on white,
   which is why the line on top of it is `--accent-2` and the second series is
   `--ink`. The exception is that screen and those three charts; a neon bar
   anywhere else is decoration, and the rest of the chart guidance below holds
   in full.

   Home's launch checklist is the fourth exception, explicitly requested by the
   founder: it may use `--accent-wash` as a pale completion surface and
   `--accent` for completed checkmarks. Its open steps remain neutral, so the
   actual next button on a screen still has the strongest call to action.

   The bottom nav's **Create (+) button** is also neon and needs no exception:
   a primary action is what this rule has always allowed. Those two, and
   nothing else on the dashboard, may take the accent as a fill — in
   particular the nav's active item is marked by **weight**, because a third
   neon object would leave the screen with no single place the eye goes.
2. **Weight comes from the black panel, not from colour.** If something needs to
   dominate, put it on `--slab`. The card designer's surface switcher is the
   live example: the selected face is `--slab`, not neon, because the wizard's
   Next button is the neon on that screen and two filled things leave the eye
   with nowhere to go.
3. **Focus rings are ink on light and neon on dark.** A neon ring on a white
   page is too low-contrast to be an accessibility feature, and an ink ring
   vanishes on a black panel. Both directions are declared; keep them.
4. **Corners are consistent.** `--r` for controls and small cards, `--r-lg` for
   panels, `999px` for pills and buttons. Nothing else.
5. **The counter is not a brand surface.** `/staff` gets the palette and the
   face, but its touch targets stay oversized and its confirmations stay solid
   blocks of colour. It is read at arm's length, one-handed, with a queue
   waiting. If a change there trades legibility for looks, it is wrong.
6. **Semantic colour is separate from the accent** and is not up for
   redesign: green for good, amber for attention, red for danger — plus **one
   blue**, for a state that is neither good nor bad but on its way (the
   Returning group in Customer health). These four are the only other hues in
   the app. The health tiles declare them once as `--hue` / `--hue-bg` on
   `.h-regular` / `.h-returning` / `.h-new` / `.h-lost`; anything else needing a
   semantic colour reads those, and does not pick a fifth.
7. **Motion never holds the resting state.** Animate *from* a hidden state with
   no `animation-fill-mode` and no end frame, so anything that fails to animate
   is simply visible. `both` once pinned a panel at `opacity: 0` and rendered it
   blank.
8. Everything respects `prefers-reduced-motion`.
9. **The tint does not nest.** A box inside a `--surface` box goes back to
   `--bg` with a `--line` hairline, and a `.btn-ghost` inside one does the same.
   `--surface` on `--surface` is no step at all and `--ghost-bg` is one shade
   off it, which is how an opened fold came to read as a single grey slab with
   its controls dissolved into it. Alternate; never repeat.

## Components

- **Buttons** are pills. `.btn-neon` is the primary and is the only neon one on
  a screen. `.btn-dark` is ink on light where neon would be too loud.
  `.btn-ghost` is the quiet third. `--r`-cornered blocks are not buttons.
- **Panels** are `--surface` on `--bg` with a `--line` border, or `--slab` when
  they need to carry.
- **Metric numbers** are `--display` at 800, tabular, with a `--muted` label
  ABOVE them — `--t-sm`, sentence case, no tracking. `--display` is a variable
  face covering 400–900, so a number that sets the family and forgets the weight
  renders at 400 and reads as body text.

  **The dashboard's Home is set in exactly three sizes** and a test holds it:
  `--t-xl` for the title, both section headings and every number; `--t-md` for a
  row's name and a row's figure; `--t-sm` for every other word. It reached five
  by adding one sensible step at a time, which is what made it read as generated
  rather than designed. `--t-xs` is not one of the three: it is the size for
  UPPERCASE tags, and Home has no uppercase on it.

  That test reads **CSS rules**, so it cannot see a `font-size` written into a
  `style=""` attribute — which is how a step label on Home came to render at the
  browser default, off the scale entirely, under a passing suite. If you write
  an inline style on Home, the token is your job.
- **Inputs** keep a visible `--field-border`; a borderless field on a white page
  is not discoverable.
- **App chrome** is a thin top bar in the SAME `--surface` as the page, a
  scrolling sheet under it that runs edge to edge, and a `--bg` bottom nav that
  FLOATS — a pill inset from the screen edges, not a strip welded to the bottom.

  The top bar carries **no border and no colour of its own**. It was white over
  an off-white page with a hairline between, which read as a band stuck across
  the screen rather than as the top of the app. The one thing in it that is
  meant to be pressed — the ⋯ — takes a `--bg` circle with a `--line` ring, and
  it stands out precisely because the bar behind it stopped trying to.

  **Both bars thin out as you scroll, and neither one leaves.** One class
  (`.tucked`) on one scroll listener drives both, so they can never disagree
  about whether the page is scrolling. The top bar keeps the PunchMe mark and
  the ⋯ menu at full strength and fades only the greeting; the bottom bar drops
  its words and keeps its icons, its rows staying 44px so the target never
  shrinks below a fingertip. The top bar used to disappear altogether, which
  meant scrolling back up to reach the menu.

  The greeting is **"Hi, <shop name>", left-aligned** beside the mark. A
  dashboard greets the person running the shop; it does not label itself.

  The sheet's rounded top corners went with the neon: they existed to sit
  against a coloured bar, and the neon behind `#app` existed only so those
  corners had something to show through. White on white, both were drawing a
  seam that is not there.

  **The box is the CONTENT, not the bar.** The bar is a flat neon block with no
  rounding at all; the sheet beneath it carries `--r-lg` on its **top** corners
  and tucks under it. That is the right way round because the sheet is also the
  only thing on the screen that scrolls: the app is a fixed-height column, so
  there is no "behind" for anything to fall into. A rounded, sticky bar was
  tried first and you could watch content slide through the corner notches and
  up into the staging strip. If a surface is rounded, the thing that scrolls
  should be inside it — not passing behind it.

  The bar is rule 1's fenced exception (see it). Its text is `--on-accent` and
  its focus rings are **ink**: `#c9f73d` is a LIGHT ground, so rule 3 sends the
  ring dark, and this is the easy one to get backwards because the bar used to
  be near-black. The column behind the sheet is `--accent`, or the sheet's
  rounded corners would have nothing to show through.

  A floating nav needs a real border and a real shadow, because content passes
  underneath it rather than stopping above it — without a lifted edge the two
  read as one surface. It holds **exactly one** neon object, the Create (+)
  button, sitting inside the pill rather than raised out of it: a bar that
  already floats does not need a second thing floating off it.

  **The SHEET reserves the nav's height plus the gap it floats in**, because the
  page itself no longer scrolls and so cannot carry it. Anything pinned to the
  viewport instead of to the sheet — the toast — has to be lifted separately,
  which is how it came to sit underneath the bar.
- **Three nav controls on one screen differ by SHAPE, not by hue.** The bottom
  nav marks its active item by **weight**; Manage's section switch is a neon
  pill; the card previews' switch is a neon underline. Reaching for a second
  accent to tell controls apart is how a palette grows a colour it cannot
  explain — and the underline still never touches the label, because
  `--accent` on white is unreadable (rule 1).
- **Charts** are hand-rolled inline SVG — there is no chart library and no build
  step to add one. Emphasis is **weight, not colour**: the period being read is
  `--ink`, the context behind it is `--field-border`, and the baseline is a
  solid `--line` hairline (never dashed). **The accent appears on Home and
  nowhere else** — the fenced exception in rule 1 — because rule 1 gives it one
  job and a neon bar on any other screen is decoration. Bars share the row
  evenly up to a **44px cap with an 8px gap**, square at the baseline and 4px
  rounded at the data end. (This said 24px and 2px for a long time after the
  comparison charts were rebuilt as standing bars — the code was right and the
  line was stale.)

  **A bar chart's bars STAND UP.** Five heights against one shared floor is what
  makes them comparable at a glance. A fill running left to right along a row is
  a progress bar, and progress — how far along is this one thing — is a different
  question from which of these is bigger. The value goes above each bar, the name
  under it, and four dashed `--line` rules sit behind so a height can be read
  without an axis.

  **A comparison chart is ONE metric, so one series, so one colour.** Home's
  programme and campaign cards let you switch which metric is being compared;
  what they never do is shade a bar by its own size, which would encode the
  order twice and make the colour mean rank — and rank changes the moment a
  filter changes who is in the chart. Ordering there is by creation date rather
  than by value, so a replacement sits above the thing it replaced. With five
  bars or fewer the value is printed on the end of each one and there is no
  axis: at that count the labels ARE the axis.

  **One series per chart, with one exception, and it is the same chart.** Six
  small multiples beat six lines on one plot and sidestep needing a second
  palette. Home's chart carries two — visits and rewards — because the question
  it answers is how the two move together, which two charts cannot show. They
  share one y-scale, or two rewards would draw the same height as two hundred
  visits, and they are told apart by **fill as much as by colour**: visits carry
  the filled area, rewards are a bare `--ink` line. Colour alone would exclude
  anyone who cannot separate those two hues.

  Never a number on every point — on Home a tap puts the date and both figures
  in one line above the chart, which is the phone's answer to a hover title. A
  table view underneath carries all of them where one exists.

  **A chart shows real data or says it has none. Never a blend, and never an
  invention.** Home's two comparison charts and the Manage rewards strip used to
  pad themselves with example programmes and example campaigns, each marked with
  a small "Example" chip. The chip was not enough: the rows sat in the same
  chart, at the same size, as the shop's own, and what an owner does with a chart
  is glance at it. All of it is deleted. An empty chart now carries one sentence
  saying what is missing and one button that starts the thing that would fill it.
  Campaigns have no table behind them at all, so that chart is empty always and
  honestly, until they do.

## The marketing page's above-the-fold

Roughly 60% of visitors never scroll, so the first screen carries the whole
argument. It is built in this order and the order is the point:

1. **The dream outcome**, not what the product is. "Turn your customers into
   regulars", never "a stamp card that lives in a wallet" — that belongs in the
   line underneath.
2. **The sub-headline** says what it is and what makes it different.
3. **One clear action**, labelled with what the visitor gets.
4. **The fear-killers directly under the button** — first month free, no card
   details, no app for your customers, cancel any time.
5. **Media that shows the promise being kept**, not decoration.

**Never invent proof.** No merchant counts, testimonials, logos or retention
statistics — there are no customers yet (see PRODUCT.md). The demo card and the
risk reversal do that job instead, and a demo you can verify in ten seconds is
worth more than a testimonial nobody can check.

**Nothing that argues for the product may be hidden.** No carousels, no folds
for value props: what is hidden does not get seen, especially on a phone. A
slider once held two of three value props behind a 34×5px dot.

**Headings carry their own benefit.** Assume the visitor reads only those.
"Why us", "Who are we?" and "What we do" name the section after itself and say
nothing — the version of this page that shipped them is the anti-example.

**The gist goes directly under the fold.** Three cards, an icon, a three-word
heading and one line each — and nothing else inside them, because what makes the
block readable at a glance is that there is nothing else to read. Demonstrations
go *under* the three, never inside one. This is the second thing a visitor sees
and often the last thing they read.

**Say what a competitor cannot.** "No app to download" is a claim every rival
web-app loyalty product also makes, so it cannot be the differentiator. The pass
living in Apple Wallet and Google Wallet — beside their bank cards, updating on
the lock screen, working with no signal — is the one thing that is ours.

## Video

Clips are **muted, looping, `playsinline`, poster-backed, and carry no
`autoplay` attribute** — playback starts from script, and only when
`prefers-reduced-motion` is not set, so a visitor who asked for less motion
keeps a still. They are cropped to the phone screen: source footage with its own
burned-in captions would argue with the page's headings in someone else's type.
Budget is ~1.5MB for the set; below the fold they use `preload="none"` and start
on an IntersectionObserver.

## The marketing tiles

Section two of the marketing page is three large tiles, each a solid colour
carrying one claim. They are the **one** licensed exception to rule 1, and they
are fenced so they cannot become a second palette:

| Token | Value | Text on it |
|---|---|---|
| `--tile-lime` | `#c9f73d` | `--ink` |
| `--tile-sky` | `#57c7ff` | `--ink` |
| `--tile-pink` | `#ff9ecd` | `--ink` |

The fence, in full:

- **These three, and never a fourth.** A fourth is a second palette, which is
  the thing this file exists to prevent.
- **They appear on `/` and on no other surface.** Not the dashboard, not the
  sign-up page, not the counter. They are declared in `marketingPage()`'s own
  `:root`, not in `baseCss`, so nothing else can reach them.
- **Two places on that page, in the same order both times:** the three feature
  blocks in section two, and the three step icon chips in How it works directly
  under them. The order matching is the point — it is what makes the two
  sections read as one system rather than two colour schemes.
- **A tile contains no button and no link.** That is what keeps rule 1 true:
  with no control on a tile, nothing competes with the accent for the meaning
  "press this", and the lime tile cannot swallow a lime button.
- **Text on a tile is always dark**, exactly as `--on-accent` is dark. All three
  are light enough that it never needs deciding.

There was a fourth, `--tile-ink` at `#101312`, and it was removed rather than
left as an unused token: an unused colour in a fenced set is an invitation. It
was also `--slab` under another name, and it sat directly above the black
how-it-works panel, so the section ended in two black blocks touching.

The tile art is a CSS `background-image` over the tile's own colour, never an
`<img>`: a slot whose file has not arrived yet must render as a clean coloured
panel, not a broken-image icon.

**The colour is the block; the words sit under it on the page.** These were
cards — the colour ran behind the heading and the line too — and the box was
competing with the image for the eye on a section whose whole job is the images.
A heading and one line read perfectly well on white and do not need a container.

**Photography destined for the page gets its ground keyed to white in the
pixels, not blended in CSS.** `mix-blend-mode: multiply` keeps the darker of two
layers, so it erases a *white* ground and leaves a beige one exactly as it was —
and a global levels lift that whitens the ground shifts every other colour with
it, which on a mockup of our own card means shipping the wrong green. Key the
ground colour to white per pixel, leave everything beyond a tolerance alone, and
the art needs no CSS at all to sit on the page.

## The reassurance band

The marketing page carries a **fixed neon band** across the bottom of the
viewport holding the four reasons not to worry. It is the largest departure from
rule 1 in this file — a big neon background is precisely what that rule forbids —
and it is a deliberate founder call, recorded here rather than left to be
discovered in the CSS.

What keeps the rule's *intent* alive is that **the band carries no control**.
Nothing on it is pressable, so nothing on it competes with the nav pill for the
meaning "press this". **Never put a link or a button in the band.** Its height is
fixed and `body` reserves exactly that height, so it can never sit over the
footer.

Know what it costs: with a permanent neon strip on screen, every other neon fill
has less force. If a screen ends up showing the band, the nav pill and a third
neon button at once, the third one should go ink.

**The marketing page has no `--slab` surface at all any more.** The black
how-it-works panel was the last one, and rule 2 — weight comes from the black
panel — now describes the app rather than `/`. That page takes its weight from
display type at hero scale and from full-bleed colour instead. This is a fact
about that one page, not permission to drop `--slab` from a dashboard surface
that needs to dominate.

**The nav's "Message us" pill is the one control anywhere with motion in it** —
a conic gradient turning through `--accent` and `--accent-2`, and no third hue,
so the live ring costs the palette nothing. It is built from two backgrounds
(flat neon on the padding box, the cone on the border box) rather than a second
element, and its resting state is an ordinary neon pill: a browser without
`@property`, and anyone who asked for less motion, get the button and not a
broken one. Do not copy the ring onto a second control — two things pulsing for
attention is neither of them getting it.

## Where the aesthetic came from

The marketing page (`marketingPage()`, src/pages.ts) is the reference
implementation and the most finished expression of it: the four colour tiles,
the numbered flow on a black panel, and the marquee of example cards in six
trades' colours. Read it before designing a new surface.

It was eight sections and is now six. What was removed is as instructive as what
stayed: a feature carousel whose markup was duplicated and never closed, and a
"run it from your phone" block that showed one screenshot under two different
labels. Both were built to fill space. Neither survived a reader.
