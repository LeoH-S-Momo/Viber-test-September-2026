'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatPrice } from '@/lib/format';
import { getExperience, listExperiences } from '@/services/admin.service';
import type { AdminExperienceListItem } from '@/types/admin';

function ExperienceDetailModal({ experienceId, onClose }: { experienceId: string; onClose: () => void }) {
  const detail = useAdminDetail(getExperience, experienceId);

  return (
    <Modal title="Detalhes da experiência" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar esta experiência." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.title}</p>
            <p className="text-slate-500">
              {detail.cruise.title} · {detail.cruise.organizer.name}
            </p>
            {detail.description && <p className="mt-1 text-slate-600">{detail.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail.category && <Badge tone="brand">{detail.category}</Badge>}
            <Badge tone={detail.isIncluded ? 'success' : 'accent'}>{detail.isIncluded ? 'Incluso na tarifa' : 'Pago à parte'}</Badge>
          </div>
          {detail.price && <p className="text-slate-600">Preço: {formatPrice(detail.price)}</p>}
          {detail.capacity !== null && <p className="text-slate-600">Capacidade: {detail.capacity}</p>}
          {detail.durationMinutes && <p className="text-slate-600">Duração: {detail.durationMinutes} min</p>}
        </div>
      )}
    </Modal>
  );
}

export default function AdminExperiencesPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, updateFilter } = useAdminList(listExperiences, {} as { q?: string; cruiseId?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Experiências"
        icon={<Sparkles className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todas as experiências e passeios cadastrados nos cruzeiros da plataforma."
      />

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título…" className={`${filterInputClassName} w-64`} />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Sparkles className="h-6 w-6" aria-hidden="true" />} title="Nenhuma experiência encontrada" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Cruzeiro</th>
                    <th className="px-4 py-3">Preço</th>
                    <th className="px-4 py-3">Reservas</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((experience: AdminExperienceListItem) => (
                    <tr key={experience.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{experience.title}</td>
                      <td className="px-4 py-3">{experience.cruise.title}</td>
                      <td className="px-4 py-3">{experience.price ? formatPrice(experience.price) : 'Incluso'}</td>
                      <td className="px-4 py-3">{experience._count.bookings}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(experience.id)}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AdminPagination meta={state.result.data.meta} page={page} setPage={setPage} />
        </>
      )}

      {selectedId && <ExperienceDetailModal experienceId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
