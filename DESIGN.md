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
| `--r` / `--r-lg` | `14px` / `22px` | radii |

Neutrals carry a slight green bias so they sit under the accent rather than
fighting it. A pure grey here reads as unconsidered.

## Type

**Two families, one for each job.** Both are variable files declared inline in
`baseCss` (src/ui/kit.ts) and served from `/assets` with a long immutable cache,
so the filename must change if the file ever does.

- `--display` — **Inter Tight** (`inter-tight-latin.woff2`, 500–800). Headings,
  big numbers, prices. **800.** Tight tracking (`-.02em` to `-.03em`); the
  bigger it is, the tighter it goes.
- `--body` — **Inter** (`inter-latin.woff2`, 400–700). Everything you read.
  **400**, occasionally 600–700 for emphasis.

They are two cuts of one design, so they agree about letter shapes and disagree
about width. That is the whole point: a heading should not be the sentence under
it at a different size, which is what one family doing both jobs produced.

**These two lines in `:root` are the only place a font family is named.** Every
rule in the product goes through `var(--display)` or `var(--body)`. Swapping the
type means editing two lines, and it must stay that way.

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
   the dashboard's **top bar**, and the **area under Home's visits line**.

   The top bar is neon on purpose, decided by the founder — the same call that
   was made for the `.greet` header it replaced. It earns the exception on the
   same grounds: it is the shop's identity, it is the only thing on the
   dashboard that never changes as you move around, and it **carries no control
   except the ⋯ menu**, so it cannot compete with whatever the owner came here
   to do. Its text is `--on-accent`, never white.

   Home's chart fills the area **under** the visits line with neon, also the
   founder's call. It is a fill and never a stroke on its own: `#c9f73d` is too
   pale to read as a line on white, so the line on top of it is `--accent-2`
   and the second series is `--ink`. It stays an exception rather than becoming
   the rule, and the rest of the chart guidance below still holds.

   The bottom nav's **Create (+) button** is also neon and needs no exception:
   a primary action is what this rule has always allowed. Those two, and
   nothing else on the dashboard, may take the accent as a fill — in
   particular the nav's active item is marked by **weight**, because a third
   neon object would leave the screen with no single place the eye goes.
2. **Weight comes from the black panel, not from colour.** If something needs to
   dominate, put it on `--slab`. The dashboard's top bar is the exception named
   in rule 1; it was `--slab` for exactly this reason before the founder took
   it neon.
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

  **`--t-sm` (12px) and `--t-xs` (11px) are one pixel apart on purpose.** No eye
  separates those on size, and they do not have to: `--t-xs` is only ever set on
  uppercase text, and caps read a size or two larger than sentence case, so what
  you see is the change of CASE. A test enforces the uppercase rule, and the
  guard on step sizes exempts this one pair for that reason and only that
  reason. Set `--t-xs` on sentence text and both stop being true.
- **Inputs** keep a visible `--field-border`; a borderless field on a white page
  is not discoverable.
- **App chrome** is a locked neon top bar, a scrolling sheet under it, and a
  `--bg` bottom nav that FLOATS — a pill inset from the screen edges, not a
  strip welded to the bottom.

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
  solid `--line` hairline (never dashed). **The accent appears in exactly one
  chart** — the area under Home's visits line, the fenced exception in rule 1 —
  and nowhere else, because rule 1 gives it one job and a neon bar somewhere
  else is decoration. Bars cap at 24px with a 2px gap, square at the baseline
  and 3–4px rounded at the data end.

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
