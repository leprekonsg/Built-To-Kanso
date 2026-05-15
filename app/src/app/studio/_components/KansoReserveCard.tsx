import { EVIDENCE_TIER_LABELS } from "@/server/evidence";
import type { KansoReserveReading, KansoReserveStatus } from "@/server/rules/kansoReserve";
import styles from "./KansoReserveCard.module.css";

interface KansoReserveCardProps {
  reading: KansoReserveReading;
}

export default function KansoReserveCard({ reading }: KansoReserveCardProps) {
  const dotClass = dotClassFor(reading.status);

  return (
    <section className={styles.card} aria-labelledby="kanso-reserve-eyebrow">
      <div className={styles.head}>
        <span id="kanso-reserve-eyebrow" className={styles.eyebrow}>
          Reserve
        </span>
        <span className={`${styles.statusDot} ${dotClass}`} aria-hidden />
      </div>
      <p className={styles.value}>
        {reading.reservePct}
        <span className={styles.unit}>% empty</span>
      </p>
      <p className={styles.body}>{reading.recommendation}</p>
      <span className={styles.tier}>{EVIDENCE_TIER_LABELS[reading.tier]}</span>
    </section>
  );
}

function dotClassFor(status: KansoReserveStatus): string {
  if (status === "healthy") return styles.dotHealthy;
  if (status === "watch") return styles.dotWatch;
  return styles.dotCrowded;
}
