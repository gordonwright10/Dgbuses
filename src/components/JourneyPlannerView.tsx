import {
  ArrowLeftRight,
  ArrowRight,
  Bus,
  Calendar,
  Clock,
  GraduationCap,
  Info,
  Loader2,
  Repeat2,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadRouteSchedules } from '../lib/data'
import {
  findCandidateRoutes,
  findTransferRouteCandidates,
  formatMinutesToHHMM,
  getCurrentMinutes,
  getTodayDayCode,
  getTomorrowDayCode,
  haversineKm,
  matchConnectingJourneys,
  matchJourneysFromSchedules,
  parseTimeToMinutes,
} from '../lib/transit'
import {
  DAY_CODES,
  DAY_FULL_NAMES,
  type BusStop,
  type ConnectingJourneyMatch,
  type DayCode,
  type JourneyMatch,
  type PlaceOption,
  type RouteSchedule,
  type RouteSummary,
  type TimeFilterMode,
} from '../types/transit'
import { ConnectingJourneyCard } from './ConnectingJourneyCard'
import { JourneyCard } from './JourneyCard'
import { PlaceAutocomplete } from './PlaceAutocomplete'

interface JourneyPlannerViewProps {
  stops: BusStop[]
  stopMap: Map<string, BusStop>
  routes: RouteSummary[]
  localities: PlaceOption[]
  stopOptions: PlaceOption[]
  fromPlace: PlaceOption | null
  toPlace: PlaceOption | null
  onChangeFrom: (place: PlaceOption | null) => void
  onChangeTo: (place: PlaceOption | null) => void
  onInspectRoute: (routeId: string) => void
}

const POPULAR_PAIRS: Array<{ fromQuery: string; toQuery: string; label: string }> = [
  { fromQuery: 'annan', toQuery: 'dumfries', label: 'Annan → Dumfries' },
  { fromQuery: 'dumfries', toQuery: 'dgri', label: 'Dumfries → DGRI Hospital' },
  { fromQuery: 'lockerbie', toQuery: 'castle douglas', label: 'Lockerbie → Castle Douglas' },
  { fromQuery: 'castle douglas', toQuery: 'dumfries', label: 'Castle Douglas → Dumfries' },
  { fromQuery: 'dumfries', toQuery: 'stranraer', label: 'Dumfries → Stranraer' },
]

