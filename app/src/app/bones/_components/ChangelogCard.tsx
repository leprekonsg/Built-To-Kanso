"use client";

import { useMemo } from "react";
import type { PlanGeometry } from "@/server/geometry/types";
import { generateHouseChangelog, type HouseChangelogResult } from "@/server/rules/changelog";
import type { TokenPlacement } from "@/server/rules/tokens";
import styles from "./ChangelogCard.module.css";

interface ChangelogCardProps {
  plan: PlanGeometry;
  placements: TokenPlacement[];
}

export default function ChangelogCard({ plan, placements }: ChangelogCardProps) {
  const result = useMemo<HouseChangelogResult>(
    () => generateHouseChangelog({ plan, placements }),
    [plan, placements],
  );
  const lines = result.lines.slice(0, 5);

  if (lines.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="changelog-eyebrow">
      <span id="changelog-eyebrow" className={styles.eyebrow}>
        Changelog
      </span>
      <ul className={styles.list}>
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className={styles.line}>
            {formatReceiptLine(line)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatReceiptLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
