/* Built-To-Kanso - Resonance Hours service worker. */

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || "/threshold" },
      tag: payload.tag,
      renotify: false,
      timestamp: Date.parse(payload.timestamp) || Date.now(),
      silent: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/threshold";
  event.waitUntil(self.clients.openWindow(url));
});

function readPushPayload(event) {
  if (!event.data) {
    return defaultPayload();
  }

  try {
    const payload = event.data.json();
    return {
      title: typeof payload.title === "string" ? payload.title : "Built-To-Kanso",
      body:
        typeof payload.body === "string"
          ? payload.body
          : "Open the studio to review the latest update. Indoor airflow is not measured.",
      url: typeof payload.url === "string" ? payload.url : "/threshold",
      tag: typeof payload.tag === "string" ? payload.tag : "resonance-hours",
      timestamp:
        typeof payload.timestamp === "string"
          ? payload.timestamp
          : new Date().toISOString(),
    };
  } catch {
    return defaultPayload();
  }
}

function defaultPayload() {
  return {
    title: "Built-To-Kanso",
    body: "Open the studio to review the latest update. Indoor airflow is not measured.",
    url: "/threshold",
    tag: "resonance-hours",
    timestamp: new Date().toISOString(),
  };
}
