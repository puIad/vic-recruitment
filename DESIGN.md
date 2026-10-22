---
name: VIC Recruitment 2026 Control Room
description: The VIC IT Charter 2026 alive as a dashboard, a calm white working surface inside a bold Cornflower-and-Aquamarine frame.
colors:
  charter-blue: "#127dbb"
  charter-aqua: "#69c4af"
  charter-cobalt: "#1a52a2"
  charter-ink: "#141e27"
  charter-gray: "#efefef"
  charter-orange: "#f29a09"
  charter-tangelo: "#f24407"
  charter-violet: "#5700cf"
  charter-purple: "#7849a8"
  deco-teal: "#5ab3b1"
  primary: "oklch(0.54 0.129 242.2)"
  primary-dark: "oklch(0.7 0.115 242)"
  heading: "oklch(0.54 0.129 242.2)"
  heading-dark: "oklch(0.78 0.1 242)"
  background: "oklch(1 0 0)"
  background-dark: "oklch(0.185 0.02 246)"
  foreground: "oklch(0.23 0.023 246.1)"
  foreground-dark: "oklch(0.96 0.006 246)"
  card-dark: "oklch(0.23 0.023 246.1)"
  secondary: "oklch(0.955 0.004 246)"
  muted: "oklch(0.967 0.004 246)"
  muted-foreground: "oklch(0.49 0.03 246)"
  muted-foreground-dark: "oklch(0.74 0.02 246)"
  accent: "oklch(0.962 0.022 242)"
  accent-foreground: "oklch(0.38 0.1 242)"
  border: "oklch(0.915 0.006 246)"
  input: "oklch(0.87 0.01 246)"
  ring: "oklch(0.64 0.12 242)"
  destructive: "oklch(0.57 0.2 33)"
  sidebar: "oklch(0.23 0.023 246.1)"
  sidebar-dark: "oklch(0.155 0.019 246)"
  sidebar-primary: "oklch(0.758 0.093 176.8)"
  success: "oklch(0.47 0.09 177)"
  success-soft: "oklch(0.955 0.035 177)"
  warning: "oklch(0.5 0.12 65)"
  warning-soft: "oklch(0.962 0.06 85)"
  danger: "oklch(0.52 0.2 33)"
  danger-soft: "oklch(0.962 0.03 35)"
  info: "oklch(0.45 0.12 242)"
  info-soft: "oklch(0.955 0.025 242)"
typography:
  page-title:
    fontFamily: "Gilroy, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  card-title:
    fontFamily: "Gilroy, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1
  lead:
    fontFamily: "Gilroy, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Gilroy, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Gilroy, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
  watermark:
    fontFamily: "Gilroy, ui-sans-serif, system-ui, sans-serif"
    fontSize: "6rem"
    fontWeight: 300
    lineHeight: 0.85
rounded:
  sm: "8px"
  md: "11px"
  lg: "14px"
  xl: "18px"
  2xl: "24px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "36px"
  button-soft:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.pill}"
  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  dialog:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
---

# Design System: VIC Recruitment 2026 Control Room

## Overview

**Creative North Star: "The Charter, Alive"**

The world is the VIC IT Charter 2026, taken literally: its palette, its Gilroy typeface, its gradients, its divider disc, arches, outlined words and dot grid. The working surface is calm and white; the charter's boldness lives in the frame (the dark sidebar, the page header, the sign-in and error stages, empty states, the footer rule) and never in the data. It refuses the generic admin look: neutral gray, Inter, a stray blue accent, a KPI tile grid.

Density is moderate and legible: hairline cards on white, pill-shaped controls, one working accent (Cornflower Blue) and one reward color (Aquamarine). Warm colors are reserved for people-needed signals. Light is the default; dark is supported and keeps AA contrast.

**Key Characteristics:**
- White working surface inside a Dark Jungle Green frame.
- Gilroy only; Heavy blue titles over Light or Regular context lines; Medium body; never all-caps.
- Pill buttons, pill badges, hairline cards, 14px base radius.
- Gradient hairline footer rule, label left and note right.
- Decorative charter motifs on the frame only, always aria-hidden.
- A palette switch (VIC, SPARK, English Bubble, Training) recolors accents and decorative gradient ends, never the logo.

## Colors

A two-voice palette: charter blue works, charter aquamarine completes. Text-bearing blue is nudged lighter-darker for AA; the logo, gradients and swatches keep the exact charter hex.

