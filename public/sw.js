/* StudyNova service worker – push notifications + offline-first learning shell */
const CACHE = "studynova-v2";
const API_CACHE = "studynova-api-v1";
const QUEUE_DB = "studynova-offline-queue";
const QUEUE_STORE = "requests";

function openQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueRequest(request) {
  const database = await openQueue();
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  await new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: request.url,
      method: request.method,
      headers,
      body,
      createdAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  database.close();
  if (self.registration.sync) await self.registration.sync.register("studynova-sync");
}

async function readQueuedRequests() {
  const database = await openQueue();
  const rows = await new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, "readonly");
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return rows;
}

async function deleteQueuedRequest(id) {
  const database = await openQueue();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

async function replayQueue() {
  for (const item of await readQueuedRequests()) {
    try {
      const response = await fetch(item.url, { method: item.method, headers: item.headers, body: item.body, credentials: "include" });
      if (response.ok || response.status < 500) await deleteQueuedRequest(item.id);
    } catch (_) {
      // Keep the item for the next Background Sync attempt.
    }
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/icon.png", "/manifest.webmanifest"]).catch(() => undefined)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE, API_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/v1/") && request.method === "GET") {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ ok: false, error: { code: "SN-OFFLINE-001", message: "目前離線，請稍後重新整理。" } }), { status: 503, headers: { "content-type": "application/json" } });
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/api/v1/") && ["POST", "PUT", "PATCH"].includes(request.method)) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (_) {
        try {
          await queueRequest(request);
          return new Response(JSON.stringify({ ok: true, data: { queued: true, offline: true } }), { status: 202, headers: { "content-type": "application/json" } });
        } catch (_) {
          return new Response(JSON.stringify({ ok: false, error: { code: "SN-OFFLINE-002", message: "目前離線，這項操作尚未加入同步佇列。" } }), { status: 503, headers: { "content-type": "application/json" } });
        }
      }
    })());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "studynova-sync") event.waitUntil(replayQueue());
});

self.addEventListener("push", (event) => {
  let payload = { title: "StudyNova AI", body: "你有新的學習提醒", link: "/dashboard" };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (_) { /* keep default */ }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: "/icon.png", badge: "/icon.png", vibrate: payload.vibrate || [120, 60, 120], tag: payload.tag || payload.title, data: { link: payload.link || "/dashboard" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) if ("focus" in client) { client.navigate(link); return client.focus(); }
    return self.clients.openWindow(link);
  }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "STUDYNOVA_SYNC_NOW") event.waitUntil(replayQueue());
});
