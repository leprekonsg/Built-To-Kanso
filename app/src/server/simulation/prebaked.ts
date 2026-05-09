import { getPlanGeometry, listGeometrySummaries } from "@/server/geometry/registry";
import type { Point, TemplateId } from "@/server/geometry/types";
import { TOKEN_IDS, type TokenId, type TokenPlacement } from "@/server/rules/tokens";
import type { SimulationParticle, SimulationStreamline, VelocitySample } from "./types";

interface Tier4TemplateField {
  streamlines: SimulationStreamline[];
  particles: SimulationParticle[];
  velocitySamples: VelocitySample[];
}

export type Tier4WeatherConditionId =
  | "baseline_monsoon"
  | "ne_monsoon"
  | "sw_monsoon"
  | "west_sun_still_air"
  | "west_sun_1720"
  | "highway_night"
  | "ne_monsoon_wind";

interface Tier4WeatherCondition {
  id: Tier4WeatherConditionId;
  label: string;
  compassDeg: number;
  ambientWindMps: number;
  speedFactor: number;
  vxBias: number;
  vyBias: number;
}

export interface Tier4CandidatePosition extends Point {
  id: string;
}

export interface Tier4PrebakeEntry {
  key: string;
  templateId: TemplateId;
  tokenId: TokenId;
  candidate: Tier4CandidatePosition;
}

export interface Tier4PrebakeMatrix {
  version: "tier4-prebake-v1";
  templateCount: number;
  tokenCount: number;
  candidateCountPerTemplate: number;
  baseCellCount: number;
  entries: Tier4PrebakeEntry[];
}

export interface Tier4PrebakeLookupInput {
  templateId: TemplateId;
  tokenPlacements: ReadonlyArray<TokenPlacement>;
  candidatePositions?: ReadonlyArray<TokenPlacement>;
  weatherCondition?: Tier4WeatherConditionId | string;
}

export interface Tier4PrebakeLookup {
  field: Tier4TemplateField;
  condition: Tier4WeatherCondition;
  meta: {
    cacheKey: string;
    weatherCondition: string;
    matrix: Omit<Tier4PrebakeMatrix, "entries">;
    lookup: {
      matched: boolean;
      tokenId?: string;
      candidateId?: string;
      distanceM?: number;
    };
  };
}

export const TIER4_TEMPLATE_CANDIDATE_COUNT = 15;
export const DEFAULT_TIER4_WEATHER_CONDITION: Tier4WeatherConditionId = "baseline_monsoon";

export const TIER4_WEATHER_CONDITIONS: Record<Tier4WeatherConditionId, Tier4WeatherCondition> = {
  baseline_monsoon: {
    id: "baseline_monsoon",
    label: "Baseline monsoon",
    compassDeg: 270,
    ambientWindMps: 1.5,
    speedFactor: 1,
    vxBias: 0,
    vyBias: 0,
  },
  ne_monsoon: {
    id: "ne_monsoon",
    label: "NE Monsoon",
    compassDeg: 45,
    ambientWindMps: 1.8,
    speedFactor: 1.12,
    vxBias: -0.015,
    vyBias: 0.02,
  },
  sw_monsoon: {
    id: "sw_monsoon",
    label: "SW Monsoon",
    compassDeg: 225,
    ambientWindMps: 1.6,
    speedFactor: 1.04,
    vxBias: 0.018,
    vyBias: -0.014,
  },
  west_sun_still_air: {
    id: "west_sun_still_air",
    label: "West sun still air",
    compassDeg: 270,
    ambientWindMps: 0.6,
    speedFactor: 0.78,
    vxBias: 0.006,
    vyBias: -0.006,
  },
  west_sun_1720: {
    id: "west_sun_1720",
    label: "West Sun 17:20",
    compassDeg: 270,
    ambientWindMps: 0.65,
    speedFactor: 0.8,
    vxBias: 0.007,
    vyBias: -0.006,
  },
  highway_night: {
    id: "highway_night",
    label: "Highway Night",
    compassDeg: 210,
    ambientWindMps: 1.3,
    speedFactor: 0.9,
    vxBias: 0.012,
    vyBias: -0.01,
  },
  ne_monsoon_wind: {
    id: "ne_monsoon_wind",
    label: "NE Monsoon Wind",
    compassDeg: 45,
    ambientWindMps: 1.9,
    speedFactor: 1.14,
    vxBias: -0.016,
    vyBias: 0.022,
  },
};

