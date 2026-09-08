export type TemplateId = "tampines-greenweave" | "tengah-5room" | "resale-exec-1990s";

export type ConfidenceState = "green" | "amber" | "red" | "black";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomGeometry extends Rect {
  id: string;
  label: string;
  kind:
    | "entry"
    | "living"
    | "bedroom"
    | "kitchen"
    | "bathroom"
    | "service"
    | "shelter"
    | "corridor";
  confidence: ConfidenceState;
}

export interface OpeningGeometry {
  id: string;
  kind: "door" | "window" | "louver";
  roomIds: string[];
  start: Point;
  end: Point;
  operable: boolean;
}

export interface FixedElementGeometry extends Rect {
  id: string;
  kind:
    | "household_shelter"
    | "structural_wall"
    | "wet_zone"
    | "unsafe_obstruction"
    | "pipeshaft_opening";
  confidence: "black";
  bufferEligible?: boolean;
}

export interface PipeshaftGeometry {
  id: string;
  roomId: string;
  openingPoint: Point;
  openingDirectionDeg: number;
  jetVelocityMps: [number, number];
  bufferRadiusM: number;
  downwindRoomIds: string[];
}

export interface BathroomGeometry {
  roomId: string;
  exhaustPoint: Point;
}

export type ExpresswayAdjacency =
  | "none"
  | "near_pie"
  | "near_aye"
  | "near_bke"
  | "near_cte"
  | "near_kpe";

export interface SiteContext {
  expresswayAdjacency?: ExpresswayAdjacency;
  expresswayDistanceM?: number;
}

export interface PlanGeometry {
  schemaVersion: 1;
  templateId: TemplateId;
  units: "meters";
  source: "architect_curated_template";
  bounds: Rect;
  openingAreaPct: number;
  westSunFacadeDeg: number;
  defaultDoorFacingDeg: number;
  rooms: RoomGeometry[];
  openings: OpeningGeometry[];
  fixedElements: FixedElementGeometry[];
  pipeshaft?: PipeshaftGeometry | null;
  bathrooms: BathroomGeometry[];
  siteContext?: SiteContext;
}

export interface GeometryValidationResult {
  ok: boolean;
  issues: string[];
}

export type EvidenceStatus = "pending" | "verified" | "not_applicable";

export interface GeometrySourceManifest {
  schemaVersion: 1;
  templateId: TemplateId;
  geometrySha256: string;
  sourceDocument: {
    title: string;
    uri: string | null;
    sha256: string | null;
    drawingPage: string | null;
    revision: string | null;
    variant: string | null;
  };
  coordinateTransform: {
    origin: string | null;
    axes: string | null;
    planToNorthDeg: number | null;
  };
  uncertaintyM: number | null;
  intendedScope: "diagnostic" | "generic_template" | "resident_specific";
}

export interface GeometryReviewRecord {
  schemaVersion: 1;
  templateId: TemplateId;
  geometrySha256: string;
  sourceManifestSha256: string;
  reviewer: string | null;
  reviewedAt: string | null;
  statuses: {
    sourceAuthenticity: EvidenceStatus;
    geometricAccuracy: EvidenceStatus;
    asBuiltConfirmation: EvidenceStatus;
    renovationApproval: EvidenceStatus;
  };
  notes: string[];
}

export interface GeometryReleaseGateResult {
  eligible: boolean;
  basicValidation: GeometryValidationResult;
  topology: GeometryValidationResult;
  provenance: GeometryValidationResult & {
    geometrySha256: string;
    statuses: GeometryReviewRecord["statuses"];
  };
  capabilities: {
    layoutDisplay: { available: boolean; reason: string | null };
    placementAdvice: { available: boolean; reason: string | null };
    illustrativeAirflow: { available: boolean; reason: string | null };
    homeWeatherAlignment: { available: boolean; reason: string | null };
    shaftAdvice: { available: boolean; reason: string | null };
    orientationAnalysis: { available: boolean; reason: string | null };
  };
}

export interface PlanGeometryV2 {
  schemaVersion: 2;
  templateId: TemplateId;
  units: "meters";
  physical: {
    spaces: Array<{ id: string; role: "space" | "subzone"; parentSpaceId?: string; polygon: Point[] }>;
    walls: Array<{ id: string; centerline: Point[]; thicknessM: number }>;
    openings: Array<{ id: string; wallId: string; roomIds: string[]; offsetM: number; widthM: number }>;
  };
  restrictions: Array<{ id: string; kind: string; polygon: Point[]; source: string }>;
  // Source and review records are kept outside the hashed physical geometry.
}
