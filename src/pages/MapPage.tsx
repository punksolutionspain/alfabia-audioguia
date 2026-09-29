import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, Map as MapIcon } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { useAppStore } from '@/stores/useAppStore'
import { trackMapView } from '@/services/analyticsService'
import { useProgressStore } from '@/stores/useProgressStore'
import { getAllPOIs } from '@/services/poiService'
import MapComponent from '@/components/MapComponent'
import { useT } from '@/i18n/translations'
import type { POI } from '@/lib/types'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl

type PinState = 'default' | 'listened' | 'favorite'
type MapMode = 'gps' | 'svg'

const PIN_COLORS: Record<PinState, string> = {
  default:  '#9CA3AF',
  listened: '#233B29',
  favorite: '#EF4444',
}

function createPOIMarker(state: PinState, number: number): L.DivIcon {
  const color = PIN_COLORS[state]
  return L.divIcon({
    html: `
      <div style="
        position:relative;
        width:32px;height:38px;
        display:flex;flex-direction:column;align-items:center;
      ">
        <div style="
          width:32px;height:32px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:${color};
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
        ">
          <span style="
            transform:rotate(45deg);
            font-size:11px;font-weight:700;
            color:white;font-family:system-ui,sans-serif;
            line-height:1;
          ">${number}</span>
        </div>
      </div>
    `,
    iconSize: [32, 38],
    iconAnchor: [16, 38],
    className: '',
  })
}

function createUserMarker(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center">
        <div id="user-pulse" style="
          position:absolute;inset:0;border-radius:50%;
          background:#3B82F6;
          animation:user-pulse 1.8s ease-out infinite;
        "></div>
        <div style="
          position:relative;
          width:12px;height:12px;border-radius:50%;
          background:#2563EB;
          border:2.5px solid white;
          box-shadow:0 0 0 3px rgba(37,99,235,0.25);
        "></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    className: '',
  })
}

let keyframesInjected = false
function injectPulseKeyframes() {
  if (keyframesInjected) return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes user-pulse {
      0%   { transform: scale(1);   opacity: 0.55; }
      70%  { transform: scale(2.4); opacity: 0;    }
      100% { transform: scale(2.4); opacity: 0;    }
    }
  `
  document.head.appendChild(style)
  keyframesInjected = true
}

function FitBounds({ pois }: { pois: POI[] }) {
  const map = useMap()
  const fitted = useMemo(() => ({ done: false }), [])

  useEffect(() => {
    if (pois.length === 0 || fitted.done) return
    const bounds = L.latLngBounds(pois.map((p) => [p.latitude, p.longitude]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 })
    fitted.done = true
  }, [pois, map, fitted])

  return null
}

export default function MapPage() {
  const navigate = useNavigate()
  const t = useT()
  const [mapMode, setMapMode] = useState<MapMode>('svg')
  const userPosition = useAppStore((s) => s.userPosition)
  const favorites = useProgressStore((s) => s.favorites)
  const listenedPOIs = useProgressStore((s) => s.listenedPOIs)

  const [pois, setPOIs] = useState<POI[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    injectPulseKeyframes()
    trackMapView()
  }, [])

  async function fetchPOIs() {
    setLoading(true)
    setError(false)
    try {
      setPOIs(await getAllPOIs())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchPOIs() }, [])

  const pinState = useCallback(
    (poiId: string): PinState => {
      if (favorites.includes(poiId))    return 'favorite'
      if (listenedPOIs.includes(poiId)) return 'listened'
      return 'default'
    },
    [favorites, listenedPOIs],
  )

  if (mapMode === 'svg') {
    return (
      <div style={{ height: 'calc(100svh - 64px)' }} className="relative">
        <MapComponent />
        
        <button
          onClick={() => setMapMode('gps')}
          className="absolute top-4 left-4 z-[200] flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm border border-alfabia-border rounded-lg shadow-sm hover:bg-white transition-all"
          title={t('switchToGps')}
        >
          <MapIcon className="w-4 h-4 text-alfabia-green" />
          <span className="text-xs font-medium text-alfabia-text">GPS</span>
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-full text-alfabia-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">{t('mapLoading')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-20 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="text-sm text-alfabia-text-muted">{t('mapError')}</p>
        <button
          type="button"
          onClick={() => void fetchPOIs()}
          className="text-sm font-medium text-alfabia-green underline underline-offset-2"
        >
          {t('retry')}
        </button>
      </div>
    )
  }

  const defaultCenter: [number, number] = [39.76400, 2.78400]

  return (
    <div style={{ height: 'calc(100svh - 64px)' }} className="overflow-hidden relative">
      <MapContainer
        center={defaultCenter}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        zoomControl
        scrollWheelZoom
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {pois.length > 0 && <FitBounds pois={pois} />}

        {pois.map((poi) => {
          const state = pinState(poi.id)
          return (
            <Marker
              key={`${poi.id}-${state}`}
              position={[poi.latitude, poi.longitude]}
              icon={createPOIMarker(state, poi.number)}
              eventHandlers={{
                click: () => navigate(`/poi/${poi.id}`),
              }}
            />
          )
        })}

        {userPosition && (
          <>
            {userPosition.accuracy < 200 && (
              <Circle
                center={[userPosition.lat, userPosition.lng]}
                radius={userPosition.accuracy}
                fillColor="#3B82F6"
                fillOpacity={0.08}
                color="#3B82F6"
                weight={1}
              />
            )}
            <Marker
              position={[userPosition.lat, userPosition.lng]}
              icon={createUserMarker()}
              zIndexOffset={1000}
            />
          </>
        )}
      </MapContainer>

      <button
        onClick={() => setMapMode('svg')}
        className="absolute top-4 left-4 z-[500] flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm border border-alfabia-border rounded-lg shadow-sm hover:bg-white transition-all"
        title={t('switchToPlan')}
      >
        <MapIcon className="w-4 h-4 text-alfabia-green" />
        <span className="text-xs font-medium text-alfabia-text">{t('map')}</span>
      </button>

      <div className="absolute bottom-20 right-3 z-[500] flex flex-col gap-1.5 bg-white/90 backdrop-blur-sm border border-alfabia-border rounded-xl px-3 py-2.5 shadow-sm pointer-events-none">
        {(
          [
            ['default',  t('unvisited')],
            ['listened', t('listenedLabel')],
            ['favorite', t('favorite')],
          ] as [PinState, string][]
        ).map(([state, label]) => (
          <div key={state} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: PIN_COLORS[state] }}
            />
            <span className="text-[11px] text-alfabia-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}