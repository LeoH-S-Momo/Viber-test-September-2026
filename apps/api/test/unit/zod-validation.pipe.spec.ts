import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../src/common/pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.string().email(), age: z.number().min(18) });

  it('returns the parsed value when it matches the schema', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ email: 'a@a.com', age: 20 })).toEqual({
      email: 'a@a.com',
      age: 20,
    });
  });

  it('throws BadRequestException with field errors when validation fails', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ email: 'not-an-email', age: 5 });
      fail('expected transform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        errors: Record<string, string[]>;
      };
      expect(response.errors.email).toBeDefined();
      expect(response.errors.age).toBeDefined();
    }
  });
});
