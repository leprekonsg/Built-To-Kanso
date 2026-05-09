# Built-To-Kanso

<p align="center">
  <img src="assets/logo-white.png" alt="Built-To-Kanso logo" width="320">
</p>

Wind-aware placement studio for Singapore HDB homes.

Built-To-Kanso helps a resident read an HDB home before adding more things to it. Pick a familiar flat template, set the door direction and floor level, then watch the home surface its airflow, damp, quiet, light, and placement constraints.

The product is calm by design: it protects fixed HDB/SCDF elements, keeps Damp Risk in simple bands, refuses unsafe placements, and occasionally listens for real outdoor wind so the home can say when it is breathing well.

## Phase 1 Demo

[![Built-To-Kanso Phase 1 demo](phase1-demo/media/demo-poster.png)](phase1-demo/built-to-kanso-phase1-demo.mp4)

For a visual map of how the pieces fit together, open [built-to-kanso-architecture.html](built-to-kanso-architecture.html).

## What You Can Try

| Page | What it does |
| --- | --- |
| `/threshold` | Choose a flat template, compass direction, floor level, and opening scenario. |
| `/bones` | Read the plan, place tokens, preview consequences, and get a short House Changelog. |
| `/methodology` | See how the app separates culture, weather context, layout estimates, and hard constraints. |

## Current Experience

- Curated HDB plan templates with protected fixed elements.
- Stage 1 Threshold: template, compass, floor, and scenario setup.
- Stage 2 Bones: plan editor/canvas, Asking Points, tokens, Ghost Futures, Kanso Reserve, Anti-Cure, and House Changelog.
- Deterministic airflow and rule checks before visual polish.
- Damp Risk shown as `Clear / Watch / High`, never raw alarm numbers.
- Resonance Hours: in-app `ResonanceBanner` polls `/api/resonance/check` and surfaces ONE calm banner per real wind-alignment event. Mock wind fallback when NEA is not configured.
- Designer mode: full eight-knob material parameter set (visibility, density, turbulence, softness, velocity-to-width, stagnation threshold, texture scale, preset) with localStorage persistence.
- Sketch routes for Plan, Life, Wind, and hero imagery: deterministic SVG fallbacks; OpenAI failures return 200 + fallback with `X-Sketch-Fallback` header so the UI never sees a 5xx.
- Tier 1 WebGPU LBM dispatch+readback (canonical 256x256 D2Q9) ships in the server module; silent Tier 4 fallback when WebGPU is unavailable.

## Run Locally

Install and run the local dev server:

```powershell
cd app
npm install
npm.cmd run dev
```

Open `http://localhost:3000`.

Run a production build locally:

```powershell
cd app
npm.cmd run build
npm.cmd run start
```

Open `http://localhost:3000`. If that port is busy, Next.js prints the alternate local URL.

## Product Rules

- `plan-geometry.json` is compliance truth.
- AI must not alter walls, streamlines, token legality, Damp Risk, or Black-state decisions.
- Black-state HDB/SCDF elements hard-block with Golden Failure copy.
- Streamlines are deterministic first; image generation may only polish allowed visuals.
- Three.js is reference imagery only, never compliance truth.
- External systems must report unavailable config honestly. Do not pretend NEA, OpenAI, or WebGPU ran. R2 and VAPID are out of Phase 1.

## Design Rules

- Creative north star: The Monsoon Atelier.
- One accent only: West Sun Amber.
- No red/gold feng shui tropes, luopan chrome, dragon iconography, glassmorphism, gradient text, property-listing density, or generic render-app UX.
- Type system: Cormorant Garamond display, Inter body, JetBrains Mono labels.
- Target: WCAG 2.2 AA with reduced-motion support.

## Future Features

Phase 2 is planned as Private Alpha work, not current demo scope:

- Let residents upload an official floor plan instead of choosing only from templates.
- Add more placement tokens for light, stillness, grounding, water calm, and clarity.
- Add more guidance for beds, screens, family-facing language, and science-first explanations.
- Make the home easier to walk through and review visually.
- Add richer weather, humidity, monsoon, clutter, shelter, and daily-wind views.

Photographic Prepass is also Phase 2. With permission, the app may use room photos to notice existing furniture and occupied zones. Without photos, the honest fallback is manual occupied-area marking.

## Developer Reference

Useful checks:

```powershell
cd app
npm.cmd run typecheck
npm.cmd run test          # unit tests (tsx --test)
npm.cmd run test:e2e      # Playwright
npm.cmd run build
```

## Technical Surface

| Surface | State |
| --- | --- |
| `/` | Next.js app entry |
| root `index.html` | Standalone marketing page |
| `/threshold` | Stage 1 onboarding: template, compass, floor, scenario |
| `/bones` | Stage 2 plan reading: plan editor/canvas, Black-state protection, Asking Points, tokens, Ghost Futures, Kanso Reserve, Anti-Cure, House Changelog |
| `/methodology` | Evidence ladder, cultural framing, audit gap, hard rules |
| `app/public/service-worker.js` | Push-notification scaffold for Phase 2; Phase 1 Resonance surface is the in-app `ResonanceBanner`. |

## Backend

