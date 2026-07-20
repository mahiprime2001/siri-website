# Design — Siri Admin (siri-website)

A locked design system for this app. Every page redesign reads this file
before emitting code. Do not regenerate per page — extend or amend this file
when the system needs to grow.

**Context (stated, not guessed):** audience = internal shop/billing ops staff
(store managers, the business owner) reviewing bills and attendance across
several stores, several times a day. Use case = fast scanning and light
management of tabular operational data — not persuasion, not marketing.
Tone = modern-minimal, Stripe/Linear/Vercel-grade restraint, requested
explicitly by the product owner.

## Genre
**modern-minimal** — confident sans type, clean paper, one restrained accent,
refined card/table surfaces, minimal motion. (Brief signals: billing,
dashboard, internal tool, "Stripe/Linear/Vercel-caliber".)

## Why no landing-page macrostructure

Hallmark's 21 macrostructures (Bento Grid, Marquee Hero, Stat-Led, …) are
marketing-page shapes. This app has no marketing pages — every route is a
functional tool screen (auth, a billing table, an attendance table). Forcing
a landing-page macrostructure onto a data table doesn't produce a better
table. Instead this file defines an **app-shell pattern** and a small set of
**content patterns** that every tool page composes from. This is the correct
substitution, not a shortcut — dashboards have their own well-established
grammar (Stripe Dashboard, Linear's app view, Vercel's project view), and
that's the register this system targets.

## Theme — "Instrument" (Cobalt-family, tuned)

Cool, engineered, tabular-data-friendly. Near-white paper, one electric
cobalt signal accent, tight radii, hairline rules — the instrument-panel
register, not the soft-pill marketing register.

```
--color-paper       oklch(98.5% 0.004 250)   /* app background */
--color-surface      oklch(100% 0.003 250)   /* card / table / drawer surface */
--color-surface-2    oklch(96%   0.006 250)   /* hover / subtle fill */
--color-border        oklch(90%   0.007 250)
--color-border-soft   oklch(93.5% 0.006 250)
--color-ink            oklch(21%   0.020 258)   /* primary text */
--color-ink-muted      oklch(46%   0.016 258)   /* secondary text */
--color-ink-dim         oklch(64%   0.012 258)   /* tertiary / placeholder */
--color-accent          oklch(56%   0.20  258)   /* electric cobalt */
--color-accent-ink      oklch(99%   0.006 258)   /* text ON accent fill */
--color-accent-2        oklch(48%   0.19  258)   /* accent hover/pressed */
--color-focus            oklch(56%   0.20  258)
--color-success           oklch(56%   0.15  155)
--color-warn                oklch(62%   0.15  70)
--color-danger              oklch(56%   0.19  25)
```

Paper band: **light** (98.5%). Display style: **grotesk-sans**. Accent hue:
**cool** (258°, true cobalt-blue — not indigo/purple). All neutrals carry a
0.003–0.02 cool tint matching the accent hue, per color.md "tint the greys."

## Typography

- **Display** — Space Grotesk 600/500. Geometric, slightly technical — the
  Cobalt signature. Used for page titles, stat numbers, the wordmark.
- **Body** — Geist 400/500. Same-genre pairing partner, clean at small sizes
  in dense UI.
- **Outlier (mono)** — JetBrains Mono 400/500. Reserved for **tabular /
  code-like data only**: timestamps, currency amounts, activation codes,
  match-scores, bill/device IDs. This is the single highest-leverage
  typographic decision for this app — it's a billing + attendance tool;
  most of its content IS tabular data, and giving it a distinct engineered
  voice (tabular-nums, monospace) is what makes the UI read as "instrument,"
  not "generic dashboard."
- Scale: 1.25 ratio (major third), 16px body floor.
- Tight tracking (-0.02em) on display sizes; loose tracking (0.06em,
  uppercase) on table headers and small labels.

```
--font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
--font-body:    "Geist", ui-sans-serif, system-ui, sans-serif;
--font-mono:    "JetBrains Mono", ui-monospace, "SF Mono", monospace;
```

## Spacing

4pt named scale (see tokens.css). Used everywhere — no raw px in components.

## Radii — tight, not pill