export const TIER4_PREBAKED_FIELDS: Record<TemplateId, Tier4TemplateField> = {
  "tampines-greenweave": {
    streamlines: [
      { id: "living-to-yard", material: "silk_ribbon", speedMps: 0.22, points: [{ x: 9.8, y: 1.5 }, { x: 7.5, y: 3.6 }, { x: 5.2, y: 7.8 }] },
      { id: "bedroom-crossfeed", material: "silk_ribbon", speedMps: 0.14, points: [{ x: 0.5, y: 1.8 }, { x: 3.2, y: 2.7 }, { x: 6.8, y: 3.2 }] },
      { id: "shaft-buffer-zone", material: "sumi_ink", speedMps: 0.18, points: [{ x: 6.1, y: 5.9 }, { x: 6.6, y: 5.4 }, { x: 7.7, y: 4.8 }] },
    ],
    particles: [
      { id: "p1", kind: "clean_air", material: "sunlit_dust", x: 9.7, y: 1.4, delayMs: 0, speedMps: 0.22 },
      { id: "p2", kind: "clean_air", material: "sunlit_dust", x: 7.2, y: 3.7, delayMs: 420, speedMps: 0.2 },
      { id: "p3", kind: "clean_air", material: "sunlit_dust", x: 1, y: 1.9, delayMs: 840, speedMps: 0.14 },
      { id: "p4", kind: "pipeshaft_drift", material: "hdb_concrete_dust", x: 6.1, y: 5.9, delayMs: 1260, speedMps: 0.18 },
    ],
    velocitySamples: [
      { x: 9.4, y: 1.5, vx: -0.18, vy: 0.09, speedMps: 0.2 },
      { x: 6.5, y: 3.6, vx: -0.13, vy: 0.07, speedMps: 0.15 },
      { x: 5.2, y: 7.4, vx: -0.04, vy: 0.16, speedMps: 0.17 },
      { x: 2.1, y: 2.1, vx: 0.09, vy: 0.04, speedMps: 0.1 },
    ],
  },
  "tengah-5room": {
    streamlines: [
      { id: "living-to-service-yard", material: "silk_ribbon", speedMps: 0.21, points: [{ x: 11, y: 1.4 }, { x: 8.2, y: 3.8 }, { x: 5.4, y: 8.3 }] },
      { id: "bedroom-corridor-feed", material: "silk_ribbon", speedMps: 0.15, points: [{ x: 0.6, y: 1.8 }, { x: 3.8, y: 3.5 }, { x: 7, y: 3.8 }] },
      { id: "shaft-drift", material: "sumi_ink", speedMps: 0.17, points: [{ x: 5, y: 6.4 }, { x: 3.6, y: 5.5 }, { x: 1.4, y: 6.8 }] },
    ],
    particles: [
      { id: "p1", kind: "clean_air", material: "sunlit_dust", x: 10.9, y: 1.5, delayMs: 0, speedMps: 0.21 },
      { id: "p2", kind: "clean_air", material: "sunlit_dust", x: 8.1, y: 3.8, delayMs: 420, speedMps: 0.19 },
      { id: "p3", kind: "clean_air", material: "sunlit_dust", x: 1, y: 1.9, delayMs: 840, speedMps: 0.15 },
      { id: "p4", kind: "pipeshaft_drift", material: "hdb_concrete_dust", x: 5, y: 6.4, delayMs: 1260, speedMps: 0.17 },
    ],
    velocitySamples: [
      { x: 10.4, y: 1.6, vx: -0.17, vy: 0.08, speedMps: 0.19 },
      { x: 7.2, y: 3.9, vx: -0.12, vy: 0.08, speedMps: 0.14 },
      { x: 5.4, y: 7.8, vx: -0.04, vy: 0.15, speedMps: 0.16 },
      { x: 2, y: 5.8, vx: -0.1, vy: 0.02, speedMps: 0.1 },
    ],
  },
  "resale-exec-1990s": {
    streamlines: [
      { id: "living-window-to-yard", material: "silk_ribbon", speedMps: 0.2, points: [{ x: 12.8, y: 1.5 }, { x: 9.2, y: 4.2 }, { x: 6.6, y: 9 }] },
      { id: "master-window-relief", material: "silk_ribbon", speedMps: 0.13, points: [{ x: 0.6, y: 2.2 }, { x: 3.7, y: 3.7 }, { x: 6.9, y: 4.7 }] },
      { id: "pipeshaft-drift", material: "sumi_ink", speedMps: 0.18, points: [{ x: 5.4, y: 4 }, { x: 3.4, y: 3.8 }, { x: 1.4, y: 3.2 }] },
    ],
    particles: [
      { id: "p1", kind: "clean_air", material: "sunlit_dust", x: 12.7, y: 1.5, delayMs: 0, speedMps: 0.2 },
      { id: "p2", kind: "clean_air", material: "sunlit_dust", x: 9.2, y: 4.1, delayMs: 420, speedMps: 0.18 },
      { id: "p3", kind: "clean_air", material: "sunlit_dust", x: 0.8, y: 2.3, delayMs: 840, speedMps: 0.13 },
      { id: "p4", kind: "pipeshaft_drift", material: "hdb_concrete_dust", x: 5.4, y: 4, delayMs: 1260, speedMps: 0.18 },
    ],
    velocitySamples: [
      { x: 12.2, y: 1.6, vx: -0.16, vy: 0.08, speedMps: 0.18 },
      { x: 8, y: 4.7, vx: -0.11, vy: 0.09, speedMps: 0.14 },
      { x: 6.4, y: 8.4, vx: -0.03, vy: 0.14, speedMps: 0.14 },
      { x: 2.8, y: 3.6, vx: -0.11, vy: -0.02, speedMps: 0.11 },
    ],
  },
};

