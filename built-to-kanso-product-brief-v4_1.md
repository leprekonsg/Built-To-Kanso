uilt-To-Kanso — Product Brief v4.1

Tropical Edition with trust-layer hardening. Wind-aware design for HDB homes. Built calm with intent.

Frozen for hackathon execution. This document supersedes v2.2 (live studio visualization), v3.0 (Resonance Hours), and v3.1 (hidden Shikaku diagnostic spine). v4.1 preserves v4.0's architecture while hardening three trust surfaces: banded Damp Risk, the five-tier evidence ladder, and Phase 0.5 kill signals.

This is the document the first PR is written against. Every prior version's "unchanged from v2.2" deferral has been resolved into explicit text below.

1 · The product in one paragraph

Built-To-Kanso is a wind-aware feng shui studio for Singapore HDB homes. A homeowner picks their HDB unit type from a curated library of canonical layouts, sets the compass dial to match their main door's facing direction, picks their floor level, and watches a live WebGPU airflow simulation flow through their floor plan — rendered through silk, sun-lit dust, and (when the user wants the analytical view) line-integral-convolution textures, all read from the same physics field through one Environmental Material System. The product runs a quiet Scout Pass before any token is placed, surfacing at most three Asking Points the home is making. The user places a few well-chosen tokens from a curated set of six; the simulation rebalances in real time; a House Changelog appears as the receipt. The product flags Damp Risk as Clear / Watch / High bands derived from an internal pillow-RH estimator, Stagnation in living rooms that fall below 0.1 m/s, and Pipeshaft Drift in any room downwind of an HDB service shaft. A folio of three sketches generates — Plan, Life, Wind — and then the product does something no feng shui app has done before: it stays with the home. When the actual wind outside aligns with the unit's optimal cross-ventilation corridor, the user gets one quiet notification — "Your home is breathing right now." Calm by design, structured by intent, fluid in motion, tropical by context — and now physically Singaporean in a way no competing app has been.

2 · Positioning

Built-To-Kanso is a wind-aware feng shui studio for HDB homes. It reads your floor plan, shows how air, light, and attention could move through the unit, helps you place fewer better objects — and, occasionally, lets you know when the wind outside is in conversation with the home you've made.

Landing page hero phrase: Built for Better Air. Better Life. Place a token. See the air move. Then let the wind tell you when to open the window.

The category is spatial intelligence for new homeowners. The references are Qanvast for inspiration, emerging AI render apps (Banana Designer, REimagineHome) for visualization, Modsy as a historical cautionary tale in 3D home visualization, classical feng shui consultants at S$2,000 per visit for cultural authority, and Singapore ID firms for execution.

The Nanyang positioning (new in v4.0, surfaced on the methodology page and in the Designer-mode voice):

"We're not Hong Kong feng shui. We're not Beijing feng shui. We're Nanyang feng shui — the tropical school that welcomes wind instead of hiding from it. Every rule in this product is calibrated for 1.35° N, not 39.9° N."

That single sentence does enormous work. It tells a Singaporean user we're for you specifically. It tells a cultural reviewer we know what we are. It tells a competitor in Hong Kong or Shanghai you can't copy this without rewriting your whole physics.

3 · The Kanso turn

The product's headline verb is remove, not place.

Kanso Reserve is the headline metric. "73% healthy empty space preserved." Useful objects don't count as clutter. Enoughness is not emptiness.

The Anti-Cure is a first-class recommendation, ships in Phase 1. "Leave this corner unbuilt-in for 90 days after move-in."

The Less-Is-More Counter takes credit for what users did not buy. "You avoided 11 objects, ~S$1,840 estimated spend, 4.2m² of visual load."

The Kanso Reserve carries the explicit guardrail copy: "Useful objects don't count as clutter. A piano is enoughness." This pre-empts the Vohs et al. 2013 counter-finding that disorder boosts creativity — Marie Kondo absolutism is not what the evidence actually supports.

4 · Brand identity

Brand sheet v3 is visual law.

Logo motifs (5): Roof + Shelter, Window Grid, Wind Path, Cross Breeze, Tropical Overhang. Equal-weight. Singapore-tropical, not generic Japanese minimalist.

Primary palette: Ink Black #111111, Bone White #F5F1E8, Void Deck Grey #C9C4BA, HDB Concrete #A79F93.

Secondary palette: Monsoon Sage #7C856D, Banyan Green #5E6B4C, Rattan Beige #C9B68C, Teak Brown #8A664B.

Accent palette: West Sun Amber #D8A24A, Terracotta Clay #B96F4D, Heat Haze Gold #E5C37A.

Typography: Kanso Editorial Serif (display), Tropical Grotesk (subheadline), Warm Humanist Sans (body), Noto Serif SC (Chinese).

Dark mode: Night Ink #0A0A0A, Soft Bone #F0E1D5, Void Grey #2A2A2A, Amber Glow #F1804E.

Color anchoring discipline. Each brand color anchors to a specific surface in any GPT Image 2 prompt:

Color	Surface anchor in prompts
Ink Black #111111	Sumi-e streamlines, mullion frames
Bone White #F5F1E8	Washi paper ground, off-white plastered walls
Void Deck Grey #C9C4BA	Terrazzo void-deck floor, microcement feature wall
Monsoon Sage #7C856D	Sofa upholstery, kitchen cabinet, monstera leaf
West Sun Amber #D8A24A	Late-afternoon raking light spill (NEVER as paint, only as cast light) — also clean-air particles
Terracotta Clay #B96F4D	Single ceramic vessel, accent cushion, fire-element cure

Etymology disclosure (binding for the About page and any cultural-review surface):

"Built-To-Kanso draws its name from kansō (簡素), the Japanese principle of pared-down simplicity. The geomantic tradition behind our compass and airflow logic is Chinese Form-School feng shui (峦头派) and modern building science, not Japanese kasō (家相)."

A 30-word disclosure the deep research literature makes load-bearing. It costs nothing and protects the brand from cultural-credibility critique.

5 · The Environmental Material System (the architectural spine — NEW in v4.0)

The single most important change in v4.0 is that wind, heat, sound, clutter, and resonance are no longer separate overlays glued together. They are five fields fed into one material system, rendered through pluggable presets. This is what makes the product feel like one thing instead of a stack of features.

5.1 The architecture
plan-geometry.json             ← compliance truth
       │
       ▼
┌─────────────────────────────────────────────┐
│ FIELD SOLVERS                               │
│ ─────────────                               │
│ ► WebGPU LBM            (velocity, ACH)     │
│ ► Pipeshaft jet field   (vertical transport)│
│ ► Solar trajectory      (incidence, MRT)    │
│ ► RT60 estimator        (acoustic)          │
│ ► RH-at-pillow estimator (humidity)         │
│ ► Kanso pressure        (clutter)           │
│ ► NEA wind connector    (real-time external)│
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ ENVIRONMENTAL MATERIAL SYSTEM               │
│ ─────────────────────────────               │
│ Phase 1 primary materials (3, homeowner):   │
│   ► silk_ribbon  (live studio)              │
│   ► sunlit_dust  (live studio)              │
│   ► sumi_ink     (Wind Sketch export)       │
│ Phase 1 scene-response material (1):        │
│   ► plant_lean   (curtain / leaf / shadow)  │
│ Phase 1 designer-only material (1):         │
│   ► audit_lic    (Designer / debug)         │
│ Phase 2 materials (3):                      │
│   ► humid_air                               │
│   ► monsoon_glow                            │
│   ► clutter_pressure                        │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ PRESENTATION CONTEXTS                       │
│ ─────────────────────                       │
│ ► Live Studio        (Silk + Dust + curtain/leaf + perforated shadow)
│ ► Wind Sketch Export (deterministic Sumi Ink SVG composition)
│ ► Audit View         (LIC + velocity ticks + stagnation wash)
│ ► Resonance Hours    (real wind vector → luminous corridor)
└─────────────────────────────────────────────┘
5.2 The user-facing control surface

Terminology — "view" vs. "mode" vs. "personality variant." The product uses three distinct vocabulary axes that must not collide. **View** refers to the Material System control surface (Homeowner view = single Wind Visibility slider; Designer view = full parameter set). **Mode** refers to the four user voices in Section 12 (Cultural, Designer, Elder, Science). **Personality variant** refers to a token's three visual styles (Wabi-Sabi, Japandi, Tropical Modernist). Designer is overloaded across view and mode but is consistent: ID firms get both the Designer view of the Material System and the Designer voice mode; homeowners get the Homeowner view and the Cultural voice mode by default.

Homeowner view exposes one control: a single slider labeled "Wind Visibility — Barely Seen → Clearly Seen." That's it. The slider modulates particle density, ribbon opacity, curtain response gain, and stagnation-wash strength simultaneously, all bound to the same underlying field.

Designer view (Phase 1, ships alongside Cultural mode) exposes the full parameter set: visibility, density, turbulence, softness, velocity-to-width modulation, stagnation opacity threshold, texture scale, and the material preset selector. ID firms get the analytical view; homeowners get the calm view; the data underneath is identical.

5.3 Why this is the architectural spine, not a feature

Three reasons.

First, it eliminates a product-coherence problem. Before v4.0, the brief asked a judge to mentally connect three different visual languages: live-studio amber particles, Wind Sketch sumi-e brushwork, audit LIC textures. The Material System makes the connection literal. A judge dragging the Wind Visibility slider from Barely Seen to Clearly Seen watches the same airflow modulate from "calm interior" to "engineering diagnostic." Same data, same field, same gesture — different material.

Second, it makes Phase 2 expansion cheap. Adding humid_air or monsoon_glow in Phase 2 is a new material preset, not a new overlay subsystem. The infrastructure for "render the field through a new texture" already exists.

Third, it gives Hard Rule #23 (below) something to enforce. If a feature can't be expressed as a material preset on top of the existing fields, it doesn't ship. This is the architectural commitment that prevents Phase 2/3 from becoming a graveyard of bespoke renderers.