### Primary
- **Cyan Cornflower Blue** (`charter-blue` #127dbb): the exact charter swatch. Logo, gradient ends, chart-1, swatches. Not used for text or button fills.
- **Working Blue** (`primary` / `heading`, oklch(0.54 0.129 242.2)): the same hue with lightness nudged to L .54 so white text and blue text on white clear 4.5:1. Buttons, links, page titles, focus ring family, footer label. Dark mode lifts it to `primary-dark` / `heading-dark`.

### Secondary
- **Medium Aquamarine** (`charter-aqua` #69c4af): completion and the second end of every gradient. Sidebar active accent (`sidebar-primary`), selection highlight, finished stages in the status bar. Always paired with dark text, never white.
- **Cobalt** (`charter-cobalt` #1a52a2): the start of the pipeline status bar, chart-3, the English Bubble palette.

### Tertiary
- **Orange and Tangelo** (`charter-orange` #f29a09, `charter-tangelo` #f24407): they mean a person is needed. Warning and High-severity signals, the test-mode notice, the High count on bells and nav badges (tangelo with dark ink text).
- **Violet and Purple** (`charter-violet` #5700cf, `charter-purple` #7849a8): the Training palette, chart-5.

### Neutral
- **Dark Jungle Green** (`charter-ink` #141e27, `foreground` oklch(0.23 0.023 246.1)): text, and the sidebar frame in light mode (the charter's dark-background variant). Dark mode drops the sidebar to `sidebar-dark`.
- **Bright Gray** (`charter-gray` #efefef) with cool tints `secondary`, `muted`, `accent`: quiet fills, table stripes, hover.
- **Hairline** (`border`, `input`): 1px dividers and field strokes; dark mode uses white at 10% and 14%.

### State pairs
Success (teal), warning (amber), danger (tangelo-red) and info (blue) each ship a text color and a soft fill (`*-soft`), with dark-mode equivalents. Severity maps High to danger, Medium to warning, Info to info.

### Named Rules
**The Nudge Rule.** Blue that carries text or a fill is `primary` (L .54). The exact #127dbb appears only in the logo, gradients and swatches. Never use #127dbb as text on white.
**The Needs-A-Person Rule.** Orange and tangelo appear only where a human has to act (alerts, warnings, test mode). They are never decoration, a category color, or a chart accent for good news.
**The Aqua-Takes-Dark Rule.** Text on aquamarine is Dark Jungle Green. Text on blue and on the dark frame is white.

## Typography

**Display and Body Font:** Gilroy (fallback ui-sans-serif, system-ui, Segoe UI, sans-serif), self-hosted woff2 in Light 300, Regular 400, Medium 500, Bold 600-700, Heavy 800-900.

**Character:** One geometric family carries everything; hierarchy comes from weight and the blue, not from a second face. Title Heavy, body Medium, attribution Light, as the charter prescribes.

### Hierarchy
- **Page title** (Heavy 800, 1.875rem mobile and 2.125rem from md, line-height 1.1, tracking -0.025em, `heading` blue): one h1 per page. Context line beneath in Regular 1rem muted, max-w prose.
- **Card title** (Bold 700, 1.125rem, line-height 1): every card heading.
- **Body** (Medium 500, 0.875rem, 1.5): default; table cells, rows, descriptions.
- **Label** (Semibold 600, 0.75rem): badges, footer rule text (Regular), counters.
- **Watermark** (Light 300, 6rem, line-height 0.85, 1px outline in `deco-to`, transparent fill, 30% opacity): decorative only, large screens only.
- Numerals in tables and counters use tabular lining figures (`.num`).

### Named Rules
**The Never-Caps Rule.** Gilroy is never set in all caps and the build carries no uppercase or tracked eyebrows. Sentence case everywhere.
**The Weight-Is-The-Hierarchy Rule.** Titles Heavy or Bold, paragraphs Regular or Medium, attribution Light. Do not add a second family.

## Layout

A sidebar shell (shadcn template, restyled): Dark Jungle Green sidebar with the white-wordmark logo, grouped nav, a test-mode notice and the account; a top header with search, live status, bell, palette, theme toggle and the blue Sync now button; a content column of stacked cards; a gradient hairline footer. The sidebar collapses to icons and to a sheet on mobile.

Spacing runs on a 4px base: card padding 24px (header and content px-6, gap 24px), control gaps 8 to 12px, page gutters 16px mobile and 24px from lg. Overview leads with the To do card (beside the Launch sequence until binomes are locked), then a one-row Pipeline strip and Binomes behind. On phones cards stack, tables scroll, and the sign-in disc becomes a gradient band (11rem, cover gradient, white logo) from which the card rises.

## Elevation & Depth

Mostly flat and tonal: depth comes from hairline borders and white-on-gray layering, with a faint shadow only on resting cards and buttons. Overlays lift.

### Shadow Vocabulary
- **Rest** (`shadow-xs`, `shadow-sm`, Tailwind defaults): buttons and cards; barely perceptible.
- **Float** (`shadow-md` to `shadow-lg`): menus, selects, popovers, sheets.
- **Modal** (`shadow-xl`): dialogs, the sign-in card on phones.

### Named Rules
**The Soft-Shadow-Only Rule.** Shadows are Tailwind's soft blurred defaults. Hard offset shadows are not part of this world.
**The Gradient-Stays-Flat Rule.** Gradients fill decorative motifs, the status bar and the footer hairline; they never sit behind running text or tables.

## Shapes

One radius token, `--radius: 0.875rem` (14px), with a scale: sm 8px, md 11px, lg 14px, xl 18px, 2xl 24px. Controls (buttons, badges, chips, nav counters) are full pills, the logo's base echoed. Cards use xl; dialogs and banners use 2xl; inputs, menus and popovers use md. Borders are 1px hairlines. Dashed borders mean one thing: placeholder, sample data or empty (`border-2 border-dashed` on banners and empty states, dashed outline badge on sample sections).

## Components

### Buttons
- **Shape:** full pill (9999px), 36px high (sm 32, lg 44), font-semibold 0.875rem, active scale .98, 200ms transitions.
- **Primary:** `primary` fill, white text, 16px horizontal padding; hover at 90%.
- **Variants:** outline (hairline, white), secondary, soft (accent fill, accent-foreground text), ghost (accent on hover), link, destructive (white on tangelo-red; ink text in dark mode).
- **Focus:** 3px ring at 50% `ring` plus 2px offset outline.

### Badges and chips
Pill, 12px semibold, 2px by 10px padding. Semantic variants are soft fill with its matching strong text: success, warning, danger, info. Outline with dashed border marks sample sections.

### Cards
Radius 18px, white, 1px border, faint rest shadow, 24px padding and gap. Title Bold lg, description muted small.

### Dialogs and sheets
Dialogs 24px radius, white, 1px border, shadow-xl, max 32rem, zoom and fade 200ms. Writes preview and confirm first.

### Inputs
36px, 11px radius, 1px `input` stroke, transparent or 30% input in dark, 3px ring on focus, destructive border and ring on invalid.

### Navigation
Sidebar on Dark Jungle Green: white Medium labels, active item on a white 9% tint, aquamarine counters; High alerts show a tangelo counter with ink text. A test-mode notice in orange outline sits in the sidebar.

### Placeholder banner
Dashed 2px primary-35% border, 24px radius, accent tint, a blue disc icon. Used only on pages that show sample data.

### Charter motifs (signature)
- **Footer rule:** 1px gradient from `deco-from` to `deco-to`, label left and page note right in blue 12px Regular.
- **Outlined word:** page-title watermark, Light, outlined in blue.
- **Ring-and-slot disc:** the divider disc from the charter (p.4, 8, 23, 33) as the stage for sign-in and error pages; content sits in its iris. It is the charter's own artwork redrawn at poster scale.
- **Arches:** two rounded-top columns on the vertical blue-to-aqua field, used on phone sign-in band.
- **Dot grid:** blue and aquamarine discs on a staggered 22px grid, masked to fade at edges, for empty states.
- **Live pulse:** the mini ring completes one 900ms turn when the Master changes, with reduced-motion fallback.
- **Gradients:** ring (teal #5ab3b1 to blue #127dbb, 90deg), cover (#3997b4 to #1f84b7, 180deg), strip (#6fc2ae to #1a7fb8, 0deg), brand (#127dbb to #69c4af, 135deg). Palettes swap only the decorative ends.

## Do's and Don'ts

### Do:
- **Do** keep working surfaces white and put charter boldness in the frame.
- **Do** use `primary` oklch(0.54 0.129 242.2) for any blue that carries text or fills.
- **Do** give every semantic state a soft pair (text plus `*-soft` fill) and keep AA in light and dark.
- **Do** use pills for buttons and badges, hairline 1px borders on cards.
- **Do** place white text on blue and the dark frame, and dark text on aquamarine.
- **Do** label placeholders with a dashed border and the words "sample" or "placeholder".
- **Do** use the logo files from `public/brand` at their given colors and keep clear space.

### Don't:
- **Don't** recolor, distort, shadow, outline or put the logo on a photo.
- **Don't** extract the logo's ring or iris as a standalone graphic. The divider disc is the charter's own artwork and the only ring motif.
- **Don't** set Gilroy in all caps or add a second typeface.
- **Don't** use orange or tangelo as decoration or category color; they mean needs-a-person.
- **Don't** use dashed borders for anything but placeholder, sample or empty.
- **Don't** use hard offset shadows, neutral-gray admin chrome, Inter, or a KPI tile grid.
- **Don't** place gradients behind running text or data.