export function JourneyPlannerView({
  stops,
  stopMap,
  routes,
  localities,
  stopOptions,
  fromPlace,
  toPlace,
  onChangeFrom,
  onChangeTo,
  onInspectRoute,
}: JourneyPlannerViewProps) {
  const todayCode = getTodayDayCode()
  const tomorrowCode = getTomorrowDayCode()

  const [selectedDay, setSelectedDay] = useState<DayCode>(todayCode)
  const [timeMode, setTimeMode] = useState<TimeFilterMode>('now')
  const [afterTime, setAfterTime] = useState<string>(() =>
    formatMinutesToHHMM(Math.floor(getCurrentMinutes() / 15) * 15),
  )
  const [hideSchoolOnly, setHideSchoolOnly] = useState(false)
  const [showEarlierKey, setShowEarlierKey] = useState<string | null>(null)
  const [showConnectionsForKey, setShowConnectionsForKey] = useState<string | null>(null)

  const [loadedDirect, setLoadedDirect] = useState<{
    key: string
    map: Map<string, RouteSchedule>
  }>({ key: '', map: new Map() })

  const [loadedTransfers, setLoadedTransfers] = useState<{
    key: string
    map: Map<string, RouteSchedule>
  }>({ key: '', map: new Map() })

  const [nearMeLoading, setNearMeLoading] = useState(false)
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [nowMins, setNowMins] = useState<number>(() => getCurrentMinutes())

  // Refresh current minute every 30 seconds for live countdown badges
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMins(getCurrentMinutes())
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const isToday = selectedDay === todayCode
  const effectiveTimeMode: TimeFilterMode = !isToday && timeMode === 'now' ? 'all' : timeMode

  const candidateRoutes = useMemo(() => {
    if (!fromPlace || !toPlace) return []
    return findCandidateRoutes(routes, fromPlace, toPlace)
  }, [routes, fromPlace, toPlace])

  const candidateKey = useMemo(
    () => candidateRoutes.map((r) => r.id).join('|'),
    [candidateRoutes],
  )

  const searchKey = `${fromPlace?.id ?? ''}->${toPlace?.id ?? ''}:${selectedDay}`
  const pairKey = `${fromPlace?.id ?? ''}->${toPlace?.id ?? ''}`
  const showEarlier = showEarlierKey === searchKey

  const directSchedules = useMemo(
    () =>
      candidateKey && loadedDirect.key === candidateKey
        ? loadedDirect.map
        : new Map<string, RouteSchedule>(),
    [candidateKey, loadedDirect],
  )
  const loadingDirect = Boolean(candidateKey && loadedDirect.key !== candidateKey)

  useEffect(() => {
    if (!candidateKey) return
    let cancelled = false

    loadRouteSchedules(candidateRoutes.map((r) => r.id))
      .then((loaded) => {
        if (!cancelled) {
          setLoadedDirect({ key: candidateKey, map: loaded })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedDirect({ key: candidateKey, map: new Map() })
        }
      })

    return () => {
      cancelled = true
    }
  }, [candidateKey, candidateRoutes])

  const allDirectMatches: JourneyMatch[] = useMemo(() => {
    if (!fromPlace || !toPlace || candidateRoutes.length === 0) return []
    return matchJourneysFromSchedules({
      routes: candidateRoutes,
      schedules: directSchedules,
      stopMap,
      from: fromPlace,
      to: toPlace,
      day: selectedDay,
      hideSchoolOnly,
    })
  }, [fromPlace, toPlace, candidateRoutes, directSchedules, stopMap, selectedDay, hideSchoolOnly])

  const cutoffMins = useMemo(() => {
    if (effectiveTimeMode === 'all') return -1
    if (effectiveTimeMode === 'now' && isToday) return Math.max(0, nowMins - 2)
    return parseTimeToMinutes(afterTime)
  }, [effectiveTimeMode, isToday, nowMins, afterTime])

  const { visibleDirectMatches, earlierDirectCount, nextDirectKey } = useMemo(() => {
    if (cutoffMins < 0) {
      const firstUpcoming = isToday
        ? allDirectMatches.find((m) => parseTimeToMinutes(m.boardTime) >= nowMins - 1)
        : undefined
      return {
        visibleDirectMatches: allDirectMatches,
        earlierDirectCount: 0,
        nextDirectKey: firstUpcoming?.key ?? null,
      }
    }

    const upcoming = allDirectMatches.filter((m) => parseTimeToMinutes(m.boardTime) >= cutoffMins)
    const earlier = allDirectMatches.length - upcoming.length
    const list = showEarlier ? allDirectMatches : upcoming
    return {
      visibleDirectMatches: list,
      earlierDirectCount: earlier,
      nextDirectKey: upcoming[0]?.key ?? null,
    }
  }, [allDirectMatches, cutoffMins, showEarlier, isToday, nowMins])

  // Determine whether we should search 1-change connecting bus journeys
  const userRequestedConnections = showConnectionsForKey === pairKey
  const autoNeedConnections =
    Boolean(fromPlace && toPlace) && !loadingDirect && allDirectMatches.length === 0
  const shouldComputeConnections =
    Boolean(fromPlace && toPlace) && (autoNeedConnections || userRequestedConnections)

  const transferPlan = useMemo(() => {
    if (!fromPlace || !toPlace || !shouldComputeConnections) return null
    return findTransferRouteCandidates(routes, stopMap, fromPlace, toPlace)
  }, [routes, stopMap, fromPlace, toPlace, shouldComputeConnections])

  const transferKey = transferPlan ? transferPlan.routeIdsToLoad.join('|') : ''
  const transferSchedules = useMemo(
    () =>
      transferKey && loadedTransfers.key === transferKey
        ? loadedTransfers.map
        : new Map<string, RouteSchedule>(),
    [transferKey, loadedTransfers],
  )
  const loadingTransfers = Boolean(
    shouldComputeConnections && transferKey && loadedTransfers.key !== transferKey,
  )

  useEffect(() => {
    if (!shouldComputeConnections || !transferPlan || !transferKey) return
    let cancelled = false

    loadRouteSchedules(transferPlan.routeIdsToLoad)
      .then((loaded) => {
        if (!cancelled) {
          setLoadedTransfers({ key: transferKey, map: loaded })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedTransfers({ key: transferKey, map: new Map() })
        }
      })

    return () => {
      cancelled = true
    }
  }, [shouldComputeConnections, transferPlan, transferKey])

  const allConnectingMatches: ConnectingJourneyMatch[] = useMemo(() => {
    if (!fromPlace || !toPlace || !transferPlan || transferSchedules.size === 0) return []
    return matchConnectingJourneys({
      plan: transferPlan,
      schedules: transferSchedules,
      stopMap,
      from: fromPlace,
      to: toPlace,
      day: selectedDay,
      hideSchoolOnly,
      directMatches: allDirectMatches,
    })
  }, [
    fromPlace,
    toPlace,
    transferPlan,
    transferSchedules,
    stopMap,
    selectedDay,
    hideSchoolOnly,
    allDirectMatches,
  ])

  const { visibleConnectingMatches, earlierConnectingCount, nextConnectingKey } = useMemo(() => {
    if (cutoffMins < 0) {
      const firstUpcoming = isToday
        ? allConnectingMatches.find((m) => parseTimeToMinutes(m.leg1.boardTime) >= nowMins - 1)
        : undefined
      return {
        visibleConnectingMatches: allConnectingMatches,
        earlierConnectingCount: 0,
        nextConnectingKey: firstUpcoming?.key ?? null,
      }
    }

    const upcoming = allConnectingMatches.filter(
      (m) => parseTimeToMinutes(m.leg1.boardTime) >= cutoffMins,
    )
    const earlier = allConnectingMatches.length - upcoming.length
    const list = showEarlier ? allConnectingMatches : upcoming
    return {
      visibleConnectingMatches: list,
      earlierConnectingCount: earlier,
      nextConnectingKey: upcoming[0]?.key ?? null,
    }
  }, [allConnectingMatches, cutoffMins, showEarlier, isToday, nowMins])

  // Check if buses (direct or 1-change) exist on another day when selected day has none
  let alternativeDaySuggestion: { day: DayCode; count: number; isConnecting: boolean } | null = null
  if (
    fromPlace &&
    toPlace &&
    !loadingDirect &&
    !loadingTransfers &&
    allDirectMatches.length === 0 &&
    allConnectingMatches.length === 0
  ) {
    const candidates: DayCode[] = (['Mon', 'Sat', 'Sun'] as DayCode[]).filter(
      (d) => d !== selectedDay,
    )
    for (const altDay of candidates) {
      if (candidateRoutes.length > 0) {
        const altDirect = matchJourneysFromSchedules({
          routes: candidateRoutes,
          schedules: directSchedules,
          stopMap,
          from: fromPlace,
          to: toPlace,
          day: altDay,
          hideSchoolOnly: false,
        })
        if (altDirect.length > 0) {
          alternativeDaySuggestion = { day: altDay, count: altDirect.length, isConnecting: false }
          break
        }
      }
      if (transferPlan && transferSchedules.size > 0) {
        const altConn = matchConnectingJourneys({
          plan: transferPlan,
          schedules: transferSchedules,
          stopMap,
          from: fromPlace,
          to: toPlace,
          day: altDay,
          hideSchoolOnly: false,
        })
        if (altConn.length > 0) {
          alternativeDaySuggestion = { day: altDay, count: altConn.length, isConnecting: true }
          break
        }
      }
    }
  }

  const resolvedQuickPairs = useMemo(() => {
    const findOption = (q: string): PlaceOption | undefined => {
      const ql = q.toLowerCase()
      return (
        localities.find((l) => l.label.toLowerCase() === ql) ??
        stopOptions.find((s) => s.searchKey.includes(ql)) ??
        localities.find((l) => l.label.toLowerCase().includes(ql))
      )
    }

    return POPULAR_PAIRS.map((pair) => ({
      ...pair,
      from: findOption(pair.fromQuery),
      to: findOption(pair.toQuery),
    })).filter(
      (
        p,
      ): p is {
        fromQuery: string
        toQuery: string
        label: string
        from: PlaceOption
        to: PlaceOption
      } => Boolean(p.from && p.to),
    )
  }, [localities, stopOptions])

  const handleSwap = () => {
    const prevFrom = fromPlace
    onChangeFrom(toPlace)
    onChangeTo(prevFrom)
  }

  const handleUseNearestStop = () => {
    if (!('geolocation' in navigator)) {
      setGeoMessage('Location services are not available in this browser.')
      return
    }
    setNearMeLoading(true)
    setGeoMessage(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        let nearest: BusStop | null = null
        let minDist = Infinity

        for (const s of stops) {
          if (s.lat === null || s.lng === null) continue
          const d = haversineKm(latitude, longitude, s.lat, s.lng)
          if (d < minDist) {
            minDist = d
            nearest = s
          }
        }

        setNearMeLoading(false)
        if (!nearest) {
          setGeoMessage('Could not find a nearby bus stop.')
          return
        }

        const opt =
          stopOptions.find((o) => o.id === `stop:${nearest.atcoCode}`) ??
          localities.find((l) => l.label.toLowerCase() === nearest.locality.toLowerCase())

        if (opt) {
          onChangeFrom(opt)
          if (minDist > 15) {
            setGeoMessage(
              `Set to nearest D&G stop (${opt.label}, about ${(minDist * 0.621).toFixed(0)} miles away).`,
            )
          }
        }
      },
      () => {
        setNearMeLoading(false)
        setGeoMessage('Could not get your location. Please type your town or bus stop instead.')
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  const hasSearch = Boolean(fromPlace && toPlace)
  const totalEarlierCount = earlierDirectCount + earlierConnectingCount
  const totalAllCount = allDirectMatches.length + allConnectingMatches.length
  const totalVisibleCount = visibleDirectMatches.length + visibleConnectingMatches.length
  const isLoadingAny = loadingDirect || loadingTransfers

  return (
    <div className="space-y-6">
      {/* Hero + Search Card */}
      <section aria-labelledby="planner-heading" className="rounded-3xl border border-[#D4DFDF] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5">
          <h1
            id="planner-heading"
            className="text-2xl font-extrabold tracking-tight text-[#111C18] sm:text-3xl"
          >
            Where would you like to go?
          </h1>
          <p className="mt-1.5 text-sm font-medium text-[#455952] sm:text-base">
            Search by town, village, or stop name across Dumfries &amp; Galloway — including direct buses and 1-change connections.
          </p>
        </div>

        {/* From / Swap / To */}
        <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
          <PlaceAutocomplete
            id="from-place"
            label="From"
            placeholder="e.g. Annan, Lockerbie, Whitesands…"
            value={fromPlace}
            onChange={onChangeFrom}
            localities={localities}
            stopOptions={stopOptions}
            accentDotClass="bg-[#00838f] ring-[#00838f]/20"
            onUseNearMe={handleUseNearestStop}
            nearMeLoading={nearMeLoading}
          />

          <div className="flex justify-center md:pt-7">
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap From and To places"
              title="Swap From and To"
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00838f] text-white shadow-xs transition-colors hover:bg-[#006B75]"
            >
              <ArrowLeftRight className="h-5 w-5 rotate-90 md:rotate-0" aria-hidden="true" />
            </button>
          </div>

          <PlaceAutocomplete
            id="to-place"
            label="To"
            placeholder="e.g. Dumfries, DGRI, Castle Douglas…"
            value={toPlace}
            onChange={onChangeTo}
            localities={localities}
            stopOptions={stopOptions}
            accentDotClass="bg-[#95398d] ring-[#95398d]/20"
          />
        </div>

        {geoMessage && (
          <p role="status" className="mt-2.5 flex items-center gap-2 rounded-xl bg-[#EEF6F7] px-3 py-2 text-xs font-semibold text-[#1D3B3F]">
            <Info className="h-4 w-4 shrink-0 text-[#00838f]" aria-hidden="true" />
            <span>{geoMessage}</span>
          </p>
        )}

        {/* Day & Time Controls */}
        <div className="mt-5 space-y-4 border-t border-[#E8EFEF] pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Travel day">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#455952]">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                Day:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedDay(todayCode)
                  setTimeMode('now')
                }}
                aria-pressed={selectedDay === todayCode}
                className={`min-h-10 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-colors ${
                  selectedDay === todayCode
                    ? 'bg-[#00838f] text-white'
                    : 'bg-[#EEF4F5] text-[#1D3538] hover:bg-[#DDF0F2]'
                }`}
              >
                Today ({todayCode})
              </button>
              <button
                type="button"
                onClick={() => setSelectedDay(tomorrowCode)}
                aria-pressed={selectedDay === tomorrowCode && tomorrowCode !== todayCode}
                className={`min-h-10 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-colors ${
                  selectedDay === tomorrowCode
                    ? 'bg-[#00838f] text-white'
                    : 'bg-[#EEF4F5] text-[#1D3538] hover:bg-[#DDF0F2]'
                }`}
              >
                Tomorrow ({tomorrowCode})
              </button>

              <label className="sr-only" htmlFor="day-select">
                Choose another day of the week
              </label>
              <select
                id="day-select"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value as DayCode)}
                className="min-h-10 rounded-xl border border-[#CBD7D8] bg-white px-3 py-1.5 text-sm font-bold text-[#1A2B24] hover:border-[#00838f]"
              >
                {DAY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {DAY_FULL_NAMES[code]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Travel time">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#455952]">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Time:
              </span>
              {isToday && (
                <button
                  type="button"
                  onClick={() => setTimeMode('now')}
                  aria-pressed={effectiveTimeMode === 'now'}
                  className={`min-h-10 rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${
                    effectiveTimeMode === 'now'
                      ? 'bg-[#00838f] text-white'
                      : 'bg-[#EEF4F5] text-[#1D3538] hover:bg-[#DDF0F2]'
                  }`}
                >
                  Next buses
                </button>
              )}
              <button
                type="button"
                onClick={() => setTimeMode('all')}
                aria-pressed={effectiveTimeMode === 'all'}
                className={`min-h-10 rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${
                  effectiveTimeMode === 'all'
                    ? 'bg-[#00838f] text-white'
                    : 'bg-[#EEF4F5] text-[#1D3538] hover:bg-[#DDF0F2]'
                }`}
              >
                All day
              </button>
              <button
                type="button"
                onClick={() => setTimeMode('after')}
                aria-pressed={effectiveTimeMode === 'after'}
                className={`min-h-10 rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${
                  effectiveTimeMode === 'after'
                    ? 'bg-[#00838f] text-white'
                    : 'bg-[#EEF4F5] text-[#1D3538] hover:bg-[#DDF0F2]'
                }`}
              >
                Leave after
              </button>
              {effectiveTimeMode === 'after' && (
                <>
                  <label htmlFor="leave-after-time" className="sr-only">
                    Departure time
                  </label>
                  <input
                    id="leave-after-time"
                    type="time"
                    value={afterTime}
                    onChange={(e) => setAfterTime(e.target.value)}
                    className="min-h-10 rounded-xl border border-[#CBD7D8] bg-white px-2.5 py-1.5 text-sm font-bold text-[#111C18] tabular-nums"
                  />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl bg-[#F5F9FA] px-3 py-1.5 text-sm font-semibold text-[#233738] select-none hover:bg-[#E7F2F4]">
              <input
                type="checkbox"
                checked={hideSchoolOnly}
                onChange={(e) => setHideSchoolOnly(e.target.checked)}
                className="h-4 w-4 rounded border-[#9CB0B3] accent-[#00838f]"
              />
              <GraduationCap className="h-4 w-4 text-[#92400E]" aria-hidden="true" />
              <span>Hide school-day-only buses</span>
            </label>
          </div>
        </div>
      </section>

      {/* Popular Journeys (when user hasn't picked both places yet) */}
      {!hasSearch && resolvedQuickPairs.length > 0 && (
        <section aria-labelledby="popular-heading" className="rounded-2xl border border-[#DCE4E4] bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#95398d]" aria-hidden="true" />
            <h2 id="popular-heading" className="text-sm font-bold uppercase tracking-wider text-[#455952]">
              Popular journeys to try
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {resolvedQuickPairs.map((pair) => (
              <button
                key={pair.label}
                type="button"
                onClick={() => {
                  onChangeFrom(pair.from)
                  onChangeTo(pair.to)
                  setTimeMode('all')
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#00838f] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#006B75]"
              >
                <span>{pair.label}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Journey Results */}
      {hasSearch && (
        <section aria-live="polite" aria-label="Bus journey results" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="text-lg font-extrabold text-[#111C18]">
                {fromPlace!.label} to {toPlace!.label}
              </h2>
              <p className="text-sm font-medium text-[#455952]">
                {loadingDirect
                  ? 'Checking direct timetables…'
                  : loadingTransfers && visibleDirectMatches.length === 0
                    ? 'No direct bus — searching connecting routes with 1 change…'
                    : visibleDirectMatches.length > 0 && visibleConnectingMatches.length > 0
                      ? `${visibleDirectMatches.length} direct + ${visibleConnectingMatches.length} with 1 change for ${DAY_FULL_NAMES[selectedDay]}`
                      : visibleDirectMatches.length > 0
                        ? `${visibleDirectMatches.length} direct bus${visibleDirectMatches.length === 1 ? '' : 'es'} shown for ${DAY_FULL_NAMES[selectedDay]}`
                        : visibleConnectingMatches.length > 0
                          ? `No direct bus — ${visibleConnectingMatches.length} connecting journey${visibleConnectingMatches.length === 1 ? '' : 's'} (1 change) for ${DAY_FULL_NAMES[selectedDay]}`
                          : `0 journeys shown for ${DAY_FULL_NAMES[selectedDay]}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!loadingDirect && allDirectMatches.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setShowConnectionsForKey(userRequestedConnections ? null : pairKey)
                  }
                  aria-pressed={userRequestedConnections}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    userRequestedConnections
                      ? 'border-[#95398d] bg-[#95398d] text-white'
                      : 'border-[#00838f] bg-white text-[#006B75] hover:bg-[#E4F4F6]'
                  }`}
                >
                  <Repeat2 className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {userRequestedConnections
                      ? 'Hide 1-change options'
                      : 'Also check 1-change routes'}
                  </span>
                </button>
              )}

              {totalEarlierCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEarlierKey(showEarlier ? null : searchKey)}
                  className="min-h-10 rounded-xl bg-[#00838f] px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-[#006B75]"
                >
                  {showEarlier
                    ? 'Hide earlier buses'
                    : `Show ${totalEarlierCount} earlier journey${totalEarlierCount === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>

          {isLoadingAny && totalVisibleCount === 0 ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#DCE4E4] bg-white p-10 text-sm font-semibold text-[#455952]">
              <Loader2 className="h-5 w-5 animate-spin text-[#00838f]" aria-hidden="true" />
              <span>
                {loadingTransfers && !loadingDirect
                  ? `Finding 1-change bus connections from ${fromPlace!.label} to ${toPlace!.label}…`
                  : `Finding buses between ${fromPlace!.label} and ${toPlace!.label}…`}
              </span>
            </div>
          ) : totalVisibleCount > 0 ? (
            <div className="space-y-5">
              {/* Direct Bus Results */}
              {visibleDirectMatches.length > 0 && (
                <div className="space-y-3.5">
                  {visibleDirectMatches.map((match) => (
                    <JourneyCard
                      key={match.key}
                      match={match}
                      stopMap={stopMap}
                      isNextBus={match.key === nextDirectKey}
                      isToday={isToday}
                      nowMins={nowMins}
                      onInspectRoute={onInspectRoute}
                    />
                  ))}
                </div>
              )}

              {/* Connecting (1-Change) Results */}
              {loadingTransfers && visibleDirectMatches.length > 0 && (
                <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-[#DCE4E4] bg-white p-5 text-sm font-semibold text-[#455952]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#00838f]" aria-hidden="true" />
                  <span>Checking connecting routes with 1 bus change…</span>
                </div>
              )}

              {visibleConnectingMatches.length > 0 && (
                <div className="space-y-3.5">
                  {visibleDirectMatches.length === 0 ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-[#E7D4E6] bg-[#FBF6FB] px-4 py-3 text-sm font-semibold text-[#5E2259]">
                      <Repeat2 className="mt-0.5 h-5 w-5 shrink-0 text-[#95398d]" aria-hidden="true" />
                      <span>
                        There is no direct bus between <strong>{fromPlace!.label}</strong> and{' '}
                        <strong>{toPlace!.label}</strong> on {DAY_FULL_NAMES[selectedDay]}, so here are the best journeys with <strong>1 bus change</strong> (including at least 5 minutes transfer time).
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-2">
                      <Repeat2 className="h-4 w-4 text-[#95398d]" aria-hidden="true" />
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#5E2259]">
                        Alternative journeys with 1 bus change ({visibleConnectingMatches.length})
                      </h3>
                    </div>
                  )}

                  {visibleConnectingMatches.map((match) => (
                    <ConnectingJourneyCard
                      key={match.key}
                      match={match}
                      stopMap={stopMap}
                      isNextBus={
                        visibleDirectMatches.length === 0 && match.key === nextConnectingKey
                      }
                      isToday={isToday}
                      nowMins={nowMins}
                      onInspectRoute={onInspectRoute}
                    />
                  ))}
                </div>
              )}

              {userRequestedConnections &&
                !loadingTransfers &&
                visibleDirectMatches.length > 0 &&
                visibleConnectingMatches.length === 0 && (
                  <p className="rounded-2xl border border-[#DCE4E4] bg-white px-4 py-3 text-sm font-medium text-[#455952]">
                    No faster 1-change connections found — the direct buses above are already your quickest options.
                  </p>
                )}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#DCE4E4] bg-white p-6 text-center sm:p-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E4F4F6] text-[#00838f]">
                <Bus className="h-6 w-6" aria-hidden="true" />
              </div>

              {totalAllCount > 0 && totalEarlierCount > 0 ? (
                <>
                  <h3 className="text-base font-extrabold text-[#111C18]">
                    No more journeys left today after{' '}
                    {effectiveTimeMode === 'now' ? formatMinutesToHHMM(nowMins) : afterTime}
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-[#455952]">
                    There {totalEarlierCount === 1 ? 'was 1 earlier journey' : `were ${totalEarlierCount} earlier journeys`} on{' '}
                    {DAY_FULL_NAMES[selectedDay]}. You can view the full day’s timetable or check tomorrow.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowEarlierKey(searchKey)}
                      className="min-h-11 rounded-xl bg-[#00838f] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B75]"
                    >
                      Show all {totalEarlierCount} earlier journeys
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(tomorrowCode)
                        setTimeMode('all')
                      }}
                      className="min-h-11 rounded-xl border-2 border-[#00838f] bg-white px-4 py-2 text-sm font-bold text-[#006B75] hover:bg-[#E4F4F6]"
                    >
                      Check tomorrow ({DAY_FULL_NAMES[tomorrowCode]})
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-extrabold text-[#111C18]">
                    No direct or 1-change journeys found on {DAY_FULL_NAMES[selectedDay]}
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-[#455952]">
                    {alternativeDaySuggestion
                      ? `No buses connect these places on ${DAY_FULL_NAMES[selectedDay]}, but there are ${alternativeDaySuggestion.count} ${alternativeDaySuggestion.isConnecting ? '1-change connecting ' : ''}journeys on ${DAY_FULL_NAMES[alternativeDaySuggestion.day]}.`
                      : 'We checked both direct buses and 1-change connections (up to 90 minutes wait). Try checking a weekday or splitting your trip via Dumfries.'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                    {alternativeDaySuggestion && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(alternativeDaySuggestion.day)
                          setTimeMode('all')
                        }}
                        className="min-h-11 rounded-xl bg-[#00838f] px-4 py-2 text-sm font-bold text-white hover:bg-[#006B75]"
                      >
                        Check {DAY_FULL_NAMES[alternativeDaySuggestion.day]} ({alternativeDaySuggestion.count} journeys)
                      </button>
                    )}
                    {hideSchoolOnly && (
                      <button
                        type="button"
                        onClick={() => setHideSchoolOnly(false)}
                        className="min-h-11 rounded-xl border-2 border-[#00838f] bg-white px-4 py-2 text-sm font-bold text-[#006B75] hover:bg-[#E4F4F6]"
                      >
                        Include school-day buses
                      </button>
                    )}
                    {fromPlace!.label.toLowerCase() !== 'dumfries' &&
                      toPlace!.label.toLowerCase() !== 'dumfries' &&
                      localities.some((l) => l.label.toLowerCase() === 'dumfries') && (
                        <button
                          type="button"
                          onClick={() => {
                            const dumfries = localities.find(
                              (l) => l.label.toLowerCase() === 'dumfries',
                            )
                            if (dumfries) onChangeTo(dumfries)
                          }}
                          className="min-h-11 rounded-xl border-2 border-[#00838f] bg-white px-4 py-2 text-sm font-bold text-[#006B75] hover:bg-[#E4F4F6]"
                        >
                          Search {fromPlace!.label} → Dumfries
                        </button>
                      )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
