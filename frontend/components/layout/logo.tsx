export function LotusMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="#C6A46A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M24 8c4 5 6 10 0 18-6-8-4-13 0-18Z" />
      <path d="M24 26C16 24 11 19 10 13c7 0 12 4 14 13Z" />
      <path d="M24 26c8-2 13-7 14-13-7 0-12 4-14 13Z" />
      <path d="M24 28c-7 1-13-1-17-6 1 9 8 15 17 14 9 1 16-5 17-14-4 5-10 7-17 6Z" />
    </svg>
  );
}