5.4 Phase 1 materials

Three primary homeowner-visible materials carry the calm-and-clear visual register:
silk_ribbon — the dominant cross-ventilation corridor as a soft semi-transparent ribbon (Bone White core with subtle Heat Haze Gold gradient), stroke-width modulated by local velocity magnitude, gentle kasure (dry-brush flying-white) at endpoints. Updates with LBM at ~15fps.
sunlit_dust — depth-aware particles in West Sun Amber #D8A24A, velocity-coupled to the LBM field, 200–400 per scene at 60fps. Pipeshaft jet rendered as a gray sunlit_dust variant so users see good air and bad air separately.
sumi_ink — the Wind Sketch export-only register. Sumi-e SVG streamlines composited deterministically over GPT Image 2 backgrounds. Streamlines never pass through the generative model.

One scene-response material is also homeowner-visible but operates as a coupling layer between the LBM velocity field and the Live Studio's diegetic scene elements rather than as a self-contained register:
plant_lean — soft per-element rotation/skew applied to in-scene plants, monstera leaves, curtains, and similar light-mass scene elements. Reads local velocity at each anchor point and tilts the element's rendered geometry along the flow direction. This is the material that drives Item 5's curtain response, monstera leaf response, and (in combination with the eight pre-baked shadow textures) the perforated kitchen-partition shadow blend. It is homeowner-visible but never exposed as a slider — it rides the same Wind Visibility dial as the primary three.

Plus audit_lic in Designer view only: line-integral-convolution texture revealing global field structure with a stagnation wash where velocity falls below 0.1 m/s.

Item 5's three live-studio scene elements (curtain response, monstera leaf response, perforated kitchen-partition shadow blend) are driven by plant_lean and the shared field architecture — they are scene-element responses driven by the material system rather than independent layers.

6 · The seven-stage user journey

The seven stages below describe the **experience** the user has, not the screen architecture they navigate. Phase 1 routes that experience across two surfaces:

- **`/threshold`** — Stage 1 in full.
- **`/studio`** — Stages 2 through 6, exposed as facets of a single tabbed surface (Plan, Tokens, Wind Sketch, Render, Proof). The IA collapse honors the magic-in-90-seconds gate: testers should not navigate between five screens to feel the air move.

Stage 7 (Three Voices) ships in Phase 2 alongside the folio export. Stage 2.5 (Scout Pass) runs as a hidden diagnostic spine inside `/studio`, not as its own surface. Hyphenated paths from earlier drafts (`/bones`, `/weather`, `/tokens`) survive as 308 redirects to `/studio` so external links and bookmarks keep working.

The first session compresses to four steps to deliver magic in 90 seconds.

Stage 1 · Threshold

Three onboarding paths:

HDB Archetype (Phase 1, the only path that ships): user picks from three canonical layouts — Tampines GreenWeave 4-room, Tengah 5-room open-kitchen, Resale Executive Apartment 1990s archetype.
Plan Upload — Phase 2, fully stubbed in Phase 1.
Guided Sketch — Public Beta.

Three physical inputs: rotate an on-screen compass dial until the main door arrow matches the real home's facing (snaps to 24 directions); set the floor-level slider (1–3 Ground Stagnation, 4–8 Transition, 9–15 Golden Floors, 16+ Wind Turbulent); and pick the Common Household Scenario (no demographic inference).

The Golden Floors microcopy (NEW v4.0) appears on first-floor selection: "You're on floor 11 — you're in the range Singaporean masters call the Golden Floors. Optimal natural ventilation here." For floors 1–3: "You're on a low floor. Wind reaches you less often. Resonance Hours will be quiet here — that's not a bug, that's your floor." This calibrates expectations honestly.

Stage 2 · Reading the Bones (templates only in Phase 1)

For HDB Archetype templates, parsing is skipped. Each template loads pre-traced as a hand-curated plan-geometry.json with the four-state confidence UI pre-applied by an architect.

Walls render in four confidence states: Green (template-validated), Amber (edge-case), Red (caution, none expected in templates), Black (HDB/SCDF-controlled safety elements — hard-blocks token placement).

The Black state is non-negotiable safety design. Coverage:

Household Shelter walls, floor, ceiling, door, vents, perimeter (SCDF civil defence shelter elements)
Structural walls, beams, columns, wet-zone risk areas, unsafe obstructions (HDB structural elements)
(NEW v4.0) Pipeshaft openings — marked as Black on the wall surface but with an additional "buffer-eligible" attribute that the Shaft Buffer token can attach to within 0.6m clearance

Each template's plan-geometry.json now also marks (NEW v4.0): pipeshaft location and opening direction, bathroom positions for the bathroom-downwind check, façade west-sun exposure for the Solar Shield rule, and combined operable-opening area for the 12%-threshold badge.

Stage 2.5 · Scout Pass (the hidden diagnostic spine, from v3.1)

After template selection and compass setup but before the Token Ritual, the product runs a quiet diagnostic pass. This is Shikaku as infrastructure, not personality.

The UI copy is calm:

The house is listening.

Three lightweight scouts run from the deterministic model:

Breath Scout — where air rushes, stalls, or short-circuits.
Glow Scout — where west sun and glare punish the room.
Quiet Scout — where bedroom or living-room sound risk appears.

The user sees at most three Asking Points. Examples:

"Entry moving too fast."
"West edge carrying heat."
"Bedroom corner holding still air."
(NEW v4.0) "Master bedroom downwind of pipeshaft."
(NEW v4.0) "Pillow-level humidity high."

No severity language. No scanner dashboard. No ranked defect backlog. Designer Mode can reveal details; the default studio surfaces only what the home is asking for.

Stage 3 · Qi Weather Map

Three overlays unlock in Phase 1, all rendered through Environmental Material System presets rather than as bespoke layers.

Breath — live WebGPU 2D LBM airflow rendered as silk_ribbon + sunlit_dust. Evidence tier: Prototype visualisation. Source of truth for the live studio visualization.
Glow — daylight + west-sun heat path rendered as a tinted material wash. Includes the explicit tropical-orientation copy: "Singapore latitude inverts the classical south-facing rule. We show you which façade carries the worst afternoon heat — that's the variable that matters here."
Quiet — RT60 estimation for living spaces, traffic noise overlay for units adjacent to PIE/AYE/BKE, rendered as a damped-ripple material. Bedroom target: ≤30 dB LAeq (WHO 2018). Living room target: RT60 0.4–0.6 s (WELL S02).

Shelter and Ma reveal progressively across return visits.

Stage 4 · Token Ritual

Phase 1 ships six tokens (final, frozen). Each maps to a measurable physical claim. No metaphysical cures.

Token	Physical claim	Phase 1 rule-engine logic
Wind Gate	Cross-ventilation, behavior or perforated opening	Active when 12%-opening badge is "capable"; suggests window-opening times keyed to NEA monsoon data
Soft Screen	Porous-not-solid; redistributes flow without blocking	Surfaces when door-balcony alignment creates straight-axis qi rush; also when entry generates >0.3 m/s draft on sofa
Wood Anchor	Biophilia, corner softening — not air purification	Tooltip: "Plants improve psychological wellbeing. They do not measurably purify residential air."
Solar Shield	West-sun heat load management; SHGC ≤ 0.30 + film + light shelf	Auto-suggested for any façade carrying afternoon sun (16:00–18:30) given the user's compass orientation
Fan Anchor	Extends thermal comfort by 1.5–3 °C in tropical air	Auto-suggested when 12%-opening badge is "marginal"; can be a behavior token (run 14:00–19:00)
Shaft Buffer (NEW v4.0)	Deflects 0.15–0.25 m/s pipeshaft jet by 40–60%	Auto-surfaces in Damp Risk path; placement constrained to within 0.6m of shaft door

The Wind Gate can be a behavior, not just an object: "Open the kitchen window from 6:30–8:30pm during NE monsoon."

The Wood Anchor carries the explicit guardrail tooltip. The Cummings & Waring 2019 refutation of plant-air-purification is the load-bearing citation; the product never claims plants clean air.

The Shaft Buffer is the v4.0 headline addition. It only activates when the user's template has a marked pipeshaft (all three Phase 1 templates do). It deflects the upward jet, drops Damp Risk in adjacent bedrooms, and is the moment a Singaporean parent forwards the demo to their family.

Each token has three personality variants: Wabi-Sabi, Japandi, Tropical Modernist. All variants pass the rule engine.

Phase 2 adds the original five (Fire Glow, Stillness Seat, Earth Hold, Water Quiet, Metal Clarity) plus a Solid-Back placement constraint on the bed token (60cm clearance both sides, head against interior wall) and a Mingtang Screen variant on Soft Screen.

After each token placement, the studio writes a House Changelog instead of technical patch notes:

Home Changelog
Entry rush softened.
Bedroom path opened.
One corner left empty.
Pipeshaft jet deflected.
No fixed HDB elements touched.

This is the receipt for the magic: calm, factual, four to five lines max.

Golden Failure for Black state. If a token is dropped on a Household Shelter wall, structural element, wet-zone risk area, unsafe obstruction, or directly on a pipeshaft opening, the system refuses beautifully:

This wall is not asking to be changed.
HDB fixed elements stay fixed. We can work with the edge instead.

Then offer one of three alternatives: place Soft Screen nearby, use lighting/textile/plant as a non-invasive gesture, or mark the area as an Anti-Cure.

Stage 5 · Ghost Futures

When the user drags a token, three Ghost Futures appear before drop:

Position A — rule engine's highest-ranked
Position B — where the user is currently dragging
Position C — alternate the rule engine surfaces for contrast

Each Ghost Future shows the resulting Breath delta as a thumbnail preview, computed by warm-starting the LBM from the current state. For the Shaft Buffer, Ghost Futures additionally show the Damp Risk delta in adjacent rooms.

Stage 5.5 · Weather Trial (demo-only flourish)

For hackathon theatre, the judge can tap Weather Trial and watch the home tested under three conditions:

