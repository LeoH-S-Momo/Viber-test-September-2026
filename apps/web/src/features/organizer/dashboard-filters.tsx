'use client';

import type { CruiseSummary } from '@/types/cruise';

const inputClassName =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

const PERIOD_PRESETS: Array<{ label: string; days: number | null }> = [
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: '12 meses', days: 365 },
  { label: 'Tudo', days: null },
];

export interface DashboardFiltersValue {
  cruiseId: string;
  periodDays: number | null;
}

/** Filtro por cruzeiro + periodo, compartilhado entre Dashboard/Reservas/Passageiros/Relatorios (ver ADR-0016). */
export function DashboardFilters({
  cruises,
  value,
  onChange,
}: {
  cruises: CruiseSummary[];
  value: DashboardFiltersValue;
  onChange: (next: DashboardFiltersValue) => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1.5 sm:min-w-[16rem]">
        <label htmlFor="filter-cruise" className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Cruzeiro
        </label>
        <select
          id="filter-cruise"
          value={value.cruiseId}
          onChange={(e) => onChange({ ...value, cruiseId: e.target.value })}
          className={inputClassName}
        >
          <option value="">Todos os cruzeiros</option>
          {cruises.map((cruise) => (
            <option key={cruise.id} value={cruise.id}>
              {cruise.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Período</span>
        <div className="flex gap-1.5">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ ...value, periodDays: preset.days })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                value.periodDays === preset.days ? 'bg-brand-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function periodDaysToRange(periodDays: number | null): { from?: string; to?: string } {
  if (periodDays === null) return {};
  const to = new Date();
  const from = new Date(to.getTime() - periodDays * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}
