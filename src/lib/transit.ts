import {
  DAY_CODES,
  type BusStop,
  type ConnectingJourneyMatch,
  type DayCode,
  type JourneyLeg,
  type JourneyMatch,
  type PlaceOption,
  type RouteSchedule,
  type RouteSummary,
} from '../types/transit'

const HUB_KEYWORDS = [
  'bus station',
  'whitesands',
  'loreburne',
  'high street',
  'king street',
  'market hill',
  'town hall',
  'stance',
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

const GENERIC_COMMON_NAME_RE =
  /^(stance\s*\w*|stand\s*\w*|bay\s*\w*|stop\s*\w*|hospital|school|statue|post office|pub|court|shop|garage|hotel|church|shopping centre|industrial estate|business park|bridge|cross|square|station|estate|cottage|factory|hall|library|surgery|clinic|park|road end|junction|green|corner|depot|inn|hotel|car park|cenotaph|war memorial|town hall|police station|fire station|medical centre|health centre)$/i

export function isDgriStop(stop: BusStop): boolean {
  if (stop.atcoCode === '680000052222') return true
  const combined = `${stop.name} ${stop.street ?? ''} ${stop.landmark ?? ''}`.toLowerCase()
  if (combined.includes('dgri') || combined.includes('royal infirmary')) return true
  if (
    /^hospital$/i.test(stop.name.trim()) &&
    (/cargenbridge/i.test(stop.locality) || /garroch/i.test(stop.street ?? ''))
  ) {
    return true
  }
  return false
}

export function isWhitesandsStop(stop: BusStop): boolean {
  if (/^68000000150[2-6]$/.test(stop.atcoCode)) return true
  const combined = `${stop.name} ${stop.street ?? ''} ${stop.landmark ?? ''}`.toLowerCase()
  return combined.includes('whitesands')
}

export function formatStopDisplayName(stop: BusStop): string {
  if (isDgriStop(stop)) {
    return 'DGRI (Dumfries & Galloway Royal Infirmary)'
  }

  const name = stop.name.trim()
  const street = (stop.street ?? '').trim()
  const landmark = (stop.landmark ?? '').trim()

  if (street && !name.toLowerCase().includes(street.toLowerCase())) {
    if (GENERIC_COMMON_NAME_RE.test(name) || isWhitesandsStop(stop)) {
      return `${street} — ${name}`
    }
  }

  if (!street && isWhitesandsStop(stop) && !name.toLowerCase().includes('whitesands')) {
    return `Whitesands — ${name}`
  }

  if (landmark && GENERIC_COMMON_NAME_RE.test(name) && !name.toLowerCase().includes(landmark.toLowerCase())) {
    return `${landmark} — ${name}`
  }

  return name
}

export function formatStopLabel(stop: BusStop): string {
  const display = formatStopDisplayName(stop)
  const ind = formatIndicator(stop.indicator)
  if (!ind) return display
  return `${display} (${ind})`
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
 * Includes smart D&G landmark hubs (Whitesands All Stances, DGRI Hospital) and indexes NaPTAN Street.
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
      searchKey: `${loc.toLowerCase()} ${locStops.map((s) => `${s.name} ${s.street ?? ''}`.toLowerCase()).join(' ')}`,
    })
  }
  localities.sort((a, b) => {
    const aDg = a.stopIds.some((id) => id.startsWith('680')) ? 1 : 0
    const bDg = b.stopIds.some((id) => id.startsWith('680')) ? 1 : 0
    if (aDg !== bDg) return bDg - aDg
    return b.stopIds.length - a.stopIds.length || a.label.localeCompare(b.label)
  })

  const activeStops = stops.filter((s) => servedStopIds.size === 0 || servedStopIds.has(s.atcoCode))

  const stopOptions: PlaceOption[] = []

  // Grouped landmark hub: Whitesands (All Stances) in Dumfries
  const whitesandsStops = activeStops.filter((s) => isWhitesandsStop(s))
  if (whitesandsStops.length >= 2) {
    const coords = whitesandsStops.filter((s) => s.lat !== null && s.lng !== null)
    stopOptions.push({
      id: 'hub:whitesands',
      kind: 'stop',
      label: 'Whitesands (All Stances)',
      sublabel: `Dumfries town centre · ${whitesandsStops.length} bus stances`,
      stopIds: whitesandsStops.map((s) => s.atcoCode),
      lat: coords.length ? coords.reduce((acc, s) => acc + (s.lat ?? 0), 0) / coords.length : null,
      lng: coords.length ? coords.reduce((acc, s) => acc + (s.lng ?? 0), 0) / coords.length : null,
      searchKey: 'whitesands dumfries bus station stances town centre',
    })
  }

  for (const s of activeStops) {
    const displayName = formatStopDisplayName(s)
    const ind = formatIndicator(s.indicator)
    const streetExtra =
      s.street && !displayName.toLowerCase().includes(s.street.toLowerCase()) ? s.street : ''
    const parts = [s.locality, streetExtra, ind].filter(Boolean)

    const aliases: string[] = []
    if (isDgriStop(s)) {
      aliases.push('dgri', 'dumfries royal infirmary', 'hospital', 'infirmary', 'dumfries hospital')
    } else if (/hospital/i.test(s.name)) {
      aliases.push('dgri', 'infirmary', 'hospital')
    }
    if (isWhitesandsStop(s)) {
      aliases.push('whitesands', 'dumfries bus station')
    }

    stopOptions.push({
      id: `stop:${s.atcoCode}`,
      kind: 'stop',
      label: displayName,
      sublabel: parts.join(' · ') || s.atcoCode,
      stopIds: [s.atcoCode],
      lat: s.lat,
      lng: s.lng,
      searchKey: [
        displayName,
        s.name,
        s.street ?? '',
        s.landmark ?? '',
        s.locality,
        s.indicator,
        s.atcoCode,
        ...aliases,
      ]
        .join(' ')
        .toLowerCase(),
    })
  }

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
    if (labelLower === q) return 110
    if (labelLower.startsWith(q)) return 95
    if (opt.id === 'hub:whitesands' && q.includes('white')) return 98
    if (tokens.every((t) => labelLower.includes(t))) return 80
    if (tokens.every((t) => opt.searchKey.includes(t))) return 55
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
  const text = `${stop.name} ${stop.street ?? ''} ${stop.indicator}`.toLowerCase()
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

