import type { PlanGeometry } from "@/server/geometry/types";
import { evaluateResonance } from "./resonance";
import {
  list,
  recordNotification,
  unregisterByEndpoint,
  type PushSubscriptionLike,
  type UserSubscription,
} from "./subscriptions";
import type { ResonanceEvaluation, WindReading } from "./types";

export interface ResonancePushPayload {
  title: "Resonance Hours";
  body: "Outdoor wind aligns with the illustrated path. Indoor airflow is not measured.";
  url: "/threshold?resonance=now";
  tag: "resonance-hours";
  timestamp: string;
}

export type PushSenderStatus =
  | { available: true; status: "configured" }
  | {
      available: false;
      status: "not_configured";
      message: string;
      missing: string[];
    }
  | {
      available: false;
      status: "dependency_unavailable";
      message: string;
    };
type UnavailablePushSenderStatus = Exclude<PushSenderStatus, { available: true }>;

export interface PushSender {
  status: PushSenderStatus;
  send(subscription: PushSubscriptionLike, payload: ResonancePushPayload): Promise<void>;
}

interface DispatchScheduledInput {
  plan: PlanGeometry;
  floor: number;
  now?: Date;
  wind: WindReading;
  predictedIndoorSpeedMps?: number;
  // Diagnostic fallbacks when no per-user record exists (e.g. /api/resonance/check
  // POSTs without a userId). Per-user records always take precedence.
  lastNotifiedAtIso?: string | null;
  recentNotificationsIso?: string[];
  dryRun?: boolean;
  sender?: PushSender;
}

export type DispatchStatus =
  | "skipped"
  | "dry_run"
  | "no_subscriptions"
  | "not_configured"
  | "dependency_unavailable"
  | "sent"
  | "partial_failure"
  | "send_failed";

export interface DispatchScheduledResult {
  status: DispatchStatus;
  attempted: boolean;
  subscriptionCount: number;
  sentCount: number;
  failedCount: number;
  prunedCount: number;
  payload: ResonancePushPayload | null;
  evaluation: ResonanceEvaluation;
  senderStatus: PushSenderStatus;
  // Per-user evaluations expose why each non-sent subscription was skipped.
  perUserEvaluations?: Array<{ userId: string; evaluation: ResonanceEvaluation }>;
}

interface WebPushModule {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: PushSubscriptionLike, payload: string): Promise<unknown>;
}

