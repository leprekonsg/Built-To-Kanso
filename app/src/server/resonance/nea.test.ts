import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { selectMatchingWindReading } from "./nea";

describe("selectMatchingWindReading", () => {
  it("uses the first shared station instead of independent first readings", () => {
    const direction = {
      code: 0,
      data: {
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S1", value: 90 },
              { stationId: "S2", value: 180 },
            ],
          },
        ],
        readingUnit: "degrees",
      },
      errorMsg: "",
    };
    const speed = {
      code: 0,
      data: {
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S3", value: 2.4 },
              { stationId: "S2", value: 1.8 },
            ],
          },
        ],
        readingUnit: "m/s",
      },
      errorMsg: "",
    };

    assert.deepEqual(selectMatchingWindReading(direction, speed), {
      directionDeg: 180,
      speedMps: 1.8,
      timestamp: "2026-05-09T06:00:00+08:00",
      source: "nea",
      stationId: "S2",
    });
  });

  it("converts current v2 wind speed knots to metres per second", () => {
    const direction = {
      code: 0,
      data: {
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S108", value: 173 },
            ],
          },
        ],
        readingUnit: "degrees",
      },
      errorMsg: "",
    };
    const speed = {
      code: 0,
      data: {
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S108", value: 4.3 },
            ],
          },
        ],
        readingUnit: "knots",
      },
      errorMsg: "",
    };

    assert.deepEqual(selectMatchingWindReading(direction, speed), {
      directionDeg: 173,
      speedMps: 2.212,
      timestamp: "2026-05-09T06:00:00+08:00",
      source: "nea",
      stationId: "S108",
    });
  });

  it("uses the nearest shared station when a site location is provided", () => {
    const direction = {
      code: 0,
      data: {
        stations: [
          {
            id: "S108",
            location: { latitude: 1.2799, longitude: 103.8703 },
          },
          {
            id: "S44",
            location: { latitude: 1.34583, longitude: 103.68166 },
          },
        ],
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S108", value: 173 },
              { stationId: "S44", value: 227 },
            ],
          },
        ],
        readingUnit: "degrees",
      },
      errorMsg: "",
    };
    const speed = {
      code: 0,
      data: {
        stations: [
          {
            id: "S108",
            location: { latitude: 1.2799, longitude: 103.8703 },
          },
          {
            id: "S44",
            location: { latitude: 1.34583, longitude: 103.68166 },
          },
        ],
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S108", value: 4.3 },
              { stationId: "S44", value: 4.4 },
            ],
          },
        ],
        readingUnit: "knots",
      },
      errorMsg: "",
    };

    assert.deepEqual(
      selectMatchingWindReading(direction, speed, {
        siteLocation: { latitude: 1.346, longitude: 103.682 },
      }),
      {
        directionDeg: 227,
        speedMps: 2.264,
        timestamp: "2026-05-09T06:00:00+08:00",
        source: "nea",
        stationId: "S44",
      },
    );
  });

  it("falls back to independent first readings when no shared station exists", () => {
    const direction = {
      code: 0,
      data: {
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S1", value: 90 },
            ],
          },
        ],
        readingUnit: "degrees",
      },
      errorMsg: "",
    };
    const speed = {
      code: 0,
      data: {
        readings: [
          {
            timestamp: "2026-05-09T06:00:00+08:00",
            data: [
              { stationId: "S3", value: 2.4 },
            ],
          },
        ],
        readingUnit: "m/s",
      },
      errorMsg: "",
    };

    assert.deepEqual(selectMatchingWindReading(direction, speed), {
      directionDeg: 90,
      speedMps: 2.4,
      timestamp: "2026-05-09T06:00:00+08:00",
      source: "nea",
    });
  });

  it("rejects a v2 response without readings", () => {
    assert.throws(
      () =>
        selectMatchingWindReading(
          {
            code: 0,
            data: {
              readings: [],
              readingUnit: "degrees",
            },
            errorMsg: "",
          },
          {
            code: 0,
            data: {
              readings: [
                {
                  timestamp: "2026-05-09T06:00:00+08:00",
                  data: [
                    { stationId: "S3", value: 2.4 },
                  ],
                },
              ],
              readingUnit: "m/s",
            },
            errorMsg: "",
          },
        ),
      /NEA response missing readings/,
    );
  });
});