West Sun, 17:20
Highway Night
NE Monsoon Wind

Each trial lasts two or three seconds, then the interface returns to the calm studio. This gives the pitch teeth without turning the user experience into an attack dashboard.

Stage 5.6 · Photographic Prepass (Phase 2)

Photographic Prepass ships in Phase 2, not Phase 1. It is documented here for stage-flow continuity but is intentionally absent from the 26-item Phase 1 build list, Section 13's stack, Section 18's Hard Rules, and Appendix B's pipeline diagram. Built-To-Kanso remains floor-plan driven: tokens anchor to plan geometry and wind solves drive decisions. Many homeowners already have partially furnished homes when they encounter the product, and an optional Photographic Prepass lets users upload photos of their real space to inform token recommendations without breaking the deterministic geometry pipeline.

What it does. On opt‑in photos, a local object detector (Ultralytics YOLO26 or newer) identifies existing furniture, fixtures and clutter. Detected objects are projected back onto the floor‑plan coordinate system to update the Kanso Reserve and hide incompatible token spots. For example, if a sofa already fills the Bright Hall, the Wood Anchor suggestion is suppressed or relocated. Likewise, if a mirror is already on the left wall, the Metal Clarity token is flagged as redundant. Users get a more tailored set of options while the rule engine preserves all immutable HDB constraints.

Why YOLO26. YOLO26 is Ultralytics’ end‑to‑end NMS‑free detector with improved small‑object accuracy and up to 43 % faster CPU inference than previous YOLO versions. Its quantization stability makes it ideal for on‑device inference in Singaporean HDB contexts, where privacy requires keeping images local. The model’s efficiency allows near‑real‑time detection on laptops or tablets without sending photos to the cloud. Future versions (e.g., YOLO28) can be slotted in without changing the interface.

Respecting privacy. Photographic Prepass is strictly opt‑in. Images never leave the user’s device; detection runs in the browser or on a local worker. The system discards photos immediately after analysis and only stores semantic object labels and positions. Users who skip this step use the canonical template with manual token placement as before.

Design integrity. The Photographic Prepass never alters walls, doors or service yards. It only adjusts token suggestions. It cannot remove the sofa, it can only say “this is taken.” The plan geometry, wind solve and Kanso Reserve remain the single source of truth. In Phase 2, this stage runs after Stage 5.5 and before the sketches once the detection model, privacy guardrails, and UI flows are production-ready.

Stage 6 · The Three Sketches

Three artifacts generate in parallel as an asynchronous triptych. UI streams progress states for each artifact independently. Two distinct pipelines run depending on the artifact.

Three-stage deterministic pipeline for Wind Sketch and Plan Sketch:

Stage A — Physics solve. WebGPU LBM (browser, 256×256 grid) computes the velocity field. Streamlines extracted as SVG paths with velocity-encoded opacity. The SVG IS the source of truth.

Stage B — Styled background generation via GPT Image 2. Two parallel calls via images.edit. Streamlines are NOT in the prompts. The model produces ONLY styled architectural backgrounds:

Plan Sketch — top-down sumi-e architectural rendering, NO airflow streamlines
Wind Sketch base — top-down sumi-e architectural rendering, framed for hero composition

Stage C — Deterministic SVG composition in browser. The SVG streamlines from Stage A are composited on top of the GPT Image 2 backgrounds from Stage B using SVG/CSS filters that give them sumi-e brush quality:

Stroke-width modulation along path (thicker = faster flow)
feTurbulence + feDisplacementMap for kasure (dry-brush flying-white) at stroke ends
Paper-texture multiply blend mode for ink-on-washi appearance
Subtle ink-bleed at stroke crossings

Stage D (optional) — Micro-polish via GPT Image 2 edit. Adds ink-paper interaction effects without touching streamline geometry.

Streamline-fidelity guarantee. Because Stage C is deterministic SVG composition, streamline IoU vs LBM output is 100% by construction.

Two-stage anchor-driven pipeline for Life Sketch:

Stage A — Three.js orthographic anchor render. A separate Three.js scene reads plan-geometry.json and renders a translucent axonometric model: extruded walls at 2.6m HDB ceiling height, translucent warm-white ceiling slabs at 35% opacity, soft top-left directional light, room labels as Three.js sprites, Household Shelter and bathroom outlines emphasized. Pre-rendered at build time, cached per template (~3 seconds rendering). Output PNG at 1536×1024.

Stage B — GPT Image 2 materialization via image-edit. The Three.js anchor PNG is the primary structural reference. GPT Image 2 materializes the wireframe as a photoreal Singapore Japandi HDB interior while preserving all geometric relationships from the anchor. Three reference images: anchor (structural), brand v3 Section 05 Life Sketch (atmospheric), Singapore Japandi interior (material).

Three.js as reference-image generator, NOT source of truth. The compliance truth, the geometry truth, the airflow truth — all live in plan-geometry.json, the WebGPU LBM solver, and the deterministic SVG streamlines respectively.

SVG annotation overlay. All room labels, token symbols, scale bars, watermarks, brand marks applied as SVG layers post-composition.

Stage 7 · Three Voices

Cultural + Designer modes ship in Phase 1. Cultural is the default voice; Designer surfaces clearances, dimensions, ACH estimates, and HDB caution callouts for ID firms.

Phase 2 adds Elder mode (classical Mandarin + Noto Serif SC) and Science mode (rationalist register).

Elder letter vocabulary anchoring (binding for Phase 2 content):

Term	Translation	Evidence anchor
玄关	Entryway	Genkan-as-bio-barrier; 1.0–1.5 m washable mat removes ≥90% tracked bacteria
明堂	Bright hall	DA ≥ 50% in central palace; circulation width ≥ 75 cm
藏风聚气	Hide wind, gather qi	Moderated cross-ventilation; ACH + age-of-air + velocity uniformity
家相 (kasō)	Dwelling physiognomy	Cultural framing only. No physical claim attached.
九運 (Period 9)	Twenty-year period	Cultural framing only. No physical claim attached.
五行	Five elements	Mnemonic for material/thermal strategy; not a physical theory

Plus the Threshold Note — one line for the front door on move-in day (Phase 4).

7 · The pipeshaft mechanic + Damp Risk reading (NEW in v4.0)

This is the v4.0 headline product addition. Every HDB flat has a pipeshaft. None of the prior versions of this brief mentioned it. The research literature converges on it as the most quintessentially Singaporean physical fact a feng shui app can address.

7.1 What the pipeshaft does

Three measurable effects, all confirmed by Wong Nyuk Hien's NUS field measurements (2010, 2014):

Persistent upward jet of 0.15–0.25 m/s at openings, disrupting the unit's intended cross-ventilation path.
Vertical pollutant pathway — cooking PM2.5, NO₂, and bathroom moisture from your floor get drawn into the shaft and redistributed to upper floors.
Localized cold downdraft from chilled water pipes (~18°C surface vs ~29°C room air), creating uncomfortable drafts in adjacent rooms.

Traditional feng shui has called this 毒气上冲 ("poison qi rising through the shaft") for centuries. NUS measurements confirm it. CFD shows the jet velocity is reduced 40–60% by placing a tall cabinet or plant in front of the shaft door — exactly what the Shaft Buffer token does.

7.2 The product mechanic

Each Phase 1 template's plan-geometry.json marks the pipeshaft's location, opening direction, and adjacent rooms. The LBM solver renders the shaft jet as a secondary particle field in gray sunlit_dust (distinct from the warm-amber primary particles) so the viewer sees bad air separately from good air.

When a Shaft Buffer token is placed within 0.6m of the shaft opening, the solver applies a porous-deflection boundary that redirects 40–60% of the jet velocity sideways. The gray particles visibly redirect; Damp Risk in the adjacent bedroom drops; the Asking Point clears.

7.3 The Damp Risk reading

A new MingTang Index dimension (final, ships in Phase 1).

Damp Risk is computed internally from base ambient (75% Singapore monthly average), local airflow velocity at bed-head height, and proximity to pipeshaft jet. The model produces a layout-pressure adjustment Δ on top of base ambient: pipeshaft proximity, upwind bathroom, and low bed-head airflow each push Δ upward; effective bed-head ventilation pushes Δ downward. Internal predicted pillow RH = base ambient + Δ. The internal model uses numeric values for the rule engine, but the homeowner-facing surface is always banded — Clear / Watch / High — never numeric.

Band	Trigger	User-facing diagnostic
Clear	No layout risk conditions present (Δ ≤ 0)	(no diagnostic; dimension stays calm on the radar)
Watch	One risk condition (pipeshaft proximity OR upwind bathroom OR low local airflow at bed-head); equivalently 0 < Δ < 5%	"This bedroom has one condition worth watching. Keep the airflow path clear; observe after showers and rain."
High	Two or more risk conditions, OR internal predicted pillow RH ≥80% sustained for 8+ hours/night (equivalently Δ ≥ 5% above base ambient). The 80% threshold is set above base ambient (75%) so it cannot self-trigger; it requires actual layout pressure.	"Damp Risk: high. Master bedroom is adjacent to the kitchen pipeshaft and downwind of the master bathroom during NE monsoon. Try a Shaft Buffer, or move the bed away from the shaft wall."

The Watch and High diagnostics always pair the band with at least one recommended action. The band never appears alone.

Disclaimer copy (binding for all UI surfaces displaying a Damp Risk band):

"Damp Risk is a layout-based comfort estimate. It is not a humidity measurement, not a mold diagnosis, and not a certified indoor-air-quality assessment."

This is the product's cleanest demonstration that the home reads as a system — pipeshaft + bathroom position + bed location + monsoon vector + floor level all collapse into one banded reading with one action. It is also the cleanest demonstration that the product takes its responsibility seriously: a banded estimate is what a layout-based heuristic can honestly support; a numeric RH value is not. A parent making a renovation decision reads "Damp Risk: high — try a Shaft Buffer" and forwards the demo to their family. They do not read a number that implies measurement.

