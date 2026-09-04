'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarX, LayoutDashboard, PercentCircle, Receipt, TicketCheck, Users2, Wallet } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import { getDashboard, getMyCruises } from '@/services/organizers.service';
import { DashboardFilters, periodDaysToRange, type DashboardFiltersValue } from '@/features/organizer/dashboard-filters';
import { StatCard } from '@/features/organizer/dashboard/stat-card';
import { RevenueChart } from '@/features/organizer/dashboard/revenue-chart';
import { OccupancyChart } from '@/features/organizer/dashboard/occupancy-chart';
import { TopListChart } from '@/features/organizer/dashboard/top-list-chart';
import type { CruiseSummary } from '@/types/cruise';
import type { OrganizerDashboard } from '@/types/organizer';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; dashboard: OrganizerDashboard };

function DashboardContent() {
  const { accessToken } = useAuth();
  const [cruises, setCruises] = useState<CruiseSummary[]>([]);
  const [filters, setFilters] = useState<DashboardFiltersValue>({ cruiseId: '', periodDays: 90 });
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      const result = await getMyCruises(accessToken, { page: '1' });
      if (!cancelled && result.ok) setCruises(result.data.data);
    })();
    return () => {
      cancelled = true;
    };
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
        eyebrow="Painel"
        title="Dashboard"
        icon={<LayoutDashboard className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Visão geral do desempenho comercial dos seus cruzeiros."
      />

      <DashboardFilters cruises={cruises} value={filters} onChange={setFilters} />

      {state.status === 'loading' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {state.status === 'error' && <ErrorState message={state.message} />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Receita" value={formatPrice(state.dashboard.revenue)} icon={Wallet} />
            <StatCard label="Reservas" value={String(state.dashboard.bookingsCount)} icon={Receipt} hint={`${state.dashboard.confirmedBookingsCount} confirmadas`} />
            <StatCard label="Ocupação" value={`${state.dashboard.occupancyPercent}%`} icon={PercentCircle} />
            <StatCard label="Passageiros" value={String(state.dashboard.passengersCount)} icon={Users2} />
            <StatCard label="Ticket médio" value={formatPrice(state.dashboard.averageTicket)} icon={TicketCheck} />
            <StatCard label="Cancelamentos" value={String(state.dashboard.cancellations)} icon={CalendarX} tone={state.dashboard.cancellations > 0 ? 'warning' : 'default'} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-display font-bold text-slate-900">Vendas por período</h3>
              <RevenueChart data={state.dashboard.salesByPeriod} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-display font-bold text-slate-900">Ocupação por categoria de cabine</h3>
              <OccupancyChart data={state.dashboard.occupancyByCabinCategory} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-display font-bold text-slate-900">Eventos mais procurados</h3>
              <TopListChart
                items={state.dashboard.topEvents.map((e) => ({ label: e.title, reservations: e.reservations }))}
                color="#eb6834"
                emptyMessage="Nenhuma reserva de evento no período."
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-display font-bold text-slate-900">Experiências mais procuradas</h3>
              <TopListChart
                items={state.dashboard.topExperiences.map((e) => ({ label: e.title, reservations: e.reservations }))}
                color="#1baf7a"
                emptyMessage="Nenhuma experiência selecionada no período."
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function OrganizerDashboardPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <DashboardContent />
    </RequireRole>
  );
}
