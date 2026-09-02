import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca uma rota como isenta de autenticacao. Por padrao TODA rota exige
 * access token valido (JwtAuthGuard e global via APP_GUARD) — proteger por
 * padrao e mais seguro do que exigir opt-in guard por controller.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