7.4 The bathroom-downwind rule

The Jiangmen CFD study (South China University of Technology) found explicitly that placing bathrooms downwind of bedrooms prevents polluted air from flowing through sleeping zones. Phase 1 ships this as a rule-engine check:

The compass + floor-level inputs determine the unit's prevailing wind vector (NE monsoon Dec–Mar, SW monsoon Jun–Sep, default annual median otherwise).
For each bedroom, the engine checks whether a bathroom or kitchen pipeshaft sits upwind. If yes, the bedroom gets an Amber confidence flag on the MingTang Compliance dimension and a one-line recommendation: "This bedroom is downwind of the master bathroom during NE monsoon. Keep the bathroom door closed at night, or run the bathroom exhaust on timer."

This is a behavior recommendation, not a renovation recommendation. It costs the user nothing to act on. It is also the cleanest single demonstration that the product reads the unit as a system, not a collection of rooms.

7.5 The 12% opening-area badge

Hawaii natural-ventilation guidelines and the broader cross-ventilation literature converge on a concrete rule: combined operable opening area ≥ 12% of floor area is the threshold for effective natural ventilation without mechanical assist. Phase 1 ships this as a binary badge on each template:

Cross-ventilation capable. Combined opening area ≥ 12% of floor area. Tampines GreenWeave 4-room and Tengah 5-room earn this badge. The Wind Gate token's behavior recommendations apply.
Cross-ventilation marginal. Opening area between 8% and 12%. The Resale Executive Apartment 1990s archetype likely sits here. The Fan Anchor token is recommended; the rule engine surfaces this.

This badge anchors the Wind Gate and Fan Anchor tokens to a concrete physical claim rather than a vibe.

8 · The MingTang Index

Each room gets eight scores rendered as a small radar chart, plus one diagnostic sentence. Kanso is the headline.

Dimension	Phase	Underlying field	Reading
Kanso (headline)	1	Clutter pressure (placement count + visual mass)	"73% healthy empty space preserved"
Breath	1	LBM velocity + age-of-air	ACH estimate + dominant corridor diagnostic
Glow	1	Solar trajectory + façade heat path	West-sun heat load (W/m²) at 16:00–18:30
Quiet	1	RT60 + traffic noise overlay	Living-room RT60 (target 0.4–0.6s); bedroom dB(A) night
Damp (NEW v4.0)	1	Layout-based RH-at-pillow estimator (internal numeric; banded surface)	Per-bedroom Damp Risk band: Clear / Watch / High, paired with action recommendation
Compliance	1	HDB four-state + bathroom-downwind check	Per-room status
Shelter	2	Prospect-refuge geometry	Command-position diagnostic (with bed token)
Hold	2	Furniture grounding	Rug coverage + zoning strength
Life	2	Biophilia + natural materials	Plant count + tactile material ratio

The Stagnation reading (velocity < 0.1 m/s) is not a separate dimension — it lives inside Breath as a sub-diagnostic, surfaced as the audit_lic material's stagnation wash in Designer mode.

The Kanso Reserve includes the explicit guardrail copy: "Useful objects don't count as clutter. A piano is enoughness."

9 · Evidence tiers

Every output discloses its evidence tier. The seven badges from v2.2 / v3.x collapse to five structural tiers — the trust ladder — plus one separate non-evidence label for cultural-framing content that operates under Hard Rule #17.

Tier	Means	Cultural-mode copy	Designer-mode copy
Official constraint	HDB / SCDF-controlled element; alteration requires approval	"Protected element. Do not alter without approval."	"HDB / SCDF Black-state; alteration requires approval"
Template fact	Curated archetype geometry, openings, room labels	"From this layout. Verify against your official plan."	"Template-validated; verify against your official plan"
Heuristic estimate	Layout-based design rule — Damp Risk, west-sun heat path, opening-area badge, command-position, bathroom-downwind	"Design estimate from layout."	"Heuristic from layout conditions; not measured"
Weather context	NEA outdoor station data — Resonance Hours, Monsoon Turn	"From outside, right now."	"Outdoor station signal; indoor effect may differ"
Prototype visualisation	Live LBM, the three Sketches, Material System renders	"Drawn from the home's flow."	"Visual explanation, not engineering simulation"

Cultural framing is a separate non-evidence label, applied to Traditional, Ritual, or cosmological vocabulary that does not carry a physical claim. It is governed by Hard Rule #17: cosmological labels are presented as cultural framing only — never as physical predictions. Cultural framing is not an evidence tier and never appears on a reading that makes a physical claim.

The audit gap remains binding. The compass research's note that apartment-scale Qi-flow validation is "essentially absent from peer-reviewed literature beyond So & Lu's 2001" means Prototype visualisation outputs ship with the disclosure: "Cloud-grade design simulation. Not engineering certification. We publish our solver assumptions and grid resolution on every Prototype visualisation render."

The five-tier ladder replaces the seven-badge taxonomy across all UI surfaces, the methodology page, and the Designer-mode export schemas.

10 · HDB compliance — the four states
State	Meaning
Green	Decorative or furniture only
Amber	Check dimensions, clearance, contractor needed
Red	HDB caution zone, no hacking or fixed works without review
Black	Do-not-suggest zone: HS structural elements, unsafe obstruction, pipeshaft openings

The Black state is hard-blocked. Template plans are for design exploration only. Contractor-facing exports require official HDB plans, post-key site measurement, or professional verification.

The system guarantees displayed options pass the rule engine and compliance filters at the moment of display. It does not guarantee renovation feasibility, professional feng shui approval, or engineering performance.

Singapore inversion copy (NEW v4.0, surfaces in onboarding and the methodology page):

"In HDB, unit-selection-stage feng shui screening matters more than post-purchase remediation. Plumbing risers, Household Shelter walls, and structural RC are fixed for the life of the block."

This inverts the Hong Kong / Mainland "renovate-to-fix" tradition. The product's value proposition compounds: pre-purchase Wind Sketch, post-key Resonance Hours.

11 · Privacy posture

Hackathon demo: ephemeral sessions, no real user accounts, no persistent personal data, browser-close wipe.

Production posture (binding for post-hackathon):

Personal home data stored in Singapore where contractually guaranteed
Any AI/CFD/third-party processing leaving Singapore is disclosed, minimized, logged, opt-out for strict-residency users
Raw floor plans never sent to third-party generative services without explicit consent
Object storage via Cloudflare R2 with jurisdictional restrictions for plan data
MyInfo via Singpass: separate consent purpose. Hackathon uses sandbox MockPass profiles only — production needs Corppass + WebTrust X.509 mTLS

