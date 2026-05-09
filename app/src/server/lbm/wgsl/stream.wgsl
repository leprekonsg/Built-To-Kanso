// D2Q9 streaming kernel.
//
// Reads from `fSrc`, writes to `fDst`. The JS reference does this in two
// passes (`f` and `fNew`); on the GPU we ping-pong between two buffers and
// the host code rebinds them between steps.
//
// Boundary handling: the inflow/outlet edges are fixed up by separate
// dispatches (see GpuLbmSolver.applyInlet/applyOutlet — TODO). This kernel
// is intentionally a simple periodic stream so it can be reasoned about in
// isolation.

struct Params {
  size : u32,
  tau  : f32,    // unused here; kept for binding compatibility with collide
  _pad : vec2<f32>,
};

const Q : u32 = 9u;
const EX_I = array<i32, 9>( 0,  1,  0, -1,  0,  1, -1, -1,  1);
const EY_I = array<i32, 9>( 0,  0,  1,  0, -1,  1,  1, -1, -1);

@group(0) @binding(0) var<storage, read>       fSrc   : array<f32>;
@group(0) @binding(1) var<storage, read_write> fDst   : array<f32>;
@group(0) @binding(2) var<uniform>             params : Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let N  = params.size;
  let Ni = i32(N);
  if (gid.x >= N || gid.y >= N) { return; }

  let xi = i32(gid.x);
  let yi = i32(gid.y);
  let dst = (gid.y * N + gid.x) * Q;

  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    // Pull-stream: f_i(x, t+1) = f_i(x - e_i, t).
    let sxi = ((xi - EX_I[i]) % Ni + Ni) % Ni;
    let syi = ((yi - EY_I[i]) % Ni + Ni) % Ni;
    let src = (u32(syi) * N + u32(sxi)) * Q + i;
    fDst[dst + i] = fSrc[src];
  }
}

// TODO: replace periodic wrap with proper inlet/outlet/bounce-back fix-up
// dispatches once GpuLbmSolver lands. The JS reference applies these as
// post-stream passes in solver.ts.
