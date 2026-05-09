// D2Q9 zero-gradient outlet kernel.
//
// Copies the cell one step inward onto the outlet edge (the edge opposite the
// inflow). Mirrors `applyOutlet` in solver.ts.
//
// `inflowEdge`: 0=N, 1=S, 2=E, 3=W. The outlet edge is the opposite.

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

  // Destination = outlet edge cell; source = neighbour one step inward.
  var dx : u32 = 0u;
  var dy : u32 = 0u;
  var sx : u32 = 0u;
  var sy : u32 = 0u;
  // Outlet is opposite the inflow.
  switch (params.inflowEdge) {
    case 0u: { dx = t;      dy = 0u;     sx = t;      sy = 1u;     } // inflow N -> outlet S
    case 1u: { dx = t;      dy = N - 1u; sx = t;      sy = N - 2u; } // inflow S -> outlet N
    case 2u: { dx = 0u;     dy = t;      sx = 1u;     sy = t;      } // inflow E -> outlet W
    default:  { dx = N - 1u; dy = t;      sx = N - 2u; sy = t;      } // inflow W -> outlet E
  }

  let dst = (dy * N + dx) * Q;
  let src = (sy * N + sx) * Q;
  for (var i : u32 = 0u; i < Q; i = i + 1u) {
    f[dst + i] = f[src + i];
  }
}
