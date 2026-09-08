import type { TemplateId } from "./types";

export type ReleaseCapability =
  | "layout_display"
  | "placement_advice"
  | "illustrative_airflow"
  | "home_weather_alignment";

export type ReleaseOutput = "plan_svg" | "plan_sketch" | "life_sketch" | "wind_sketch" | "resonance_hour";

export interface ReleaseManifestEntry {
  templateId: TemplateId;
  capabilities: ReleaseCapability[];
  outputs: ReleaseOutput[];
}

export interface ReleaseManifest {
  id: string;
  entries: ReleaseManifestEntry[];
}

export const PHASE1_RELEASE_MANIFEST: ReleaseManifest = {
  id: "phase1-source-reviewed-layout",
  entries: [
    {
      templateId: "tampines-greenweave",
      capabilities: ["layout_display"],
      outputs: ["plan_svg"],
    },
  ],
};

export function releaseManifestEntry(
  templateId: TemplateId,
  manifest: ReleaseManifest = PHASE1_RELEASE_MANIFEST,
): ReleaseManifestEntry | null {
  return manifest.entries.find((entry) => entry.templateId === templateId) ?? null;
}

export function releaseManifestAllows(
  templateId: TemplateId,
  capability: ReleaseCapability,
  manifest: ReleaseManifest = PHASE1_RELEASE_MANIFEST,
): boolean {
  return releaseManifestEntry(templateId, manifest)?.capabilities.includes(capability) ?? false;
}
