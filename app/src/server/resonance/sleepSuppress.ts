// Sleep-suppress window in Asia/Singapore. Default: 22:00 (inclusive) to 07:00
// (exclusive). Brief 14.5 says default 22:00–07:00 SGT and user-configurable.
// Uses Intl.DateTimeFormat — no extra deps, portable across hosts that may not
// run on SGT.

import type { SleepWindowSettings } from "./subscriptions";

const SGT = "Asia/Singapore";
const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: SGT,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SGT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const DEFAULT_SLEEP_START_HOUR_SGT = 22;
export const DEFAULT_SLEEP_START_MINUTE_SGT = 0;
export const DEFAULT_SLEEP_END_HOUR_SGT = 7;
export const DEFAULT_SLEEP_END_MINUTE_SGT = 0;

const DEFAULT_SETTINGS: SleepWindowSettings = {
  sleepStartHourSgt: DEFAULT_SLEEP_START_HOUR_SGT,
  sleepStartMinuteSgt: DEFAULT_SLEEP_START_MINUTE_SGT,
  sleepEndHourSgt: DEFAULT_SLEEP_END_HOUR_SGT,
  sleepEndMinuteSgt: DEFAULT_SLEEP_END_MINUTE_SGT,
};

export function isSleepSuppressed(at: Date): boolean {
  return isSleepSuppressedFor(at, DEFAULT_SETTINGS);
}

// Returns the next sleep-end SGT instant strictly after `at` using the default
// window (22:00–07:00).
export function nextWakeAfter(at: Date): Date {
  return nextWakeAfterFor(at, DEFAULT_SETTINGS);
}

// User-configurable window check. Handles two cases:
//   - wraparound (start > end, e.g. 22:00–07:00): inside if minutes >= start OR < end.
//   - same-day (start <= end, e.g. 02:00–05:00): inside if start <= minutes < end.
// A start == end window is treated as "always awake" (no suppression).
export function isSleepSuppressedFor(at: Date, settings: SleepWindowSettings): boolean {
  const minutes = sgtMinutesOfDay(at);
  const startMin = toMinuteOfDay(settings.sleepStartHourSgt, settings.sleepStartMinuteSgt);
  const endMin = toMinuteOfDay(settings.sleepEndHourSgt, settings.sleepEndMinuteSgt);

  if (startMin === endMin) return false;

  if (startMin > endMin) {
    return minutes >= startMin || minutes < endMin;
  }
  return minutes >= startMin && minutes < endMin;
}

// Returns the next sleep-end SGT instant strictly after `at` using the
// configured window. If `at` is currently inside the suppression window, this
// is the upcoming end-of-window. If `at` is outside the window, it returns the
// next end-of-window after the next start (i.e. tomorrow's wake for default).
export function nextWakeAfterFor(at: Date, settings: SleepWindowSettings): Date {
  const minutes = sgtMinutesOfDay(at);
  const startMin = toMinuteOfDay(settings.sleepStartHourSgt, settings.sleepStartMinuteSgt);
  const endMin = toMinuteOfDay(settings.sleepEndHourSgt, settings.sleepEndMinuteSgt);

  // Pick the SGT-day offset for the wake instant:
  // wraparound (e.g. 22:00–07:00):
  //   - at >= start (late evening): wake = tomorrow's end
  //   - at < end (early morning): wake = today's end
  //   - between (awake): wake = tomorrow's end (next end after the next start)
  // same-day (e.g. 02:00–05:00):
  //   - at < end: wake = today's end
  //   - else: wake = tomorrow's end
  let dayOffset = 0;
  if (startMin > endMin) {
    if (minutes >= startMin) dayOffset = 1;
    else if (minutes < endMin) dayOffset = 0;
    else dayOffset = 1;
  } else if (minutes >= endMin) {
    dayOffset = 1;
  }

  return sgtMomentOnDate(at, dayOffset, settings.sleepEndHourSgt, settings.sleepEndMinuteSgt);
}

function toMinuteOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function sgtMinutesOfDay(at: Date): number {
  const parts = TIME_FORMATTER.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Build a Date at SGT date(`at` + dayOffsetSgt) at hour:minute SGT.
function sgtMomentOnDate(at: Date, dayOffsetSgt: number, hour: number, minute: number): Date {
  const ymd = DATE_FORMATTER.format(at); // "YYYY-MM-DD" in SGT
  const [y, m, d] = ymd.split("-").map(Number);
  // Shift by dayOffsetSgt days using a UTC anchor (avoids DST math; SGT has none).
  const baseUtcMs = Date.UTC(y, m - 1, d) + dayOffsetSgt * 24 * 60 * 60 * 1000;
  // SGT is UTC+8, so SGT hh:mm == UTC (hh-8):mm on the same SGT calendar date.
  const offsetMin = hour * 60 + minute - 8 * 60;
  return new Date(baseUtcMs + offsetMin * 60 * 1000);
}
