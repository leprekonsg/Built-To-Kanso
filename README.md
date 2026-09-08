# Built-To-Kanso

<p align="center">
  <img src="assets/logo-white.png" alt="Built-To-Kanso logo" width="320">
</p>

Wind-aware placement studio for Singapore HDB homes.

Built-To-Kanso helps a resident read an HDB home before adding more things to it. Resident-ready operations are enabled per source-reviewed template and capability through an explicit release manifest. Templates outside that manifest remain diagnostic. Unsupported humidity and physical-benefit outcomes remain Not assessed; visual airflow is illustrative and does not establish measured performance.

For a visual map of how the pieces fit together, open the [architecture overview](https://leprekonsg.github.io/Built-To-Kanso/built-to-kanso-architecture.html).

---

## Pages

The table describes intended workflows. Current templates show diagnostic notices; resident-ready operations remain gated.

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
| `NEA_API_KEY` | Live weather is unavailable. Home-specific Resonance remains disabled regardless of credentials. |
| `OPENAI_API_KEY` | Eligible sketch operations use deterministic fallbacks; unreleased outputs remain blocked. |
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
npm.cmd run validate:release # unit + runner checks, build, typecheck, production Chromium tests
```

Release readiness evaluates only the templates, capabilities, and output types selected in `PHASE1_RELEASE_MANIFEST`. A layout-only release does not require pipeshaft data or generated image assets. Selecting an image output makes its template-bound PNG and metadata part of the release gate; stale or rejected pre-bakes cannot satisfy readiness.

The current manifest targets Tampines layout inspection, but its geometry remains unreviewed and blocked. This is a containment milestone. No template is enabled and home-specific environmental advice remains unavailable.

`app/output/release-validation/report.json` records commit and source fingerprints, build ID, commands, counts, and log paths. Production Playwright JSON/HTML reports and failure artifacts live in `app/output/e2e-production/`; the application-validation workflow uploads them for each CI run. Desktop Chromium and Pixel 7 emulation do not establish physical-device GPU performance or WebKit support. Synthetic permitted-path tests validate software behaviour, never source authenticity.

Cached template images in `app/public/` are not release evidence. The Next.js output boundary also covers direct cache URLs. Existing copies on static hosts or previously downloaded artifacts require a separate publishing audit; a local gate cannot retract them.

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
- Unmeasured humidity remains `Not assessed`. A physical claim requires an identified method, applicable inputs, and validation.
- Streamlines are deterministic from the LBM velocity field. Image generation may only polish allowed visuals, never streamlines.
- Three.js renders are reference imagery only, never compliance truth.
- If WebGPU fails, an explicitly illustrative fallback may render for an enabled capability. Neither path establishes physical benefit.
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
