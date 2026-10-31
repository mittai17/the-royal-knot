import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** Brand hero: CSS/SVG only (arch motif + warm gradient), no external imagery. */
export function Hero({ name, weddings, inProgress, followUps }: { name: string; weddings: number; inProgress: number; followUps: number }) {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <section className="relative overflow-hidden rounded-2xl border border-line min-h-[184px] text-white" style={{ background: 'linear-gradient(105deg,#28121D 0%,#401827 55%,#6B3A44 100%)' }}>
      <svg className="absolute right-0 top-0 h-full w-[55%] opacity-[0.22]" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
        <g fill="none" stroke="#C6A46A" strokeWidth="1.2">
          {[0, 1, 2, 3].map((i) => <path key={i} d={`M${70 + i * 90} 200 V${110 - i * 6} a${28} ${28} 0 0 1 ${56} 0 V200`} />)}
          {[0, 1, 2, 3].map((i) => <path key={'b' + i} d={`M${58 + i * 90} 200 V${104 - i * 6} a${40} ${40} 0 0 1 ${80} 0 V200`} />)}
          {Array.from({ length: 14 }).map((_, i) => <circle key={'c' + i} cx={20 + i * 28} cy={24 + (i % 3) * 8} r={2.2} fill="#C6A46A" stroke="none" />)}
        </g>
      </svg>
      <div className="relative p-7 max-w-xl">
        <h2 className="font-serif text-[34px] leading-10">{greet}, {name.split(' ')[0]}.</h2>
        <p className="font-serif text-lg text-white/85 mt-1">Let’s create extraordinary celebrations.</p>
        <p className="text-sm text-white/65 mt-3">{weddings} weddings this season <span className="mx-1.5">•</span> {inProgress} in progress <span className="mx-1.5">•</span> {followUps} enquiries awaiting follow-up</p>
        <Link href="/weddings?new=1" className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-white text-burgundy-deep text-sm font-medium hover:bg-gold-soft transition-colors">Create New Wedding <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </section>
  );
}
