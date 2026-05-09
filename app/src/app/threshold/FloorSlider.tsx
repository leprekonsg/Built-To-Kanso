"use client";

import { useThresholdStore, FLOOR_TIERS, tierForFloor } from "@/lib/store";
import styles from "./threshold.module.css";

const MIN = 1;
const MAX = 50;

export default function FloorSlider() {
  const floor = useThresholdStore((s) => s.floor);
  const setFloor = useThresholdStore((s) => s.setFloor);
  const tier = tierForFloor(floor);
  const pct = ((floor - MIN) / (MAX - MIN)) * 100;

  return (
    <div className={styles.floorWrap}>
      <div className={styles.floorReadout}>
        <span className={styles.floorBig}>
          <span className={styles.floorBigPre}>floor</span>
          {floor}
        </span>
        <span className={`${styles.floorTierBadge} ${tierClass(tier.name)}`}>
          {tier.name}
        </span>
      </div>

      <div className={styles.floorTrackWrap}>
        <div className={styles.floorTrack}>
          {FLOOR_TIERS.map((t) => {
            const start = ((t.range[0] - MIN) / (MAX - MIN)) * 100;
            const end = ((t.range[1] - MIN) / (MAX - MIN)) * 100;
            return (
              <span
                key={t.name}
                className={`${styles.floorTierSeg} ${tierClass(t.name)}`}
                style={{ left: `${start}%`, width: `${end - start}%` }}
                aria-hidden
              />
            );
          })}
          <span className={styles.floorFill} style={{ width: `${pct}%` }} aria-hidden />
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={1}
          value={floor}
          onChange={(e) => setFloor(Number(e.currentTarget.value))}
          className={styles.floorRange}
          aria-label="Floor level"
        />
        <div className={styles.floorScale} aria-hidden>
          {[1, 8, 15, 30, 50].map((n) => (
            <span key={n} style={{ left: `${((n - MIN) / (MAX - MIN)) * 100}%` }}>
              {n}
            </span>
          ))}
        </div>
      </div>

      <p className={styles.floorCopy}>{tier.copy}</p>
    </div>
  );
}

function tierClass(name: string): string {
  if (name === "Ground Stagnation") return styles.tierGround;
  if (name === "Transition") return styles.tierTransition;
  if (name === "Golden Floors") return styles.tierGolden;
  return styles.tierTurbulent;
}
