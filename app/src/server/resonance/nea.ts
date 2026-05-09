import { cache } from "react";
import { cacheGet, cacheSet } from "./cache";
import type { WindReading } from "./types";

// Env var: NEA_API_KEY (required for live data, optional in code).
//   - Present (normal): hit api-open.data.gov.sg /v2/real-time/api wind
//             endpoints and pick a shared station when both endpoints expose
//             one. Tag source: "nea".
//   - Missing or transient network failure: return a single deterministic
//             monsoon vector so the in-app banner state is stable. Tag source:
//             "mock". Not used in production (.env.local pins the key).
//
// Caching: 60-second LRU keyed by url (cross-request) plus React.cache() for
// per-request dedup (Vercel server-component pattern).

const WIND_CACHE_TTL_MS = 60 * 1000;
const WIND_API_BASE = "https://api-open.data.gov.sg/v2/real-time/api";
const WIND_DIR_URL = `${WIND_API_BASE}/wind-direction`;
const WIND_SPEED_URL = `${WIND_API_BASE}/wind-speed`;

interface DataGovReading {
  stationId: string;
  value: number;
}

interface DataGovReadingSet {
  timestamp: string;
  data: DataGovReading[];
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface DataGovStation {
  id: string;
  name?: string;
  location?: GeoPoint;
  labelLocation?: GeoPoint;
}

interface DataGovPayload {
  stations?: DataGovStation[];
  readings: DataGovReadingSet[];
  readingUnit?: string;
}

interface DataGovResponse {
  code?: number;
  errorMsg?: string | null;
  data?: DataGovPayload;
}

export interface WindSelectionOptions {
  siteLocation?: GeoPoint;
}

export const fetchCurrentWind = cache(async (
  options: WindSelectionOptions = {},
): Promise<WindReading> => {
  const apiKey = process.env.NEA_API_KEY;

  if (!apiKey) {
    return mockWindReading(new Date());
  }

  try {
    const [directionData, speedData] = await Promise.all([
      fetchDataGovResponse(WIND_DIR_URL, apiKey),
      fetchDataGovResponse(WIND_SPEED_URL, apiKey),
    ]);

    return selectMatchingWindReading(directionData, speedData, options);
  } catch {
    // Calibrated honesty: if NEA is unreachable we still return a reading,
    // tagged mock so callers know the source.
    return mockWindReading(new Date());
  }
});

async function fetchDataGovResponse(url: string, apiKey: string): Promise<DataGovResponse> {
  const cached = cacheGet<DataGovResponse>(url);
  const data = cached ?? (await fetchJson(url, apiKey));
  if (!cached) cacheSet(url, data, WIND_CACHE_TTL_MS);

  if (data.code !== undefined && data.code !== 0) {
    throw new Error(`NEA response error: ${data.errorMsg ?? data.code}`);
  }

  const item = data.data?.readings[0];
  if (!item || !item.data || item.data.length === 0) {
    throw new Error("NEA response missing readings");
  }
  return data;
}

async function fetchJson(url: string, apiKey: string): Promise<DataGovResponse> {
  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`NEA fetch failed: ${response.status}`);
  }
  return (await response.json()) as DataGovResponse;
}

export function selectMatchingWindReading(
  directionData: DataGovResponse,
  speedData: DataGovResponse,
  options: WindSelectionOptions = {},
): WindReading {
  const directionItem = firstItemWithReadings(directionData);
  const speedItem = firstItemWithReadings(speedData);
  const directionByStation = new Map(directionItem.data.map((reading) => [reading.stationId, reading]));
  const speedByStation = new Map(speedItem.data.map((reading) => [reading.stationId, reading]));
  const nearestStationId = nearestSharedStationId(
    directionData.data?.stations ?? [],
    directionByStation,
    speedByStation,
    options.siteLocation,
  );

  if (nearestStationId) {
    const direction = directionByStation.get(nearestStationId);
    const speed = speedByStation.get(nearestStationId);
    if (direction && speed) {
      return windReading(direction, speed, directionItem.timestamp, speedData.data?.readingUnit);
    }
  }

  for (const direction of directionItem.data) {
    const speed = speedByStation.get(direction.stationId);
    if (speed) {
      return windReading(direction, speed, directionItem.timestamp, speedData.data?.readingUnit);
    }
  }

  return {
    directionDeg: directionItem.data[0].value,
    speedMps: windSpeedToMps(speedItem.data[0].value, speedData.data?.readingUnit),
    timestamp: directionItem.timestamp,
    source: "nea",
  };
}

function firstItemWithReadings(data: DataGovResponse): DataGovReadingSet {
  const item = data.data?.readings[0];
  if (!item || !item.data || item.data.length === 0) {
    throw new Error("NEA response missing readings");
  }
  return item;
}

function nearestSharedStationId(
  stations: DataGovStation[],
  directionByStation: Map<string, DataGovReading>,
  speedByStation: Map<string, DataGovReading>,
  siteLocation?: GeoPoint,
): string | null {
  if (!siteLocation) return null;

  let best: { id: string; distanceM: number } | null = null;

  for (const station of stations) {
    if (!directionByStation.has(station.id) || !speedByStation.has(station.id)) continue;

    const location = station.location ?? station.labelLocation;
    if (!location) continue;

    const distanceM = haversineM(siteLocation, location);
    if (!best || distanceM < best.distanceM) {
      best = { id: station.id, distanceM };
    }
  }

  return best?.id ?? null;
}

function windReading(
  direction: DataGovReading,
  speed: DataGovReading,
  timestamp: string,
  speedUnit?: string,
): WindReading {
  return {
    directionDeg: direction.value,
    speedMps: windSpeedToMps(speed.value, speedUnit),
    timestamp,
    source: "nea",
    stationId: direction.stationId,
  };
}

function windSpeedToMps(value: number, unit?: string): number {
  if (unit?.trim().toLowerCase() === "knots") {
    return Number((value * 0.514444).toFixed(3));
  }
  return value;
}

function haversineM(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusM = 6_371_000;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const deltaLat = toRad(b.latitude - a.latitude);
  const deltaLon = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Deterministic NE monsoon vector used only when the live NEA call is
// unavailable (no key, network failure). Pinned so the in-app banner does not
// flap during local testing; dev/prod normally read source: "nea".
const FALLBACK_WIND_VECTOR = { directionDeg: 30, speedMps: 2.4 } as const;

function mockWindReading(now: Date): WindReading {
  return {
    directionDeg: FALLBACK_WIND_VECTOR.directionDeg,
    speedMps: FALLBACK_WIND_VECTOR.speedMps,
    timestamp: now.toISOString(),
    source: "mock",
  };
}
