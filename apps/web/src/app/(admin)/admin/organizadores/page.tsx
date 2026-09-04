'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { AdminActionButton } from '@/features/admin/admin-action-button';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDate } from '@/lib/format';
import { approveOrganizer, getOrganizer, listOrganizers, reactivateOrganizer, suspendOrganizer } from '@/services/admin.service';
import type { AdminOrganizerListItem, AdminOrganizerStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminOrganizerStatus, 'success' | 'neutral' | 'accent'> = {
  APPROVED: 'success',
  PENDING: 'accent',
  SUSPENDED: 'neutral',
  REJECTED: 'neutral',
};

const STATUS_LABEL: Record<AdminOrganizerStatus, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Pendente',
  SUSPENDED: 'Suspenso',
  REJECTED: 'Rejeitado',
};

function OrganizerDetailModal({ organizerId, onClose, onChanged }: { organizerId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useAdminDetail(getOrganizer, organizerId);

  return (
    <Modal title="Detalhes do organizador" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este organizador." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.name}</p>
            <p className="text-slate-500">{detail.email}</p>
            {detail.description && <p className="mt-1 text-slate-600">{detail.description}</p>}
          </div>
          <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
          <div className="flex gap-6 text-slate-600">
            <span>{detail._count.ships} navios</span>
            <span>{detail._count.cruises} cruzeiros</span>
            <span>{detail._count.coupons} cupons</span>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Equipe</h4>
            <ul className="flex flex-col gap-2">
              {detail.userRoles.map((ur, i) => (
                <li key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="font-medium text-slate-900">{ur.user.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {ur.user.email} · {ur.role.key}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            {detail.status === 'PENDING' && (
              <AdminActionButton
                label="Aprovar organizador"
                confirmMessage={`Aprovar ${detail.name}?`}
                action={(token) => approveOrganizer(token, organizerId)}
                onDone={() => {
                  onChanged();
                  onClose();
                }}
              />
            )}
            {detail.status === 'SUSPENDED' ? (
              <AdminActionButton
                label="Reativar organizador"
                confirmMessage={`Reativar ${detail.name}?`}
                action={(token) => reactivateOrganizer(token, organizerId)}
                onDone={() => {
                  onChanged();
                  onClose();
                }}
              />
            ) : (
              detail.status !== 'REJECTED' && (
                <AdminActionButton
                  label="Suspender organizador"
                  danger
                  confirmMessage={`Suspender ${detail.name}? Isso afeta todo o time e catálogo dele.`}
                  action={(token) => suspendOrganizer(token, organizerId)}
                  onDone={() => {
                    onChanged();
                    onClose();
                  }}
                />
              )
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminOrganizersPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter, reload } = useAdminList(listOrganizers, {} as { q?: string; status?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Organizadores"
        icon={<Building2 className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Empresas que vendem cruzeiros na plataforma — aprove, suspenda ou reative o acesso delas."
      />

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className={`${filterInputClassName} w-64`}
        />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
        <select
          value={filters.status ?? ''}
          onChange={(e) => updateFilter({ status: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os status</option>
          <option value="PENDING">Pendente</option>
          <option value="APPROVED">Aprovado</option>
          <option value="SUSPENDED">Suspenso</option>
          <option value="REJECTED">Rejeitado</option>
        </select>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} onRetry={reload} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Building2 className="h-6 w-6" aria-hidden="true" />} title="Nenhum organizador encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Navios</th>
                    <th className="px-4 py-3">Cruzeiros</th>
                    <th className="px-4 py-3">Cadastrado em</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((org: AdminOrganizerListItem) => (
                    <tr key={org.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{org.name}</p>
                        <p className="text-xs text-slate-500">{org.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[org.status]}>{STATUS_LABEL[org.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">{org._count.ships}</td>
                      <td className="px-4 py-3">{org._count.cruises}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(org.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(org.id)}
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

      {selectedId && <OrganizerDetailModal organizerId={selectedId} onClose={() => setSelectedId(null)} onChanged={reload} />}
    </>
  );
}
