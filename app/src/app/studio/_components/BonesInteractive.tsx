"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { UrlObject } from "url";
import { EVIDENCE_TIER_LABELS, type EvidenceTier } from "@/server/evidence";
import type { PlanGeometry } from "@/server/geometry/types";
import { recommendAntiCure } from "@/server/rules/antiCure";
import { evaluateGlow } from "@/server/rules/glow";
import { evaluateKansoReserve } from "@/server/rules/kansoReserve";
import { evaluateQuiet } from "@/server/rules/quiet";
import type { TokenPlacement } from "@/server/rules/tokens";
import { runScoutPass, type DampRiskBand, type DampRiskReading } from "@/server/scout/scout";
import type { WeatherTrialConditionId } from "@/server/simulation/types";
import { useVoiceStore, type VoiceMode } from "@/lib/voice";
import {
  DEFAULT_DESIGNER_CONTROLS,
  clampPercent,
  persistDesignerControls,
  readPersistedDesignerControls,
  type DesignerMaterialControls,
  type DesignerPreset,
} from "@/lib/designerControls";
import AntiCureCard from "./AntiCureCard";
import ChangelogCard from "./ChangelogCard";
import KansoReserveCard from "./KansoReserveCard";
import PlanEditor from "./PlanEditor";
import TokenStudio from "./TokenStudio";
import type { PlacedToken } from "./PlanCanvas";
import ResonanceBanner from "@/components/resonance/ResonanceBanner";
import styles from "../studio.module.css";

const DAMP_DISCLAIMER =
  "Humidity has not been assessed. Use measured indoor humidity and site observations before drawing a damp or mould conclusion.";
// Brief Section 15, item 22: a 2-3-second on-demand stress trial. Long enough
// for the field re-fetch to land and the eye to register the new pattern.
const WEATHER_TRIAL_DURATION_MS = 2600;
const WEATHER_TRIAL_BUTTONS: ReadonlyArray<{
  id: WeatherTrialConditionId;
  name: string;
  copy: string;
}> = [
  {
    id: "west_sun_1720",
    name: "West Sun 17:20",
    copy: "Late heat, slow air. Glow check stays paired with shade.",
  },
  {
    id: "highway_night",
    name: "Highway Night",
    copy: "Quiet hours, modest pull. Surfaces still settle.",
  },
  {
    id: "ne_monsoon_wind",
    name: "NE Monsoon Wind",
    copy: "Cooler diagonal breeze. Cross-vent reads at tilt.",
  },
];
const LiveStudio = dynamic(() => import("@/components/studio/LiveStudio").then((mod) => mod.LiveStudio), {
  ssr: false,
});

// Brief Section 5.2 line 124. Order is the brief's: visibility, density,
// turbulence, softness, velocity-to-width, stagnation threshold, texture scale.
// Labels mirror the brief's vocabulary so the panel reads like the spec.
type DesignerSliderKey = Exclude<keyof DesignerMaterialControls, "preset">;
const DESIGNER_SLIDER_FIELDS: ReadonlyArray<{ key: DesignerSliderKey; label: string }> = [
  { key: "visibility", label: "Wind Visibility" },
  { key: "density", label: "Density" },
  { key: "turbulence", label: "Turbulence" },
  { key: "softness", label: "Softness" },
  { key: "velocityWidthMod", label: "Velocity-to-width modulation" },
  { key: "stagnationOpacityThreshold", label: "Stagnation opacity threshold" },
  { key: "textureScale", label: "Texture scale" },
];

interface BonesInteractiveProps {
  plan: PlanGeometry;
  geometryContentHash: string;
  geometryReleaseEligible: boolean;
  compassDeg: number;
  floor: number;
  scenario?: string;
  sideIntro: ReactNode;
  children: ReactNode;
}

