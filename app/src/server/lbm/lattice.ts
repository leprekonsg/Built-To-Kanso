/**
 * D2Q9 lattice constants and equilibrium distribution.
 *
 *      6 2 5
 *       \|/
 *      3-0-1
 *       /|\
 *      7 4 8
 *
 * Index 0 is rest; 1..4 are the cardinal directions; 5..8 are diagonals.
 * Weights: rest 4/9, cardinal 1/9, diagonal 1/36.
 *
 * Vercel rule "server-hoist-static-io": these constants live at module scope
 * so they are allocated once per worker, not per request.
 */

/** Lattice velocity vectors e_i for D2Q9. */
export const E: ReadonlyArray<readonly [number, number]> = [
  [0, 0], //  0 rest
  [1, 0], //  1 east
  [0, 1], //  2 north (we use +y = "north" in lattice coords)
  [-1, 0], // 3 west
  [0, -1], // 4 south
  [1, 1], //  5 NE
  [-1, 1], // 6 NW
  [-1, -1], // 7 SW
  [1, -1], // 8 SE
];

/** Lattice weights w_i for D2Q9. Sum = 1. */
export const W: ReadonlyArray<number> = [
  4 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 36,
  1 / 36,
  1 / 36,
  1 / 36,
];

/** Index of the opposite-direction lattice vector, used for bounce-back. */
export const OPP: ReadonlyArray<number> = [0, 3, 4, 1, 2, 7, 8, 5, 6];

export const Q = 9;
/** Speed of sound squared in lattice units, c_s^2 = 1/3. */
export const CS2 = 1 / 3;
const CS4 = CS2 * CS2;

/**
 * Maxwell-Boltzmann equilibrium distribution f_i^eq.
 * f_i^eq = w_i * rho * (1 + e_i.u/cs2 + (e_i.u)^2/(2 cs4) - u.u/(2 cs2))
 */
export function equilibrium(rho: number, ux: number, uy: number): Float32Array {
  const out = new Float32Array(Q);
  const usq = ux * ux + uy * uy;
  for (let i = 0; i < Q; i++) {
    const ex = E[i][0];
    const ey = E[i][1];
    const eu = ex * ux + ey * uy;
    out[i] = W[i] * rho * (1 + eu / CS2 + (eu * eu) / (2 * CS4) - usq / (2 * CS2));
  }
  return out;
}

/**
 * In-place equilibrium write into a flat distribution buffer at offset.
 * Avoids per-cell allocations during init/inlet enforcement.
 */
export function writeEquilibrium(
  out: Float32Array,
  offset: number,
  rho: number,
  ux: number,
  uy: number,
): void {
  const usq = ux * ux + uy * uy;
  for (let i = 0; i < Q; i++) {
    const ex = E[i][0];
    const ey = E[i][1];
    const eu = ex * ux + ey * uy;
    out[offset + i] = W[i] * rho * (1 + eu / CS2 + (eu * eu) / (2 * CS4) - usq / (2 * CS2));
  }
}
