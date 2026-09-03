import Link from 'next/link';
import { Waves } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-brand-900">
            <Waves className="h-5 w-5 text-brand-600" aria-hidden="true" />
            SeaPass
          </div>
          <p className="max-w-md text-sm text-slate-500">
            Plataforma de comercialização e gestão de cruzeiros temáticos — descubra experiências
            no mar organizadas por produtoras independentes.
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-4 border-t border-slate-100 pt-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SeaPass. Projeto de demonstração.</p>
          <Link href="/cruzeiros" className="text-slate-500 underline-offset-4 hover:underline">
            Explorar cruzeiros
          </Link>
        </div>
      </div>
    </footer>
  );
}
