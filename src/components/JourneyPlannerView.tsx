import {
  ArrowLeftRight,
  ArrowRight,
  Bus,
  Calendar,
  Clock,
  GraduationCap,
  Info,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadRouteSchedules } from '../lib/data'
import {
  findCandidateRoutes,
  formatMinutesToHHMM,
  getCurrentMinutes,
  getTodayDayCode,
  getTomorrowDayCode,
  haversineKm,
  matchJourneysFromSchedules,
  parseTimeToMinutes,
} from '../lib/transit'
import {
  DAY_CODES,
  DAY_FULL_NAMES,
  type BusStop,
  type DayCode,
  type JourneyMatch,
  type PlaceOption,
  type RouteSchedule,
  type RouteSummary,
  type TimeFilterMode,
} from '../types/transit'
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
  { fromQuery: 'castle douglas', toQuery: 'dumfries', label: 'Castle Douglas → Dumfries' },
  { fromQuery: 'lockerbie', toQuery: 'dumfries', label: 'Lockerbie → Dumfries' },
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

  const [loadedSchedules, setLoadedSchedules] = useState<{
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
  const showEarlier = showEarlierKey === searchKey

  const schedules = useMemo(
    () => (candidateKey && loadedSchedules.key === candidateKey ? loadedSchedules.map : new Map<string, RouteSchedule>()),
    [candidateKey, loadedSchedules],
  )
  const loadingSchedules = Boolean(candidateKey && loadedSchedules.key !== candidateKey)

  useEffect(() => {
    if (!candidateKey) return
    let cancelled = false

    loadRouteSchedules(candidateRoutes.map((r) => r.id))
      .then((loaded) => {
        if (!cancelled) {
          setLoadedSchedules({ key: candidateKey, map: loaded })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedSchedules({ key: candidateKey, map: new Map() })
        }
      })

    return () => {
      cancelled = true
    }
  }, [candidateKey, candidateRoutes])

  const allMatches: JourneyMatch[] = useMemo(() => {
    if (!fromPlace || !toPlace || candidateRoutes.length === 0) return []
    return matchJourneysFromSchedules({
      routes: candidateRoutes,
      schedules,
      stopMap,
      from: fromPlace,
      to: toPlace,
      day: selectedDay,
      hideSchoolOnly,
    })
  }, [fromPlace, toPlace, candidateRoutes, schedules, stopMap, selectedDay, hideSchoolOnly])

  const cutoffMins = useMemo(() => {
    if (effectiveTimeMode === 'all') return -1
    if (effectiveTimeMode === 'now' && isToday) return Math.max(0, nowMins - 2)
    return parseTimeToMinutes(afterTime)
  }, [effectiveTimeMode, isToday, nowMins, afterTime])

  const { visibleMatches, earlierCount, nextBusKey } = useMemo(() => {
    if (cutoffMins < 0) {
      const firstUpcoming = isToday
        ? allMatches.find((m) => parseTimeToMinutes(m.boardTime) >= nowMins - 1)
        : undefined
      return {
        visibleMatches: allMatches,
        earlierCount: 0,
        nextBusKey: firstUpcoming?.key ?? null,
      }
    }

    const upcoming = allMatches.filter((m) => parseTimeToMinutes(m.boardTime) >= cutoffMins)
    const earlier = allMatches.length - upcoming.length
    const list = showEarlier ? allMatches : upcoming
    return {
      visibleMatches: list,
      earlierCount: earlier,
      nextBusKey: upcoming[0]?.key ?? null,
    }
  }, [allMatches, cutoffMins, showEarlier, isToday, nowMins])

  // Check if buses exist on another day when selected day has none
  let alternativeDaySuggestion: { day: DayCode; count: number } | null = null
  if (fromPlace && toPlace && allMatches.length === 0 && candidateRoutes.length > 0) {
    const candidates: DayCode[] = (['Mon', 'Sat', 'Sun'] as DayCode[]).filter(
      (d) => d !== selectedDay,
    )
    for (const altDay of candidates) {
      const alt = matchJourneysFromSchedules({
        routes: candidateRoutes,
        schedules,
        stopMap,
        from: fromPlace,
        to: toPlace,
        day: altDay,
        hideSchoolOnly: false,
      })
      if (alt.length > 0) {
        alternativeDaySuggestion = { day: altDay, count: alt.length }
        break
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
    })).filter((p): p is { fromQuery: string; toQuery: string; label: string; from: PlaceOption; to: PlaceOption } =>
      Boolean(p.from && p.to),
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

  return (
    <div className="space-y-6">
      {/* Hero + Search Card */}
      <section aria-labelledby="planner-heading" className="rounded-3xl border border-[#D4DFD9] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5">
          <h1
            id="planner-heading"
            className="text-2xl font-extrabold tracking-tight text-[#111C18] sm:text-3xl"
          >
            Where would you like to go?
          </h1>
          <p className="mt-1.5 text-sm font-medium text-[#455952] sm:text-base">
            Search by town, village, or stop name across Dumfries &amp; Galloway — clear times, no confusing PDFs.
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
            accentDotClass="bg-[#0F5C4A] ring-[#0F5C4A]/20"
            onUseNearMe={handleUseNearestStop}
            nearMeLoading={nearMeLoading}
          />

          <div className="flex justify-center md:pt-7">
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap From and To places"
              title="Swap From and To"
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#CED9D3] bg-[#F7FAF8] text-[#18314F] transition-colors hover:border-[#0F5C4A] hover:bg-[#E7F3EE] hover:text-[#0F5C4A]"
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
            accentDotClass="bg-[#18314F] ring-[#18314F]/20"
          />
        </div>

        {geoMessage && (
          <p role="status" className="mt-2.5 flex items-center gap-2 rounded-xl bg-[#F0F5F3] px-3 py-2 text-xs font-semibold text-[#2E423B]">
            <Info className="h-4 w-4 shrink-0 text-[#0F5C4A]" aria-hidden="true" />
            <span>{geoMessage}</span>
          </p>
        )}

        {/* Day & Time Controls */}
        <div className="mt-5 space-y-4 border-t border-[#E8EFEA] pt-5">
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
                    ? 'bg-[#0F5C4A] text-white'
                    : 'bg-[#F0F4F2] text-[#22352E] hover:bg-[#E3ECE7]'
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
                    ? 'bg-[#0F5C4A] text-white'
                    : 'bg-[#F0F4F2] text-[#22352E] hover:bg-[#E3ECE7]'
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
                className="min-h-10 rounded-xl border border-[#CBD7D1] bg-white px-3 py-1.5 text-sm font-bold text-[#1A2B24] hover:border-[#0F5C4A]"
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
                      ? 'bg-[#18314F] text-white'
                      : 'bg-[#F0F4F2] text-[#22352E] hover:bg-[#E3ECE7]'
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
                    ? 'bg-[#18314F] text-white'
                    : 'bg-[#F0F4F2] text-[#22352E] hover:bg-[#E3ECE7]'
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
                    ? 'bg-[#18314F] text-white'
                    : 'bg-[#F0F4F2] text-[#22352E] hover:bg-[#E3ECE7]'
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
                    className="min-h-10 rounded-xl border border-[#CBD7D1] bg-white px-2.5 py-1.5 text-sm font-bold text-[#111C18] tabular-nums"
                  />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl bg-[#F7FAF8] px-3 py-1.5 text-sm font-semibold text-[#233730] select-none hover:bg-[#EDF3F0]">
              <input
                type="checkbox"
                checked={hideSchoolOnly}
                onChange={(e) => setHideSchoolOnly(e.target.checked)}
                className="h-4 w-4 rounded border-[#9CB0A7] accent-[#0F5C4A]"
              />
              <GraduationCap className="h-4 w-4 text-[#92400E]" aria-hidden="true" />
              <span>Hide school-day-only buses</span>
            </label>
          </div>
        </div>
      </section>

      {/* Popular Journeys (when user hasn't picked both places yet) */}
      {!hasSearch && resolvedQuickPairs.length > 0 && (
        <section aria-labelledby="popular-heading" className="rounded-2xl border border-[#DCE4DF] bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#0F5C4A]" aria-hidden="true" />
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
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#CBD7D1] bg-[#F8FAF9] px-4 py-2 text-sm font-bold text-[#172922] transition-colors hover:border-[#0F5C4A] hover:bg-[#E7F3EE] hover:text-[#0A4638]"
              >
                <span>{pair.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#0F5C4A]" aria-hidden="true" />
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
                {loadingSchedules
                  ? 'Checking live timetables…'
                  : `${visibleMatches.length} direct bus${visibleMatches.length === 1 ? '' : 'es'} shown for ${DAY_FULL_NAMES[selectedDay]}`}
              </p>
            </div>

            {earlierCount > 0 && (
              <button
                type="button"
                onClick={() => setShowEarlierKey(showEarlier ? null : searchKey)}
                className="min-h-10 rounded-xl border border-[#CBD7D1] bg-white px-3.5 py-1.5 text-sm font-bold text-[#18314F] transition-colors hover:bg-[#F0F4F2]"
              >
                {showEarlier
                  ? 'Hide earlier buses'
                  : `Show ${earlierCount} earlier bus${earlierCount === 1 ? '' : 'es'}`}
              </button>
            )}
          </div>

          {loadingSchedules ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#DCE4DF] bg-white p-10 text-sm font-semibold text-[#455952]">
              <Loader2 className="h-5 w-5 animate-spin text-[#0F5C4A]" aria-hidden="true" />
              <span>Finding buses between {fromPlace!.label} and {toPlace!.label}…</span>
            </div>
          ) : visibleMatches.length > 0 ? (
            <div className="space-y-3.5">
              {visibleMatches.map((match) => (
                <JourneyCard
                  key={match.key}
                  match={match}
                  stopMap={stopMap}
                  isNextBus={match.key === nextBusKey}
                  isToday={isToday}
                  nowMins={nowMins}
                  onInspectRoute={onInspectRoute}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#DCE4DF] bg-white p-6 text-center sm:p-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF4F1] text-[#0F5C4A]">
                <Bus className="h-6 w-6" aria-hidden="true" />
              </div>

              {allMatches.length > 0 && earlierCount > 0 ? (
                <>
                  <h3 className="text-base font-extrabold text-[#111C18]">
                    No more buses left today after {effectiveTimeMode === 'now' ? formatMinutesToHHMM(nowMins) : afterTime}
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-[#455952]">
                    There {earlierCount === 1 ? 'was 1 earlier bus' : `were ${earlierCount} earlier buses`} on{' '}
                    {DAY_FULL_NAMES[selectedDay]}. You can view the full day’s timetable or check tomorrow.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowEarlierKey(searchKey)}
                      className="min-h-11 rounded-xl bg-[#0F5C4A] px-4 py-2 text-sm font-bold text-white hover:bg-[#0A4638]"
                    >
                      Show all {earlierCount} earlier buses
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(tomorrowCode)
                        setTimeMode('all')
                      }}
                      className="min-h-11 rounded-xl border border-[#CBD7D1] bg-white px-4 py-2 text-sm font-bold text-[#18314F] hover:bg-[#F2F6F4]"
                    >
                      Check tomorrow ({DAY_FULL_NAMES[tomorrowCode]})
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-extrabold text-[#111C18]">
                    No direct buses found on {DAY_FULL_NAMES[selectedDay]}
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-[#455952]">
                    {alternativeDaySuggestion
                      ? `This route does not run on ${DAY_FULL_NAMES[selectedDay]}, but there are ${alternativeDaySuggestion.count} buses on ${DAY_FULL_NAMES[alternativeDaySuggestion.day]}.`
                      : 'No single bus runs directly between these two places. Most cross-region journeys in Dumfries & Galloway connect at Dumfries Whitesands.'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                    {alternativeDaySuggestion && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(alternativeDaySuggestion.day)
                          setTimeMode('all')
                        }}
                        className="min-h-11 rounded-xl bg-[#0F5C4A] px-4 py-2 text-sm font-bold text-white hover:bg-[#0A4638]"
                      >
                        Check {DAY_FULL_NAMES[alternativeDaySuggestion.day]} ({alternativeDaySuggestion.count} buses)
                      </button>
                    )}
                    {hideSchoolOnly && (
                      <button
                        type="button"
                        onClick={() => setHideSchoolOnly(false)}
                        className="min-h-11 rounded-xl border border-[#CBD7D1] bg-white px-4 py-2 text-sm font-bold text-[#18314F] hover:bg-[#F2F6F4]"
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
                          className="min-h-11 rounded-xl border border-[#CBD7D1] bg-white px-4 py-2 text-sm font-bold text-[#18314F] hover:bg-[#F2F6F4]"
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
