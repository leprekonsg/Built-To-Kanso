import { EVIDENCE_TIER_LABELS } from "@/server/evidence";
import type { AntiCureReading } from "@/server/rules/antiCure";
import styles from "./AntiCureCard.module.css";

interface AntiCureCardProps {
  reading: AntiCureReading | null;
}

export default function AntiCureCard({ reading }: AntiCureCardProps) {
  if (!reading) return null;

  return (
    <section className={styles.card} aria-labelledby="anti-cure-eyebrow">
      <span id="anti-cure-eyebrow" className={styles.eyebrow}>
        Anti-cure
      </span>
      <p className={styles.recommendation}>{reading.recommendation}</p>
      <div className={styles.foot}>
        <span className={styles.room}>{reading.label}</span>
        <span className={styles.tier}>{EVIDENCE_TIER_LABELS[reading.tier]}</span>
      </div>
    </section>
  );
}
