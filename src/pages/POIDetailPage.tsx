import { useState, useEffect, useRef, useMemo, lazy, Suspense, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Leaf, ChevronRight, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { useProgressStore } from '@/stores/useProgressStore'
import { getPOIsWithTranslations } from '@/services/poiService'
import AudioPlayer from '@/components/audio/AudioPlayer'
import { trackPOIView, trackAudioPlay, trackAudioComplete } from '@/services/analyticsService'
import type { POI, Translation, Language } from '@/lib/types'

const MiniMap = lazy(() => import('@/components/map/MiniMap'))

// ─── Section labels ───────────────────────────────────────────────────────────

const SECTION_LABELS: Record<Language, Record<POI['section'], string>> = {
  es: { jardines: 'Jardines', casa: 'La Casa', dependencias: 'Dependencias' },
  en: { jardines: 'Gardens', casa: 'The House', dependencias: 'Estate' },
  de: { jardines: 'Gärten', casa: 'Das Haus', dependencias: 'Nebengebäude' },
  ca: { jardines: 'Jardins', casa: 'La Casa', dependencias: 'Dependències' },
  fr: { jardines: 'Jardins', casa: 'La Maison', dependencias: 'Dépendances' },
}

// ─── UI copy ─────────────────────────────────────────────────────────────────

const UI_COPY = {
  es: { next: 'Siguiente sugerido', finish: 'Finalizar visita', loading: 'Cargando…', error: 'No se pudo cargar este punto.', retry: 'Reintentar', noNext: 'Ya has escuchado todos los puntos' },
  en: { next: 'Suggested next', finish: 'End visit', loading: 'Loading…', error: 'Could not load this stop.', retry: 'Retry', noNext: 'You have listened to all stops' },
  de: { next: 'Nächster Vorschlag', finish: 'Besuch beenden', loading: 'Wird geladen…', error: 'Dieser Punkt konnte nicht geladen werden.', retry: 'Erneut versuchen', noNext: 'Du hast alle Punkte gehört' },
  ca: { next: 'Següent suggerit', finish: 'Finalitzar visita', loading: 'Carregant…', error: 'No s\'ha pogut carregar aquest punt.', retry: 'Tornar a intentar', noNext: 'Ja has escoltat tots els punts' },
  fr: { next: 'Suivant suggéré', finish: 'Terminer la visite', loading: 'Chargement…', error: 'Impossible de charger ce point.', retry: 'Réessayer', noNext: 'Vous avez écouté tous les points' },
} satisfies Record<Language, Record<string, string>>

// ─── Image placeholder ────────────────────────────────────────────────────────

function ImagePlaceholder({ poiNumber }: { poiNumber: number }) {
  return (
    <div
      className="w-full flex items-center justify-center"
      style={{
        height: 220,
        background: 'linear-gradient(135deg, #1A2C1F 0%, #233B29 50%, #2E4D36 100%)',
      }}
    >
      <div className="flex flex-col items-center gap-2 opacity-40">
        <Leaf className="w-12 h-12 text-alfabia-cream" />
        <span className="text-alfabia-cream text-4xl font-display">{poiNumber}</span>
      </div>
    </div>
  )
}

// ─── Next suggestion button ───────────────────────────────────────────────────

interface NextButtonProps {
  isClosing: boolean
  nextPOI: POI | null
  nextTitle: string | null
  language: Language
  onPress: () => void
}

function NextButton({ isClosing, nextPOI, nextTitle, language, onPress }: NextButtonProps) {
  const copy = UI_COPY[language]

  if (!isClosing && !nextPOI) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-sm text-alfabia-text-muted">
        <CheckCircle className="w-4 h-4" />
        {copy.noNext}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center justify-between gap-3 py-3 px-5 bg-alfabia-green text-alfabia-cream rounded-xl transition-colors active:bg-alfabia-green-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-alfabia-green"
    >
      <div className="flex flex-col items-start min-w-0">
        <span className="text-sm font-semibold leading-tight">
          {isClosing ? copy.finish : copy.next}
        </span>
        {!isClosing && nextTitle && (
          <span className="text-xs opacity-70 truncate max-w-[220px]">{nextTitle}</span>
        )}
      </div>
      <ChevronRight className="w-5 h-5 shrink-0 opacity-80" />
    </button>
  )
}

// ─── POIDetailPage ─────────────────────────────────────────────────────────────

interface POIItem {
  poi: POI
  translation: Translation
}

