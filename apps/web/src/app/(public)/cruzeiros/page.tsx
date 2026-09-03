import type { Metadata } from 'next';
import { Container } from '@/components/ui/container';
import { ErrorState } from '@/components/ui/error-state';
import { CruiseFilters } from '@/features/cruise-discovery/cruise-filters';
import { CruiseGrid } from '@/features/cruise-discovery/cruise-grid';
import { PaginationControls } from '@/features/cruise-discovery/pagination-controls';
import { listCruises } from '@/services/cruises.service';
import type { CruiseSearchParams, CruiseSortBy, SortOrder } from '@/types/cruise';

export const metadata: Metadata = {
  title: 'Explorar cruzeiros',
  description: 'Encontre o cruzeiro temático ideal por tema, destino, data e preço.',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toSearchParams(raw: RawSearchParams): CruiseSearchParams {
  return {
    q: first(raw.q),
    theme: first(raw.theme),
    destination: first(raw.destination),
    embarkationFrom: first(raw.embarkationFrom),
    embarkationTo: first(raw.embarkationTo),
    minPrice: first(raw.minPrice),
    maxPrice: first(raw.maxPrice),
    sortBy: first(raw.sortBy) as CruiseSortBy | undefined,
    sortOrder: first(raw.sortOrder) as SortOrder | undefined,
    page: first(raw.page),
  };
}

export default async function CruzeirosPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = toSearchParams(raw);
  const result = await listCruises(query);

  const plainParams: Record<string, string | undefined> = {
    q: query.q,
    theme: query.theme,
    destination: query.destination,
    embarkationFrom: query.embarkationFrom,
    embarkationTo: query.embarkationTo,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };

  return (
    <Container className="py-10 sm:py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
          Explorar cruzeiros
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Filtre por tema, destino, data de embarque e faixa de preço para encontrar sua próxima
          viagem.
        </p>
      </div>

      <div className="mb-8">
        <CruiseFilters />
      </div>

      {result.ok ? (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {result.data.meta.total}{' '}
            {result.data.meta.total === 1 ? 'cruzeiro encontrado' : 'cruzeiros encontrados'}
          </p>
          <CruiseGrid cruises={result.data.data} />
          <PaginationControls meta={result.data.meta} searchParams={plainParams} />
        </>
      ) : (
        <ErrorState message={result.message} />
      )}
    </Container>
  );
}