`--radius-control: 8px` (buttons, inputs, chips) · `--radius-card: 12px`
(cards, drawers, modals) · `--radius-pill: 999px` (status pills only — badges
that report state, never CTAs). This is a deliberate departure from the
"soft pill everything" modern-minimal default: an ops tool full of tables
reads as more instrument-grade with tight, ruler-drawn corners. Status pills
stay round because they're reporting a state, not inviting a click.

## Motion

Minimal, composed — matches the modern-minimal "reveals are off" stance,
reinforced by this being a tool used many times a day (page-load animation
on every visit is fatigue, not delight).

- Hover: single-signal only — background-color shift, ~150ms `--ease-out`.
  No translate, no scale, no shadow-lift on rows or cards.
- Focus: instant, 2px ring, `--color-focus`, never animated in.
- Drawer / modal open: 250ms `--ease-out` slide + fade. Close: 180ms
  `--ease-in`.
- No page-load stagger reveals on table rows. No scroll-triggered animation
  anywhere. The data is the point; let it just be there.
- Realtime row updates (Attendance's live Supabase subscription): new/changed
  rows get a one-shot 400ms background-color pulse from `--color-surface-2`
  back to transparent — signals "this changed" without a toast.

## Microinteractions stance

- Silent success everywhere (a saved row, a copied code — no "Done!" toast).
- Copy-to-clipboard: label swaps to "Copied" + check icon, reverts after
  2.5s. No toast.
- Destructive actions (delete employee/device) keep a native `confirm()`
  today; acceptable for a low-frequency admin action, not worth a custom
  modal build in this pass.
- Loading: skeleton rows for tables (not spinners) wherever the shape is
  predictable; inline spinner only inside a button mid-action.

## CTA / component voice

- **Primary button** — filled `--color-accent`, `--color-accent-ink` text,
  8px radius, 40px height (44px on touch).
- **Secondary / ghost button** — 1px border `--color-border`, transparent
  fill, same height.
- **Destructive** — ghost button, `--color-danger` text/icon, red-tinted
  hover background.
- **Status pill** — pill radius, tinted background at 10% + solid text at
  full tone (existing `.chip` family, tokens updated).
- **Table row** — no zebra striping. Hairline `--color-border-soft` divider
  between rows. Hover = `--color-surface-2` background only.

## App shell

- **Desktop (≥ 60rem):** fixed left sidebar, 17rem — wordmark, user identity
  block, nav list, sign-out. Content area scrolls independently.
- **Mobile (< 60rem):** slim top bar (wordmark + avatar) + a **bottom tab
  bar** (2 destinations: Bills, Attendance) fixed above the safe area. A
  bottom tab bar beats a hamburger here — 2 destinations, thumb-reachable,
  navigation stays visible instead of hidden behind a menu icon.
- Both surfaces are **solid**, never blurred/glassy — flat `--color-surface`
  with a hairline border, per the "plain classic" direction.

## Page content pattern (every tool page)

1. **Page header row** — `h1` page title (Space Grotesk) left, primary
   actions right-aligned on the same row. Consistent 64px-ish header block
   across pages.
2. **Stat rail** — NOT 4 separate bordered cards (the AI card-grid tell).
   One bordered container, internally divided by hairline verticals, each
   cell a label + a mono/tabular number. Reads as an instrument readout.
3. **Toolbar row** — search / filters / view-toggle in one row, all controls
   sharing the same 40px height (input-height = button-height rule).
4. **Content surface** — table or list, in a bordered `--color-surface` card,
   full-bleed within it (no internal double-border / card-in-card).
5. Drawers slide from the right (Attendance's Members/Devices) — solid
   surface, hairline-bordered header, content scrolls independently.

## What pages MUST share

Wordmark treatment, accent placement, type pairing, button voice, table row
voice, spacing scale, the page-header → stat-rail → toolbar → content rhythm.

## What pages MAY differ on

Whether a stat rail is present (Login/LoadingScreen have none), how many
toolbar controls, table column set, drawer content.

## Exports

### tokens.css
Written to `src/style.css` directly (project's existing entry-point) rather
than a separate file — this is a Vite/Tailwind v4 project where the `@theme`
block in `style.css` **is** the token file. See that file for the literal
values mirroring the palette above.
