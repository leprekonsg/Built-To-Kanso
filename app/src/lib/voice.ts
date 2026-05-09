"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// PRODUCT.md Voice section — two registers ride the same physics.
// Cultural (default): "the house is listening." Calm, no numerics.
// Designer: same calm + ACH, RT60, SHGC, opening %. Damp Risk stays band-only.

export type VoiceMode = "cultural" | "designer";

export interface VoiceState {
  mode: VoiceMode;
  setMode: (mode: VoiceMode) => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      mode: "cultural",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "btk:voice-mode",
      // localStorage is the only persistence target; SSR-safe accessor.
      storage: createJSONStorage(() => localStorage),
      // Only the mode is persisted; setters rehydrate from the closure.
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
