"use client";

import { EVIDENCE_TIER_LABELS, type EvidenceTier } from "@/server/evidence";
import type { TokenId } from "@/server/rules/tokens";
import { TOKEN_DEFINITIONS } from "./TokenTray";
import styles from "./GhostPreview.module.css";

export interface GhostPreviewData {
  slot?: "A" | "B" | "C";
  role?: "recommended" | "current" | "alternate" | "candidate";
  tokenId: TokenId | null;
  allowed: boolean;
  code: "ok" | "black_state_blocked" | "shaft_buffer_out_of_range";
  preview: string;
  breathDelta: {
    label: string;
    tier: EvidenceTier;
  };
  breathCopy?: string;
  dampBandCopy?: string;
  alternatives: string[];
}

interface GhostPreviewProps {
  // Idle: nothing being dragged or selected.
  idle: boolean;
  // The data from /api/ghost-futures, undefined while loading.
  data: GhostPreviewData | GhostPreviewData[] | null;
  // True while a fetch is in flight.
  isLoading: boolean;
  // Most recent refusal copy to surface (e.g. on a failed drop).
  refusal: string | null;
  // Token currently armed (selected or dragging) for naming the card.
  armedTokenId: TokenId | null;
  // Count placed for the "x of 6" line.
  placedCount: number;
}

const TOKEN_NAME: Record<TokenId, string> = TOKEN_DEFINITIONS.reduce(
  (map, token) => {
    map[token.id] = token.name;
    return map;
  },
  {} as Record<TokenId, string>,
);

function formatRole(role: GhostPreviewData["role"]): string {
  if (role === "recommended") return "Recommended";
  if (role === "current") return "Current";
  if (role === "alternate") return "Alternate";
  return "Candidate";
}

export default function GhostPreview({
  idle,
  data,
  isLoading,
  refusal,
  armedTokenId,
  placedCount,
}: GhostPreviewProps) {
  // Refusal takes priority — Black-state copy is a designed surface, not an error.
  if (refusal) {
    return (
      <aside className={`${styles.card} ${styles.cardRefusal}`} aria-live="polite">
        <span className={styles.eyebrow}>The house refuses, calmly</span>
        <p className={styles.refusalCopy}>{refusal}</p>
        <p className={styles.refusalHint}>
          The token was returned to the tray. Try a different placement.
        </p>
      </aside>
    );
  }

  if (idle && !data) {
    return (
      <aside className={styles.card} aria-live="polite">
        <span className={styles.eyebrow}>Ghost future · preview</span>
        <p className={styles.idleCopy}>
          Pick a token, hover the plan, the home will tell you what changes.
        </p>
        <p className={styles.placementCount}>
          <span>{placedCount} of 6</span> tokens placed.
        </p>
      </aside>
    );
  }

  // Loading skeleton between hover events.
  if (!data && isLoading) {
    return (
      <aside className={styles.card} aria-live="polite">
        <span className={styles.eyebrow}>Reading the air</span>
        <p className={styles.idleCopy}>
          {armedTokenId ? `Listening for ${TOKEN_NAME[armedTokenId]}.` : "Listening."}
        </p>
      </aside>
    );
  }

  if (!data) return null;

  const futures = Array.isArray(data) ? data : [data];
  if (futures.length > 1) {
    return (
      <aside className={styles.card} aria-live="polite">
        <header className={styles.head}>
          <span className={styles.eyebrow}>Ghost Futures</span>
          <h3 className={styles.title}>Three quiet paths</h3>
        </header>
        <div className={styles.futureList}>
          {futures.map((future) => (
            <article
              key={future.slot ?? future.role ?? future.preview}
              className={`${styles.futureItem} ${!future.allowed ? styles.futureBlocked : ""}`}
            >
              <div className={styles.futureHead}>
                <span className={styles.futureSlot}>
                  {future.slot ? `${future.slot} · ${formatRole(future.role)}` : formatRole(future.role)}
                </span>
                <strong>{future.tokenId ? TOKEN_NAME[future.tokenId] : "Current home"}</strong>
              </div>
              <p className={styles.futureCopy}>{future.preview}</p>
              <dl className={styles.futureBands}>
                <div>
                  <dt>Breath</dt>
                  <dd>{future.breathCopy ?? "Physical effect: Not assessed."}</dd>
                </div>
                <div>
                  <dt>Damp</dt>
                  <dd>{future.dampBandCopy ?? "Humidity effect: Not assessed."}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <p className={styles.placementCount}>
          <span>{placedCount} of 6</span> tokens placed.
        </p>
      </aside>
    );
  }

  const current = futures[0];
  if (!current) return null;

  const tokenName = current.tokenId ? TOKEN_NAME[current.tokenId] : "Current home";
  const blocked = !current.allowed;

  return (
    <aside
      className={`${styles.card} ${blocked ? styles.cardBlocked : ""}`}
      aria-live="polite"
    >
      <header className={styles.head}>
        <span className={styles.eyebrow}>Ghost future · {tokenName}</span>
        <h3 className={styles.title}>
          {blocked ? "Not yet" : "The path opens"}
        </h3>
      </header>

      <p className={styles.lede}>{current.preview}</p>

      {!blocked ? (
        <>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Breath</span>
            <span className={styles.rowValue}>
              <span className={styles.bandUnchanged}>Not assessed</span>
              <span className={styles.rowDetail}>{current.breathCopy ?? current.breathDelta.label}</span>
            </span>
            <span className={styles.tierTag}>
              {EVIDENCE_TIER_LABELS[current.breathDelta.tier]}
            </span>
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Damp</span>
            <span className={styles.rowValue}>
              <span className={styles.bandUnchanged}>Not assessed</span>
              <span className={styles.rowDetail}>
                {current.dampBandCopy ?? "Humidity effect: Not assessed."}
              </span>
            </span>
            <span className={styles.tierTag}>
              {EVIDENCE_TIER_LABELS["heuristic_estimate"]}
            </span>
          </div>

          <p className={styles.placementCount}>
            <span>{placedCount} of 6</span> tokens placed. Drop to place.
          </p>
        </>
      ) : (
        <>
          {current.alternatives.length > 0 ? (
            <ul className={styles.altList}>
              {current.alternatives.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.placementCount}>
            <span>{placedCount} of 6</span> tokens placed. Token returns to the tray.
          </p>
        </>
      )}
    </aside>
  );
}
