# Built-To-Kanso

<p align="center">
  <img src="assets/logo-white.png" alt="Built-To-Kanso logo" width="320">
</p>

Wind-aware placement studio for Singapore HDB homes.

Built-To-Kanso helps a resident read an HDB home before adding more things to it. Pick a familiar flat template, set the door direction and floor level, then watch the home surface its airflow, damp, quiet, light, and placement constraints. The product is calm by design: it protects fixed HDB/SCDF elements, keeps Damp Risk in simple bands, refuses unsafe placements, and occasionally listens for real outdoor wind so the home can say when it is breathing well.

For a visual map of how the pieces fit together, open the [architecture overview](https://leprekonsg.github.io/Built-To-Kanso/built-to-kanso-architecture.html).

---

## Pages

| Route | What it does |
| --- | --- |
| `/threshold` | Stage 1. Choose a flat template, compass direction, floor level, and opening scenario. |
| `/bones` | Stage 2. Read the plan, place tokens, preview Ghost Futures, check Kanso Reserve, get Anti-Cure advice and a House Changelog. |
| `/recommendation-proof` | Three concrete moves the home is asking for, with deterministic flow, a Life Sketch panel, and a one-page receipt. |
| `/methodology` | Evidence ladder, cultural framing, audit gap, and hard rules. The page that earns the cultural reviewer's trust. |
| `index.html` (root) | Standalone marketing landing page. Plain HTML and CSS, no framework. |

---

## Run Locally

```powershell
cd app
npm install
npm.cmd run dev
```

Open `http://localhost:3000`. Start at `/threshold` — deep-link with `?template=&compass=&floor=&scenario=` to skip the onboarding during development.

Production build:

```powershell
cd app
npm.cmd run build
npm.cmd run start
```

---

## Environment

Local `.env*` files are gitignored and must stay out of git. The app runs without any variables set; each key unlocks an optional capability.

| Variable | Effect when absent |
| --- | --- |
| `NEA_API_KEY` | Resonance uses mock wind that rotates every 20 minutes. |
| `OPENAI_API_KEY` | All sketch routes return deterministic SVG fallbacks. |
| `OPENAI_ORG_ID`, `OPENAI_IMAGE_MODEL` | Optional. Default model is `gpt-image-2`. |
| `OPENAI_TIMEOUT_MS` | Optional. Default 120000 ms. |
| `SKETCH_CACHE_PROVIDER` | `memory` (default) or `file`. Per-process LRU, 64 entries / 30 min TTL. |
| `VAPID_*`, `R2_*` | Phase 2 only. Not used in Phase 1. |

---

## Checks

```powershell
cd app
npm.cmd run typecheck
npm.cmd run test          # unit tests (tsx --test)
npm.cmd run test:e2e      # Playwright
```

---

## Repository Layout

```text
.
+-- index.html                       # marketing landing page
+-- colors_and_type.css              # shared design tokens
+-- built-to-kanso-architecture.html # architecture overview
+-- PRODUCT.md                       # product brief and brand register
+-- DESIGN.md                        # visual system and component rules
+-- app/
|   +-- src/app/                     # Next.js routes and UI
|   +-- src/server/                  # deterministic domain logic
|   +-- src/data/templates/          # curated HDB plan geometry
|   +-- e2e/                         # Playwright tests
|   +-- public/                      # service worker and static assets
+-- assets/                          # brand artwork
```

---

## Hard Rules

- `plan-geometry.json` is compliance truth. AI must not alter walls, streamlines, token legality, Damp Risk, or Black-state decisions.
- Black-state HDB/SCDF elements hard-block with Golden Failure copy. Refusal is a designed surface, not an error state.
- Scout Pass surfaces at most three Asking Points. Severity meters and ranked defect lists are forbidden.
- Damp Risk surfaces as `Clear / Watch / High` only. Internal numerics never reach the homeowner.
- Streamlines are deterministic from the LBM velocity field. Image generation may only polish allowed visuals, never streamlines.
- Three.js renders are reference imagery only, never compliance truth.
- If WebGPU fails, the prebaked result serves silently. The fallback never surfaces to the homeowner.
- External systems must report unavailable config honestly. Do not pretend NEA, OpenAI, or WebGPU ran.

## Design Rules

- One accent only: West Sun Amber.
- Type: Cormorant Garamond display, Inter body, JetBrains Mono labels.
- No red/gold feng shui tropes, luopan chrome, dragon iconography, glassmorphism, gradient text, or generic render-app UX.
- Target: WCAG 2.2 AA with reduced-motion support.

---

## Phase 2 (not current scope)

- Upload an official floor plan instead of choosing from templates.
- Additional placement tokens: light, stillness, grounding, water calm, clarity.
- Richer weather views: humidity, monsoon, clutter, shelter, daily-wind.
- Photographic Prepass: detect existing furniture from room photos with resident permission.
- R2 cross-instance sketch cache and durable Resonance web-push subscriptions.
