import { getOpenAIImageConfig } from "@/server/openai/client";
import { getDefaultPushSenderStatus } from "@/server/resonance/dispatch";
import { createSketchCacheFromEnv } from "@/server/storage/sketchCache";

export type OperationalCheckId =
  | "openai_tier2_account"
  | "openai_api_key"
  | "sketch_cache_r2"
  | "nea_api_key"
  | "vapid_keypair";

export type OperationalStatus = "ready" | "external" | "demo_fallback" | "not_configured" | "waived";

export interface OperationalCheck {
  id: OperationalCheckId;
  status: OperationalStatus;
  requiredForDemo: boolean;
  message: string;
  nextAction: string | null;
}

export interface OperationalRequirement {
  id: OperationalCheckId;
  evidenceKey: string;
  required: string;
  demoRequired: boolean;
  sensitive: boolean;
  example: unknown;
}

export interface OperationalPreflight {
  okForDemo: boolean;
  requirements: readonly OperationalRequirement[];
  checks: OperationalCheck[];
}

export interface OperationalEvidence {
  openaiTier2Account?: {
    verified: boolean;
    verifiedAtIso?: string;
    reviewer?: string;
  };
}

export const OPERATIONAL_REQUIREMENTS: readonly OperationalRequirement[] = [
  {
    id: "openai_tier2_account",
    evidenceKey: "operationalEvidence.openaiTier2Account",
    required: "Non-sensitive evidence that the OpenAI account is Tier 2 or above before a live GPT Image demo.",
    demoRequired: false,
    sensitive: false,
    example: {
      operationalEvidence: {
        openaiTier2Account: {
          verified: true,
          verifiedAtIso: "2026-05-10T00:00:00.000Z",
        },
      },
    },
  },
  {
    id: "openai_api_key",
    evidenceKey: "OPENAI_API_KEY",
    required: "Runtime-only OpenAI API key for live Plan/Life sketch generation. Never commit it.",
    demoRequired: false,
    sensitive: true,
    example: "Set OPENAI_API_KEY in the local runtime environment.",
  },
  {
    id: "sketch_cache_r2",
    evidenceKey: "SKETCH_CACHE_PROVIDER",
    required: "R2 is waived for the demo; local memory/file cache or committed prebaked assets are acceptable.",
    demoRequired: false,
    sensitive: false,
    example: "SKETCH_CACHE_PROVIDER=memory",
  },
  {
    id: "nea_api_key",
    evidenceKey: "NEA_API_KEY",
    required: "Runtime-only NEA key for live wind readings. Demo may use the tagged mock vector.",
    demoRequired: false,
    sensitive: true,
    example: "Set NEA_API_KEY in the local runtime environment.",
  },
  {
    id: "vapid_keypair",
    evidenceKey: "VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY",
    required: "VAPID is waived for the demo; Resonance remains in-app until push is enabled.",
    demoRequired: false,
    sensitive: true,
    example: "No demo action required. Generate VAPID keys only before enabling push.",
  },
] as const;

export async function evaluateOperationalPreflight(
  env: NodeJS.ProcessEnv = process.env,
  evidence: OperationalEvidence = {},
): Promise<OperationalPreflight> {
  const openaiConfig = getOpenAIImageConfig(env);
  const sketchCache = createSketchCacheFromEnv(env);
  const pushStatus = await getDefaultPushSenderStatus(env);
  const tier2Verified = evidence.openaiTier2Account?.verified === true;

  const checks: OperationalCheck[] = [
    {
      id: "openai_tier2_account",
      status: tier2Verified ? "ready" : "external",
      requiredForDemo: false,
      message: tier2Verified
        ? `Tier 2 OpenAI account evidence recorded${formatVerifiedAt(evidence.openaiTier2Account?.verifiedAtIso)}.`
        : "Tier 2 OpenAI account state cannot be verified from source code.",
      nextAction: tier2Verified ? null : "Verify billing/account tier outside the repo before a live GPT Image demo.",
    },
    {
      id: "openai_api_key",
      status: openaiConfig.ok ? "ready" : "demo_fallback",
      requiredForDemo: false,
      message: openaiConfig.ok
        ? "OPENAI_API_KEY is configured; live sketch materialization can be attempted."
        : "OPENAI_API_KEY is not configured; demo routes use local/prebaked assets and deterministic SVG fallbacks.",
      nextAction: openaiConfig.ok ? null : "Set OPENAI_API_KEY only in local runtime environment for live image generation.",
    },
    {
      id: "sketch_cache_r2",
      status: sketchCache.ok ? "waived" : "not_configured",
      requiredForDemo: false,
      message: sketchCache.ok
        ? `R2 is waived for the demo; sketch cache provider is ${sketchCache.kind}.`
        : sketchCache.message,
      nextAction: sketchCache.ok ? null : "Use SKETCH_CACHE_PROVIDER=memory or file; R2 is out of Phase 1 demo scope.",
    },
    {
      id: "nea_api_key",
      status: env.NEA_API_KEY ? "ready" : "demo_fallback",
      requiredForDemo: false,
      message: env.NEA_API_KEY
        ? "NEA_API_KEY is configured; Resonance can request live wind readings."
        : "NEA_API_KEY is not configured; Resonance uses the tagged mock wind vector.",
      nextAction: env.NEA_API_KEY ? null : "Set NEA_API_KEY in local runtime environment for live wind readings.",
    },
    {
      id: "vapid_keypair",
      status: pushStatus.available ? "ready" : "waived",
      requiredForDemo: false,
      message: pushStatus.available
        ? "VAPID keypair is configured; Web Push dispatch is available."
        : "VAPID is not configured; Resonance stays in-app and push remains disabled for this demo.",
      nextAction: pushStatus.available ? null : "No demo action required; generate VAPID keys only before enabling push.",
    },
  ];

  return {
    okForDemo: checks.every((check) => !check.requiredForDemo || check.status === "ready"),
    requirements: OPERATIONAL_REQUIREMENTS,
    checks,
  };
}

function formatVerifiedAt(verifiedAtIso: string | undefined): string {
  if (!verifiedAtIso) return "";
  const timestamp = Date.parse(verifiedAtIso);
  return Number.isFinite(timestamp) ? ` at ${new Date(timestamp).toISOString()}` : "";
}
