import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Footprints,
  GraduationCap,
  Map as MapIcon,
  Moon,
  Repeat2,
  Sun,
  Undo2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  formatCountdown,
  formatDuration,
  formatIndicator,
  formatStopDisplayName,
} from '../lib/transit'
import type { BusStop, ConnectingJourneyMatch, JourneyLeg } from '../types/transit'
import { RouteMap, type MapStopPoint } from './RouteMap'

interface ConnectingJourneyCardProps {
  match: ConnectingJourneyMatch
  stopMap: Map<string, BusStop>
  highlightLabel?: string | null
  isLastBus?: boolean
  dayLabel?: string
  isToday: boolean
  nowMins: number
  onInspectRoute: (routeId: string) => void
  onCheckReturn?: (arrivalHHMM: string) => void
}

function getSegmentStops(leg: JourneyLeg, stopMap: Map<string, BusStop>) {
  return leg.trip.stops.slice(leg.boardIndex, leg.alightIndex + 1).map(([stopId, time], relIdx) => {
    const absIdx = leg.boardIndex + relIdx
    const stop: BusStop = stopMap.get(stopId) ?? {
      atcoCode: stopId,
      name: stopId,
      locality: '',
      indicator: '',
      lat: null,
      lng: null,
    }
    return { stop, time, absIdx }
  })
}

