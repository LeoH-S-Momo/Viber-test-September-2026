'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatDayMonth, formatPrice } from '@/lib/format';
import { getDashboard, getMyCruises } from '@/services/organizers.service';
import { DashboardFilters, periodDaysToRange, type DashboardFiltersValue } from '@/features/organizer/dashboard-filters';
import type { CruiseSummary } from '@/types/cruise';
import type { OrganizerDashboard } from '@/types/organizer';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; dashboard: OrganizerDashboard };

function ReportTable({
  title,
  columns,
  rows,
  emptyMessage,
}: {
  title: string;
  columns: string[];
  rows: Array<(string | number)[]>;
  emptyMessage: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-display font-bold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportsContent() {
  const { accessToken } = useAuth();
  const [cruises, setCruises] = useState<CruiseSummary[]>([]);
  const [filters, setFilters] = useState<DashboardFiltersValue>({ cruiseId: '', periodDays: 90 });
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    getMyCruises(accessToken).then((result) => {
      if (result.ok) setCruises(result.data.data);
    });
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setState({ status: 'loading' });
    const range = periodDaysToRange(filters.periodDays);
    const result = await getDashboard(accessToken, { cruiseId: filters.cruiseId || undefined, ...range });
    setState(result.ok ? { status: 'ready', dashboard: result.data } : { status: 'error', message: result.message });
  }, [accessToken, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Análise"
        title="Relatórios"
        icon={<FileBarChart className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="O mesmo período do dashboard, em tabelas detalhadas — pronto para conferir linha a linha."
      />

      <DashboardFilters cruises={cruises} value={filters} onChange={setFilters} />

      {state.status === 'loading' && <Skeleton className="h-96 w-full rounded-2xl" />}
      {state.status === 'error' && <ErrorState message={state.message} />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-6">
          <ReportTable
            title="Vendas por dia"
            columns={['Data', 'Receita', 'Reservas confirmadas']}
            rows={state.dashboard.salesByPeriod.map((point) => [formatDayMonth(point.date), formatPrice(point.revenue), point.bookings])}
            emptyMessage="Nenhuma venda confirmada no período."
          />
          <ReportTable
            title="Ocupação por categoria de cabine"
            columns={['Categoria', 'Reservadas', 'Total', 'Ocupação']}
            rows={state.dashboard.occupancyByCabinCategory.map((c) => [c.categoryName, c.booked, c.totalCabins, `${c.occupancyPercent}%`])}
            emptyMessage="Nenhuma categoria de cabine para mostrar."
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ReportTable
              title="Eventos mais procurados"
              columns={['Evento', 'Pessoas']}
              rows={state.dashboard.topEvents.map((e) => [e.title, e.reservations])}
              emptyMessage="Nenhuma reserva de evento no período."
            />
            <ReportTable
              title="Experiências mais procuradas"
              columns={['Experiência', 'Pessoas']}
              rows={state.dashboard.topExperiences.map((e) => [e.title, e.reservations])}
              emptyMessage="Nenhuma experiência selecionada no período."
            />
          </div>
        </div>
      )}
    </>
  );
}

export default function OrganizerReportsPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <ReportsContent />
    </RequireRole>
  );
}
