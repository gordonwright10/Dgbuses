import { CheckCircle2, Info } from 'lucide-react'
import type { DataMetadata } from '../types/transit'

interface FooterProps {
  metadata: DataMetadata | null
}

function formatUpdatedDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function Footer({ metadata }: FooterProps) {
  const isSample = metadata?.source === 'sample'

  return (
    <footer className="mt-12 border-t border-[#DCE4DF] bg-white">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
        {metadata && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F4F8F6] px-4 py-3 text-xs font-semibold text-[#2E423B]">
            <div className="flex items-center gap-2">
              {isSample ? (
                <Info className="h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F5C4A]" aria-hidden="true" />
              )}
              <span>
                {isSample
                  ? 'Preview dataset loaded (automatically replaced nightly with live Traveline TNDS & NaPTAN data via GitHub Actions).'
                  : `Timetables updated ${formatUpdatedDate(metadata.lastUpdated)}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 tabular-nums text-[#455952]">
              <span>{metadata.routeCount.toLocaleString()} routes</span>
              <span>·</span>
              <span>{metadata.stopCount.toLocaleString()} bus stops</span>
              <span>·</span>
              <span>{metadata.tripCount.toLocaleString()} daily trips</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 text-xs leading-relaxed text-[#4E625B] sm:flex-row sm:items-center sm:justify-between">
          <p>
            Scheduled timetable data sourced from the{' '}
            <strong className="font-semibold text-[#1E302A]">Traveline National Dataset (TNDS)</strong>{' '}
            and <strong className="font-semibold text-[#1E302A]">DfT NaPTAN</strong>. Please arrive at your stop
            5 minutes early and check operator updates on public holidays or during severe weather.
          </p>
          <p className="shrink-0 font-semibold text-[#334740]">
            D&amp;G Bus Finder · Open Data
          </p>
        </div>
      </div>
    </footer>
  )
}
