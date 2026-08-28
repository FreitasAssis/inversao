/**
 * Offline, and installable (project doc 11, step 4).
 *
 * The whole game is already on the device once the page has loaded: the engine,
 * the search, the boards and the sound are all code, and nothing is fetched
 * while playing. So "works offline" here is only about getting the page itself
 * open — which makes this worker small, and means it must not be clever.
 *
 * The rule it follows is: **never let the cache decide what the current release
 * is.** A navigation goes to the network first and falls back to the cache, so
 * somebody online always gets today's HTML; only somebody with no connection
 * gets yesterday's. The opposite arrangement is how sites end up permanently
 * broken for people who have already reloaded five times.
 *
 * Everything is reached through `self.` — `self.caches`, `self.clients` — which
 * is exactly what a worker scope provides, and is what lets the tests evaluate
 * this file against a stand-in.
 *
 * Bump VERSION on a release whose unhashed files changed. Hashed ones do not
 * need it; that is the point of the hash.
 */

const VERSION = 'inversao-shell-v1'

/**
 * Ours to sweep, and narrow on purpose. It is not enough for a cache to be this
 * project's: the solution tables live in `inversao-tables-*` and are 38 MB
 * downloaded on demand, so a sweep of everything "inversao-" would throw them
 * away on every release. Only the shell caches belong to this worker.
 */
const PREFIX = 'inversao-shell-'

/**
 * The single document. Every address is this file plus the router inside it,
 * which is the same rule `public/_redirects` gives the host.
 */
const SHELL = '/'

const PRECACHE = [
  SHELL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
]

/**
 * How a request should be answered. Kept separate from the answering so the
 * decision can be read — and tested — on its own.
 */
function strategyFor(request) {
  if (request.method !== 'GET') return 'network'
  const url = new URL(request.url, self.location.origin)
  if (url.origin !== self.location.origin) return 'network'

  // Any address is the same document; the router in the page sorts out which.
  if (request.mode === 'navigate') return 'shell'

  // Vite writes the content hash into the filename, so a file at one of these
  // names can never change. Nothing else on the origin can promise that.
  if (url.pathname.startsWith('/assets/')) return 'immutable'

  // The solution tables have an owner already: the loader downloads the one
  // combination being played and keeps it in `inversao-tables-*`. Revalidating
  // them here would store 38 MB a second time, in a cache this worker sweeps.
  if (url.pathname.startsWith('/data/')) return 'network'

  return 'revalidate'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    self.caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() =>
      // Taking over at once is safe here because the build is a single bundle:
      // there are no lazily-loaded chunks for an already-open page to ask for
      // after the older cache has been swept.
      self.skipWaiting(),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== VERSION)
            .map((key) => self.caches.delete(key)),
        ),
      )
      .then(() => self.clients?.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request)
  if (strategy === 'network') return
  event.respondWith(answer(event.request, strategy))
})

async function answer(request, strategy) {
  const cache = await self.caches.open(VERSION)

  if (strategy === 'shell') {
    try {
      const fresh = await self.fetch(request)
      // Only the shell is worth storing under the shell's key: a redirect or an
      // error page cached here would be what every future offline visit gets.
      if (fresh.ok) await cache.put(SHELL, fresh.clone())
      return fresh
    } catch {
      const cached = await cache.match(SHELL)
      if (cached) return cached
      throw new Error('offline, and the shell was never cached')
    }
  }

  const cached = await cache.match(request)

  if (strategy === 'immutable') {
    if (cached) return cached
    const fresh = await self.fetch(request)
    if (fresh.ok) await cache.put(request, fresh.clone())
    return fresh
  }

  // Stale while revalidate: answer now, and quietly take the newer copy for
  // next time. A failed refresh is not an error — it is simply being offline.
  const refresh = self
    .fetch(request)
    .then((fresh) => {
      if (fresh.ok) cache.put(request, fresh.clone())
      return fresh
    })
    .catch((reason) => {
      // Offline with a copy in hand is not a failure. Offline with nothing is,
      // and it has to look like one rather than resolve to undefined.
      if (cached) return cached
      throw reason
    })

  return cached ?? refresh
}
