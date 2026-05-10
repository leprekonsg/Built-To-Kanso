// PRODUCT.md Voice section — Cultural ships as default; Designer is opt-in.

export type VoiceMode = "cultural" | "designer";

export const DEFAULT_VOICE_MODE: VoiceMode = "cultural";

export const VOICE_MODES: readonly { id: VoiceMode; label: string }[] = [
  { id: "cultural", label: "Cultural" },
  { id: "designer", label: "Designer" },
];
