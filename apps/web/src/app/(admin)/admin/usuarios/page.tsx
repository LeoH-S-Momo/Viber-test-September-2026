'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
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
import { getUser, listUsers, reactivateUser, suspendUser } from '@/services/admin.service';
import type { AdminUserListItem, AdminUserStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminUserStatus, 'success' | 'neutral' | 'accent'> = {
  ACTIVE: 'success',
  SUSPENDED: 'neutral',
  PENDING_VERIFICATION: 'accent',
};

const STATUS_LABEL: Record<AdminUserStatus, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  PENDING_VERIFICATION: 'Verificação pendente',
};

function UserDetailModal({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useAdminDetail(getUser, userId);

  return (
    <Modal title="Detalhes do usuário" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este usuário." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.fullName}</p>
            <p className="text-slate-500">{detail.email}</p>
            {detail.phone && <p className="text-slate-500">{detail.phone}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
            {detail.roles.map((r, i) => (
              <Badge key={i} tone="brand">
                {r.role.key}
                {r.organizer ? ` · ${r.organizer.name}` : ''}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-slate-500">Cadastrado em {formatDate(detail.createdAt)}</p>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Últimas reservas</h4>
            {detail.bookings.length === 0 ? (
              <p className="text-slate-500">Nenhuma reserva.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.bookings.map((b) => (
                  <li key={b.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-900">{b.cruise.title}</p>
                    <p className="text-xs text-slate-500">
                      {b.status} · {formatDate(b.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            {detail.status === 'SUSPENDED' ? (
              <AdminActionButton
                label="Reativar usuário"
                confirmMessage={`Reativar o acesso de ${detail.email}?`}
                action={(token) => reactivateUser(token, userId)}
                onDone={() => {
                  onChanged();
                  onClose();
                }}
              />
            ) : (
              <AdminActionButton
                label="Suspender usuário"
                danger
                confirmMessage={`Suspender o acesso de ${detail.email}? A pessoa não conseguirá mais logar.`}
                action={(token) => suspendUser(token, userId)}
                onDone={() => {
                  onChanged();
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter, reload } = useAdminList(listUsers, {} as { q?: string; status?: string; role?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Usuários"
        icon={<Users className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os usuários da plataforma — passageiros, staff de organizadores e administradores."
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
          <option value="ACTIVE">Ativo</option>
          <option value="SUSPENDED">Suspenso</option>
          <option value="PENDING_VERIFICATION">Verificação pendente</option>
        </select>
        <select
          value={filters.role ?? ''}
          onChange={(e) => updateFilter({ role: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os papéis</option>
          <option value="PASSENGER">Passageiro</option>
          <option value="ORGANIZER_ADMIN">Admin de organizador</option>
          <option value="ORGANIZER_STAFF">Staff de organizador</option>
          <option value="PLATFORM_ADMIN">Admin da plataforma</option>
        </select>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title="Nenhum usuário encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Papéis</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reservas</th>
                    <th className="px-4 py-3">Cadastrado em</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((user: AdminUserListItem) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{user.fullName}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">{user.roles.map((r) => r.role.key).join(', ')}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
                      </td>
                      <td className="px-4 py-3">{user._count.bookings}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(user.id)}
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

      {selectedUserId && (
        <UserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} onChanged={reload} />
      )}
    </>
  );
}
