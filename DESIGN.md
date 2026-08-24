# Design

The house style, set by the marketing page and now carried through the whole
app. If you are adding a surface, this file is the answer — do not invent a
second palette, and do not reach for a colour that is not listed here.

## The idea in one line

A white page, near-black panels for weight, and **one** neon green that only
ever marks the next thing to press.

## Tokens

Declared once, in `:root` inside `baseCss` (src/pages.ts). Everything reads
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
| `--r` / `--r-lg` | `14px` / `22px` | radii |

Neutrals carry a slight green bias so they sit under the accent rather than
fighting it. A pure grey here reads as unconsidered.

## Type

**Figtree**, one family, two jobs. `assets/fonts/figtree-latin.woff2` is a
variable file covering 400–900, declared inline in `baseCss` and served from
`/assets` with a long immutable cache, so the filename must change if the file
ever does.

- `--display` — headings, big numbers, prices. **800.** Tight tracking
  (`-.02em` to `-.03em`); the bigger it is, the tighter it goes.
- `--body` — everything you read. **400**, occasionally 600–700 for emphasis.

Bricolage Grotesque and Instrument Serif are still in `assets/fonts` and still
declared, because dropping a face is not free — but nothing should reach for
them in new work.

Numbers that line up in a column get `font-variant-numeric: tabular-nums`.

## Rules

1. **Neon marks the next action and nothing else.** A primary button, an active
   tab, a filled stamp, a live-state pill. Never a large background, never
   decoration, and **never text** — `#c9f73d` on white is unreadable, which is
   why `--on-accent` exists and why `--accent-dark` is dark. There are exactly
   **three** fenced exceptions, each described below: the marketing page's three
   tile colours, the neon reassurance band pinned to the bottom of that page,
   and the dashboard's `.greet` header.

   `.greet` is neon on purpose, decided by the founder. It is not decoration:
   it is the shop's identity plus the whole of the app's navigation in one
   object, and it is the only thing on the dashboard that never changes as you
   move around — so it is the one surface that can hold the colour without
   competing with anything. Its text is `--on-accent`, never white, and the tab
   thumb inside it is **white**, because a neon thumb on a neon ground is
   invisible. Nothing else on that screen may take the accent as a fill while
   this stands: with the header carrying it, a second neon area would leave the
   page with no single place the eye goes.
2. **Weight comes from the black panel, not from colour.** If something needs to
   dominate, put it on `--slab`. The dashboard header is the exception named in
   rule 1; it used to be `--slab` for exactly this reason.
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
- **Metric numbers** are `--display` at 800, tabular, with an uppercase
  `--muted` label under them at `.68rem` and `.05em` tracking. `--display` is a
  variable face covering 400–900, so a number that sets the family and forgets
  the weight renders at 400 and reads as body text.
- **Inputs** keep a visible `--field-border`; a borderless field on a white page
  is not discoverable.
- **A welcome block** (the dashboard's `.greet`) is `--slab`, never a colour.
  It is rule 2 applied: the reference for it was another product's blue header,
  and taking the blue would have been a second palette. Nothing inside it is
  neon — the tab strip's active thumb is that screen's one neon fill — so its
  action is an outlined pill in `--on-slab`, and its focus ring is neon
  because ink vanishes on a black panel.
- **Two nav controls on one screen differ by SHAPE, not by hue.** The dashboard's
  tabs are a neon pill; the card previews' switch under them is a neon
  underline. Reaching for a second accent to tell two controls apart is how a
  palette grows a colour it cannot explain — and the underline still never
  touches the label, because `--accent` on white is unreadable (rule 1).
- **Charts** are hand-rolled inline SVG — there is no chart library and no build
  step to add one. Emphasis is **weight, not colour**: the period being read is
  `--ink`, the context behind it is `--field-border`, and the baseline is a
  solid `--line` hairline (never dashed). **The accent never appears in a
  chart** — rule 1 gives it one job, so a neon bar is decoration. Bars cap at
  24px with a 2px gap, square at the baseline and 3–4px rounded at the data
  end. One series per chart: six small multiples beat six lines on one plot,
  and sidestep needing a second palette. Never a number on every point — the
  hover title carries it and a table view underneath carries all of them,
  because hover does not exist on a phone.

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
