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
  pipeshaft: PipeshaftGeometry;
  bathrooms: BathroomGeometry[];
  siteContext?: SiteContext;
}

export interface GeometryValidationResult {
  ok: boolean;
  issues: string[];
}
