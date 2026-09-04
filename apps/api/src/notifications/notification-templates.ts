import type { NotificationType } from '@prisma/client';

export interface NotificationContent {
  subject: string;
  text: string;
  html: string;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function formatPrice(value: string | number): string {
  return currencyFormatter.format(Number(value));
}

function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

/** Layout HTML minimo, so pra nao mandar `<p>` cru — sem framework de e-mail, nao e o foco deste trabalho. */
function wrapHtml(heading: string, paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px;color:#334155;line-height:1.5;">${p}</p>`).join('\n');
  return `<!doctype html><html><body style="font-family:sans-serif;background:#f8fafc;padding:24px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
<h1 style="font-size:18px;color:#0f172a;margin:0 0 16px;">${heading}</h1>
${body}
<p style="margin-top:24px;font-size:12px;color:#94a3b8;">SeaPass — sua próxima viagem em alto-mar.</p>
</div>
</body></html>`;
}

export interface BookingConfirmedContext {
  fullName: string;
  cruiseTitle: string;
  cabinCode: string;
  embarkationDate: Date;
  totalAmount: string;
}

export function bookingConfirmedContent(ctx: BookingConfirmedContext): NotificationContent {
  const subject = `Reserva confirmada — ${ctx.cruiseTitle}`;
  const text = `Olá, ${ctx.fullName}! Sua reserva no cruzeiro "${ctx.cruiseTitle}" está confirmada. Cabine ${ctx.cabinCode}, embarque em ${formatDate(ctx.embarkationDate)}. Total pago: ${formatPrice(ctx.totalAmount)}. Boa viagem!`;
  const html = wrapHtml('Reserva confirmada! 🎉', [
    `Olá, <strong>${ctx.fullName}</strong>!`,
    `Sua reserva no cruzeiro <strong>${ctx.cruiseTitle}</strong> está confirmada.`,
    `Cabine <strong>${ctx.cabinCode}</strong> · Embarque em <strong>${formatDate(ctx.embarkationDate)}</strong>`,
    `Total pago: <strong>${formatPrice(ctx.totalAmount)}</strong>`,
  ]);
  return { subject, text, html };
}

export interface PaymentApprovedContext {
  fullName: string;
  cruiseTitle: string;
  amount: string;
  method: string;
}

export function paymentApprovedContent(ctx: PaymentApprovedContext): NotificationContent {
  const subject = `Pagamento aprovado — ${ctx.cruiseTitle}`;
  const text = `Olá, ${ctx.fullName}! Seu pagamento de ${formatPrice(ctx.amount)} (${ctx.method}) para o cruzeiro "${ctx.cruiseTitle}" foi aprovado.`;
  const html = wrapHtml('Pagamento aprovado ✅', [
    `Olá, <strong>${ctx.fullName}</strong>!`,
    `Seu pagamento de <strong>${formatPrice(ctx.amount)}</strong> (${ctx.method}) para <strong>${ctx.cruiseTitle}</strong> foi aprovado.`,
  ]);
  return { subject, text, html };
}

export interface PaymentDeclinedContext {
  fullName: string;
  cruiseTitle: string;
  reason: string | null;
}

export function paymentDeclinedContent(ctx: PaymentDeclinedContext): NotificationContent {
  const subject = `Pagamento recusado — ${ctx.cruiseTitle}`;
  const reasonText = ctx.reason ? ` Motivo: ${ctx.reason}.` : '';
  const text = `Olá, ${ctx.fullName}. Seu pagamento para o cruzeiro "${ctx.cruiseTitle}" foi recusado.${reasonText} Você pode tentar novamente com outro método antes que o prazo de retenção da cabine expire.`;
  const html = wrapHtml('Pagamento recusado ❌', [
    `Olá, <strong>${ctx.fullName}</strong>.`,
    `Seu pagamento para <strong>${ctx.cruiseTitle}</strong> foi recusado.${reasonText}`,
    'Você pode tentar novamente com outro método antes que o prazo de retenção da cabine expire.',
  ]);
  return { subject, text, html };
}

export interface TicketAvailableContext {
  fullName: string;
  cruiseTitle: string;
  ticketCount: number;
}

export function ticketAvailableContent(ctx: TicketAvailableContext): NotificationContent {
  const plural = ctx.ticketCount === 1 ? 'ingresso está' : 'ingressos estão';
  const subject = `Seu ingresso digital está pronto — ${ctx.cruiseTitle}`;
  const text = `Olá, ${ctx.fullName}! Seu(s) ${ctx.ticketCount} ${plural} disponível(is) para o cruzeiro "${ctx.cruiseTitle}". Acesse "Meus ingressos" no SeaPass para ver o QR Code.`;
  const html = wrapHtml('Seu ingresso está pronto 🎫', [
    `Olá, <strong>${ctx.fullName}</strong>!`,
    `Seu(s) <strong>${ctx.ticketCount}</strong> ${plural} disponível(is) para <strong>${ctx.cruiseTitle}</strong>.`,
    'Acesse "Meus ingressos" no SeaPass para ver o QR Code de embarque.',
  ]);
  return { subject, text, html };
}

export interface BoardingReminderContext {
  fullName: string;
  cruiseTitle: string;
  embarkationDate: Date;
  cabinCode: string;
}

export function boardingReminderContent(ctx: BoardingReminderContext): NotificationContent {
  const subject = `Seu embarque está chegando — ${ctx.cruiseTitle}`;
  const text = `Olá, ${ctx.fullName}! Seu embarque no cruzeiro "${ctx.cruiseTitle}" (cabine ${ctx.cabinCode}) está marcado para ${formatDate(ctx.embarkationDate)}. Prepare seus documentos e tenha seu ingresso digital em mãos.`;
  const html = wrapHtml('Seu embarque está chegando ⛴️', [
    `Olá, <strong>${ctx.fullName}</strong>!`,
    `Seu embarque no cruzeiro <strong>${ctx.cruiseTitle}</strong> (cabine ${ctx.cabinCode}) está marcado para <strong>${formatDate(ctx.embarkationDate)}</strong>.`,
    'Prepare seus documentos e tenha seu ingresso digital em mãos.',
  ]);
  return { subject, text, html };
}

export interface EventChangedContext {
  fullName: string;
  eventTitle: string;
  cruiseTitle: string;
  startAt: Date;
  venueName: string;
}

export function eventChangedContent(ctx: EventChangedContext): NotificationContent {
  const subject = `Mudança na programação — ${ctx.eventTitle}`;
  const text = `Olá, ${ctx.fullName}. O evento "${ctx.eventTitle}" que você reservou no cruzeiro "${ctx.cruiseTitle}" teve informações alteradas. Novo horário: ${formatDate(ctx.startAt)}, local: ${ctx.venueName}. Confira os detalhes no SeaPass.`;
  const html = wrapHtml('A programação mudou 🔔', [
    `Olá, <strong>${ctx.fullName}</strong>.`,
    `O evento <strong>${ctx.eventTitle}</strong> (${ctx.cruiseTitle}) que você reservou teve informações alteradas.`,
    `Novo horário: <strong>${formatDate(ctx.startAt)}</strong> · Local: <strong>${ctx.venueName}</strong>`,
  ]);
  return { subject, text, html };
}

export interface BookingCancelledContext {
  fullName: string;
  cruiseTitle: string;
  reason: string | null;
  cancelledBy: 'PASSENGER' | 'ADMIN';
}

export function bookingCancelledContent(ctx: BookingCancelledContext): NotificationContent {
  const subject = `Reserva cancelada — ${ctx.cruiseTitle}`;
  const reasonText = ctx.reason ? ` Motivo: ${ctx.reason}.` : '';
  const byText = ctx.cancelledBy === 'ADMIN' ? ' pela administração da plataforma' : '';
  const text = `Olá, ${ctx.fullName}. Sua reserva no cruzeiro "${ctx.cruiseTitle}" foi cancelada${byText}.${reasonText}`;
  const html = wrapHtml('Reserva cancelada', [
    `Olá, <strong>${ctx.fullName}</strong>.`,
    `Sua reserva no cruzeiro <strong>${ctx.cruiseTitle}</strong> foi cancelada${byText}.${reasonText}`,
  ]);
  return { subject, text, html };
}

/** Usado so pra type-narrow no chamador (ver NotificationsService) — nunca precisa de fato ser chamado com GENERIC. */
export function genericContent(subject: string, text: string): NotificationContent {
  return { subject, text, html: wrapHtml(subject, [text]) };
}

export type { NotificationType };
