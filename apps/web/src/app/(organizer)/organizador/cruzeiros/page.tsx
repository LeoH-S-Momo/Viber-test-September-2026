'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarRange, Plus } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { getMyCruises } from '@/services/organizers.service';
import type { CruiseSummary } from '@/types/cruise';

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'accent'> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  CANCELLED: 'neutral',
  COMPLETED: 'accent',
};

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Publicado',
  DRAFT: 'Rascunho',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cruises: CruiseSummary[] };

function CruisesList() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      const result = await getMyCruises(accessToken);
      if (cancelled) return;
      setState(result.ok ? { status: 'ready', cruises: result.data.data } : { status: 'error', message: result.message });
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') return <ErrorState message={state.message} />;

  if (state.cruises.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange className="h-6 w-6" aria-hidden="true" />}
        title="Nenhum cruzeiro cadastrado ainda"
        description="Crie o primeiro cruzeiro para começar a vender cabines."
        action={
          <Link href="/organizador/cruzeiros/novo" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo cruzeiro
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.cruises.map((cruise) => (
        <Link
          key={cruise.id}
          href={`/organizador/cruzeiros/${cruise.id}`}
          className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge tone={STATUS_TONE[cruise.status] ?? 'neutral'}>{STATUS_LABEL[cruise.status] ?? cruise.status}</Badge>
              <span className="text-xs text-slate-500">{cruise.ship.name}</span>
            </div>
            <h3 className="font-display font-bold text-slate-900">{cruise.title}</h3>
            <p className="text-sm text-slate-600">
              {formatDate(cruise.embarkationDate)} – {formatDate(cruise.disembarkationDate)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function OrganizerCruisesPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          eyebrow="Catálogo"
          title="Cruzeiros"
          icon={<CalendarRange className="h-6 w-6 text-accent-600" aria-hidden="true" />}
          description="Crie e edite seus cruzeiros — rascunhos ficam ocultos do público até serem publicados."
        />
        <Link href="/organizador/cruzeiros/novo" className={buttonVariants({ variant: 'primary' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo cruzeiro
        </Link>
      </div>
      <CruisesList />
    </RequireRole>
  );
}
