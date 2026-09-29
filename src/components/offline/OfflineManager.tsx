import { useEffect, useRef } from 'react'
import { CheckCircle, Download, AlertCircle, Trash2 } from 'lucide-react'
import type { Language, POI, Translation } from '@/lib/types'
import { useOfflineStore } from '@/stores/useOfflineStore'
import {
  downloadAudiosForLanguage,
  clearAudioCache,
  estimateStorage,
  type AudioItem,
} from '@/services/audioService'
import { trackOfflineDownload } from '@/services/analyticsService'
import { pickAudioUrl } from '@/lib/audioFormat'
import DownloadProgress from './DownloadProgress'
import StorageQuota from './StorageQuota'

// ─── i18n ─────────────────────────────────────────────────────────────────────

const COPY = {
  es: {
    download: 'Descargar audios',
    retry: 'Error — reintentar',
    complete: 'Audios disponibles sin conexión',
    clear: 'Liberar espacio',
    noUrls: 'Audios no disponibles aún',
  },
  en: {
    download: 'Download audio',
    retry: 'Error — retry',
    complete: 'Audio available offline',
    clear: 'Free up space',
    noUrls: 'Audio not available yet',
  },
  de: {
    download: 'Audios herunterladen',
    retry: 'Fehler — wiederholen',
    complete: 'Audios offline verfügbar',
    clear: 'Speicher freigeben',
    noUrls: 'Audios noch nicht verfügbar',
  },
  ca: {
    download: 'Descarregar àudios',
    retry: 'Error — reintentar',
    complete: 'Àudios disponibles sense connexió',
    clear: 'Alliberar espai',
    noUrls: 'Àudios no disponibles encara',
  },
  fr: {
    download: 'Télécharger les audios',
    retry: 'Erreur — réessayer',
    complete: 'Audios disponibles hors ligne',
    clear: 'Libérer de l\'espace',
    noUrls: 'Audios pas encore disponibles',
  },
} satisfies Record<Language, Record<string, string>>

// ─── Props ────────────────────────────────────────────────────────────────────

interface OfflineManagerProps {
  language: Language
  items: Array<{ poi: POI; translation: Translation }>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OfflineManager({ language, items }: OfflineManagerProps) {
  const {
    downloadState,
    downloadProgress,
    cachedAudios,
    cachedLanguage,
    availableSpace,
    setDownloadState,
    setDownloadProgress,
    addCachedAudio,
    clearCachedAudios,
    setCachedLanguage,
    setAvailableSpace,
  } = useOfflineStore()

  const abortRef = useRef<AbortController | null>(null)
  const copy = COPY[language]

  // Check storage estimate on mount
  useEffect(() => {
    estimateStorage()
      .then(({ available }) => setAvailableSpace(available))
      .catch(() => {/* StorageManager unavailable — ignore */})
  }, [setAvailableSpace])

  // If the user switched language, the cached audios belong to a different language
  useEffect(() => {
    if (cachedLanguage !== null && cachedLanguage !== language) {
      clearCachedAudios()
    }
  }, [language, cachedLanguage, clearCachedAudios])

  // Abort any in-progress download on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Build the list of audio items to download (same format the player will request)
  const audioItems: AudioItem[] = items.flatMap(({ poi, translation }) => {
    const url = pickAudioUrl(translation)
    if (!url) return []
    return [{ poiId: poi.id, audioUrl: url }]
  })

  const hasAudioUrls = audioItems.length > 0
  const totalCount = audioItems.length
  const currentCount = Math.round((downloadProgress / 100) * totalCount)

  async function startDownload() {
    if (!hasAudioUrls) return

    // Refresh storage estimate before starting
    const { available } = await estimateStorage()
    setAvailableSpace(available)

    abortRef.current = new AbortController()
    setDownloadState('downloading')
    setDownloadProgress(0)

    try {
      await downloadAudiosForLanguage(
        language,
        audioItems,
        {
          onProgress: (downloaded, total, poiId) => {
            addCachedAudio(poiId)
            setDownloadProgress(Math.round((downloaded / total) * 100))
          },
          onItemError: (_err, _poiId) => {
            // individual item errors bubble up and abort the loop
          },
        },
        abortRef.current.signal,
      )

      setCachedLanguage(language)
      setDownloadState('complete')
      trackOfflineDownload(language)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setDownloadState('error')
    }
  }

  async function handleClearCache() {
    abortRef.current?.abort()
    await clearAudioCache(language)
    clearCachedAudios()

    // Refresh space estimate after clearing
    const { available } = await estimateStorage()
    setAvailableSpace(available)
  }

  // ── Render: downloading ───────────────────────────────────────────────────

  if (downloadState === 'downloading') {
    return (
      <div className="flex flex-col gap-2 px-1 py-1">
        <DownloadProgress
          current={currentCount}
          total={totalCount}
          progress={downloadProgress}
          language={language}
        />
        <StorageQuota availableBytes={availableSpace} language={language} />
      </div>
    )
  }

  // ── Render: complete ──────────────────────────────────────────────────────

  if (downloadState === 'complete') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            {copy.complete}
            <span className="font-normal text-xs text-alfabia-text-muted">
              ({cachedAudios.length}/{totalCount})
            </span>
          </span>

          <button
            type="button"
            onClick={() => void handleClearCache()}
            className="flex items-center gap-1 text-xs text-alfabia-text-muted hover:text-rose-600 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {copy.clear}
          </button>
        </div>
        <StorageQuota availableBytes={availableSpace} language={language} />
      </div>
    )
  }

  // ── Render: idle / error ──────────────────────────────────────────────────

  const isError = downloadState === 'error'
  const hasSomeCached = cachedAudios.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasAudioUrls}
          onClick={() => void startDownload()}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-alfabia-green text-alfabia-cream font-medium text-sm rounded-xl active:bg-alfabia-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-alfabia-green"
        >
          {isError ? (
            <>
              <AlertCircle className="w-4 h-4 shrink-0" />
              {copy.retry}
            </>
          ) : !hasAudioUrls ? (
            <>{copy.noUrls}</>
          ) : (
            <>
              <Download className="w-4 h-4 shrink-0" />
              {copy.download}
              <span className="opacity-70 text-xs font-normal">({totalCount})</span>
            </>
          )}
        </button>

        {hasSomeCached && !isError && (
          <button
            type="button"
            onClick={() => void handleClearCache()}
            aria-label={copy.clear}
            className="flex items-center justify-center w-11 rounded-xl border border-alfabia-border text-alfabia-text-muted hover:text-rose-600 hover:border-rose-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rose-400"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <StorageQuota availableBytes={availableSpace} language={language} />
    </div>
  )
}
