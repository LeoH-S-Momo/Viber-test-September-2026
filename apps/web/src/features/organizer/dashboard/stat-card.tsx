import type { ComponentType } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
  tone?: 'default' | 'warning';
}

/** Card de metrica do dashboard — numero grande, rotulo, icone (ver skill de dataviz: "e um numero, nao um grafico"). */
export function StatCard({ label, value, icon: Icon, hint, tone = 'default' }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            tone === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
