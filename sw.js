// Cache version — bump this string on every deploy to force cache invalidation
const CACHE_VERSION = 'v3'
const CACHE_NAME = `measure-motion-${CACHE_VERSION}`

// ── Install: take over immediately ────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting()
})

// ── Activate: clear ALL old caches, claim clients ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: smart strategy per resource type ───────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // ① HTML (navigate requests) → Network-first, fallback to cache
  //    NEVER serve stale HTML because it embeds versioned asset hashes
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          return res
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // ② Content-hashed assets (/assets/*.js, /assets/*.css) → Cache-first
  //    These filenames contain a hash so they are immutable once created
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone))
          return res
        })
      })
    )
    return
  }

  // ③ Everything else → Network only
  event.respondWith(fetch(event.request))
})
