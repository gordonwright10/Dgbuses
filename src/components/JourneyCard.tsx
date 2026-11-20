import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
  Map as MapIcon,
  Sun,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  formatCountdown,
  formatDaysPlainEnglish,
  formatDuration,
  formatIndicator,
} from '../lib/transit'
import type { BusStop, JourneyMatch } from '../types/transit'
import { RouteMap, type MapStopPoint } from './RouteMap'

interface JourneyCardProps {
  match: JourneyMatch
  stopMap: Map<string, BusStop>
  isNextBus: boolean
  isToday: boolean
  nowMins: number
  onInspectRoute: (routeId: string) => void
}

export function JourneyCard({
  match,
  stopMap,
  isNextBus,
  isToday,
  nowMins,
  onInspectRoute,
}: JourneyCardProps) {
  const [showStops, setShowStops] = useState(false)
  const [showMap, setShowMap] = useState(false)

  const countdown = isToday ? formatCountdown(match.boardTime, nowMins) : null
  const boardIndicator = formatIndicator(match.boardStop.indicator)
  const alightIndicator = formatIndicator(match.alightStop.indicator)

  const fromIndexSet = useMemo(() => new Set(match.fromIndices), [match.fromIndices])
  const toIndexSet = useMemo(() => new Set(match.toIndices), [match.toIndices])

  const mapPoints: MapStopPoint[] = useMemo(() => {
    if (!showMap) return []
    return match.trip.stops.map(([stopId, time], idx) => {
      const stop: BusStop = stopMap.get(stopId) ?? {
        atcoCode: stopId,
        name: stopId,
        locality: '',
        indicator: '',
        lat: null,
        lng: null,
      }
      let role: MapStopPoint['role'] = 'outer'
      if (idx === match.boardIndex) role = 'board'
      else if (idx === match.alightIndex) role = 'alight'
      else if (idx > match.boardIndex && idx < match.alightIndex) role = 'segment'
      return { stop, time, role }
    })
  }, [showMap, match, stopMap])

  const segmentStops = useMemo(() => {
    return match.trip.stops.slice(match.boardIndex, match.alightIndex + 1).map(([stopId, time], relIdx) => {
      const absIdx = match.boardIndex + relIdx
      const stop = stopMap.get(stopId) ?? {
        atcoCode: stopId,
        name: stopId,
        locality: '',
        indicator: '',
        lat: null,
        lng: null,
      }
      return { stop, time, absIdx }
    })
  }, [match, stopMap])

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${
        isNextBus
          ? 'border-[#0F5C4A] shadow-md ring-1 ring-[#0F5C4A]/15'
          : 'border-[#DCE4DF] shadow-xs hover:shadow-sm'
      }`}
    >
      {isNextBus && (
        <div className="flex items-center justify-between bg-[#0F5C4A] px-4 py-2 text-xs font-bold text-white">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Next bus
          </span>
          {countdown && <span className="tabular-nums">{countdown}</span>}
        </div>
      )}

      <div className="p-4 sm:p-5">
        {/* Top Row: Route Badge, Times, Duration */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onInspectRoute(match.route.id)}
              title={`View full timetable for route ${match.route.lineName}`}
              className="flex min-h-12 min-w-14 items-center justify-center rounded-xl bg-[#18314F] px-3 text-lg font-extrabold tracking-tight text-white tabular-nums transition-colors hover:bg-[#0F5C4A]"
            >
              {match.route.lineName}
            </button>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-extrabold tracking-tight text-[#111C18] tabular-nums">
                  {match.boardTime}
                </span>
                <ArrowRight className="h-4 w-4 text-[#5D726A]" aria-hidden="true" />
                <span className="text-2xl font-extrabold tracking-tight text-[#111C18] tabular-nums">
                  {match.alightTime}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#455952]">
                {match.route.operator}
                {match.trip.headsign ? ` · ${match.directionLabel}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            <span className="inline-flex items-center rounded-lg bg-[#EFF5F2] px-2.5 py-1 text-sm font-bold text-[#14392E] tabular-nums">
              {formatDuration(match.durationMins)}
            </span>
            {!isNextBus && countdown && (
              <span className="text-xs font-bold text-[#0F5C4A] tabular-nums">{countdown}</span>
            )}
          </div>
        </div>

        {/* Plain-English Boarding & Alighting Stops */}
        <div className="mt-4 grid gap-2.5 rounded-xl bg-[#F6F9F7] p-3.5 sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F5C4A]"
            />
            <div className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#0F5C4A]">
                Get on at {match.boardTime}
              </span>
              <span className="block text-sm font-bold text-[#111C18]">
                {match.boardStop.name}
              </span>
              {(boardIndicator || match.boardStop.locality) && (
                <span className="block text-xs font-medium text-[#455952]">
                  {[boardIndicator, match.boardStop.locality].filter(Boolean).join(' · ')}
                </span>
              )}
              {match.extraFromStops > 0 && (
                <span className="mt-0.5 block text-xs font-semibold text-[#0F5C4A]">
                  + {match.extraFromStops} other stop{match.extraFromStops === 1 ? '' : 's'} in{' '}
                  {match.boardStop.locality || 'this town'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 border-t border-[#E4ECE7] pt-2.5 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#18314F]"
            />
            <div className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#18314F]">
                Get off at {match.alightTime}
              </span>
              <span className="block text-sm font-bold text-[#111C18]">
                {match.alightStop.name}
              </span>
              {(alightIndicator || match.alightStop.locality) && (
                <span className="block text-xs font-medium text-[#455952]">
                  {[alightIndicator, match.alightStop.locality].filter(Boolean).join(' · ')}
                </span>
              )}
              {match.extraToStops > 0 && (
                <span className="mt-0.5 block text-xs font-semibold text-[#18314F]">
                  + {match.extraToStops} other stop{match.extraToStops === 1 ? '' : 's'} in{' '}
                  {match.alightStop.locality || 'this town'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Plain-English Operating Notes (Zero Timetable Jargon) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F0F4F2] px-2.5 py-1 text-xs font-semibold text-[#2E423B]">
            <CalendarClock className="h-3.5 w-3.5 text-[#455952]" aria-hidden="true" />
            {formatDaysPlainEnglish(match.trip.days)}
          </span>

          {match.trip.schoolOnly && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FEF3C7] px-2.5 py-1 text-xs font-bold text-[#92400E]">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              School days only (term time)
            </span>
          )}

          {match.trip.nonSchoolOnly && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#E0F2FE] px-2.5 py-1 text-xs font-bold text-[#075985]">
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              School holidays only
            </span>
          )}

          {match.trip.bankHolidays && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#9A3412]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {match.trip.bankHolidays}
            </span>
          )}
        </div>

        {/* Action Row: Large Tap Targets */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowStops((v) => !v)}
            aria-expanded={showStops}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#CBD7D1] bg-white px-3.5 py-2 text-sm font-bold text-[#1C2E27] transition-colors hover:bg-[#F2F6F4] sm:flex-none"
          >
            {showStops ? (
              <ChevronUp className="h-4 w-4 text-[#0F5C4A]" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#0F5C4A]" aria-hidden="true" />
            )}
            <span>
              {showStops
                ? 'Hide stops'
                : `See stops (${match.stopsBetween + 2})`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            aria-expanded={showMap}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors sm:flex-none ${
              showMap
                ? 'border-[#0F5C4A] bg-[#E8F4EF] text-[#0A4638]'
                : 'border-[#CBD7D1] bg-white text-[#1C2E27] hover:bg-[#F2F6F4]'
            }`}
          >
            <MapIcon className="h-4 w-4 text-[#0F5C4A]" aria-hidden="true" />
            <span>{showMap ? 'Hide map' : 'Show on map'}</span>
          </button>
        </div>

        {/* Expandable Stop-by-Stop Timeline */}
        {showStops && (
          <div className="mt-4 border-t border-[#E6ECE8] pt-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#455952]">
              Stops along your journey
            </h4>
            <ol className="space-y-0">
              {segmentStops.map(({ stop, time, absIdx }, i) => {
                const isFirst = i === 0
                const isLast = i === segmentStops.length - 1
                const isFromZone = fromIndexSet.has(absIdx)
                const isToZone = toIndexSet.has(absIdx)
                const ind = formatIndicator(stop.indicator)

                return (
                  <li key={`${stop.atcoCode}-${absIdx}`} className="relative flex gap-3 pb-3.5 last:pb-0">
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[4.35rem] top-3 bottom-0 w-0.5 bg-[#C5D5CE]"
                      />
                    )}
                    <span className="w-14 shrink-0 pt-0.5 text-right text-sm font-bold text-[#111C18] tabular-nums">
                      {time}
                    </span>
                    <span className="relative z-10 mt-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <span
                        className={`rounded-full ${
                          isFirst
                            ? 'h-3.5 w-3.5 bg-[#0F5C4A] ring-4 ring-[#0F5C4A]/20'
                            : isLast
                              ? 'h-3.5 w-3.5 bg-[#18314F] ring-4 ring-[#18314F]/20'
                              : isFromZone
                                ? 'h-2.5 w-2.5 bg-[#0F5C4A]'
                                : isToZone
                                  ? 'h-2.5 w-2.5 bg-[#18314F]'
                                  : 'h-2.5 w-2.5 border-2 border-[#0F5C4A] bg-white'
                        }`}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm ${
                            isFirst || isLast ? 'font-extrabold text-[#111C18]' : 'font-semibold text-[#1F302A]'
                          }`}
                        >
                          {stop.name}
                        </span>
                        {isFirst && (
                          <span className="rounded bg-[#E4F3ED] px-1.5 py-0.5 text-[11px] font-bold text-[#0A4638]">
                            Board
                          </span>
                        )}
                        {isLast && (
                          <span className="rounded bg-[#E5ECF4] px-1.5 py-0.5 text-[11px] font-bold text-[#18314F]">
                            Get off
                          </span>
                        )}
                      </div>
                      {(ind || stop.locality) && (
                        <p className="text-xs font-medium text-[#546860]">
                          {[ind, stop.locality].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {/* Expandable Interactive Leaflet Route Map */}
        {showMap && (
          <div className="mt-4 border-t border-[#E6ECE8] pt-4">
            <RouteMap
              points={mapPoints}
              ariaLabel={`Map for route ${match.route.lineName} from ${match.boardStop.name} to ${match.alightStop.name}`}
            />
          </div>
        )}
      </div>
    </article>
  )
}
