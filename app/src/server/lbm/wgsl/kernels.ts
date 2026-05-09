/**
 * Inlined WGSL kernel sources.
 *
 * The .wgsl files in this directory are the human-readable source of truth and
 * what reviewers should read. The TS strings here are kept byte-identical so
 * the browser bundle ships the kernels without needing a bundler loader for
 * raw text imports. When you edit a .wgsl file, copy the body into the
 * matching string below.
 */

export const COLLIDE_WGSL = /* wgsl */ `
struct Params {
  size : u32,
  tau  : f32,
  _pad : vec2<f32>,
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

  if (mask[cell] == 1u) {
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

  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    let eu  = EX[i] * ux + EY[i] * uy;
    let feq = W_[i] * rho * (1.0 + eu/CS2 + (eu*eu)/(2.0*CS2*CS2) - usq/(2.0*CS2));
    f[off + i] = f[off + i] - omega * (f[off + i] - feq);
  }
}
`;

export const STREAM_WGSL = /* wgsl */ `
struct Params {
  size : u32,
  tau  : f32,
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
    let sxi = ((xi - EX_I[i]) % Ni + Ni) % Ni;
    let syi = ((yi - EY_I[i]) % Ni + Ni) % Ni;
    let src = (u32(syi) * N + u32(sxi)) * Q + i;
    fDst[dst + i] = fSrc[src];
  }
}
`;

export const INLET_WGSL = /* wgsl */ `
struct Params {
  size       : u32,
  inflowEdge : u32,
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
  switch (params.inflowEdge) {
    case 0u: { x = t;       y = N - 1u; }
    case 1u: { x = t;       y = 0u;     }
    case 2u: { x = N - 1u;  y = t;      }
    default:  { x = 0u;     y = t;      }
  }

  let off = (y * N + x) * Q;
  let ux = params.inletUx;
  let uy = params.inletUy;
  let usq = ux * ux + uy * uy;
  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    let eu = EX[i] * ux + EY[i] * uy;
    f[off + i] = W_[i] * (1.0 + eu/CS2 + (eu*eu)/(2.0*CS2*CS2) - usq/(2.0*CS2));
  }
}
`;

export const OUTLET_WGSL = /* wgsl */ `
struct Params {
  size       : u32,
  inflowEdge : u32,
  inletUx    : f32,
  inletUy    : f32,
};

const Q : u32 = 9u;

@group(0) @binding(0) var<storage, read_write> f      : array<f32>;
@group(0) @binding(1) var<uniform>             params : Params;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let N = params.size;
  let t = gid.x;
  if (t >= N) { return; }

  var dx : u32 = 0u;
  var dy : u32 = 0u;
  var sx : u32 = 0u;
  var sy : u32 = 0u;
  switch (params.inflowEdge) {
    case 0u: { dx = t;      dy = 0u;     sx = t;      sy = 1u;     }
    case 1u: { dx = t;      dy = N - 1u; sx = t;      sy = N - 2u; }
    case 2u: { dx = 0u;     dy = t;      sx = 1u;     sy = t;      }
    default:  { dx = N - 1u; dy = t;      sx = N - 2u; sy = t;      }
  }

  let dst = (dy * N + dx) * Q;
  let src = (sy * N + sx) * Q;
  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    f[dst + i] = f[src + i];
  }
}
`;

export const REDUCE_WGSL = /* wgsl */ `
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
`;
