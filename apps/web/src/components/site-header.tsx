import Link from 'next/link';
import { Compass, Waves } from 'lucide-react';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-brand-900"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
            <Waves className="h-5 w-5" aria-hidden="true" />
          </span>
          SeaPass
        </Link>

        <nav aria-label="Navegação principal" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/cruzeiros"
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            Explorar cruzeiros
          </Link>
        </nav>
      </div>
    </header>
  );
}
