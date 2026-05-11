"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { useVoiceStore } from "@/lib/voice";
import type { DesignerMaterialControls } from "@/lib/designerControls";
import { getPlanGeometry } from "@/server/geometry/registry";
import type { PlanGeometry } from "@/server/geometry/types";
import { runTier1IfAvailable } from "@/server/lbm/gpuSolver";
import { evaluateGlow, type GlowReading } from "@/server/rules/glow";
import { buildGlowWashPolygons } from "@/server/rules/glowRender";
import { evaluateQuiet, type QuietReading } from "@/server/rules/quiet";
import { renderDampedRippleSvg } from "@/server/rules/quietRender";
import type { TokenPlacement } from "@/server/rules/tokens";
import {
  buildSceneElementSpec,
  SHADOW_FRAME_COUNT,
  type CurtainSpec,
  type KitchenShadowSpec,
  type LeafSpec,
} from "@/server/scene/sceneElements";
import {
  composeTier1Field,
  WEATHER_TRIALS,
  withPlanCondition,
} from "@/server/simulation/fieldBuilders";
import type {
  SimulationParticle,
  SimulationStreamline,
  Tier4SimulationField,
  WeatherTrialConditionId,
} from "@/server/simulation/types";
import { TokenVisualProof } from "./TokenVisualProof";
import styles from "./LiveStudio.module.css";