export function ConnectingJourneyCard({
  match,
  stopMap,
  highlightLabel = null,
  isLastBus = false,
  dayLabel = 'today',
  isToday,
  nowMins,
  onInspectRoute,
  onCheckReturn,
}: ConnectingJourneyCardProps) {
  const [showStops, setShowStops] = useState(false)
  const [showMap, setShowMap] = useState(false)

  const { leg1, leg2 } = match
  const isHighlighted = Boolean(highlightLabel)
  const countdown = isToday ? formatCountdown(leg1.boardTime, nowMins) : null

  const leg1BoardName = formatStopDisplayName(leg1.boardStop)
  const leg1AlightName = formatStopDisplayName(leg1.alightStop)
  const leg2BoardName = formatStopDisplayName(leg2.boardStop)
  const leg2AlightName = formatStopDisplayName(leg2.alightStop)

  const leg1Stops = useMemo(
    () => (showStops ? getSegmentStops(leg1, stopMap) : []),
    [showStops, leg1, stopMap],
  )
  const leg2Stops = useMemo(
    () => (showStops ? getSegmentStops(leg2, stopMap) : []),
    [showStops, leg2, stopMap],
  )

  const { leg1MapPoints, leg2MapPoints } = useMemo(() => {
    if (!showMap) return { leg1MapPoints: [] as MapStopPoint[], leg2MapPoints: [] as MapStopPoint[] }

    const seg1 = getSegmentStops(leg1, stopMap).map(({ stop, time }, idx, arr) => ({
      stop,
      time,
      role: (idx === 0 ? 'board' : idx === arr.length - 1 ? 'change' : 'segment') as MapStopPoint['role'],
    }))
    const seg2 = getSegmentStops(leg2, stopMap).map(({ stop, time }, idx, arr) => ({
      stop,
      time,
      role: (idx === 0 ? 'change' : idx === arr.length - 1 ? 'alight' : 'segment') as MapStopPoint['role'],
    }))

    return { leg1MapPoints: seg1, leg2MapPoints: seg2 }
  }, [showMap, leg1, leg2, stopMap])

  const hasSchoolOnly = leg1.trip.schoolOnly || leg2.trip.schoolOnly
  const hasNonSchoolOnly = leg1.trip.nonSchoolOnly || leg2.trip.nonSchoolOnly
  const bankHolidayNote = leg1.trip.bankHolidays || leg2.trip.bankHolidays
  const totalStopsCount = leg1.stopsBetween + 2 + leg2.stopsBetween + 2

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${
        isHighlighted
          ? 'border-[#00838f] shadow-md ring-1 ring-[#00838f]/20'
          : 'border-[#DCE4E4] shadow-xs hover:shadow-sm'
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-bold ${
          isHighlighted ? 'bg-[#00838f] text-white' : 'bg-[#F5EBF4] text-[#7A2D73]'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          {isHighlighted ? (
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>
            {highlightLabel ? `${highlightLabel} · ` : ''}1 change at {match.changeAtLabel}
          </span>
        </span>
        {countdown && <span className="tabular-nums">{countdown}</span>}
      </div>

      <div className="p-4 sm:p-5">
        {/* Summary Row: Overall Times, Route Chain Badges, Total Duration */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-[#111C18] tabular-nums">
                {leg1.boardTime}
              </span>
              <ArrowRight className="h-4 w-4 text-[#5D7274]" aria-hidden="true" />
              <span className="text-2xl font-extrabold tracking-tight text-[#111C18] tabular-nums">
                {leg2.alightTime}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onInspectRoute(leg1.route.id)}
                title={`View full timetable for route ${leg1.route.lineName}`}
                className="inline-flex min-h-8 min-w-10 items-center justify-center rounded-lg bg-[#00838f] px-2.5 text-sm font-extrabold text-white tabular-nums hover:bg-[#006B75]"
              >
                {leg1.route.lineName}
              </button>
              <ArrowRight className="h-3.5 w-3.5 text-[#5D7274]" aria-hidden="true" />
              <span className="rounded-md bg-[#FEF3C7] px-2 py-0.5 text-xs font-bold text-[#92400E]">
                Change ({match.waitMins}m)
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#5D7274]" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onInspectRoute(leg2.route.id)}
                title={`View full timetable for route ${leg2.route.lineName}`}
                className="inline-flex min-h-8 min-w-10 items-center justify-center rounded-lg bg-[#95398d] px-2.5 text-sm font-extrabold text-white tabular-nums hover:bg-[#7A2D73]"
              >
                {leg2.route.lineName}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            <span className="inline-flex items-center rounded-lg bg-[#E4F4F6] px-2.5 py-1 text-sm font-bold text-[#005A63] tabular-nums">
              {formatDuration(match.totalDurationMins)} total
            </span>
            {!isHighlighted && countdown && (
              <span className="text-xs font-bold text-[#006B75] tabular-nums">{countdown}</span>
            )}
          </div>
        </div>

        {/* Step-by-Step 2-Leg Plain-English Breakdown */}
        <div className="mt-4 space-y-2.5">
          {/* Leg 1 */}
          <div className="rounded-xl border border-[#D4E6E8] bg-[#F5FAFA] p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#006B75]">
                <span className="rounded-md bg-[#00838f] px-2 py-0.5 text-white">Bus {leg1.route.lineName}</span>
                <span>{leg1.route.operator}</span>
              </span>
              <span className="text-xs font-bold text-[#455952] tabular-nums">
                {formatDuration(leg1.durationMins)}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-bold text-[#006B75] tabular-nums">
                  Get on at {leg1.boardTime}
                </span>
                <span className="block text-sm font-bold text-[#111C18]">{leg1BoardName}</span>
                <span className="block text-xs text-[#455952]">
                  {[formatIndicator(leg1.boardStop.indicator), leg1.boardStop.locality].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="border-t border-[#DDECEC] pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                <span className="block text-xs font-bold text-[#455952] tabular-nums">
                  Get off at {leg1.alightTime}
                </span>
                <span className="block text-sm font-bold text-[#111C18]">{leg1AlightName}</span>
                <span className="block text-xs text-[#455952]">
                  {[formatIndicator(leg1.alightStop.indicator), leg1.alightStop.locality].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>
          </div>

          {/* Transfer / Interchange Step */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F5D6A7] bg-[#FFFBEB] px-3.5 py-2.5 text-xs font-bold text-[#92400E]">
            <span className="inline-flex items-center gap-2">
              <Repeat2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Change buses at {match.changeAtLabel} · Wait {formatDuration(match.waitMins)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Footprints className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {match.walkMetres === 0
                ? 'Same bus stop (no walking needed)'
                : `Short ${match.walkMins} min walk (${match.walkMetres} m) to ${leg2BoardName}`}
            </span>
          </div>

          {/* Leg 2 */}
          <div className="rounded-xl border border-[#E7D4E6] bg-[#FBF7FB] p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#7A2D73]">
                <span className="rounded-md bg-[#95398d] px-2 py-0.5 text-white">Bus {leg2.route.lineName}</span>
                <span>{leg2.route.operator}</span>
              </span>
              <span className="text-xs font-bold text-[#455952] tabular-nums">
                {formatDuration(leg2.durationMins)}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-bold text-[#7A2D73] tabular-nums">
                  Get on at {leg2.boardTime}
                </span>
                <span className="block text-sm font-bold text-[#111C18]">{leg2BoardName}</span>
                <span className="block text-xs text-[#455952]">
                  {[formatIndicator(leg2.boardStop.indicator), leg2.boardStop.locality].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="border-t border-[#EADCE9] pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                <span className="block text-xs font-bold text-[#7A2D73] tabular-nums">
                  Get off at {leg2.alightTime}
                </span>
                <span className="block text-sm font-bold text-[#111C18]">{leg2AlightName}</span>
                <span className="block text-xs text-[#455952]">
                  {[formatIndicator(leg2.alightStop.indicator), leg2.alightStop.locality].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Plain-English Service Notes */}
        {(isLastBus || hasSchoolOnly || hasNonSchoolOnly || bankHolidayNote) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isLastBus && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1 text-xs font-bold text-[#991B1B]">
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                Last connecting journey {dayLabel}
              </span>
            )}
            {hasSchoolOnly && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FEF3C7] px-2.5 py-1 text-xs font-bold text-[#92400E]">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                Includes a school-days-only bus
              </span>
            )}
            {hasNonSchoolOnly && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E0F2FE] px-2.5 py-1 text-xs font-bold text-[#075985]">
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                Includes a school-holidays-only bus
              </span>
            )}
            {bankHolidayNote && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#9A3412]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {bankHolidayNote}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowStops((v) => !v)}
            aria-expanded={showStops}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors sm:flex-none ${
              showStops
                ? 'bg-[#006B75] text-white'
                : 'bg-[#00838f] text-white hover:bg-[#006B75]'
            }`}
          >
            {showStops ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{showStops ? 'Hide stops' : `See all stops (${totalStopsCount})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            aria-expanded={showMap}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-colors sm:flex-none ${
              showMap
                ? 'border-[#00838f] bg-[#00838f] text-white'
                : 'border-[#00838f] bg-white text-[#006B75] hover:bg-[#E4F4F6]'
            }`}
          >
            <MapIcon className="h-4 w-4" aria-hidden="true" />
            <span>{showMap ? 'Hide map' : 'Show both buses on map'}</span>
          </button>

          {onCheckReturn && (
            <button
              type="button"
              onClick={() => onCheckReturn(leg2.alightTime)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#95398d]/35 bg-[#FBF6FB] px-4 py-2 text-sm font-bold text-[#7A2D73] transition-colors hover:border-[#95398d] hover:bg-[#95398d] hover:text-white sm:w-auto"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              <span>Check return buses</span>
            </button>
          )}
        </div>

        {/* Expandable 2-Leg Stop Timeline */}
        {showStops && (
          <div className="mt-4 space-y-4 border-t border-[#E6ECEC] pt-4">
            <div>
              <h4 className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-[#006B75]">
                First bus · Route {leg1.route.lineName} ({leg1.route.operator})
              </h4>
              <ol className="space-y-0">
                {leg1Stops.map(({ stop, time, absIdx }, i) => {
                  const isFirst = i === 0
                  const isLast = i === leg1Stops.length - 1
                  const ind = formatIndicator(stop.indicator)
                  return (
                    <li key={`l1-${stop.atcoCode}-${absIdx}`} className="relative flex gap-3 pb-3 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[4.35rem] top-3 bottom-0 w-0.5 bg-[#9BC9CE]"
                        />
                      )}
                      <span className="w-14 shrink-0 pt-0.5 text-right text-sm font-bold text-[#111C18] tabular-nums">
                        {time}
                      </span>
                      <span className="relative z-10 mt-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        <span
                          className={`rounded-full ${
                            isFirst
                              ? 'h-3.5 w-3.5 bg-[#00838f] ring-4 ring-[#00838f]/20'
                              : isLast
                                ? 'h-3.5 w-3.5 bg-[#D97706] ring-4 ring-[#D97706]/20'
                                : 'h-2.5 w-2.5 border-2 border-[#00838f] bg-white'
                          }`}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm ${isFirst || isLast ? 'font-extrabold text-[#111C18]' : 'font-semibold text-[#1F302A]'}`}>
                          {formatStopDisplayName(stop)}
                        </span>
                        {(ind || stop.locality) && (
                          <p className="text-xs text-[#546860]">
                            {[ind, stop.locality].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>

            <div className="rounded-xl border border-[#F5D6A7] bg-[#FFFBEB] px-3.5 py-2 text-xs font-bold text-[#92400E]">
              Change buses at {match.changeAtLabel} · Wait {formatDuration(match.waitMins)}
              {match.walkMetres > 0 ? ` · Walk ${match.walkMetres} m (${match.walkMins} min)` : ' · Same stop'}
            </div>

            <div>
              <h4 className="mb-2.5 text-xs font-extrabold uppercase tracking-wider text-[#7A2D73]">
                Second bus · Route {leg2.route.lineName} ({leg2.route.operator})
              </h4>
              <ol className="space-y-0">
                {leg2Stops.map(({ stop, time, absIdx }, i) => {
                  const isFirst = i === 0
                  const isLast = i === leg2Stops.length - 1
                  const ind = formatIndicator(stop.indicator)
                  return (
                    <li key={`l2-${stop.atcoCode}-${absIdx}`} className="relative flex gap-3 pb-3 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[4.35rem] top-3 bottom-0 w-0.5 bg-[#D4A6D0]"
                        />
                      )}
                      <span className="w-14 shrink-0 pt-0.5 text-right text-sm font-bold text-[#111C18] tabular-nums">
                        {time}
                      </span>
                      <span className="relative z-10 mt-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        <span
                          className={`rounded-full ${
                            isFirst
                              ? 'h-3.5 w-3.5 bg-[#D97706] ring-4 ring-[#D97706]/20'
                              : isLast
                                ? 'h-3.5 w-3.5 bg-[#95398d] ring-4 ring-[#95398d]/20'
                                : 'h-2.5 w-2.5 border-2 border-[#95398d] bg-white'
                          }`}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm ${isFirst || isLast ? 'font-extrabold text-[#111C18]' : 'font-semibold text-[#1F302A]'}`}>
                          {formatStopDisplayName(stop)}
                        </span>
                        {(ind || stop.locality) && (
                          <p className="text-xs text-[#546860]">
                            {[ind, stop.locality].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        )}

        {/* Expandable 2-Leg Interactive Map */}
        {showMap && (
          <div className="mt-4 border-t border-[#E6ECEC] pt-4">
            <RouteMap
              points={leg1MapPoints}
              leg2Points={leg2MapPoints}
              ariaLabel={`Map showing bus ${leg1.route.lineName} changing at ${match.changeAtLabel} to bus ${leg2.route.lineName}`}
            />
          </div>
        )}
      </div>
    </article>
  )
}
