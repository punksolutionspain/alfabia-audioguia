import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Language } from '@/lib/types'
import { trackLanguageSelect } from '@/services/analyticsService'
const LANGUAGE_BUTTONS: { code: Language; label: string }[] = [
  { code: 'es', label: 'ESPAÑOL' },
  { code: 'en', label: 'ENGLISH' },
  { code: 'de', label: 'DEUTSCH' },
  { code: 'fr', label: 'FRANÇAIS' },
  { code: 'ca', label: 'CATALÀ' },
]

export default function WelcomePage() {
  const navigate = useNavigate()
  const { setLanguage } = useLanguage()
  function handleSelect(code: Language) {
    setLanguage(code)
    trackLanguageSelect(code)
    navigate('/loading')
  }

  return (
    <div
      className="min-h-svh flex flex-col items-center justify-between px-6 py-12"
      style={{ backgroundColor: '#F8F2E7' }}
    >
      {/* Logo + title + buttons */}
      <div className="flex flex-col items-center flex-1 justify-center w-full max-w-xs gap-0">
        <img
          src="/Alfabia_Vertical_Positivo.png"
          alt="Jardines de Alfabia"
          className="w-36 object-contain"
          loading="eager"
        />

        <h1
          className="font-display text-center mt-6 mb-8"
          style={{
            color: '#233B29',
            fontSize: '0.65rem',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          GUÍA DEL VISITANTE · VISITOR GUIDE
        </h1>

        <div className="flex flex-col gap-3 w-full">
          {LANGUAGE_BUTTONS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => handleSelect(code)}
              className="w-full py-4 px-6 transition-colors duration-150"
              style={{
                border: '1px solid #233B29',
                borderRadius: '3px',
                background: 'transparent',
                color: '#233B29',
                fontSize: '0.7rem',
                fontWeight: 500,
                letterSpacing: '0.2em',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                el.style.background = '#233B29'
                el.style.color = '#F8F2E7'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                el.style.background = 'transparent'
                el.style.color = '#233B29'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p
        className="text-center leading-relaxed mt-8"
        style={{ fontSize: '0.65rem', color: '#6B7280', letterSpacing: '0.02em' }}
      >
        A digital experience — with ❤️ — by{' '}
        <a
          href="https://punk.solutions/en"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#6B7280', textDecoration: 'underline', textUnderlineOffset: '2px' }}
        >
          Punk Solutions
        </a>
      </p>
    </div>
  )
}
