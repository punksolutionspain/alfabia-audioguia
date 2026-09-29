import { AUDIO_CACHE_NAME } from '@/lib/cacheNames'

// ─── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 30_000
export const LOW_SPACE_THRESHOLD_BYTES = 50 * 1024 * 1024 // 50 MB

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioItem {
  poiId: string
  audioUrl: string
}

export interface DownloadCallbacks {
  onProgress: (downloaded: number, total: number, poiId: string) => void
  onItemError: (err: unknown, poiId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheAvailable(): boolean {
  return typeof caches !== 'undefined'
}

// Downloads go into the cache the service worker plays from, so each audio is
// stored once. When the worker already controls the page it stores the file on
// its own as the fetch passes through it; writing it here too just overwrites
// the same entry, and covers a first visit where the worker is not in control yet.
function openAudioCache(): Promise<Cache> {
  return caches.open(AUDIO_CACHE_NAME)
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Download the audio files for one language sequentially (1 at a time) into
 * Cache Storage. Already-cached entries are skipped without re-fetching.
 * Throws DOMException('AbortError') if the signal fires.
 */
export async function downloadAudiosForLanguage(
  items: AudioItem[],
  callbacks: DownloadCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  if (!cacheAvailable()) {
    throw new Error('Cache API is not available in this browser context')
  }

  const cache = await openAudioCache()

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError')

    const { poiId, audioUrl } = items[i]

    // Skip if already in cache
    const hit = await cache.match(audioUrl)
    if (hit) {
      callbacks.onProgress(i + 1, items.length, poiId)
      continue
    }

    const inner = new AbortController()
    const timeoutId = setTimeout(() => inner.abort(), FETCH_TIMEOUT_MS)
    const onParentAbort = () => inner.abort()
    signal?.addEventListener('abort', onParentAbort, { once: true })

    try {
      const response = await fetch(audioUrl, { signal: inner.signal })
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onParentAbort)

      if (!response.ok) throw new Error(`HTTP ${response.status} — ${audioUrl}`)
      await cache.put(audioUrl, response)
    } catch (err) {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onParentAbort)

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      callbacks.onItemError(err, poiId)
      throw err
    }

    callbacks.onProgress(i + 1, items.length, poiId)
  }
}

// ─── Parallel download ────────────────────────────────────────────────────────

/**
 * Download audio files in parallel (up to `concurrency` at once) into Cache
 * Storage. Already-cached entries are skipped. Each failed item is retried up
 * to `maxRetries` times before being silently skipped so the overall download
 * always completes.
 */
export async function downloadAudiosParallel(
  items: AudioItem[],
  callbacks: DownloadCallbacks,
  signal?: AbortSignal,
  concurrency = 3,
  maxRetries = 2,
): Promise<void> {
  if (!cacheAvailable()) return

  const cache = await openAudioCache()
  const total = items.length
  let completed = 0

  // Check what is already in cache
  const hits = await Promise.all(items.map((item) => cache.match(item.audioUrl).then(Boolean)))

  // Report already-cached items immediately
  for (let i = 0; i < items.length; i++) {
    if (hits[i]) {
      completed++
      callbacks.onProgress(completed, total, items[i].poiId)
    }
  }

  const pending = items.filter((_, i) => !hits[i])

  // Process uncached items in batches of `concurrency`
  for (let i = 0; i < pending.length; i += concurrency) {
    if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError')

    const batch = pending.slice(i, i + concurrency)

    await Promise.allSettled(
      batch.map(async ({ poiId, audioUrl }) => {
        let attempts = maxRetries + 1

        while (attempts > 0) {
          if (signal?.aborted) return

          const inner = new AbortController()
          const timeoutId = setTimeout(() => inner.abort(), FETCH_TIMEOUT_MS)
          const onParentAbort = () => inner.abort()
          signal?.addEventListener('abort', onParentAbort, { once: true })

          try {
            const resp = await fetch(audioUrl, { signal: inner.signal })
            clearTimeout(timeoutId)
            signal?.removeEventListener('abort', onParentAbort)

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            await cache.put(audioUrl, resp)

            completed++
            callbacks.onProgress(completed, total, poiId)
            return
          } catch (err) {
            clearTimeout(timeoutId)
            signal?.removeEventListener('abort', onParentAbort)

            if (signal?.aborted) return
            attempts--

            if (attempts === 0) {
              callbacks.onItemError(err, poiId)
              completed++
              callbacks.onProgress(completed, total, poiId)
            } else {
              await new Promise((r) => setTimeout(r, 800))
            }
          }
        }
      }),
    )
  }
}

// ─── All cached check ─────────────────────────────────────────────────────────

/**
 * Returns true if all provided audio URLs are already in the cache.
 * Fast-path check for returning visitors.
 */
export async function areAllAudiosCached(items: AudioItem[]): Promise<boolean> {
  if (!cacheAvailable() || items.length === 0) return false
  const cache = await openAudioCache()
  const hits = await Promise.all(items.map((item) => cache.match(item.audioUrl).then(Boolean)))
  return hits.every(Boolean)
}

// ─── Clear ────────────────────────────────────────────────────────────────────

/**
 * Remove every downloaded audio, in all languages.
 * Does NOT touch useProgressStore (listened / favorites).
 */
export async function clearAudioCache(): Promise<void> {
  if (!cacheAvailable()) return
  await caches.delete(AUDIO_CACHE_NAME)
}

// ─── Storage estimate ─────────────────────────────────────────────────────────

export interface StorageEstimate {
  available: number
  quota: number
  usage: number
}

/**
 * Returns available, quota, and usage in bytes.
 * Returns zeros if the StorageManager API is unavailable.
 */
export async function estimateStorage(): Promise<StorageEstimate> {
  if (!navigator.storage?.estimate) {
    return { available: 0, quota: 0, usage: 0 }
  }
  const { quota = 0, usage = 0 } = await navigator.storage.estimate()
  return { available: quota - usage, quota, usage }
}