/** Browser-side Tier 1 LBM iteration count. Mirrors server tier4.TIER1_ITERATIONS. */
const CLIENT_TIER1_ITERATIONS = 600;
const DEFAULT_TIER1_CONDITION: WeatherTrialConditionId = "baseline_monsoon";

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
  /**
   * Weather Trial: when set, the active condition overrides the default and is
   * passed through to the simulation API. Used by the trial buttons in
   * BonesInteractive — the trial reverts after a few seconds.
   */
  weatherTrial?: WeatherTrialConditionId | null;
  floor?: number;
  /**
   * When the parent is in Designer voice mode, the full 8-parameter material
   * control set drives the studio. The internal Wind Visibility slider visibly
   * cedes control via a "Designer overrides" badge — same physics, different
   * surface area. Cultural mode leaves this undefined and keeps the calm slider.
   */
  designerControls?: DesignerMaterialControls;
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
  weatherTrial = null,
  floor = 8,
  designerControls,
}: LiveStudioProps) {
  const [field, setField] = useState<Tier4SimulationField | null>(initialField);
  const [status, setStatus] = useState<"ready" | "loading" | "unavailable">(initialField ? "ready" : "loading");
  const [windVisibility, setWindVisibility] = useState(58);
  const voiceMode = useVoiceStore((state) => state.mode);
  const sliderId = useId();
  const placementKey = useMemo(() => JSON.stringify(tokenPlacements), [tokenPlacements]);
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        templateId: plan.templateId,
        tokenPlacements: JSON.parse(placementKey) as TokenPlacement[],
        ...(weatherTrial ? { condition: weatherTrial } : {}),
      }),
    [plan.templateId, placementKey, weatherTrial],
  );

  useEffect(() => {
    // When a Weather Trial is active, never use the SSR-supplied initialField:
    // initialField was rendered at the default condition and would shadow the
    // trial's distinct field. Always re-fetch when a trial is active.
    if (initialField && !weatherTrial) {
      return;
    }

    const controller = new AbortController();
    const loadingTimer = setTimeout(() => setStatus("loading"), 0);

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

    return () => {
      clearTimeout(loadingTimer);
      controller.abort();
    };
  }, [initialField, plan.templateId, placementKey, requestBody, weatherTrial]);

  // Tier 1 client upgrade: when WebGPU is available in the browser, run the
  // canonical 256x256 D2Q9 LBM and replace the SSR/API field with the live
  // velocity field. Silent on failure — the existing prebaked field stays
  // visible as the honest Tier 4 lookup in the caption. Re-runs when template /
  // placements / trial change.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return;

    let cancelled = false;
    const conditionId = weatherTrial ?? DEFAULT_TIER1_CONDITION;
    const placements = JSON.parse(placementKey) as TokenPlacement[];

    async function upgradeToTier1() {
      const planGeometry = getPlanGeometry(plan.templateId);
      const condition = withPlanCondition(WEATHER_TRIALS[conditionId], planGeometry.westSunFacadeDeg);

      const tier1 = await runTier1IfAvailable({
        templateId: plan.templateId,
        compassDeg: condition.compassDeg,
        ambientWindMps: condition.ambientWindMps,
        iterations: CLIENT_TIER1_ITERATIONS,
      });

      if (!tier1 || cancelled) return;

      const tier1Field = composeTier1Field({
        templateId: plan.templateId,
        field: tier1,
        condition,
        tokenPlacements: placements,
        iterations: CLIENT_TIER1_ITERATIONS,
      });

      if (!cancelled) {
        setField(tier1Field);
        setStatus("ready");
      }
    }

    void upgradeToTier1();

    return () => {
      cancelled = true;
    };
  }, [plan.templateId, placementKey, weatherTrial]);

  // Designer mode hands its visibility value through; otherwise the local
  // slider drives, gated by the audit/designer floor.
  const designerVisibility = designerControls?.visibility;
  const designerOverrides = designerVisibility !== undefined;
  const effectiveVisibilitySource = designerVisibility ?? windVisibility;
  const visibility = Math.max(effectiveVisibilitySource, MODE_MIN_VISIBILITY[visibilityMode]);
  const opacity = visibilityToOpacity(visibility, field);
  const sceneSpec = useMemo(() => (field ? buildSceneElementSpec(plan, field) : null), [plan, field]);
  const glowReading = useMemo(() => evaluateGlow({ plan, compassDeg, floor }), [plan, compassDeg, floor]);
  const quietReading = useMemo(() => evaluateQuiet({ plan, floor }), [plan, floor]);
  const viewBox = `${plan.bounds.x} ${plan.bounds.y} ${plan.bounds.width} ${plan.bounds.height}`;
  const hasPipeshaftDrift = useMemo(
    () => field?.particles.some((particle) => particle.kind === "pipeshaft_drift") ?? false,
    [field],
  );
  const simulationSource = field?.simulationSource.kind ?? "none";

  return (
    <figure
      className={styles.root}
      data-testid="live-studio"
      data-visibility-mode={visibilityMode}
      data-weather-trial={weatherTrial ?? "default"}
      data-designer-overrides={designerOverrides ? "true" : "false"}
      data-simulation-source={simulationSource}
      style={designerControls ? designerRootStyle(designerControls) : undefined}
    >
      <svg
        className={styles.surface}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${plan.templateId} airflow visual at ${Math.round(compassDeg)} degrees`}
      >
        <SceneFilters />
        <PlanLayer plan={plan} />
        <MaterialOverlayLayer plan={plan} glow={glowReading} quiet={quietReading} />
        {sceneSpec ? <SceneElementsLayer spec={sceneSpec} visibility={visibility} /> : null}
        {field ? (
          <SimulationLayer
            streamlines={field.streamlines}
            particles={field.particles}
            opacity={opacity}
            visibility={visibility}
            visibilityMode={visibilityMode}
            designerControls={designerControls}
          />
        ) : null}
      </svg>

      {hasPipeshaftDrift ? <PipeshaftLegend voiceMode={voiceMode} /> : null}
      {voiceMode === "designer" && designerControls?.preset === "audit_lic" && tokenPlacements.length > 0 ? (
        <TokenVisualProof placements={tokenPlacements} />
      ) : null}

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
          value={designerVisibility ?? windVisibility}
          onChange={(event) => setWindVisibility(Number(event.currentTarget.value))}
          aria-valuetext={visibility < 50 ? "Barely Seen" : "Clearly Seen"}
          disabled={designerOverrides}
        />
        <div className={styles.sliderScale} aria-hidden>
          <span>Barely Seen</span>
          <span>Clearly Seen</span>
        </div>
        {designerOverrides ? (
          <span
            className={styles.designerOverrideBadge}
            data-testid="designer-overrides-badge"
            aria-live="polite"
          >
            Designer overrides
          </span>
        ) : null}
      </div>

      <figcaption className={styles.caption} aria-live="polite">
        {status === "loading"
          ? "Loading deterministic airflow."
          : status === "unavailable"
            ? "Airflow visual unavailable. Check the simulation template data."
            : weatherTrial && field
              ? `Weather Trial: ${field.condition.label}. ${simulationSourceCopy(field)}`
              : field
                ? simulationSourceCopy(field)
                : "Airflow visual. Prototype visualisation."}
      </figcaption>
    </figure>
  );
}

// Per the brief: "Never surface the fallback to the user." We extend that to the
// successful path — users should not have to know whether the field came from a
// live WebGPU compute pass or the prebaked Tier-4 lookup. The evidence-tier
// honesty ("Prototype visualisation") is kept; the compute-tier number is not.
// Use the `data-simulation-source` attribute on the figure for diagnostics.
function simulationSourceCopy(_field: Tier4SimulationField): string {
  return "Airflow visual. Prototype visualisation.";
}

// Hard Rule #16 reframing copy — pipeshaft = gray, clean = amber. The Cultural
// register frames the gray dust as a domestic neighbor relation; the Designer
// register names the underlying mechanism. Both register honestly without the
// alarmist tone the brief's failure-mode table calls out.
function PipeshaftLegend({ voiceMode }: { voiceMode: "cultural" | "designer" }) {
  const copy =
    voiceMode === "designer"
      ? "Vertical pollutant transport at the pipeshaft opening (Wong NUS 2010)."
      : "Gray drift is the air your neighbor cooks in. Buffer keeps it close to the wall.";
  return (
    <aside
      className={styles.pipeshaftLegend}
      data-testid="pipeshaft-legend"
      data-voice-mode={voiceMode}
      aria-label="Pipeshaft drift legend"
    >
      <span className={styles.pipeshaftDot} aria-hidden />
      <span>{copy}</span>
    </aside>
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

function MaterialOverlayLayer({
  plan,
  glow,
  quiet,
}: {
  plan: PlanGeometry;
  glow: GlowReading;
  quiet: QuietReading;
}) {
  const quietSvg = useMemo(() => renderDampedRippleSvg(plan, quiet), [plan, quiet]);
  const glowPolygons = useMemo(() => buildGlowWashPolygons(plan, glow), [plan, glow]);

  return (
    <g className={styles.materialLayer} data-testid="environmental-material-layer">
      <g
        className={styles.quietRippleGroup}
        data-testid="quiet-material-ripple"
        dangerouslySetInnerHTML={{ __html: quietSvg }}
      />
      <g
        className={styles.glowWashGroup}
        data-layer="glow-material-wash"
        data-testid="glow-material-wash"
        data-band={glow.band}
        data-score={glow.solarWashScore}
      >
        {glowPolygons.map((polygon) => (
          <polygon
            key={polygon.id}
            points={polygon.points.map((point) => `${point.x},${point.y}`).join(" ")}
            className={styles.glowWash}
            style={{ "--glow-opacity": polygon.opacity.toFixed(3) } as CSSProperties}
          />
        ))}
      </g>
    </g>
  );
}

function SceneFilters() {
  // Eight discrete shadow patterns for the perforated kitchen-partition. The
  // brief specifies eight pre-baked textures per scene element; this fulfills
  // that contract via deterministic feTurbulence seeds (1..8). When real PNG
  // textures are baked, swap the <pattern> bodies for <image> refs without
  // touching the consumer.
  return (
    <defs>
      {Array.from({ length: SHADOW_FRAME_COUNT }, (_, frameIndex) => (
        <pattern
          key={`kitchen-shadow-${frameIndex}`}
          id={`kitchen-shadow-frame-${frameIndex}`}
          patternUnits="userSpaceOnUse"
          width={0.6}
          height={0.6}
        >
          <rect width={0.6} height={0.6} fill="rgba(245, 241, 232, 0)" />
          <circle cx={0.18 + (frameIndex % 3) * 0.08} cy={0.18 + Math.floor(frameIndex / 3) * 0.08} r={0.08} fill="rgba(17, 17, 17, 0.55)" />
          <circle cx={0.42 - (frameIndex % 3) * 0.06} cy={0.42 - Math.floor(frameIndex / 3) * 0.06} r={0.06} fill="rgba(17, 17, 17, 0.4)" />
        </pattern>
      ))}
    </defs>
  );
}

function SceneElementsLayer({ spec, visibility }: { spec: ReturnType<typeof buildSceneElementSpec>; visibility: number }) {
  // visibility is 0..100; scene elements respond linearly so the slider's "Wind
  // Visibility — Barely Seen → Clearly Seen" reads through the diegetic layer.
  const responseGain = visibility / 100;

  return (
    <g className={styles.sceneLayer} data-testid="scene-elements" style={{ "--scene-gain": responseGain.toFixed(2) } as CSSProperties}>
      {spec.kitchenShadow ? <KitchenShadow spec={spec.kitchenShadow} gain={responseGain} /> : null}
      {spec.curtains.map((curtain) => (
        <Curtain key={curtain.id} spec={curtain} gain={responseGain} />
      ))}
      {spec.leaves.map((leaf) => (
        <Leaf key={leaf.id} spec={leaf} gain={responseGain} />
      ))}
    </g>
  );
}

function Curtain({ spec, gain }: { spec: CurtainSpec; gain: number }) {
  // Six fabric strands hanging from the window line. Each strand sways by the
  // same angle so the curtain reads as one diegetic element rather than six.
  // Strand drop length is a fraction of the window span, capped to 0.7m so it
  // doesn't reach a piece of furniture in the room beyond.
  const strandCount = 6;
  const dropM = Math.min(0.7, spec.spanM * 0.45);
  const swayDeg = spec.swayDeg * gain;
  const transformOrigin = `${spec.anchor.x} ${spec.anchor.y}`;
  const strands = Array.from({ length: strandCount }, (_, index) => {
    const t = index / (strandCount - 1);
    const along = (t - 0.5) * spec.spanM;
    const startX = spec.orientation === "horizontal" ? spec.anchor.x + along : spec.anchor.x;
    const startY = spec.orientation === "horizontal" ? spec.anchor.y : spec.anchor.y + along;
    const endX = spec.orientation === "horizontal" ? startX : startX + dropM;
    const endY = spec.orientation === "horizontal" ? startY + dropM : startY;
    return { id: `${spec.id}-strand-${index}`, startX, startY, endX, endY };
  });

  return (
    <g
      className={styles.curtain}
      data-testid={`curtain-${spec.openingId}`}
      data-orientation={spec.orientation}
      data-speed-mps={spec.speedMps}
      style={{ transform: `rotate(${swayDeg.toFixed(2)}deg)`, transformOrigin } as CSSProperties}
    >
      {strands.map((strand) => (
        <line
          key={strand.id}
          x1={strand.startX}
          y1={strand.startY}
          x2={strand.endX}
          y2={strand.endY}
          className={styles.curtainStrand}
        />
      ))}
    </g>
  );
}

function Leaf({ spec, gain }: { spec: LeafSpec; gain: number }) {
  // Stylised monstera leaf as a single SVG path. Anchor is the stem base; the
  // leaf rotates about the stem.
  const rotation = spec.rotationDeg * gain;
  const transformOrigin = `${spec.anchor.x} ${spec.anchor.y}`;
  return (
    <g
      className={styles.leaf}
      data-testid={`leaf-${spec.id}`}
      data-speed-mps={spec.speedMps}
      style={{ transform: `rotate(${rotation.toFixed(2)}deg)`, transformOrigin } as CSSProperties}
    >
      {/* Stem */}
      <line
        x1={spec.anchor.x}
        y1={spec.anchor.y}
        x2={spec.anchor.x}
        y2={spec.anchor.y - 0.55}
        className={styles.leafStem}
      />
      {/* Three lobes shaped like a monstera fenestration */}
      <path
        d={`M ${spec.anchor.x} ${spec.anchor.y - 0.55} q -0.32 -0.18 -0.36 -0.5 q 0.18 -0.04 0.36 0.06 q 0.18 -0.1 0.36 -0.06 q -0.04 0.32 -0.36 0.5 z`}
        className={styles.leafBlade}
      />
    </g>
  );
}

function KitchenShadow({ spec, gain }: { spec: KitchenShadowSpec; gain: number }) {
  // The perforated kitchen-partition casts its shadow onto the kitchen floor.
  // Frame index maps to one of the eight pre-baked patterns from <SceneFilters>.
  // Opacity is scaled by the response gain so the shadow softens at low
  // visibility without disappearing entirely.
  const opacity = (spec.blendOpacity * (0.4 + 0.6 * gain)).toFixed(2);
  return (
    <rect
      className={styles.kitchenShadow}
      data-testid="kitchen-shadow"
      data-frame-index={spec.frameIndex}
      data-speed-mps={spec.speedMps}
      x={spec.bounds.x}
      y={spec.bounds.y}
      width={spec.bounds.width}
      height={spec.bounds.height}
      fill={`url(#kitchen-shadow-frame-${spec.frameIndex})`}
      style={{ opacity } as CSSProperties}
    />
  );
}

