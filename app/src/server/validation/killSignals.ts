export type KillSignalId =
  | "damp_health_diagnosis_drift"
  | "cultural_fortune_telling_drift"
  | "visual_overpowering_trust_layer";

export interface KillSignalInput {
  userId: string;
  text: string;
}

export interface KillSignalResult {
  id: KillSignalId;
  tripped: boolean;
  matches: number;
  total: number;
  threshold: number;
  action: string;
}

interface KillSignalRule {
  id: KillSignalId;
  patterns: RegExp[];
  action: string;
}

const RULES: readonly KillSignalRule[] = [
  {
    id: "damp_health_diagnosis_drift",
    patterns: [
      /\b(mould|mold|fungus|spores?)\b/i,
      /\b(humidity|rh|relative humidity)\s+(reading|measurement|measure|sensor)\b/i,
      /\b(diagnos(?:is|e)|health risk|medical diagnosis|iaq assessment|air quality assessment)\b/i,
    ],
    action: "Strip Damp numerics, tighten the not-a-measurement disclaimer, and pair every band with an action.",
  },
  {
    id: "cultural_fortune_telling_drift",
    patterns: [
      /\b(luck|lucky|unlucky|fortune|prosperity|wealth|auspicious|inauspicious)\b/i,
      /\b(predicts?|guarantees?)\s+(success|wealth|health|luck)\b/i,
      /\b(feng shui cure|metaphysical cure)\b/i,
    ],
    action: "Soften cosmological vocabulary and reinforce evidence labels beside cultural copy.",
  },
  {
    id: "visual_overpowering_trust_layer",
    patterns: [
      /\b(only|mostly|mainly)\s+(remember|noticed|saw)\s+(the\s+)?(render|image|visual|picture)\b/i,
      /\b(didn'?t|did not|do not|don't)\s+(notice|remember|see)\s+(the\s+)?(black[- ]state|bathroom|downwind|protection|rule)\b/i,
      /\b(render|image|visual)\s+(felt|looked)\s+(more important|like the answer|like proof)\b/i,
    ],
    action: "Reduce visual density and emphasize Black-state and bathroom-downwind trust-layer copy.",
  },
];

export function evaluateKillSignals(feedback: readonly KillSignalInput[]): KillSignalResult[] {
  return RULES.map((rule) => {
    const matches = feedback.filter((entry) => matchesAny(rule.patterns, entry.text)).length;
    const threshold = Math.floor(feedback.length / 5) + 1;
    return {
      id: rule.id,
      tripped: feedback.length > 0 && matches >= threshold,
      matches,
      total: feedback.length,
      threshold,
      action: rule.action,
    };
  });
}

function matchesAny(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
