import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/skeleton';
import { CruiseGridSkeleton } from '@/features/cruise-discovery/cruise-grid-skeleton';

export default function HomeLoading() {
  return (
    <div role="status" aria-label="Carregando página inicial">
      <div className="bg-brand-950 py-20 sm:py-28">
        <Container>
          <Skeleton className="h-4 w-40 bg-white/10" />
          <Skeleton className="mt-4 h-12 w-full max-w-2xl bg-white/10" />
          <Skeleton className="mt-3 h-6 w-full max-w-xl bg-white/10" />
          <Skeleton className="mt-8 h-12 w-52 rounded-full bg-white/10" />
        </Container>
      </div>
      <Container className="py-16">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="mb-8 h-8 w-64" />
        <CruiseGridSkeleton count={6} />
      </Container>
    </div>
  );
}