export default function POIDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const language = useAppStore((s) => s.language)
  const toggleFavorite = useProgressStore((s) => s.toggleFavorite)
  const isFavorite = useProgressStore((s) => s.isFavorite)

  const [allItems, setAllItems] = useState<POIItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const copy = UI_COPY[language]

  async function fetchData() {
    setLoading(true)
    setError(false)
    try {
      const items = await getPOIsWithTranslations(language)
      setAllItems(items)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchData() }, [language])

  // Current POI derived from the full list.
  // The route accepts the UUID or the POI number: the illustrated map only
  // knows the numbers drawn in its SVG and links to /poi/7.
  const current = useMemo(
    () =>
      allItems.find(
        (item) => item.poi.id === id || String(item.poi.number) === id,
      ) ?? null,
    [allItems, id],
  )

  // Next suggestion: strictly linear by sort_order
  const nextItem = useMemo((): POIItem | null => {
    if (!current) return null

    const sorted = [...allItems].sort(
      (a, b) => a.poi.sortOrder - b.poi.sortOrder,
    )
    const currentIndex = sorted.findIndex((i) => i.poi.id === current.poi.id)
    if (currentIndex === -1) return null

    return sorted[currentIndex + 1] ?? null
  }, [allItems, current])

  const isClosing = current?.poi.number === 18

  // Track poi_view once per POI (guard against language-change re-renders)
  const trackedPoiRef = useRef<string | null>(null)
  useEffect(() => {
    if (!current || trackedPoiRef.current === current.poi.id) return
    trackedPoiRef.current = current.poi.id
    trackPOIView(current.poi.number)
  }, [current])

  const handleAudioPlay = useCallback(() => {
    if (current) trackAudioPlay(current.poi.number, language)
  }, [current, language])

  const handleAudioComplete = useCallback((durationSeconds: number) => {
    if (current) trackAudioComplete(current.poi.number, language, durationSeconds)
  }, [current, language])

  function handleNext() {
    if (isClosing) {
      navigate('/closing')
    } else if (nextItem) {
      navigate(`/poi/${nextItem.poi.id}`)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-alfabia-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{copy.loading}</span>
      </div>
    )
  }

  if (error || !current) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="text-sm text-alfabia-text-muted">{copy.error}</p>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="text-sm font-medium text-alfabia-green underline underline-offset-2"
        >
          {copy.retry}
        </button>
      </div>
    )
  }

  const { poi, translation } = current
  const sectionLabel = SECTION_LABELS[language][poi.section]
  const favorite = isFavorite(poi.id)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col pb-28">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-alfabia-cream/90 backdrop-blur-sm border-b border-alfabia-border">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-alfabia-text-muted hover:text-alfabia-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alfabia-green rounded-md px-1"
          aria-label="Volver"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="sr-only">Volver</span>
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-alfabia-text-muted">
            {poi.number} / 18
          </span>
          <button
            type="button"
            onClick={() => toggleFavorite(poi.id)}
            aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-rose-50 active:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 transition-colors"
              fill={favorite ? '#ef4444' : 'none'}
              stroke={favorite ? '#ef4444' : '#9ca3af'}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Hero image ── */}
      {poi.imageUrl ? (
        <img
          src={poi.imageUrl}
          alt={translation.title}
          loading="lazy"
          className="w-full object-cover"
          style={{ height: 220 }}
        />
      ) : (
        <ImagePlaceholder poiNumber={poi.number} />
      )}

      {/* ── Main content ── */}
      <div className="px-4 pt-4 flex flex-col gap-4">

        {/* Section + guide points */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-alfabia-accent">
            {sectionLabel}
          </span>
          {poi.guidePoints && (
            <>
              <span className="text-alfabia-border">·</span>
              <span className="flex items-center gap-1 text-xs text-alfabia-text-muted">
                <MapPin className="w-3 h-3" />
                {poi.guidePoints}
              </span>
            </>
          )}
        </div>

        {/* Title */}
        <h1 className="font-display text-2xl leading-tight text-alfabia-green-dark -mt-1">
          {translation.title}
        </h1>

        {/* AudioPlayer */}
        <AudioPlayer
          poiId={poi.id}
          audioUrlOgg={translation.audioUrlOgg}
          audioUrlMp3={translation.audioUrlMp3}
          onPlay={handleAudioPlay}
          onComplete={handleAudioComplete}
        />

        {/* Description */}
        <div className="border-t border-alfabia-border pt-4">
          <p className="text-sm text-alfabia-text leading-relaxed whitespace-pre-line">
            {translation.description}
          </p>
        </div>

        {/* Mini map */}
        <div className="border-t border-alfabia-border pt-4">
          <Suspense
            fallback={
              <div
                className="rounded-xl border border-alfabia-border bg-alfabia-border/20 flex items-center justify-center"
                style={{ height: 180 }}
              >
                <Loader2 className="w-5 h-5 animate-spin text-alfabia-text-muted" />
              </div>
            }
          >
            <MiniMap
              latitude={poi.latitude}
              longitude={poi.longitude}
              poiName={translation.title}
            />
          </Suspense>
        </div>

      </div>

      {/* ── Sticky next button (above BottomNav at bottom-16) ── */}
      <div className="fixed bottom-16 left-0 right-0 z-20 px-4 py-3 bg-alfabia-cream/95 backdrop-blur-sm border-t border-alfabia-border">
        <NextButton
          isClosing={isClosing}
          nextPOI={nextItem?.poi ?? null}
          nextTitle={nextItem?.translation.title ?? null}
          language={language}
          onPress={handleNext}
        />
      </div>
    </div>
  )
}
