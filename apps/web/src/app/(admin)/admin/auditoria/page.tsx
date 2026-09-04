'use client';

import { useEffect, useState } from 'react';
import { FileClock } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminList } from '@/features/admin/use-admin-list';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime } from '@/lib/format';
import { getAuditLogFacets, listAuditLogs } from '@/services/admin.service';
import type { AdminAuditLog } from '@/types/admin';

export default function AdminAuditLogPage() {
  const { accessToken } = useAuth();
  const [facets, setFacets] = useState<{ actions: string[]; entityTypes: string[] } | null>(null);
  const [actorUserId, setActorUserId] = useState('');
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);
  const { state, page, setPage, filters, updateFilter } = useAdminList(
    listAuditLogs,
    {} as { action?: string; entityType?: string; actorUserId?: string; from?: string; to?: string },
  );

  useEffect(() => {
    if (!accessToken) return;
    getAuditLogFacets(accessToken).then((result) => {
      if (result.ok) setFacets(result.data);
    });
  }, [accessToken]);

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Auditoria"
        icon={<FileClock className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Registro de toda operação sensível na plataforma — quem fez, o que fez, quando fez e qual recurso foi afetado."
      />

      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ actorUserId: actorUserId || undefined });
        }}
      >
        <select
          value={filters.action ?? ''}
          onChange={(e) => updateFilter({ action: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todas as ações</option>
          {facets?.actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <select
          value={filters.entityType ?? ''}
          onChange={(e) => updateFilter({ entityType: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os recursos</option>
          {facets?.entityTypes.map((entityType) => (
            <option key={entityType} value={entityType}>
              {entityType}
            </option>
          ))}
        </select>
        <input
          value={actorUserId}
          onChange={(e) => setActorUserId(e.target.value)}
          placeholder="ID do usuário que executou…"
          className={`${filterInputClassName} w-56`}
        />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          De
          <input
            type="date"
            value={filters.from?.slice(0, 10) ?? ''}
            onChange={(e) => updateFilter({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className={filterInputClassName}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Até
          <input
            type="date"
            value={filters.to?.slice(0, 10) ?? ''}
            onChange={(e) => updateFilter({ to: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className={filterInputClassName}
          />
        </label>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<FileClock className="h-6 w-6" aria-hidden="true" />} title="Nenhum registro encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Quando</th>
                    <th className="px-4 py-3">Quem</th>
                    <th className="px-4 py-3">Ação</th>
                    <th className="px-4 py-3">Recurso</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((log: AdminAuditLog) => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        {log.actorUser ? (
                          <>
                            <p className="font-medium text-slate-900">{log.actorUser.fullName}</p>
                            <p className="text-xs text-slate-500">{log.actorUser.email}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">Sistema</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="brand">{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {log.entityType} <span className="text-xs text-slate-500">({log.entityId})</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
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

      {selectedLog && (
        <Modal title="Detalhes do registro de auditoria" onClose={() => setSelectedLog(null)}>
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="font-semibold">Quando: </span>
              {formatDateTime(selectedLog.createdAt)}
            </p>
            <p>
              <span className="font-semibold">Quem: </span>
              {selectedLog.actorUser ? `${selectedLog.actorUser.fullName} (${selectedLog.actorUser.email})` : 'Sistema'}
              {selectedLog.actorUserId && <span className="text-xs text-slate-500"> · {selectedLog.actorUserId}</span>}
            </p>
            <p>
              <span className="font-semibold">O que fez: </span>
              {selectedLog.action}
            </p>
            <p>
              <span className="font-semibold">Recurso afetado: </span>
              {selectedLog.entityType} · {selectedLog.entityId}
            </p>
            {selectedLog.metadata && (
              <div>
                <p className="mb-1 font-semibold">Detalhes adicionais</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
