"use client";

import { useCallback, useId, useRef } from "react";
import { useVoiceStore, type VoiceMode } from "@/lib/voice";
import styles from "./VoiceToggle.module.css";

// PRODUCT.md: Cultural is default; Designer adds quantities to the same calm.
// Visual register is hairline + ink-fill on selected. No amber.
const MODES: { id: VoiceMode; label: string }[] = [
  { id: "cultural", label: "Cultural" },
  { id: "designer", label: "Designer" },
];

export default function VoiceToggle() {
  // Subscribe to mode in render; setMode is module-stable (zustand singleton).
  const mode = useVoiceStore((s) => s.mode);
  const setMode = useVoiceStore((s) => s.setMode);
  const groupId = useId();
  const tabRefs = useRef<Record<VoiceMode, HTMLButtonElement | null>>({
    cultural: null,
    designer: null,
  });

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, current: VoiceMode) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const idx = MODES.findIndex((m) => m.id === current);
      const nextIdx =
        e.key === "ArrowRight"
          ? (idx + 1) % MODES.length
          : (idx - 1 + MODES.length) % MODES.length;
      const next = MODES[nextIdx].id;
      setMode(next);
      tabRefs.current[next]?.focus();
    },
    [setMode],
  );

  return (
    <div
      className={styles.toggle}
      role="tablist"
      aria-label="Voice mode"
      aria-orientation="horizontal"
    >
      {MODES.map((m) => {
        const selected = mode === m.id;
        return (
          <button
            key={m.id}
            ref={(el) => {
              tabRefs.current[m.id] = el;
            }}
            type="button"
            role="tab"
            id={`${groupId}-${m.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.tabSelected : ""}`}
            onClick={() => setMode(m.id)}
            onKeyDown={(e) => onKeyDown(e, m.id)}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
