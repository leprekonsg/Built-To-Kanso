export type ImagePromptMode = "generate" | "edit";

export type ImagePromptKind =
  | "plan-sketch-style-transfer"
  | "life-sketch-from-anchor"
  | "empty-room-hero"
  | "wind-sketch-export-polish"
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
    ],
    prompt: [
      "Use case: style-transfer",
      "Asset type: Built-To-Kanso Plan Sketch",
      "Task: Style a deterministic HDB floor-plan rendering. Do not redesign it.",
      "Input images: Image 1 is LOCKED GEOMETRY, a deterministic SVG or PNG floor plan generated from plan-geometry.json. Image 2 is optional BRAND STYLE REFERENCE for sumi-e, washi, and Built-To-Kanso visual register.",
      "Primary request: Convert Image 1 into a warm sumi-e architectural plan sketch on Bone White washi paper.",
      "Style/medium: clean top-down architectural plan, black fude brush wall strokes, subtle ink bloom only at existing wall junctions, precise thin marks for doors and windows.",
      "Hierarchy: Household Shelter and structural Black-state elements use heavier ink weight than normal walls.",
      "Preserve exactly: every wall position, room boundary, doorway, window, Household Shelter outline, service-yard outline, pipeshaft opening, and outer footprint from Image 1.",
      "Constraints: no furniture, no new rooms, no missing rooms, no labels, no dimensions, no compass, no watermark, no title block, no invented symbols.",
      "Avoid: decorative illustration, perspective view, furniture plan, watercolor looseness that changes geometry.",
      "Output: clean architectural top-down plan, square aspect.",
    ].join("\n"),
  },

  "life-sketch-from-anchor": {
    kind: "life-sketch-from-anchor",
    mode: "edit",
    notes: [
      "Use only with a locked Three.js anchor render.",
      "Reject outputs with extra rooms, shifted openings, luxury-condo cues, or visible text.",
    ],
    prompt: [
      "Use case: sketch-to-render",
      "Asset type: Built-To-Kanso Life Sketch",
      "Task: Materialize a locked Three.js room anchor into a photorealistic Singapore HDB interior.",
      "Input images: Image 1 is LOCKED 3D ANCHOR showing exact camera, room proportions, openings, walls, doors, balcony, kitchen doorway, and token positions. Image 2 is optional Built-To-Kanso Japandi-tropical interior mood.",
      "Primary request: Generate a photorealistic eye-level HDB 4-room living-room render matching Image 1's camera and geometry.",
      "Scene/backdrop: honest compact Singapore HDB architecture, light oak floor, off-white limewash walls, sheer linen curtains, HDB balcony light, discreet Household Shelter door near entry if visible.",
      "Objects: preserve major object and token positions from the anchor. Use a plain wooden-bladed ceiling fan only if visible in the anchor.",
      "Lighting/mood: Singapore late-afternoon equatorial sun, warm 4500K, soft balcony light, long gentle shadow bars, realistic exposure, fine sensor grain.",
      "Preserve exactly: camera angle, room proportions, ceiling height, door and window positions, balcony direction, kitchen doorway position, major object positions, and token placement from Image 1.",
      "Constraints: no extra rooms, no luxury condo cues, no marble lobby, no track lighting unless present in Image 1, no tatami, no torii, no Kyoto temple, no cherry blossoms, no Mt Fuji, no fireplace, no Nordic snow, no visible text, no logos, no people, no watermark.",
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
      "Primary request: Photorealistic interior architectural photograph of an empty Japandi-tropical Singapore HDB 4-room living room.",
      "Scene/backdrop: honest compact HDB living room, standing near the main entry and looking toward the balcony; approximate HDB ceiling height, believable public-housing proportions, no luxury condo exaggeration.",
      "Subject: an empty room that feels complete because it is empty. Light oak floor, off-white limewash walls, sheer linen curtains, balcony beyond, one plain wooden-bladed ceiling fan, quiet HDB architecture.",
      "Composition/framing: eye-level architectural photo, wide but not ultra-wide, balcony as the visual anchor, a small hint of entry wall at the edge of frame, floor and ceiling proportions kept modest.",
      "Lighting/mood: Singapore late afternoon, warm equatorial sun through the balcony, soft amber shadow bars, realistic exposure, fine sensor grain; calm, breathable, enough.",
      "Color palette: Bone White, warm oak, HDB concrete grey, restrained Monsoon Sage undertones only in reflected light.",
      "Constraints: no furniture, no plants, no decoration, no track lighting, no recessed gallery lights, no cove lighting, no designer pendant lights, no people, no text, no logos, no watermark, no tatami, no temple, no Nordic interior, no resort styling, no oversized luxury space.",
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
      "Task: Subtle polish only. Do not alter airflow geometry.",
      "Input images: Image 1 is LOCKED WIND SKETCH COMPOSITE. It already contains physics-derived sumi-e airflow streamlines composited over the plan or room. The streamline geometry is final.",
      "Change only: add subtle ink-paper interaction: small ink bloom at existing stroke intersections, dry-brush kasure texture at existing stroke tails, slight washi paper fiber interaction, gentle tonal variation in black ink.",
      "Preserve exactly: every streamline path, start point, end point, curvature, branch, gap, stroke count, wall, object, label, token, badge, and camera crop.",
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
      "Task: Create a quiet Resonance Hour still from the attached HDB interior.",
      "Input images: Image 1 is BASE LIFE SKETCH, a photorealistic HDB living-room render.",
      "Primary request: Make the room feel like real evening wind has just arrived.",
      "Change: sheer curtain barely lifts toward the room, plant leaves tilt subtly only if plants already exist, warm balcony light catches tiny dust motes, the home feels awake but calm.",
      "Preserve: architecture, furniture, camera, materials, object positions, lighting direction, and HDB identity.",
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
      "Task: Create a single demo still showing wind becoming visible.",
      "Input images: Image 1 is BASE LIFE SKETCH. Image 2 is optional material reference showing silk, dust, and ink wind treatment.",
      "Primary request: Show airflow as a controlled environmental material: sunlit dust particles plus one thin translucent silk ribbon following the room's cross-breeze path.",
      "Style: clearly visible but calm, integrated with the room, partially occluded by furniture and doorway depth.",
      "Preserve: room geometry, camera, furniture, lighting, object positions.",
      "Constraints: no smoke, no fog, no black clouds, no thick ribbons, no arrows, no weather diagram, no text, no extra furniture, no watermark.",
    ].join("\n"),
  },
};

export function getOpenAIImagePrompt(kind: ImagePromptKind): OpenAIImagePromptSpec {
  return OPENAI_IMAGE_PROMPTS[kind];
}
