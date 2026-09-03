import { Skeleton } from '@/components/ui/skeleton';

export function CruiseGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <Skeleton className="h-44 w-full rounded-none" />
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="mt-2 h-8 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
