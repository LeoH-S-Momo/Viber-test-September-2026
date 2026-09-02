import { HealthStatusSchema, type HealthStatus } from '@seapass/contracts';

/**
 * Unica funcao autorizada a chamar o endpoint de health check da API — nenhum
 * `fetch` deve ser feito fora da camada `services/` (ver services/README.md).
 */
export async function getApiHealth(): Promise<HealthStatus> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL não está configurada (ver apps/web/.env.example).');
  }

  const response = await fetch(`${apiUrl}/health`, { cache: 'no-store' });
  const payload = await response.json();

  return HealthStatusSchema.parse(payload);
}
