'use client';
import { humanize } from '@/lib/utils';

export function Select({ value, onChange, options, placeholder, className = '', id }: {
  value: string; onChange: (v: string) => void; options: readonly (string | { v: string; l: string })[]; placeholder?: string; className?: string; id?: string;
}) {
  return (
    <select id={id} className={`input pr-8 ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => { const v = typeof o === 'string' ? o : o.v; const l = typeof o === 'string' ? humanize(o) : o.l; return <option key={v} value={v}>{l}</option>; })}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input w-64 max-w-full" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />;
}

/** Tabs rendered as a pill group; used for stage filters and view switchers. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly { v: T; l: string }[] }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-2 p-1" role="tablist">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          className={`px-3 h-8 rounded-md text-xs font-medium transition-colors ${value === o.v ? 'bg-white text-burgundy shadow-card' : 'text-ink-soft hover:text-ink'}`}>{o.l}</button>
      ))}
    </div>
  );
}
