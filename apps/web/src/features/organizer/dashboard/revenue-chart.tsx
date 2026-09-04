'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayMonth, formatPrice } from '@/lib/format';
import type { DashboardSalesPoint } from '@/types/organizer';

const SERIES_COLOR = '#2a78d6'; // paleta categorica validada da skill de dataviz, slot 1 (azul)

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DashboardSalesPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{formatDayMonth(point.date)}</p>
      <p className="text-slate-600">{formatPrice(point.revenue)}</p>
      <p className="text-slate-500">
        {point.bookings} reserva{point.bookings === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/** Vendas por periodo — um eixo so (receita); reservas do mesmo dia vao no tooltip, nunca um segundo eixo (ver skill de dataviz). */
export function RevenueChart({ data }: { data: DashboardSalesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500">
        Nenhuma venda confirmada no período selecionado.
      </div>
    );
  }

  const chartData = data.map((point) => ({ ...point, revenueValue: Number(point.revenue) }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatDayMonth(value)}
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatPrice(value)}
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="revenueValue" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
