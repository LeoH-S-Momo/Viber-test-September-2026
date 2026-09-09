'use client';

import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { getMyFeatureFlags, type FeatureFlagView } from '@/services/feature-flags.service';

/** Somente leitura — quem libera/revoga e sempre PLATFORM_ADMIN (ver admin/feature-flags), o organizador so ve o proprio estado. */
export function BetaFeatures() {
  const { accessToken } = useAuth();
  const [flags, setFlags] = useState<FeatureFlagView[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    getMyFeatureFlags(accessToken).then((result) => {
      if (result.ok) setFlags(result.data);
    });
  }, [accessToken]);

  const enabled = flags.filter((flag) => flag.enabled);
  if (enabled.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-slate-900">
        <FlaskConical className="h-5 w-5 text-accent-600" aria-hidden="true" />
        Recursos beta ativados
      </h3>
      <div className="flex flex-wrap gap-2">
        {enabled.map((flag) => (
          <Badge key={flag.key} tone="accent">
            {flag.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
