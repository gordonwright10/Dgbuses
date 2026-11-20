import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { formatIndicator, formatStopDisplayName } from '../lib/transit'
import type { BusStop } from '../types/transit'

export interface MapStopPoint {
  stop: BusStop
  time?: string
  role: 'board' | 'alight' | 'segment' | 'outer' | 'change'
}

interface RouteMapProps {
  points: MapStopPoint[]
  leg2Points?: MapStopPoint[]
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
  leg2Points,
  heightClass = 'h-72 sm:h-80',
  ariaLabel = 'Interactive bus route map',
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const isTwoLeg = Boolean(leg2Points && leg2Points.length > 0)

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

    const plotLeg = (
      legPoints: MapStopPoint[],
      lineColor: string,
      drawOuter: boolean,
    ): [number, number][] => {
      const validPoints = legPoints.filter(
        (p) => typeof p.stop.lat === 'number' && typeof p.stop.lng === 'number',
      )
      if (validPoints.length === 0) return []

      const fullCoords: [number, number][] = validPoints.map((p) => [
        p.stop.lat as number,
        p.stop.lng as number,
      ])
      if (drawOuter && fullCoords.length >= 2) {
        L.polyline(fullCoords, {
          color: '#8FA3A6',
          weight: 3.5,
          opacity: 0.75,
          dashArray: '6 6',
        }).addTo(group)
      }

      const segmentCoords: [number, number][] = validPoints
        .filter((p) => p.role !== 'outer')
        .map((p) => [p.stop.lat as number, p.stop.lng as number])

      if (segmentCoords.length >= 2) {
        L.polyline(segmentCoords, {
          color: lineColor,
          weight: 5,
          opacity: 0.95,
        }).addTo(group)
      }

      for (const pt of validPoints) {
        const lat = pt.stop.lat as number
        const lng = pt.stop.lng as number

        const isBoard = pt.role === 'board'
        const isAlight = pt.role === 'alight'
        const isChange = pt.role === 'change'
        const isSegment = pt.role === 'segment'

        const marker = L.circleMarker([lat, lng], {
          radius: isBoard || isAlight || isChange ? 9 : isSegment ? 6 : 4.5,
          color: isBoard || isAlight || isChange ? '#FFFFFF' : isSegment ? lineColor : '#64797B',
          weight: isBoard || isAlight || isChange ? 3 : 2,
          fillColor: isBoard
            ? '#00838f'
            : isAlight
              ? '#95398d'
              : isChange
                ? '#D97706'
                : isSegment
                  ? '#FFFFFF'
                  : '#DDE5E6',
          fillOpacity: 1,
        })

        const roleTag = isBoard
          ? '<span style="display:inline-block;margin-bottom:4px;padding:2px 8px;border-radius:999px;background:#00838f;color:#fff;font-size:11px;font-weight:700;">Get on here</span><br/>'
          : isAlight
            ? '<span style="display:inline-block;margin-bottom:4px;padding:2px 8px;border-radius:999px;background:#95398d;color:#fff;font-size:11px;font-weight:700;">Get off here</span><br/>'
            : isChange
              ? '<span style="display:inline-block;margin-bottom:4px;padding:2px 8px;border-radius:999px;background:#D97706;color:#fff;font-size:11px;font-weight:700;">Change buses here</span><br/>'
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

      return segmentCoords.length >= 2 ? segmentCoords : fullCoords
    }

    const leg1Focus = plotLeg(points, '#00838f', !isTwoLeg)
    const leg2Focus = leg2Points ? plotLeg(leg2Points, '#95398d', false) : []

    // Draw dashed amber walk line between Leg 1 change stop and Leg 2 change stop if different coordinates
    if (leg2Points && leg2Points.length > 0 && leg1Focus.length > 0 && leg2Focus.length > 0) {
      const endLeg1 = leg1Focus[leg1Focus.length - 1]
      const startLeg2 = leg2Focus[0]
      if (endLeg1[0] !== startLeg2[0] || endLeg1[1] !== startLeg2[1]) {
        L.polyline([endLeg1, startLeg2], {
          color: '#D97706',
          weight: 4,
          dashArray: '5 6',
          opacity: 0.95,
        }).addTo(group)
      }
    }

    const allFocus = [...leg1Focus, ...leg2Focus]
    if (allFocus.length === 0) {
      map.setView(DG_CENTER, 9)
    } else if (allFocus.length === 1) {
      map.setView(allFocus[0], 14)
    } else {
      map.fitBounds(L.latLngBounds(allFocus), { padding: [36, 36], maxZoom: 15 })
    }
  }, [points, leg2Points, isTwoLeg])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#D4DFDF] bg-[#E9EFF0]">
      <div ref={containerRef} className={`w-full ${heightClass}`} role="region" aria-label={ariaLabel} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#DCE4E4] bg-white px-3.5 py-2 text-xs font-semibold text-[#455952]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white bg-[#00838f] shadow-sm ring-1 ring-[#00838f]" />
          {isTwoLeg ? 'Bus 1 / Get on' : 'Get on'}
        </span>
        {isTwoLeg && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-white bg-[#D97706] shadow-sm ring-1 ring-[#D97706]" />
            Change buses
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-white bg-[#95398d] shadow-sm ring-1 ring-[#95398d]" />
          {isTwoLeg ? 'Bus 2 / Get off' : 'Get off'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#00838f] bg-white" />
          Stops along the way
        </span>
      </div>
    </div>
  )
}
