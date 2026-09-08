// Two-Voice Rule (PRODUCT.md):
//   Cultural — calm, asks rather than instructs, no numerics.
//   Designer — same calm, plus instrument values (opening %, deg, ACH).
//
// Rule of thumb: Cultural strings stay metaphor-clean and never expose the
// humidity outcome. Designer uses the same evidence boundary.

export interface VoicePair<TArgs extends unknown[] = []> {
  cultural: string;
  designer: (...args: TArgs) => string;
}

export const voiceCopy = {
  // breath-opening-marginal — opening area below 12% capable threshold.
  askingBreathOpeningMarginal: {
    cultural: "Main path wants help moving air.",
    designer: (areaPct: number, recommendation: string) =>
      `Opening area ${areaPct}%, below the 12% capable threshold. ${recommendation}`,
  } satisfies VoicePair<[number, string]>,

  // breath-bathroom-downwind — bathroom exhaust on the bedroom breeze line.
  askingBreathBathroomDownwind: {
    cultural: "Bathroom air path may drift toward a bedroom.",
    designer: (
      bathroomLabel: string,
      roomLabel: string,
      downwindDeg: number,
      recommendation: string,
    ) =>
      `${bathroomLabel} sits downwind toward ${roomLabel} on the ${downwindDeg}deg breeze line. ${recommendation}`,
  } satisfies VoicePair<[string, string, number, string]>,

  // breath-pipeshaft-drift — bedroom downwind of pipeshaft jet.
  askingBreathPipeshaftDrift: {
    cultural: "Bedroom downwind of pipeshaft.",
    designer: (downwindRoomIds: string[]) =>
      `Pipeshaft drift path reaches ${downwindRoomIds.join(", ")}. Jet velocity 0.15-0.25 m/s.`,
  } satisfies VoicePair<[string[]]>,

  // glow-west-edge — facade aligns with afternoon west-sun (16:00-18:30).
  askingGlowWestEdge: {
    cultural: "West edge carrying heat.",
    designer: (facadeDeg: number) =>
      `Facade ${facadeDeg}deg aligns with afternoon west-sun exposure. SHGC target <=0.30.`,
  } satisfies VoicePair<[number]>,

  // Legacy Damp keys remain for consumers, but do not imply an unmeasured outcome.
  dampHigh: {
    cultural: "Humidity effect: Not assessed.",
    designer: () => "Humidity effect: Not assessed. Measure indoor humidity before drawing a damp conclusion.",
  } satisfies VoicePair,

  dampWatch: {
    cultural: "Humidity effect: Not assessed.",
    designer: () => "Humidity effect: Not assessed. Measure indoor humidity before drawing a damp conclusion.",
  } satisfies VoicePair,

  dampClear: {
    cultural: "Humidity effect: Not assessed.",
    designer: () => "Humidity effect: Not assessed. Measure indoor humidity before drawing a damp conclusion.",
  } satisfies VoicePair,
} as const;

export type VoiceCopyKey = keyof typeof voiceCopy;
