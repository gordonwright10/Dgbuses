import {
  DAY_CODES,
  type BusStop,
  type DayCode,
  type JourneyMatch,
  type PlaceOption,
  type RouteSchedule,
  type RouteSummary,
} from '../types/transit'

const HUB_KEYWORDS = [
  'bus station',
  'whitesands',
  'high street',
  'town hall',
  'stand',
  'square',
  'cross',
  'railway station',
  'main entrance',
  'harbour',
]

export function getTodayDayCode(date = new Date()): DayCode {
  // JS getDay(): 0 = Sun, 1 = Mon ... 6 = Sat
  const idx = (date.getDay() + 6) % 7
  return DAY_CODES[idx]
}

export function getTomorrowDayCode(date = new Date()): DayCode {
  const next = new Date(date.getTime() + 86400_000)
  return getTodayDayCode(next)
}

export function getCurrentMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

export function formatMinutesToHHMM(totalMins: number): string {
  const wrapped = ((totalMins % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatDuration(mins: number): string {
  if (mins <= 0) return '< 1 min'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min${m === 1 ? '' : 's'}`
  if (m === 0) return `${h} hr${h === 1 ? '' : 's'}`
  return `${h} hr ${m} min${m === 1 ? '' : 's'}`
}

export function formatIndicator(indicator: string): string {
  if (!indicator) return ''
  const trimmed = indicator.trim()
  if (!trimmed) return ''

  const replacements: [RegExp, string][] = [
    [/^opp\b\.?/i, 'Opposite'],
    [/^o\/s\b\.?/i, 'Outside'],
    [/^adj\b\.?/i, 'Next to'],
    [/^nr\b\.?/i, 'Near'],
    [/^at\b/i, 'At'],
    [/^before\b/i, 'Before'],
    [/^after\b/i, 'After'],
    [/^outside\b/i, 'Outside'],
    [/^opposite\b/i, 'Opposite'],
    [/^forecourt\b/i, 'Station forecourt'],
  ]

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement)
    }
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function formatStopLabel(stop: BusStop): string {
  const ind = formatIndicator(stop.indicator)
  if (!ind) return stop.name
  return `${stop.name} (${ind})`
}

export function formatDaysPlainEnglish(days: DayCode[]): string {
  const set = new Set(days)
  if (set.size === 7) return 'Runs every day'
  if (
    set.size === 6 &&
    set.has('Mon') &&
    set.has('Tue') &&
    set.has('Wed') &&
    set.has('Thu') &&
    set.has('Fri') &&
    set.has('Sat')
  ) {
    return 'Mon – Sat'
  }
  if (
    set.size === 5 &&
    set.has('Mon') &&
    set.has('Tue') &&
    set.has('Wed') &&
    set.has('Thu') &&
    set.has('Fri')
  ) {
    return 'Mon – Fri'
  }
  if (set.size === 2 && set.has('Sat') && set.has('Sun')) return 'Sat & Sun'
  if (set.size === 1 && set.has('Sun')) return 'Sundays only'
  if (set.size === 1 && set.has('Sat')) return 'Saturdays only'
  return DAY_CODES.filter((d) => set.has(d)).join(', ')
}

export function formatCountdown(depHHMM: string, nowMins: number): string | null {
  const depMins = parseTimeToMinutes(depHHMM)
  const diff = depMins - nowMins
  if (diff < -1) return null
  if (diff <= 1) return 'Leaving now'
  if (diff < 60) return `In ${diff} min${diff === 1 ? '' : 's'}`
  const h = Math.floor(diff / 60)
  const m = diff % 60
  if (h <= 4) {
    return m === 0 ? `In ${h} hr${h === 1 ? '' : 's'}` : `In ${h} hr ${m}m`
  }
  return null
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(km: number): string {
  if (km < 0.8) {
    const metres = Math.max(10, Math.round((km * 1000) / 10) * 10)
    return `${metres} m away`
  }
  const miles = km * 0.621371
  return `${miles.toFixed(1)} mi away`
}

/**
 * Build searchable PlaceOptions for both Towns/Villages (localities) and individual bus stops.
 * Only includes localities and stops that actually have bus routes or active stop data.
 */
export function buildPlaceOptions(
  stops: BusStop[],
  routes: RouteSummary[],
): { localities: PlaceOption[]; stopOptions: PlaceOption[] } {
  const servedStopIds = new Set<string>()
  for (const r of routes) {
    for (const s of r.stopIds) servedStopIds.add(s)
  }

  const byLocality = new Map<string, BusStop[]>()
  for (const stop of stops) {
    const loc = stop.locality.trim()
    if (!loc) continue
    const list = byLocality.get(loc) ?? []
    list.push(stop)
    byLocality.set(loc, list)
  }

  const localities: PlaceOption[] = []
  for (const [loc, locStops] of byLocality.entries()) {
    const servedCount = locStops.filter((s) => servedStopIds.has(s.atcoCode)).length
    // If routes exist, prefer localities with served stops (or show all if none matched)
    if (servedStopIds.size > 0 && servedCount === 0) continue

    const coords = locStops.filter((s) => s.lat !== null && s.lng !== null)
    const avgLat =
      coords.length > 0 ? coords.reduce((sum, s) => sum + (s.lat ?? 0), 0) / coords.length : null
    const avgLng =
      coords.length > 0 ? coords.reduce((sum, s) => sum + (s.lng ?? 0), 0) / coords.length : null

    const activeCount = servedCount || locStops.length
    const isDgLocality = locStops.some((s) => s.atcoCode.startsWith('680'))
    localities.push({
      id: `loc:${loc.toLowerCase()}`,
      kind: 'locality',
      label: loc,
      sublabel: isDgLocality
        ? `Town / village · ${activeCount} bus stop${activeCount === 1 ? '' : 's'}`
        : `Cross-border destination · ${activeCount} stop${activeCount === 1 ? '' : 's'}`,
      stopIds: locStops.map((s) => s.atcoCode),
      lat: avgLat,
      lng: avgLng,
      searchKey: `${loc.toLowerCase()} ${locStops.map((s) => s.name.toLowerCase()).join(' ')}`,
    })
  }
  localities.sort((a, b) => {
    const aDg = a.stopIds.some((id) => id.startsWith('680')) ? 1 : 0
    const bDg = b.stopIds.some((id) => id.startsWith('680')) ? 1 : 0
    if (aDg !== bDg) return bDg - aDg
    return b.stopIds.length - a.stopIds.length || a.label.localeCompare(b.label)
  })

  const stopOptions: PlaceOption[] = stops
    .filter((s) => servedStopIds.size === 0 || servedStopIds.has(s.atcoCode))
    .map((s) => {
      const ind = formatIndicator(s.indicator)
      const parts = [s.locality, ind].filter(Boolean)
      const alias = /royal infirmary|dgri/i.test(s.name) ? ' dgri hospital infirmary' : ''
      return {
        id: `stop:${s.atcoCode}`,
        kind: 'stop',
        label: s.name,
        sublabel: parts.join(' · ') || s.atcoCode,
        stopIds: [s.atcoCode],
        lat: s.lat,
        lng: s.lng,
        searchKey: `${s.name} ${s.locality} ${s.indicator} ${s.atcoCode}${alias}`.toLowerCase(),
      }
    })

  return { localities, stopOptions }
}

export function searchPlaceOptions(
  query: string,
  localities: PlaceOption[],
  stopOptions: PlaceOption[],
): { matchedLocalities: PlaceOption[]; matchedStops: PlaceOption[] } {
  const q = query.trim().toLowerCase()
  if (!q) {
    return {
      matchedLocalities: localities.slice(0, 6),
      matchedStops: stopOptions
        .filter((s) => /whitesands|dgri|bus station|railway station/i.test(s.label))
        .slice(0, 4),
    }
  }

  const tokens = q.split(/\s+/).filter(Boolean)

  const scoreOption = (opt: PlaceOption): number => {
    const labelLower = opt.label.toLowerCase()
    if (labelLower === q) return 100
    if (labelLower.startsWith(q)) return 85
    if (tokens.every((t) => labelLower.includes(t))) return 70
    if (tokens.every((t) => opt.searchKey.includes(t))) return 45
    return 0
  }

  const matchedLocalities = localities
    .map((opt) => ({ opt, score: scoreOption(opt) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.opt.stopIds.length - a.opt.stopIds.length)
    .slice(0, 6)
    .map((x) => x.opt)

  const matchedStops = stopOptions
    .map((opt) => ({ opt, score: scoreOption(opt) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.opt.label.localeCompare(b.opt.label))
    .slice(0, 8)
    .map((x) => x.opt)

  return { matchedLocalities, matchedStops }
}

function isHubStop(stop: BusStop | undefined): boolean {
  if (!stop) return false
  const text = `${stop.name} ${stop.indicator}`.toLowerCase()
  return HUB_KEYWORDS.some((kw) => text.includes(kw))
}

function pickBestIndex(
  indices: number[],
  tripStops: [string, string][],
  stopMap: Map<string, BusStop>,
  preferFirst: boolean,
): number {
  if (indices.length === 1) return indices[0]
  // Prefer a town-centre / station / Whitesands hub stop when searching by whole town
  const hubIndex = indices.find((idx) => isHubStop(stopMap.get(tripStops[idx][0])))
  if (hubIndex !== undefined) return hubIndex
  return preferFirst ? indices[0] : indices[indices.length - 1]
}

export function findCandidateRoutes(
  routes: RouteSummary[],
  from: PlaceOption,
  to: PlaceOption,
): RouteSummary[] {
  const fromSet = new Set(from.stopIds)
  const toSet = new Set(to.stopIds)

  return routes.filter((route) => {
    let hasFrom = false
    let hasTo = false
    for (const s of route.stopIds) {
      if (fromSet.has(s)) hasFrom = true
      if (toSet.has(s)) hasTo = true
      if (hasFrom && hasTo) return true
    }
    return false
  })
}

export function matchJourneysFromSchedules(params: {
  routes: RouteSummary[]
  schedules: Map<string, RouteSchedule>
  stopMap: Map<string, BusStop>
  from: PlaceOption
  to: PlaceOption
  day: DayCode
  hideSchoolOnly: boolean
}): JourneyMatch[] {
  const { routes, schedules, stopMap, from, to, day, hideSchoolOnly } = params
  const fromSet = new Set(from.stopIds)
  const toSet = new Set(to.stopIds)
  const matches: JourneyMatch[] = []

  for (const route of routes) {
    const sched = schedules.get(route.id)
    if (!sched) continue

    const directions: Array<{ dir: 'outbound' | 'inbound'; label: string; trips: RouteSchedule['outbound'] }> = [
      { dir: 'outbound', label: sched.outboundLabel, trips: sched.outbound },
      { dir: 'inbound', label: sched.inboundLabel, trips: sched.inbound },
    ]

    for (const { dir, label, trips } of directions) {
      for (const trip of trips) {
        if (!trip.days.includes(day)) continue
        if (hideSchoolOnly && trip.schoolOnly) continue

        const fromIndices: number[] = []
        const toIndices: number[] = []

        for (let i = 0; i < trip.stops.length; i++) {
          const stopId = trip.stops[i][0]
          if (fromSet.has(stopId)) fromIndices.push(i)
          if (toSet.has(stopId)) toIndices.push(i)
        }

        if (fromIndices.length === 0 || toIndices.length === 0) continue

        // Must have at least one boarding stop strictly before an alighting stop
        const earliestFrom = fromIndices[0]
        const validToIndices = toIndices.filter((idx) => idx > earliestFrom)
        if (validToIndices.length === 0) continue

        const latestValidTo = validToIndices[validToIndices.length - 1]
        const validFromIndices = fromIndices.filter((idx) => idx < latestValidTo)
        if (validFromIndices.length === 0) continue

        const boardIndex =
          from.kind === 'stop'
            ? validFromIndices[0]
            : pickBestIndex(validFromIndices, trip.stops, stopMap, true)

        const toAfterBoard = validToIndices.filter((idx) => idx > boardIndex)
        if (toAfterBoard.length === 0) continue

        const alightIndex =
          to.kind === 'stop'
            ? toAfterBoard[0]
            : pickBestIndex(toAfterBoard, trip.stops, stopMap, true)

        const [boardStopId, boardTime] = trip.stops[boardIndex]
        const [alightStopId, alightTime] = trip.stops[alightIndex]

        const boardStop: BusStop = stopMap.get(boardStopId) ?? {
          atcoCode: boardStopId,
          name: boardStopId,
          locality: '',
          indicator: '',
          lat: null,
          lng: null,
        }
        const alightStop: BusStop = stopMap.get(alightStopId) ?? {
          atcoCode: alightStopId,
          name: alightStopId,
          locality: '',
          indicator: '',
          lat: null,
          lng: null,
        }

        let durationMins = parseTimeToMinutes(alightTime) - parseTimeToMinutes(boardTime)
        if (durationMins < 0) durationMins += 1440

        matches.push({
          key: `${route.id}:${dir}:${trip.id}:${boardIndex}:${alightIndex}`,
          route,
          direction: dir,
          directionLabel: label,
          trip,
          boardStop,
          boardTime,
          boardIndex,
          alightStop,
          alightTime,
          alightIndex,
          durationMins,
          stopsBetween: Math.max(0, alightIndex - boardIndex - 1),
          extraFromStops: Math.max(0, validFromIndices.length - 1),
          extraToStops: Math.max(0, toAfterBoard.length - 1),
          fromIndices: validFromIndices,
          toIndices: toAfterBoard,
        })
      }
    }
  }

  matches.sort((a, b) => {
    const depDiff = parseTimeToMinutes(a.boardTime) - parseTimeToMinutes(b.boardTime)
    if (depDiff !== 0) return depDiff
    return a.durationMins - b.durationMins
  })

  return matches
}
