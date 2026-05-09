"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { type ReactNode, useMemo, useState } from "react";
import { EVIDENCE_TIER_LABELS, type EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
import { recommendAntiCure } from "@/server/rules/antiCure";
import { evaluateKansoReserve } from "@/server/rules/kansoReserve";
import type { TokenPlacement } from "@/server/rules/tokens";
import { runScoutPass, type DampRiskBand, type DampRiskReading } from "@/server/scout/scout";
import { useVoiceStore } from "@/lib/voice";
import AntiCureCard from "./AntiCureCard";
import ChangelogCard from "./ChangelogCard";
import KansoReserveCard from "./KansoReserveCard";
import TokenStudio from "./TokenStudio";
import type { PlacedToken } from "./PlanCanvas";
import styles from "../bones.module.css";

const DAMP_DISCLAIMER =
  "Damp Risk is a layout-based comfort estimate. Not a humidity measurement, not a mould diagnosis, not a certified IAQ assessment.";
const LIVE_STUDIO_WIND_MPS = 2.4;
const LiveStudio = dynamic(() => import("@/components/studio/LiveStudio").then((mod) => mod.LiveStudio), {
  ssr: false,
});

interface BonesInteractiveProps {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
  sideIntro: ReactNode;
  children: ReactNode;
}

export default function BonesInteractive({
  plan,
  compassDeg,
  floor,
  sideIntro,
  children,
}: BonesInteractiveProps) {
  const [placed, setPlaced] = useState<PlacedToken[]>([]);
  const mode = useVoiceStore((state) => state.mode);
  const placements = useMemo<TokenPlacement[]>(() => toTokenPlacements(placed), [placed]);
  const scout = useMemo(
    () => runScoutPass({ plan, compassDeg, floor, tokenPlacements: placements }),
    [plan, compassDeg, floor, placements],
  );
  const dampSummary = summarizeDampRisk(scout.dampRisk);
  const kansoReserve = useMemo(() => evaluateKansoReserve(plan, placements), [plan, placements]);
  const antiCure = useMemo(() => recommendAntiCure(plan, scout), [plan, scout]);
  const weatherTrials = useMemo(() => buildWeatherTrials(plan.openingAreaPct), [plan.openingAreaPct]);
  const calmChecks = useMemo(() => buildCalmChecks(scout, dampSummary?.worst.band ?? "clear"), [scout, dampSummary]);
  const designerDetails = useMemo(
    () => buildDesignerDetails(plan, compassDeg, floor, placements.length),
    [plan, compassDeg, floor, placements.length],
  );

  return (
    <>
      <section className={styles.shell}>
        {children}
        <aside className={styles.sideStack}>
          {sideIntro}
          <section className={styles.panel}>
            <span className={styles.eyebrow}>What the home is asking</span>
            <ul className={styles.askingList}>
              {scout.askingPoints.map((point) => (
                <li key={point.id}>
                  <span className={styles.askingHead}>
                    <span className={styles.askingScout}>{formatScout(point.scout)}</span>
                    <span className={styles.askingTier}>{formatTier(point.tier)}</span>
                  </span>
                  {mode === "designer" ? point.designerDetail : point.copy}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
            <span className={styles.eyebrow}>Damp reading</span>
            {dampSummary ? (
              <div className={styles.dampCard}>
                <span
                  className={`${styles.statusDot} ${
                    dampSummary.worst.band === "high"
                      ? styles.statusHigh
                      : dampSummary.worst.band === "watch"
                        ? styles.statusWatch
                        : styles.statusClear
                  }`}
                  aria-hidden
                />
                <div>
                  <strong>{formatRoom(dampSummary.worst.roomId)}</strong>
                  <p>
                    {formatDampBand(dampSummary.worst.band)} Damp Risk. {dampSummary.worst.recommendation}
                  </p>
                  <span>
                  {dampSummary.watchOrHighCount > 0
                    ? `${dampSummary.watchOrHighCount} bedroom${dampSummary.watchOrHighCount === 1 ? "" : "s"} ${dampSummary.watchOrHighCount === 1 ? "shares" : "share"} this damp recommendation.`
                    : "All bedrooms are Clear after current buffers."}
                  </span>
                </div>
              </div>
            ) : null}
            <p className={styles.dampDisclaimer}>{DAMP_DISCLAIMER}</p>
          </section>

          <KansoReserveCard reading={kansoReserve} />
          <AntiCureCard reading={antiCure} />
          <ChangelogCard plan={plan} placements={placements} />

          <div className={styles.actionRow}>
            <Link href="/threshold" className={styles.secondaryLink}>
              Adjust inputs
            </Link>
            <span>Next: see how air moves</span>
          </div>
        </aside>
      </section>

      <TokenStudio
        plan={plan}
        compassDeg={compassDeg}
        floor={floor}
        placed={placed}
        onPlacedChange={setPlaced}
      />

      <section className={styles.liveSection} role="region" aria-label="LiveStudio">
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>LiveStudio</span>
          <h2 id="live-studio-title">Air, drawn from the locked plan.</h2>
          <p>
            Environmental material system: sumi streamlines first, material polish second. The plan remains the source of truth.
          </p>
        </div>
        <div className={styles.liveGrid}>
          <LiveStudio
            plan={plan}
            compassDeg={compassDeg}
            ambientWindMps={LIVE_STUDIO_WIND_MPS}
            prebakedField={null}
          />
          <section className={styles.panel} role="region" aria-label="Weather Trial">
            <span className={styles.eyebrow}>Weather Trial</span>
            <h3 id="weather-trial-title" className={styles.panelTitle}>Three stress conditions</h3>
            <ul className={styles.trialList}>
              {weatherTrials.map((trial) => (
                <li key={trial.name}>
                  <strong>{trial.name}</strong>
                  <span>{trial.copy}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>

      <section
        className={styles.calmSection}
        role="region"
        aria-label="Glow, Quiet, and Damp checks"
      >
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>Glow / Quiet / Damp</span>
          <h2 id="calm-checks-title">Three checks, no alarm.</h2>
        </div>
        <div className={styles.checkGrid}>
          {calmChecks.map((check) => (
            <article key={check.name} className={styles.checkPanel}>
              <span className={styles.checkName}>{check.name}</span>
              <p>{check.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {mode === "designer" ? (
        <section className={styles.designerSection} aria-labelledby="designer-details-title">
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Designer mode</span>
            <h2 id="designer-details-title">Materials, audit, quantities.</h2>
          </div>
          <dl className={styles.detailGrid}>
            {designerDetails.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
                <span>{detail.note}</span>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
}

function toTokenPlacements(tokens: ReadonlyArray<PlacedToken>): TokenPlacement[] {
  return tokens.map(({ tokenId, point }) => ({ tokenId, point }));
}

function formatScout(scout: "breath" | "glow" | "quiet" | "damp"): string {
  const labels = {
    breath: "Air",
    glow: "Heat",
    quiet: "Quiet",
    damp: "Damp",
  };
  return labels[scout];
}

function formatTier(tier: EvidenceTier): string {
  return EVIDENCE_TIER_LABELS[tier];
}

function summarizeDampRisk(readings: DampRiskReading[]) {
  if (readings.length === 0) return null;
  const worst = readings.reduce((currentWorst, reading) =>
    rankDampBand(reading.band) > rankDampBand(currentWorst.band) ? reading : currentWorst,
  );
  return {
    worst,
    watchOrHighCount: readings.filter((reading) => reading.band !== "clear").length,
  };
}

function formatDampBand(band: DampRiskBand): string {
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function rankDampBand(band: DampRiskBand): number {
  return { clear: 0, watch: 1, high: 2 }[band];
}

function formatRoom(roomId: string): string {
  return roomId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildWeatherTrials(openingAreaPct: number) {
  const openingCopy =
    openingAreaPct >= 12 ? "cross-vent corridor can stay open" : "Fan Anchor likely before comfort improves";
  return [
    {
      name: "NE monsoon",
      copy: `Cooler diagonal breeze. ${openingCopy}.`,
    },
    {
      name: "SW monsoon",
      copy: "Humid return wind. Keep the pipeshaft buffer legible.",
    },
    {
      name: "West-sun still air",
      copy: "Late heat with little movement. Glow check stays paired with shade, not panic.",
    },
  ];
}

function buildCalmChecks(scout: ReturnType<typeof runScoutPass>, dampBand: DampRiskBand) {
  const glowRaised = scout.askingPoints.some((point) => point.scout === "glow");
  return [
    {
      name: "Glow",
      copy: glowRaised ? "West edge is carrying heat. Shade first, heavy objects second." : "No west-edge heat ask on this compass read.",
    },
    {
      name: "Quiet",
      copy: "Leave one anti-cure corner unbuilt for ninety days, then listen again.",
    },
    {
      name: "Damp",
      copy:
        dampBand === "high"
          ? "High band receives one paired action: Shaft Buffer, bed move, or exhaust timer."
          : `${formatDampBand(dampBand)} band. Keep the recommendation visible and modest.`,
    },
  ];
}

function buildDesignerDetails(plan: PlanGeometry, compassDeg: number, floor: number, placementCount: number) {
  const achEstimate = Math.max(1.2, Math.min(4.8, plan.openingAreaPct / 4 + placementCount * 0.2)).toFixed(1);
  const shgc = isWestFacing(plan.westSunFacadeDeg, compassDeg) ? "SHGC <= 0.30 recommended" : "SHGC watch only";
  return [
    {
      label: "Material preset",
      value: "monsoon_atelier_default",
      note: "sumi stream, sunlit dust, plant lean",
    },
    {
      label: "Audit overlay",
      value: `${plan.openingAreaPct}% openings, ${floor}F`,
      note: `${achEstimate} ACH estimate, ${shgc}`,
    },
    {
      label: "Quantity readout",
      value: `${plan.rooms.length} rooms, ${plan.fixedElements.length} fixed elements`,
      note: `${placementCount} token${placementCount === 1 ? "" : "s"} placed, compliance geometry locked`,
    },
  ];
}

function isWestFacing(facadeDeg: number, compassDeg: number): boolean {
  return Math.abs(((facadeDeg - compassDeg + 540) % 360) - 180) <= 45;
}
