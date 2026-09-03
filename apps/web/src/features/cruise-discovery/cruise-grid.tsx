import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { CruiseSummary } from '@/types/cruise';
import { CruiseCard } from './cruise-card';

export function CruiseGrid({ cruises }: { cruises: CruiseSummary[] }) {
  if (cruises.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
        title="Nenhum cruzeiro encontrado"
        description="Tente ajustar os filtros ou o termo de busca — talvez um tema ou período diferente traga mais resultados."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cruises.map((cruise) => (
        <CruiseCard key={cruise.id} cruise={cruise} />
      ))}
    </div>
  );
}
