import { useState } from 'react'
import type { Language } from '@/lib/types'

// ─── i18n ─────────────────────────────────────────────────────────────────────

const MSGS: Record<Language, { title: string; body: string; thanks: string }> = {
  es: {
    title:  'Temporada finalizada',
    body:   'La audioguía descansa durante el invierno. Los Jardines de Alfabia reabren sus puertas en marzo de 2027.',
    thanks: 'Gracias por vuestra visita. ¡Hasta la próxima temporada!',
  },
  en: {
    title:  'Closed for the season',
    body:   'The audio guide is taking its winter rest. Jardines de Alfabia will reopen in March 2027.',
    thanks: 'Thank you for visiting. See you next season!',
  },
  de: {
    title:  'Saison beendet',
    body:   'Der Audioguide macht Winterpause. Die Jardines de Alfabia öffnen im März 2027 wieder ihre Türen.',
    thanks: 'Vielen Dank für Ihren Besuch. Bis zur nächsten Saison!',
  },
  fr: {
    title:  'Saison terminée',
    body:   "L'audioguide prend sa pause hivernale. Les Jardins de Alfabia rouvriront leurs portes en mars 2027.",
    thanks: 'Merci de votre visite. À la saison prochaine !',
  },
  ca: {
    title:  'Temporada finalitzada',
    body:   "L'audioguia descansa durant l'hivern. Els Jardins de Alfabia tornaran a obrir les portes el març de 2027.",
    thanks: 'Gràcies per la vostra visita. Fins a la propera temporada!',
  },
}

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'fr', label: 'FR' },
  { code: 'ca', label: 'CA' },
]

const STORAGE_KEY = 'alfabia_lang'
const VALID: readonly Language[] = ['es', 'en', 'de', 'fr', 'ca']

/** Stored choice from a past visit, else browser language, else Spanish. */
function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (VALID as string[]).includes(stored)) return stored as Language
  } catch {
    // storage unavailable — fall through to browser detection
  }
  const nav = navigator.language?.slice(0, 2).toLowerCase()
  return nav && (VALID as string[]).includes(nav) ? (nav as Language) : 'es'
}

// ─── SeasonClosedPage ─────────────────────────────────────────────────────────

export default function SeasonClosedPage() {
  const [language, setLanguage] = useState<Language>(detectLanguage)
  const msgs = MSGS[language]

  function choose(lang: Language) {
    setLanguage(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // storage unavailable (private mode or quota exceeded) — continue without persistence
    }
  }

  return (
    <div
      className="min-h-svh flex flex-col items-center justify-between px-6 py-12"
      style={{ backgroundColor: '#F8F2E7' }}
    >
      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm md:max-w-xl gap-8 text-center">
        {/* Vertical logo — mobile only */}
        <img
          src="/Alfabia_Vertical_Positivo.png"
          alt="Jardines de Alfabia"
          className="block md:hidden w-40"
        />
        {/* Horizontal logo — desktop only */}
        <img
          src="/Alfabia_Horizontal_Positivo.png"
          alt="Jardines de Alfabia"
          className="hidden md:block w-72"
        />

        <h1
          className="text-2xl md:text-3xl tracking-widest uppercase"
          style={{
            fontFamily: '"Teodor", "Playfair Display", Georgia, serif',
            color: '#233B29',
            letterSpacing: '0.12em',
          }}
        >
          {msgs.title}
        </h1>

        <div className="flex flex-col gap-3 max-w-xs md:max-w-md">
          <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>
            {msgs.body}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
            {msgs.thanks}
          </p>
        </div>

        <a
          href="https://www.jardinesdealfabia.com"
          className="text-xs tracking-widest uppercase underline underline-offset-4"
          style={{ color: '#233B29' }}
        >
          www.jardinesdealfabia.com
        </a>

        {/* Language switcher */}
        <div className="flex gap-4 mt-2">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => choose(code)}
              className="text-xs tracking-widest py-1 px-1"
              style={{
                color: code === language ? '#233B29' : '#6B7280',
                fontWeight: code === language ? 600 : 400,
                borderBottom: code === language ? '1px solid #233B29' : '1px solid transparent',
                background: 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
