import type { Language } from '@/lib/types'
import { useAppStore } from '@/stores/useAppStore'

// ─── Translation dictionary ───────────────────────────────────────────────────

export interface Translations {
  // Navigation
  home: string
  map: string
  settings: string

  // Home page
  nearbyTab: string
  allTab: string
  nearbyEmpty: string
  nearbyEmptyHint: string
  nearbyNoGps: string
  nearbyNoGpsHint: string
  loading: string
  error: string
  retry: string
  listened: string

  // Settings page
  settingsTitle: string
  langSection: string
  offlineSection: string
  creditsSection: string

  // Offline manager
  downloadButton: string
  downloading: string
  downloadComplete: string
  clearCache: string
  storageWarning: string

  // POI detail
  sectionLabel: string
  nextStop: string
  endVisit: string
  audioError: string

  // Map page
  mapLoading: string
  legend: string
  unvisited: string
  listenedLabel: string
  favorite: string
  mapError: string
  switchToGps: string
  switchToPlan: string
  gardens: string
  house: string
  outbuildings: string
}

const translations: Record<Language, Translations> = {
  es: {
    home: 'Inicio',
    map: 'Mapa',
    settings: 'Ajustes',

    nearbyTab: 'Cerca de mí',
    allTab: 'Ver todos',
    nearbyEmpty: 'No hay puntos cercanos',
    nearbyEmptyHint: 'Activa el GPS para recibir sugerencias según tu posición.',
    nearbyNoGps: 'Ubicación no disponible',
    nearbyNoGpsHint: 'Activa la ubicación para ver los puntos más cercanos.',
    loading: 'Cargando…',
    error: 'No se pudo cargar la lista. Comprueba tu conexión.',
    retry: 'Reintentar',
    listened: 'escuchado',

    settingsTitle: 'Ajustes',
    langSection: 'Idioma',
    offlineSection: 'Modo offline',
    creditsSection: 'Créditos',

    downloadButton: 'Descargar audios',
    downloading: 'Descargando…',
    downloadComplete: 'Audios disponibles sin conexión',
    clearCache: 'Liberar espacio',
    storageWarning: 'Espacio disponible bajo',

    sectionLabel: 'Punto',
    nextStop: 'Siguiente parada',
    endVisit: 'Finalizar visita',
    audioError: 'No se pudo cargar el audio',

    mapLoading: 'Cargando mapa…',
    legend: 'Leyenda',
    unvisited: 'No visitado',
    listenedLabel: 'Escuchado',
    favorite: 'Favorito',
    mapError: 'No se pudo cargar el mapa.',
    switchToGps: 'Cambiar a mapa GPS',
    switchToPlan: 'Cambiar a mapa interactivo',
    gardens: 'Jardines',
    house: 'Casa',
    outbuildings: 'Dependencias',
  },
  en: {
    home: 'Home',
    map: 'Map',
    settings: 'Settings',

    nearbyTab: 'Near me',
    allTab: 'All stops',
    nearbyEmpty: 'No nearby stops',
    nearbyEmptyHint: 'Enable GPS to receive suggestions based on your location.',
    nearbyNoGps: 'Location unavailable',
    nearbyNoGpsHint: 'Enable location to see the nearest stops.',
    loading: 'Loading…',
    error: 'Could not load the list. Check your connection.',
    retry: 'Retry',
    listened: 'listened',

    settingsTitle: 'Settings',
    langSection: 'Language',
    offlineSection: 'Offline mode',
    creditsSection: 'Credits',

    downloadButton: 'Download audio',
    downloading: 'Downloading…',
    downloadComplete: 'Audio available offline',
    clearCache: 'Free up space',
    storageWarning: 'Low available space',

    sectionLabel: 'Stop',
    nextStop: 'Next stop',
    endVisit: 'End visit',
    audioError: 'Could not load audio',

    mapLoading: 'Loading map…',
    legend: 'Legend',
    unvisited: 'Unvisited',
    listenedLabel: 'Listened',
    favorite: 'Favourite',
    mapError: 'Could not load the map.',
    switchToGps: 'Switch to GPS map',
    switchToPlan: 'Switch to interactive map',
    gardens: 'Gardens',
    house: 'House',
    outbuildings: 'Estate',
  },
  de: {
    home: 'Startseite',
    map: 'Karte',
    settings: 'Einstellungen',

    nearbyTab: 'In der Nähe',
    allTab: 'Alle Punkte',
    nearbyEmpty: 'Keine nahen Punkte',
    nearbyEmptyHint: 'Aktiviere GPS für Vorschläge basierend auf deinem Standort.',
    nearbyNoGps: 'Standort nicht verfügbar',
    nearbyNoGpsHint: 'Aktiviere den Standort, um die nächsten Punkte zu sehen.',
    loading: 'Wird geladen…',
    error: 'Liste konnte nicht geladen werden. Verbindung prüfen.',
    retry: 'Erneut versuchen',
    listened: 'gehört',

    settingsTitle: 'Einstellungen',
    langSection: 'Sprache',
    offlineSection: 'Offline-Modus',
    creditsSection: 'Impressum',

    downloadButton: 'Audio herunterladen',
    downloading: 'Herunterladen…',
    downloadComplete: 'Audio offline verfügbar',
    clearCache: 'Speicher freigeben',
    storageWarning: 'Wenig freier Speicher',

    sectionLabel: 'Punkt',
    nextStop: 'Nächster Halt',
    endVisit: 'Besuch beenden',
    audioError: 'Audio konnte nicht geladen werden',

    mapLoading: 'Karte wird geladen…',
    legend: 'Legende',
    unvisited: 'Nicht besucht',
    listenedLabel: 'Gehört',
    favorite: 'Favorit',
    mapError: 'Karte konnte nicht geladen werden.',
    switchToGps: 'Zur GPS-Karte wechseln',
    switchToPlan: 'Zur interaktiven Karte wechseln',
    gardens: 'Gärten',
    house: 'Haus',
    outbuildings: 'Nebengebäude',
  },
  fr: {
    home: 'Accueil',
    map: 'Carte',
    settings: 'Paramètres',

    nearbyTab: 'Près de moi',
    allTab: 'Tout voir',
    nearbyEmpty: 'Aucun point à proximité',
    nearbyEmptyHint: 'Activez le GPS pour recevoir des suggestions selon votre position.',
    nearbyNoGps: 'Localisation indisponible',
    nearbyNoGpsHint: 'Activez la localisation pour voir les points les plus proches.',
    loading: 'Chargement…',
    error: 'Impossible de charger la liste. Vérifiez votre connexion.',
    retry: 'Réessayer',
    listened: 'écouté',

    settingsTitle: 'Paramètres',
    langSection: 'Langue',
    offlineSection: 'Mode hors ligne',
    creditsSection: 'Crédits',

    downloadButton: 'Télécharger les audios',
    downloading: 'Téléchargement…',
    downloadComplete: 'Audio disponible hors ligne',
    clearCache: 'Libérer de l\'espace',
    storageWarning: 'Espace disponible faible',

    sectionLabel: 'Point',
    nextStop: 'Arrêt suivant',
    endVisit: 'Terminer la visite',
    audioError: 'Impossible de charger l\'audio',

    mapLoading: 'Chargement de la carte…',
    legend: 'Légende',
    unvisited: 'Non visité',
    listenedLabel: 'Écouté',
    favorite: 'Favori',
    mapError: 'Impossible de charger la carte.',
    switchToGps: 'Passer à la carte GPS',
    switchToPlan: 'Passer à la carte interactive',
    gardens: 'Jardins',
    house: 'Maison',
    outbuildings: 'Dépendances',
  },
  ca: {
    home: 'Inici',
    map: 'Mapa',
    settings: 'Config',

    nearbyTab: 'Prop meu',
    allTab: 'Veure tots',
    nearbyEmpty: 'No hi ha punts propers',
    nearbyEmptyHint: 'Activa el GPS per rebre suggeriments segons la teva posició.',
    nearbyNoGps: 'Ubicació no disponible',
    nearbyNoGpsHint: "Activa la ubicació per veure els punts més propers.",
    loading: 'Carregant…',
    error: "No s'ha pogut carregar la llista. Comprova la connexió.",
    retry: 'Tornar a intentar',
    listened: 'escoltat',

    settingsTitle: 'Ajustos',
    langSection: 'Llengua',
    offlineSection: 'Mode offline',
    creditsSection: 'Crèdits',

    downloadButton: 'Descarregar àudios',
    downloading: 'Descarregant…',
    downloadComplete: 'Àudio disponible sense connexió',
    clearCache: 'Alliberar espai',
    storageWarning: 'Espai disponible baix',

    sectionLabel: 'Punt',
    nextStop: 'Següent parada',
    endVisit: 'Finalitzar visita',
    audioError: "No s'ha pogut carregar l'àudio",

    mapLoading: 'Carregant mapa…',
    legend: 'Llegenda',
    unvisited: 'No visitat',
    listenedLabel: 'Escoltat',
    favorite: 'Preferit',
    mapError: "No s'ha pogut carregar el mapa.",
    switchToGps: 'Canviar a mapa GPS',
    switchToPlan: 'Canviar a mapa interactiu',
    gardens: 'Jardins',
    house: 'Casa',
    outbuildings: 'Dependències',
  },
}

export default translations

// ─── useT hook ────────────────────────────────────────────────────────────────

/**
 * Returns a translation function `t(key)` for the active language.
 * Falls back to Spanish if the language is somehow unset.
 */
export function useT(): (key: keyof Translations) => string {
  const language = useAppStore((s) => s.language)
  const dict = translations[language] ?? translations.es
  return (key: keyof Translations) => dict[key]
}
