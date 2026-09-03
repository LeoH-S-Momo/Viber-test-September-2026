'use client';

import { useEffect } from 'react';
import { Container } from '@/components/ui/container';
import { ErrorState } from '@/components/ui/error-state';

export default function PublicError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16">
      <ErrorState
        title="Algo deu errado"
        message="Ocorreu um erro inesperado ao carregar esta página. Tente novamente em instantes."
      />
    </Container>
  );
}
