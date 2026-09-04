'use client';

import { useEffect, useState } from 'react';
import { Ticket as TicketIcon } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/format';
import { getMyTickets } from '@/services/tickets.service';
import type { MyTicket } from '@/types/ticket';

const STATUS_LABEL: Record<MyTicket['status'], { label: string; tone: 'success' | 'neutral' | 'accent' }> = {
  ISSUED: { label: 'Pronto para embarque', tone: 'success' },
  CHECKED_IN: { label: 'Check-in realizado', tone: 'accent' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

function TicketCard({ ticket }: { ticket: MyTicket }) {
  const status = STATUS_LABEL[ticket.status];
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <div className="mb-2 flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <h3 className="font-display text-lg font-bold text-slate-900">{ticket.bookingGuest.booking.cruise.title}</h3>
        <p className="mt-1 text-sm text-slate-600">
          Embarque em {formatDate(ticket.bookingGuest.booking.cruise.embarkationDate)} · Cabine{' '}
          {ticket.bookingGuest.booking.cabin.code} ({ticket.bookingGuest.booking.cabin.cabinCategory.name})
        </p>
        <p className="mt-1 text-sm text-slate-600">Passageiro: {ticket.bookingGuest.fullName}</p>
        <p className="mt-3 font-mono text-xs text-slate-400">{ticket.qrCode}</p>
      </div>

      <div className="flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado pelo backend, nao um asset estatico */}
        <img src={ticket.qrCodeDataUrl} alt={`QR Code do ticket ${ticket.qrCode}`} width={140} height={140} />
      </div>
    </div>
  );
}

function TicketsList() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; tickets: MyTicket[] }
  >({ status: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      const result = await getMyTickets(accessToken);
      if (cancelled) return;
      setState(result.ok ? { status: 'ready', tickets: result.data } : { status: 'error', message: result.message });
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState message={state.message} />;
  }

  if (state.tickets.length === 0) {
    return (
      <EmptyState
        icon={<TicketIcon className="h-6 w-6" aria-hidden="true" />}
        title="Nenhum ingresso ainda"
        description="Seus ingressos aparecem aqui assim que uma reserva for confirmada e o pagamento aprovado."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
    </div>
  );
}

export default function IngressosPage() {
  return (
    <RequireRole roles={['PASSENGER']}>
      <Container className="py-10">
        <SectionHeading
          eyebrow="Meus ingressos"
          title="Seus ingressos digitais"
          description="Apresente o QR Code no embarque — o staff confere e confirma ali mesmo."
          icon={<TicketIcon className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        />
        <TicketsList />
      </Container>
    </RequireRole>
  );
}
