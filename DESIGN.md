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
   why `--on-accent` exists and why `--accent-dark` is dark.
2. **Weight comes from the black panel, not from colour.** If something needs to
   dominate, put it on `--slab`.
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
   redesign: green for good, amber for attention, red for danger. These are the
   only other hues in the app.
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

## Where the aesthetic came from

The marketing page (`marketingPage()`, src/pages.ts) is the reference
implementation and the most finished expression of it: the drawn wallet card,
the two-up panels, the sliding feature panel, the phone with switchable screens.
Read it before designing a new surface.
