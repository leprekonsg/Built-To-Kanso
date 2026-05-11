export type ImagePromptMode = "generate" | "edit";

export type ImagePromptKind =
  | "plan-sketch-style-transfer"
  | "life-sketch-from-anchor"
  | "empty-room-hero"
  | "wind-sketch-base"
  | "wind-sketch-export-polish"
  | "wind-sketch-micro-polish"
  | "environmental-texture-atlas"
  | "resonance-hour-background"
  | "material-reveal-demo-frame";

export interface OpenAIImagePromptSpec {
  kind: ImagePromptKind;
  mode: ImagePromptMode;
  prompt: string;
  notes: string[];
}

export const OPENAI_IMAGE_PROMPTS: Record<ImagePromptKind, OpenAIImagePromptSpec> = {
  "plan-sketch-style-transfer": {
    kind: "plan-sketch-style-transfer",
    mode: "edit",
    notes: [
      "Use only with a locked deterministic plan render.",
      "Reject outputs with moved walls, labels, furniture, or invented symbols.",
      "The output is visual only; plan-geometry.json remains the compliance source of truth.",
    ],
    prompt: [
      "Use case: style-transfer",
      "Asset type: Built-To-Kanso Plan Sketch",
      "Task: Style a deterministic HDB floor-plan rendering. Do not redesign, correct, simplify, complete, or reinterpret it.",
      "Source of truth: Image 1 is LOCKED GEOMETRY, a deterministic SVG or PNG floor plan generated from plan-geometry.json. Image 2 is an optional style reference only.",
      "Authority order: Image 1 geometry overrides the prompt, style references, aesthetic preference, and any inferred architectural convention.",
      "Change only: ink texture, paper grain, line warmth, subtle sumi-e architectural finish, and tonal hierarchy.",
      "Preserve exactly: every wall position, room boundary, doorway, window, Household Shelter outline, service-yard outline, pipeshaft opening, outer footprint, crop, and top-down orthographic view from Image 1.",
      "Style/medium: warm sumi-e architectural drafting on Bone White washi paper, precise black fude brush wall strokes, subtle ink bloom only at existing wall junctions, thin existing marks for doors and windows.",
      "Hierarchy: Household Shelter and structural Black-state elements may use heavier ink weight, but their geometry must not move.",
      "Reject output if: any wall shifts, any room appears or disappears, any opening moves, labels or symbols are added, furniture appears, or the plan becomes perspective.",
      "Constraints: no furniture, no new rooms, no missing rooms, no labels, no dimensions, no compass, no watermark, no title block, no invented symbols.",
      "Output: clean architectural top-down plan, square aspect.",
    ].join("\n"),
  },

  "life-sketch-from-anchor": {
    kind: "life-sketch-from-anchor",
    mode: "edit",
    notes: [
      "Use only with a locked Three.js anchor render.",
      "Reject outputs with extra rooms, shifted openings, luxury-condo cues, or visible text.",
      "The output is prototype visualization, never compliance truth.",
    ],
    prompt: [
      "Use case: sketch-to-render",
      "Asset type: Built-To-Kanso Life Sketch",
      "Task: Materialize a locked deterministic camera-view greybox into a beautiful Singapore HDB Life Sketch. This is prototype_visualisation, not compliance evidence.",
      "Source of truth: Image 1 is LOCKED CAMERA AND VISIBLE GEOMETRY, a deterministic Three.js greybox generated from plan-geometry.json. Image 2 is topology reference only, a top-down plan proof. Image 3 is optional brand atmosphere. Image 4 is optional material board.",
      "Authority order: Image 1 camera and visible geometry override Image 2, style references, photorealism, interior-design convention, aesthetic cleanup, and any inferred room correction. Image 2 resolves topology only; do not convert to a different viewpoint.",
      "Change only: materialize surfaces, walls, floor, curtains, light, modest HDB finishes, token surface character, realistic shadow softness, exposure, fine sensor grain, and quiet HDB atmosphere.",
      "Preserve exactly: Image 1 camera angle, crop, room count, room proportions, ceiling height, wall masses, every internal door position, window positions, balcony direction, kitchen doorway, Household Shelter/service/pipeshaft relationship, major object positions, token count, token centerpoints, token bounding boxes, and token placement.",
      "Bathroom discipline: render only the bathrooms shown in the locked references. Do not turn Household Shelter, pipeshaft, service yard, or wet-zone overlays into an extra toilet, shower, or bathroom.",
      "Circulation discipline: preserve bedroom doors to corridor/circulation exactly where shown. The main bedroom must not be accessible only through a bathroom if the topology proof shows a corridor door.",
      "Scene/backdrop: honest compact Singapore HDB architecture, light oak or terrazzo floor, off-white limewash walls, sheer linen curtains, HDB balcony/window light, modest public-housing proportions, no generic luxury Japandi room.",
      "Objects: preserve major object and token positions from Image 1. Style tokens as single integrated material objects, never as furniture catalog staging or generated-room proof. Use a plain wooden-bladed ceiling fan only if visible in Image 1.",
      "Lighting/mood: Singapore late-afternoon equatorial sun, warm 4500K, soft balcony light, long gentle shadow bars, realistic exposure, fine sensor grain, calm Monsoon Atelier atmosphere.",
      "Visual quality: photographic and physically plausible, with matte tropical materials and restrained contrast. Avoid plastic-AI-render sheen, HDR clarity, over-sharpening, waxy surfaces, anime, manga, game-asset styling, and showroom CGI.",
      "Reject output if: extra rooms appear, rooms disappear, openings shift, bedroom corridor doors disappear, the main bedroom becomes bathroom-only access, Household Shelter reads as a bathroom, bathroom count increases, walls move, balcony/window side changes, camera/viewpoint changes, kitchen/Household Shelter/pipeshaft relationship changes, tokens move, token sizes change, luxury-condo cues appear, visible text appears, or the scene reads as generic render-SaaS staging.",
      "Constraints: no extra bathrooms, no extra rooms, no bathroom fixtures in Household Shelter, no luxury condo cues, no marble lobby, no track lighting unless present in Image 1, no cove lighting, no designer pendant lighting, no tatami, no torii, no Kyoto temple, no cherry blossoms, no Mt Fuji, no fireplace, no Nordic snow, no visible text, no logos, no people, no watermark, no plastic-AI-render sheen, no HDR clarity, no anime, no manga.",
    ].join("\n"),
  },

  "empty-room-hero": {
    kind: "empty-room-hero",
    mode: "generate",
    notes: [
      "Validated draft was strong on emptiness and HDB balcony identity.",
      "Correction: ban track lighting and gallery-like renovation cues.",
    ],
    prompt: [
      "Use case: photorealistic-natural",
      "Asset type: Built-To-Kanso Empty Room Hero",
      "Primary request: Photorealistic interior architectural photograph of an empty Japandi-tropical Singapore HDB 4-room living room. The room is not a compliance drawing.",
      "Design intent: remove rather than place. The room feels complete because it is empty, modest, and breathable.",
      "Scene/backdrop: honest compact HDB living room, standing near the main entry and looking toward the balcony, approximate HDB ceiling height, believable public-housing proportions, no luxury condo exaggeration.",
      "Subject: empty light oak floor, off-white limewash walls, sheer linen curtains, balcony beyond, one plain wooden-bladed ceiling fan, quiet HDB architecture.",
      "Composition/framing: eye-level architectural photo, wide but not ultra-wide, balcony as the visual anchor, a small hint of entry wall at the edge of frame, floor and ceiling proportions kept modest.",
      "Lighting/mood: Singapore late afternoon, warm equatorial sun through the balcony, soft amber shadow bars, realistic exposure, fine sensor grain, calm Monsoon Atelier atmosphere.",
      "Color palette: Bone White, warm oak, HDB concrete grey, restrained Monsoon Sage undertones only in reflected light, West Sun Amber only as cast light.",
      "Reject output if: furniture, plants, decoration, luxury staging, oversized space, showroom lighting, visible text, logos, people, or non-HDB resort cues appear.",
      "Constraints: no furniture, no plants, no decoration, no track lighting, no recessed gallery lights, no cove lighting, no designer pendant lights, no people, no text, no logos, no watermark, no tatami, no temple, no Nordic interior, no resort styling, no oversized luxury space, no plastic-AI-render sheen, no HDR clarity, no showroom CGI.",
    ].join("\n"),
  },

  "wind-sketch-base": {
    kind: "wind-sketch-base",
    mode: "edit",
    notes: [
      "Stage B of the brief's Wind Sketch pipeline.",
      "Produces the styled top-down background only. Streamlines are added in Stage C as deterministic SVG.",
      "Reject any output that adds furniture, labels, streamlines, arrows, or moves walls.",
    ],
    prompt: [
      "Use case: style-transfer",
      "Asset type: Built-To-Kanso Wind Sketch base (Stage B background, no airflow)",
      "Task: Produce a styled top-down sumi-e architectural rendering of the locked plan, framed for hero composition. This is a BACKGROUND ONLY; the airflow streamlines are composited in Stage C and must not appear in your output.",
      "Source of truth: Image 1 is LOCKED GEOMETRY, a deterministic top-down rendering of the plan from plan-geometry.json. The input may include furniture cues, room labels, or watermarks for traceability; the output must strip them.",
      "Authority order: Image 1 geometry overrides the prompt, style references, aesthetic preference, and any inferred architectural convention.",
      "Change only: ink texture, paper grain, line warmth, subtle sumi-e architectural finish, and tonal hierarchy. Remove all furniture, labels, dimensions, and watermarks from Image 1 — keep only walls, doorways, windows, and structural outlines. The framing may breathe slightly for hero composition (calm margin around the plan) but the plan footprint must not move within the frame.",
      "Preserve exactly: every wall position, room boundary, doorway, window, Household Shelter outline, service-yard outline, pipeshaft opening, outer footprint, and top-down orthographic view from Image 1.",
      "Style/medium: warm sumi-e architectural drafting on Bone White washi paper, precise black fude brush wall strokes, restrained ink bloom only at existing wall junctions, hairline marks for existing doors and windows.",
      "Hierarchy: Household Shelter and structural Black-state elements may use heavier ink weight, but their geometry must not move.",
      "Reject output if: any wall shifts, any room appears or disappears, any opening moves, labels or symbols are added, furniture appears, streamlines or arrows appear, or the plan becomes perspective.",
      "Constraints: no furniture, no streamlines, no airflow arrows, no new rooms, no missing rooms, no labels, no dimensions, no compass, no watermark, no title block, no invented symbols.",
      "Output: clean architectural top-down plan styled for the hero composition, 3:2 landscape aspect.",
    ].join("\n"),
  },

  "wind-sketch-export-polish": {
    kind: "wind-sketch-export-polish",
    mode: "edit",
    notes: [
      "Use only after deterministic SVG streamlines are already composited.",
      "Reject any output that moves, smooths, merges, splits, or invents airflow lines.",
    ],
    prompt: [
      "Use case: precise-object-edit",
      "Asset type: Built-To-Kanso Wind Sketch polish",
      "Task: Subtle polish only. Do not alter airflow geometry or underlying plan geometry.",
      "Source of truth: Image 1 is LOCKED WIND SKETCH COMPOSITE. It already contains deterministic physics-derived sumi-e airflow streamlines composited over the plan or room.",
      "Authority order: existing pixels and line paths override beauty, smoothness, style consistency, and inferred airflow.",
      "Change only: subtle ink-paper interaction, small ink bloom at existing stroke intersections, dry-brush kasure texture at existing stroke tails, slight washi paper fiber interaction, gentle tonal variation in black ink.",
      "Preserve exactly: every streamline path, start point, end point, curvature, branch, gap, stroke count, wall, object, label, token, badge, and camera crop.",
      "Reject output if: any airflow line moves, smooths, merges, splits, extends, disappears, appears, thickens into smoke, or becomes an arrow.",
      "Constraints: do not move, redraw, smooth, merge, split, extend, or invent any airflow line. No arrows, no smoke, no fog, no weather-map look, no new text, no watermark.",
    ].join("\n"),
  },

  "wind-sketch-micro-polish": {
    kind: "wind-sketch-micro-polish",
    mode: "edit",
    notes: [
      "Tier-2 polish (Stage D). Off by default — gated by ?polish=1 query string and OPENAI_API_KEY.",
      "Hard rule (brief Section 18): streamline geometry never moves. The image-edit input is the deterministic SVG composite rasterized to PNG; the prompt restates preservation explicitly.",
    ],
    prompt: [
      "Use case: precise-object-edit",
      "Asset type: Built-To-Kanso Wind Sketch micro-polish",
      "Task: ink-paper interaction effects only; preserve all line geometry exactly; no new content; subtle paper grain and ink-bleed only.",
      "Source of truth: Image 1 is the LOCKED WIND SKETCH COMPOSITE rasterized from deterministic SVG. Streamline geometry is final and must not move.",
      "Authority order: existing pixels and deterministic streamline paths override style, smoothness, and inferred airflow.",
      "Change only: subtle washi paper grain, faint ink bleed at existing stroke crossings, gentle tonal variation in black ink, slight kasure dry-brush at existing stroke tails.",
      "Preserve exactly: every streamline path, start point, end point, curvature, branch, gap, stroke count, wall, room outline, opening, fixed element, particle, label, and crop.",
      "Reject output if: any streamline moves, any stroke count changes, any airflow line is added or removed, any room outline changes, or any weather-map symbol appears.",
      "Constraints: do not move, redraw, smooth, merge, split, extend, or invent any airflow line. No arrows, no smoke, no fog, no weather-map look, no new text, no watermark.",
    ].join("\n"),
  },

  "environmental-texture-atlas": {
    kind: "environmental-texture-atlas",
    mode: "generate",
    notes: [
      "Validated draft produced a clean 2x3 atlas with no text.",
      "Correction: keep dust tile interior-lit, not space-like; keep LIC useful but not visually dominant.",
    ],
    prompt: [
      "Use case: stylized-concept",
      "Asset type: Built-To-Kanso environmental material shader texture atlas",
      "Primary request: Create a 2x3 texture atlas for Built-To-Kanso's environmental material system. These are shader texture inputs, not final UI.",
      "Composition/framing: six equal rectangular tiles in a clean 2 columns by 3 rows atlas, no borders, no labels, consistent camera-flat material swatches.",
      "Tile 1: sumi ink dry-brush texture on transparent-feeling warm washi, black brush grain with usable alpha-like negative space.",
      "Tile 2: fine rice-paper grain, Bone White #F5F1E8, subtle fiber direction, low contrast.",
      "Tile 3: sunlit dust motes in a warm HDB interior light field, sparse West Sun Amber #D8A24A and off-white particles, no outer-space blackness, no bokeh circles larger than dust.",
      "Tile 4: silk fiber shimmer, translucent pale sage and bone-white strands, soft directional weave.",
      "Tile 5: humid tropical air distortion texture, extremely subtle heat-haze bands, low contrast, usable as a shader displacement source.",
      "Tile 6: audit LIC noise texture, monochrome directional streaks for vector-field visualization, high enough structure for debugging but not decorative.",
      "Style/medium: premium quiet minimal material photography and procedural texture design; Japanese ink material discipline adapted for Singapore HDB interiors.",
      "Color palette: Ink Black, Bone White, Void Deck Grey, Monsoon Sage, West Sun Amber only as cast light and dust.",
      "Constraints: no icons, no text, no labels, no arrows, no decorative illustrations, no smoke clouds, no fantasy magic, texture assets only, square atlas.",
    ].join("\n"),
  },

  "resonance-hour-background": {
    kind: "resonance-hour-background",
    mode: "edit",
    notes: [
      "Use from a Life Sketch base.",
      "Wind is implied through fabric, dust, leaves, and light only.",
    ],
    prompt: [
      "Use case: lighting-weather",
      "Asset type: Built-To-Kanso Resonance Hour still",
      "Task: Create a quiet Resonance Hour still from the attached HDB interior without changing the room.",
      "Source of truth: Image 1 is BASE LIFE SKETCH, a photorealistic HDB living-room render. It is visual context only; real wind alignment is computed outside this image.",
      "Primary request: Make the room feel like real evening wind has just arrived.",
      "Change only: sheer curtain barely lifts toward the room, existing plant leaves tilt subtly only if plants already exist, warm balcony light catches tiny dust motes, the home feels awake but calm.",
      "Preserve exactly: architecture, furniture, camera, room proportions, materials, object positions, lighting direction, and HDB identity.",
      "Reject output if: wind lines, arrows, smoke, fog, magic glow, notification UI, new furniture, moved furniture, text, logos, or non-HDB luxury cues appear.",
      "Constraints: do not draw obvious wind lines. No smoke, no fog, no arrows, no magic glow, no text, no notification UI, no logos, no watermark.",
    ].join("\n"),
  },

  "material-reveal-demo-frame": {
    kind: "material-reveal-demo-frame",
    mode: "edit",
    notes: [
      "Marketing/demo still only, not live physics.",
      "Use deterministic material overlays for product UI; this prompt is for still assets.",
    ],
    prompt: [
      "Use case: compositing",
      "Asset type: Built-To-Kanso Material Reveal demo still",
      "Task: Create a single demo still showing wind becoming visible. This is marketing imagery, not live physics or compliance truth.",
      "Source of truth: Image 1 is BASE LIFE SKETCH. Image 2 is optional material reference showing silk, dust, and ink wind treatment.",
      "Primary request: Show airflow as a controlled environmental material: sunlit dust particles plus one thin translucent silk ribbon following the room's existing cross-breeze path.",
      "Change only: environmental material overlay, dust visibility, ribbon translucency, and subtle integration with existing light.",
      "Style: clearly visible but calm, integrated with the room, partially occluded by furniture and doorway depth.",
      "Preserve exactly: room geometry, camera, furniture, lighting direction, object positions, openings, and HDB identity.",
      "Reject output if: room geometry changes, objects move, new furniture appears, airflow becomes smoke or fog, ribbon becomes thick, arrows appear, or the image reads as a weather diagram.",
      "Constraints: no smoke, no fog, no black clouds, no thick ribbons, no arrows, no weather diagram, no text, no extra furniture, no watermark.",
    ].join("\n"),
  },
};

export function getOpenAIImagePrompt(kind: ImagePromptKind): OpenAIImagePromptSpec {
  return OPENAI_IMAGE_PROMPTS[kind];
}
