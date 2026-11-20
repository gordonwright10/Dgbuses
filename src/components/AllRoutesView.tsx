import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Loader2,
  Map as MapIcon,
  Search,
  Sun,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadRouteSchedule } from '../lib/data'
import {
  formatDaysPlainEnglish,
  formatDuration,
  formatIndicator,
  getTodayDayCode,
  parseTimeToMinutes,
} from '../lib/transit'
import {
  DAY_CODES,
  DAY_FULL_NAMES,
  type BusStop,
  type DayCode,
  type RouteSchedule,
  type RouteSummary,
  type Trip,
} from '../types/transit'
import { RouteMap, type MapStopPoint } from './RouteMap'

interface AllRoutesViewProps {
  routes: RouteSummary[]
  stopMap: Map<string, BusStop>
  selectedRouteId: string | null
  onSelectRoute: (routeId: string | null) => void
}

export function AllRoutesView({
  routes,
  stopMap,
  selectedRouteId,
  onSelectRoute,
}: AllRoutesViewProps) {
  const [query, setQuery] = useState('')
  const [loadedSchedule, setLoadedSchedule] = useState<{
    routeId: string
    data: RouteSchedule | null
  } | null>(null)
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [dayFilter, setDayFilter] = useState<DayCode | 'ALL'>(getTodayDayCode())
  const [showMap, setShowMap] = useState(false)
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null)

  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  )

  const schedule =
    selectedRouteId && loadedSchedule?.routeId === selectedRouteId ? loadedSchedule.data : null
  const loading = Boolean(selectedRouteId && loadedSchedule?.routeId !== selectedRouteId)

  useEffect(() => {
    if (!selectedRouteId) return
    let cancelled = false

    loadRouteSchedule(selectedRouteId).then((data) => {
      if (!cancelled) {
        setLoadedSchedule({ routeId: selectedRouteId, data })
        setDirection(data && data.outbound.length > 0 ? 'outbound' : 'inbound')
        setExpandedTripId(null)
        setShowMap(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedRouteId])

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return routes
    return routes.filter((r) => {
      if (
        r.lineName.toLowerCase().includes(q) ||
        r.operator.toLowerCase().includes(q) ||
        r.origin.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      ) {
        return true
      }
      // Also match any town served by this route
      return r.stopIds.some((id) => {
        const s = stopMap.get(id)
        return s ? `${s.locality} ${s.name}`.toLowerCase().includes(q) : false
      })
    })
  }, [routes, query, stopMap])

  const activeTrips: Trip[] = useMemo(() => {
    if (!schedule) return []
    const list = direction === 'outbound' ? schedule.outbound : schedule.inbound
    if (dayFilter === 'ALL') return list
    return list.filter((t) => t.days.includes(dayFilter))
  }, [schedule, direction, dayFilter])

  const routeMapPoints: MapStopPoint[] = useMemo(() => {
    if (!showMap || !schedule) return []
    const list = direction === 'outbound' ? schedule.outbound : schedule.inbound
    // Pick the longest trip in this direction so the map shows the full corridor
    const longest = list.reduce<Trip | null>(
      (best, t) => (!best || t.stops.length > best.stops.length ? t : best),
      null,
    )
    if (!longest) return []
    return longest.stops.map(([stopId], idx) => {
      const stop: BusStop = stopMap.get(stopId) ?? {
        atcoCode: stopId,
        name: stopId,
        locality: '',
        indicator: '',
        lat: null,
        lng: null,
      }
      const role: MapStopPoint['role'] =
        idx === 0 ? 'board' : idx === longest.stops.length - 1 ? 'alight' : 'segment'
      return { stop, role }
    })
  }, [showMap, schedule, direction, stopMap])

  if (selectedRoute) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onSelectRoute(null)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#CBD7D1] bg-white px-4 py-2 text-sm font-bold text-[#18314F] transition-colors hover:bg-[#F0F4F2]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to all routes</span>
        </button>

        <section className="rounded-3xl border border-[#D4DFD9] bg-white p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="flex min-h-14 min-w-16 items-center justify-center rounded-2xl bg-[#18314F] px-3.5 text-2xl font-extrabold text-white tabular-nums">
                {selectedRoute.lineName}
              </span>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[#111C18] sm:text-2xl">
                  {selectedRoute.origin && selectedRoute.destination
                    ? `${selectedRoute.origin} – ${selectedRoute.destination}`
                    : selectedRoute.description || `Route ${selectedRoute.lineName}`}
                </h1>
                <p className="mt-0.5 text-sm font-medium text-[#455952]">
                  {selectedRoute.operator} · {formatDaysPlainEnglish(selectedRoute.days)}
                </p>
                {selectedRoute.description && (
                  <p className="mt-1 text-xs font-medium text-[#546860]">{selectedRoute.description}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              aria-expanded={showMap}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                showMap
                  ? 'border-[#0F5C4A] bg-[#E8F4EF] text-[#0A4638]'
                  : 'border-[#CBD7D1] bg-white text-[#18314F] hover:bg-[#F2F6F4]'
              }`}
            >
              <MapIcon className="h-4 w-4 text-[#0F5C4A]" aria-hidden="true" />
              <span>{showMap ? 'Hide route map' : 'Show route map'}</span>
            </button>
          </div>

          {loading ? (
            <div className="mt-6 flex items-center justify-center gap-3 py-10 text-sm font-semibold text-[#455952]">
              <Loader2 className="h-5 w-5 animate-spin text-[#0F5C4A]" aria-hidden="true" />
              <span>Loading timetable…</span>
            </div>
          ) : schedule ? (
            <div className="mt-5 space-y-5">
              {showMap && routeMapPoints.length > 0 && (
                <RouteMap
                  points={routeMapPoints}
                  ariaLabel={`Route ${schedule.lineName} map`}
                />
              )}

              {/* Direction + Day Filter */}
              <div className="flex flex-col gap-3 border-t border-[#E8EFEA] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  {schedule.outbound.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDirection('outbound')
                        setExpandedTripId(null)
                      }}
                      aria-pressed={direction === 'outbound'}
                      className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                        direction === 'outbound'
                          ? 'bg-[#0F5C4A] text-white'
                          : 'bg-[#F0F4F2] text-[#1D3029] hover:bg-[#E2EBE6]'
                      }`}
                    >
                      {schedule.outboundLabel}
                    </button>
                  )}
                  {schedule.inbound.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDirection('inbound')
                        setExpandedTripId(null)
                      }}
                      aria-pressed={direction === 'inbound'}
                      className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                        direction === 'inbound'
                          ? 'bg-[#0F5C4A] text-white'
                          : 'bg-[#F0F4F2] text-[#1D3029] hover:bg-[#E2EBE6]'
                      }`}
                    >
                      {schedule.inboundLabel}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="route-day-filter" className="text-xs font-bold uppercase tracking-wider text-[#455952]">
                    Day:
                  </label>
                  <select
                    id="route-day-filter"
                    value={dayFilter}
                    onChange={(e) => setDayFilter(e.target.value as DayCode | 'ALL')}
                    className="min-h-11 rounded-xl border border-[#CBD7D1] bg-white px-3 py-2 text-sm font-bold text-[#111C18]"
                  >
                    <option value="ALL">All days of week</option>
                    {DAY_CODES.map((d) => (
                      <option key={d} value={d}>
                        {DAY_FULL_NAMES[d]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Plain-English Trip List */}
              {activeTrips.length === 0 ? (
                <div className="rounded-2xl bg-[#F6F9F7] p-6 text-center">
                  <p className="text-sm font-bold text-[#111C18]">
                    No departures in this direction on {dayFilter === 'ALL' ? 'any day' : DAY_FULL_NAMES[dayFilter]}.
                  </p>
                  {dayFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setDayFilter('ALL')}
                      className="mt-3 min-h-10 rounded-xl bg-[#0F5C4A] px-4 py-2 text-sm font-bold text-white hover:bg-[#0A4638]"
                    >
                      Show all days
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeTrips.map((trip) => {
                    const isExpanded = expandedTripId === trip.id
                    const firstStop = stopMap.get(trip.stops[0][0])
                    const lastStop = stopMap.get(trip.stops[trip.stops.length - 1][0])
                    let dur = parseTimeToMinutes(trip.arr) - parseTimeToMinutes(trip.dep)
                    if (dur < 0) dur += 1440

                    return (
                      <div
                        key={trip.id}
                        className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-[#FAFCFB]"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedTripId(isExpanded ? null : trip.id)}
                          aria-expanded={isExpanded}
                          className="flex min-h-15 w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F0F5F3]"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-extrabold text-[#111C18] tabular-nums">
                              {trip.dep}
                            </span>
                            <ArrowRight className="h-4 w-4 text-[#5D726A]" aria-hidden="true" />
                            <span className="text-lg font-extrabold text-[#111C18] tabular-nums">
                              {trip.arr}
                            </span>
                            <span className="rounded-lg bg-white px-2 py-0.5 text-xs font-bold text-[#384D46] ring-1 ring-[#DCE4DF] tabular-nums">
                              {formatDuration(dur)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[#455952]">
                              {firstStop?.name ?? trip.stops[0][0]} → {lastStop?.name ?? trip.stops[trip.stops.length - 1][0]}
                            </span>
                            <span className="rounded-md bg-[#EBF1EE] px-2 py-0.5 text-xs font-bold text-[#273B34]">
                              {formatDaysPlainEnglish(trip.days)}
                            </span>
                            {trip.schoolOnly && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#FEF3C7] px-2 py-0.5 text-xs font-bold text-[#92400E]">
                                <GraduationCap className="h-3 w-3" aria-hidden="true" />
                                School days
                              </span>
                            )}
                            {trip.nonSchoolOnly && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#E0F2FE] px-2 py-0.5 text-xs font-bold text-[#075985]">
                                <Sun className="h-3 w-3" aria-hidden="true" />
                                Holidays only
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-[#0F5C4A]" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-[#455952]" aria-hidden="true" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-[#E2EAE5] bg-white px-4 py-4">
                            {trip.bankHolidays && (
                              <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#9A3412]">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                {trip.bankHolidays}
                              </p>
                            )}
                            <ol className="space-y-2">
                              {trip.stops.map(([stopId, time], idx) => {
                                const s = stopMap.get(stopId)
                                const ind = s ? formatIndicator(s.indicator) : ''
                                return (
                                  <li key={`${stopId}-${idx}`} className="flex items-baseline gap-3 text-sm">
                                    <span className="w-12 shrink-0 font-bold text-[#0F5C4A] tabular-nums">
                                      {time}
                                    </span>
                                    <span className="font-semibold text-[#111C18]">
                                      {s?.name ?? stopId}
                                      {s?.locality ? (
                                        <span className="font-normal text-[#546860]">
                                          {' '}
                                          · {s.locality}
                                          {ind ? ` (${ind})` : ''}
                                        </span>
                                      ) : null}
                                    </span>
                                  </li>
                                )
                              })}
                            </ol>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#D4DFD9] bg-white p-5 shadow-xs sm:p-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#111C18]">
          All Dumfries &amp; Galloway Bus Routes
        </h1>
        <p className="mt-1 text-sm font-medium text-[#455952]">
          Browse routes by number, town, or bus company. Tap any route to view its simple timetable and map.
        </p>

        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#546860]"
            aria-hidden="true"
          />
          <label htmlFor="route-search" className="sr-only">
            Filter bus routes by number, town, or operator
          </label>
          <input
            id="route-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by route number (e.g. 79, X74, 501) or town (e.g. Moffat, Stranraer)…"
            className="min-h-12 w-full rounded-xl border-2 border-[#CED9D3] bg-white pl-11 pr-4 py-2.5 text-base font-medium text-[#111C18] placeholder:text-[#667871] focus:border-[#0F5C4A] focus:outline-none"
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {filteredRoutes.map((route) => (
          <button
            key={route.id}
            type="button"
            onClick={() => onSelectRoute(route.id)}
            className="group flex items-start gap-3.5 rounded-2xl border border-[#DCE4DF] bg-white p-4 text-left transition-all hover:border-[#0F5C4A] hover:shadow-sm"
          >
            <span className="flex min-h-12 min-w-14 shrink-0 items-center justify-center rounded-xl bg-[#18314F] px-2.5 text-lg font-extrabold text-white tabular-nums transition-colors group-hover:bg-[#0F5C4A]">
              {route.lineName}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-base font-extrabold text-[#111C18]">
                  {route.origin && route.destination
                    ? `${route.origin} – ${route.destination}`
                    : route.description || `Route ${route.lineName}`}
                </h2>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-[#667871] transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F5C4A]"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#455952]">{route.operator}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[#384D46]">
                <span className="rounded-md bg-[#EFF5F2] px-2 py-0.5">
                  {formatDaysPlainEnglish(route.days)}
                </span>
                <span className="rounded-md bg-[#F4F6F5] px-2 py-0.5 tabular-nums">
                  {route.stopIds.length} stops
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredRoutes.length === 0 && (
        <div className="rounded-2xl border border-[#DCE4DF] bg-white p-8 text-center text-sm font-medium text-[#455952]">
          No bus routes matched <strong className="text-[#111C18]">“{query}”</strong>.
        </div>
      )}
    </div>
  )
}
