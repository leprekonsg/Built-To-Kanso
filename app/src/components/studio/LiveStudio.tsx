"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import type { PlanGeometry } from "@/server/geometry/types";
import type { TokenPlacement } from "@/server/rules/tokens";
import type { SimulationParticle, SimulationStreamline, Tier4SimulationField } from "@/server/simulation/types";
import styles from "./LiveStudio.module.css";

type VisibilityMode = "resident" | "designer" | "audit";

export interface LiveStudioProps {
  plan: PlanGeometry;
  compassDeg: number;
  ambientWindMps?: number;
  tokenPlacements?: TokenPlacement[];
  initialField?: Tier4SimulationField | null;
  /** Kept optional while older Bones wiring is replaced with the Tier 4 field. */
  prebakedField?: unknown;
  visibilityMode?: VisibilityMode;
}

const MODE_MIN_VISIBILITY: Record<VisibilityMode, number> = {
  resident: 0,
  designer: 72,
  audit: 86,
};
const EMPTY_TOKEN_PLACEMENTS: TokenPlacement[] = [];

export function LiveStudio({
  plan,
  compassDeg,
  tokenPlacements = EMPTY_TOKEN_PLACEMENTS,
  initialField = null,
  visibilityMode = "resident",
}: LiveStudioProps) {
  const [field, setField] = useState<Tier4SimulationField | null>(initialField);
  const [status, setStatus] = useState<"ready" | "loading" | "unavailable">(initialField ? "ready" : "loading");
  const [windVisibility, setWindVisibility] = useState(58);
  const sliderId = useId();
  const placementKey = useMemo(() => JSON.stringify(tokenPlacements), [tokenPlacements]);
  const requestBody = useMemo(
    () => JSON.stringify({ templateId: plan.templateId, tokenPlacements: JSON.parse(placementKey) as TokenPlacement[] }),
    [plan.templateId, placementKey],
  );

  useEffect(() => {
    if (initialField) {
      setField(initialField);
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");

    async function loadField() {
      try {
        const response = await fetch("/api/simulation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Simulation API returned a non-200 response.");
        const nextField = (await response.json()) as Tier4SimulationField;
        setField(nextField);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("unavailable");
          setField(null);
        }
      }
    }

    loadField();

    return () => controller.abort();
  }, [initialField, plan.templateId, placementKey, requestBody]);

  const visibility = Math.max(windVisibility, MODE_MIN_VISIBILITY[visibilityMode]);
  const opacity = visibilityToOpacity(visibility, field);
  const viewBox = `${plan.bounds.x} ${plan.bounds.y} ${plan.bounds.width} ${plan.bounds.height}`;

  return (
    <figure className={styles.root} data-testid="live-studio" data-visibility-mode={visibilityMode}>
      <svg
        className={styles.surface}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${plan.templateId} airflow visual at ${Math.round(compassDeg)} degrees`}
      >
        <PlanLayer plan={plan} />
        {field ? (
          <SimulationLayer
            streamlines={field.streamlines}
            particles={field.particles}
            opacity={opacity}
            visibilityMode={visibilityMode}
          />
        ) : null}
      </svg>

      <div className={styles.controls}>
        <label className={styles.sliderLabel} htmlFor={sliderId}>
          <span>Wind Visibility</span>
          <strong>{visibility}%</strong>
        </label>
        <input
          id={sliderId}
          data-testid="wind-visibility-slider"
          className={styles.slider}
          type="range"
          min="0"
          max="100"
          value={windVisibility}
          onChange={(event) => setWindVisibility(Number(event.currentTarget.value))}
          aria-valuetext={visibility < 50 ? "Barely Seen" : "Clearly Seen"}
        />
        <div className={styles.sliderScale} aria-hidden>
          <span>Barely Seen</span>
          <span>Clearly Seen</span>
        </div>
      </div>

      <figcaption className={styles.caption} aria-live="polite">
        {status === "loading"
          ? "Loading deterministic airflow."
          : status === "unavailable"
            ? "Airflow visual unavailable. Check the simulation template data."
            : "Tier 4 airflow visual. Prototype visualisation."}
      </figcaption>
    </figure>
  );
}

function PlanLayer({ plan }: { plan: PlanGeometry }) {
  return (
    <g className={styles.planLayer} aria-hidden>
      <rect
        x={plan.bounds.x}
        y={plan.bounds.y}
        width={plan.bounds.width}
        height={plan.bounds.height}
        className={styles.planBounds}
      />
      {plan.rooms.map((room) => (
        <rect
          key={room.id}
          x={room.x}
          y={room.y}
          width={room.width}
          height={room.height}
          className={styles.room}
        />
      ))}
      {plan.fixedElements.map((element) => (
        <rect
          key={element.id}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          className={styles.fixedElement}
        />
      ))}
    </g>
  );
}

function SimulationLayer({
  streamlines,
  particles,
  opacity,
  visibilityMode,
}: {
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  opacity: number;
  visibilityMode: VisibilityMode;
}) {
  return (
    <g className={styles.simulationLayer} style={layerStyle(opacity, visibilityMode)}>
      {streamlines.map((line) => (
        <path
          key={line.id}
          data-testid="streamline"
          d={pointsToPath(line.points)}
          className={`${styles.streamlinePath} ${
            line.material === "sumi_ink" ? styles.sumiStreamline : styles.silkStreamline
          }`}
        />
      ))}
      {particles.map((particle) => (
        <circle
          key={particle.id}
          data-testid={particle.kind === "pipeshaft_drift" ? "pipeshaft-particle" : "clean-air-particle"}
          cx={particle.x}
          cy={particle.y}
          r={particle.kind === "pipeshaft_drift" ? 0.075 : 0.065}
          className={`${styles.particle} ${
            particle.kind === "pipeshaft_drift" ? styles.pipeshaftParticle : styles.cleanAirParticle
          }`}
          style={particleStyle(particle.delayMs)}
        />
      ))}
    </g>
  );
}

function visibilityToOpacity(visibility: number, field: Tier4SimulationField | null): number {
  const min = field?.materialDefaults.visibility.minOpacity ?? 0.28;
  const max = field?.materialDefaults.visibility.maxOpacity ?? 0.94;
  return min + (max - min) * (visibility / 100);
}

function layerStyle(opacity: number, visibilityMode: VisibilityMode): CSSProperties {
  return {
    "--wind-opacity": opacity.toFixed(2),
    "--streamline-width": visibilityMode === "audit" ? "0.105" : visibilityMode === "designer" ? "0.085" : "0.065",
  } as CSSProperties;
}

function particleStyle(delayMs: number): CSSProperties {
  return { "--particle-delay": `${delayMs}ms` } as CSSProperties;
}

function pointsToPath(points: SimulationStreamline["points"]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const [start, control, end] = points;
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

export default LiveStudio;