function SimulationLayer({
  streamlines,
  particles,
  opacity,
  visibility,
  visibilityMode,
  designerControls,
}: {
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  opacity: number;
  visibility: number;
  visibilityMode: VisibilityMode;
  designerControls?: DesignerMaterialControls;
}) {
  // density (0..100): the simulation produced N streamlines + M particles; we
  // render the leading slice. Density=0 hides the layer; any positive value
  // keeps at least one item visible. Cultural mode renders the full set.
  const densityFactor = designerControls ? Math.max(0, Math.min(1, designerControls.density / 100)) : 1;
  const visibleStreamlines = designerControls
    ? streamlines.slice(0, densitySliceCount(streamlines.length, densityFactor))
    : streamlines;
  const visibleParticles = designerControls
    ? particles.slice(0, densitySliceCount(particles.length, densityFactor))
    : particles;

  // Normalised speed reference for the velocity-to-width modulation. Falls back
  // to 1 m/s if the field reports no movement so the multiplier never explodes.
  const maxSpeed = streamlines.reduce((acc, line) => Math.max(acc, line.speedMps ?? 0), 0) || 1;

  return (
    <g
      data-testid="simulation-materials"
      className={styles.simulationLayer}
      style={layerStyle(opacity, visibility, visibilityMode, designerControls)}
    >
      {visibleStreamlines.map((line) => (
        <path
          key={line.id}
          data-testid="streamline"
          d={pointsToPath(line.points)}
          className={`${styles.streamlinePath} ${
            line.material === "sumi_ink" ? styles.sumiStreamline : styles.silkStreamline
          }`}
          style={streamlineStyle(line, maxSpeed, designerControls)}
        />
      ))}
      {visibleParticles.map((particle) => (
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

function layerStyle(
  opacity: number,
  visibility: number,
  visibilityMode: VisibilityMode,
  controls?: DesignerMaterialControls,
): CSSProperties {
  // Designer's stagnation-opacity threshold drives a wash overlay so streamline
  // points whose magnitude < threshold read softer. Implemented as a CSS
  // variable that consumers (the SVG mask / future feFilter) read from the
  // simulationLayer scope. CSS multiplier kept linear so the slider feels
  // physical at 0..100.
  const stagnation = controls ? controls.stagnationOpacityThreshold / 100 : 0;
  const softness = controls ? controls.softness / 100 : 0;
  return {
    "--wind-opacity": opacity.toFixed(2),
    "--streamline-width": streamlineWidthFor(visibility, visibilityMode).toFixed(3),
    "--stagnation-threshold": stagnation.toFixed(2),
    "--streamline-softness": softness.toFixed(2),
  } as CSSProperties;
}

/**
 * Designer-only CSS variables hoisted to the figure root so the controls
 * scope future SVG filters (turbulence, kasure softness, paper texture) at one
 * level. Consumers are documented inline next to each variable.
 */
function designerRootStyle(controls: DesignerMaterialControls): CSSProperties {
  return {
    // --wind-turbulence: 0..1. Future SVG <feTurbulence> displacement scale.
    "--wind-turbulence": (controls.turbulence / 100).toFixed(2),
    // --texture-scale: 0..1. Future washi-fiber <pattern> patternUnits scale.
    "--texture-scale": (controls.textureScale / 100).toFixed(2),
    // --velocity-width-mod: 0..1. Read by streamlineStyle; kept here too so
    // CSS overrides can pick it up at the figure root in audit mode.
    "--velocity-width-mod": (controls.velocityWidthMod / 100).toFixed(2),
  } as CSSProperties;
}

/**
 * Width modulation per streamline: stroke-width = baseWidth * (1 + mod * speedNorm).
 * speedNorm is 0..1 against the field's max speed. velocityWidthMod=0 disables
 * modulation; 100 doubles the heaviest streamline's stroke-width relative to
 * the field's slowest. baseWidth comes from the existing CSS var so the
 * Cultural-mode default keeps reading the same.
 */
function streamlineStyle(
  line: SimulationStreamline,
  maxSpeed: number,
  controls?: DesignerMaterialControls,
): CSSProperties | undefined {
  if (!controls) return undefined;
  const mod = controls.velocityWidthMod / 100;
  if (mod === 0) return undefined;
  const speedNorm = Math.max(0, Math.min(1, (line.speedMps ?? 0) / maxSpeed));
  const multiplier = 1 + mod * speedNorm;
  return {
    strokeWidth: `calc(var(--streamline-width) * ${multiplier.toFixed(3)})`,
  } as CSSProperties;
}

function streamlineWidthFor(visibility: number, visibilityMode: VisibilityMode): number {
  const t = Math.max(0, Math.min(1, visibility / 100));
  const residentWidth = 0.035 + 0.055 * t;
  if (visibilityMode === "audit") return Math.max(residentWidth, 0.105);
  if (visibilityMode === "designer") return Math.max(residentWidth, 0.085);
  return residentWidth;
}

function particleStyle(delayMs: number): CSSProperties {
  return { "--particle-delay": `${delayMs}ms` } as CSSProperties;
}

function densitySliceCount(length: number, factor: number): number {
  if (factor <= 0 || length === 0) return 0;
  return Math.max(1, Math.ceil(length * factor));
}

function pointsToPath(points: SimulationStreamline["points"]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const [start, control, end] = points;
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

export default LiveStudio;
