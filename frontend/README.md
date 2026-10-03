# VIC Recruitment: new dashboard (`frontend/`)

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui, started from the ShadcnStore dashboard template and restyled to the
VIC IT Charter 2026. It speaks the same `/api/run` contract as the legacy `web/index.html`, so it can replace it without
touching the Apps Script. Not deployed yet; `web/` is still what https://vic-recruitment.vercel.app serves.

Why this and not the template's Next.js version: the app is a signed-in SPA that only calls the existing Vercel functions
(`web/api/*`). No server rendering is needed and those functions stay as they are. Details: [../docs/frontend.md](../docs/frontend.md).

## Run it

```bash
cd frontend
npm install
npm run mock     # terminal 1: the mock Google + the real api/ functions on :3000 (seeded with 40 registrations)
npm run dev      # terminal 2: http://localhost:5173/dev-login?as=admin@g.enp.edu.dz
```

`?as=helper@g.enp.edu.dz` shows the no-access gate, `?as=` the sign-in gate. The dev server proxies `/api` and `/dev-login` to the mock
(`VIC_API=http://host:port` to point elsewhere). `npm run build` type-checks and builds to `dist/`; `npm run typecheck` alone is `tsc -b`.

## Where things are

| Path | What |
|---|---|
| `src/lib/vic/` | the data layer: `api.ts` (`POST /api/run`), `store.ts` (state, 15 s live refresh, activity log), `actions.tsx` (every old dashboard action with its preview and confirm), `types.ts` (the `webState` shape) |
| `src/app/*` | pages: overview, alerts, binomes, interviewees, team, maintenance, settings/*, help (FAQ); placeholders: calendar (Schedule), chat (Binome desk), analytics, settings/history |
| `src/components/brand/` | the logo traced from the charter vectors, the charter's decorative motifs (ring, arches, outlined word, dots, footer rule) |
| `src/components/work-panels/` | Change members sheet (replace / swap / cover) and Move interviewee dialog, opened from anywhere through `lib/vic/ui.ts` |
| `src/index.css` | colour tokens (charter palette, light and dark), Gilroy `@font-face`, gradients |
| `src/assets/fonts/` | Gilroy woff2, converted from `assets/Gilroy` (licensed, club-supplied) |
| `public/brand/` | standalone logo SVGs (colour, on dark, white, icon, favicon) |

## Rules to keep

- Charter: never set Gilroy in all caps, never recolour, shadow or distort the logo; white text on blue and dark, dark text on aquamarine.
- Orange and Tangelo only mean "needs a person". Dashed borders only mark a placeholder or an empty state.
- A page that writes to sheets, shares files or sends mail previews and confirms first (`useActions()`).
- A placeholder page says so with `PlaceholderBanner` and labels its sample data.
