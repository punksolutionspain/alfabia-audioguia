/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  type PrecacheEntry,
} from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
} from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { RangeRequestsPlugin } from 'workbox-range-requests'

// __WB_MANIFEST is injected by vite-plugin-pwa at build time.
// It MUST be accessed as `self.__WB_MANIFEST` so workbox-build can locate and
// replace the literal string during the inject-manifest step.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

// ─── Cache versioning ─────────────────────────────────────────────────────────
// Increment on every deploy. Old runtime caches are purged in the activate event.

const CACHE_VERSION = 'v1'

const CACHE_NAMES = {
  supabaseData: `supabase-data-${CACHE_VERSION}`,
  audioFiles:   `audio-files-${CACHE_VERSION}`,
  staticAssets: `static-assets-${CACHE_VERSION}`,
  osmTiles:     'osm-tiles-v2',
}

// ─── App shell precache ───────────────────────────────────────────────────────
// Precaches all Vite-built assets (HTML, CSS, JS chunks, fonts, images).
// Stale precache entries from previous SW versions are removed automatically.

precacheAndRoute(self.__WB_MANIFEST)

// Remove precache entries from old SW versions
cleanupOutdatedCaches()

// Take control of all open clients immediately on activation
self.skipWaiting()
clientsClaim()

// ─── Purge stale runtime caches on activate ───────────────────────────────────

self.addEventListener('activate', (event) => {
  const validCacheSet = new Set(Object.values(CACHE_NAMES))

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('alfabia-') && !validCacheSet.has(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  )
})

// ─── Runtime routes ───────────────────────────────────────────────────────────

// 1. Supabase Storage (audio / image files) — CacheFirst
//    Files are pre-populated by the manual offline download flow.
//    When they're in the cache, serve instantly; when not, fetch and cache.
//    <audio> asks for byte ranges and Safari requires a 206 answer, so the
//    cached full file is sliced into the requested range. Only full 200
//    responses are stored — a partial 206 must never end up in the cache.
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/storage/v1/object/'),
  new CacheFirst({
    cacheName: CACHE_NAMES.audioFiles,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new RangeRequestsPlugin(),
      new ExpirationPlugin({
        maxEntries: 120,          // 18 POIs × ~5 files each + headroom
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// 2. Supabase REST API (POI / translation queries) — NetworkFirst
//    Prefer fresh data; fall back to cache when offline (3G-friendly).
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.supabase.co') &&
    url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.supabaseData,
    networkTimeoutSeconds: 10,   // generous for 3G
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
    ],
  }),
)

// 3. OpenStreetMap tiles — CacheFirst (offline map support)
registerRoute(
  ({ url }) => url.hostname.endsWith('.tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: CACHE_NAMES.osmTiles,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 1 week
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// 4. Fonts & images — StaleWhileRevalidate
//    Serve from cache immediately; update in background.
registerRoute(
  ({ request }) =>
    request.destination === 'font' || request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.staticAssets,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50 }),
    ],
  }),
)
