import { cache } from "react";
import { cacheGet, cacheSet } from "./cache";
import type { WindReading } from "./types";

// Env var: NEA_API_KEY (optional).
//   - Present: hit api.data.gov.sg /v1/environment/wind-direction + /wind-speed
//             and pick a shared station when both endpoints expose one.
//   - Missing: rotate plausible monsoon mock vectors. Tag source: "mock".
//
// Caching: 60-second LRU keyed by url (cross-request) plus React.cache() for
// per-request dedup (Vercel server-component pattern).

const WIND_CACHE_TTL_MS = 60 * 1000;
const WIND_DIR_URL = "https://api.data.gov.sg/v1/environment/wind-direction";
const WIND_SPEED_URL = "https://api.data.gov.sg/v1/environment/wind-speed";

interface DataGovReading {
  station_id: string;
  value: number;
}

interface DataGovItem {
  timestamp: string;
  readings: DataGovReading[];
}

interface DataGovResponse {
  items: DataGovItem[];
}

export const fetchCurrentWind = cache(async (): Promise<WindReading> => {
  const apiKey = process.env.NEA_API_KEY;

  if (!apiKey) {
    return mockWindReading(new Date());
  }

  try {
    const [directionData, speedData] = await Promise.all([
      fetchDataGovResponse(WIND_DIR_URL, apiKey),
      fetchDataGovResponse(WIND_SPEED_URL, apiKey),
    ]);

    return selectMatchingWindReading(directionData, speedData);
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

  const item = data.items[0];
  if (!item || !item.readings || item.readings.length === 0) {
    throw new Error("NEA response missing readings");
  }
  return data;
}

async function fetchJson(url: string, apiKey: string): Promise<DataGovResponse> {
  const response = await fetch(url, {
    headers: { "api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`NEA fetch failed: ${response.status}`);
  }
  return (await response.json()) as DataGovResponse;
}

export function selectMatchingWindReading(
  directionData: DataGovResponse,
  speedData: DataGovResponse,
): WindReading {
  const directionItem = firstItemWithReadings(directionData);
  const speedItem = firstItemWithReadings(speedData);
  const speedByStation = new Map(speedItem.readings.map((reading) => [reading.station_id, reading]));

  for (const direction of directionItem.readings) {
    const speed = speedByStation.get(direction.station_id);
    if (speed) {
      return {
        directionDeg: direction.value,
        speedMps: speed.value,
        timestamp: directionItem.timestamp,
        source: "nea",
        stationId: direction.station_id,
      };
    }
  }

  return {
    directionDeg: directionItem.readings[0].value,
    speedMps: speedItem.readings[0].value,
    timestamp: directionItem.timestamp,
    source: "nea",
  };
}

function firstItemWithReadings(data: DataGovResponse): DataGovItem {
  const item = data.items[0];
  if (!item || !item.readings || item.readings.length === 0) {
    throw new Error("NEA response missing readings");
  }
  return item;
}

// Mock vectors picked to exercise the alignment math: NE monsoon, SW monsoon,
// near-still inter-monsoon. Rotation keyed off the calendar minute so repeated
// dev calls within a minute are stable.
const MOCK_VECTORS: Array<{ directionDeg: number; speedMps: number }> = [
  { directionDeg: 30, speedMps: 2.4 },
  { directionDeg: 240, speedMps: 1.8 },
  { directionDeg: 90, speedMps: 0.4 },
];

function mockWindReading(now: Date): WindReading {
  const index = Math.floor(now.getMinutes() / 20) % MOCK_VECTORS.length;
  const vector = MOCK_VECTORS[index];
  return {
    directionDeg: vector.directionDeg,
    speedMps: vector.speedMps,
    timestamp: now.toISOString(),
    source: "mock",
  };
}
