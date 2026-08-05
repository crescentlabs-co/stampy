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

## Components

- **Buttons** are pills. `.btn-neon` is the primary and is the only neon one on
  a screen. `.btn-dark` is ink on light where neon would be too loud.
  `.btn-ghost` is the quiet third. `--r`-cornered blocks are not buttons.
- **Panels** are `--surface` on `--bg` with a `--line` border, or `--slab` when
  they need to carry.
- **Metric numbers** are `--display` at 800, tabular, with an uppercase
  `--muted` label under them at `.68rem` and `.05em` tracking.
- **Inputs** keep a visible `--field-border`; a borderless field on a white page
  is not discoverable.

## Where the aesthetic came from

The marketing page (`marketingPage()`, src/pages.ts) is the reference
implementation and the most finished expression of it: the drawn wallet card,
the two-up panels, the sliding feature panel, the phone with switchable screens.
Read it before designing a new surface.
