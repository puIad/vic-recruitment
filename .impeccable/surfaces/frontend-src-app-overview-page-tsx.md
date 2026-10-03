---
version: 1
slug: "frontend-src-app-overview-page-tsx"
primary_target: "frontend/src/app/overview/page.tsx"
related_targets: ["frontend/src/components/gate/gate-screen.tsx"]
---

# Surface brief: VIC Recruitment control room (frontend/)

## Scope and mode

Operate. The whole signed-in app in `frontend/` (Vite + React + shadcn): overview, alerts inbox, binomes, interviewees, team, maintenance, settings, help, plus the sign-in gate and error pages. A redesign of the legacy `web/index.html` look. Product truth, content, every action and the `/api/run` contract are preserved; the old look is anti-reference.

## Audience, task, content, constraints

- Recruitment team (HR and IT of VIC, ENP). Laptop by day, phone for alerts. English only.
- Task: see where every candidate stands, run launch / lock / member changes, clear alerts, keep the Master healthy.
- Content: live `webState` from the script; sample data only on the four placeholder pages (Schedule, Binome desk, Analytics, Change history), always labelled.
- Constraints: Gilroy only (files in `assets/Gilroy`), no all-caps setting of Gilroy, logo never recoloured / distorted / shadowed / placed on photos, white text on charter blue and dark, dark text on aquamarine. Light default, dark mode supported. Light and dark both keep AA contrast.

## Chosen direction (pinned by the user's brief, no roll)

The VIC IT Charter 2026 is the world. The user asked to match its colours, gradients and fonts, use its logo and take its decorative assets "creatively". Charter motifs carry the frame (sign-in gate, sidebar, page headers, empty states, error pages); the data stays calm.

Memorable moment: the sign-in and error pages sit in the iris of the charter's section-divider disc, the same ring-and-slot drawn on page 4, 8, 23 and 33.

## Direction contract

THESIS: The control room is the charter alive: a calm white working surface inside a bold Charter frame. It refuses the generic admin look (neutral gray, Inter, random blue accent, KPI tile grid).

OWN-WORLD: White and #efefef surfaces, Dark Jungle Green #141e27 sidebar and ink, Cyan Cornflower Blue #127dbb (nudged to L .54 for AA text) as the one working accent, Medium Aquamarine #69c4af for completion and the second end of every gradient, Tangelo and Orange only for alerts and warnings. Gradients: teal-to-blue horizontal (ring), blue-to-teal vertical (cover). Gilroy Heavy blue titles over Light lines; Medium body; pill buttons and chips (the logo's base, the certificate pills); 1px gradient hairline footer with label left and note right; hairline-outlined giant word behind page headers; ring-with-slot disc; arches; blue and aquamarine dot grid. Dashed pills and dashed-border banners mark placeholders.

STORY: A team lead opens it before an interview day and sees in seconds how many candidates wait, which alerts are worst, and what to run next. Every write previews and confirms first. When nothing is wrong the screen says so plainly.

FIRST VIEWPORT: Overview at 1440. Left: Dark Jungle Green sidebar, white-wordmark logo, grouped nav, test-mode notice, account. Right: header with search, live status, bell, palette, theme, blue Sync now. Page title "Overview" in Gilroy Heavy blue with the outlined word behind it, then one Pipeline card (registrant count, department chips, status bar from cobalt to aquamarine, six stage counts), then Needs attention beside the Launch sequence.

FORM: Pinned by the user's brief (IT Charter 2026); no concept-seed run, no seed key. Shell and components come from the ShadcnStore dashboard template, restyled.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Which placeholder ideas become real next (Change history is done; Schedule, Binome desk, Analytics are left).

Resolved 2026-10-03: `frontend/` replaced `web/index.html` at the same URL (built into `web/dist`, the Vercel root stays `web/`), and the old page was deleted; the Gilroy files stay in the private repo.
