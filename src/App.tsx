import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AllRoutesView } from './components/AllRoutesView'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { JourneyPlannerView } from './components/JourneyPlannerView'
import { StopsMapView } from './components/StopsMapView'
import { loadCoreTransitData, type CoreTransitData } from './lib/data'
import { buildPlaceOptions } from './lib/transit'
import type { ActiveTab, PlaceOption } from './types/transit'

export default function App() {
  const [data, setData] = useState<CoreTransitData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<ActiveTab>('planner')
  const [fromPlace, setFromPlace] = useState<PlaceOption | null>(null)
  const [toPlace, setToPlace] = useState<PlaceOption | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)

  const [reloadTick, setReloadTick] = useState(0)

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    setReloadTick((n) => n + 1)
  }

  useEffect(() => {
    let cancelled = false
    loadCoreTransitData()
      .then((loaded) => {
        if (!cancelled) {
          setData(loaded)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load bus timetable data.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const { localities, stopOptions } = useMemo(() => {
    if (!data) return { localities: [], stopOptions: [] }
    return buildPlaceOptions(data.stops, data.routes)
  }, [data])

  const handleInspectRoute = (routeId: string) => {
    setSelectedRouteId(routeId)
    setActiveTab('routes')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePlanFromStop = (place: PlaceOption) => {
    setFromPlace(place)
    setActiveTab('planner')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePlanToStop = (place: PlaceOption) => {
    setToPlace(place)
    setActiveTab('planner')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F8F8] text-[#111C18]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-[#00838f] focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <Header
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab)
          if (tab !== 'routes') setSelectedRouteId(null)
        }}
        routeCount={data?.routes.length ?? 0}
      />

      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-[#DCE4E4] bg-white p-12 text-center shadow-xs">
            <Loader2 className="h-8 w-8 animate-spin text-[#00838f]" aria-hidden="true" />
            <p className="text-base font-bold text-[#111C18]">Loading Dumfries &amp; Galloway bus timetables…</p>
            <p className="text-sm text-[#455952]">Preparing stops and routes across the region</p>
          </div>
        ) : error || !data ? (
          <div
            role="alert"
            className="mx-auto max-w-lg rounded-3xl border border-[#F5C2C7] bg-white p-8 text-center shadow-xs"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF2F2] text-[#B91C1C]">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-extrabold text-[#111C18]">Couldn’t load timetable data</h1>
            <p className="mt-1.5 text-sm text-[#455952]">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#00838f] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#006B75]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'planner' && (
              <JourneyPlannerView
                stops={data.stops}
                stopMap={data.stopMap}
                routes={data.routes}
                localities={localities}
                stopOptions={stopOptions}
                fromPlace={fromPlace}
                toPlace={toPlace}
                onChangeFrom={setFromPlace}
                onChangeTo={setToPlace}
                onInspectRoute={handleInspectRoute}
              />
            )}

            {activeTab === 'routes' && (
              <AllRoutesView
                routes={data.routes}
                stopMap={data.stopMap}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
              />
            )}

            {activeTab === 'map' && (
              <StopsMapView
                stops={data.stops}
                routes={data.routes}
                onPlanFromStop={handlePlanFromStop}
                onPlanToStop={handlePlanToStop}
                onInspectRoute={handleInspectRoute}
              />
            )}
          </>
        )}
      </main>

      <Footer metadata={data?.metadata ?? null} />
    </div>
  )
}
