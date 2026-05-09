// D2Q9 BGK collision kernel.
//
// Layout: f is a flat buffer of length N*N*9 in row-major (y, x, q).
// W and E mirror the JS reference in `lattice.ts` (and the order MUST match
// so that pre-bake / GPU output stay interchangeable).
//
//        i    e_i           w_i
//        0   ( 0,  0)        4/9
//        1   ( 1,  0)        1/9
//        2   ( 0,  1)        1/9
//        3   (-1,  0)        1/9
//        4   ( 0, -1)        1/9
//        5   ( 1,  1)        1/36
//        6   (-1,  1)        1/36
//        7   (-1, -1)        1/36
//        8   ( 1, -1)        1/36
//
// Bind groups (expected layout — finalised when GpuLbmSolver.init() lands):
//   @group(0) @binding(0) var<storage, read_write> f       : array<f32>;
//   @group(0) @binding(1) var<storage, read>       mask    : array<u32>; // 1=solid
//   @group(0) @binding(2) var<uniform>             params  : Params;
//
// Workgroup is 8x8 = 64 invocations; dispatched ceil(N/8) per axis.

struct Params {
  size : u32,   // grid edge N (e.g. 64, 128, 256)
  tau  : f32,   // BGK relaxation
  _pad : vec2<f32>,
};

const Q : u32 = 9u;
const CS2 : f32 = 1.0 / 3.0;

// Mirrored from lattice.ts.
const EX = array<f32, 9>( 0.0,  1.0,  0.0, -1.0,  0.0,  1.0, -1.0, -1.0,  1.0);
const EY = array<f32, 9>( 0.0,  0.0,  1.0,  0.0, -1.0,  1.0,  1.0, -1.0, -1.0);
const W_ = array<f32, 9>(
  4.0/9.0,
  1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0,
  1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0,
);
// For bounce-back: opposite direction index.
const OPP_ = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

@group(0) @binding(0) var<storage, read_write> f    : array<f32>;
@group(0) @binding(1) var<storage, read>       mask : array<u32>;
@group(0) @binding(2) var<uniform>             params : Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let N = params.size;
  if (gid.x >= N || gid.y >= N) { return; }

  let cell = gid.y * N + gid.x;
  let off  = cell * Q;

  // Solid: bounce-back (swap opposite distributions).
  if (mask[cell] == 1u) {
    // Pairs: (1,3), (2,4), (5,7), (6,8). f[0] unchanged.
    for (var i : u32 = 1u; i < Q; i = i + 1u) {
      let opp_i = OPP_[i];
      if (i < opp_i) {
        let a = off + i;
        let b = off + opp_i;
        let tmp = f[a];
        f[a] = f[b];
        f[b] = tmp;
      }
    }
    return;
  }

  // Moments.
  var rho : f32 = 0.0;
  var mx  : f32 = 0.0;
  var my  : f32 = 0.0;
  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    let fi = f[off + i];
    rho = rho + fi;
    mx  = mx  + fi * EX[i];
    my  = my  + fi * EY[i];
  }
  rho = max(rho, 1e-9);
  let ux = mx / rho;
  let uy = my / rho;
  let usq = ux * ux + uy * uy;
  let omega = 1.0 / params.tau;

  // BGK update.
  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    let eu  = EX[i] * ux + EY[i] * uy;
    let feq = W_[i] * rho * (1.0 + eu/CS2 + (eu*eu)/(2.0*CS2*CS2) - usq/(2.0*CS2));
    f[off + i] = f[off + i] - omega * (f[off + i] - feq);
  }
}

// TODO: tune workgroup size for the 256x256 canonical grid (likely 16x16).
// TODO: add atomics-free shared-memory tiling for cache locality if needed.
// Until then the JS reference (`solver.ts`) is the source of truth.
