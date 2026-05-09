// Sleep-suppress window in Asia/Singapore: 22:00 (inclusive) to 06:30 (exclusive).
// Uses Intl.DateTimeFormat — no extra deps, portable across hosts that may not
// run on SGT.

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

export function isSleepSuppressed(at: Date): boolean {
  const minutes = sgtMinutesOfDay(at);
  // 22:00 = 1320, 06:30 = 390
  return minutes >= 22 * 60 || minutes < 6 * 60 + 30;
}

// Returns the next 06:30 SGT instant strictly after `at`, as ISO string.
// If `at` is already inside the suppression window, this is the upcoming
// 06:30 SGT (which may be later today or tomorrow depending on the side of
// midnight).
export function nextWakeAfter(at: Date): Date {
  const minutes = sgtMinutesOfDay(at);
  // Two cases: either we're at/after 22:00 (next 06:30 is tomorrow SGT) or
  // we're before 06:30 (next 06:30 is today SGT).
  const tomorrow = minutes >= 22 * 60;
  return sgtMomentOnDate(at, tomorrow ? 1 : 0, 6, 30);
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
  // Equivalent: instant = baseUtcMs + (hour * 60 + minute - 8 * 60) * 60_000.
  const offsetMin = hour * 60 + minute - 8 * 60;
  return new Date(baseUtcMs + offsetMin * 60 * 1000);
}
