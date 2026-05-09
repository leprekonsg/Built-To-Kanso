// Phase 1: in-memory per-user Resonance Hours subscription store.
// Brief 14.5 — frequency tier, sleep window, opt-in grace, recent history.
// TODO: persist beyond process lifetime in Phase 2 (KV or Postgres).

import { createHash } from "node:crypto";
import {
  DEFAULT_SLEEP_END_HOUR_SGT,
  DEFAULT_SLEEP_END_MINUTE_SGT,
  DEFAULT_SLEEP_START_HOUR_SGT,
  DEFAULT_SLEEP_START_MINUTE_SGT,
} from "./sleepSuppress";
import type { FrequencyTier } from "./types";

export interface PushSubscriptionLike {
  endpoint: string;
  expirationTime?: number | null;
  keys?: { p256dh: string; auth: string };
}

export interface SleepWindowSettings {
  sleepStartHourSgt: number;
  sleepStartMinuteSgt: number;
  sleepEndHourSgt: number;
  sleepEndMinuteSgt: number;
}

export interface UserSubscription extends PushSubscriptionLike, SleepWindowSettings {
  userId: string;
  frequencyTier: FrequencyTier;
  optInAtIso: string;
  lastNotifiedAtIso: string | null;
  recentNotificationsIso: string[];
  status: "active" | "opted_out";
}

const FREQUENCY_TIERS: ReadonlySet<FrequencyTier> = new Set(["calm", "standard", "active"]);
const RECENT_NOTIFICATIONS_CAP = 30;

const subscriptionsByUser = new Map<string, UserSubscription>();
const userIdByEndpoint = new Map<string, string>();

export interface RegisterInput extends PushSubscriptionLike {
  userId?: string;
  frequencyTier?: FrequencyTier;
  sleepStartHourSgt?: number;
  sleepStartMinuteSgt?: number;
  sleepEndHourSgt?: number;
  sleepEndMinuteSgt?: number;
  // Test-only override: pin the opt-in instant (otherwise derived from `now`).
  optInAtIso?: string;
}

export interface RegisterOptions {
  now?: Date;
}

export function register(input: RegisterInput, options: RegisterOptions = {}): UserSubscription {
  if (!input || typeof input.endpoint !== "string" || input.endpoint.length === 0) {
    throw new Error("PushSubscription requires a non-empty endpoint");
  }

  const userId = (typeof input.userId === "string" && input.userId.length > 0)
    ? input.userId
    : deriveUserIdFromEndpoint(input.endpoint);

  const frequencyTier = input.frequencyTier ?? "standard";
  if (!FREQUENCY_TIERS.has(frequencyTier)) {
    throw new Error(`frequencyTier must be one of calm|standard|active (got ${frequencyTier})`);
  }

  const sleep = validateSleepWindow({
    sleepStartHourSgt: input.sleepStartHourSgt ?? DEFAULT_SLEEP_START_HOUR_SGT,
    sleepStartMinuteSgt: input.sleepStartMinuteSgt ?? DEFAULT_SLEEP_START_MINUTE_SGT,
    sleepEndHourSgt: input.sleepEndHourSgt ?? DEFAULT_SLEEP_END_HOUR_SGT,
    sleepEndMinuteSgt: input.sleepEndMinuteSgt ?? DEFAULT_SLEEP_END_MINUTE_SGT,
  });

  const now = options.now ?? new Date();
  const existing = subscriptionsByUser.get(userId);

  // Re-registering after opt-out (or refreshing a known endpoint) resets the
  // 24h grace window per brief 14.5: "24-hour grace period on opt-in resumption".
  // An explicit optInAtIso override (test-only path) wins over both branches.
  const optInAtIso =
    typeof input.optInAtIso === "string" && !Number.isNaN(Date.parse(input.optInAtIso))
      ? input.optInAtIso
      : existing && existing.status === "active"
        ? existing.optInAtIso
        : now.toISOString();

  // If endpoint changed for this userId, clear the old endpoint mapping.
  if (existing && existing.endpoint !== input.endpoint) {
    userIdByEndpoint.delete(existing.endpoint);
  }

  const record: UserSubscription = {
    userId,
    endpoint: input.endpoint,
    expirationTime: input.expirationTime ?? null,
    keys: input.keys,
    frequencyTier,
    sleepStartHourSgt: sleep.sleepStartHourSgt,
    sleepStartMinuteSgt: sleep.sleepStartMinuteSgt,
    sleepEndHourSgt: sleep.sleepEndHourSgt,
    sleepEndMinuteSgt: sleep.sleepEndMinuteSgt,
    optInAtIso,
    lastNotifiedAtIso: existing?.lastNotifiedAtIso ?? null,
    recentNotificationsIso: existing?.recentNotificationsIso ?? [],
    status: "active",
  };

  subscriptionsByUser.set(userId, record);
  userIdByEndpoint.set(input.endpoint, userId);
  return record;
}

