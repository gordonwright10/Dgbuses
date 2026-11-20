export type DayCode = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const DAY_CODES: DayCode[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const DAY_FULL_NAMES: Record<DayCode, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

export interface BusStop {
  atcoCode: string
  name: string
  locality: string
  indicator: string
  lat: number | null
  lng: number | null
}

export interface RouteSummary {
  id: string
  lineName: string
  operator: string
  origin: string
  destination: string
  description: string
  stopIds: string[]
  tripCount: number
  days: DayCode[]
}

export interface Trip {
  id: string
  dep: string
  arr: string
  headsign: string
  days: DayCode[]
  schoolOnly: boolean
  nonSchoolOnly: boolean
  bankHolidays: string | null
  /** Array of [atcoCode, "HH:MM"] pairs along the journey */
  stops: [string, string][]
}

export interface RouteSchedule {
  routeId: string
  lineName: string
  operator: string
  origin: string
  destination: string
  description: string
  outboundLabel: string
  inboundLabel: string
  outbound: Trip[]
  inbound: Trip[]
}

export interface DataMetadata {
  lastUpdated: string
  stopCount: number
  routeCount: number
  tripCount: number
  source?: 'live' | 'sample' | string
}

export interface PlaceOption {
  id: string
  kind: 'locality' | 'stop'
  label: string
  sublabel: string
  stopIds: string[]
  lat: number | null
  lng: number | null
  searchKey: string
}

export interface JourneyMatch {
  key: string
  route: RouteSummary
  direction: 'outbound' | 'inbound'
  directionLabel: string
  trip: Trip
  boardStop: BusStop
  boardTime: string
  boardIndex: number
  alightStop: BusStop
  alightTime: string
  alightIndex: number
  durationMins: number
  stopsBetween: number
  extraFromStops: number
  extraToStops: number
  fromIndices: number[]
  toIndices: number[]
}

export type TimeFilterMode = 'now' | 'after' | 'all'

export type ActiveTab = 'planner' | 'routes' | 'map'
