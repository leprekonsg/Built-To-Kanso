/* Built-To-Kanso — Resonance Hours service worker.
 * Phase 1: minimal receive path. Server-side push dispatch is an explicit
 * placeholder; this renders an incoming notification if one is delivered.
 */

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || "/threshold" },
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
          : "Your home is breathing right now.",
      url: typeof payload.url === "string" ? payload.url : "/threshold",
    };
  } catch {
    return defaultPayload();
  }
}

function defaultPayload() {
  return {
    title: "Built-To-Kanso",
    body: "Your home is breathing right now.",
    url: "/threshold",
  };
}
