---
name: Built-To-Kanso
description: Wind-aware feng shui studio for Singapore HDB homes. Calm by design, structured by intent, fluid in motion, tropical by context.
colors:
  west-sun-amber: "#D8A24A"
  monsoon-sage: "#7C856D"
  terracotta-tray: "#B96F4D"
  ink-black: "#111111"
  bone-white: "#F5F1E8"
  bg-card: "#EFE9DC"
  void-deck-grey: "#C9C4BA"
  hdb-concrete: "#A79F93"
  fg-secondary: "#3A352C"
  fg-mute: "#8A8377"
  banyan-green: "#5E6B4C"
  rattan-true: "#C9B68C"
  teak-brown: "#8A664B"
  heat-haze-gold: "#E5C37A"
  accent-hover: "#C68F35"
  accent-press: "#B07F2A"
typography:
  display:
    fontFamily: "Cormorant Garamond, EB Garamond, Georgia, serif"
    fontSize: "clamp(56px, 8vw, 96px)"
    fontWeight: 500
    lineHeight: 0.94
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "48px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  body-italic-serif:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "JetBrains Mono, SF Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.16em"
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "14px"
  xl: "22px"
  pill: "999px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
  s-10: "128px"
components:
  button-primary:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  button-ghost:
    backgroundColor: "{colors.bone-white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-accent:
    backgroundColor: "{colors.west-sun-amber}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "14px 26px"
  chip-scenario:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "24px"
  chip-scenario-on:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.bone-white}"
    rounded: "{rounded.md}"
    padding: "24px"
  card-template:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.lg}"
    padding: "0"
  badge-good:
    backgroundColor: "{colors.monsoon-sage}"
    textColor: "{colors.banyan-green}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  badge-warn:
    backgroundColor: "{colors.heat-haze-gold}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

# Design System: Built-To-Kanso

## 1. Overview

**Creative North Star: "The Monsoon Atelier"**

Built-To-Kanso reads as a quiet drafting room with the louvres open. Air moves through it. Hands have been here recently, but the surface is mostly empty. The instruments on the table (compass, slider, plan) are precise and sit one to a row. Type does the explaining; chrome stays hairline. The single warmth in the room is the late-afternoon light coming in from the west, and the system uses that light as its only accent. Everything else is bone, ink, and hand-mixed earth.

The system rejects three lanes by name. It is **not** a Hong Kong or Beijing feng shui app: there is no red lacquer, no dragon iconography, no luopan chrome, no fortune-teller register. It is **not** PropertyGuru / 99.co / Qanvast catalog UX: no listing density, no filter sidebars, no card grids of identical cards. It is **not** Modsy or any 3D-render SaaS: no glossy photoreal rooms, no AI-render rainbow gradients, no "preview your decor" framing. A standing brief-level rule also applies: not generic Pinterest Japandi. Singapore-tropical Japandi reads warmer, more woven, more humid.

