'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface TopListItem {
  label: string;
  reservations: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TopListItem }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="max-w-[16rem] font-semibold text-slate-900">{item.label}</p>
      <p className="text-slate-600">
        {item.reservations} pessoa{item.reservations === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/** Ranking horizontal — uma serie so (contagem), rotulo direto no eixo faz identidade, cor uniforme so marca magnitude (ver skill de dataviz). */
export function TopListChart({ items, color, emptyMessage }: { items: TopListItem[]; color: string; emptyMessage: string }) {
  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  const truncated = items.map((item) => ({
    ...item,
    shortLabel: item.label.length > 28 ? `${item.label.slice(0, 27)}…` : item.label,
  }));

  return (
    <div style={{ height: Math.max(160, items.length * 44) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={truncated} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="shortLabel"
            width={150}
            tick={{ fontSize: 12, fill: '#334155' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="reservations" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
