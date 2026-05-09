import type { TemplateId } from "@/server/geometry/types";
import type { SimulationParticle, SimulationStreamline, VelocitySample } from "./types";

interface Tier4TemplateField {
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  velocitySamples: VelocitySample[];
}

export const TIER4_PREBAKED_FIELDS: Record<TemplateId, Tier4TemplateField> = {
  "tampines-greenweave": {
    streamlines: [
      { id: "living-to-yard", material: "silk_ribbon", speedMps: 0.22, points: [{ x: 9.8, y: 1.5 }, { x: 7.5, y: 3.6 }, { x: 5.2, y: 7.8 }] },
      { id: "bedroom-crossfeed", material: "silk_ribbon", speedMps: 0.14, points: [{ x: 0.5, y: 1.8 }, { x: 3.2, y: 2.7 }, { x: 6.8, y: 3.2 }] },
      { id: "shaft-buffer-zone", material: "sumi_ink", speedMps: 0.18, points: [{ x: 6.1, y: 5.9 }, { x: 6.6, y: 5.4 }, { x: 7.7, y: 4.8 }] },
    ],
    particles: [
      { id: "p1", kind: "clean_air", material: "sunlit_dust", x: 9.7, y: 1.4, delayMs: 0, speedMps: 0.22 },
      { id: "p2", kind: "clean_air", material: "sunlit_dust", x: 7.2, y: 3.7, delayMs: 420, speedMps: 0.2 },
      { id: "p3", kind: "clean_air", material: "sunlit_dust", x: 1, y: 1.9, delayMs: 840, speedMps: 0.14 },
      { id: "p4", kind: "pipeshaft_drift", material: "hdb_concrete_dust", x: 6.1, y: 5.9, delayMs: 1260, speedMps: 0.18 },
    ],
    velocitySamples: [
      { x: 9.4, y: 1.5, vx: -0.18, vy: 0.09, speedMps: 0.2 },
      { x: 6.5, y: 3.6, vx: -0.13, vy: 0.07, speedMps: 0.15 },
      { x: 5.2, y: 7.4, vx: -0.04, vy: 0.16, speedMps: 0.17 },
      { x: 2.1, y: 2.1, vx: 0.09, vy: 0.04, speedMps: 0.1 },
    ],
  },
  "tengah-5room": {
    streamlines: [
      { id: "living-to-service-yard", material: "silk_ribbon", speedMps: 0.21, points: [{ x: 11, y: 1.4 }, { x: 8.2, y: 3.8 }, { x: 5.4, y: 8.3 }] },
      { id: "bedroom-corridor-feed", material: "silk_ribbon", speedMps: 0.15, points: [{ x: 0.6, y: 1.8 }, { x: 3.8, y: 3.5 }, { x: 7, y: 3.8 }] },
      { id: "shaft-drift", material: "sumi_ink", speedMps: 0.17, points: [{ x: 5, y: 6.4 }, { x: 3.6, y: 5.5 }, { x: 1.4, y: 6.8 }] },
    ],
    particles: [
      { id: "p1", kind: "clean_air", material: "sunlit_dust", x: 10.9, y: 1.5, delayMs: 0, speedMps: 0.21 },
      { id: "p2", kind: "clean_air", material: "sunlit_dust", x: 8.1, y: 3.8, delayMs: 420, speedMps: 0.19 },
      { id: "p3", kind: "clean_air", material: "sunlit_dust", x: 1, y: 1.9, delayMs: 840, speedMps: 0.15 },
      { id: "p4", kind: "pipeshaft_drift", material: "hdb_concrete_dust", x: 5, y: 6.4, delayMs: 1260, speedMps: 0.17 },
    ],
    velocitySamples: [
      { x: 10.4, y: 1.6, vx: -0.17, vy: 0.08, speedMps: 0.19 },
      { x: 7.2, y: 3.9, vx: -0.12, vy: 0.08, speedMps: 0.14 },
      { x: 5.4, y: 7.8, vx: -0.04, vy: 0.15, speedMps: 0.16 },
      { x: 2, y: 5.8, vx: -0.1, vy: 0.02, speedMps: 0.1 },
    ],
  },
  "resale-exec-1990s": {
    streamlines: [
      { id: "living-window-to-yard", material: "silk_ribbon", speedMps: 0.2, points: [{ x: 12.8, y: 1.5 }, { x: 9.2, y: 4.2 }, { x: 6.6, y: 9 }] },
      { id: "master-window-relief", material: "silk_ribbon", speedMps: 0.13, points: [{ x: 0.6, y: 2.2 }, { x: 3.7, y: 3.7 }, { x: 6.9, y: 4.7 }] },
      { id: "pipeshaft-drift", material: "sumi_ink", speedMps: 0.18, points: [{ x: 5.4, y: 4 }, { x: 3.4, y: 3.8 }, { x: 1.4, y: 3.2 }] },
    ],
    particles: [
      { id: "p1", kind: "clean_air", material: "sunlit_dust", x: 12.7, y: 1.5, delayMs: 0, speedMps: 0.2 },
      { id: "p2", kind: "clean_air", material: "sunlit_dust", x: 9.2, y: 4.1, delayMs: 420, speedMps: 0.18 },
      { id: "p3", kind: "clean_air", material: "sunlit_dust", x: 0.8, y: 2.3, delayMs: 840, speedMps: 0.13 },
      { id: "p4", kind: "pipeshaft_drift", material: "hdb_concrete_dust", x: 5.4, y: 4, delayMs: 1260, speedMps: 0.18 },
    ],
    velocitySamples: [
      { x: 12.2, y: 1.6, vx: -0.16, vy: 0.08, speedMps: 0.18 },
      { x: 8, y: 4.7, vx: -0.11, vy: 0.09, speedMps: 0.14 },
      { x: 6.4, y: 8.4, vx: -0.03, vy: 0.14, speedMps: 0.14 },
      { x: 2.8, y: 3.6, vx: -0.11, vy: -0.02, speedMps: 0.11 },
    ],
  },
};
