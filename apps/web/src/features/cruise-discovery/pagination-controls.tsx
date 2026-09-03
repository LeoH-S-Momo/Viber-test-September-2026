import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@seapass/contracts';

function hrefForPage(searchParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== 'page') params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/cruzeiros${qs ? `?${qs}` : ''}`;
}

export function PaginationControls({
  meta,
  searchParams,
}: {
  meta: PaginationMeta;
  searchParams: Record<string, string | undefined>;
}) {
  if (meta.totalPages <= 1) return null;

  const hasPrev = meta.page > 1;
  const hasNext = meta.page < meta.totalPages;

  return (
    <nav aria-label="Paginação de resultados" className="mt-10 flex items-center justify-center gap-3">
      <PageLink
        disabled={!hasPrev}
        href={hrefForPage(searchParams, meta.page - 1)}
        label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Anterior
      </PageLink>

      <span className="text-sm text-slate-600" aria-current="page">
        Página <strong className="text-slate-900">{meta.page}</strong> de{' '}
        <strong className="text-slate-900">{meta.totalPages}</strong>
      </span>

      <PageLink disabled={!hasNext} href={hrefForPage(searchParams, meta.page + 1)} label="Próxima página">
        Próxima
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    'flex items-center gap-1 rounded-full border px-4 py-2 text-sm font-medium transition ' +
    (disabled
      ? 'cursor-not-allowed border-slate-200 text-slate-300'
      : 'border-slate-300 text-slate-700 hover:bg-slate-50');

  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}
