import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAppStore } from '@/stores/useAppStore'
import { useOfflineStore } from '@/stores/useOfflineStore'
import { getPOIsWithTranslations } from '@/services/poiService'
import { downloadAudiosParallel, areAllAudiosCached, type AudioItem } from '@/services/audioService'
import { pickAudioUrl } from '@/lib/audioFormat'
import type { Language } from '@/lib/types'

// ─── i18n ─────────────────────────────────────────────────────────────────────

const MSGS = {
  es: {
    preparing:   'Preparando tu visita...',
    downloading: 'Descargando audios...',
    almost:      'Casi listo...',
    done:        '¡Listo!',
    counter:     (n: number, t: number) => `${n} de ${t} audios`,
  },
  en: {
    preparing:   'Preparing your visit...',
    downloading: 'Downloading audio...',
    almost:      'Almost ready...',
    done:        'Ready!',
    counter:     (n: number, t: number) => `${n} of ${t} audio files`,
  },
  de: {
    preparing:   'Besuch wird vorbereitet...',
    downloading: 'Audios werden heruntergeladen...',
    almost:      'Fast fertig...',
    done:        'Fertig!',
    counter:     (n: number, t: number) => `${n} von ${t} Audios`,
  },
  fr: {
    preparing:   'Préparation de votre visite...',
    downloading: 'Téléchargement des audios...',
    almost:      'Presque prêt...',
    done:        'Prêt\u00a0!',
    counter:     (n: number, t: number) => `${n} sur ${t} audios`,
  },
  ca: {
    preparing:   'Preparant la teva visita...',
    downloading: 'Descarregant àudios...',
    almost:      'Gairebé llest...',
    done:        'Llest!',
    counter:     (n: number, t: number) => `${n} de ${t} àudios`,
  },
} satisfies Record<Language, Record<string, string | ((n: number, t: number) => string)>>

const TOTAL_AUDIOS = 18

function statusText(
  progress: number,
  msgs: (typeof MSGS)[Language],
): string {
  if (progress >= 100) return msgs.done as string
  if (progress >= 80)  return msgs.almost as string
  if (progress >= 30)  return msgs.downloading as string
  return msgs.preparing as string
}

// ─── LoadingPage ──────────────────────────────────────────────────────────────

export default function LoadingPage() {
  const navigate  = useNavigate()
  const { language } = useLanguage()
  const appLang   = useAppStore((s) => s.language)

  const {
    addCachedAudio,
    setCachedLanguage,
    setDownloadState,
  } = useOfflineStore()

  const [progress, setProgress] = useState(0)
  const [done,     setDone]     = useState(0)
  const [total,    setTotal]    = useState(TOTAL_AUDIOS)

  const abortRef = useRef(new AbortController())
  const lang     = language ?? appLang
  const msgs     = MSGS[lang]

  useEffect(() => {
    console.log('LoadingPage mounted, checking cache...')

    // Guard: no language selected
    if (!language) {
      navigate('/', { replace: true })
      return
    }

    const ctrl = abortRef.current

    async function run() {
      try {
        // Fetch POI list to know which audio URLs to cache
        const items = await getPOIsWithTranslations(lang)
        const audioItems: AudioItem[] = items.flatMap(({ poi, translation }) => {
          const url = pickAudioUrl(translation)
          if (!url) return []
          return [{ poiId: poi.id, audioUrl: url }]
        })

        setTotal(audioItems.length)

        // The cache is the source of truth. The store only counts POIs, so it
        // cannot tell whether the files are still there or in which format.
        const allCached = await areAllAudiosCached(audioItems)

        console.log('Cache check result:', allCached)

        if (allCached) {
          // Already fully cached — show animation for at least 1.5 s
          setProgress(100)
          setDone(audioItems.length)
          await new Promise((r) => setTimeout(r, 1500))
          if (!ctrl.signal.aborted) navigate('/home', { replace: true })
          return
        }

        // Download with max 3 concurrent, 2 retries each
        await downloadAudiosParallel(
          audioItems,
          {
            onProgress: (downloaded, t, poiId) => {
              setDone(downloaded)
              setTotal(t)
              setProgress(Math.round((downloaded / t) * 100))
              addCachedAudio(poiId)
            },
            onItemError: (_err, _poiId) => {
              // Individual failures are tolerated — download continues
            },
          },
          ctrl.signal,
          3,
          2,
        )

        setCachedLanguage(lang)
        setDownloadState('complete')
        setProgress(100)

        // Hold "¡Listo!" for 500 ms so the user sees it
        await new Promise((r) => setTimeout(r, 500))
        if (!ctrl.signal.aborted) navigate('/home', { replace: true })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Network or parse error: navigate anyway rather than leaving the user stuck
        if (!ctrl.signal.aborted) navigate('/home', { replace: true })
      }
    }

    void run()
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label   = statusText(progress, msgs)
  const counter = (msgs.counter as (n: number, t: number) => string)(done, total)

  return (
    <div
      className="min-h-svh flex flex-col items-center justify-between px-6 py-12"
      style={{ backgroundColor: '#F8F2E7' }}
    >
      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full max-w-xs">

        {/* Logo con animación CSS pulse — sin dependencias externas, funciona offline */}
        <img
          src="/Alfabia_Vertical_Positivo.png"
          alt="Jardines de Alfabia"
          style={{
            width: 120,
            marginBottom: '2rem',
            animation: 'gentle-pulse 2s ease-in-out infinite',
          }}
        />
        <style>{`
          @keyframes gentle-pulse {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.06); opacity: 1; }
          }
        `}</style>

        {/* Status text */}
        <p
          className="text-sm font-medium text-center"
          style={{ color: '#233B29' }}
        >
          {label}
        </p>

        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: 240 }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: 'rgba(35,59,41,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: '#233B29',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Counter */}
        <p className="text-xs text-alfabia-text-muted">{counter}</p>
      </div>

      {/* ── Footer ── */}
      <p
        style={{
          fontSize: '0.6rem',
          letterSpacing: '0.25em',
          color: 'rgba(35,59,41,0.4)',
          textTransform: 'uppercase',
        }}
      >
        JARDINES DE ALFABIA
      </p>
    </div>
  )
}
