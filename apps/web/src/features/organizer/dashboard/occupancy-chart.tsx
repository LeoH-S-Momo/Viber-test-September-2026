'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardCabinCategoryOccupancy } from '@/types/organizer';

const BOOKED_COLOR = '#2a78d6'; // paleta categorica validada, slot 1 (azul) — "ocupado"
const AVAILABLE_COLOR = '#dbe0e6'; // neutro — "disponivel", nao concorre por atencao com o ocupado

interface TooltipPayloadItem {
  color: string;
  name: string;
  value: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-900">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/** Ocupacao por categoria de cabine — barra empilhada de 2 series (reservado/disponivel), 1 eixo, legenda sempre visivel (ver skill de dataviz). */
export function OccupancyChart({ data }: { data: DashboardCabinCategoryOccupancy[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500">
        Nenhuma categoria de cabine para mostrar ainda.
      </div>
    );
  }

  const chartData = data.map((category) => ({
    categoryName: category.categoryName,
    Reservado: category.booked,
    Disponível: Math.max(0, category.totalCabins - category.booked),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="categoryName" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Reservado" stackId="occ" fill={BOOKED_COLOR} radius={[0, 0, 0, 0]} maxBarSize={56} />
          <Bar dataKey="Disponível" stackId="occ" fill={AVAILABLE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
