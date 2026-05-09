import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { selectMatchingWindReading } from "./nea";

describe("selectMatchingWindReading", () => {
  it("uses the first shared station instead of independent first readings", () => {
    const direction = {
      items: [
        {
          timestamp: "2026-05-09T06:00:00+08:00",
          readings: [
            { station_id: "S1", value: 90 },
            { station_id: "S2", value: 180 },
          ],
        },
      ],
    };
    const speed = {
      items: [
        {
          timestamp: "2026-05-09T06:00:00+08:00",
          readings: [
            { station_id: "S3", value: 2.4 },
            { station_id: "S2", value: 1.8 },
          ],
        },
      ],
    };

    assert.deepEqual(selectMatchingWindReading(direction, speed), {
      directionDeg: 180,
      speedMps: 1.8,
      timestamp: "2026-05-09T06:00:00+08:00",
      source: "nea",
      stationId: "S2",
    });
  });
});
