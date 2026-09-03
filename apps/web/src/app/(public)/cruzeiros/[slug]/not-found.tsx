import Link from 'next/link';
import { CompassIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-styles';
import { Container } from '@/components/ui/container';
import { EmptyState } from '@/components/ui/empty-state';

export default function CruiseNotFound() {
  return (
    <Container className="py-20">
      <EmptyState
        icon={<CompassIcon className="h-6 w-6" aria-hidden="true" />}
        title="Cruzeiro não encontrado"
        description="Este cruzeiro não existe, foi despublicado ou o link está incorreto."
        action={
          <Link href="/cruzeiros" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Ver todos os cruzeiros
          </Link>
        }
      />
    </Container>
  );
}
