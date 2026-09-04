'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { getMyCruises, getPassengers } from '@/services/organizers.service';
import type { CruiseSummary } from '@/types/cruise';

const inputClassName =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

const DOCUMENT_LABEL: Record<'PASSPORT' | 'NATIONAL_ID', string> = {
  PASSPORT: 'Passaporte',
  NATIONAL_ID: 'RG/Identidade',
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; result: Awaited<ReturnType<typeof getPassengers>> };

function PassengersContent() {
  const { accessToken } = useAuth();
  const [cruises, setCruises] = useState<CruiseSummary[]>([]);
  const [cruiseId, setCruiseId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
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
    const result = await getPassengers(accessToken, { cruiseId: cruiseId || undefined, q: q || undefined, page: String(page) });
    setState({ status: 'ready', result });
  }, [accessToken, cruiseId, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Hóspedes"
        title="Passageiros"
        icon={<Users className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os passageiros das reservas dos seus cruzeiros."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={cruiseId}
          onChange={(e) => {
            setPage(1);
            setCruiseId(e.target.value);
          }}
          className={inputClassName}
        >
          <option value="">Todos os cruzeiros</option>
          {cruises.map((cruise) => (
            <option key={cruise.id} value={cruise.id}>
              {cruise.title}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Buscar por nome…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          className={inputClassName}
        />
      </div>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}

      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title="Nenhum passageiro encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Cruzeiro</th>
                    <th className="px-4 py-3">Cabine</th>
                    <th className="px-4 py-3">Reserva</th>
                    <th className="px-4 py-3">Contato</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((passenger) => (
                    <tr key={passenger.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{passenger.fullName}</p>
                        {passenger.isPrimary && <p className="text-xs text-slate-500">Titular</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {DOCUMENT_LABEL[passenger.documentType]} · {passenger.documentNumber}
                      </td>
                      <td className="px-4 py-3">{passenger.booking.cruise.title}</td>
                      <td className="px-4 py-3">{passenger.booking.cabin.code}</td>
                      <td className="px-4 py-3">
                        <Badge tone={passenger.booking.status === 'CONFIRMED' ? 'success' : 'neutral'}>{passenger.booking.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{passenger.booking.user.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state.result.data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Anterior
              </button>
              <span>
                Página {state.result.data.meta.page} de {state.result.data.meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= state.result.data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function OrganizerPassengersPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <PassengersContent />
    </RequireRole>
  );
}
