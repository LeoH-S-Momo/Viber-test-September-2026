'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, QrCode, ScanLine, ShieldAlert, XCircle } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { confirmCheckIn, lookupCheckIn } from '@/services/tickets.service';
import type { CheckInOutcome, CheckInTicketView } from '@/types/ticket';

/**
 * Tela dedicada de check-in (ver ADR-0013) — "informar codigo" (leitura por
 * camera fica para uma proxima etapa, ver o ADR). Nenhuma decisao de
 * elegibilidade acontece aqui: o componente so mostra o que o backend
 * (`CheckInPolicy`, via /check-in/lookup e /check-in/confirm) ja decidiu —
 * "a validacao deve ocorrer no backend" na pratica significa isto.
 */

const OUTCOME_META: Record<
  CheckInOutcome,
  { label: string; description: string; className: string; icon: typeof CheckCircle2 }
> = {
  NOT_CHECKED_IN: {
    label: 'Pronto para embarque',
    description: 'Ticket valido, ainda nao utilizado — pode confirmar o check-in.',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  CHECKED_IN: {
    label: 'Check-in confirmado agora',
    description: 'O embarque deste passageiro acabou de ser registrado.',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  ALREADY_USED: {
    label: 'Ja utilizado',
    description: 'Este ticket ja fez check-in antes — nao pode ser usado de novo.',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
    icon: ShieldAlert,
  },
  INVALID: {
    label: 'Invalido',
    description: 'Codigo inexistente, reserva nao confirmada, ou ticket cancelado.',
    className: 'border-red-300 bg-red-50 text-red-800',
    icon: XCircle,
  },
};

function TicketResultCard({
  outcome,
  ticket,
  onConfirm,
  confirming,
}: {
  outcome: CheckInOutcome;
  ticket: CheckInTicketView | null;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const meta = OUTCOME_META[outcome];
  const Icon = meta.icon;

  return (
    <div className={`rounded-2xl border p-6 ${meta.className}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-display text-lg font-bold">{meta.label}</p>
          <p className="mt-1 text-sm opacity-90">{meta.description}</p>

          {ticket && (
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl bg-white/60 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium opacity-70">Passageiro</dt>
                <dd>{ticket.passengerName}</dd>
              </div>
              <div>
                <dt className="font-medium opacity-70">Titular da reserva</dt>
                <dd>{ticket.accountHolderName}</dd>
              </div>
              <div>
                <dt className="font-medium opacity-70">Cruzeiro</dt>
                <dd>{ticket.cruiseTitle}</dd>
              </div>
              <div>
                <dt className="font-medium opacity-70">Cabine</dt>
                <dd>
                  {ticket.cabinCode} ({ticket.cabinCategoryName})
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium opacity-70">Codigo</dt>
                <dd className="font-mono text-xs">{ticket.code}</dd>
              </div>
            </dl>
          )}

          {outcome === 'NOT_CHECKED_IN' && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className={buttonVariants({ variant: 'primary', className: 'mt-4' })}
            >
              {confirming ? 'Confirmando…' : 'Confirmar check-in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckInPage() {
  const { accessToken } = useAuth();
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [lookup, setLookup] = useState<{ outcome: CheckInOutcome; ticket: CheckInTicketView | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !code.trim()) return;
    setSearching(true);
    setError(null);
    setLookup(null);
    const result = await lookupCheckIn(accessToken, code.trim());
    setSearching(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setLookup(result.data);
  }

  async function handleConfirm() {
    if (!accessToken || !code.trim()) return;
    setConfirming(true);
    setError(null);
    const result = await confirmCheckIn(accessToken, code.trim(), location.trim() || undefined);
    setConfirming(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setLookup({ outcome: 'CHECKED_IN', ticket: result.data });
  }

  return (
    <RequireRole roles={['ORGANIZER_STAFF', 'ORGANIZER_ADMIN']}>
      <Container className="py-10">
        <SectionHeading
          eyebrow="Operação de embarque"
          title="Check-in de passageiros"
          description="Informe o código do ticket (ou o texto lido de um QR Code) para localizar e confirmar o embarque."
          icon={<ScanLine className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        />

        <form onSubmit={handleLookup} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-700">
              Código do ticket
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
              <QrCode className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                id="code"
                type="text"
                autoComplete="off"
                autoFocus
                placeholder="TICKET-..."
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setLookup(null);
                }}
                className="w-full py-2 font-mono text-sm outline-none"
              />
            </div>
          </div>

          <div className="sm:w-48">
            <label htmlFor="location" className="mb-1.5 block text-sm font-medium text-slate-700">
              Local (opcional)
            </label>
            <input
              id="location"
              type="text"
              placeholder="Portão A"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={searching || !code.trim()}
            className={buttonVariants({ variant: 'secondary' })}
          >
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {lookup && (
          <TicketResultCard outcome={lookup.outcome} ticket={lookup.ticket} onConfirm={handleConfirm} confirming={confirming} />
        )}
      </Container>
    </RequireRole>
  );
}
