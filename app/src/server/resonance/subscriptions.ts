// Phase 1: in-memory subscription store. One process == one Map.
// TODO: persist beyond process lifetime in Phase 2 (KV or Postgres).

export interface PushSubscriptionLike {
  endpoint: string;
  expirationTime?: number | null;
  keys?: { p256dh: string; auth: string };
}

export interface PushDispatchPlaceholder {
  available: false;
  status: "placeholder";
  message: string;
}

export interface PushDispatchResult extends PushDispatchPlaceholder {
  attempted: false;
  subscriptionCount: number;
}

const subscriptions = new Map<string, PushSubscriptionLike>();

export function register(sub: PushSubscriptionLike): void {
  if (!sub || typeof sub.endpoint !== "string" || sub.endpoint.length === 0) {
    throw new Error("PushSubscription requires a non-empty endpoint");
  }
  subscriptions.set(sub.endpoint, sub);
}

export function unregister(endpoint: string): boolean {
  return subscriptions.delete(endpoint);
}

export function list(): PushSubscriptionLike[] {
  return Array.from(subscriptions.values());
}

export function getPushDispatchStatus(): PushDispatchPlaceholder {
  return {
    available: false,
    status: "placeholder",
    message: "Push dispatch is not wired in Phase 1; API checks remain non-blocking.",
  };
}

export function dispatchResonancePushPlaceholder(): PushDispatchResult {
  return {
    ...getPushDispatchStatus(),
    attempted: false,
    subscriptionCount: subscriptions.size,
  };
}
