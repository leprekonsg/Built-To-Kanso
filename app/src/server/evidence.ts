// brief §9 — five structural evidence tiers, plus the separate
// non-evidence cultural-framing label (Hard Rule #17).
//
// Every reading the homeowner sees should declare which tier produced it.
// `cultural_framing` is intentionally NOT part of EvidenceTier — it is a
// separate label and never appears on a reading that makes a physical claim.

export type EvidenceTier =
  | "official_constraint"   // HDB / SCDF Black-state element; alteration requires approval
  | "template_fact"         // curated archetype geometry, openings, room labels
  | "heuristic_estimate"    // layout-based design rule (Damp Risk, west-sun heat path, opening badge, downwind, command-position)
  | "weather_context"       // NEA outdoor station data (Resonance Hours, Monsoon Turn)
  | "prototype_visualisation"; // live LBM, Sketches, Material System renders

export const EVIDENCE_TIER_LABELS: Record<EvidenceTier, string> = {
  official_constraint: "Official constraint",
  template_fact: "Template fact",
  heuristic_estimate: "Heuristic estimate",
  weather_context: "Weather context",
  prototype_visualisation: "Prototype visualisation",
};
