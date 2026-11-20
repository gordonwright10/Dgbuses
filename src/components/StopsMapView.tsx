import L from 'leaflet'
import { ArrowRight, Bus, LocateFixed, MapPin, Navigation, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDistance, formatIndicator, haversineKm } from '../lib/transit'
import type { BusStop, PlaceOption, RouteSummary } from '../types/transit'

interface StopsMapViewProps {
  stops: BusStop[]
  routes: RouteSummary[]
  onPlanFromStop: (place: PlaceOption) => void
  onPlanToStop: (place: PlaceOption) => void
  onInspectRoute: (routeId: string) => void
}

const DG_CENTER: [number, number] = [55.069, -3.613]
const MAX_RENDERED_MARKERS = 400

function stopToPlaceOption(stop: BusStop): PlaceOption {
  const ind = formatIndicator(stop.indicator)
  return {
    id: `stop:${stop.atcoCode}`,
    kind: 'stop',
    label: stop.name,
    sublabel: [stop.locality, ind].filter(Boolean).join(' · ') || stop.atcoCode,
    stopIds: [stop.atcoCode],
    lat: stop.lat,
    lng: stop.lng,
    searchKey: `${stop.name} ${stop.locality} ${stop.atcoCode}`.toLowerCase(),
  }
}

export function StopsMapView({
  stops,
  routes,
  onPlanFromStop,
  onPlanToStop,
  onInspectRoute,
}: StopsMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [boundsTick, setBoundsTick] = useState(0)

  const mappableStops = useMemo(
    () => stops.filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number'),
    [stops],
  )

  // Map each stop ATCO code to routes serving it
  const routesByStop = useMemo(() => {
    const map = new Map<string, RouteSummary[]>()
    for (const r of routes) {
      for (const sId of r.stopIds) {
        const arr = map.get(sId) ?? []
        arr.push(r)
        map.set(sId, arr)
      }
    }
    return map
  }, [routes])

  const filteredStops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return mappableStops
    return mappableStops.filter((s) =>
      `${s.name} ${s.locality} ${s.indicator} ${s.atcoCode}`.toLowerCase().includes(q),
    )
  }, [mappableStops, searchQuery])

  const nearestStops = useMemo(() => {
    if (!userPos) return []
    return mappableStops
      .map((stop) => ({
        stop,
        distKm: haversineKm(userPos.lat, userPos.lng, stop.lat as number, stop.lng as number),
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 6)
  }, [mappableStops, userPos])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: DG_CENTER,
      zoom: 10,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    markersLayerRef.current = L.layerGroup().addTo(map)
    userLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const onMoveEnd = () => setBoundsTick((n) => n + 1)
    map.on('moveend zoomend', onMoveEnd)

    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(mapContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.off('moveend zoomend', onMoveEnd)
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      userLayerRef.current = null
    }
  }, [])

  // Render viewport-bounded stops smoothly (fast even with 1,500+ NaPTAN stops)
  useEffect(() => {
    const map = mapRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    const bounds = map.getBounds().pad(0.15)

    const inView = filteredStops.filter(
      (s) =>
        s.atcoCode === selectedStop?.atcoCode ||
        bounds.contains([s.lat as number, s.lng as number]),
    )

    // Prioritize stops with active routes if there are many stops in view
    const prioritized =
      inView.length > MAX_RENDERED_MARKERS
        ? [...inView]
            .sort((a, b) => {
              const aCount = routesByStop.get(a.atcoCode)?.length ?? 0
              const bCount = routesByStop.get(b.atcoCode)?.length ?? 0
              return bCount - aCount
            })
            .slice(0, MAX_RENDERED_MARKERS)
        : inView

    for (const stop of prioritized) {
      const isSelected = selectedStop?.atcoCode === stop.atcoCode
      const servedCount = routesByStop.get(stop.atcoCode)?.length ?? 0

      const marker = L.circleMarker([stop.lat as number, stop.lng as number], {
        radius: isSelected ? 10 : servedCount > 0 ? 7 : 5,
        color: isSelected ? '#FFFFFF' : servedCount > 0 ? '#FFFFFF' : '#455952',
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? '#18314F' : servedCount > 0 ? '#0F5C4A' : '#8FA39B',
        fillOpacity: 0.95,
      })

      marker.bindTooltip(`${stop.name}${stop.locality ? ` · ${stop.locality}` : ''}`, {
        direction: 'top',
        offset: [0, -6],
      })
      marker.on('click', () => {
        setSelectedStop(stop)
      })
      marker.addTo(layer)
    }
  }, [filteredStops, selectedStop, routesByStop, boundsTick])

  // Render user GPS location dot
  useEffect(() => {
    const layer = userLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (!userPos) return

    L.circleMarker([userPos.lat, userPos.lng], {
      radius: 8,
      color: '#FFFFFF',
      weight: 3,
      fillColor: '#2563EB',
      fillOpacity: 1,
    })
      .bindTooltip('Your location')
      .addTo(layer)
  }, [userPos])

  const focusStop = (stop: BusStop) => {
    setSelectedStop(stop)
    if (mapRef.current && stop.lat !== null && stop.lng !== null) {
      mapRef.current.setView([stop.lat, stop.lng], Math.max(mapRef.current.getZoom(), 14), {
        animate: true,
      })
    }
  }

  const handleFindNearMe = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('Location services are not supported by your browser.')
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserPos(coords)
        setLocating(false)
        if (mapRef.current) {
          mapRef.current.setView([coords.lat, coords.lng], 13, { animate: true })
        }
      },
      () => {
        setLocating(false)
        setGeoError('Could not access your location. Try searching for your town above.')
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  const selectedStopRoutes = selectedStop ? routesByStop.get(selectedStop.atcoCode) ?? [] : []

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[#D4DFD9] bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#111C18]">
              Dumfries &amp; Galloway Bus Stops Map
            </h1>
            <p className="mt-1 text-sm font-medium text-[#455952]">
              Tap any bus stop pin to see exactly where it is and which buses call there.
            </p>
          </div>
          <button
            type="button"
            onClick={handleFindNearMe}
            disabled={locating}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0F5C4A] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#0A4638] disabled:opacity-60"
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            <span>{locating ? 'Locating…' : 'Find stops near me'}</span>
          </button>
        </div>

        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#546860]"
            aria-hidden="true"
          />
          <label htmlFor="map-stop-search" className="sr-only">
            Search bus stops on the map
          </label>
          <input
            id="map-stop-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Jump to a town or stop (e.g. Whitesands, DGRI, Annan, Stranraer)…"
            className="min-h-12 w-full rounded-xl border-2 border-[#CED9D3] bg-white pl-11 pr-4 py-2.5 text-base font-medium text-[#111C18] placeholder:text-[#667871] focus:border-[#0F5C4A] focus:outline-none"
          />
        </div>

        {searchQuery.trim() && filteredStops.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {filteredStops.slice(0, 6).map((stop) => (
              <button
                key={stop.atcoCode}
                type="button"
                onClick={() => focusStop(stop)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#CBD7D1] bg-[#F6F9F7] px-3 py-1 text-xs font-bold text-[#18314F] hover:border-[#0F5C4A] hover:bg-[#E7F3EE]"
              >
                <MapPin className="h-3.5 w-3.5 text-[#0F5C4A]" aria-hidden="true" />
                <span>
                  {stop.name}
                  {stop.locality ? ` (${stop.locality})` : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {geoError && (
          <p role="status" className="mt-3 rounded-xl bg-[#FFF7ED] px-3.5 py-2 text-xs font-semibold text-[#9A3412]">
            {geoError}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Map Canvas */}
        <div className="overflow-hidden rounded-3xl border border-[#D4DFD9] bg-white shadow-xs">
          <div
            ref={mapContainerRef}
            className="h-[420px] w-full sm:h-[520px]"
            role="region"
            aria-label="Interactive map of Dumfries and Galloway bus stops"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE4DF] bg-white px-4 py-2.5 text-xs font-semibold text-[#455952]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#0F5C4A]" />
                Bus stop with routes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#18314F]" />
                Selected stop
              </span>
            </div>
            <span className="tabular-nums">{filteredStops.length.toLocaleString()} stops available</span>
          </div>
        </div>

        {/* Stop Inspector / Nearby Panel */}
        <aside className="space-y-4">
          {selectedStop ? (
            <div className="rounded-3xl border border-[#0F5C4A]/40 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EE] text-[#0F5C4A]">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-[#111C18]">{selectedStop.name}</h2>
                  {selectedStop.indicator && (
                    <p className="text-sm font-semibold text-[#0F5C4A]">
                      {formatIndicator(selectedStop.indicator)}
                    </p>
                  )}
                  <p className="text-xs font-medium text-[#455952]">
                    {selectedStop.locality || 'Dumfries & Galloway'} · Stop code {selectedStop.atcoCode}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onPlanFromStop(stopToPlaceOption(selectedStop))}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0F5C4A] px-3 py-2 text-xs font-bold text-white hover:bg-[#0A4638]"
                >
                  <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Travel from here</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPlanToStop(stopToPlaceOption(selectedStop))}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#CBD7D1] bg-white px-3 py-2 text-xs font-bold text-[#18314F] hover:bg-[#F2F6F4]"
                >
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Travel to here</span>
                </button>
              </div>

              <div className="mt-5 border-t border-[#E6ECE8] pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#455952]">
                  Buses calling at this stop ({selectedStopRoutes.length})
                </h3>
                {selectedStopRoutes.length === 0 ? (
                  <p className="mt-2 text-xs font-medium text-[#546860]">
                    No scheduled services currently listed for this stop.
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {selectedStopRoutes.map((route) => (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => onInspectRoute(route.id)}
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-[#DCE4DF] bg-[#F8FAF9] px-3 py-2 text-left transition-colors hover:border-[#0F5C4A] hover:bg-[#EBF4F0]"
                      >
                        <span className="flex min-w-11 items-center justify-center rounded-lg bg-[#18314F] px-2 py-1 text-xs font-extrabold text-white tabular-nums">
                          {route.lineName}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-[#111C18]">
                            {route.origin && route.destination
                              ? `${route.origin} – ${route.destination}`
                              : route.description}
                          </span>
                          <span className="block truncate text-[11px] font-medium text-[#546860]">
                            {route.operator}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-[#DCE4DF] bg-white p-5">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF5F2] text-[#0F5C4A]">
                <Bus className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-base font-extrabold text-[#111C18]">Select a stop on the map</h2>
              <p className="mt-1 text-sm text-[#455952]">
                Zoom in and tap any green dot to view its exact street location, routes, and plan a journey from there.
              </p>
            </div>
          )}

          {nearestStops.length > 0 && (
            <div className="rounded-3xl border border-[#DCE4DF] bg-white p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#455952]">
                Closest bus stops to you
              </h3>
              <ul className="mt-2.5 space-y-2">
                {nearestStops.map(({ stop, distKm }) => (
                  <li key={stop.atcoCode}>
                    <button
                      type="button"
                      onClick={() => focusStop(stop)}
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-[#F6F9F7] px-3 py-2 text-left transition-colors hover:bg-[#E8F4EF]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#111C18]">
                          {stop.name}
                        </span>
                        <span className="block truncate text-xs font-medium text-[#546860]">
                          {stop.locality}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-[#0F5C4A] tabular-nums">
                        {formatDistance(distKm)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
