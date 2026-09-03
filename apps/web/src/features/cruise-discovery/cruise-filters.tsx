'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cloneElement, isValidElement, useState, type FormEvent, type ReactElement } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-styles';

const SORT_OPTIONS = [
  { value: 'embarkationDate-asc', label: 'Data de embarque (mais próxima)' },
  { value: 'price-asc', label: 'Preço (menor primeiro)' },
  { value: 'price-desc', label: 'Preço (maior primeiro)' },
  { value: 'title-asc', label: 'Nome (A–Z)' },
] as const;

export function CruiseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const currentSort = `${searchParams.get('sortBy') ?? 'embarkationDate'}-${searchParams.get('sortOrder') ?? 'asc'}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();

    const q = String(form.get('q') ?? '').trim();
    const theme = String(form.get('theme') ?? '').trim();
    const destination = String(form.get('destination') ?? '').trim();
    const minPrice = String(form.get('minPrice') ?? '').trim();
    const maxPrice = String(form.get('maxPrice') ?? '').trim();
    const embarkationFrom = String(form.get('embarkationFrom') ?? '').trim();
    const embarkationTo = String(form.get('embarkationTo') ?? '').trim();
    const sort = String(form.get('sort') ?? currentSort);
    const [sortBy, sortOrder] = sort.split('-');

    if (q) next.set('q', q);
    if (theme) next.set('theme', theme);
    if (destination) next.set('destination', destination);
    if (minPrice) next.set('minPrice', minPrice);
    if (maxPrice) next.set('maxPrice', maxPrice);
    if (embarkationFrom) next.set('embarkationFrom', embarkationFrom);
    if (embarkationTo) next.set('embarkationTo', embarkationTo);
    if (sortBy) next.set('sortBy', sortBy);
    if (sortOrder) next.set('sortOrder', sortOrder);
    // page nao entra — toda busca/filtro novo volta pra pagina 1

    router.push(`/cruzeiros${next.toString() ? `?${next.toString()}` : ''}`);
  }

  const hasActiveFilters = ['theme', 'destination', 'minPrice', 'maxPrice', 'embarkationFrom', 'embarkationTo'].some(
    (key) => searchParams.get(key),
  );

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="cruise-search" className="sr-only">
            Buscar cruzeiros por nome, tema ou descrição
          </label>
          <input
            id="cruise-search"
            name="q"
            type="search"
            defaultValue={searchParams.get('q') ?? ''}
            placeholder="Buscar por nome, tema..."
            className="w-full rounded-full border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: 'primary' })}>
            Buscar
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="cruise-filters-panel"
            className={buttonVariants({ variant: hasActiveFilters ? 'secondary' : 'outline' })}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtros
          </button>
        </div>
      </div>

      <div id="cruise-filters-panel" hidden={!expanded} className="mt-4 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tema">
            <input
              name="theme"
              type="text"
              defaultValue={searchParams.get('theme') ?? ''}
              placeholder="Rock, Jazz, Eletrônica..."
              className={inputClass}
            />
          </Field>
          <Field label="Destino">
            <input
              name="destination"
              type="text"
              defaultValue={searchParams.get('destination') ?? ''}
              placeholder="Nome do porto"
              className={inputClass}
            />
          </Field>
          <Field label="Embarque de">
            <input
              name="embarkationFrom"
              type="date"
              defaultValue={searchParams.get('embarkationFrom')?.slice(0, 10) ?? ''}
              className={inputClass}
            />
          </Field>
          <Field label="Embarque até">
            <input
              name="embarkationTo"
              type="date"
              defaultValue={searchParams.get('embarkationTo')?.slice(0, 10) ?? ''}
              className={inputClass}
            />
          </Field>
          <Field label="Preço mínimo (R$)">
            <input
              name="minPrice"
              type="number"
              min={0}
              defaultValue={searchParams.get('minPrice') ?? ''}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field label="Preço máximo (R$)">
            <input
              name="maxPrice"
              type="number"
              min={0}
              defaultValue={searchParams.get('maxPrice') ?? ''}
              placeholder="10000"
              className={inputClass}
            />
          </Field>
          <Field label="Ordenar por">
            <select name="sort" defaultValue={currentSort} className={inputClass}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => router.push('/cruzeiros')}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Limpar filtros
            </button>
          )}
          <button type="submit" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Aplicar filtros
          </button>
        </div>
      </div>
    </form>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const input = isValidElement(children) ? cloneElement(children, { id }) : children;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {input}
    </div>
  );
}
