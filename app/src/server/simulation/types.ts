import type { EvidenceTier } from "@/server/evidence";
import type { Point, TemplateId } from "@/server/geometry/types";

export type SimulationSource = "tier4_prebaked";
export type MaterialPreset = "monsoon_atelier_default";
export type SimulationStreamlineMaterial = "sumi_ink" | "silk_ribbon";
export type SimulationParticleKind = "clean_air" | "pipeshaft_drift";
export type SimulationParticleMaterial = "sunlit_dust" | "hdb_concrete_dust";

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
  tier: EvidenceTier;
}
