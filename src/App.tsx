import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LanguageProvider, useLanguage } from '@/contexts/LanguageContext'

// ─── Lazy-loaded pages (one chunk per route) ──────────────────────────────────
// Only AppShell + the two guards are loaded upfront. Everything else is split.

const SeasonClosedPage = lazy(() => import('@/pages/SeasonClosedPage'))
const WelcomePage  = lazy(() => import('@/pages/WelcomePage'))
const LoadingPage  = lazy(() => import('@/pages/LoadingPage'))
const HomePage     = lazy(() => import('@/pages/HomePage'))
const POIDetailPage = lazy(() => import('@/pages/POIDetailPage'))
const MapPage      = lazy(() => import('@/pages/MapPage'))
const ClosingPage  = lazy(() => import('@/pages/ClosingPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

// ─── Shared fallback ──────────────────────────────────────────────────────────

function PageFallback() {
  return (
    <div
      className="flex flex-1 min-h-svh items-center justify-center"
      style={{ backgroundColor: '#F8F2E7' }}
    />
  )
}

// ─── Route guards ─────────────────────────────────────────────────────────────

/** Index route — show WelcomePage if no language chosen, otherwise /loading */
function RootRoute() {
  const { language } = useLanguage()
  if (language !== null) return <Navigate to="/loading" replace />
  return (
    <Suspense fallback={<PageFallback />}>
      <WelcomePage />
    </Suspense>
  )
}

/** Redirect to / if the user hasn't chosen a language yet */
function RequireLanguage({ children }: { children: ReactNode }) {
  const { language } = useLanguage()
  if (language === null) return <Navigate to="/" replace />
  return <>{children}</>
}

// ─── App ──────────────────────────────────────────────────────────────────────

// Inlined at build time: toggling it requires a redeploy (set in Vercel env).
// While true the whole app is replaced by the closed-season notice, so nothing
// ever calls Supabase (paused during the winter).
const SEASON_CLOSED = import.meta.env.VITE_SEASON_CLOSED === 'true'

export default function App() {
  if (SEASON_CLOSED) {
    return (
      <Suspense fallback={<PageFallback />}>
        <SeasonClosedPage />
      </Suspense>
    )
  }
  return (
    <BrowserRouter>
      <LanguageProvider>
        <Routes>
          <Route element={<AppShell />}>

            {/* Public */}
            <Route index element={<RootRoute />} />

            {/* After language selection — no language guard for /loading itself
                (LoadingPage internally redirects to / if language is missing) */}
            <Route
              path="/loading"
              element={
                <RequireLanguage>
                  <Suspense fallback={<PageFallback />}>
                    <LoadingPage />
                  </Suspense>
                </RequireLanguage>
              }
            />

            {/* Protected — require language */}
            <Route
              path="/home"
              element={
                <RequireLanguage>
                  <Suspense fallback={<PageFallback />}>
                    <HomePage />
                  </Suspense>
                </RequireLanguage>
              }
            />
            <Route
              path="/poi/:id"
              element={
                <RequireLanguage>
                  <Suspense fallback={<PageFallback />}>
                    <POIDetailPage />
                  </Suspense>
                </RequireLanguage>
              }
            />
            <Route
              path="/map"
              element={
                <RequireLanguage>
                  <Suspense fallback={
                    <div className="flex flex-1 items-center justify-center text-alfabia-text-muted">
                      Cargando mapa…
                    </div>
                  }>
                    <MapPage />
                  </Suspense>
                </RequireLanguage>
              }
            />
            <Route
              path="/closing"
              element={
                <RequireLanguage>
                  <Suspense fallback={<PageFallback />}>
                    <ClosingPage />
                  </Suspense>
                </RequireLanguage>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireLanguage>
                  <Suspense fallback={<PageFallback />}>
                    <SettingsPage />
                  </Suspense>
                </RequireLanguage>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LanguageProvider>
    </BrowserRouter>
  )
}
