import { CheckCircle2, Ticket as TicketIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDate, formatTime } from '@/lib/format';
import type { MyBookingGuest } from '@/types/booking';
import type { MyTicket } from '@/types/ticket';

function GuestTicketCard({ guest, ticket }: { guest: MyBookingGuest; ticket: MyTicket | undefined }) {
  if (!ticket) {
    return (
      <div className="flex min-w-[16rem] flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <TicketIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-600">{guest.fullName}</p>
        <p className="text-xs text-slate-500">Ingresso sendo emitido — atualize a página em instantes.</p>
      </div>
    );
  }

  const checkIn = ticket.checkIns[0];

  return (
    <div className="flex min-w-[16rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-dashed border-slate-200 p-4">
        <div>
          <p className="font-display font-semibold text-slate-900">{guest.fullName}</p>
          {guest.isPrimary && <p className="text-xs text-slate-500">Titular da reserva</p>}
        </div>
        {ticket.status === 'CHECKED_IN' ? (
          <Badge tone="success">Check-in feito</Badge>
        ) : ticket.status === 'CANCELLED' ? (
          <Badge tone="neutral">Cancelado</Badge>
        ) : (
          <Badge tone="accent">Pronto para embarque</Badge>
        )}
      </div>

      <div className="flex items-center gap-4 p-4">
        <div className="flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado pelo backend, nao um asset estatico */}
          <img src={ticket.qrCodeDataUrl} alt={`QR Code do ticket ${ticket.qrCode}`} width={96} height={96} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-400">{ticket.qrCode}</p>
          {checkIn ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Check-in em {formatDate(checkIn.checkedInAt)} às {formatTime(checkIn.checkedInAt)}
              {checkIn.location ? ` · ${checkIn.location}` : ''}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Apresente este QR Code no embarque.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ingressos digitais dos passageiros desta viagem — um "cartão de embarque" por hóspede (ver ADR-0013/0015). */
export function TripTickets({ guests, tickets }: { guests: MyBookingGuest[]; tickets: MyTicket[] }) {
  const ticketByGuestId = new Map(tickets.map((ticket) => [ticket.bookingGuestId, ticket]));

  return (
    <div>
      <SectionHeading
        eyebrow="Embarque"
        title="Ingressos e check-in"
        icon={<TicketIcon className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Um QR Code por passageiro — o mesmo apresentado (ou já validado) no check-in de embarque."
      />
      <div className="flex flex-wrap gap-4">
        {guests.map((guest) => (
          <GuestTicketCard key={guest.id} guest={guest} ticket={ticketByGuestId.get(guest.id)} />
        ))}
      </div>
    </div>
  );
}
