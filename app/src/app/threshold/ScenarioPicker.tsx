"use client";

import { useThresholdStore, SCENARIOS } from "@/lib/store";
import styles from "./threshold.module.css";

export default function ScenarioPicker() {
  const scenarioId = useThresholdStore((s) => s.scenarioId);
  const setScenario = useThresholdStore((s) => s.setScenario);

  return (
    <div className={styles.scenarioGrid} role="radiogroup" aria-label="Common Household Scenario">
      {SCENARIOS.map((s) => {
        const on = scenarioId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`${styles.scenarioChip} ${on ? styles.scenarioChipOn : ""}`}
            onClick={() => setScenario(s.id)}
          >
            <span className={styles.scenarioLabel}>{s.label}</span>
            <span className={styles.scenarioHint}>{s.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
