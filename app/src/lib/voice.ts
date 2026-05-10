"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_VOICE_MODE, type VoiceMode } from "./voiceModes";
export { DEFAULT_VOICE_MODE, VOICE_MODES, type VoiceMode } from "./voiceModes";

// PRODUCT.md Voice section — two registers ride the same physics.
// Cultural (default): "the house is listening." Calm, no numerics.
// Designer: same calm + ACH, RT60, SHGC, opening %. Damp Risk stays band-only.

export interface VoiceState {
  mode: VoiceMode;
  setMode: (mode: VoiceMode) => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      mode: DEFAULT_VOICE_MODE,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "btk:voice-mode",
      // Hackathon sessions wipe on browser close; SSR-safe accessor.
      storage: createJSONStorage(() => sessionStorage),
      // Only the mode is persisted; setters rehydrate from the closure.
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
