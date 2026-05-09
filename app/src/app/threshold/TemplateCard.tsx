"use client";

import { useThresholdStore } from "@/lib/store";
import type { HdbTemplate } from "@/lib/templates";
import styles from "./threshold.module.css";

interface Props {
  template: HdbTemplate;
}

export default function TemplateCard({ template }: Props) {
  const selected = useThresholdStore((s) => s.templateId === template.id);
  const setTemplate = useThresholdStore((s) => s.setTemplate);

  return (
    <button
      type="button"
      className={`${styles.tplCard} ${selected ? styles.tplCardOn : ""}`}
      aria-pressed={selected}
      onClick={() => setTemplate(template.id)}
    >
      <div className={styles.tplThumb}>
        <PlanThumb id={template.id} />
      </div>
      <div className={styles.tplBody}>
        <span className={styles.tplEra}>{template.estate}</span>
        <span className={styles.tplName}>{template.name}</span>
        <span className={styles.tplRooms}>
          {template.rooms} · {template.floorAreaSqm} m²
        </span>
        <span
          className={`${styles.tplBadge} ${
            template.crossVent === "capable" ? styles.badgeGood : styles.badgeWarn
          }`}
        >
          Cross-vent · {template.crossVent}
        </span>
      </div>
      <span className={styles.tplDot} aria-hidden />
    </button>
  );
}

// Pure-SVG plan glyphs. Stylized, not architecturally precise — a calm icon
// not a CAD plate. Real plan-geometry.json arrives in Stage 2.
function PlanThumb({ id }: { id: HdbTemplate["id"] }) {
  if (id === "tampines-greenweave") {
    return (
      <svg viewBox="0 0 120 80" className={styles.planSvg} aria-hidden>
        <rect x="6" y="6" width="108" height="68" className={styles.planWall} />
        <line x1="6" y1="42" x2="74" y2="42" className={styles.planWall} />
        <line x1="74" y1="6" x2="74" y2="74" className={styles.planWall} />
        <line x1="40" y1="6" x2="40" y2="42" className={styles.planWall} />
        <line x1="74" y1="38" x2="86" y2="38" className={styles.planDoor} />
        <circle cx="100" cy="14" r="2" className={styles.planShaft} />
      </svg>
    );
  }
  if (id === "tengah-5room") {
    return (
      <svg viewBox="0 0 120 80" className={styles.planSvg} aria-hidden>
        <rect x="6" y="6" width="108" height="68" className={styles.planWall} />
        <line x1="6" y1="48" x2="62" y2="48" className={styles.planWall} />
        <line x1="62" y1="6" x2="62" y2="74" className={styles.planWall} />
        <line x1="62" y1="36" x2="114" y2="36" className={styles.planWall} />
        <line x1="48" y1="48" x2="62" y2="48" className={styles.planDoor} />
        <circle cx="14" cy="14" r="2" className={styles.planShaft} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 80" className={styles.planSvg} aria-hidden>
      <rect x="6" y="6" width="108" height="68" className={styles.planWall} />
      <line x1="50" y1="6" x2="50" y2="74" className={styles.planWall} />
      <line x1="50" y1="40" x2="114" y2="40" className={styles.planWall} />
      <line x1="6" y1="46" x2="50" y2="46" className={styles.planWall} />
      <line x1="20" y1="74" x2="34" y2="74" className={styles.planDoor} />
      <circle cx="106" cy="68" r="2" className={styles.planShaft} />
    </svg>
  );
}
