import { supabase } from '@/services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | 'audio_play'
  | 'audio_complete'
  | 'poi_view'
  | 'language_select'
  | 'session_start'
  | 'session_end'
  | 'offline_download'
  | 'map_view'

interface AnalyticsEvent {
  event_type: EventType
  poi_number: number | null
  language: string | null
  duration_listened_seconds: number | null
  session_id: string
  device_type: 'ios' | 'android' | 'desktop' | null
}

// ─── Batching configuration ───────────────────────────────────────────────────
//
// Every event used to be its own INSERT, and every INSERT is its own Postgres
// transaction with its own WAL fsync (~8.5 kB of disk writes for a few hundred
// bytes of payload). At ~58 events per visit that exhausted the project's
// Disk IO Budget. Batching the same events into one INSERT costs roughly the
// same WAL as a single row, cutting write IO by ~95%.
//
// Events are buffered in localStorage, so nothing is lost if the tab closes
// before a flush: the queue is picked up on the next visit.

const FLUSH_SIZE = 25 // flush as soon as this many events are buffered
const FLUSH_INTERVAL_MS = 15_000 // ...or after this long, whichever comes first
const MAX_QUEUE = 500 // hard cap so localStorage can't grow unbounded

// ─── Session ID (unique per browser tab visit) ────────────────────────────────

const SESSION_KEY = 'alfabia-session-id'
const QUEUE_KEY = 'alfabia-analytics-queue'

function getOrCreateSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(SESSION_KEY, id)
  return id
}

// ─── Device detection ─────────────────────────────────────────────────────────

function detectDeviceType(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

// ─── Buffer (localStorage) ────────────────────────────────────────────────────

function getQueue(): AnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : []
  } catch {
    return []
  }
}

function saveQueue(queue: AnalyticsEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Storage full — silently skip
  }
}

function enqueue(event: AnalyticsEvent): number {
  const queue = getQueue()
  queue.push(event)
  // Drop the oldest events if the buffer somehow grows past the cap
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
  saveQueue(queue)
  return queue.length
}

// ─── Flushing ─────────────────────────────────────────────────────────────────

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

function cancelScheduledFlush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushQueue()
  }, FLUSH_INTERVAL_MS)
}

async function flushQueue(): Promise<void> {
  if (flushing) return
  if (!navigator.onLine) return

  const batch = getQueue()
  if (batch.length === 0) return

  flushing = true
  cancelScheduledFlush()

  // Clear the buffer up front so events tracked during the request aren't lost
  saveQueue([])

  try {
    const { error } = await supabase.from('analytics_events').insert(batch)
    if (error) {
      // Put the batch back in front of whatever arrived meanwhile, retry later
      saveQueue([...batch, ...getQueue()].slice(-MAX_QUEUE))
      scheduleFlush()
    }
  } catch {
    saveQueue([...batch, ...getQueue()].slice(-MAX_QUEUE))
    scheduleFlush()
  } finally {
    flushing = false
  }
}

if (typeof window !== 'undefined') {
  // Flush queued events when connectivity is restored
  window.addEventListener('online', () => {
    void flushQueue()
  })

  // Flush when the visitor backgrounds or closes the tab. On mobile this is the
  // only reliable "leaving" signal — 'beforeunload' does not fire on iOS Safari.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushQueue()
  })

  // Send anything left over from a previous visit
  void flushQueue()
}

// ─── Core function ────────────────────────────────────────────────────────────

export async function trackEvent(
  eventType: EventType,
  extras: {
    poiNumber?: number | null
    language?: string | null
    durationListenedSeconds?: number | null
  } = {},
): Promise<void> {
  const event: AnalyticsEvent = {
    event_type: eventType,
    poi_number: extras.poiNumber ?? null,
    language: extras.language ?? null,
    duration_listened_seconds: extras.durationListenedSeconds ?? null,
    session_id: getOrCreateSessionId(),
    device_type: detectDeviceType(),
  }

  const queued = enqueue(event)

  if (!navigator.onLine) return

  if (queued >= FLUSH_SIZE) {
    await flushQueue()
  } else {
    scheduleFlush()
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export function trackAudioPlay(poiNumber: number, lang: string): void {
  void trackEvent('audio_play', { poiNumber, language: lang })
}

export function trackAudioComplete(poiNumber: number, lang: string, durationSeconds: number): void {
  void trackEvent('audio_complete', { poiNumber, language: lang, durationListenedSeconds: durationSeconds })
}

export function trackPOIView(poiNumber: number): void {
  void trackEvent('poi_view', { poiNumber })
}

export function trackLanguageSelect(lang: string): void {
  void trackEvent('language_select', { language: lang })
}

export function trackSessionStart(): void {
  void trackEvent('session_start')
}

export function trackSessionEnd(): void {
  void trackEvent('session_end')
}

export function trackOfflineDownload(lang: string): void {
  void trackEvent('offline_download', { language: lang })
}

export function trackMapView(): void {
  void trackEvent('map_view')
}
