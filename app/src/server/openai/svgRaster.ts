// Rasterize deterministic SVG sketches to PNG so they can be fed to the
// gpt-image-2 image-edit endpoint as a structural reference image.
//
// @resvg/resvg-js is loaded lazily via dynamic import so the route layer
// keeps working on environments where the optional native binding is not
// installed. On a missing/broken installation we return a typed failure;
// callers should fall back to the deterministic SVG response.

export type RasterizeResult =
  | { ok: true; png: Buffer; width: number; height: number }
  | {
      ok: false;
      reason: "rasterizer_unavailable" | "rasterizer_error";
      message: string;
    };

interface ResvgInstance {
  render(): { asPng(): Uint8Array };
}

interface ResvgConstructor {
  new (svg: string | Buffer, opts?: unknown): ResvgInstance;
}

interface ResvgModule {
  Resvg?: ResvgConstructor;
  default?: { Resvg?: ResvgConstructor };
}

let cached: ResvgConstructor | null | undefined;

async function loadResvg(): Promise<ResvgConstructor | null> {
  if (cached !== undefined) return cached;
  try {
    // Optional native dependency. Keep the import opaque to Turbopack so the
    // native binding is only loaded when this route actually rasterizes SVG.
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<unknown>;
    const mod = (await dynamicImport("@resvg/resvg-js")) as ResvgModule;
    const ctor = mod.Resvg ?? mod.default?.Resvg ?? null;
    cached = ctor;
    return ctor;
  } catch {
    cached = null;
    return null;
  }
}

export async function rasterizeSvgToPng(svg: string, width = 1024): Promise<RasterizeResult> {
  const Resvg = await loadResvg();
  if (!Resvg) {
    return {
      ok: false,
      reason: "rasterizer_unavailable",
      message: "Optional dependency '@resvg/resvg-js' is not installed. Install it to enable PNG rasterization for GPT Image 2 calls, or rely on the deterministic SVG response.",
    };
  }

  try {
    const inst = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      background: "rgba(245,241,232,1)",
    });
    const buffer = Buffer.from(inst.render().asPng());
    return { ok: true, png: buffer, width, height: width };
  } catch (err) {
    return {
      ok: false,
      reason: "rasterizer_error",
      message: err instanceof Error ? err.message : "Rasterization failed.",
    };
  }
}

// Test-only: reset the cached resvg constructor so unit tests that mock
// dynamic imports stay isolated. Not exported from any public barrel.
export function __resetSvgRasterizerCacheForTests(): void {
  cached = undefined;
}
