// brief Phase 1 §23 — Resonance Hours.
// "The home stays with the user": one quiet ping when real outdoor wind
// aligns with the unit's optimal cross-vent corridor.

export interface CrossVentCorridor {
  azimuthDeg: number;
  openingIds: [string, string];
  spanM: number;
}

export interface WindReading {
  directionDeg: number;
  speedMps: number;
  timestamp: string;
  source: "nea" | "mock";
  stationId?: string;
}

export interface ResonanceEvaluation {
  resonating: boolean;
  shouldNotify: boolean;
  reason: string;
  nextEligibleAt: string | null;
  tier: "weather_context" | "heuristic_estimate";
}

export type FloorTier = "ground" | "transition" | "golden" | "turbulent";
