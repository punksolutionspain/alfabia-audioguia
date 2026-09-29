import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Play, Pause, Heart, Loader2, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { useProgressStore } from '@/stores/useProgressStore'
import { pickAudioUrl } from '@/lib/audioFormat'
import type { Language } from '@/lib/types'

// ─── i18n ─────────────────────────────────────────────────────────────────────

const COPY = {
  es: { unavailable: 'Audio no disponible', loadError: 'Error al cargar' },
  en: { unavailable: 'Audio not available', loadError: 'Failed to load' },
  de: { unavailable: 'Audio nicht verfügbar', loadError: 'Ladefehler' },
  ca: { unavailable: 'Àudio no disponible', loadError: 'Error en carregar' },
  fr: { unavailable: 'Audio non disponible', loadError: 'Erreur de chargement' },
} satisfies Record<Language, Record<string, string>>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AudioPlayerProps {
  poiId: string
  audioUrlOgg: string | null
  audioUrlMp3: string | null
  onPlay?: () => void
  onComplete?: (durationSeconds: number) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AudioPlayer({
  poiId,
  audioUrlOgg,
  audioUrlMp3,
  onPlay,
  onComplete,
}: AudioPlayerProps) {
  const markAsListened = useProgressStore((s) => s.markAsListened)
  const isFavorite = useProgressStore((s) => s.isFavorite)
  const toggleFavorite = useProgressStore((s) => s.toggleFavorite)
  const copy = COPY[useAppStore((s) => s.language)]

  const audioRef = useRef<HTMLAudioElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hasError, setHasError] = useState(false)

  // Resolve the best audio source once per render
  const audioSrc = useMemo(
    () => pickAudioUrl({ audioUrlOgg, audioUrlMp3 }),
    [audioUrlOgg, audioUrlMp3],
  )

  // Wire all audio events
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay       = () => { setIsPlaying(true);  setIsBuffering(false); onPlay?.() }
    const handlePause      = () => setIsPlaying(false)
    const handleWaiting    = () => setIsBuffering(true)
    const handleCanPlay    = () => setIsBuffering(false)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDuration   = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration)
    }
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      const listenedDuration = audio.duration
      audio.currentTime = 0
      markAsListened(poiId)
      if (isFinite(listenedDuration)) onComplete?.(Math.round(listenedDuration))
    }
    const handleError = () => {
      setIsBuffering(false)
      setHasError(true)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.pause()
    }
  }, [poiId, markAsListened, onPlay, onComplete])

  // Reset state when the POI changes (navigation between detail pages)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setIsPlaying(false)
    setIsBuffering(false)
    setCurrentTime(0)
    setDuration(0)
    setHasError(false)
  }, [poiId])

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio || hasError) return
    if (audio.paused) {
      void audio.play()
    } else {
      audio.pause()
    }
  }, [hasError])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const value = parseFloat(e.target.value)
    audio.currentTime = value
    setCurrentTime(value)
  }, [])

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const favorite = isFavorite(poiId)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-white border border-alfabia-border px-4 py-4 shadow-sm">
      {/* Hidden native audio element */}
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
        />
      )}

      {/* No audio available */}
      {!audioSrc && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-alfabia-text-muted">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {copy.unavailable}
        </div>
      )}

      {audioSrc && (
        <>
          {/* ── Controls row ── */}
          <div className="flex items-center gap-3">
            {/* Play / Pause / Buffering */}
            <button
              type="button"
              onClick={handlePlayPause}
              disabled={hasError}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-alfabia-green text-alfabia-cream transition-colors active:bg-alfabia-green-dark disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-alfabia-green"
            >
              {isBuffering ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-px" />
              )}
            </button>

            {/* Progress + time */}
            <div className="flex-1 flex flex-col gap-1 min-w-0">
              {/* Seek bar */}
              <div className="relative h-1.5 rounded-full overflow-hidden bg-alfabia-border">
                {/* Played portion */}
                <div
                  className="absolute inset-y-0 left-0 bg-alfabia-green rounded-full pointer-events-none"
                  style={{ width: `${progressPct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={duration === 0 || hasError}
                  aria-label="Barra de progreso"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                />
              </div>

              {/* Time labels */}
              <div className="flex items-center justify-between">
                <span className="text-xs tabular-nums text-alfabia-text-muted">
                  {formatTime(currentTime)}
                </span>
                {hasError ? (
                  <span className="flex items-center gap-1 text-xs text-rose-500">
                    <AlertCircle className="w-3 h-3" />
                    {copy.loadError}
                  </span>
                ) : (
                  <span className="text-xs tabular-nums text-alfabia-text-muted">
                    {formatTime(duration)}
                  </span>
                )}
              </div>
            </div>

            {/* Favorite button */}
            <button
              type="button"
              onClick={() => toggleFavorite(poiId)}
              aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-rose-50 active:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <Heart
                className={[
                  'w-5 h-5 transition-colors',
                  favorite
                    ? 'fill-rose-500 text-rose-500'
                    : 'text-alfabia-text-muted',
                ].join(' ')}
              />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