const MAX_TRANSFER_WALK_KM = 0.35
const MIN_TRANSFER_BUFFER_MINS = 5
const MAX_TRANSFER_WAIT_MINS = 90
const WALK_SPEED_METRES_PER_MIN = 75

export interface TransferRoutePlan {
  fromRoutes: RouteSummary[]
  toRoutes: RouteSummary[]
  routeIdsToLoad: string[]
  /** Maps leg1 alight stopId -> nearby/same leg2 board stops (walkMetres <= 350) */
  interchangeMap: Map<string, Array<{ stopId: string; walkMetres: number }>>
}

function makeFallbackStop(stopId: string, stopMap: Map<string, BusStop>): BusStop {
  return (
    stopMap.get(stopId) ?? {
      atcoCode: stopId,
      name: stopId,
      locality: '',
      indicator: '',
      lat: null,
      lng: null,
    }
  )
}

/**
 * Find candidate (Leg 1, Leg 2) routes and valid same-stop or short-walk (<=350m)
 * interchange pairs between origin and destination places.
 */
export function findTransferRouteCandidates(
  routes: RouteSummary[],
  stopMap: Map<string, BusStop>,
  from: PlaceOption,
  to: PlaceOption,
): TransferRoutePlan {
  const fromSet = new Set(from.stopIds)
  const toSet = new Set(to.stopIds)

  const rawFromRoutes = routes
    .filter((r) => r.stopIds.some((s) => fromSet.has(s)))
    .sort((a, b) => b.tripCount - a.tripCount)
    .slice(0, 18)

  const rawToRoutes = routes
    .filter((r) => r.stopIds.some((s) => toSet.has(s)))
    .sort((a, b) => b.tripCount - a.tripCount)
    .slice(0, 18)

  if (rawFromRoutes.length === 0 || rawToRoutes.length === 0) {
    return { fromRoutes: [], toRoutes: [], routeIdsToLoad: [], interchangeMap: new Map() }
  }

  // Collect all stops served by Leg 2 routes (excluding origin & destination stops)
  const toRouteStopIds = new Set<string>()
  for (const r of rawToRoutes) {
    for (const sId of r.stopIds) {
      if (!fromSet.has(sId) && !toSet.has(sId)) {
        toRouteStopIds.add(sId)
      }
    }
  }

  // Spatial grid bucket (~550m cells at 55°N) for fast <=350m walking transfer lookup
  const grid = new Map<string, BusStop[]>()
  const cellKey = (lat: number, lng: number) =>
    `${Math.floor(lat / 0.005)}:${Math.floor(lng / 0.009)}`

  for (const sId of toRouteStopIds) {
    const stop = stopMap.get(sId)
    if (stop && stop.lat !== null && stop.lng !== null) {
      const key = cellKey(stop.lat, stop.lng)
      const bucket = grid.get(key) ?? []
      bucket.push(stop)
      grid.set(key, bucket)
    }
  }

  const fromRouteStopIds = new Set<string>()
  for (const r of rawFromRoutes) {
    for (const sId of r.stopIds) {
      if (!fromSet.has(sId) && !toSet.has(sId)) {
        fromRouteStopIds.add(sId)
      }
    }
  }

  const interchangeMap = new Map<string, Array<{ stopId: string; walkMetres: number }>>()

  for (const sId of fromRouteStopIds) {
    const links: Array<{ stopId: string; walkMetres: number }> = []
    const seen = new Set<string>()

    if (toRouteStopIds.has(sId)) {
      links.push({ stopId: sId, walkMetres: 0 })
      seen.add(sId)
    }

    const stop = stopMap.get(sId)
    if (stop && stop.lat !== null && stop.lng !== null) {
      const baseLatCell = Math.floor(stop.lat / 0.005)
      const baseLngCell = Math.floor(stop.lng / 0.009)
      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
          const bucket = grid.get(`${baseLatCell + dLat}:${baseLngCell + dLng}`)
          if (!bucket) continue
          for (const cand of bucket) {
            if (seen.has(cand.atcoCode) || cand.lat === null || cand.lng === null) continue
            const km = haversineKm(stop.lat, stop.lng, cand.lat, cand.lng)
            if (km <= MAX_TRANSFER_WALK_KM) {
              links.push({
                stopId: cand.atcoCode,
                walkMetres: Math.max(10, Math.round((km * 1000) / 10) * 10),
              })
              seen.add(cand.atcoCode)
            }
          }
        }
      }
    }

    if (links.length > 0) {
      links.sort((a, b) => a.walkMetres - b.walkMetres)
      interchangeMap.set(sId, links.slice(0, 8))
    }
  }

  // Keep only routes that actually participate in at least one valid interchange
  const activeToStopTargets = new Set<string>()
  for (const list of interchangeMap.values()) {
    for (const item of list) activeToStopTargets.add(item.stopId)
  }

  const fromRoutes = rawFromRoutes.filter((r) => r.stopIds.some((s) => interchangeMap.has(s)))
  const toRoutes = rawToRoutes.filter((r) => r.stopIds.some((s) => activeToStopTargets.has(s)))

  const routeIdSet = new Set<string>()
  for (const r of fromRoutes) routeIdSet.add(r.id)
  for (const r of toRoutes) routeIdSet.add(r.id)

  return {
    fromRoutes,
    toRoutes,
    routeIdsToLoad: Array.from(routeIdSet),
    interchangeMap,
  }
}

