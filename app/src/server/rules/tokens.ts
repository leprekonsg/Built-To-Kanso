import type { FixedElementGeometry, PlanGeometry, Point } from "@/server/geometry/types";

export type TokenId =
  | "wind_gate"
  | "soft_screen"
  | "wood_anchor"
  | "solar_shield"
  | "fan_anchor"
  | "shaft_buffer";

export interface TokenPlacement {
  tokenId: TokenId;
  point: Point;
}

export interface TokenPlacementResult {
  allowed: boolean;
  code: "ok" | "black_state_blocked" | "shaft_buffer_out_of_range";
  message: string;
  alternatives: string[];
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

function goldenFailure(element: FixedElementGeometry): TokenPlacementResult {
  return {
    allowed: false,
    code: "black_state_blocked",
    message: "This wall is not asking to be changed. HDB fixed elements stay untouched.",
    alternatives: ["Place a Soft Screen nearby.", "Use a behavior token instead.", "Leave this corner unbuilt for 90 days."],
  };
}
