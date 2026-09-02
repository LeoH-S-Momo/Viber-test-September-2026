import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validacao de input via Zod (decisao de arquitetura — ver
 * docs/architecture/stack-and-structure.md). Uso:
 * `@UsePipes(new ZodValidationPipe(RegisterSchema))`.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Dados invalidos',
        errors: result.error.flatten().fieldErrors,
      });
    }

    return result.data;
  }
}
