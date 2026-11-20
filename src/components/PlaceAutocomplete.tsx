import { Building2, LocateFixed, MapPin, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { searchPlaceOptions } from '../lib/transit'
import type { PlaceOption } from '../types/transit'

interface PlaceAutocompleteProps {
  id: string
  label: string
  placeholder: string
  value: PlaceOption | null
  onChange: (place: PlaceOption | null) => void
  localities: PlaceOption[]
  stopOptions: PlaceOption[]
  accentDotClass: string
  onUseNearMe?: () => void
  nearMeLoading?: boolean
}

export function PlaceAutocomplete({
  id,
  label,
  placeholder,
  value,
  onChange,
  localities,
  stopOptions,
  accentDotClass,
  onUseNearMe,
  nearMeLoading = false,
}: PlaceAutocompleteProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [draftText, setDraftText] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputText = draftText !== null ? draftText : (value?.label ?? '')

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
        setDraftText(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const { matchedLocalities, matchedStops } = useMemo(
    () => searchPlaceOptions(inputText, localities, stopOptions),
    [inputText, localities, stopOptions],
  )

  const flatOptions = useMemo(
    () => [...matchedLocalities, ...matchedStops],
    [matchedLocalities, matchedStops],
  )

  const selectOption = (opt: PlaceOption) => {
    onChange(opt)
    setDraftText(null)
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const handleClear = () => {
    onChange(null)
    setDraftText('')
    setIsOpen(true)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true)
      setActiveIndex(0)
      e.preventDefault()
      return
    }
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % Math.max(1, flatOptions.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev <= 0 ? flatOptions.length - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      if (flatOptions.length > 0) {
        e.preventDefault()
        const picked = activeIndex >= 0 ? flatOptions[activeIndex] : flatOptions[0]
        if (picked) selectOption(picked)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
      setDraftText(null)
    }
  }

  const activeOptionId =
    isOpen && activeIndex >= 0 && flatOptions[activeIndex]
      ? `${listboxId}-opt-${activeIndex}`
      : undefined

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-[#1A2B24]">
          {label}
        </label>
        {onUseNearMe && (
          <button
            type="button"
            onClick={onUseNearMe}
            disabled={nearMeLoading}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-[#0F5C4A] transition-colors hover:bg-[#E7F3EE] disabled:opacity-60"
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{nearMeLoading ? 'Finding stop…' : 'Use nearest stop'}</span>
          </button>
        )}
      </div>

      <div className="relative flex items-center">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-3.5 h-3 w-3 rounded-full ring-4 ${accentDotClass}`}
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          placeholder={placeholder}
          value={inputText}
          onFocus={() => {
            setIsOpen(true)
            if (value && inputText === value.label) {
              // Select text so typing immediately replaces
              inputRef.current?.select()
            }
          }}
          onChange={(e) => {
            const next = e.target.value
            setDraftText(next)
            setIsOpen(true)
            setActiveIndex(0)
            if (!next.trim() && value) {
              onChange(null)
            }
          }}
          onKeyDown={handleKeyDown}
          className="min-h-13 w-full rounded-xl border-2 border-[#CED9D3] bg-white pl-10 pr-11 py-3 text-base font-semibold text-[#111C18] placeholder:font-normal placeholder:text-[#667871] transition-colors hover:border-[#9EB5AA] focus:border-[#0F5C4A] focus:outline-none"
        />

        {(inputText || value) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear ${label}`}
            className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg text-[#546860] transition-colors hover:bg-[#EDF3F0] hover:text-[#111C18]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {value && !isOpen && (
        <p className="mt-1 text-xs font-medium text-[#455952]">{value.sublabel}</p>
      )}

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-2xl border border-[#CED9D3] bg-white p-1.5 shadow-xl"
        >
          {flatOptions.length === 0 ? (
            <div className="px-3.5 py-4 text-sm text-[#455952]">
              No towns or bus stops found for <strong className="text-[#111C18]">“{inputText}”</strong>.
              Try a town name like <em>Annan</em>, <em>Lockerbie</em>, <em>Castle Douglas</em>, or{' '}
              <em>DGRI</em>.
            </div>
          ) : (
            <>
              {matchedLocalities.length > 0 && (
                <div>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#546860]">
                    {inputText.trim() ? 'Towns & Villages' : 'Popular Towns & Villages'}
                  </div>
                  {matchedLocalities.map((opt, idx) => {
                    const isHighlighted = activeIndex === idx
                    return (
                      <button
                        key={opt.id}
                        id={`${listboxId}-opt-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={value?.id === opt.id}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectOption(opt)
                        }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                          isHighlighted ? 'bg-[#E8F4EF] text-[#0A4638]' : 'hover:bg-[#F3F7F5]'
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E4F0EB] text-[#0F5C4A]">
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#111C18]">
                            {opt.label}
                          </span>
                          <span className="block truncate text-xs font-medium text-[#455952]">
                            {opt.sublabel}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {matchedStops.length > 0 && (
                <div className={matchedLocalities.length > 0 ? 'mt-1 border-t border-[#ECF1EE] pt-1' : ''}>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#546860]">
                    {inputText.trim() ? 'Specific Bus Stops' : 'Key Stops & Landmarks'}
                  </div>
                  {matchedStops.map((opt, rawIdx) => {
                    const idx = matchedLocalities.length + rawIdx
                    const isHighlighted = activeIndex === idx
                    return (
                      <button
                        key={opt.id}
                        id={`${listboxId}-opt-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={value?.id === opt.id}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectOption(opt)
                        }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                          isHighlighted ? 'bg-[#E8F4EF] text-[#0A4638]' : 'hover:bg-[#F3F7F5]'
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF0F6] text-[#18314F]">
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#111C18]">
                            {opt.label}
                          </span>
                          <span className="block truncate text-xs font-medium text-[#455952]">
                            {opt.sublabel}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