Resonance Hours additions: the NEA wind-data fetch uses the HDB block centroid (not the unit's apartment number); push tokens encrypted in Supabase; user can revoke push at any time from settings; opt-out fully removes the resonance job from the worker queue with a 24-hour grace period before resuming on re-opt-in.

A separate production privacy & data residency document supersedes this section before public launch.

12 · The four user modes

Phase 1 ships Cultural + Designer. Elder and Science remain Phase 2.

Mode	Voice	Audience	Phase
Cultural (default)	Qi, MingTang, Genkan, Ma	Most users	Phase 1
Designer	Clearances, schedules, carpentry, HDB caution	ID firms, contractors	Phase 1 (was Phase 3 in v2.2)
Science	Airflow, daylight, ergonomics, circadian	Rationalist homeowners	Phase 2
Elder	明堂、玄关、五行、藏风聚气、九運、家相	Parents	Phase 2 (gates Three Voices)
13 · Stack (research-validated, May 2026)

Pinning. Critical.

{
  "dependencies": {
    "next": "^16.2.6",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "react-server-dom-webpack": "19.2.6",
    "@react-three/fiber": "^9.6.1",
    "@react-three/drei": "^10.7.7",
    "three": "^0.184.0",
    "@types/three": "^0.184.0",
    "tone": "^14.x",
    "tailwindcss": "^4.x",
    "zustand": "^5.x",
    "framer-motion": "^11.x"
  }
}

React MUST be pinned to 19.2.6 (or any of 19.0.6 / 19.1.7 / 19.2.6 per the Cloudflare advisory of 2026-05-06, which patched CVE-2025-55184, CVE-2026-23864, and CVE-2026-23870 in React Server Components and Next.js on top of the earlier CVE-2025-66478 RCE in the RSC protocol). The earlier 19.2.0 pin is insecure and must not be used. Next.js minimum safe is 16.2.6 (or 15.5.16 on the 15.x line). All `react-server-dom-*` packages must match the React minor (19.2.6).

Frontend. Next.js 16.2.6+ (May 2026 patch). React 19.2.6 minimum. Three.js 0.184.0 with WebGPURenderer imported from three/webgpu. await renderer.init() is mandatory. shadcn/ui for primitives. Zustand for floor-plan state, framer-motion for SVG path transitions and environmental response coupling. When upgrading, re-check the Cloudflare changelog for newer advisories before committing.

Floor plan canvas: pure JSX SVG, no canvas library. HDB flats have ~5–8 rooms, ~20 walls. SVG handles trivially. Konva and tldraw are dropped.

3D layers. Three.js WebGPURenderer with WebGL2 fallback automatic (~83% global WebGPU support, May 2026). Three.js orthographic anchor pre-rendered per template at build time, cached on R2. Splat vignettes (Phase 2): Spark 2.0 with LoD streaming.

Environmental Material System (NEW v4.0). WebGL2 fragment shaders for particle systems and stagnation washes; SVG paths with feGaussianBlur and feTurbulence for silk_ribbon and sumi_ink; framer-motion springs for curtain/leaf response coupled to LBM velocity samples; CSS blend-mode + opacity interpolation for the perforated kitchen-partition shadow blend (8 pre-baked shadow textures per element).

Generation. GPT Image 2 (gpt-image-2, snapshot gpt-image-2-2026-04-21) via OpenAI images.edit endpoint. Up to 16 reference images per call; input_fidelity ignored on gpt-image-2; transparent background unsupported; 32k char prompt max; C2PA watermarks default-on; organization verification required. Pricing: input $8/M, output $30/M, cached input $2/M. ~$0.05–$0.21 per high-quality image. Tier 1 = 5 images/minute — pre-spend $50 to reach Tier 2 (20 IPM) before judging.

Plan parsing semantics (Phase 2 only). Gemini 3 Pro for OCR/labels, Claude Opus 4.7 for HDB-specific element classification. Hero furniture objects (Phase 2): Meshy 6.

Simulation — four-tier LBM solver path.

WebGPU rendering fallback (Three.js automatic) does NOT give compute-shader fallback — separate engineering concerns.

Tier 1 — WebGPU compute shader (default, ~83% of devices May 2026). WGSL D2Q9 LBM, kishimisu-style stable-fluids architecture, 256×256 grid, 60fps, runs locally. await renderer.init() mandatory. Memory budget: ~18 MB.

Tier 2 — WebGL2 fragment-shader LBM (Phase 2 polish). Velocity field rendered to float texture. Reduced grid (128×128), ~30fps target.

Tier 3 — Server-side LBM (post-hackathon, last-resort). LBM on Modal serverless, 1.5–3 second turnaround per token placement via WebSocket.

Tier 4 — Pre-baked simulation lookup (hackathon safety net, MUST ship Phase 1). ~270 cached results across three templates × six tokens × ~10 candidate positions. Browser fetches cached velocity field, renders particles + ribbon + streamlines deterministically. Indistinguishable from live computation to a judge.

Phase 1 ships Tier 1 + Tier 4. OpenFOAM is dropped from the demo path entirely.

Singapore APIs.

NEA wind direction API (per-minute readings at weather-station level, free, dev key 12/10s)
NEA wind speed API (paired with the above)
NEA 2-hour forecast for Resonance "almost time" notifications (Phase 2)
HDB Property Information block-level only
OneMap via JWT
MyInfo via Singpass: sandbox YES (MockPass), production NO for hackathon
Web Push via VAPID (no third-party push service; keeps notifications inside the product's data-residency posture)

Backend. Supabase for auth + Postgres. Cloudflare R2 for assets ($0.015/GB-month, $0 egress).

Agentic dev workflow as a first-class production technique.

The Phase 1 build list is a Claude Code Agent Teams orchestration target. Multi-agent split-and-merge pattern, one supervisor + six specialist subagents:

Subagent	Phase 1 items owned	Critical skills loaded
Material System agent	Item 0, 5, 6, 13, 16, 17	WebGL2 shaders, SVG/CSS filters, framer-motion, deterministic SVG composition
LBM solver agent	Item 4, plus pipeshaft jet field	WGSL D2Q9 LBM, kishimisu reference, Tier 4 cache spec
Sketch pipeline agent	Item 14, 15	OpenAI images.edit, sumi-e prompt library, anchor-driven Life Sketch
Compliance + brand QA agent	Item 2, 3, 21	brand-guidelines skill, plan-geometry.json schema, HDB four-state UI, bathroom-downwind rule, Golden Floors copy, Black-state hard block
Resonance worker agent	Item 23	data.gov.sg API, web-push (VAPID), Supabase queue, three-tier threshold logic
Token + rule engine agent	Item 7, 8, 9, 10, 11, 12, 18, 19, 20, 22	Six-token logic, Ghost Futures, Kanso Reserve guardrail, Anti-Cure recommendations, Damp Risk computation, Scout Pass, House Changelog, Golden Failure

Hooks enforce the Hard Rules at PR level: any commit that lets streamlines pass through GPT Image 2 fails the compliance hook automatically; any commit that adds a renderer not driven by the Material System fails Hard Rule #23. Skills encapsulate domain knowledge (HDB compliance, NEA wind data semantics, sumi-e prompt library, pipeshaft mechanic) so any new subagent inherits them on first activation. MCP Tool Search lazy-loads tools to keep the supervisor's context window under 30%.

This is what makes Phase 1's expanded scope (6 tokens + 3 overlays + Damp + Resonance Hours + Designer mode + Material System) actually shippable in hackathon time. The orchestration is the unlock, not the model.

Composition layers. Streamlines NEVER pass through GPT Image 2. Live studio composition (in-canvas Material System) and Wind Sketch composition (export-only deterministic SVG) remain separate.

14 · Resonance Hours (the serendipity layer, from v3.0)

This is the feature that closes the loop between the simulated wind in the studio canvas and the actual wind outside the user's kitchen window.

14.1 The mechanic

The product knows three things from the studio session: floor-plan geometry, main door's facing direction, and the optimal cross-ventilation corridor as computed by the LBM solver. The fourth piece — actual wind direction and speed at the nearest NEA weather station, updated minute-by-minute via data.gov.sg — is one HTTP call away.

When the actual wind direction aligns with the optimal corridor within the threshold AND the actual wind speed exceeds the floor (Yuan & Ng 2012 NUS tropical pedestrian comfort: 1.6 m/s) AND the predicted indoor air speed stays within tropical comfort (≤0.2 m/s, Document 1's binding range), the product sends one push notification:

"Your home is breathing right now. The kitchen window is the one to open."

That's it. No upsell. No follow-up. A second notification cannot fire within the cooldown window.

14.2 Three frequency tiers (final spec)
Tier	Outdoor wind ≥	Alignment threshold	Predicted indoor speed ≤	Cooldown	Expected weekly density (NE monsoon)
Calm	1.6 m/s	±10°	0.20 m/s	12h	~1×/week
Standard (default)	1.6 m/s	±15°	0.25 m/s	6h	~3×/week
Active	1.2 m/s	±20°	(no cap)	4h	~5×/week

The "predicted indoor speed" cap (Calm and Standard) is a v4.0 addition — preventing Resonance Hours from firing during gusty conditions where opening the window would create an uncomfortable draft. The 0.1–0.2 m/s indoor comfort range is what determines whether opening the window is actually pleasant, not just whether wind happens to be aligned.

Floor-level modulates expected density. Floors 1–3 receive notifications rarely (the product says so honestly during onboarding); floors 9–15 receive the modal frequency; floors 16+ receive more, but in Calm tier by default to prevent buzz.

14.3 Why this works as serendipity, not as a feature

Three reasons.

First, the user did not ask for it. It emerges from infrastructure the user has already paid for — the studio session computed the optimal corridor; the NEA data is free; the push notification is one line of code. The product surprises rather than demands.

Second, it is fengshui in the original sense. The two characters — 風 (feng, wind) and 水 (shui, water) — are about real weather, not metaphysics. Resonance Hours is the rare feature that lets a user feel the founding metaphor of the tradition without any metaphysical scaffolding.

Third, Singapore is the right place for it. In a temperate-zone megacity with HVAC dominance, this feature would be precious. In Singapore, where dual-aspect HDB units regularly hit 5+ ACH at zero energy cost when the windows are open at the right time, this is the bridge between simulation and the actual practice of living in the unit.

14.4 Resonance Readiness preflight

Before enabling Resonance Hours, the studio quietly verifies:

Door direction set
Floor level set
Cross-ventilation corridor found
Nearest NEA station selected
Wind-speed and wind-direction feeds reachable
Sleep-hour suppression enabled
Notification cooldown active

The default UI says only:

Ready to listen for wind.

Details are available on demand. This protects the poetry from feeling hand-wavy.

14.5 What ships in Phase 1
NEA wind direction and wind speed connector via data.gov.sg
Resonance detector (per-user job)
Web Push notification with one tap that deep-links to the live studio canvas showing the current alignment as the resonance material preset (a luminous corridor highlighting the actual-wind path)
Three-tier frequency control (Calm / Standard / Active)
Sleep-hour suppression (default 22:00–07:00 SGT, user-configurable)
Per-block cache key with 60-second TTL to honor NEA rate limits
24-hour grace period on opt-in resumption
14.6 What ships in Phase 2
Monsoon Turn card. Twice a year, when the dominant monsoon flips, a single animated card surfaces: "Your home now breathes from the other direction. Here's what changes." Two LBM snapshots side by side, one per monsoon.
Wind Diary. Sunday-morning summary of the past week's airflow patterns. Generated by a Claude Sonnet 4.6 agent with the user's session data as context. ~80–120 words. Voice matches chosen mode.
14.7 What ships in Phase 3+
Block Resonance (governance-gated). Anonymized aggregated Resonance Hours by HDB block. K-anonymity testing required.
Anniversary Breath. One year after first session, an animated playback comparing Day 1 vs Day 365's airflow patterns.
15 · Phasing
Phase 0 — Validation, week 1

Nine gating experiments. Go/no-go for Phase 1.

Empty Room test. ≥12 of 20 GPT Image 2 Empty Room renders subjectively beautiful. Constraint: ≥2 morning east-light scenes, ≥1 evening west-amber scene, 0 high-noon south-dominant scenes (rejected regardless of aesthetic quality).
Anchor-driven Life Sketch validation. GPT Image 2 image-edit using Three.js anchor preserves room counts, wall topology, HDB layout signatures across all three Phase 1 templates.
WebGPU benchmark suite. Live LBM ≥30fps on Redmi Note 13 baseline. Tier 4 lookup verified <200ms.
Live Studio comprehension test. 8 of 10 first-time viewers identify "wind moving through the room" within 5 seconds. Particles + ribbon + curtain response together do this work; remove any one and comprehension drops measurably.
Magic-in-90-seconds gate. 8 of 10 testers understand "place token → see air move" within 30 seconds.
Behavioral overconfidence gate. 8 of 10 testers respond with discussion-oriented language ("I'd discuss it with my ID") rather than commitment language when asked "would you change your renovation based on this?"
Template architectural verification gate. Each Phase 1 template must contain a credible architectural element for the perforated kitchen-partition shadow AND a marked pipeshaft for the Shaft Buffer mechanic. Templates without these degrade honestly: shadow drops to particles + ribbon + curtain; Shaft Buffer hides from the token tray.
Resonance plausibility gate. Run the resonance detector on simulated NEA data for the three Phase 1 templates across one full month of historical wind records. Verify that each template fires between 1×/week and 4×/week under Standard tier. Tune thresholds if frequency falls outside this band.
Material System slider gate (NEW v4.0). 8 of 10 testers can drag the Wind Visibility slider from Barely Seen to Clearly Seen and articulate what changed without prompting. "It got more detailed," counts. "It looks like a wind chart now," counts. "I don't know," fails the gate.
Phase 0.5 — Kill signals (post-deployment calibration tests)

The nine Phase 0 gates above are go / no-go before Phase 1 ships. The three signals below fire after launch — they are calibration tests for shipped behavior, not pre-launch gates. If any signal trips, the patch is mandatory and ships before the next demo.

Damp Risk health-diagnosis drift. If testers or users describe Damp Risk as a "health diagnosis," "mold test," "humidity reading," or any framing that implies measurement, strip any remaining numerics from the UI surface, tighten the disclaimer copy, and reinforce the band-only display. Rule of thumb: if more than one in five users describes Damp Risk in measurement language, the surface needs to soften.
Cultural-mode fortune-telling drift. If testers or users interpret the Cultural-mode voice as fortune-telling, future-prediction, or prosperity-forecasting, soften cosmological vocabulary across all voice-mode copy, surface the Nanyang positioning more prominently in onboarding, and tighten Hard Rule #17 enforcement on the Three Voices output. Rule of thumb: if any user, unprompted, asks "is my home lucky?" the language has drifted.
Visual layer overpowering trust layer. If testers remember the live studio renders but cannot describe Black-state protection or the bathroom-downwind rule when prompted post-demo, the visual layer is overpowering the trust layer. Cap the Wind Visibility slider's top end below the current "Clearly Seen" maximum, reduce sunlit_dust particle density default, and emphasize the Reading the Bones screen's confidence-state legend in the demo flow. Rule of thumb: a judge should remember the Black state at least as vividly as the silk ribbon.

Each kill signal has a defined patch. None of them require an architectural change. They are calibration knobs, not redesigns.

Phase 1 — Hackathon build

Twenty-six things to build (final). Item 0 plus items 1–25.

Environmental Material System scaffolding (NEW v4.0). Field solver outputs go through a unified material adapter. Three Phase 1 materials (silk_ribbon, sunlit_dust, sumi_ink) plus the Designer-only audit_lic. Wind Visibility slider wired to material parameters. This is item 0 because every other rendering item depends on it.
Pre-bake Empty Room hero rotation at build time (5 prompts, R2-cached, with tropical-light constraint).
Pure JSX SVG floor plan editor with three hand-curated HDB templates and pre-applied four-state confidence UI. Each template's plan-geometry.json marks pipeshaft, bathroom positions, west-sun façade exposure, and combined opening area.
Three.js orthographic anchor renders per template, pre-rendered, R2-cached.
WebGPU 2D LBM solver with Tier 1 live + Tier 4 pre-baked safety net. Includes pipeshaft jet field rendered as gray sunlit_dust.
Live Studio Visualization (5 elements driven by Material System: silk_ribbon, sunlit_dust, curtain, leaf, kitchen-partition shadow).
SVG streamline rendering for Wind Sketch composer (export-only, sumi_ink material).
Six-token placement demo (Wind Gate, Soft Screen, Wood Anchor, Solar Shield, Fan Anchor, Shaft Buffer).
Scout Pass + Three Asking Points — Breath / Glow / Quiet diagnostics surfaced as calm home asks.
Ghost Futures showing Breath delta + Damp delta before drop.
House Changelog + Golden Failure — before/after consequence receipt and beautiful refusal for HDB Black state.
Kanso Reserve metric with the "useful objects don't count" guardrail copy.
Anti-Cure recommendations. "Leave this corner unbuilt-in for 90 days."
Glow material preset — solar trajectory through window polygons; west-sun heat path 16:00–18:30 highlighted as a tinted material wash.
Plan Sketch generation via GPT Image 2 text-to-image. R2-cached.
Life Sketch generation via GPT Image 2 image-edit anchored to Three.js orthographic. R2-cached.
Wind Sketch composition layer — sumi_ink material composited deterministically over the Plan Sketch base.
Quiet material preset — RT60 estimation + traffic-noise overlay rendered as damped-ripple material.
Damp dimension on MingTang Index (NEW v4.0) — RH-at-pillow estimator computed internally from layout (base ambient + bed-head airflow + pipeshaft proximity); banded Damp Risk surface (Clear / Watch / High); per-bedroom diagnostic always paired with one recommended action; binding disclaimer copy on every Damp surface.
Bathroom-downwind rule (NEW v4.0) — per-bedroom Amber-flag check based on prevailing monsoon vector + bathroom/pipeshaft positions; surfaces behavior recommendation.
12% opening-area badge (NEW v4.0) — binary flag per template; modulates Wind Gate vs Fan Anchor surfacing.
Floor level + Golden Floors onboarding (NEW v4.0) — floor slider on threshold stage; onboarding microcopy honest about low-floor Resonance density.
Weather Trial demo flourish. Three short stress conditions: West Sun 17:20, Highway Night, NE Monsoon Wind.
Resonance Hours system. NEA connector + alignment detector + push notifications + Resonance Readiness + three frequency tiers + cooldown logic + sleep-hour suppression.
Three Voices: Cultural + Designer modes. Cultural by default; Designer for ID firms.
"How we built this" methodology page. Single page disclosing: heuristic briefing system framing, hidden Shikaku diagnostic spine, Nanyang positioning, kansō / kasō etymology disclosure, the five-tier evidence ladder (Official constraint / Template fact / Heuristic estimate / Weather context / Prototype visualisation) and the separate Cultural framing label, what-we-measure honesty, audit gap acknowledgment, Hard Rules.

Plus operational prerequisites: Tier 2 OpenAI API access (pre-spend $50 to clear Tier 1's 5 IPM); NEA dev API key registered; VAPID keypair generated for Web Push.

Phase 1 ships when these twenty-six exist. Cultural + Designer modes only. Plan upload is NOT in Phase 1.

Phase 2 — Private Alpha

Plan upload + 8-stage hybrid parsing pipeline. Remaining five tokens (Fire Glow, Stillness Seat, Earth Hold, Water Quiet, Metal Clarity) plus Solid-Back placement constraint on the bed token (60cm clearance both sides, head against interior wall) and Mingtang Screen variant on Soft Screen. Three Voices Elder + Science modes. Walkable MingTang with Spark 2.0 splat hero vignettes. Meshy 6 hero furniture. Additional environmental response elements. WebGL2 fragment-shader LBM (Tier 2). Phase 2 materials: humid_air, monsoon_glow, clutter_pressure. Monsoon Turn + Wind Diary features. Shelter, Hold, Life MingTang dimensions live. Photographic Prepass (Stage 5.6) — opt-in YOLO26 on-device detection that updates Kanso Reserve and suppresses redundant tokens; ships only after the detection model, privacy guardrails, and UI flows are production-ready.

Phase 3 — Public Beta

Wind Audit cloud tier with LIC textures + velocity ticks + evidence tiers in the audit view. ID Pro launch with Designer mode export. HDB compliance checklist export. Server-side LBM (Tier 3) for last-resort runtime.

Phase 4

Anti-Cure recommendations elevated (already promoted to Phase 1 in v3.0). Threshold Note generator. Temporal Compass. Calligraphy Whisper. Anniversary Breath (year-one Resonance retrospective).

Phase 5

Civic moat features behind governance gates: Wind Memory (personal Breath archive tagged with NEA wind data, opt-in aggregation), Inheritance Mode (MingTang record transfers with HDB resale), Block Resonance (k-anonymized aggregated Resonance Hours by block), and Layer 4 — Apartment-scale CFD validation paper with NUS / SUTD partnership. The compass research is explicit that apartment-scale CFD validation under Singapore tropical boundary conditions is publishable territory; this is how the product can promote selected simulation outputs from Prototype visualisation toward independently validated research context. Methodology stack: PHOENICS RNG k-ε, Radiance for daylight, Pyroomacoustics for RT60, pythermalcomfort for UTCI.

16 · Prompt library

The prompt library remains:

16.1 Plan Sketch (text-to-image): sumi-e top-down, Sesshū Tōyō reference, hard exclusion list against Kyoto/temple/anime drift.
16.2 Life Sketch (image-edit, anchor-driven): Three.js anchor PNG as primary structural reference, brand v3 atmospheric reference, Japandi material reference.
16.3 Wind Sketch optional micro-polish (image-edit, post-composition): ink-paper interaction effects without altering geometry.
16.4 Empty Room hero rotation (5 ambient renders, build-time): five HDB rooms across times of day with Singapore-specific cues, tropical-light constraint enforced.
16.5 Floor plan parser prompts (Phase 2 only): Use Case A (template generation) and Use Case B (user-uploaded parsing) with confidence bucketing and HDB-specific HS detection rules.
16.6 Failure modes and recovery
Failure	Symptom	Recovery
Streamline drift	Output streamlines shaped right, positions wrong	Use deterministic SVG composition (Stage C). Never trust the model with streamlines.
Life Sketch geometry drift	Materialized render has wrong room count or moved walls	Use Three.js anchor as primary reference. Reject drifted runs and re-run up to 3 times.
Live studio doesn't read as wind	First-time viewers don't immediately understand particles are airflow	Verify all four live-studio elements running together: particles + ribbon + curtain response + shadow blend. Removing any one degrades comprehension by ~20%.
Particle performance below target	<60fps on Tier 1 devices	Reduce particle count from 300 to 200; lower particle precision; degrade to Tier 4 pre-baked particle paths if persistent.
Generic anime output	Sumi-e prompt produces flat-color cel-shaded image	Add explicit "NOT anime, NOT manga"; reference Sesshū Tōyō by name; specify "monochrome ink only".
Kyoto-temple drift	Singapore Japandi prompt yields torii / temple / tatami	Maintain hard exclusion list; add HDB-specific cues (ceiling fan, void deck, microcement, equatorial light, HS door).
Edit redraws everything	Subtle changes in geometry beyond what was asked	Re-run with stricter Preserve list; reduce prompt to single-change.
AI-render plastic look	Interior reads as glossy / poreless / hyperreal	Add photography language ("Fuji X-T5, 23mm f/2, ISO 400, fine sensor grain"); specify "NOT HDR-clarity, NOT Instagram-warm-tint, NOT plastic-AI-render sheen".
Cost surprise on edits	Edit calls 5–10× expected	Downscale references aggressively; cache repeated reference images (50% discount); never use n>1.
Rate limit at demo	429 from Tier 1 (5 IPM) during multi-judge demo	Pre-spend $50 to reach Tier 2 (20 IPM); pre-bake demo flow.
WebGPU disabled on judge laptop	LBM fails to initialize	Tier 4 lookup runs silently; user never sees the difference.
Resonance fires too often	Users report "feeling buzzed" rather than "feeling visited"	Tighten alignment threshold from ±15° to ±10°; require speed ≥ 2.0 m/s; extend cooldown from 6h to 12h. Phase 0 Gate 8 prevents this.
Resonance fires too rarely	Users get one notification a month or less	Loosen alignment to ±20°; lower speed threshold to 1.4 m/s; check NEA connector for silent failures.
NEA API rate limit	429 from data.gov.sg	Cache wind readings at the per-block level (one read serves many users in the same block). 60-second TTL.
User opts out, then in again	Resonance worker resumes immediately	Honor 24-hour grace period before resuming.
Scout Pass feels like a scanner	Users describe the home as "broken" or "risky"	Remove severity language. Surface only three Asking Points. Move ranked details to Designer Mode.
House Changelog feels too technical	Users skip it or describe it as patch notes	Use before/after/kept/no-Black-zone language. Five lines max.
Golden Failure frustrates users	Users feel blocked rather than guided	Always offer three alternatives: nearby Soft Screen, non-invasive gesture, or Anti-Cure.
Material System slider feels gimmicky	Users describe slider as "useless"	Restrict homeowner-mode slider to Barely Seen → Clearly Seen only; expose full parameter set only in Designer mode.
Pipeshaft mechanic feels alarming (NEW v4.0)	Users describe gray particles as "scary" or "broken air"	Reframe in Cultural mode as "the air your neighbor cooks in." Reframe in Designer mode as "vertical pollutant transport per Wong NUS 2010." Both honest, both calmer than gray-particles-without-explanation.
Damp Risk reads as a health diagnosis (NEW v4.1)	Users describe Damp Risk as medical, diagnostic, or fearmongering	Strip any remaining numerics from UI surfaces. Show Clear / Watch / High with the recommended action. Keep numeric estimates internal.
Cultural voice reads as fortune-telling (NEW v4.1)	Users repeat cosmological language as prediction rather than framing	Soften cosmological copy and attach every recommendation to the appropriate evidence tier or Cultural framing label.
Live studio overpowers trust layer (NEW v4.1)	Users remember the renders but not Black-state protection	Reduce visual density until fixed elements, blocked actions, and non-invasive alternatives are retained.
17 · Civic moat (research roadmap, post-launch)

Four layers as a research roadmap. Not Phase 1 deliverables.

Wind Memory archive. Personal Breath simulation snapshots tagged with NEA wind data. Governance gate: private by default, opt-in for any aggregation, delete controls.

Inheritance Mode. MingTang record transfers with the unit at HDB resale. Governance gate: explicit seller and buyer consent, both events logged, PDPA counsel review.

Block Resonance public view. Anonymized aggregated patterns by HDB block. Governance gates: k-anonymity testing beyond casual k=50, re-identification risk assessment, PDPA counsel, public-sector partnership conversations, raw floor plans never exposed.

Layer 4 — Apartment-scale CFD validation paper (NEW v4.0). Partnership with NUS or SUTD. First peer-reviewed empirical test of HDB unit airflow against field measurement, with composite stagnation metrics combining CFD age-of-air, daylight autonomy, and acoustic reverberation time. Publishable in J. Build Eng. or Building & Environment. Methodology stack: PHOENICS RNG k-ε, Radiance for daylight, Pyroomacoustics for RT60, pythermalcomfort for UTCI. Strategic value: gives future audit views a path from Prototype visualisation toward independently validated research context without implying certification.

18 · Hard rules

Non-negotiable. If a feature, prompt, or design decision violates one of these, it doesn't ship.

Streamlines NEVER pass through GPT Image 2. Deterministic composition is the only path. The model is for styled backgrounds and optional micro-polish only.
Three.js is a reference-image generator, never a source of truth. plan-geometry.json is the compliance authority.
Black state is hard-blocked. HDB/SCDF-controlled safety elements never accept token placement. Pipeshaft openings are Black with the buffer-eligible attribute as the only exception.
Kanso Reserve includes the guardrail copy. "Useful objects don't count as clutter."
Brand v3 sheet is visual law. Every render anchors to Section 05's references.
Annotations are SVG overlays, never AI.
Quality gate on shared renders. Renders below threshold watermarked "draft."
No claims of professional certification. Wind Audit is a design simulation report.
Streamlines respect walls. Zero clipping.
Cultural mode is the default Phase 1 voice; Designer mode is opt-in. Elder and Science remain Phase 2.
Template plans are exploration only. Contractor exports require official plans.
Tier 2 OpenAI access before any live demo. Pre-spend $50.
await renderer.init() before first WebGPU render.
Tier 1 + Tier 4 LBM ship together. Demo-day stability cannot depend on the judge's GPU.
Live studio visualization is multi-modal motion-led; Wind Sketch export is single-mode sumi-e brushwork. Same physics, different presentation. Never confused. Never combined into a single rendering.
Particles are West Sun Amber #D8A24A for clean air, gray for pipeshaft transport. Brand-aligned through physics. Generic Three.js particle white is a Hard Rule violation.
Cosmological labels (Period 9, Bagua zone, auspicious directions) are presented as cultural framing only — never as physical predictions. Three Voices output that uses cosmological vocabulary must map to an evidence tier and avoid claims of physical effect that are not independently supported by the Breath, Glow, Quiet, Damp, or Shelter overlay.
The product does not generate cures based on EMF avoidance, mirror-bed taboos, or plant-air-purification claims. If a user asks, surface the evidence honestly. For sleep concerns: the mechanism is photons (1.5–8 lux at the eye begins melatonin suppression), not EMF.
Resonance Hours never fire during user-defined sleep hours. Default 22:00–07:00 SGT, user-configurable. Push notifications respect the OS's Do Not Disturb. Frequency caps are non-negotiable: maximum one notification per six-hour rolling window per user (tighter under Calm tier).
Shikaku is a hidden diagnostic spine, never the product face. Avoid critical, exploit, breach, attack, vulnerability, and scanner language in the homeowner UI.
Scout Pass surfaces at most three Asking Points. The product does not create a ranked defect backlog for homeowners.
Golden Failure is mandatory for HDB Black state. Every blocked action must include a calm refusal and a non-invasive alternative.
(NEW v4.0) The Environmental Material System is the rendering substrate. Live Studio, Wind Sketch Export, Audit View, and Resonance Hours all read from the same field architecture. No bespoke renderers. No one-off visualizations. If a feature can't be expressed as a material preset on top of the existing fields, it doesn't ship.
(NEW v4.0) Damp Risk is presented to homeowners as bands. Internal numeric values are never user-facing. The three bands are Clear / Watch / High. Watch and High readings always pair the band with at least one recommended action: place a Shaft Buffer, move the bed, or run the bathroom exhaust on timer. The disclaimer "Damp Risk is a layout-based comfort estimate, not a humidity measurement, not a mold diagnosis, not a certified IAQ assessment" appears on every surface that displays a band.
(NEW v4.0) Floor level is required onboarding input. The compass + floor + scenario triad is the minimum input for the Scout Pass to run honestly. Resonance Hours frequency tiers default appropriately by floor band.
19 · Brand Commitments (binding at captain's discretion)
The morishio kit is the demo's physical artifact. Default to shipping; cut only if a clear blocking reason emerges.
The Empty Room hero rotation runs on the landing page. Five renders, ambient transition, tropical-light gate enforced.
The Wind Sketch is the screenshot. Every brand decision flows from "does this make the Wind Sketch more shareable?"
The perforated shadow on the kitchen partition is non-negotiable in the demo. Phase 0 Gate 7 verifies the demo template has a credible architectural element to attach it to.
(v3.1) The Scout Pass is the proof moment. The house listens, surfaces three Asking Points, and then disappears into the ritual.
(v3.0) The first Resonance Hour is the second-screenshot moment. The demo flow ends with a simulated push notification arriving on the judge's phone. "Your home is breathing right now." The judge feels the product follow them out of the studio.
(NEW v4.0) The pipeshaft → Shaft Buffer → Damp Risk drop is the third-screenshot moment. Gray particles from the kitchen pipeshaft fill the master bedroom. Damp Risk reads High. The user drags a Shaft Buffer in front of the shaft door. Gray particles deflect. Damp Risk drops to Watch. That is the moment a Singaporean parent forwards the demo to their family.
(NEW v4.0) The Wind Visibility slider is the architectural-pitch moment. A judge drags the slider from Barely Seen to Clearly Seen and watches the same airflow modulate from "calm interior" to "engineering diagnostic." Same data, same field, different material. This is the product's coherence-of-language argument made physical.
20 · The signature moment

The user picks the Resale Executive Apartment 1990s template, sets the compass to face NE, picks floor 11. The studio loads. Sun-lit dust drifts through the unit; a silk ribbon traces the dominant cross-ventilation corridor; the balcony curtain breathes; the kitchen partition's perforated shadow shifts. The Wind Visibility slider sits at the default. "You're on floor 11 — you're in the Golden Floors," the onboarding microcopy reads.

First, the house listens. Three Asking Points appear: entry moving too fast; west edge carrying heat; master bedroom downwind of pipeshaft.

The user drags the Wind Visibility slider to Clearly Seen. The dust thickens. The ribbon's velocity-to-width modulation becomes legible. A faint LIC texture appears on the floor. The user can see the field structure now.

The user places three tokens: a Wind Gate at the kitchen window, a Soft Screen at the entry, a Wood Anchor in the corner. The MingTang Index updates. Kanso Reserve reads 71%. Breath reads strong. Damp Risk in the master bedroom reads High. The diagnostic appears: the master bedroom is adjacent to the kitchen pipeshaft, and the bathroom is upwind during NE monsoon — try a Shaft Buffer, or move the bed away from the shaft wall.

The user drags a Shaft Buffer in front of the pipeshaft door. Gray particles deflect. Damp Risk drops to Watch. The "high" diagnostic clears. A House Changelog appears: entry rush softened, bedroom path opened, one corner left empty, pipeshaft jet deflected, no fixed HDB elements touched.

The user clicks export. Three sketches generate. The Wind Sketch composites in real time as a sumi-e brushwork still — same field, different material preset, the air at rest.

Three weeks later — long after the demo, long after the Wind Sketch has been printed and pinned to the kitchen wall, long after the morishio kit has been opened — the user's phone glows softly at 18:42 on a Tuesday. "Your home is breathing right now. The kitchen window is the one to open." They walk over. They open it. The kitchen partition's perforated shadow shifts on the floor exactly the way the studio canvas predicted. They notice. They smile. They put the phone down.

That is the demo. That is the product. That is the entire pitch. The studio shows you the wind you cannot see; the Material System shows you how you want to see it; the Shaft Buffer shows you how to fix what you found; Resonance Hours lets the wind speak back.

21 · Final sentence

Built-To-Kanso shows you the wind you cannot see, protects the space you do not need to fill, helps your HDB become a home before you buy a single thing — and, occasionally, on a Tuesday at 18:42, lets you know when the city's actual atmosphere is in conversation with the home you've made.

The product I'd want to use the day before move-in, every Tuesday morning when the wind matters, and one more time fifteen years later when the unit goes to a young family who will find that the home already knows things about itself.

Appendix A · Quick reference for agents

Brand colors (anchored to surfaces, not abstract): Ink Black sumi/mullion, Bone White washi/walls, Void Deck Grey terrazzo/microcement, Monsoon Sage upholstery/leaves, Banyan Green deeper accent, Rattan Beige textile, Teak Brown wood, West Sun Amber cast light AND clean-air particles, Terracotta Clay single ceramic, Heat Haze Gold gradient/silk ribbon. Pipeshaft particles are gray (NEW v4.0) — distinct from amber clean-air.

Dark mode: Night Ink #0A0A0A, Soft Bone #F0E1D5, Void Grey #2A2A2A, Amber Glow #F1804E.

Typography: Kanso Editorial Serif (display), Tropical Grotesk (subheadline), Warm Humanist Sans (body), Noto Serif SC (Chinese).

Iconography: 10 product-specific icons in Section 06 of brand v3 sheet — never substitute Lucide defaults.

Hero artifact references: Section 05 of brand v3 sheet — paste into every GPT Image 2 call as anchor reference.

Studio canvas reference: Section 07 of brand v3 sheet — light mode and dark mode are the implementation target.

Footer manifesto: Calm by design / Structured by intent / Fluid in motion / Tropical by context.

Resonance Hours quick-reference:

Standard tier (default): alignment ±15°, outdoor wind ≥1.6 m/s, predicted indoor ≤0.25 m/s, cooldown 6h
Calm tier: alignment ±10°, outdoor ≥1.6 m/s, indoor ≤0.20 m/s, cooldown 12h
Active tier: alignment ±20°, outdoor ≥1.2 m/s, no indoor cap, cooldown 4h
Sleep-hour suppression: default 22:00–07:00 SGT, user-configurable
NEA polling: per-block centroid, 60-second cache TTL, dev-key rate limit 12/10s
Notification copy (Cultural): "Your home is breathing right now. The kitchen window is the one to open."
Notification copy (Designer): "Cross-ventilation alignment, ±12°. Actual wind 2.1 m/s NE. Optimal corridor: kitchen → living → balcony."

Pipeshaft + Damp Risk quick-reference (NEW v4.0):

Pipeshaft jet: 0.15–0.25 m/s upward at opening (Wong NUS 2010); rendered as gray sunlit_dust
Shaft Buffer placement: within 0.6m of shaft door; deflects 40–60% of jet velocity
Damp Risk bands (homeowner-facing): Clear (no layout risk; Δ ≤ 0) / Watch (one condition; 0 < Δ < 5% above 75% base) / High (two+ conditions, or internal predicted pillow RH ≥80% for 8+ hrs/night, i.e. Δ ≥ 5% above base — cannot self-trigger from base ambient alone)
Damp Risk internal computation: base ambient (75% Singapore monthly average) + Δ from layout pressure (pipeshaft proximity, upwind bathroom, low bed-head airflow push Δ up; effective bed-head ventilation pushes Δ down). Internal numerics drive the rule engine; never surface to homeowner.
Damp Risk binding disclaimer: "Layout-based comfort estimate, not a humidity measurement, not a mold diagnosis, not a certified IAQ assessment."
Bathroom-downwind rule: check per-bedroom against prevailing monsoon vector; surface behavior recommendation if upwind
Appendix B · The pipeline at a glance
plan-geometry.json              ←─ SOURCE OF COMPLIANCE TRUTH
       │                             (curated, architect-validated, never AI-touched)
       │
       ├─────────────┬─────────────┬─────────────┬─────────────┐
       ▼             ▼             ▼             ▼             ▼
   PURE JSX      WEBGPU LBM    THREE.JS      NEA WIND      RH-AT-PILLOW
   SVG EDITOR    + PIPESHAFT   ANCHOR        CONNECTOR     ESTIMATOR
                 JET FIELD                                  (NEW v4.0)
       │             │             │             │             │
       │             │             │             │             │
       │             │             │             ▼             │
       │             │             │       RESONANCE           │
       │             │             │       DETECTOR ◄── Phase 1│
       │             │             │             │             │
       │             │             │             ▼             │
       │             │             │        WEB PUSH           │
       │             │             │       (cooldown,          │
       │             │             │        sleep-hour         │
       │             │             │        suppression)       │
       │             │             │                           │
       │             ▼             │                           │
       │   ┌─────────────────────────────────────────────┐    │
       │   │ ENVIRONMENTAL MATERIAL SYSTEM (NEW v4.0)    │    │
       │   │ silk_ribbon · sunlit_dust · sumi_ink ·      │    │
       │   │ plant_lean (scene response: curtain/leaf/   │    │
       │   │             kitchen-partition shadow) ·     │    │
       │   │ audit_lic (Designer)                        │    │
       │   │ Phase 2: humid_air, monsoon_glow, clutter   │    │
       │   └─────────────────────────────────────────────┘    │
       │             │                                        │
       │             ├──────┬──────┬──────┐                  │
       │             ▼      ▼      ▼      ▼                  │
       │        LIVE     WIND    AUDIT  RESONANCE            │
       │        STUDIO   SKETCH  VIEW   CORRIDOR             │
       │                 EXPORT                              │
       │                                                     │
       │                          ▼                          │
       │                   GPT IMAGE 2                       │
       │                   (anchor-driven Life Sketch        │
       │                    + sumi-e backgrounds)            │
       │                                                     │
       └────────┬────────────────────────────────────────────┘
                ▼
       SVG ANNOTATION OVERLAY LAYER
       (room labels, token symbols, scale bars,
       watermarks, brand marks, draft watermark)
                │
                ▼
       THREE SKETCHES TRIPTYCH
       (Plan + Life + Wind, the user-facing folio)
                │
                └─── Three weeks later ──► RESONANCE HOUR
                                            ("Your home is
                                             breathing right
                                             now.")

Critical reading of the diagram: the studio session produces a folio. The folio is not the end. Three weeks later, the wind speaks. Same field architecture from plan-geometry.json through the Material System to every presentation context. No bespoke renderers, no AI-touched compliance truth, no claims that exceed what the solver can deliver.

Appendix C · Captain's-eye summary of changes v3.1 → v4.0

Architectural:

Environmental Material System added as item 0 of Phase 1 — the rendering substrate
Three Phase 1 materials (silk_ribbon, sunlit_dust, sumi_ink) plus Designer-only audit_lic
Wind Visibility slider as the single homeowner-facing control
Hard Rule #23 enforces Material System as the only rendering substrate

Singapore-specific physical layer:

Pipeshaft mechanic + Shaft Buffer token (sixth Phase 1 token)
Damp Risk reading as the fifth Phase 1 MingTang dimension
Bathroom-downwind rule as a per-bedroom Amber-flag check
12% opening-area badge per template
Floor level required as onboarding input + Golden Floors microcopy
Nanyang positioning surfaced in methodology page and Designer voice
Hard Rules #24 and #25 added

Phase 1 build list grew from 21 items to 26 (item 0 + items 1–25). Phase 0 grew from 8 gates to 9 (Material System slider gate added). Six subagents in the Claude Code Agent Teams orchestration.

The product's coherence-of-language argument is now physical: drag the Wind Visibility slider, watch one field render through three materials. Same physics, different presentation, never confused.

The product's claim to being Singapore-specific is now physical: the pipeshaft, the Damp Risk reading, the bathroom-downwind rule, the 12%-opening badge, the Golden Floors band, the Nanyang inversion. Six concrete artifacts none of which appear in Hong Kong or Beijing feng shui apps.

End of brief. Frozen as v4.0 — Tropical Edition — for hackathon execution.