/**
 * Types for the illustrative D2Q9 airflow prototype. Grid dimensions are
 * runtime values and may differ between live and pre-baked visualisations.
 * These fields drive presentation only; they are not measured indoor airflow.
 */

export interface VelocityField {
  width: number;
  height: number;
  /** size width*height*2: [u, v] interleaved, row-major (y * width + x) * 2 */
  data: Float32Array;
}

export type StreamlineSource =
  | { kind: "boundary"; edge: "north" | "south" | "east" | "west"; index: number }
  | { kind: "interior_diagnostic"; index: number }
  | { kind: "pipeshaft"; shaftId: string };

export interface LbmConfig {
  templateId: string;
  /** Compass heading of inflow wind, degrees (0=N, 90=E, 180=S, 270=W). */
  compassDeg: number;
  ambientWindMps: number;
  iterations: number;
}

export interface ObstacleMask {
  width: number;
  height: number;
  /** 1 = solid (bounce-back), 0 = fluid */
  data: Uint8Array;
}

/** Internal structural view used by solvers and presentation builders. */
export interface RawVelocityField {
  width: number;
  height: number;
  data: Float32Array;
}