export async function dispatchScheduledResonancePush(
  input: DispatchScheduledInput,
): Promise<DispatchScheduledResult> {
  const now = input.now ?? new Date();
  const sender = input.sender ?? (await createDefaultPushSender());
  const subscriptionSnapshot = list({ status: "active" });

  // No subscriptions: still produce a representative evaluation for diagnostic
  // callers (e.g. /api/resonance/check without registered users).
  if (subscriptionSnapshot.length === 0) {
    const diagnosticEval = evaluateResonance({
      plan: input.plan,
      floor: input.floor,
      lastNotifiedAtIso: input.lastNotifiedAtIso ?? null,
      recentNotificationsIso: input.recentNotificationsIso ?? [],
      now,
      wind: input.wind,
      predictedIndoorSpeedMps: input.predictedIndoorSpeedMps,
    });
    const payload = diagnosticEval.shouldNotify ? buildResonancePushPayload(now) : null;
    if (input.dryRun) {
      return result("dry_run", false, 0, 0, 0, 0, payload, diagnosticEval, sender);
    }
    if (!diagnosticEval.shouldNotify) {
      return result("skipped", false, 0, 0, 0, 0, null, diagnosticEval, sender);
    }
    return result("no_subscriptions", false, 0, 0, 0, 0, payload, diagnosticEval, sender);
  }

  // Evaluate each subscription with its own tier + sleep window + history.
  const evaluations = subscriptionSnapshot.map((subscription) => ({
    subscription,
    evaluation: evaluateResonance({
      plan: input.plan,
      floor: input.floor,
      lastNotifiedAtIso: subscription.lastNotifiedAtIso,
      recentNotificationsIso: subscription.recentNotificationsIso,
      now,
      wind: input.wind,
      predictedIndoorSpeedMps: input.predictedIndoorSpeedMps,
      tier: subscription.frequencyTier,
      sleepWindow: {
        sleepStartHourSgt: subscription.sleepStartHourSgt,
        sleepStartMinuteSgt: subscription.sleepStartMinuteSgt,
        sleepEndHourSgt: subscription.sleepEndHourSgt,
        sleepEndMinuteSgt: subscription.sleepEndMinuteSgt,
      },
      optInAtIso: subscription.optInAtIso,
    }),
  }));

  const recipients = evaluations.filter((entry) => entry.evaluation.shouldNotify);
  // Aggregate evaluation: prefer the first recipient's eval; otherwise the
  // first non-recipient. This keeps the response shape compatible with callers
  // that read `dispatch.evaluation`.
  const aggregateEvaluation =
    recipients[0]?.evaluation ?? evaluations[0]?.evaluation ?? noCorridorEvaluation();
  const perUserEvaluations = evaluations.map(({ subscription, evaluation }) => ({
    userId: subscription.userId,
    evaluation,
  }));

  if (recipients.length === 0) {
    return {
      ...result(
        "skipped",
        false,
        subscriptionSnapshot.length,
        0,
        0,
        0,
        null,
        aggregateEvaluation,
        sender,
      ),
      perUserEvaluations,
    };
  }

  const payload = buildResonancePushPayload(now);

  if (input.dryRun) {
    return {
      ...result(
        "dry_run",
        false,
        subscriptionSnapshot.length,
        0,
        0,
        0,
        payload,
        aggregateEvaluation,
        sender,
      ),
      perUserEvaluations,
    };
  }

  if (!sender.status.available) {
    const status =
      sender.status.status === "not_configured" ? "not_configured" : "dependency_unavailable";
    return {
      ...result(
        status,
        false,
        subscriptionSnapshot.length,
        0,
        0,
        0,
        payload,
        aggregateEvaluation,
        sender,
      ),
      perUserEvaluations,
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  let prunedCount = 0;

  await Promise.all(
    recipients.map(async ({ subscription }) => {
      try {
        await sender.send(subscriptionForSender(subscription), payload);
        sentCount += 1;
        recordNotification(subscription.userId, now.toISOString());
      } catch (error) {
        failedCount += 1;
        if (isPermanentEndpointFailure(error) && unregisterByEndpoint(subscription.endpoint)) {
          prunedCount += 1;
        }
      }
    }),
  );

  const status =
    failedCount === 0 ? "sent" : sentCount > 0 ? "partial_failure" : "send_failed";

  return {
    ...result(
      status,
      true,
      subscriptionSnapshot.length,
      sentCount,
      failedCount,
      prunedCount,
      payload,
      aggregateEvaluation,
      sender,
    ),
    perUserEvaluations,
  };
}

export async function getDefaultPushSenderStatus(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PushSenderStatus> {
  const sender = await createDefaultPushSender(env);
  return sender.status;
}

// Kept for back-compat with existing tests/scripts. Per-user history now lives
// in the subscription store; this function is a no-op for that history but
// still resets any module-level state we might add later.
export function resetResonanceDispatchStateForTest(): void {
  // intentional no-op; per-user history is cleared via clearForTest().
}

function buildResonancePushPayload(now: Date): ResonancePushPayload {
  return {
    title: "Resonance Hours",
    body: "Outdoor wind aligns with the illustrated path. Indoor airflow is not measured.",
    url: "/threshold?resonance=now",
    tag: "resonance-hours",
    timestamp: now.toISOString(),
  };
}

function subscriptionForSender(subscription: UserSubscription): PushSubscriptionLike {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: subscription.keys,
  };
}

function noCorridorEvaluation(): ResonanceEvaluation {
  return {
    resonating: false,
    shouldNotify: false,
    reason: "no_subscriptions",
    nextEligibleAt: null,
    tier: "weather_context",
    alignmentEventId: null,
  };
}

async function createDefaultPushSender(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PushSender> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    const missing = [
      !publicKey ? "VAPID_PUBLIC_KEY" : null,
      !privateKey ? "VAPID_PRIVATE_KEY" : null,
    ].filter((name): name is string => typeof name === "string");
    const status: PushSenderStatus = {
      available: false,
      status: "not_configured",
      message: `Set ${missing.join(" and ")} in env before dispatching Resonance Hours.`,
      missing,
    };
    return unavailableSender(status);
  }

  const webPush = await importOptionalWebPush();
  if (!webPush) {
    return unavailableSender({
      available: false,
      status: "dependency_unavailable",
      message: "Install web-push to enable Resonance Hours dispatch.",
    });
  }

  try {
    webPush.setVapidDetails(
      env.VAPID_SUBJECT ?? "mailto:hello@built-to-kanso.local",
      publicKey,
      privateKey,
    );
  } catch {
    return unavailableSender({
      available: false,
      status: "not_configured",
      message: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be a valid Web Push keypair.",
      missing: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
    });
  }

  return {
    status: { available: true, status: "configured" },
    async send(subscription, payload) {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
    },
  };
}

function unavailableSender(status: UnavailablePushSenderStatus): PushSender {
  return {
    status,
    async send() {
      throw new Error(status.message);
    },
  };
}

async function importOptionalWebPush(): Promise<WebPushModule | null> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<unknown>;

  try {
    const imported = await dynamicImport("web-push");
    const webPushModule = (imported as { default?: unknown }).default ?? imported;
    return webPushModule as WebPushModule;
  } catch {
    return null;
  }
}

function isPermanentEndpointFailure(error: unknown): boolean {
  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    response?: { statusCode?: unknown; status?: unknown };
  };
  const statusCode =
    candidate.statusCode ??
    candidate.status ??
    candidate.response?.statusCode ??
    candidate.response?.status;

  return statusCode === 404 || statusCode === 410;
}

function result(
  status: DispatchStatus,
  attempted: boolean,
  subscriptionCount: number,
  sentCount: number,
  failedCount: number,
  prunedCount: number,
  payload: ResonancePushPayload | null,
  evaluation: ResonanceEvaluation,
  sender: PushSender,
): DispatchScheduledResult {
  return {
    status,
    attempted,
    subscriptionCount,
    sentCount,
    failedCount,
    prunedCount,
    payload,
    evaluation,
    senderStatus: sender.status,
  };
}
