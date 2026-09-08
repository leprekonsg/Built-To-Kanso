# Product

## Register

product

## Users

**Primary: the Cultural-mode HDB homeowner.** A Singapore parent or new-HDB resident, often mid-renovation or just past key collection, who came in for the cultural reading and stays for the physical one. They are not a CFD engineer; they are not a feng shui master. They want to know the unit they've signed for is going to breathe right and not grow mould on the headboard six months from move-in. They forward the demo to their family the moment the Damp Risk reading lands.

**Secondary: the ID-firm designer (Designer mode).** A Singapore interior-design professional reviewing a unit's airflow, daylight, and stagnation properties before recommending fitouts. They expect clearances, ACH estimates, dimensions, and HDB caution callouts, surfaced without the calm voice in the way.

**Tertiary: the cultural reviewer / Elder-mode reader.** Phase 2. Reads classical-Mandarin output (玄关, 明堂, 藏风聚气) rendered in Noto Serif SC. Will judge the product on whether the etymology disclosure is precise and the kasō / kansō boundary is held.

The Cultural-mode homeowner anchors every Phase 1 decision. When voices conflict, the calm voice wins.

## Product Purpose

Built-To-Kanso is a wind-aware feng shui studio for Singapore HDB homes. Its current release contract starts with source-reviewed plan geometry and enables only the capabilities named in the release manifest. Layout-based airflow remains a prototype visualisation. Home-specific weather alignment stays unavailable until orientation, exterior-opening connectivity, operating assumptions, and station-to-site evidence are verified.

Current release success looks like:

1. One source-reviewed layout passes its selected operations while diagnostic templates remain contained.
2. Unsupported placement, airflow, humidity, and weather claims remain unavailable or Not assessed.
3. Generated and pre-baked outputs are released only when selected and bound to the reviewed source geometry.
4. A cultural reviewer can trace the evidence tier and understand the limits of every active output.

Anti-success: a 3D-render SaaS that lets users drop sofas from a catalog, a dashboard of severity meters, or a feng shui app that treats Singapore as Hong Kong with weather.

## Brand Personality

The brand poster's four-word frame is normative: **Calm by design. Structured by intent. Fluid in motion. Tropical by context.**

Three-word distillation for design defaults: **calm, structured, place-rooted.**

Voice (Cultural mode, default):
- Asks rather than instructs. "The house is listening." "This wall is not asking to be changed."
- Reports as receipt, not patch note. The House Changelog is four-to-five lines; "Entry rush softened. Bedroom path opened. One corner left empty."
- Honest about its own range. "You're on a low floor; Resonance Hours will be quiet here, that's not a bug, that's your floor." Calibrates expectations rather than oversells.
- Refuses beautifully. The Black-state refusal copy is a feature, not an error.

Voice (Designer mode):
- Same calm, plus quantities only where method, inputs, and validation support them. ACH, RT60, SHGC, and clearance outputs remain aspirations until their individual prerequisites pass.
- HDB caution callouts visible by default; nothing hidden behind a tooltip.
- Never sarcastic toward the cultural register; both modes ride the same physics.

The brand is Singaporean, tropical, and 1.35° N. It is not Tokyo. It is not Beijing.

## Anti-references

These are the lanes Built-To-Kanso explicitly is not.

1. **Mainland feng shui app aesthetics.** Red and gold lacquer, dragon iconography, luopan chrome with rotating rings, fortune-teller register, Period-9 promise reductions. The Nanyang positioning (brief §2) is a deliberate inversion of these rules; the visual register inverts with it. If the surface could be mistaken for a Hong Kong or Beijing feng shui app, it has failed.

2. **Property-listing and classifieds UX.** PropertyGuru, 99.co, the Qanvast catalog. Dense card grids, filter sidebars, listing-density browsing. Qanvast inspires the calm atmosphere only; never the listing UX. The studio is one home at a time, not a browse experience.

3. **Modsy and the 3D-render SaaS lane.** Glossy photoreal rooms, drop-the-sofa configurators, AI-render rainbow gradients, "preview your decor" framing. The brief names Modsy as a historical cautionary tale (§2). The Three.js renders in this product are reference imagery, not the source of truth, and they never carry the visual weight of a render-app demo.

A standing brief-level anti-reference also applies: not generic Japanese minimalist (brief §4). Singapore-tropical Japandi reads warmer, more woven, more humid than Pinterest Japandi. This lives in DESIGN.md as a visual rule, not a strategic anti-reference.

## Design Principles

Five strategic principles, derived from the brief and load-bearing across every surface.

1. **Remove rather than place.** The headline verb is remove. Kanso Reserve is an aspirational heuristic, not a healthy-space measurement. The Anti-Cure ("leave this corner unbuilt for 90 days") remains a product concept. Every released surface should answer "what did we leave alone?" before "what did we add?"

2. **Physical claims require evidence.** A physical claim ships only with an identified method, applicable inputs, and validation. Unsupported outcomes remain Not assessed. Prototype visualisations, animation speed, heuristic bands, and token placement do not establish a measured or calculated benefit. Earlier token-effect targets remain research aspirations until their methods and evidence are reviewed.

3. **The home stays with the user.** Resonance Hours is an aspiration. Home-specific alignment remains disabled until orientation, exterior-opening connectivity, operating assumptions, and station-to-site evidence are verified. Past that prerequisite gate, notifications should remain quiet and infrequent.

4. **Calm voice over alarm.** Maximum three Asking Points. No severity meters, no ranked defect backlogs, no scanner dashboards. The House Changelog reads as a receipt, not a patch note. Refusal is a designed surface, not an error state. When Designer mode adds analytical precision, it adds it; it does not replace the calm.

5. **Tropical 1.35° N, not transplanted.** The Nanyang positioning guides research and cultural framing. Pipeshaft, bathroom-downwind, west-sun, and monsoon concepts require their own applicable inputs and validation before they become physical recommendations. Singapore context alone is not evidence of an effect.

## Accessibility & Inclusion

**Target: WCAG 2.2 AA**, with reduced-motion and Singapore-multilingual carve-outs.

- **Contrast.** AA on the bone-white (#F5F1E8) ground. The amber accent (#D8A24A) reaches AA when paired with ink-black, never when paired with bone-white at body sizes; the design tokens already encode this constraint, and it must hold across any new surface. Singapore daylight is high-glare; AA is the floor, not the ceiling.

- **Reduced motion.** `prefers-reduced-motion: reduce` is honored globally (already wired in `app/src/app/globals.css`). The breath-dot animation, framer-motion transitions, and stream-flow animations all collapse to a single static frame. Resonance Hours notifications respect the OS-level setting independently.

- **Multilingual.** English is Phase 1 primary. Mandarin support stubs in for Phase 2 Elder mode using Noto Serif SC for classical terms (玄关, 明堂, 藏风聚气). Future copy must keep romanized + Hanzi paired so the Cultural mode can grow into Elder mode without retrofitting.

- **Calibrated honesty.** The floor-tier copy (Ground Stagnation, Transition, Golden Floors, Wind Turbulent) is itself an inclusion design: it tells low-floor residents that quieter Resonance Hours are a property of their floor, not a defect of the product. The same posture applies to any future surface that could read as judgment.

- **Cultural inclusion.** The etymology disclosure (kansō ≠ kasō; Form-School ≠ mainland) is non-negotiable on any surface that names the tradition. Cultural-credibility critique is a real risk, not a hypothetical.