export function buildTier4PrebakeMatrix(): Tier4PrebakeMatrix {
  const templates = listGeometrySummaries().map((summary) => summary.templateId);
  const entries = templates.flatMap((templateId) =>
    TOKEN_IDS.flatMap((tokenId) =>
      buildTier4CandidatePositions(templateId).map((candidate) => ({
        key: buildMatrixEntryKey(templateId, tokenId, candidate),
        templateId,
        tokenId,
        candidate,
      })),
    ),
  );

  return {
    version: "tier4-prebake-v1",
    templateCount: templates.length,
    tokenCount: TOKEN_IDS.length,
    candidateCountPerTemplate: TIER4_TEMPLATE_CANDIDATE_COUNT,
    baseCellCount: entries.length,
    entries,
  };
}

export function buildTier4CandidatePositions(templateId: TemplateId): Tier4CandidatePosition[] {
  const plan = getPlanGeometry(templateId);
  const seeds: Tier4CandidatePosition[] = [
    { id: "pipeshaft", ...roundPoint(plan.pipeshaft.openingPoint) },
    ...plan.openings.map((opening) => ({
      id: `opening-${opening.id}`,
      ...roundPoint({
        x: (opening.start.x + opening.end.x) / 2,
        y: (opening.start.y + opening.end.y) / 2,
      }),
    })),
    ...plan.rooms.map((room) => ({
      id: `room-${room.id}`,
      ...roundPoint({
        x: room.x + room.width / 2,
        y: room.y + room.height / 2,
      }),
    })),
    ...plan.bathrooms.map((bathroom) => ({
      id: `bath-${bathroom.roomId}`,
      ...roundPoint(bathroom.exhaustPoint),
    })),
  ];

  const deduped = dedupeCandidates(seeds);
  const fill = buildGridFill(templateId, deduped.length);
  return [...deduped, ...fill].slice(0, TIER4_TEMPLATE_CANDIDATE_COUNT);
}

export function buildTier4PrebakeCacheKey(input: {
  templateId: TemplateId;
  tokenPlacements?: ReadonlyArray<TokenPlacement>;
  candidatePositions?: ReadonlyArray<TokenPlacement>;
  weatherCondition?: string;
}): string {
  return [
    "tier4:v1",
    `template=${input.templateId}`,
    `weather=${input.weatherCondition ?? DEFAULT_TIER4_WEATHER_CONDITION}`,
    `placements=${formatPlacements(input.tokenPlacements ?? [])}`,
    `candidates=${formatPlacements(input.candidatePositions ?? [])}`,
  ].join("|");
}

