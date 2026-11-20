import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { formatIndicator, formatStopDisplayName } from '../lib/transit'
import type { BusStop } from '../types/transit'

export interface MapStopPoint {
  stop: BusStop
  time?: string
  role: 'board' | 'alight' | 'segment' | 'outer'
}

interface RouteMapProps {
  points: MapStopPoint[]
  heightClass?: string
  ariaLabel?: string
}

const DG_CENTER: [number, number] = [55.069, -3.613]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function RouteMap({
  points,
  heightClass = 'h-72 sm:h-80',
  ariaLabel = 'Interactive bus route map',
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: DG_CENTER,
      zoom: 10,
      scrollWheelZoom: false,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    layerGroupRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      layerGroupRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const group = layerGroupRef.current
    if (!map || !group) return

    group.clearLayers()

    const validPoints = points.filter(
      (p) => typeof p.stop.lat === 'number' && typeof p.stop.lng === 'number',
    )

    if (validPoints.length === 0) {
      map.setView(DG_CENTER, 9)
      return
    }

    // Draw outer route path (subtle dashed slate)
    const fullCoords: [number, number][] = validPoints.map((p) => [
      p.stop.lat as number,
      p.stop.lng as number,
    ])
    if (fullCoords.length >= 2) {
      L.polyline(fullCoords, {
        color: '#8FA3A6',
        weight: 3.5,
        opacity: 0.75,
        dashArray: '6 6',
      }).addTo(group)
    }

    // Draw active journey segment (bold teal solid line)
    const segmentCoords: [number, number][] = validPoints
      .filter((p) => p.role === 'board' || p.role === 'segment' || p.role === 'alight')
      .map((p) => [p.stop.lat as number, p.stop.lng as number])

    if (segmentCoords.length >= 2) {
      L.polyline(segmentCoords, {
        color: '#00838f',
        weight: 5,
        opacity: 0.95,
      }).addTo(group)
    }

    // Plot stop markers
    for (const pt of validPoints) {
      const lat = pt.stop.lat as number
      const lng = pt.stop.lng as number

      const isBoard = pt.role === 'board'
      const isAlight = pt.role === 'alight'
      const isSegment = pt.role === 'segment'

      const marker = L.circleMarker([lat, lng], {
        radius: isBoard || isAlight ? 9 : isSegment ? 6 : 4.5,
        color: isBoard ? '#FFFFFF' : isAlight ? '#FFFFFF' : isSegment ? '#00838f' : '#64797B',
        weight: isBoard || isAlight ? 3 : 2,
        fillColor: isBoard ? '#00838f' : isAlight ? '#95398d' : isSegment ? '#FFFFFF' : '#DDE5E6',
        fillOpacity: 1,
      })

      const roleTag = isBoard
        ? '<span style="display:inline-block;margin-bottom:4px;padding:2px 8px;border-radius:999px;background:#00838f;color:#fff;font-size:11px;font-weight:700;">Get on here</span><br/>'
        : isAlight
          ? '<span style="display:inline-block;margin-bottom:4px;padding:2px 8px;border-radius:999px;background:#95398d;color:#fff;font-size:11px;font-weight:700;">Get off here</span><br/>'
          : ''

      const displayName = formatStopDisplayName(pt.stop)
      const ind = formatIndicator(pt.stop.indicator)
      const timeHtml = pt.time
        ? `<div style="margin-top:4px;font-weight:800;color:#006B75;font-size:13px;">Bus time: ${escapeHtml(pt.time)}</div>`
        : ''

      marker.bindPopup(
        `${roleTag}<div style="font-weight:700;font-size:14px;">${escapeHtml(displayName)}</div>` +
          (ind ? `<div style="font-size:12px;color:#455952;">${escapeHtml(ind)}</div>` : '') +
          (pt.stop.locality
            ? `<div style="font-size:12px;color:#546860;">${escapeHtml(pt.stop.locality)}</div>`
            : '') +
          timeHtml,
      )
      marker.addTo(group)
    }

    const focusCoords = segmentCoords.length >= 2 ? segmentCoords : fullCoords
    if (focusCoords.length === 1) {
      map.setView(focusCoords[0], 14)
    } else {
      map.fitBounds(L.latLngBounds(focusCoords), { padding: [36, 36], maxZoom: 15 })
    }
  }, [points])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#D4DFDF] bg-[#E9EFF0]">
      <div ref={containerRef} className={`w-full ${heightClass}`} role="region" aria-label={ariaLabel} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#DCE4E4] bg-white px-3.5 py-2 text-xs font-semibold text-[#455952]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white bg-[#00838f] shadow-sm ring-1 ring-[#00838f]" />
          Get on
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white bg-[#95398d] shadow-sm ring-1 ring-[#95398d]" />
          Get off
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#00838f] bg-white" />
          Stops along the way
        </span>
      </div>
    </div>
  )
}
