import { Bus, MapPin, Route as RouteIcon, Search } from 'lucide-react'
import type { ActiveTab } from '../types/transit'

interface HeaderProps {
  activeTab: ActiveTab
  onSelectTab: (tab: ActiveTab) => void
  routeCount: number
}

const NAV_ITEMS: Array<{
  id: ActiveTab
  label: string
  shortLabel: string
  icon: typeof Search
}> = [
  { id: 'planner', label: 'Plan a Journey', shortLabel: 'Journey', icon: Search },
  { id: 'routes', label: 'All Routes', shortLabel: 'Routes', icon: RouteIcon },
  { id: 'map', label: 'Stops Map', shortLabel: 'Map', icon: MapPin },
]

export function Header({ activeTab, onSelectTab, routeCount }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#7B2D74] bg-[#95398d] text-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <button
          type="button"
          onClick={() => onSelectTab('planner')}
          className="flex items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-95 focus-visible:outline-white"
          aria-label="D&G Bus Finder home"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
            <Bus className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <span className="block text-lg font-extrabold tracking-tight text-white leading-tight">
              D&amp;G Bus Finder
            </span>
            <span className="block text-xs font-medium text-white/90">
              Dumfries &amp; Galloway Timetables
            </span>
          </div>
        </button>

        <nav aria-label="Main navigation" className="hidden items-center gap-1.5 sm:flex">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-white ${
                  isActive
                    ? 'bg-[#00838f] text-white shadow-sm ring-1 ring-white/30'
                    : 'text-white/95 hover:bg-white/15 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === 'routes' && routeCount > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-black/20 text-white'
                    }`}
                  >
                    {routeCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Mobile full-width high-contrast tab bar with large 48px+ tap targets */}
      <nav
        aria-label="Mobile navigation"
        className="grid grid-cols-3 border-t border-white/15 bg-[#822F7B] sm:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 py-2 text-xs font-bold transition-colors focus-visible:outline-white ${
                isActive ? 'bg-[#00838f] text-white' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.shortLabel}</span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}
