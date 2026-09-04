'use client';

import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button-styles';
import { useAuth } from '@/lib/auth-context';
import type { ServiceResult } from '@/lib/api-client';

const dangerClassName = '!border-red-300 !text-red-700 hover:!bg-red-50';

/**
 * Botao de acao administrativa (suspender/reativar/cancelar/...) — confirma, chama a API, recarrega a
 * lista. Quando `promptMessage` e informado (acoes de cancelamento, que aceitam um motivo opcional),
 * pede o motivo por `window.prompt` em vez de so confirmar — cancelar o prompt cancela a acao.
 */
export function AdminActionButton({
  label,
  confirmMessage,
  promptMessage,
  action,
  onDone,
  danger,
}: {
  label: string;
  confirmMessage?: string;
  promptMessage?: string;
  action: (accessToken: string, reason?: string) => Promise<ServiceResult<unknown>>;
  onDone: () => void;
  danger?: boolean;
}) {
  const { accessToken } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!accessToken) return;
    let reason: string | undefined;
    if (promptMessage) {
      const entered = window.prompt(promptMessage);
      if (entered === null) return;
      reason = entered.trim() || undefined;
    } else if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await action(accessToken, reason);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone();
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: danger ? dangerClassName : '' })}
      >
        {pending ? 'Aguarde…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
