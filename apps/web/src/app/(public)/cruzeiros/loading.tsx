import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/skeleton';
import { CruiseGridSkeleton } from '@/features/cruise-discovery/cruise-grid-skeleton';

export default function CruzeirosLoading() {
  return (
    <Container className="py-10 sm:py-12" role="status" aria-label="Carregando cruzeiros">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <Skeleton className="mt-8 h-16 w-full rounded-2xl" />
      <Skeleton className="mb-4 mt-6 h-4 w-40" />
      <CruiseGridSkeleton count={9} />
    </Container>
  );
}
