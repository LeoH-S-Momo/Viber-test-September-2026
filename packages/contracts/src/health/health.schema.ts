import { z } from 'zod';

/**
 * Contrato deliberadamente pouco restritivo: reflete o formato padrao do
 * HealthCheckResult do @nestjs/terminus (status + detalhes por indicador),
 * sem acoplar o frontend a cada indicador especifico que a API venha a expor.
 */
export const HealthStatusSchema = z
  .object({
    status: z.string(),
  })
  .passthrough();

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
