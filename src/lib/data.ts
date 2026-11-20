import type { BusStop, DataMetadata, RouteSchedule, RouteSummary } from '../types/transit'

const scheduleCache = new Map<string, Promise<RouteSchedule | null>>()

function dataUrl(relativePath: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const cleanBase = base.endsWith('/') ? base : `${base}/`
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
  return `${cleanBase}${cleanPath}`
}

async function fetchJson<T>(relativePath: string): Promise<T> {
  const res = await fetch(dataUrl(relativePath))
  if (!res.ok) {
    throw new Error(`Failed to load ${relativePath} (HTTP ${res.status})`)
  }
  return (await res.json()) as T
}

export interface CoreTransitData {
  stops: BusStop[]
  stopMap: Map<string, BusStop>
  routes: RouteSummary[]
  metadata: DataMetadata
}

export async function loadCoreTransitData(): Promise<CoreTransitData> {
  const [stops, routes, metadata] = await Promise.all([
    fetchJson<BusStop[]>('data/stops.json'),
    fetchJson<RouteSummary[]>('data/routes.json'),
    fetchJson<DataMetadata>('data/metadata.json'),
  ])

  const stopMap = new Map<string, BusStop>()
  for (const stop of stops) {
    stopMap.set(stop.atcoCode, stop)
  }

  return { stops, stopMap, routes, metadata }
}

export function loadRouteSchedule(routeId: string): Promise<RouteSchedule | null> {
  const cached = scheduleCache.get(routeId)
  if (cached) return cached

  const promise = fetchJson<RouteSchedule>(`data/schedules/${encodeURIComponent(routeId)}.json`).catch(
    (err) => {
      console.error(`Could not load schedule for ${routeId}:`, err)
      scheduleCache.delete(routeId)
      return null
    },
  )
  scheduleCache.set(routeId, promise)
  return promise
}

export async function loadRouteSchedules(routeIds: string[]): Promise<Map<string, RouteSchedule>> {
  const results = await Promise.all(
    routeIds.map(async (id) => {
      const sched = await loadRouteSchedule(id)
      return [id, sched] as const
    }),
  )
  const map = new Map<string, RouteSchedule>()
  for (const [id, sched] of results) {
    if (sched) map.set(id, sched)
  }
  return map
}
