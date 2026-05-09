"use client";

import { useShallow } from "zustand/react/shallow";
import { useThresholdStore, tierForFloor, SCENARIOS } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import styles from "./threshold.module.css";

export default function ReadingPanel() {
  // Single shallow read of the four primitives we render.
  const { templateId, compassIndex, floor, scenarioId } = useThresholdStore(
    useShallow((s) => ({
      templateId: s.templateId,
      compassIndex: s.compassIndex,
      floor: s.floor,
      scenarioId: s.scenarioId,
    })),
  );

  const template = TEMPLATES.find((t) => t.id === templateId) ?? null;
  const tier = tierForFloor(floor);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? null;
  const angle = compassIndex * 15;

  const filled =
    Number(template !== null) +
    Number(scenario !== null) +
    1 + // compass always has a value
    1; // floor always has a value
  const pct = Math.round((filled / 4) * 100);

  return (
    <aside className={styles.reading} aria-label="Threshold summary">
      <header className={styles.readingHd}>
        <span className={styles.readingEyebrow}>The house is listening</span>
        <h3 className={styles.readingTitle}>Reading</h3>
        <div className={styles.readingMeter}>
          <span className={styles.readingMeterBar} style={{ width: `${pct}%` }} />
        </div>
      </header>

      <ul className={styles.readingList}>
        <ReadingRow
          label="Unit"
          value={template ? template.name : "— pick a unit"}
          dim={!template}
          sub={template ? `${template.rooms} · ${template.estate}` : undefined}
        />
        <ReadingRow
          label="Door facing"
          value={`${String(angle).padStart(3, "0")}°`}
          sub="Snap-to-24"
        />
        <ReadingRow
          label="Floor"
          value={`${floor}`}
          sub={tier.name}
        />
        <ReadingRow
          label="Scenario"
          value={scenario ? scenario.label : "— choose one"}
          dim={!scenario}
        />
      </ul>

      {template && (
        <div className={styles.readingNote}>
          <span className={styles.readingNoteEyebrow}>Pre-flight</span>
          <p className={styles.readingNoteBody}>
            Combined opening area at <strong>{template.openingPct}%</strong> of floor area —
            cross-ventilation <strong>{template.crossVent}</strong>. Pipeshaft marked at{" "}
            <strong>{template.pipeshaftRoom.toLowerCase()}</strong>; the Shaft Buffer token will
            surface in the Token Ritual.
          </p>
        </div>
      )}

      <p className={styles.readingFootnote}>
        We are kansō (簡素) — pared simplicity — applied to Form-School geomancy. Not kasō.
      </p>
    </aside>
  );
}

interface RowProps {
  label: string;
  value: string;
  sub?: string;
  dim?: boolean;
}

function ReadingRow({ label, value, sub, dim }: RowProps) {
  return (
    <li className={`${styles.readingRow} ${dim ? styles.readingRowDim : ""}`}>
      <span className={styles.readingRowLabel}>{label}</span>
      <span className={styles.readingRowValue}>{value}</span>
      {sub && <span className={styles.readingRowSub}>{sub}</span>}
    </li>
  );
}
