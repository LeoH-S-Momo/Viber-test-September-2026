import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CruiseFilters } from '@/features/cruise-discovery/cruise-filters';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('CruiseFilters', () => {
  it('associates each filter label with its actual input via matching for/id', () => {
    render(<CruiseFilters />);

    fireEvent.click(screen.getByRole('button', { name: /filtros/i }));

    for (const label of ['Tema', 'Destino', 'Embarque de', 'Embarque até', 'Ordenar por']) {
      const labelElement = screen.getByText(label);
      const input = screen.getByLabelText(label, { exact: true });
      expect(labelElement).toHaveAttribute('for', input.id);
    }
  });
});