**Key Characteristics:**
- One accent only (West Sun Amber #D8A24A), used on ≤10% of any given screen.
- Editorial type pairing (Cormorant Garamond display, Inter body, JetBrains Mono labels).
- Hairline borders carry depth; shadows are quiet and earned.
- Generous whitespace as a load-bearing element, not a leftover.
- Motion at breath-rate, never UI-rate. The compass needle settles; it does not snap.
- Hand-rendered SVG for plans, streamlines, and the compass. Photoreal renders are reference imagery only.

## 2. Colors

The palette is anchored by the brand poster: ink, bone, monsoon-coloured greens, hand-mixed earths, and one warm amber that stands in for the late-afternoon light. Roles map onto Stitch's Primary / Secondary / Tertiary / Neutral, but the descriptive names from the brand sheet are normative; never fall back to "amber-500" or "blue-800" naming.

### Primary
- **West Sun Amber** (#D8A24A): the single brand accent. Used as cast light, never as paint. Appears on the breath-dot pulse, the compass needle, the active-state ring on cards and buttons, the Continue button when ready, the Resonance Hours notification glow, sunlit_dust particles in the live studio. Sub-shades: `accent-hover` #C68F35, `accent-press` #B07F2A.

### Secondary
- **Monsoon Sage** (#7C856D): the "good" semantic colour and biophilic surface. Used for sage-family upholstery in atmospheric renders, "Cross-vent capable" badges, Breath-pass indicators, the floor-tier Transition band. Carries `--good` semantic.
- **Banyan Green** (#5E6B4C): deep nature anchor. Used on text inside Sage badges, shaded plant matter in atmospheric imagery, the Quiet floor-tier band stroke.

### Tertiary
- **Terracotta Tray** (#B96F4D): warm warning accent and the "bad" semantic. Used for Damp Risk flags, Wind Turbulent floor tier, Pipeshaft Drift indicators, single ceramic vessel imagery. Carries `--warm` and `--bad` semantics.
- **Heat Haze Gold** (#E5C37A): glow / gradient companion to West Sun Amber. Used on the silk_ribbon material's gradient, the warn-state badge background, gradient transitions in section dividers. Never as a solid fill.

### Neutral
- **Ink Black** (#111111): primary text and structural strokes. Sumi-e streamlines, mullion frames, primary button backgrounds, hairline borders at full strength. Tinted, not pure black.
- **Bone White** (#F5F1E8): page ground. Washi paper, off-white plastered walls, the canvas the entire system breathes against. Tinted warm, not pure white.
- **Card Cream** (#EFE9DC): surface elevation step one (`bg-2`). Resting card backgrounds, scenario chips, the disclosure box. The first tonal step away from page ground.
- **Void Deck Grey** (#C9C4BA): surface elevation step two (`bg-3`). Sunken surfaces, terrazzo floor in atmospheric imagery, microcement feature wall, slider track ground.
- **HDB Concrete** (#A79F93): tertiary text and metadata (`fg-3`). Eyebrows, captions, scale ticks, secondary numerics. Material reading: bare HDB common-corridor concrete.
- **Fg Secondary** (#3A352C): secondary body text (`fg-2`). Lede paragraphs, descriptive copy, italic prose.
- **Fg Mute** (#8A8377): placeholders, dim states, "— pick a unit" empty values.

### Material atmosphere (used in renders, not in chrome)
- **Rattan Beige** (#C9B68C): woven cane, light fittings, the Rattan token's warm signature.
- **Teak Brown** (#8A664B): heavy wood, structural anchors, the Wood Anchor token.

### Named Rules
**The One-Light Rule.** West Sun Amber is the only accent the system ships. It appears on ≤10% of any given screen, and it appears as cast light, never as paint. Surfaces are not tinted amber. The amber sits on the surface (a needle, a pulse, a glow, a fill on one button), not in it. If you find yourself reaching for a second accent colour, the surface is wrong, not the palette.

**The No-Pure-Black, No-Pure-White Rule.** `#000000` and `#FFFFFF` are forbidden. Every neutral is tinted toward warmth: Ink Black is `#111111`, Bone White is `#F5F1E8`. The system's calm depends on this; pure black on pure white reads as a printer page, not an atelier.

**The Tropical Inversion Rule.** West Sun Amber names the worst heat exposure for a Singapore unit (the 16:00–18:30 west-facing afternoon load), not the best light. When the colour appears on a façade callout, it is a warning surface; when it appears as cast light in the studio, it is a quality signal. The doubled meaning is intentional: the Nanyang school welcomes the wind that mainland feng shui hides from, and renders the heat as a problem to be designed against.

## 3. Typography

**Display Font:** Cormorant Garamond (with EB Garamond, Georgia fallback)
**Body Font:** Inter (with -apple-system, BlinkMacSystemFont fallback)
**Label / Mono Font:** JetBrains Mono (with SF Mono, ui-monospace fallback)

**Character:** A quiet editorial pairing. Cormorant Garamond's high contrast and italic shapes carry the calm voice; Inter does the structural reading at body size; JetBrains Mono's tabular figures hold the labels and numerics where the data needs to read at a glance. Three faces, three jobs, no overlap.

### Hierarchy
- **Display** (500, clamp(56px, 8vw, 96px), 0.94 line-height, -0.025em tracking): UPPERCASE display, used once per surface for the section's headline verb (STEP OVER THE *threshold*, READING THE BONES). Italic accent within the headline carries amber colour and lower-case form.
- **Headline** (500, 48px, 1.1, -0.02em): used for studio section titles (CHOOSE THE UNIT, TURN THE DOOR). Lower-cased, not uppercased, when sitting under a display.
- **Title** (500, 28px, 1.15, -0.01em): card titles (template names), reading-panel titles, modal titles. Cormorant rendered without italics for clarity at this size.
- **Body** (400, 16px, 1.5): primary reading text. Inter at 16px holds 65–75ch line length on the bone ground.
- **Body Italic Serif** (400, 22px, 1.45): editorial italic lede paragraphs (the "*Pick the unit. Turn the door...*" lede above each major section). The voice of the brand. Cormorant italic at this size carries the calm.
- **Label** (500, 11px, 0.16em tracking, UPPERCASE): mono labels in eyebrows, section numbers, breadcrumb steps, badge text, slider scale ticks, value units. Letter-spaced wide.

### Named Rules
**The Two-Voice Rule.** The system speaks in two voices and never mixes them. Cormorant Garamond is the *human* voice (display, headlines, lede italic, named values like floor numbers). JetBrains Mono is the *instrument* voice (degrees, percentages, ACH, RH, m/s, hex, ISO times). Inter is the *narrator* between them. If a surface needs a third voice, the surface is wrong, not the type system.

**The Lining-Figure Rule.** Cormorant Garamond's display-size digits are tabular and narrow. The floor reading "11" deliberately renders close to "II"; the compass "000°" deliberately renders as three precise rings. This is the typographic signature of the system. Do not swap a tabular face in to "fix" it.

**The 65–75ch Rule.** Body copy stays inside 65–75ch line length. Lede italic copy may go to 540px max-width on display sizes; never beyond.

## 4. Elevation

The system is hairline-first. Borders carry depth at rest; shadows appear only when an interaction earns them. There is no decorative drop shadow on any surface. Tonal layering (Bone White → Card Cream → Void Deck Grey) does most of the work that a SaaS system would do with shadow alone.

### Shadow Vocabulary
- **Hairline** (`box-shadow: 0 0 0 1px rgba(17,17,17,0.12)`): the default "shadow." Used on surfaces that need to read as separate but should not lift. Equivalent to a 1px border, expressed as a shadow so it can be added without changing layout.
- **sh-1** (`box-shadow: 0 1px 2px rgba(17,17,17,0.06), 0 1px 1px rgba(17,17,17,0.04)`): the smallest ambient shadow. Used on the bone-white floor-slider thumb to lift it 1px off the track.
- **sh-2** (`box-shadow: 0 6px 18px -6px rgba(17,17,17,0.18), 0 2px 4px rgba(17,17,17,0.06)`): hover lift on cards. Pairs with `transform: translateY(-2px)`. The card visibly rises when the cursor lands.
- **sh-3** (`box-shadow: 0 24px 48px -16px rgba(17,17,17,0.22), 0 4px 8px rgba(17,17,17,0.06)`): reserved for the largest interactive frames (the studio canvas, full-screen modals when unavoidable). Used at most once per screen.
- **sh-inner** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(17,17,17,0.06)`): subtle inset for slider tracks and inset wells.

### Named Rules
**The Earned-Shadow Rule.** Cards rest flat with a hairline border. Shadow appears on hover, focus, drag, drop. Never on first paint. A card with a shadow at rest is a SaaS card; a card with a shadow on hover is an atelier card.

**The One-sh-3-Per-Screen Rule.** The dramatic 24px shadow lifts at most one element on any given surface. Two of them cancels both. Reserve it for the largest interactive frame (studio canvas), the next-most-important element gets `sh-2`, the rest get hairline.

## 5. Components

Each component leads with its character. Implementations live in `colors_and_type.css` (landing) and `app/src/app/threshold/threshold.module.css` (product).

### Buttons
The system has three button shapes. Each carries a different role; never use them interchangeably.

- **Primary (Continue, Place Token, Generate Sketch).** Ink Black background (`#111111`), Bone White text (`#F5F1E8`), 8px radius (`rounded.md`), 16px×24px padding. Hover slides the entire button 2px to the right (`translateX(2px)`) and the inline arrow `→` slides 4px further. No background change on hover; the motion is the feedback. Disabled: bone-white background, hairline border, hdb-concrete text, `pointer-events: none`. Activates with the `continueReady` modifier when prerequisites are met (e.g., all four Stage 1 inputs filled).
- **Ghost (Back, Skip, Methodology).** Bone White background, Ink Black border (1px), Ink Black text. Hover swaps to ink fill + bone text in 240ms (`var(--ease-kanso)`).
- **Accent (rare; only the absolute primary CTA on a marketing surface).** West Sun Amber background, Ink Black text. Used at most once per surface. The product app does not use this variant; the marketing landing reserves it for the single hero CTA.

### Chips (Scenario, Mode, Filter)
- **Resting:** Card Cream background (`#EFE9DC`), hairline border (`rgba(17,17,17,0.12)`), Cormorant 18px label + Inter 12px hint stacked. 24px padding all sides. 8px radius (`rounded.md`).
- **Selected:** background fills to Ink Black (`#111111`), text inverts to Bone White, hint text drops to `rgba(245,241,232,0.6)`. Border becomes Ink Black. The fill happens in 240ms `ease-kanso`.
- **Hover (resting state only):** border darkens from `line-1` to `line-2`. No background change on hover; selection is the strong state, not hover.

### Cards (Template, Reading Panel)
- **Corner Style:** 14px radius (`rounded.lg`).
- **Background:** Card Cream (`#EFE9DC`).
- **Border:** Hairline at rest (`rgba(17,17,17,0.12)`). Darkens to `line-2` on hover, to Ink Black on selected.
- **Internal padding:** the thumb area gets `s-5` (24px), the body gets `s-4 s-5 s-5` (16/24/24).
- **Selected affordance:** a 12px dot in the top-right corner. Resting: bone-white fill with line-2 border. Selected: West Sun Amber fill with Ink Black border. The dot is the only element on the card that shifts to amber; everything else stays neutral.
- **Hover:** border darkens, `transform: translateY(-2px)`, `sh-2` shadow fades in. The card lifts 2px and acquires its shadow simultaneously.

### Inputs (Floor Slider, Compass)
- **Floor slider:** 10px-tall track with hairline border, segmented by tier-coloured bands at 35% opacity (Ground, Transition, Golden, Turbulent). The thumb is a 22px Bone White circle with a 2px Ink Black border and a 4px-wide West Sun Amber glow at 20% opacity (`box-shadow: 0 0 0 4px rgba(216,162,74,0.20)`). Thumb scales to 1.1 on hover. The Golden tier band uses West Sun Amber at 40% opacity, deliberately brighter than its neighbours; this is the only place tier colour reads as "good".
- **Compass:** 320×320 SVG with a hairline outer ring, an inner dashed ring at 0.18 opacity, and 24 tick marks (cardinal at 1.6px, ordinal at 1.2px, fine at 1px). Cardinal labels (N, E, S, W) sit outside the ring in Cormorant italic. The needle is a single West Sun Amber line with a triangular head; the hub is Ink Black with a single amber dot at its centre. A faint radial sun-glow gradient sits behind the ring at top-right. Drag, click, or arrow-key to set; snaps to the nearest 15° (24 directions) per the brief's compass spec.

### Navigation
- **Style:** breadcrumb-form. Each step is `[mono number] [serif word]` separated by a 4px hairline dot. Active step: amber number, ink word. Inactive step: hdb-concrete number and word. No underlines.
- **Mobile:** collapses to active-step-only with a horizontal scroll for the rest. The disclosure card from the hero collapses below the headline rather than to the right.

### Signature: The Compass Readout
A custom paired display unique to Built-To-Kanso. The left side carries a Cormorant 96px serif number reading the angle in degrees (`000°`, `075°`, `180°`), padded to three digits with leading zeros, kerned tight. Below it sits the 8-rose facing word in Cormorant italic 28px West Sun Amber ("North", "Northeast", "Southeast"). Above the number sits the JetBrains Mono 11px label "DOOR FACING" in HDB Concrete. The pair reads as a single instrument readout, not a label-value form field. The compass dial sits to the right; the readout is its display.

### Signature: The Reading Panel
A right-aligned sticky panel that fills as the user fills inputs, with a 2px West Sun Amber meter at the top that grows from 0% to 100% as inputs land. Each row uses dashed-bottom hairline dividers (`1px dashed line-1`), label in mono caps, value in Cormorant 22px serif. Empty values render in italic Fg Mute (`#8A8377`) reading "— pick a unit", "— choose one". A pre-flight note appears below the rows once the template is selected, with a West Sun Amber eyebrow ("PRE-FLIGHT") above prose-format physics specifics. A footnote at the bottom in Cormorant italic 12px holds the etymology disclosure.

## 6. Do's and Don'ts

### Do:
- **Do** use West Sun Amber (#D8A24A) on ≤10% of any given screen, and only as cast light: needles, pulses, glows, single-button fills.
- **Do** tint every neutral toward the brand warmth: Ink Black is #111111, Bone White is #F5F1E8, never `#000` or `#fff`.
- **Do** lead with hairline borders for separation; let shadows appear only on hover/focus/drag/drop.
- **Do** carry the Cormorant Garamond display + Inter body + JetBrains Mono label triplet across every surface. Three faces, three jobs.
- **Do** set body line length to 65–75ch.
- **Do** ease motion with `cubic-bezier(.22,.61,.36,1)` (`--ease-kanso`) for settled state changes, `cubic-bezier(.4,.0,.2,1)` (`--ease-wind`) for drifting motion.
- **Do** respect `prefers-reduced-motion: reduce` globally; the breath dot, framer-motion transitions, and stream-flow animations all collapse to a single static frame when the OS asks.
- **Do** preserve generous whitespace as a load-bearing element. Kanso Reserve (≥73% empty) applies visually as well as physically.
- **Do** keep the etymology disclosure ("kansō ≠ kasō; Form-School ≠ mainland") on every surface that names the tradition.

### Don't:
- **Don't** ship anything that could be mistaken for a Hong Kong or Beijing feng shui app. No red lacquer, no gold, no dragon iconography, no luopan chrome with rotating rings, no fortune-teller register. The Nanyang positioning inverts mainland feng shui; the visual register inverts with it.
- **Don't** ship anything that reads like PropertyGuru, 99.co, or the Qanvast catalog. No listing density, no filter sidebars, no card grids of identical cards. The studio is one home at a time, not a browse experience.
- **Don't** ship anything that reads like Modsy or any 3D-render SaaS. No glossy photoreal rooms in the chrome, no AI-render rainbow gradients, no "preview your decor" framing. Three.js renders are reference imagery only and never carry the visual weight of a render-app demo.
- **Don't** default to generic Pinterest Japandi (brief §4). Singapore-tropical Japandi reads warmer, more woven, more humid. If the surface looks like Muji, it has missed the tropical reading.
- **Don't** introduce a second accent colour. There is one. If a surface seems to need a second, the surface is wrong.
- **Don't** use side-stripe borders (`border-left` or `border-right` greater than 1px as a coloured accent on cards, list items, callouts, alerts). Use full hairline borders or background tints.
- **Don't** use gradient text (`background-clip: text` on a gradient background). Emphasis comes from weight and size, not from rainbow.
- **Don't** use glassmorphism as a default. The disclosure card uses a 6px backdrop-blur on a translucent bone background; that is the one earned exception. Anywhere else, blur is decoration and prohibited.
- **Don't** use the SaaS hero-metric template (big number, small label, supporting stats, gradient accent). The compass and floor readouts share its silhouette but invert its meaning: the number is a reading from the home, not a metric on the product.
- **Don't** rely on shadows to indicate state. Borders, fills, and the amber dot do that work. Shadows only respond to interaction.
- **Don't** use the em dash (—) or its `--` substitute. Use commas, colons, semicolons, periods, or parentheses. The brief's text style leans on the comma; the product follows.
- **Don't** invent a fourth font. Three is the system; a fourth is a smell.
- **Don't** narrate state with severity language (red error meters, ranked defect backlogs, "FAIL" pills). Asking Points only; max three per surface; calm voice always.
