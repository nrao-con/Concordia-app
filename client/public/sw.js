const CACHE_NAME = "concordiacare-v4";
const STATIC_ASSETS = ["/icon-192.png", "/icon-512.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Network-only: API, WebSocket, HTML pages, and all JS/CSS
  // These must always be fresh to avoid serving stale code or session state
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ws") ||
    event.request.mode === "navigate" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".ts") ||
    url.pathname.endsWith(".css") ||
    url.pathname.includes("/@") ||
    url.pathname.includes("/src/") ||
    url.pathname.includes("/node_modules/")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return new Response(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ConcordiaCare</title></head><body><p style="font-family:sans-serif;text-align:center;margin-top:40px">No internet connection. Please reconnect and try again.</p></body></html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
        return new Response("", { status: 503 });
      })
    );
    return;
  }

  // Cache-first for static image/audio assets (icons, notification sounds)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type !== "opaque") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});

const NOTIFICATION_STATE_CACHE = "concordiacare-notification-state-v1";
const ACTIVE_NOTIFICATION_USER_KEY = "/__concordiacare_active_notification_user__";

async function setActiveNotificationUser(userId) {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  await cache.put(ACTIVE_NOTIFICATION_USER_KEY, new Response(userId || ""));
}

async function getActiveNotificationUser() {
  const cache = await caches.open(NOTIFICATION_STATE_CACHE);
  const response = await cache.match(ACTIVE_NOTIFICATION_USER_KEY);
  return response ? response.text() : "";
}

self.addEventListener("push", (event) => {
  let data = { title: "ConcordiaCare", body: "You have a new update.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil((async () => {
    const activeUserId = await getActiveNotificationUser();
    if (!data.userId || !activeUserId || data.userId !== activeUserId) return;

    const isUrgent = data.urgent === true;
    let vibratePattern;
    if (Array.isArray(data.vibratePattern) && data.vibratePattern.length > 0) {
      vibratePattern = data.vibratePattern;
    } else {
      vibratePattern = isUrgent ? [300, 100, 300, 100, 300, 100, 300] : [200, 100, 200];
    }

    const requireInteraction =
      typeof data.requireInteraction === "boolean"
        ? data.requireInteraction
        : isUrgent;

    const options = {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: vibratePattern,
      tag: data.tag || "concordiacare-push",
      data: { url: data.url || "/" },
      requireInteraction,
      renotify: isUrgent,
    };

    await self.registration.showNotification(data.title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_ACTIVE_NOTIFICATION_USER") {
    event.waitUntil(setActiveNotificationUser(event.data.userId || ""));
    return;
  }
  if (event.data && event.data.type === "CLEAR_WEBSITE_NOTIFICATIONS") {
    event.waitUntil(
      Promise.all([
        setActiveNotificationUser(""),
        self.registration.getNotifications().then((notifications) => {
          notifications.forEach((notification) => notification.close());
        }),
      ])
    );
    return;
  }
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { userId, title, options } = event.data;
    event.waitUntil((async () => {
      const activeUserId = await getActiveNotificationUser();
      if (!userId || !activeUserId || userId !== activeUserId) return;
      await self.registration.showNotification(title, options || {});
    })());
  }
});