interface Leg2DepartureEntry {
  boardMins: number
  alightMins: number
  leg: JourneyLeg
}

export function matchConnectingJourneys(params: {
  plan: TransferRoutePlan
  schedules: Map<string, RouteSchedule>
  stopMap: Map<string, BusStop>
  from: PlaceOption
  to: PlaceOption
  day: DayCode
  hideSchoolOnly: boolean
  directMatches?: JourneyMatch[]
}): ConnectingJourneyMatch[] {
  const { plan, schedules, stopMap, from, to, day, hideSchoolOnly, directMatches = [] } = params
  if (plan.fromRoutes.length === 0 || plan.toRoutes.length === 0) return []

  const fromSet = new Set(from.stopIds)
  const toSet = new Set(to.stopIds)

  const targetTransferStops = new Set<string>()
  for (const links of plan.interchangeMap.values()) {
    for (const link of links) targetTransferStops.add(link.stopId)
  }

  // 1. Pre-index all valid Leg 2 departures keyed by interchange board stopId
  const leg2ByStop = new Map<string, Leg2DepartureEntry[]>()

  for (const route of plan.toRoutes) {
    const sched = schedules.get(route.id)
    if (!sched) continue

    const directions: Array<{
      dir: 'outbound' | 'inbound'
      label: string
      trips: RouteSchedule['outbound']
    }> = [
      { dir: 'outbound', label: sched.outboundLabel, trips: sched.outbound },
      { dir: 'inbound', label: sched.inboundLabel, trips: sched.inbound },
    ]

    for (const { dir, label, trips } of directions) {
      for (const trip of trips) {
        if (!trip.days.includes(day)) continue
        if (hideSchoolOnly && trip.schoolOnly) continue

        const toIndices: number[] = []
        for (let i = 0; i < trip.stops.length; i++) {
          if (toSet.has(trip.stops[i][0])) toIndices.push(i)
        }
        if (toIndices.length === 0) continue

        const latestTo = toIndices[toIndices.length - 1]
        for (let i = 0; i < latestTo; i++) {
          const [boardStopId, boardTime] = trip.stops[i]
          if (!targetTransferStops.has(boardStopId)) continue

          const validToAfter = toIndices.filter((idx) => idx > i)
          if (validToAfter.length === 0) continue

          const alightIndex =
            to.kind === 'stop'
              ? validToAfter[0]
              : pickBestIndex(validToAfter, trip.stops, stopMap, true)

          const [alightStopId, alightTime] = trip.stops[alightIndex]
          const boardMins = parseTimeToMinutes(boardTime)
          let alightMins = parseTimeToMinutes(alightTime)
          if (alightMins < boardMins) alightMins += 1440

          const leg: JourneyLeg = {
            route,
            direction: dir,
            directionLabel: label,
            trip,
            boardStop: makeFallbackStop(boardStopId, stopMap),
            boardTime,
            boardIndex: i,
            alightStop: makeFallbackStop(alightStopId, stopMap),
            alightTime,
            alightIndex,
            durationMins: alightMins - boardMins,
            stopsBetween: Math.max(0, alightIndex - i - 1),
            fromIndices: [i],
            toIndices: validToAfter,
          }

          const arr = leg2ByStop.get(boardStopId) ?? []
          arr.push({ boardMins, alightMins, leg })
          leg2ByStop.set(boardStopId, arr)
        }
      }
    }
  }

  for (const list of leg2ByStop.values()) {
    list.sort((a, b) => a.boardMins - b.boardMins || a.alightMins - b.alightMins)
  }

  // 2. Scan Leg 1 trips and find best connecting Leg 2 for each Leg 1 departure
  const bestByLeg1Trip = new Map<string, ConnectingJourneyMatch>()

  for (const route of plan.fromRoutes) {
    const sched = schedules.get(route.id)
    if (!sched) continue

    const directions: Array<{
      dir: 'outbound' | 'inbound'
      label: string
      trips: RouteSchedule['outbound']
    }> = [
      { dir: 'outbound', label: sched.outboundLabel, trips: sched.outbound },
      { dir: 'inbound', label: sched.inboundLabel, trips: sched.inbound },
    ]

    for (const { dir, label, trips } of directions) {
      for (const trip of trips) {
        if (!trip.days.includes(day)) continue
        if (hideSchoolOnly && trip.schoolOnly) continue

        const fromIndices: number[] = []
        for (let i = 0; i < trip.stops.length; i++) {
          if (fromSet.has(trip.stops[i][0])) fromIndices.push(i)
        }
        if (fromIndices.length === 0) continue

        const boardIndex =
          from.kind === 'stop'
            ? fromIndices[0]
            : pickBestIndex(fromIndices, trip.stops, stopMap, true)

        const [boardStopId, boardTime] = trip.stops[boardIndex]
        const leg1BoardMins = parseTimeToMinutes(boardTime)
        const leg1GroupKey = `${route.id}:${dir}:${trip.id}:${boardIndex}`

        for (let alightIdx = boardIndex + 1; alightIdx < trip.stops.length; alightIdx++) {
          const [alightStopId, alightTime] = trip.stops[alightIdx]
          const transferLinks = plan.interchangeMap.get(alightStopId)
          if (!transferLinks) continue

          let leg1AlightMins = parseTimeToMinutes(alightTime)
          if (leg1AlightMins < leg1BoardMins) leg1AlightMins += 1440

          for (const link of transferLinks) {
            const candidates = leg2ByStop.get(link.stopId)
            if (!candidates || candidates.length === 0) continue

            const walkMins =
              link.walkMetres === 0
                ? 0
                : Math.max(1, Math.ceil(link.walkMetres / WALK_SPEED_METRES_PER_MIN))
            const minDep = leg1AlightMins + walkMins + MIN_TRANSFER_BUFFER_MINS
            const maxDep = leg1AlightMins + MAX_TRANSFER_WAIT_MINS

            // Binary search for first Leg 2 departure >= minDep
            let lo = 0
            let hi = candidates.length
            while (lo < hi) {
              const mid = (lo + hi) >> 1
              if (candidates[mid].boardMins < minDep) lo = mid + 1
              else hi = mid
            }

            for (let k = lo; k < candidates.length; k++) {
              const cand = candidates[k]
              if (cand.boardMins > maxDep) break
              if (cand.leg.route.id === route.id) continue

              const totalDurationMins = cand.alightMins - leg1BoardMins
              if (totalDurationMins <= 0 || totalDurationMins > 300) continue

              const existing = bestByLeg1Trip.get(leg1GroupKey)
              const existingArr = existing
                ? parseTimeToMinutes(existing.leg1.boardTime) + existing.totalDurationMins
                : Infinity

              const candAlightStop = makeFallbackStop(alightStopId, stopMap)
              const candHubScore = isHubStop(candAlightStop) ? 1 : 0
              const existingHubScore = existing && isHubStop(existing.leg1.alightStop) ? 1 : 0

              const isBetter =
                !existing ||
                cand.alightMins < existingArr ||
                (cand.alightMins === existingArr && candHubScore > existingHubScore) ||
                (cand.alightMins === existingArr &&
                  candHubScore === existingHubScore &&
                  link.walkMetres < existing.walkMetres) ||
                (cand.alightMins === existingArr &&
                  candHubScore === existingHubScore &&
                  link.walkMetres === existing.walkMetres &&
                  cand.boardMins - leg1AlightMins < existing.waitMins)

              if (isBetter) {
                const alightStop = candAlightStop
                const leg1: JourneyLeg = {
                  route,
                  direction: dir,
                  directionLabel: label,
                  trip,
                  boardStop: makeFallbackStop(boardStopId, stopMap),
                  boardTime,
                  boardIndex,
                  alightStop,
                  alightTime,
                  alightIndex: alightIdx,
                  durationMins: leg1AlightMins - leg1BoardMins,
                  stopsBetween: Math.max(0, alightIdx - boardIndex - 1),
                  fromIndices,
                  toIndices: [alightIdx],
                }

                const changeAtLabel =
                  alightStop.locality || formatStopDisplayName(alightStop)

                bestByLeg1Trip.set(leg1GroupKey, {
                  key: `${leg1GroupKey}->${cand.leg.route.id}:${cand.leg.trip.id}:${cand.leg.boardIndex}`,
                  leg1,
                  leg2: cand.leg,
                  totalDurationMins,
                  waitMins: cand.boardMins - leg1AlightMins,
                  walkMetres: link.walkMetres,
                  walkMins,
                  changeAtLabel,
                })
              }
            }
          }
        }
      }
    }
  }

  // 3. Sort and prune dominated connecting journeys
  const sorted = Array.from(bestByLeg1Trip.values()).sort((a, b) => {
    const depDiff = parseTimeToMinutes(a.leg1.boardTime) - parseTimeToMinutes(b.leg1.boardTime)
    if (depDiff !== 0) return depDiff
    return a.totalDurationMins - b.totalDurationMins
  })

  // Remove options strictly dominated by a later-departing, earlier-or-equal-arriving journey
  const pruned: ConnectingJourneyMatch[] = []
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i]
    const currDep = parseTimeToMinutes(curr.leg1.boardTime)
    const currArr = currDep + curr.totalDurationMins

    let dominated = false

    // Check against other connecting journeys
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue
      const other = sorted[j]
      const otherDep = parseTimeToMinutes(other.leg1.boardTime)
      const otherArr = otherDep + other.totalDurationMins

      if (otherDep >= currDep && otherArr <= currArr) {
        if (otherDep > currDep || otherArr < currArr || other.walkMetres < curr.walkMetres) {
          dominated = true
          break
        }
      }
    }

    // Check against direct buses (never suggest a slower 1-change right beside a faster direct bus)
    if (!dominated && directMatches.length > 0) {
      for (const direct of directMatches) {
        const dDep = parseTimeToMinutes(direct.boardTime)
        const dArr = dDep + direct.durationMins
        if (dDep >= currDep - 5 && dDep <= currDep + 15 && dArr <= currArr) {
          dominated = true
          break
        }
      }
    }

    if (!dominated) {
      pruned.push(curr)
    }
  }

  return pruned
}

