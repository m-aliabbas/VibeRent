"use client";

import { useId, useRef } from "react";

/**
 * Pick one of 2–5 options that are all visible at once (radio-group semantics).
 * Arrow keys move and select, like native radios.
 */
export function SegmentedControl<T extends string>({ label, value, onChange, options, hideLabel }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
  hideLabel?: boolean;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex(option => option.value === value));
  function move(step: number) {
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div>
      <span id={id} className={hideLabel ? "sr-only" : "mb-1.5 block text-sm font-semibold text-[#344054]"}>{label}</span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="inline-flex w-full flex-wrap gap-1 rounded-[10px] bg-[#F2F4F7] p-1"
        onKeyDown={event => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(1); }
          if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(-1); }
        }}
      >
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={node => { refs.current[i] = node; }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={`min-h-9 flex-1 whitespace-nowrap rounded-[8px] px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#006FE6] ${selected ? "bg-white text-[#0058B8] shadow-sm" : "text-[#475467] hover:text-[#19191F]"}`}
            >
              {option.label}
              {option.hint && <span className={`block text-xs font-normal ${selected ? "text-[#475467]" : "text-[#667085]"}`}>{option.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
