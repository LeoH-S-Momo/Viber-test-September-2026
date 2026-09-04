import type { PaginationMeta } from '@seapass/contracts';
import { buttonVariants } from '@/components/ui/button-styles';

export function AdminPagination({ meta, page, setPage }: { meta: PaginationMeta; page: number; setPage: (updater: (p: number) => number) => void }) {
  if (meta.totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage((p) => p - 1)}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Anterior
      </button>
      <span>
        Página {meta.page} de {meta.totalPages} · {meta.total} {meta.total === 1 ? 'registro' : 'registros'}
      </span>
      <button
        type="button"
        disabled={page >= meta.totalPages}
        onClick={() => setPage((p) => p + 1)}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Próxima
      </button>
    </div>
  );
}
