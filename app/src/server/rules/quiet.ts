import type { EvidenceTier } from "@/server/evidence";
import type { ExpresswayAdjacency, PlanGeometry, RoomGeometry } from "@/server/geometry/types";
import type { AskingPoint } from "@/server/scout/scout";

export type QuietBand = "settled" | "soften" | "clear_surface";

export interface QuietMaterialQuantities {
  curtainM2?: number;
  rugM2?: number;
  upholsteredSeatCount?: number;
  acousticPanelM2?: number;
  openShelfM2?: number;
}

export interface QuietInput {
  plan: PlanGeometry;
  floor: number;
  roomId?: string;
  ceilingHeightM?: number;
  materialQuantities?: QuietMaterialQuantities;
  nightFacadeNoiseDba?: number;
  windowClosedReductionDba?: number;
}

export interface QuietDesignerQuantities {
  roomId: string;
  floorAreaM2: number;
  volumeM3: number;
  wallAreaM2: number;
  absorptionAreaM2: number;
  curtainM2: number;
  rugM2: number;
  upholsteredSeatCount: number;
  acousticPanelM2: number;
  openShelfM2: number;
  ceilingHeightM: number;
}

export interface QuietReading {
  band: QuietBand;
  rt60Seconds: number;
  rt60TargetSeconds: {
    min: 0.4;
    max: 0.6;
  };
  bedroomNoiseDba: number;
  bedroomNoiseTargetDba: 30;
  facadeBaselineDba: number;
  expresswayAdjacency: ExpresswayAdjacency;
  designerQuantities: QuietDesignerQuantities;
  culturalSummary: string;
  designerSummary: string;
  askingPoints: AskingPoint[];
  tier: EvidenceTier;
}

const DEFAULT_CEILING_HEIGHT_M = 2.6;
const DEFAULT_NIGHT_FACADE_NOISE_DBA = 58;
const DEFAULT_WINDOW_CLOSED_REDUCTION_DBA = 24;
const RT60_TARGET_MIN = 0.4;
const RT60_TARGET_MAX = 0.6;
const BEDROOM_NOISE_TARGET_DBA = 30;

export function evaluateQuiet(input: QuietInput): QuietReading {
  const room = selectRoom(input.plan, input.roomId);
  const ceilingHeightM = input.ceilingHeightM ?? DEFAULT_CEILING_HEIGHT_M;
  const quantities = normalizeQuantities(input.materialQuantities);
  const designerQuantities = estimateDesignerQuantities(room, ceilingHeightM, quantities);
  const rt60Seconds = estimateRt60Seconds(designerQuantities);
  const adjacency = input.plan.siteContext?.expresswayAdjacency ?? "none";
  const facadeBaselineDba = resolveFacadeBaselineDba(input);
  const bedroomNoiseDba = estimateBedroomNoiseDba(input, facadeBaselineDba);
  const band = bandQuiet(rt60Seconds, bedroomNoiseDba);
  const askingPoints = buildAskingPoints({
    room,
    rt60Seconds,
    bedroomNoiseDba,
    designerQuantities,
  });

  return {
    band,
    rt60Seconds,
    rt60TargetSeconds: { min: RT60_TARGET_MIN, max: RT60_TARGET_MAX },
    bedroomNoiseDba,
    bedroomNoiseTargetDba: BEDROOM_NOISE_TARGET_DBA,
    facadeBaselineDba,
    expresswayAdjacency: adjacency,
    designerQuantities,
    culturalSummary: culturalSummaryFor(band),
    designerSummary:
      `${room.label}: RT60 ${rt60Seconds.toFixed(2)}s, target 0.4-0.6s; ` +
      `bedroom ${bedroomNoiseDba} dB LAeq, target <=30; ` +
      `facade baseline ${facadeBaselineDba} dBA (${adjacency}); ` +
      `curtain ${formatNumber(designerQuantities.curtainM2)}m2, rug ${formatNumber(designerQuantities.rugM2)}m2, ` +
      `upholstery ${designerQuantities.upholsteredSeatCount} seats, absorption ${formatNumber(designerQuantities.absorptionAreaM2)}m2.`,
    askingPoints,
    tier: "heuristic_estimate",
  };
}

function selectRoom(plan: PlanGeometry, roomId?: string): RoomGeometry {
  const requested = roomId ? plan.rooms.find((room) => room.id === roomId) : undefined;
  return requested ?? plan.rooms.find((room) => room.kind === "living") ?? plan.rooms[0];
}

function normalizeQuantities(quantities?: QuietMaterialQuantities): Required<QuietMaterialQuantities> {
  return {
    curtainM2: nonNegative(quantities?.curtainM2),
    rugM2: nonNegative(quantities?.rugM2),
    upholsteredSeatCount: Math.round(nonNegative(quantities?.upholsteredSeatCount)),
    acousticPanelM2: nonNegative(quantities?.acousticPanelM2),
    openShelfM2: nonNegative(quantities?.openShelfM2),
  };
}

