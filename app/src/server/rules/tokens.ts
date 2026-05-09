import type { FixedElementGeometry, PlanGeometry, Point } from "@/server/geometry/types";

export type TokenId =
  | "wind_gate"
  | "soft_screen"
  | "wood_anchor"
  | "solar_shield"
  | "fan_anchor"
  | "shaft_buffer";

export const TOKEN_IDS: readonly TokenId[] = [
  "wind_gate",
  "soft_screen",
  "wood_anchor",
  "solar_shield",
  "fan_anchor",
  "shaft_buffer",
];

export interface TokenPlacement {
  tokenId: TokenId;
  point: Point;
}

export type TokenPersonalityVariant = "wabi_sabi" | "japandi" | "tropical_modernist";

export interface TokenPersonalityProfile {
  id: TokenPersonalityVariant;
  label: string;
  materialCue: string;
  tokenHints: Record<TokenId, string>;
}

const BASE_TOKEN_HINTS: Record<TokenId, string> = {
  wind_gate: "Open the cross-breeze.",
  soft_screen: "Soften the entry rush.",
  wood_anchor: "Steady a corner.",
  solar_shield: "Cool the west edge.",
  fan_anchor: "Lift marginal airflow.",
  shaft_buffer: "Deflect the pipeshaft jet.",
};

export const TOKEN_PERSONALITY_PROFILES: Record<TokenPersonalityVariant, TokenPersonalityProfile> = {
  wabi_sabi: {
    id: "wabi_sabi",
    label: "Wabi-Sabi",
    materialCue: "Weathered ceramic, linen, quiet repair.",
    tokenHints: BASE_TOKEN_HINTS,
  },
  japandi: {
    id: "japandi",
    label: "Singapore Japandi",
    materialCue: "Pale oak, rattan, warm plaster, humid restraint.",
    tokenHints: {
      ...BASE_TOKEN_HINTS,
      soft_screen: "Use a low woven edge.",
      wood_anchor: "Anchor with pale timber.",
      solar_shield: "Shade the west light cleanly.",
    },
  },
  tropical_modernist: {
    id: "tropical_modernist",
    label: "Tropical Modernist",
    materialCue: "Cane, shade cloth, pale timber, strong cross-breeze.",
    tokenHints: {
      ...BASE_TOKEN_HINTS,
      wind_gate: "Keep the breeze path legible.",
      solar_shield: "Use shade cloth and low-SHGC glass.",
      fan_anchor: "Lift the air path with a quiet fan.",
    },
  },
};

export interface TokenPlacementResult {
  allowed: boolean;
  code: "ok" | "black_state_blocked" | "shaft_buffer_out_of_range";
  message: string;
  alternatives: string[];
}

export function isTokenId(value: unknown): value is TokenId {
  return typeof value === "string" && TOKEN_IDS.includes(value as TokenId);
}

export function isTokenPersonalityVariant(value: unknown): value is TokenPersonalityVariant {
  return typeof value === "string" && value in TOKEN_PERSONALITY_PROFILES;
}

export function getTokenPersonalityProfile(variant: TokenPersonalityVariant): TokenPersonalityProfile {
  return TOKEN_PERSONALITY_PROFILES[variant];
}

export function isTokenPlacement(value: unknown): value is TokenPlacement {
  if (!value || typeof value !== "object") return false;

  const placement = value as Partial<TokenPlacement>;
  return (
    isTokenId(placement.tokenId) &&
    Number.isFinite(placement.point?.x) &&
    Number.isFinite(placement.point?.y)
  );
}

export function allowedTokenPlacements(
  plan: PlanGeometry,
  placements: ReadonlyArray<TokenPlacement>,
): TokenPlacement[] {
  return placements.filter((placement) => validateTokenPlacement(plan, placement).allowed);
}

function containsPoint(rect: FixedElementGeometry, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function blockedElementAt(plan: PlanGeometry, point: Point): FixedElementGeometry | undefined {
  return plan.fixedElements.find((element) => containsPoint(element, point));
}

export function validateTokenPlacement(
  plan: PlanGeometry,
  placement: TokenPlacement,
): TokenPlacementResult {
  const blocked = blockedElementAt(plan, placement.point);

  if (placement.tokenId === "shaft_buffer") {
    const shaftDistance = distance(placement.point, plan.pipeshaft.openingPoint);
    const onBufferEligibleShaft = plan.fixedElements.some(
      (element) =>
        element.kind === "pipeshaft_opening" &&
        element.bufferEligible &&
        containsPoint(element, placement.point),
    );

    if (shaftDistance > plan.pipeshaft.bufferRadiusM) {
      return {
        allowed: false,
        code: "shaft_buffer_out_of_range",
        message: "Place the Shaft Buffer within 0.6m of the pipeshaft door.",
        alternatives: ["Move it closer to the shaft door.", "Use a non-invasive screen nearby.", "Leave the fixed wall unchanged."],
      };
    }

    if (blocked && !onBufferEligibleShaft) {
      return goldenFailure(blocked);
    }

    return {
      allowed: true,
      code: "ok",
      message: "Shaft Buffer placement is valid.",
      alternatives: [],
    };
  }

  if (blocked) return goldenFailure(blocked);

  return {
    allowed: true,
    code: "ok",
    message: "Token placement is valid.",
    alternatives: [],
  };
}

function goldenFailure(_element: FixedElementGeometry): TokenPlacementResult {
  return {
    allowed: false,
    code: "black_state_blocked",
    message: "This wall is not asking to be changed. HDB fixed elements stay untouched.",
    alternatives: ["Place a Soft Screen nearby.", "Use a behavior token instead.", "Leave this corner unbuilt for 90 days."],
  };
}
