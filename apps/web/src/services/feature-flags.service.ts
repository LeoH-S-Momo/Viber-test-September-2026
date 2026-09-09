import { authFetchJson, type ServiceResult } from '@/lib/api-client';

export type FeatureFlagKey = 'ADVANCED_ANALYTICS' | 'EARLY_CHECKIN_WINDOW' | 'CUSTOM_BRANDING';

export interface FeatureFlagView {
  key: FeatureFlagKey;
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: string | null;
}

export function getOrganizerFlags(accessToken: string, organizerId: string): Promise<ServiceResult<FeatureFlagView[]>> {
  return authFetchJson<FeatureFlagView[]>(`/admin/organizers/${organizerId}/feature-flags`, accessToken);
}

export function setOrganizerFlag(
  accessToken: string,
  organizerId: string,
  key: FeatureFlagKey,
  enabled: boolean,
): Promise<ServiceResult<FeatureFlagView>> {
  return authFetchJson<FeatureFlagView>(`/admin/organizers/${organizerId}/feature-flags/${key}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/** Somente leitura — o proprio organizador consultando o que tem liberado (ver organizador/configuracoes). */
export function getMyFeatureFlags(accessToken: string): Promise<ServiceResult<FeatureFlagView[]>> {
  return authFetchJson<FeatureFlagView[]>('/organizador/feature-flags', accessToken);
}
