import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackMapView } from '@/services/analyticsService'
import { useT } from '@/i18n/translations'
import mapaUrl from '@/assets/mapa.svg'
import './MapComponent.css'

type ViewMode = 'exterior' | 'interior'

const JARDINES_POIS = ['1','2','3','4','5','6','7','8','9']
const CASA_POIS = ['10','11','12','13','14','15','16','17','18']

export default function MapComponent() {
  const navigate = useNavigate()
  const t = useT()
  const [view, setView] = useState<ViewMode>('exterior')
  const [rawSvg, setRawSvg] = useState<string>('')

  useEffect(() => {
    trackMapView()
    fetch(mapaUrl)
      .then((r) => r.text())
      .then((content) => setRawSvg(content))
      .catch((e) => console.error('Error loading map:', e))
  }, [])

  // Modificar SVG inyectando estilos inline según la vista activa
  const processedSvg = useMemo(() => {
    if (!rawSvg) return ''

    const activePOIs = view === 'exterior' ? JARDINES_POIS : CASA_POIS
    const inactivePOIs = view === 'exterior' ? CASA_POIS : JARDINES_POIS

    let svg = rawSvg

    activePOIs.forEach((id) => {
      svg = svg.replace(
        `data-poi-id="${id}"`,
        `data-poi-id="${id}" style="opacity:1;cursor:pointer;transition:opacity 0.3s"`
      )
    })

    inactivePOIs.forEach((id) => {
      svg = svg.replace(
        `data-poi-id="${id}"`,
        `data-poi-id="${id}" style="opacity:0.15;pointer-events:none;transition:opacity 0.3s"`
      )
    })

    return svg
  }, [rawSvg, view])

  const handlePOIClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const poiWrapper = target.closest('[data-poi-id]') as HTMLElement | null
    if (poiWrapper) {
      const poiId = poiWrapper.getAttribute('data-poi-id')
      if (poiId) navigate(`/poi/${poiId}`)
    }
  }

  return (
    <div className="map-container">
      <div className="map-toggle">
        <button
          onClick={() => setView('exterior')}
          className={`toggle-btn ${view === 'exterior' ? 'active' : ''}`}
        >
          🌳 {t('gardens')}
        </button>
        <button
          onClick={() => setView('interior')}
          className={`toggle-btn ${view === 'interior' ? 'active' : ''}`}
        >
          🏠 {t('house')}
        </button>
      </div>

      {processedSvg && (
        <div
          className="map-wrapper"
          data-view={view}
          onClick={handlePOIClick}
          dangerouslySetInnerHTML={{ __html: processedSvg }}
        />
      )}

      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#7BA66F' }} />
          <span>{t('gardens')}</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#D4B896' }} />
          <span>{t('house')}</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#9B8F7E' }} />
          <span>{t('outbuildings')}</span>
        </div>
      </div>
    </div>
  )
}
