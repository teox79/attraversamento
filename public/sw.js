const CACHE_NAME = "passo-sicuro-v1"
const APP_SHELL = [
  "./",
  "manifest.webmanifest",
  "favicon.svg",
  "icons/passo-sicuro-192.png",
  "icons/passo-sicuro-512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("passo-sicuro-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("push", (event) => {
  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Passo Sicuro", {
      body: payload.body || "È arrivata una nuova richiesta di aiuto.",
      icon: "icons/passo-sicuro-192.png",
      badge: "icons/passo-sicuro-192.png",
      tag: payload.requestId || "passo-sicuro-crossing-request",
      data: { url: payload.url || "./volontari" },
      renotify: true,
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || "./volontari", self.location)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl.href)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl.href)
    }),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@vite/") ||
    url.pathname.startsWith("/@id/") ||
    url.pathname.startsWith("/node_modules/")
  ) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match(new URL("./", self.location).href)) ||
          Response.error(),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
      return cached || network
    }),
  )
})
