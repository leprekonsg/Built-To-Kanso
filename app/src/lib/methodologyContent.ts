export const methodologyEvidenceTiers = [
  {
    tier: "Official constraint",
    source: "HDB, SCDF, fixed compliance limits",
    use: "Hard stops. The product does not suggest moving, hiding, or altering fixed regulated elements.",
  },
  {
    tier: "Template fact",
    source: "Curated HDB plan geometry",
    use: "Room outlines, walls, openings, shafts, and legal token zones read from the template file.",
  },
  {
    tier: "Heuristic estimate",
    source: "Rule-based Phase 1 briefing model",
    use: "Scout asks, Damp bands, stagnation hints, and token effects. Useful for triage, not certification.",
  },
  {
    tier: "Weather context",
    source: "Singapore wind, monsoon, humidity, and west-sun patterns",
    use: "Explains why a reading changes with NE or SW monsoon behavior and late-afternoon heat.",
  },
  {
    tier: "Prototype visualisation",
    source: "Cloud-grade design simulation",
    use: "Wind and material views that explain assumptions. Not engineering certification.",
  },
] as const;

export const methodologyHardRules = [
  "AI never edits compliance geometry, walls, streamlines, Damp Risk logic, or Black-state decisions.",
  "Streamlines are deterministic first. Image generation may polish allowed visuals only after the facts are fixed.",
  "Scout Pass surfaces at most three Asking Points. No scanner language, severity dashboards, or ranked defect backlog.",
  "Damp Risk appears as Clear, Watch, or High, and Watch or High always comes with a recommended action.",
  "Cosmological vocabulary is Cultural framing only. It never becomes a physical prediction.",
] as const;

export const methodologyMeasuredClaims = [
  "opening area and cross-vent potential",
  "door facing, floor band, and monsoon exposure",
  "room adjacency to shafts, baths, windows, and fixed elements",
  "west-sun heat path from 16:00 to 18:30",
  "bedroom Damp Risk band, kept band-only in homeowner UI",
] as const;

export const methodologyDisclosures = {
  systemFraming:
    "The product uses a hidden Scout and Shikaku diagnostic spine. It stays behind the surface: Breath, Glow, Quiet, Damp, and Shelter checks become calm Asking Points, not a defect report.",
  nanyangPositioning:
    "We are not Hong Kong feng shui. We are not Beijing feng shui. We are Nanyang feng shui, the tropical school calibrated for 1.35° N, where wind is welcomed and west sun is designed against.",
  culturalLabel: "Cultural framing",
  etymology:
    "Built-To-Kanso draws its name from kansō (簡素), pared-down simplicity. The geomantic logic is Chinese Form-School feng shui (峦头派) and building science, not Japanese kasō (家相).",
  evidenceIntro:
    "Every physical claim receives one of five tiers. Cultural framing is separate and never used as evidence for a physical effect.",
  measureIntro:
    "Phase 1 reads geometry and context. It does not claim lab measurement, medical diagnosis, prosperity forecasting, or HDB approval.",
  auditGap:
    "Apartment-scale qi-flow validation is essentially absent from peer-reviewed literature beyond So and Lu, 2001. Prototype visualisations therefore ship as design simulation, with solver assumptions and grid resolution disclosed when rendered.",
} as const;
