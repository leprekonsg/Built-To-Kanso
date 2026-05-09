"use client";

import { useId } from "react";
import {
  getTokenPersonalityProfile,
  type TokenId,
  type TokenPersonalityVariant,
} from "@/server/rules/tokens";
import styles from "./TokenTray.module.css";

export interface TokenDefinition {
  id: TokenId;
  initial: string;
  name: string;
  hint: string;
}

// Brand glyphs: serif initial in a circle. No amber fill at rest.
export const TOKEN_DEFINITIONS: ReadonlyArray<TokenDefinition> = [
  { id: "wind_gate", initial: "W", name: "Wind Gate", hint: "Open the cross-breeze." },
  { id: "soft_screen", initial: "S", name: "Soft Screen", hint: "Soften the entry rush." },
  { id: "wood_anchor", initial: "A", name: "Wood Anchor", hint: "Steady a corner." },
  { id: "solar_shield", initial: "L", name: "Solar Shield", hint: "Cool the west edge." },
  { id: "fan_anchor", initial: "F", name: "Fan Anchor", hint: "Lift marginal airflow." },
  { id: "shaft_buffer", initial: "B", name: "Shaft Buffer", hint: "Deflect the pipeshaft jet." },
];

interface TokenTrayProps {
  variant: TokenPersonalityVariant;
  selectedId: TokenId | null;
  remainingByToken: Record<TokenId, number>;
  onSelect: (id: TokenId | null) => void;
  onDragStart: (id: TokenId) => void;
  onDragEnd: () => void;
  disabled?: boolean;
}

export default function TokenTray({
  variant,
  selectedId,
  remainingByToken,
  onSelect,
  onDragStart,
  onDragEnd,
  disabled = false,
}: TokenTrayProps) {
  const headingId = useId();
  const profile = getTokenPersonalityProfile(variant);

  return (
    <div className={styles.tray} aria-labelledby={headingId}>
      <div className={styles.trayHead}>
        <span id={headingId} className={styles.eyebrow}>
          Token tray · six max
        </span>
        <p className={styles.helper}>
          Drag a token onto the plan, or click to select then click the plan to drop.
        </p>
        <p className={styles.variantCue}>{profile.materialCue}</p>
      </div>
      <ul className={styles.chipList} role="list">
        {TOKEN_DEFINITIONS.map((token) => {
          const remaining = remainingByToken[token.id] ?? 0;
          const isSelected = selectedId === token.id;
          const isDisabled = disabled || remaining <= 0;
          const hint = profile.tokenHints[token.id] ?? token.hint;

          return (
            <li key={token.id}>
              <button
                type="button"
                draggable={!isDisabled}
                aria-pressed={isSelected}
                aria-label={`${token.name}. ${hint}. ${remaining} of 6 remaining.`}
                disabled={isDisabled}
                className={`${styles.chip} ${isSelected ? styles.chipOn : ""}`}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(isSelected ? null : token.id);
                }}
                onDragStart={(event) => {
                  if (isDisabled) {
                    event.preventDefault();
                    return;
                  }
                  // Pass the tokenId through dataTransfer so PlanCanvas can read it on drop.
                  event.dataTransfer.setData("text/plain", token.id);
                  event.dataTransfer.effectAllowed = "copy";
                  onDragStart(token.id);
                }}
                onDragEnd={() => onDragEnd()}
              >
                <span className={styles.glyph} aria-hidden>
                  {token.initial}
                </span>
                <span className={styles.chipBody}>
                  <span className={styles.name}>{token.name}</span>
                  <span className={styles.hint}>{hint}</span>
                </span>
                <span className={styles.count} aria-hidden>
                  {remaining}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
