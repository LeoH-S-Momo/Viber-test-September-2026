import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiHealth } from '@/services/health.service';

describe('getApiHealth', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws a clear error when NEXT_PUBLIC_API_URL is not configured', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    await expect(getApiHealth()).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('calls the health endpoint and parses a valid payload', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3333';
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ status: 'ok' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await getApiHealth();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3333/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejects when the payload does not match the expected shape', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3333';
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ notStatus: 'oops' }),
    }) as unknown as typeof fetch;

    await expect(getApiHealth()).rejects.toThrow();
  });
});
