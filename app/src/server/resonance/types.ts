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
  // Brief 14.5 — stable identifier for the current alignment "event": one id
  // for every poll while wind stays inside the corridor tolerance, regenerated
  // once the wind drifts out and re-aligns. The in-app banner uses this as the
  // dedup key so the user sees the message ONCE per real alignment, not on
  // every 60s poll. Null when not resonating.
  alignmentEventId: string | null;
}

export type FloorTier = "ground" | "transition" | "golden" | "turbulent";

// Brief 14.5 — three-tier frequency control. Calm/Standard/Active govern how
// strict the resonance match must be and how long between pings. Calm and
// Standard cap predicted indoor speed; Active intentionally does not.
export type FrequencyTier = "calm" | "standard" | "active";
