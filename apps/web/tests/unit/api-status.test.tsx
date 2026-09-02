import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiStatus } from '@/components/api-status';
import * as healthService from '@/services/health.service';

describe('ApiStatus', () => {
  it('shows the API status once the health check resolves', async () => {
    vi.spyOn(healthService, 'getApiHealth').mockResolvedValue({ status: 'ok' });

    render(<ApiStatus />);

    expect(screen.getByText(/verificando conexão/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/api conectada/i)).toBeInTheDocument();
    });
  });

  it('shows an offline message when the health check fails', async () => {
    vi.spyOn(healthService, 'getApiHealth').mockRejectedValue(new Error('network error'));

    render(<ApiStatus />);

    await waitFor(() => {
      expect(screen.getByText(/api indisponível/i)).toBeInTheDocument();
    });
  });
});