| Area | Files |
| --- | --- |
| Geometry source of truth | `app/src/server/geometry/*`, `app/src/data/templates/*/plan-geometry.json` |
| Evidence tiers | `app/src/server/evidence.ts` |
| Rule engine | `app/src/server/rules/*`: token legality, opening area, downwind, quiet, glow, Kanso Reserve, Ghost Futures |
| Scout Pass and Damp Risk | `app/src/server/scout/*` |
| Tier 4 simulation | `app/src/server/simulation/*`, `app/src/server/lbm/*`, `app/src/server/materials/*` |
| Resonance Hours | `app/src/server/resonance/*`, `app/src/app/api/resonance/*`, NEA v2 realtime wind connector |
| Sketch generation and cache | `app/src/server/openai/*`, `app/src/server/storage/*`, `app/src/server/anchors/*`, `app/src/app/api/sketches/*` |

## API Contracts

- `GET /api/templates/[id]/geometry`: validated template geometry.
- `POST /api/scout`: max-three Asking Points, opening-area badge, banded Damp Risk.
- `POST /api/tokens/validate`: token legality and Golden Failure copy.
- `POST /api/ghost-futures`: pre-placement Breath and Damp deltas, evaluated against current placements.
- `POST /api/changelog`: short homeowner receipt after placements.
- `POST /api/simulation`: deterministic Tier 4 field with explicit CPU/prebake source metadata and Weather Trial conditions.
- `POST /api/resonance/check`: current wind alignment evaluation; returns a `banner` payload with a stable `alignmentEventId` for client-side dedup. Optional `siteLocation` selects nearest shared NEA station. **Phase 1 surface.**
- `GET|POST /api/resonance/dispatch`, `POST /api/resonance/subscribe`, `GET /api/resonance/vapid`: VAPID web-push scaffolding for Phase 2. Not used by the Phase 1 `ResonanceBanner`.
- `GET /api/sketches/hero`: prebaked or generated hero image.
- `POST /api/sketches/plan`: deterministic SVG fallback, cached/generated PNG when configured.
- `POST /api/sketches/life`: cached Three.js anchor PNG seam, deterministic SVG fallback, optional OpenAI materialization.
- `POST /api/sketches/wind`: deterministic Wind Sketch SVG composition; streamlines never go through GPT image generation.

## Environment

Local `.env*` files are ignored and must stay out of git.

| Variable | Use |
| --- | --- |
| `NEA_API_KEY` | Optional higher-rate access for `api-open.data.gov.sg/v2/real-time/api/wind-direction` and `/wind-speed`. Without it, Resonance uses tagged mock wind that rotates every 20 minutes. |
| `OPENAI_API_KEY` | Enables OpenAI sketch materialization. Without it, deterministic SVG fallbacks render on every sketch route. |
| `OPENAI_ORG_ID`, `OPENAI_IMAGE_MODEL` | Optional. Default model is `gpt-image-2-2026-04-21`. |
| `OPENAI_TIMEOUT_MS` | Optional, default 25000. AbortController-driven timeout on the OpenAI call. |
| `SKETCH_CACHE_PROVIDER` | `memory` (default) or `file`. R2 is rejected at config; the cache is per-process in-memory LRU (default 64 entries / 30 min TTL). |
| `SKETCH_CACHE_MAX_ENTRIES`, `SKETCH_CACHE_TTL_MS` | Optional cache tuning. |
| `VAPID_*`, `R2_*` | Phase 2 only. Unused by Phase 1; the Resonance banner is in-app and the sketch cache is in-memory. |

## Repository Layout

```text
.
+-- index.html
+-- colors_and_type.css
+-- PRODUCT.md
+-- DESIGN.md
+-- app/
|   +-- src/app/             # Next.js routes and UI
|   +-- src/server/          # deterministic domain logic
|   +-- src/data/templates/  # curated HDB plan geometry
|   +-- e2e/                 # Playwright tests
|   +-- public/              # service worker and static app assets
+-- assets/
+-- scripts/
```

## Validation

Latest local checks:

```powershell
cd app
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Result: `typecheck` clean, 188/188 unit tests pass.

## Remaining Limitations

- Tier 1 WebGPU LBM dispatch+readback is implemented at the canonical 256x256 grid in `app/src/server/lbm/gpuSolver.ts` and exposed via `buildSimulation`. The browser-side `LiveStudio` consumer that actually awaits this path is the next step; until it lands, Tier 4 serves the visible field. WebGPU support follows browser availability (Chrome / Edge stable; Safari 26+; Firefox 141+ behind a flag on some platforms).
- Tier 4 has deterministic generated matrix coverage, not 270 physically distinct stored LBM blobs.
- Life Sketch PNG rendering is a seam: cached PNGs are served if present, deterministic SVG is the fallback.
- OpenAI sketch production requires a real `OPENAI_API_KEY`. The cache is per-process in-memory; cold-start re-fills are expected. R2 cross-instance caching is out of Phase 1.
- Resonance uses the data.gov.sg v2 realtime wind shape and converts wind speed from knots to m/s; true nearest-station behavior needs callers to pass `siteLocation`.
- Resonance Hours Phase 1 surface is the in-app banner. Web-push dispatch (`/api/resonance/dispatch`, `/subscribe`, `/vapid`) and durable subscription/cooldown storage are Phase 2 scaffolds.