export function unregister(userId: string): boolean {
  const record = subscriptionsByUser.get(userId);
  if (!record) return false;
  subscriptionsByUser.delete(userId);
  userIdByEndpoint.delete(record.endpoint);
  return true;
}

export function unregisterByEndpoint(endpoint: string): boolean {
  const userId = userIdByEndpoint.get(endpoint);
  if (!userId) return false;
  return unregister(userId);
}

export function get(userId: string): UserSubscription | null {
  return subscriptionsByUser.get(userId) ?? null;
}

export function getByEndpoint(endpoint: string): UserSubscription | null {
  const userId = userIdByEndpoint.get(endpoint);
  if (!userId) return null;
  return subscriptionsByUser.get(userId) ?? null;
}

export interface ListFilter {
  tier?: FrequencyTier;
  status?: UserSubscription["status"];
}

export function list(filter: ListFilter = {}): UserSubscription[] {
  const all = Array.from(subscriptionsByUser.values());
  return all.filter((sub) => {
    if (filter.tier !== undefined && sub.frequencyTier !== filter.tier) return false;
    if (filter.status !== undefined && sub.status !== filter.status) return false;
    return true;
  });
}

export function count(filter: ListFilter = {}): number {
  return list(filter).length;
}

export function countByTier(): Record<FrequencyTier, number> {
  const result: Record<FrequencyTier, number> = { calm: 0, standard: 0, active: 0 };
  for (const sub of subscriptionsByUser.values()) {
    if (sub.status !== "active") continue;
    result[sub.frequencyTier] += 1;
  }
  return result;
}

export interface UpdateSettingsInput {
  frequencyTier?: FrequencyTier;
  sleepStartHourSgt?: number;
  sleepStartMinuteSgt?: number;
  sleepEndHourSgt?: number;
  sleepEndMinuteSgt?: number;
  status?: UserSubscription["status"];
}

export function updateSettings(userId: string, partial: UpdateSettingsInput): UserSubscription | null {
  const existing = subscriptionsByUser.get(userId);
  if (!existing) return null;

  if (partial.frequencyTier !== undefined && !FREQUENCY_TIERS.has(partial.frequencyTier)) {
    throw new Error(`frequencyTier must be one of calm|standard|active (got ${partial.frequencyTier})`);
  }

  const sleep = validateSleepWindow({
    sleepStartHourSgt: partial.sleepStartHourSgt ?? existing.sleepStartHourSgt,
    sleepStartMinuteSgt: partial.sleepStartMinuteSgt ?? existing.sleepStartMinuteSgt,
    sleepEndHourSgt: partial.sleepEndHourSgt ?? existing.sleepEndHourSgt,
    sleepEndMinuteSgt: partial.sleepEndMinuteSgt ?? existing.sleepEndMinuteSgt,
  });

  const next: UserSubscription = {
    ...existing,
    frequencyTier: partial.frequencyTier ?? existing.frequencyTier,
    sleepStartHourSgt: sleep.sleepStartHourSgt,
    sleepStartMinuteSgt: sleep.sleepStartMinuteSgt,
    sleepEndHourSgt: sleep.sleepEndHourSgt,
    sleepEndMinuteSgt: sleep.sleepEndMinuteSgt,
    status: partial.status ?? existing.status,
  };
  subscriptionsByUser.set(userId, next);
  return next;
}

export function recordNotification(userId: string, iso: string): UserSubscription | null {
  const existing = subscriptionsByUser.get(userId);
  if (!existing) return null;
  if (typeof iso !== "string" || Number.isNaN(Date.parse(iso))) {
    throw new Error("recordNotification requires an ISO date string");
  }
  const recent = [...existing.recentNotificationsIso, iso].slice(-RECENT_NOTIFICATIONS_CAP);
  const next: UserSubscription = {
    ...existing,
    lastNotifiedAtIso: iso,
    recentNotificationsIso: recent,
  };
  subscriptionsByUser.set(userId, next);
  return next;
}

export function clearForTest(): void {
  subscriptionsByUser.clear();
  userIdByEndpoint.clear();
}

// Back-compat alias retained while older call sites migrate.
export const clearSubscriptionsForTest = clearForTest;

function validateSleepWindow(settings: SleepWindowSettings): SleepWindowSettings {
  for (const hour of [settings.sleepStartHourSgt, settings.sleepEndHourSgt]) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error("sleep window hours must be integers in 0-23");
    }
  }
  for (const minute of [settings.sleepStartMinuteSgt, settings.sleepEndMinuteSgt]) {
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new Error("sleep window minutes must be integers in 0-59");
    }
  }
  return settings;
}

function deriveUserIdFromEndpoint(endpoint: string): string {
  // Stable, anonymous userId for clients that don't supply one. Truncated SHA-256
  // keeps the key compact while still globally unique enough for our scale.
  return `anon-${createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}`;
}
