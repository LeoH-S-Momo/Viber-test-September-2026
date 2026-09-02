import { validateEnv } from '../../src/config/env.schema';

const validBaseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const result = validateEnv(validBaseEnv);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3333);
    expect(result.WEB_APP_URL).toBe('http://localhost:3000');
  });

  it('coerces PORT from a string into a number', () => {
    const result = validateEnv({ ...validBaseEnv, PORT: '4000' });

    expect(result.PORT).toBe(4000);
  });

  it('throws when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...rest } = validBaseEnv;

    expect(() => validateEnv(rest)).toThrow();
  });

  it('throws when a URL variable is malformed', () => {
    expect(() => validateEnv({ ...validBaseEnv, DATABASE_URL: 'not-a-url' })).toThrow();
  });

  it('throws when NODE_ENV is not one of the allowed values', () => {
    expect(() => validateEnv({ ...validBaseEnv, NODE_ENV: 'staging' })).toThrow();
  });
});
