# Built-To-Kanso

<p align="center">
  <img src="assets/logo-white.png" alt="Built-To-Kanso logo" width="320">
</p>

Wind-aware feng shui studio for Singapore HDB homes.

Built-To-Kanso reads curated HDB plan geometry, protects HDB/SCDF fixed elements, and helps residents place fewer, better objects. Phase 1 is calibrated for Singapore: pipeshaft drift, west-sun heat, operable-opening area, floor wind behaviour, monsoon context, and banded Damp Risk.

## Quick Start

```powershell
cd app
npm install
npm.cmd run dev
```

Useful checks:

```powershell
cd app
npm.cmd run typecheck
npm.cmd run test:e2e
npm.cmd run build
```

## Current Surface

| Surface | State |
| --- | --- |
| `/` | Next.js app entry |
| root `index.html` | Standalone marketing page |
| `/threshold` | Stage 1 onboarding: template, compass, floor, scenario |
| `/bones` | Stage 2 plan reading: geometry, Black-state protection, Asking Points, tokens, Ghost Futures, Kanso Reserve, Anti-Cure, House Changelog |
| `/methodology` | Evidence ladder, cultural framing, audit gap, hard rules |
| `app/public/service-worker.js` | Resonance Hours push notification handler |

## Current Backend

| Area | Files |
| --- | --- |
| Geometry source of truth | `app/src/server/geometry/*`, `app/src/data/templates/*/plan-geometry.json` |
| Evidence tiers | `app/src/server/evidence.ts` |
| Rule engine | `app/src/server/rules/*` |
| Scout Pass and Damp Risk | `app/src/server/scout/*` |
| Tier 4 simulation scaffold | `app/src/server/simulation/*`, `app/src/server/lbm/*`, `app/src/server/materials/*` |
| Resonance Hours scaffold | `app/src/server/resonance/*`, `app/src/app/api/resonance/*` |
| Sketch scaffolds | `app/src/server/openai/*`, `app/src/app/api/sketches/*`, `scripts/prebake-hero.ts` |

## API Contracts

- `GET /api/templates/[id]/geometry`: validated template geometry.
- `POST /api/scout`: max-three Asking Points, opening-area badge, banded Damp Risk.
- `POST /api/tokens/validate`: token legality and Golden Failure copy.
- `POST /api/ghost-futures`: pre-placement Breath and Damp deltas, evaluated against current placements.
- `POST /api/changelog`: short homeowner receipt after placements.
- `POST /api/simulation`: deterministic Tier 4 pre-baked field.
- `POST /api/resonance/check`: current wind alignment evaluation.
- `POST /api/resonance/subscribe`: in-memory push subscription registration.
- `GET /api/resonance/vapid`: public VAPID key when configured.
- `GET /api/sketches/hero`: prebaked or generated hero image.
- `POST /api/sketches/plan`: returns 422 until deterministic SVG-to-PNG conversion is wired.
- `POST /api/sketches/life`: returns 422 until Three.js anchor PNGs are available.

## Product Rules

- `plan-geometry.json` is compliance truth.
- AI must not alter compliance geometry, wall positions, streamlines, token legality, Damp Risk, or Black-state decisions.
- Damp Risk is homeowner-facing as `Clear / Watch / High`; internal numerics must not surface.
- Watch and High Damp readings always include an action.
- Scout Pass surfaces at most three Asking Points.
- Black-state HDB/SCDF elements hard-block with Golden Failure copy.
- Streamlines are deterministic first; image generation may only polish allowed visuals.
- Three.js is reference imagery only, never compliance truth.

## Design Rules

- Creative north star: The Monsoon Atelier.
- One accent only: West Sun Amber.
- No red/gold feng shui tropes, luopan chrome, dragon iconography, glassmorphism, gradient text, property-listing density, or generic render-app UX.
- Type system: Cormorant Garamond display, Inter body, JetBrains Mono labels.
- Target: WCAG 2.2 AA with reduced-motion support.

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

## Known Gaps

- LBM GPU kernels are scaffolds; CPU/Tier 4 paths carry the current demo contract.
- Plan Sketch needs deterministic SVG-to-PNG conversion.
- Life Sketch needs Three.js anchor PNG generation.
- Resonance push dispatch is not implemented; subscription storage is in-memory.
- Some untracked resonance unit tests currently target APIs that are not implemented yet.

## Source Of Truth

- `built-to-kanso-product-brief-v4_0.md` is the local normative brief when present; it is gitignored and currently patched to v4.1.
- `PRODUCT.md` and `DESIGN.md` are the tracked implementation digests.
