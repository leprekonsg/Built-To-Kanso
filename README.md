# Built-To-Kanso

<p align="center">
  <img src="assets/logo-white.png" alt="Built-To-Kanso logo" width="320">
</p>

Wind-aware feng shui studio for Singapore HDB homes.

Built-To-Kanso reads curated HDB plan geometry, surfaces calm physical readings, and helps residents place fewer, better objects. The product is calibrated for Singapore's 1.35 deg N tropical context: pipeshaft drift, west-sun heat, operable-opening area, floor wind behavior, and HDB/SCDF fixed elements.

## Quick Start

```powershell
cd app
npm install
npm run dev
```

Useful checks:

```powershell
cd app
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:e2e:smoke
```

## At A Glance

| Area | Current state |
| --- | --- |
| Landing | Root `index.html` and `colors_and_type.css` standalone marketing page |
| Product app | Next.js app in `app/` |
| Stage 1 | Threshold: template picker, 24-direction compass, floor slider, scenario picker |
| Stage 2 | Reading the Bones: geometry plan, Black-state elements, Scout Pass, Damp Risk |
| Templates | Three curated HDB `plan-geometry.json` files |
| APIs | `/api/templates/[id]/geometry`, `/api/scout`, `/api/tokens/validate`, `/api/changelog` |

## Current State

Backend Phase 1 foundations are in place:

- `app/src/server/geometry/*`: geometry types, registry, and validation.
- `app/src/data/templates/*/plan-geometry.json`: architect-curated HDB templates.
- `app/src/server/rules/*`: token placement, opening area, downwind, and House Changelog logic.
- `app/src/server/scout/scout.ts`: Scout Pass and Damp Risk skeleton.
- `app/src/server/folio/prompts.ts`: OpenAI image prompt registry.

## Product Principles

- Remove rather than place. Kanso Reserve and Anti-Cure are core product ideas.
- Every claim is physical. No metaphysical cures without measurable backing.
- Calm voice over alarm. Scout Pass surfaces at most three Asking Points.
- Tropical 1.35 deg N, not transplanted feng shui.
- `plan-geometry.json` is compliance truth. AI and visual systems must not alter compliance geometry, streamlines, token legality, Damp Risk, or Black-state decisions.

## Design Language

Creative north star: The Monsoon Atelier.

- Calm drafting-room interface, structured by instruments and hairline borders.
- One accent only: West Sun Amber.
- No red/gold feng shui tropes, luopan chrome, dragon iconography, property-listing density, glassmorphism, gradient text, or generic render-app UX.
- Core type system: Cormorant Garamond display, Inter body, JetBrains Mono labels.
- Target: WCAG 2.2 AA, with reduced-motion support.

## Repository Layout

```text
.
+-- index.html                  # standalone marketing page
+-- colors_and_type.css          # landing-page tokens and styles
+-- PRODUCT.md                   # strategic digest
+-- DESIGN.md                    # visual-system digest
+-- app/
|   +-- src/app/                 # Next.js routes and UI
|   +-- src/server/              # deterministic domain logic
|   +-- src/data/templates/      # curated HDB plan geometry
|   +-- e2e/                     # Playwright tests
+-- assets/                      # brand imagery
```

## Guardrails

- Never commit `.env` files or hardcode credentials.
- Keep backend domain logic under `app/src/server`.
- Keep curated data under `app/src/data`.
- Keep route handlers under `app/src/app/api`.
- Do not edit `_design_source/`, `.agents/skills/`, `.claude/skills/`, or `skills-lock.json`.
- Streamlines never pass through image generation. Deterministic SVG composition comes first.
- Three.js is reference imagery only, never compliance truth.

## Source Of Truth

`built-to-kanso-product-brief-v4_0.md` is the normative product brief. `PRODUCT.md` and `DESIGN.md` are the working digests for implementation.
