import type { EvidenceTier } from "@/server/evidence";
import type { Point, TemplateId } from "@/server/geometry/types";

export type SimulationSourceKind = "tier1_live" | "prebaked_fallback";
export type WeatherTrialConditionId =
  | "baseline_monsoon"
  | "ne_monsoon"
  | "sw_monsoon"
  | "west_sun_still_air"
  | "west_sun_1720"
  | "highway_night"
  | "ne_monsoon_wind";
export type MaterialPreset = "monsoon_atelier_default";
export type SimulationStreamlineMaterial = "sumi_ink" | "silk_ribbon";
export type SimulationParticleKind = "clean_air" | "pipeshaft_drift";
export type SimulationParticleMaterial = "sunlit_dust" | "hdb_concrete_dust";

export interface WeatherTrialCondition {
  id: WeatherTrialConditionId;
  label: string;
  compassDeg: number;
  ambientWindMps: number;
}

export interface SimulationSourceMetadata {
  kind: SimulationSourceKind;
  engine: "d2q9_lbm";
  adapter: "webgpu" | "prebaked";
  grid: {
    width: number;
    height: number;
    iterations: number;
  };
  webGpu: {
    available: boolean;
    implemented: boolean;
    reason: string;
  };
  fallbackReason?: string;
}

export type SimulationSource = SimulationSourceMetadata;

export interface VelocitySample extends Point {
  vx: number;
  vy: number;
  speedMps: number;
}

export interface SimulationParticle extends Point {
  id: string;
  kind: SimulationParticleKind;
  material: SimulationParticleMaterial;
  delayMs: number;
  speedMps: number;
}

export interface SimulationStreamline {
  id: string;
  material: SimulationStreamlineMaterial;
  points: Point[];
  speedMps: number;
}

export interface Tier4SimulationField {
  templateId: TemplateId;
  condition: WeatherTrialCondition;
  resolution: {
    width: number;
    height: number;
    units: "meters";
    sampleStepM: number;
  };
  materialPreset: MaterialPreset;
  materialDefaults: {
    streamlines: {
      sumiInk: string;
      silkRibbon: string;
    };
    particles: {
      cleanAir: string;
      pipeshaft: string;
    };
    visibility: {
      minOpacity: number;
      maxOpacity: number;
    };
  };
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  velocitySamples: VelocitySample[];
  source: SimulationSource;
  simulationSource: SimulationSourceMetadata;
  cacheMeta?: {
    cacheKey: string;
    weatherCondition: string;
    matrix: {
      version: string;
      templateCount: number;
      tokenCount: number;
      candidateCountPerTemplate: number;
      baseCellCount: number;
    };
    lookup: {
      matched: boolean;
      tokenId?: string;
      candidateId?: string;
      distanceM?: number;
    };
  };
  tier: EvidenceTier;
}