export function normalizeTier4WeatherCondition(value: unknown): Tier4WeatherCondition {
  if (typeof value === "string" && value in TIER4_WEATHER_CONDITIONS) {
    return TIER4_WEATHER_CONDITIONS[value as Tier4WeatherConditionId];
  }

  return TIER4_WEATHER_CONDITIONS[DEFAULT_TIER4_WEATHER_CONDITION];
}

export function lookupTier4Prebake(input: Tier4PrebakeLookupInput): Tier4PrebakeLookup {
  const condition = normalizeTier4WeatherCondition(input.weatherCondition);
  const candidateInputs = input.candidatePositions?.length ? input.candidatePositions : input.tokenPlacements;
  const matrix = buildTier4PrebakeMatrix();
  const match = matchCandidate(input.templateId, candidateInputs[0]);
  const cacheKey = buildTier4PrebakeCacheKey({
    templateId: input.templateId,
    tokenPlacements: input.tokenPlacements,
    candidatePositions: candidateInputs,
    weatherCondition: condition.id,
  });

  return {
    field: buildGeneratedField(input.templateId, input.tokenPlacements, condition, match.candidate),
    condition,
    meta: {
      cacheKey,
      weatherCondition: condition.id,
      matrix: {
        version: matrix.version,
        templateCount: matrix.templateCount,
        tokenCount: matrix.tokenCount,
        candidateCountPerTemplate: matrix.candidateCountPerTemplate,
        baseCellCount: matrix.baseCellCount,
      },
      lookup: {
        matched: match.distanceM <= 0.6,
        tokenId: candidateInputs[0]?.tokenId,
        candidateId: match.candidate?.id,
        distanceM: Number.isFinite(match.distanceM) ? round(match.distanceM) : undefined,
      },
    },
  };
}

function buildGeneratedField(
  templateId: TemplateId,
  tokenPlacements: ReadonlyArray<TokenPlacement>,
  condition: Tier4WeatherCondition,
  candidate?: Tier4CandidatePosition,
): Tier4TemplateField {
  const base = TIER4_PREBAKED_FIELDS[templateId];
  const plan = getPlanGeometry(templateId);
  const tokenFactor = tokenPlacements.reduce((factor, placement) => factor * tokenSpeedFactor(placement.tokenId), 1);
  const shaftFactor = tokenPlacements.some((placement) => placement.tokenId === "shaft_buffer") ? 0.72 : 1;
  const cleanFactor = condition.speedFactor * tokenFactor;
  const pull = candidate ? 0.035 : 0;

  return {
    streamlines: base.streamlines.map((line) => {
      const isShaftLine = line.id.includes("shaft") || line.id.includes("pipeshaft");
      const factor = isShaftLine ? condition.speedFactor * shaftFactor : cleanFactor;
      return {
        ...line,
        speedMps: round(line.speedMps * factor),
        points: line.points.map((point, index) => shiftPoint(point, candidate, pull * index)),
      };
    }),
    particles: base.particles.flatMap((particle) => {
      const factor = particle.kind === "pipeshaft_drift" ? condition.speedFactor * shaftFactor : cleanFactor;
      const shifted = shiftPoint(particle, candidate, pull);
      const seed = {
        ...particle,
        x: shifted.x,
        y: shifted.y,
        speedMps: round(particle.speedMps * factor),
      };
      if (particle.kind !== "pipeshaft_drift") return [seed];
      return expandPipeshaftJet(seed, plan, condition, shaftFactor);
    }),
    velocitySamples: base.velocitySamples.map((sample) => {
      const shifted = shiftPoint(sample, candidate, pull);
      const vx = round(sample.vx * condition.speedFactor + condition.vxBias);
      const vy = round(sample.vy * condition.speedFactor + condition.vyBias);
      return {
        ...sample,
        x: shifted.x,
        y: shifted.y,
        vx,
        vy,
        speedMps: round(Math.hypot(vx, vy)),
      };
    }),
  };
}

