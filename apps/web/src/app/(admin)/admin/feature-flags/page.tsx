'use client';

import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Toggle } from '@/components/ui/toggle';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime } from '@/lib/format';
import { listOrganizers } from '@/services/admin.service';
import { getOrganizerFlags, setOrganizerFlag, type FeatureFlagView } from '@/services/feature-flags.service';
import type { AdminOrganizerListItem } from '@/types/admin';

/**
 * Beta controlado por organizador (ver ADR do feature flag) — catalogo fixo de 3 flags de
 * exemplo, sem efeito em nenhuma outra feature deste pacote de propósito: e a base reutilizável
 * pra um gating futuro, não uma integração forçada com o que já existe.
 */
function FlagsForOrganizer({ organizerId }: { organizerId: string }) {
  const { accessToken } = useAuth();
  const [flags, setFlags] = useState<FeatureFlagView[] | 'loading' | 'error'>('loading');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setFlags('loading');
    getOrganizerFlags(accessToken, organizerId).then((result) => setFlags(result.ok ? result.data : 'error'));
  }, [accessToken, organizerId]);

  async function handleToggle(flag: FeatureFlagView) {
    if (!accessToken) return;
    setPendingKey(flag.key);
    const result = await setOrganizerFlag(accessToken, organizerId, flag.key, !flag.enabled);
    setPendingKey(null);
    if (result.ok) {
      setFlags((prev) => (Array.isArray(prev) ? prev.map((f) => (f.key === flag.key ? result.data : f)) : prev));
    }
  }

  if (flags === 'loading') return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (flags === 'error') return <ErrorState message="Não foi possível carregar as flags deste organizador." />;

  return (
    <ul className="flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {flags.map((flag) => (
        <li key={flag.key} className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-medium text-slate-900">{flag.name}</p>
            <p className="text-sm text-slate-500">{flag.description}</p>
            {flag.updatedAt && <p className="mt-1 text-xs text-slate-400">Alterado em {formatDateTime(flag.updatedAt)}</p>}
          </div>
          <Toggle
            checked={flag.enabled}
            disabled={pendingKey === flag.key}
            onChange={() => handleToggle(flag)}
            label={`Ativar ${flag.name}`}
          />
        </li>
      ))}
    </ul>
  );
}

export default function AdminFeatureFlagsPage() {
  const { accessToken } = useAuth();
  const [organizers, setOrganizers] = useState<AdminOrganizerListItem[] | 'loading' | 'error'>('loading');
  const [organizerId, setOrganizerId] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    listOrganizers(accessToken, {}, 1).then((result) => setOrganizers(result.ok ? result.data.data : 'error'));
  }, [accessToken]);

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Feature flags"
        icon={<FlaskConical className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Libere funcionalidades em beta por organizador, individualmente."
      />

      {organizers === 'loading' && <Skeleton className="h-10 w-64 rounded-lg" />}
      {organizers === 'error' && <ErrorState message="Não foi possível carregar os organizadores." />}
      {Array.isArray(organizers) && (
        <select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)} className={`${filterInputClassName} mb-6`}>
          <option value="">Selecione um organizador…</option>
          {organizers.map((organizer) => (
            <option key={organizer.id} value={organizer.id}>
              {organizer.name}
            </option>
          ))}
        </select>
      )}

      {organizerId && <FlagsForOrganizer key={organizerId} organizerId={organizerId} />}
    </>
  );
}