function estimateDesignerQuantities(
  room: RoomGeometry,
  ceilingHeightM: number,
  quantities: Required<QuietMaterialQuantities>,
): QuietDesignerQuantities {
  const floorAreaM2 = room.width * room.height;
  const wallAreaM2 = 2 * (room.width + room.height) * ceilingHeightM;
  const volumeM3 = floorAreaM2 * ceilingHeightM;
  const hardRoomAbsorptionM2 = floorAreaM2 * 0.05 + floorAreaM2 * 0.05 + wallAreaM2 * 0.04;
  const materialAbsorptionM2 =
    quantities.curtainM2 * 0.55 +
    quantities.rugM2 * 0.35 +
    quantities.upholsteredSeatCount * 0.75 +
    quantities.acousticPanelM2 * 0.85 +
    quantities.openShelfM2 * 0.3;

  return {
    roomId: room.id,
    floorAreaM2: round1(floorAreaM2),
    volumeM3: round1(volumeM3),
    wallAreaM2: round1(wallAreaM2),
    absorptionAreaM2: round1(hardRoomAbsorptionM2 + materialAbsorptionM2),
    curtainM2: quantities.curtainM2,
    rugM2: quantities.rugM2,
    upholsteredSeatCount: quantities.upholsteredSeatCount,
    acousticPanelM2: quantities.acousticPanelM2,
    openShelfM2: quantities.openShelfM2,
    ceilingHeightM,
  };
}

function estimateRt60Seconds(quantities: QuietDesignerQuantities): number {
  if (quantities.absorptionAreaM2 <= 0) return 0;
  return round2((0.161 * quantities.volumeM3) / quantities.absorptionAreaM2);
}

// Heuristic baseline night-time facade dBA values per expressway adjacency
// (none 58, near_kpe/near_bke/near_aye 62, near_pie 68, near_cte 70).
// Distance modifier: <=80m +2, >200m -2. Tier: heuristic_estimate; not from a published study.
function resolveFacadeBaselineDba(input: QuietInput): number {
  if (input.nightFacadeNoiseDba !== undefined) return input.nightFacadeNoiseDba;
  const adjacency = input.plan.siteContext?.expresswayAdjacency ?? "none";
  const distanceM = input.plan.siteContext?.expresswayDistanceM;
  const base = baselineForAdjacency(adjacency);
  return base + distanceModifierDba(adjacency, distanceM);
}

function baselineForAdjacency(adjacency: ExpresswayAdjacency): number {
  switch (adjacency) {
    case "none":
      return DEFAULT_NIGHT_FACADE_NOISE_DBA;
    case "near_kpe":
    case "near_bke":
    case "near_aye":
      return 62;
    case "near_pie":
      return 68;
    case "near_cte":
      return 70;
  }
}

function distanceModifierDba(adjacency: ExpresswayAdjacency, distanceM: number | undefined): number {
  if (adjacency === "none" || distanceM === undefined) return 0;
  if (distanceM <= 80) return 2;
  if (distanceM > 200) return -2;
  return 0;
}

function estimateBedroomNoiseDba(input: QuietInput, facadeBaselineDba: number): number {
  const reduction = input.windowClosedReductionDba ?? DEFAULT_WINDOW_CLOSED_REDUCTION_DBA;
  return Math.round(facadeBaselineDba - reduction + floorNoiseAdjustment(input.floor));
}

function floorNoiseAdjustment(floor: number): number {
  if (floor <= 3) return 1;
  if (floor >= 20) return 1;
  return 0;
}

function buildAskingPoints(input: {
  room: RoomGeometry;
  rt60Seconds: number;
  bedroomNoiseDba: number;
  designerQuantities: QuietDesignerQuantities;
}): AskingPoint[] {
  const points: AskingPoint[] = [];

  if (input.rt60Seconds > RT60_TARGET_MAX) {
    points.push({
      id: "quiet-rt60-long",
      scout: "quiet",
      copy: "Living room asks for softer edges.",
      designerDetail:
        `${input.room.label} RT60 ${input.rt60Seconds.toFixed(2)}s; target 0.4-0.6s. ` +
        `Absorption ${formatNumber(input.designerQuantities.absorptionAreaM2)}m2 from Designer quantities.`,
      recommendation: "Add curtain, rug, upholstery, or a small acoustic panel before changing the plan.",
      tier: "heuristic_estimate",
    });
  }

  if (input.rt60Seconds < RT60_TARGET_MIN) {
    points.push({
      id: "quiet-rt60-short",
      scout: "quiet",
      copy: "Living room is already damped; keep one clear surface.",
      designerDetail: `${input.room.label} RT60 ${input.rt60Seconds.toFixed(2)}s; target 0.4-0.6s.`,
      recommendation: "Do not add more soft layers until the room has been lived in.",
      tier: "heuristic_estimate",
    });
  }

  if (input.bedroomNoiseDba > BEDROOM_NOISE_TARGET_DBA) {
    points.push({
      id: "quiet-bedroom-noise",
      scout: "quiet",
      copy: "Bedroom night sound asks for a quieter edge.",
      designerDetail: `Bedroom estimate ${input.bedroomNoiseDba} dB LAeq; target <=30 dB LAeq.`,
      recommendation: "Close the window during sleep hours or add a soft, seal-friendly curtain layer.",
      tier: "heuristic_estimate",
    });
  }

  return points.slice(0, 3);
}

function bandQuiet(rt60Seconds: number, bedroomNoiseDba: number): QuietBand {
  if (rt60Seconds < RT60_TARGET_MIN && bedroomNoiseDba <= BEDROOM_NOISE_TARGET_DBA) return "clear_surface";
  if (rt60Seconds > RT60_TARGET_MAX || bedroomNoiseDba > BEDROOM_NOISE_TARGET_DBA) return "soften";
  return "settled";
}

function culturalSummaryFor(band: QuietBand): string {
  if (band === "settled") return "Quiet is sitting inside the target window.";
  if (band === "clear_surface") return "The room has enough softness; leave one surface clear.";
  return "The home asks for softer edges before more objects.";
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, value) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
