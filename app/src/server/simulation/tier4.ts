import type { TemplateId } from "@/server/geometry/types";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import { allowedTokenPlacements, isTokenPlacement, type TokenPlacement } from "@/server/rules/tokens";
import { TIER4_PREBAKED_FIELDS } from "./prebaked";
import type { Tier4SimulationField } from "./types";

export interface SimulationRequestInput {
  templateId?: unknown;
  tokenPlacements?: unknown;
}

interface ValidSimulationRequest {
  templateId: TemplateId;
  tokenPlacements: TokenPlacement[];
}

const MATERIAL_DEFAULTS = {
  streamlines: {
    sumiInk: "#111111",
    silkRibbon: "#E5C37A",
  },
  particles: {
    cleanAir: "#D8A24A",
    pipeshaft: "#A79F93",
  },
  visibility: {
    minOpacity: 0.28,
    maxOpacity: 0.94,
  },
} as const;

export function validateSimulationRequest(input: SimulationRequestInput): ValidSimulationRequest | string {
  if (typeof input.templateId !== "string" || !isTemplateId(input.templateId)) {
    return "templateId must be one of: tampines-greenweave, tengah-5room, resale-exec-1990s.";
  }

  if (input.tokenPlacements === undefined) {
    return { templateId: input.templateId, tokenPlacements: [] };
  }

  if (!Array.isArray(input.tokenPlacements)) {
    return "tokenPlacements must be an array of { tokenId, point: { x, y } }.";
  }

  for (const placement of input.tokenPlacements) {
    if (!isTokenPlacementLike(placement)) {
      return "Each token placement must include tokenId and numeric point { x, y } in plan meters.";
    }
  }

  return { templateId: input.templateId, tokenPlacements: input.tokenPlacements };
}

export function buildTier4Simulation(input: ValidSimulationRequest): Tier4SimulationField {
  const plan = getPlanGeometry(input.templateId);
  const prebaked = TIER4_PREBAKED_FIELDS[input.templateId];
  const validPlacements = allowedTokenPlacements(plan, input.tokenPlacements);
  const shaftBuffered = validPlacements.some((placement) => placement.tokenId === "shaft_buffer");
  const shaftFactor = shaftBuffered ? 0.72 : 1;

  return {
    templateId: input.templateId,
    resolution: {
      width: plan.bounds.width,
      height: plan.bounds.height,
      units: "meters",
      sampleStepM: 1.2,
    },
    materialPreset: "monsoon_atelier_default",
    materialDefaults: MATERIAL_DEFAULTS,
    streamlines: prebaked.streamlines.map((line) => ({
      ...line,
      speedMps: line.id.includes("shaft") || line.id.includes("pipeshaft") ? round(line.speedMps * shaftFactor) : line.speedMps,
      points: line.points.map((point) => ({ ...point })),
    })),
    particles: prebaked.particles.map((particle) => ({
      ...particle,
      speedMps: particle.id === "p4" ? round(particle.speedMps * shaftFactor) : particle.speedMps,
    })),
    velocitySamples: prebaked.velocitySamples.map((sample) => ({ ...sample })),
    source: "tier4_prebaked",
    tier: "prototype_visualisation",
  };
}

function isTokenPlacementLike(value: unknown): value is TokenPlacement {
  return isTokenPlacement(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
