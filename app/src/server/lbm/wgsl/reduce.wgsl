// Reduce moments to (ux, uy). One invocation per cell.
//
// Mirrors `reduceToVelocity` in solver.ts: solid cells become (0, 0), fluid
// cells return mx/rho, my/rho. Output is a vec2<f32> per cell, packed as
// [u, v] interleaved row-major (matches RawVelocityField.data layout).

struct Params {
  size : u32,
  tau  : f32,
  _pad : vec2<f32>,
};

const Q : u32 = 9u;
const EX = array<f32, 9>( 0.0,  1.0,  0.0, -1.0,  0.0,  1.0, -1.0, -1.0,  1.0);
const EY = array<f32, 9>( 0.0,  0.0,  1.0,  0.0, -1.0,  1.0,  1.0, -1.0, -1.0);

@group(0) @binding(0) var<storage, read>       f      : array<f32>;
@group(0) @binding(1) var<storage, read>       mask   : array<u32>;
@group(0) @binding(2) var<storage, read_write> uvOut  : array<vec2<f32>>;
@group(0) @binding(3) var<uniform>             params : Params;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let N = params.size;
  if (gid.x >= N || gid.y >= N) { return; }

  let cell = gid.y * N + gid.x;

  if (mask[cell] == 1u) {
    uvOut[cell] = vec2<f32>(0.0, 0.0);
    return;
  }

  let off = cell * Q;
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
  uvOut[cell] = vec2<f32>(mx / rho, my / rho);
}
