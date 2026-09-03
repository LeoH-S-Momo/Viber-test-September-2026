import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/skeleton';

export default function CruiseDetailLoading() {
  return (
    <div role="status" aria-label="Carregando cruzeiro">
      <Skeleton className="h-72 w-full rounded-none sm:h-96" />
      <Container className="flex flex-col gap-12 py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="flex flex-col gap-3 lg:col-span-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </Container>
    </div>
  );
}