export default function BonesInteractive({
  plan,
  geometryContentHash,
  geometryReleaseEligible,
  compassDeg,
  floor,
  scenario,
  sideIntro,
  children,
}: BonesInteractiveProps) {
  const [placed, setPlaced] = useState<PlacedToken[]>([]);
  // Designer controls hydrate from sessionStorage on mount via the effect below.
  // Initial state stays at defaults so SSR and the first client paint match,
  // avoiding hydration mismatch warnings.
  const [designerControls, setDesignerControls] = useState<DesignerMaterialControls>(
    DEFAULT_DESIGNER_CONTROLS,
  );
  // Two-step gate so the persistence effect only fires after the hydration
  // re-render has landed. Setting hydrated as state (not a ref) forces the
  // persist effect to wait for the second render where designerControls
  // already reflects the persisted value.
  const [designerHydrated, setDesignerHydrated] = useState(false);
  const [activeTrial, setActiveTrial] = useState<WeatherTrialConditionId | null>(null);
  const trialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mode = useVoiceStore((state) => state.mode);
  const placements = useMemo<TokenPlacement[]>(() => toTokenPlacements(placed), [placed]);
  const activeTrialMeta = useMemo(
    () => WEATHER_TRIAL_BUTTONS.find((trial) => trial.id === activeTrial) ?? null,
    [activeTrial],
  );

  // Trial auto-revert. The button click sets activeTrial; this effect schedules
  // the revert and cancels any pending revert if the user starts a new trial.
  useEffect(() => {
    if (!activeTrial) return;
    trialTimerRef.current = setTimeout(() => setActiveTrial(null), WEATHER_TRIAL_DURATION_MS);
    return () => {
      if (trialTimerRef.current) clearTimeout(trialTimerRef.current);
    };
  }, [activeTrial]);

  // Hydrate Designer controls from sessionStorage once on mount. ID firms tune
  // the studio once and expect their preset + slider positions to stick across
  // sessions. Hydration runs after first paint to avoid SSR mismatch.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const persisted = readPersistedDesignerControls();
      if (persisted) setDesignerControls(persisted);
      setDesignerHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Persist Designer controls on every change *after* hydration. Gating on
  // designerHydrated (state, not ref) means this effect waits one render past
  // hydration so the value being persisted is the user's, not the default
  // that was on screen before hydration completed.
  useEffect(() => {
    if (!designerHydrated) return;
    persistDesignerControls(designerControls);
  }, [designerHydrated, designerControls]);

  const setDesignerField = <K extends keyof DesignerMaterialControls>(
    key: K,
    value: DesignerMaterialControls[K],
  ) => setDesignerControls((prev) => ({ ...prev, [key]: value }));
  const scout = useMemo(
    () => runScoutPass({ plan, compassDeg, floor, tokenPlacements: placements }),
    [plan, compassDeg, floor, placements],
  );
  const dampSummary = summarizeDampRisk(scout.dampRisk);
  const kansoReserve = useMemo(() => evaluateKansoReserve(plan, placements), [plan, placements]);
  const antiCure = useMemo(() => recommendAntiCure(plan, scout), [plan, scout]);
  const glowReading = useMemo(() => evaluateGlow({ plan, compassDeg, floor }), [plan, compassDeg, floor]);
  const quietReading = useMemo(() => evaluateQuiet({ plan, floor }), [plan, floor]);
  const proofHref = useMemo(
    () => recommendationProofHref(plan.templateId, compassDeg, floor, scenario),
    [plan.templateId, compassDeg, floor, scenario],
  );
  const calmChecks = useMemo(
    () => buildCalmChecks(glowReading, quietReading, dampSummary?.worst.band ?? "not_assessed", mode, plan),
    [glowReading, quietReading, dampSummary, mode, plan],
  );
  const designerDetails = useMemo(
    () => buildDesignerDetails(plan, compassDeg, floor, placements.length, designerControls),
    [plan, compassDeg, floor, placements.length, designerControls],
  );

  return (
    <>
      <section className={styles.shell}>
        {children}
        <aside className={styles.sideStack}>
          {sideIntro}
          <ResonanceBanner plan={plan} floor={floor} />
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

          <section className={styles.panel} aria-label="Damp reading">
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
                  <span className={styles.dampHead}>
                    <strong>{formatRoom(dampSummary.worst.roomId)}</strong>
                    <span className={styles.dampTier}>{formatTier(dampSummary.worst.tier)}</span>
                  </span>
                  <p>
                    {formatDampBand(dampSummary.worst.band)} Damp Risk. {dampSummary.worst.recommendation}
                  </p>
                  <span>
                  {dampSummary.assessedCount > 0
                    ? `${dampSummary.assessedCount} bedroom${dampSummary.assessedCount === 1 ? " has" : "s have"} an assessed band.`
                    : "No bedroom has an assessed humidity outcome."}
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
            <Link href={proofHref} className={styles.secondaryLink}>
              Recommendation proof
            </Link>
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
      <PlanEditor plan={plan} />

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
            geometryContentHash={geometryContentHash}
            geometryReleaseEligible={geometryReleaseEligible}
            operatingScenario={scenario}
            compassDeg={compassDeg}
            floor={floor}
            tokenPlacements={placements}
            prebakedField={null}
            weatherTrial={activeTrial}
            designerControls={mode === "designer" ? designerControls : undefined}
          />
          <section className={styles.panel} role="region" aria-label="Weather Trial">
            <span className={styles.eyebrow}>Weather Trial</span>
            <h3 id="weather-trial-title" className={styles.panelTitle}>Three stress conditions</h3>
            <p className={styles.smallCopy}>
              Tap one to feel a few seconds of weather. The studio reverts on its own.
            </p>
            <p className={styles.trialStatus} data-testid="weather-trial-status" aria-live="polite">
              {activeTrialMeta ? `Running: ${activeTrialMeta.name}` : "Baseline monsoon"}
            </p>
            <ul className={styles.trialList}>
              {WEATHER_TRIAL_BUTTONS.map((trial) => {
                const isActive = activeTrial === trial.id;
                return (
                  <li key={trial.id}>
                    <button
                      type="button"
                      data-testid={`weather-trial-${trial.id}`}
                      className={`${styles.trialButton} ${isActive ? styles.trialButtonActive : ""}`}
                      onClick={() => setActiveTrial(trial.id)}
                      aria-pressed={isActive}
                    >
                      <strong>{trial.name}</strong>
                      <span>{trial.copy}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={styles.smallCopy}>
              Baseline carry: <strong>{baselineCarryCopy(plan.openingAreaPct)}</strong>
            </p>
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
              <span className={styles.checkHead}>
                <span className={styles.checkName}>{check.name}</span>
                <span className={styles.checkTier}>{formatTier(check.tier)}</span>
              </span>
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
          <section
            className={styles.designerControls}
            role="region"
            aria-label="Designer material controls"
            data-testid="designer-controls"
          >
            <label>
              <span>Material preset</span>
              <select
                aria-label="Material preset"
                data-testid="designer-control-preset"
                value={designerControls.preset}
                onChange={(event) =>
                  setDesignerField("preset", event.currentTarget.value as DesignerPreset)
                }
              >
                <option value="monsoon_atelier_default">monsoon_atelier_default</option>
                <option value="sumi_ink">sumi_ink</option>
                <option value="sunlit_dust">sunlit_dust</option>
                <option value="audit_lic">audit_lic</option>
              </select>
            </label>
            {DESIGNER_SLIDER_FIELDS.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label} <strong>{designerControls[field.key]}%</strong>
                </span>
                <input
                  aria-label={field.label}
                  data-testid={`designer-control-${field.key}`}
                  type="range"
                  min="0"
                  max="100"
                  value={designerControls[field.key]}
                  onChange={(event) =>
                    setDesignerField(field.key, clampPercent(event.currentTarget.value))
                  }
                />
              </label>
            ))}
          </section>
          <section
            className={styles.lifeProof}
            role="region"
            aria-label="Life Sketch proof"
            data-testid="life-sketch-proof"
          >
            <span className={styles.eyebrow}>Life Sketch proof</span>
            <div className={styles.lifeProofGrid}>
              <figure>
                <img
                  src={`/life-anchors/${plan.templateId}/anchor.png`}
                  alt={`${plan.templateId} camera-view greybox anchor`}
                />
                <figcaption>Image 1: camera locked</figcaption>
              </figure>
              <figure>
                <img
                  src={`/plan-sketches/${plan.templateId}/plan.png`}
                  alt={`${plan.templateId} top-down topology proof`}
                />
                <figcaption>Image 2: topology only</figcaption>
              </figure>
            </div>
          </section>
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

function recommendationProofHref(
  templateId: PlanGeometry["templateId"],
  compassDeg: number,
  floor: number,
  scenario: string | undefined,
): UrlObject {
  return {
    pathname: "/recommendation-proof",
    query: {
      template: templateId,
      compass: String(compassDeg),
      floor: String(floor),
      ...(scenario ? { scenario } : {}),
    },
  };
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
    assessedCount: readings.filter((reading) => reading.band !== "not_assessed").length,
  };
}

function formatDampBand(band: DampRiskBand): string {
  if (band === "not_assessed") return "Not assessed";
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function rankDampBand(band: DampRiskBand): number {
  return { not_assessed: -1, clear: 0, watch: 1, high: 2 }[band];
}

function formatRoom(roomId: string): string {
  return roomId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function baselineCarryCopy(openingAreaPct: number): string {
  return openingAreaPct >= 12
    ? "cross-vent corridor can stay open"
    : "Fan Anchor likely before comfort improves";
}

function buildCalmChecks(
  glow: ReturnType<typeof evaluateGlow>,
  quiet: ReturnType<typeof evaluateQuiet>,
  dampBand: DampRiskBand,
  mode: VoiceMode,
  plan: PlanGeometry,
) {
  const quietBase = mode === "designer" ? quiet.designerSummary : quiet.culturalSummary;
  const siteNote = formatSiteContextNote(plan, quiet.facadeBaselineDba);
  const quietCopy = mode === "designer" || !siteNote ? quietBase : `${quietBase} ${siteNote}`;
  return [
    {
      name: "Glow",
      tier: glow.tier,
      copy: mode === "designer" ? glow.designerSummary : glow.culturalSummary,
    },
    {
      name: "Quiet",
      tier: quiet.tier,
      copy: quietCopy,
    },
    {
      name: "Damp",
      tier: "heuristic_estimate" as const,
      copy:
        dampBand === "not_assessed"
          ? "Humidity effect: Not assessed. Measurement is needed before drawing a damp conclusion."
          : dampBand === "high"
          ? "High band receives one paired action: Shaft Buffer, bed move, or exhaust timer."
          : `${formatDampBand(dampBand)} band. Keep the recommendation visible and modest.`,
    },
  ];
}

function formatSiteContextNote(plan: PlanGeometry, facadeBaselineDba: number): string | null {
  const adjacency = plan.siteContext?.expresswayAdjacency;
  if (!adjacency || adjacency === "none") return null;
  const distanceM = plan.siteContext?.expresswayDistanceM;
  const expressway = expresswayLabel(adjacency);
  const distanceCopy = distanceM !== undefined ? ` about ${Math.round(distanceM)}m away` : "";
  return `Site sits near ${expressway}${distanceCopy}; the facade carries ${facadeBaselineDba} dBA at night, so a soft window edge helps the bedroom rest.`;
}

function expresswayLabel(adjacency: NonNullable<PlanGeometry["siteContext"]>["expresswayAdjacency"]): string {
  switch (adjacency) {
    case "near_pie":
      return "the PIE";
    case "near_aye":
      return "the AYE";
    case "near_bke":
      return "the BKE";
    case "near_cte":
      return "the CTE";
    case "near_kpe":
      return "the KPE";
    default:
      return "an expressway";
  }
}

function buildDesignerDetails(
  plan: PlanGeometry,
  compassDeg: number,
  floor: number,
  placementCount: number,
  controls: DesignerMaterialControls,
) {
  const achEstimate = Math.max(1.2, Math.min(4.8, plan.openingAreaPct / 4 + placementCount * 0.2)).toFixed(1);
  const shgc = isWestFacing(plan.westSunFacadeDeg, compassDeg) ? "SHGC <= 0.30 recommended" : "SHGC watch only";
  // The detail card preserves the legacy "stream X%, dust Y%" copy so the
  // existing e2e assertion in bones.spec.ts still reads. density carries the
  // streamStrength role; textureScale carries dustStrength.
  return [
    {
      label: "Material preset",
      value: controls.preset,
      note: `stream ${controls.density}%, dust ${controls.textureScale}%`,
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

