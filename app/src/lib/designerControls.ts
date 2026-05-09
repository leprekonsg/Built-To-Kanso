/**
 * Designer-mode material parameter controls.
 *
 * Brief Section 5.2 line 124: "Designer view (Phase 1, ships alongside Cultural
 * mode) exposes the full parameter set: visibility, density, turbulence,
 * softness, velocity-to-width modulation, stagnation opacity threshold,
 * texture scale, and the material preset selector."
 *
 * Cultural mode stays calm with one Wind Visibility slider in LiveStudio;
 * Designer mode surfaces the full eight knobs above the Cultural slider so
 * ID firms can tune once and trust the underlying physics.
 */

export type DesignerPreset =
  | "monsoon_atelier_default"
  | "sumi_ink"
  | "sunlit_dust"
  | "audit_lic";

export interface DesignerMaterialControls {
  preset: DesignerPreset;
  /** 0-100. "Wind Visibility — Barely Seen → Clearly Seen". Drives streamline + scene opacity. */
  visibility: number;
  /** 0-100. Streamline + particle density (count slice). 64 == legacy streamStrength baseline. */
  density: number;
  /** 0-100. Jitter / wobble amount. Surfaced as --wind-turbulence; SVG feTurbulence consumer is Phase 1.5. */
  turbulence: number;
  /** 0-100. Edge softness (gaussian / kasure). Surfaced as --streamline-softness; consumer is Phase 1.5. */
  softness: number;
  /** 0-100. How strongly per-streamline speedMps modulates stroke-width. */
  velocityWidthMod: number;
  /** 0-100. Velocity-magnitude % below which the stagnation wash kicks in. */
  stagnationOpacityThreshold: number;
  /** 0-100. Sumi-paper / fiber texture pattern scale. 42 == legacy dustStrength baseline. */
  textureScale: number;
}

export const DESIGNER_CONTROLS_STORAGE_KEY = "built-to-kanso:designer-controls";

// Defaults preserve the original streamStrength=64 / dustStrength=42 baseline.
// density inherits 64 (was streamStrength); textureScale inherits 42 (was dustStrength).
export const DEFAULT_DESIGNER_CONTROLS: DesignerMaterialControls = {
  preset: "monsoon_atelier_default",
  visibility: 58,
  density: 64,
  turbulence: 28,
  softness: 50,
  velocityWidthMod: 40,
  stagnationOpacityThreshold: 18,
  textureScale: 42,
};

const PRESETS: ReadonlySet<DesignerPreset> = new Set([
  "monsoon_atelier_default",
  "sumi_ink",
  "sunlit_dust",
  "audit_lic",
]);

export function clampPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Sanitises a possibly-corrupt persisted payload back into a valid control set.
 * Unknown / out-of-range fields fall back to defaults so a bad localStorage
 * entry never crashes the studio.
 */
export function normalizeDesignerControls(input: unknown): DesignerMaterialControls {
  if (!input || typeof input !== "object") return { ...DEFAULT_DESIGNER_CONTROLS };
  const raw = input as Partial<Record<keyof DesignerMaterialControls, unknown>>;
  const preset = typeof raw.preset === "string" && PRESETS.has(raw.preset as DesignerPreset)
    ? (raw.preset as DesignerPreset)
    : DEFAULT_DESIGNER_CONTROLS.preset;
  return {
    preset,
    visibility: clampPercent(raw.visibility ?? DEFAULT_DESIGNER_CONTROLS.visibility),
    density: clampPercent(raw.density ?? DEFAULT_DESIGNER_CONTROLS.density),
    turbulence: clampPercent(raw.turbulence ?? DEFAULT_DESIGNER_CONTROLS.turbulence),
    softness: clampPercent(raw.softness ?? DEFAULT_DESIGNER_CONTROLS.softness),
    velocityWidthMod: clampPercent(raw.velocityWidthMod ?? DEFAULT_DESIGNER_CONTROLS.velocityWidthMod),
    stagnationOpacityThreshold: clampPercent(
      raw.stagnationOpacityThreshold ?? DEFAULT_DESIGNER_CONTROLS.stagnationOpacityThreshold,
    ),
    textureScale: clampPercent(raw.textureScale ?? DEFAULT_DESIGNER_CONTROLS.textureScale),
  };
}

export function readPersistedDesignerControls(): DesignerMaterialControls | null {
  // SSR guard: window is undefined during server render.
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DESIGNER_CONTROLS_STORAGE_KEY);
    if (!raw) return null;
    return normalizeDesignerControls(JSON.parse(raw));
  } catch {
    // Corrupt JSON or storage unavailable — caller falls back to defaults.
    return null;
  }
}

export function persistDesignerControls(controls: DesignerMaterialControls): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DESIGNER_CONTROLS_STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Quota / private-mode storage failures are silent; the Designer panel
    // continues to work in-memory for this session.
  }
}
