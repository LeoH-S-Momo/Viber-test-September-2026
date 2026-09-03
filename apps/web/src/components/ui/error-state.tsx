'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { buttonVariants } from './button-styles';

export function ErrorState({
  title = 'Não foi possível carregar esta página',
  message,
}: {
  title?: string;
  message: string;
}) {
  const router = useRouter();

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-16 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-red-500 shadow-sm">
        <ServerCrash className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-semibold text-red-900">{title}</h3>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-2' })}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}