// Hard Rule #16: pipeshaft = gray, clean = amber. The seed fixture carries one
// drift particle at the opening; we expand it into a small jet field of three
// staggered particles travelling along openingDirectionDeg so the gray dust
// reads as a directional drift rather than a single dot. Delays cascade so
// they breathe in a wave rather than as a cloud.
function expandPipeshaftJet(
  seed: SimulationParticle,
  plan: ReturnType<typeof getPlanGeometry>,
  condition: Tier4WeatherCondition,
  shaftFactor: number,
): SimulationParticle[] {
  const directionRad = (plan.pipeshaft.openingDirectionDeg * Math.PI) / 180;
  const dirX = Math.cos(directionRad);
  const dirY = Math.sin(directionRad);
  const stepM = 0.32;
  const particles: SimulationParticle[] = [];
  for (let i = 0; i < 3; i++) {
    const offsetM = i * stepM;
    const fadeFactor = 1 - i * 0.18;
    particles.push({
      ...seed,
      id: i === 0 ? seed.id : `${seed.id}-jet-${i}`,
      x: round(seed.x + dirX * offsetM),
      y: round(seed.y + dirY * offsetM),
      delayMs: seed.delayMs + i * 280,
      speedMps: round(seed.speedMps * fadeFactor),
    });
  }
  return particles;
}

function buildMatrixEntryKey(templateId: TemplateId, tokenId: TokenId, candidate: Tier4CandidatePosition): string {
  return buildTier4PrebakeCacheKey({
    templateId,
    tokenPlacements: [{ tokenId, point: candidate }],
    candidatePositions: [{ tokenId, point: candidate }],
    weatherCondition: DEFAULT_TIER4_WEATHER_CONDITION,
  });
}

function buildGridFill(templateId: TemplateId, existingCount: number): Tier4CandidatePosition[] {
  const plan = getPlanGeometry(templateId);
  const needed = Math.max(0, TIER4_TEMPLATE_CANDIDATE_COUNT - existingCount);
  const columns = 5;
  const rows = 3;
  const points: Tier4CandidatePosition[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (points.length >= needed) return points;
      points.push({
        id: `grid-${row}-${col}`,
        x: round(plan.bounds.x + ((col + 1) * plan.bounds.width) / (columns + 1)),
        y: round(plan.bounds.y + ((row + 1) * plan.bounds.height) / (rows + 1)),
      });
    }
  }

  return points;
}

function dedupeCandidates(candidates: ReadonlyArray<Tier4CandidatePosition>): Tier4CandidatePosition[] {
  const seen = new Set<string>();
  const result: Tier4CandidatePosition[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.x.toFixed(2)},${candidate.y.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

function matchCandidate(templateId: TemplateId, placement?: TokenPlacement): { candidate?: Tier4CandidatePosition; distanceM: number } {
  if (!placement) return { distanceM: Number.POSITIVE_INFINITY };

  let best: Tier4CandidatePosition | undefined;
  let distanceM = Number.POSITIVE_INFINITY;

  for (const candidate of buildTier4CandidatePositions(templateId)) {
    const distance = Math.hypot(candidate.x - placement.point.x, candidate.y - placement.point.y);
    if (distance < distanceM) {
      best = candidate;
      distanceM = distance;
    }
  }

  return { candidate: best, distanceM };
}

function formatPlacements(placements: ReadonlyArray<TokenPlacement>): string {
  if (placements.length === 0) return "none";

  return [...placements]
    .map((placement) => ({
      tokenId: placement.tokenId,
      x: round(placement.point.x),
      y: round(placement.point.y),
    }))
    .sort((a, b) => a.tokenId.localeCompare(b.tokenId) || a.x - b.x || a.y - b.y)
    .map((placement) => `${placement.tokenId}@${placement.x.toFixed(2)},${placement.y.toFixed(2)}`)
    .join(";");
}

function tokenSpeedFactor(tokenId: TokenId): number {
  switch (tokenId) {
    case "wind_gate":
      return 1.1;
    case "fan_anchor":
      return 1.06;
    case "soft_screen":
      return 0.94;
    case "solar_shield":
      return 0.96;
    case "wood_anchor":
      return 0.98;
    case "shaft_buffer":
      return 1;
  }
}

function shiftPoint(point: Point, candidate: Point | undefined, weight: number): Point {
  if (!candidate || weight <= 0) return { x: round(point.x), y: round(point.y) };

  return {
    x: round(point.x + (candidate.x - point.x) * weight),
    y: round(point.y + (candidate.y - point.y) * weight),
  };
}

function roundPoint(point: Point): Point {
  return { x: round(point.x), y: round(point.y) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
