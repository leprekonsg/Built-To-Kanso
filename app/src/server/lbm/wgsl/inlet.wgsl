// D2Q9 constant-velocity inlet kernel.
//
// Snaps cells along the inflow edge to f_i^eq at (rho=1, u=inlet). Mirrors
// `applyInlet` in solver.ts. Runs after `stream.wgsl` each step.
//
// `inflowEdge`: 0=N, 1=S, 2=E, 3=W (matches the order used by GpuLbmSolver).
// We dispatch a 1D-shaped grid (workgroup_size 64, 1, 1) with N invocations
// covering the appropriate edge row/column.

struct Params {
  size       : u32,   // grid edge N
  inflowEdge : u32,   // 0=N, 1=S, 2=E, 3=W
  inletUx    : f32,
  inletUy    : f32,
};

const Q : u32 = 9u;
const CS2 : f32 = 1.0 / 3.0;

const EX = array<f32, 9>( 0.0,  1.0,  0.0, -1.0,  0.0,  1.0, -1.0, -1.0,  1.0);
const EY = array<f32, 9>( 0.0,  0.0,  1.0,  0.0, -1.0,  1.0,  1.0, -1.0, -1.0);
const W_ = array<f32, 9>(
  4.0/9.0,
  1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
);

@group(0) @binding(0) var<storage, read_write> f      : array<f32>;
@group(0) @binding(1) var<uniform>             params : Params;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let N = params.size;
  let t = gid.x;
  if (t >= N) { return; }

  var x : u32 = 0u;
  var y : u32 = 0u;
  // Lattice coordinates: +y = "north" -> the north edge is y = N-1.
  switch (params.inflowEdge) {
    case 0u: { x = t;       y = N - 1u; }  // north
    case 1u: { x = t;       y = 0u;     }  // south
    case 2u: { x = N - 1u;  y = t;      }  // east
    default:  { x = 0u;     y = t;      }  // west
  }

  let off = (y * N + x) * Q;
  let ux = params.inletUx;
  let uy = params.inletUy;
  let usq = ux * ux + uy * uy;
  // RHO0 = 1.0 by contract.
  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    let eu = EX[i] * ux + EY[i] * uy;
    f[off + i] = W_[i] * (1.0 + eu/CS2 + (eu*eu)/(2.0*CS2*CS2) - usq/(2.0*CS2));
  }
}
