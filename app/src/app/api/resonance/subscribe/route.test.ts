import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { DELETE, PATCH, POST } from "./route";
import { clearForTest, count, get } from "@/server/resonance/subscriptions";

function jsonRequest(method: string, body: unknown, url = "http://localhost/api/resonance/subscribe"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("/api/resonance/subscribe", () => {
  beforeEach(() => {
    clearForTest();
  });

  it("POST registers a subscription and returns userId + sleep settings", async () => {
    const response = await POST(
      jsonRequest("POST", {
        endpoint: "https://push.example/sub-a",
        userId: "user-1",
        frequencyTier: "active",
        sleepStartHourSgt: 23,
        sleepEndHourSgt: 6,
      }),
    );
    assert.equal(response.status, 200);
    const data = (await response.json()) as {
      ok: boolean;
      userId: string;
      frequencyTier: string;
      sleep: { sleepStartHourSgt: number; sleepEndHourSgt: number };
    };
    assert.equal(data.ok, true);
    assert.equal(data.userId, "user-1");
    assert.equal(data.frequencyTier, "active");
    assert.equal(data.sleep.sleepStartHourSgt, 23);
    assert.equal(data.sleep.sleepEndHourSgt, 6);
    assert.equal(count(), 1);
  });

  it("POST rejects an empty endpoint with 400 + actionable message", async () => {
    const response = await POST(jsonRequest("POST", { endpoint: "" }));
    assert.equal(response.status, 400);
    const data = (await response.json()) as { error: string };
    assert.match(data.error, /non-empty endpoint/);
  });

  it("POST rejects an invalid frequencyTier with 400", async () => {
    const response = await POST(
      jsonRequest("POST", { endpoint: "https://push.example/x", frequencyTier: "blast" }),
    );
    assert.equal(response.status, 400);
  });

  it("DELETE removes by userId and is idempotent", async () => {
    await POST(
      jsonRequest("POST", { endpoint: "https://push.example/sub-a", userId: "user-1" }),
    );
    assert.equal(count(), 1);

    const first = await DELETE(jsonRequest("DELETE", { userId: "user-1" }));
    assert.equal(first.status, 200);
    const firstData = (await first.json()) as { ok: boolean; removed: boolean };
    assert.equal(firstData.ok, true);
    assert.equal(firstData.removed, true);
    assert.equal(count(), 0);

    const second = await DELETE(jsonRequest("DELETE", { userId: "user-1" }));
    assert.equal(second.status, 200);
    const secondData = (await second.json()) as { ok: boolean; removed: boolean };
    assert.equal(secondData.ok, true);
    assert.equal(secondData.removed, false);
  });

  it("DELETE supports query string ?userId= for retry-friendly clients", async () => {
    await POST(
      jsonRequest("POST", { endpoint: "https://push.example/sub-a", userId: "user-1" }),
    );
    const response = await DELETE(
      new Request("http://localhost/api/resonance/subscribe?userId=user-1", { method: "DELETE" }),
    );
    assert.equal(response.status, 200);
    const data = (await response.json()) as { removed: boolean };
    assert.equal(data.removed, true);
  });

  it("DELETE without userId or endpoint returns 400", async () => {
    const response = await DELETE(jsonRequest("DELETE", {}));
    assert.equal(response.status, 400);
  });

  it("PATCH updates frequencyTier and sleep window", async () => {
    await POST(
      jsonRequest("POST", { endpoint: "https://push.example/sub-a", userId: "user-1" }),
    );
    const response = await PATCH(
      jsonRequest("PATCH", {
        userId: "user-1",
        frequencyTier: "calm",
        sleepStartHourSgt: 21,
      }),
    );
    assert.equal(response.status, 200);
    const data = (await response.json()) as { frequencyTier: string };
    assert.equal(data.frequencyTier, "calm");
    const stored = get("user-1");
    assert.ok(stored);
    assert.equal(stored.frequencyTier, "calm");
    assert.equal(stored.sleepStartHourSgt, 21);
  });

  it("PATCH on an unknown userId returns 404", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", { userId: "ghost", frequencyTier: "calm" }),
    );
    assert.equal(response.status, 404);
  });
});
