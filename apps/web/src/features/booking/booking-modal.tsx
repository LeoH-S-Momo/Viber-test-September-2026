'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ErrorState } from '@/components/ui/error-state';
import { buttonVariants } from '@/components/ui/button-styles';
import { formatPrice } from '@/lib/format';
import {
  checkoutBooking,
  holdCabin,
  releaseHold,
  updateBookingDetails,
  type GuestFormInput,
} from '@/services/bookings.service';
import type { BookingHold } from '@/types/booking';
import type { DeckMapCabin, DeckMapDeck } from '@/types/ship-map';

type Step =
  | { name: 'holding' }
  | { name: 'guests'; booking: BookingHold }
  | { name: 'payment'; booking: BookingHold }
  | { name: 'success'; booking: BookingHold }
  | { name: 'declined' }
  | { name: 'error'; message: string };

type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PIX: 'PIX (aprovação imediata)',
  CREDIT_CARD: 'Cartão de crédito',
  BOLETO: 'Boleto (compensação em até 3 dias úteis)',
};

function emptyGuest(isPrimary: boolean): GuestFormInput {
  return { fullName: '', documentType: 'NATIONAL_ID', documentNumber: '', isPrimary };
}

const STEP_TITLE: Record<Step['name'], string> = {
  holding: 'Reservando cabine…',
  guests: 'Quem vai viajar?',
  payment: 'Pagamento',
  success: 'Reserva confirmada',
  declined: 'Pagamento recusado',
  error: 'Não foi possível reservar',
};

/**
 * Fluxo completo de reserva (hold -> hospedes -> pagamento), disparado ao
 * clicar "Selecionar cabine" no mapa do navio (ver cabin-booking-flow.tsx).
 * Cada instancia deste modal corresponde a UMA tentativa de reserva de UMA
 * cabine — por isso o hold acontece uma unica vez, no mount.
 */
export function BookingModal({
  cabin,
  deck,
  cruiseSlug,
  accessToken,
  onClose,
}: {
  cabin: DeckMapCabin;
  deck: DeckMapDeck;
  cruiseSlug: string;
  accessToken: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ name: 'holding' });
  const [guests, setGuests] = useState<GuestFormInput[]>([emptyGuest(true)]);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await holdCabin(accessToken, cruiseSlug, cabin.id);
      if (cancelled) return;
      if (result.ok) {
        setStep({ name: 'guests', booking: result.data });
      } else {
        setStep({ name: 'error', message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so uma vez, no mount (uma cabine por instancia do modal)
  }, []);

  async function handleClose() {
    // 'guests' OU 'payment' — o booking continua HELD ate o checkout de fato rodar (so vira
    // PAYMENT_PENDING/CONFIRMED dentro de checkout(), ver bookings.service.ts), entao fechar o
    // modal na tela de pagamento (o ponto de abandono mais comum: usuario compara formas de
    // pagamento e desiste) tambem precisa liberar o hold — sem isto a cabine ficava presa ate a
    // expiracao mesmo sem nenhum HELD chegar perto do checkout (bug encontrado e corrigido na
    // revisao geral de 2026-09-05).
    if ((step.name === 'guests' || step.name === 'payment') && step.booking.status === 'HELD') {
      // Best-effort — libera a cabine na hora em vez de deixar o usuario esperar a expiracao do
      // hold pra tentar de novo (ver CABIN_HOLD_MINUTES no backend). Nao bloqueia o fechamento.
      void releaseHold(accessToken, step.booking.id);
    }
    onClose();
  }

  function updateGuest(index: number, patch: Partial<GuestFormInput>) {
    setGuests((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function addGuest() {
    if (guests.length >= cabin.cabinCategory.maxOccupancy) return;
    setGuests((prev) => [...prev, emptyGuest(false)]);
  }

  function removeGuest(index: number) {
    setGuests((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGuestsSubmit(event: FormEvent) {
    event.preventDefault();
    if (step.name !== 'guests') return;
    setFormError(null);
    setSubmitting(true);
    const result = await updateBookingDetails(accessToken, step.booking.id, {
      guests,
      couponCode: couponCode.trim() || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setStep({ name: 'payment', booking: result.data });
  }

  async function handleCheckout() {
    if (step.name !== 'payment') return;
    setFormError(null);
    setSubmitting(true);
    const result = await checkoutBooking(accessToken, step.booking.id, paymentMethod);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    if (result.data.status === 'CANCELLED') {
      setStep({ name: 'declined' });
      return;
    }
    setStep({ name: 'success', booking: result.data });
  }

  return (
    <Modal title={STEP_TITLE[step.name]} onClose={() => void handleClose()}>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <div>
          <p className="font-medium text-slate-900">Cabine {cabin.code}</p>
          <p className="text-slate-500">
            {cabin.cabinCategory.name} · {deck.name ?? `Deck ${deck.number}`}
          </p>
        </div>
        {cabin.price && <p className="font-display text-lg font-bold text-brand-800">{formatPrice(cabin.price)}</p>}
      </div>

      {step.name === 'holding' && (
        <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
          Reservando esta cabine temporariamente para você…
        </div>
      )}

      {step.name === 'error' && (
        <div className="flex flex-col gap-4">
          <ErrorState message={step.message} />
          <button type="button" onClick={() => void handleClose()} className={buttonVariants({ variant: 'outline' })}>
            Fechar
          </button>
        </div>
      )}

      {step.name === 'guests' && (
        <form onSubmit={handleGuestsSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Até {cabin.cabinCategory.maxOccupancy} pessoas nesta cabine. O primeiro hóspede é o titular da reserva.
          </p>

          <div className="flex flex-col gap-4">
            {guests.map((guest, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Hóspede {index + 1} {guest.isPrimary && '(titular)'}
                  </p>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => removeGuest(index)}
                      aria-label="Remover hóspede"
                      className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`guest-name-${index}`} className="text-xs font-medium text-slate-700">
                      Nome completo
                    </label>
                    <input
                      id={`guest-name-${index}`}
                      required
                      minLength={2}
                      maxLength={150}
                      value={guest.fullName}
                      onChange={(e) => updateGuest(index, { fullName: e.target.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`guest-doc-type-${index}`} className="text-xs font-medium text-slate-700">
                      Documento
                    </label>
                    <select
                      id={`guest-doc-type-${index}`}
                      value={guest.documentType}
                      onChange={(e) => updateGuest(index, { documentType: e.target.value as GuestFormInput['documentType'] })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="NATIONAL_ID">RG/CPF</option>
                      <option value="PASSPORT">Passaporte</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`guest-doc-number-${index}`} className="text-xs font-medium text-slate-700">
                      Número
                    </label>
                    <input
                      id={`guest-doc-number-${index}`}
                      required
                      minLength={3}
                      maxLength={30}
                      value={guest.documentNumber}
                      onChange={(e) => updateGuest(index, { documentNumber: e.target.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {guests.length < cabin.cabinCategory.maxOccupancy && (
            <button
              type="button"
              onClick={addGuest}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start' })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar hóspede
            </button>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="coupon-code" className="text-xs font-medium text-slate-700">
              Cupom de desconto (opcional)
            </label>
            <input
              id="coupon-code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:w-64"
            />
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'primary' })}>
            {submitting ? 'Calculando…' : 'Continuar para pagamento'}
          </button>
        </form>
      )}

      {step.name === 'payment' && (
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="text-slate-900">{formatPrice(step.booking.subtotalAmount)}</dd>
            </div>
            {Number(step.booking.discountAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Desconto</dt>
                <dd className="text-brand-700">-{formatPrice(step.booking.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Taxa de embarque</dt>
              <dd className="text-slate-900">{formatPrice(step.booking.feeAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold">
              <dt className="text-slate-900">Total</dt>
              <dd className="text-slate-900">{formatPrice(step.booking.totalAmount)}</dd>
            </div>
          </dl>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-slate-700">Forma de pagamento</legend>
            {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
              <label
                key={method}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                />
                {PAYMENT_LABEL[method]}
              </label>
            ))}
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <button type="button" disabled={submitting} onClick={handleCheckout} className={buttonVariants({ variant: 'primary' })}>
            {submitting ? 'Processando pagamento…' : 'Confirmar pagamento'}
          </button>
        </div>
      )}

      {step.name === 'success' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
          {step.booking.status === 'CONFIRMED' ? (
            <p className="text-sm text-slate-600">
              Pagamento aprovado e reserva confirmada! Seu ingresso digital aparece em <strong>Minha viagem</strong> em
              instantes.
            </p>
          ) : paymentMethod === 'BOLETO' ? (
            <p className="text-sm text-slate-600">
              Reserva registrada — pagamento pendente de compensação (boleto). Assim que for aprovado, sua reserva é
              confirmada automaticamente e você recebe um e-mail.
            </p>
          ) : (
            // PIX/cartao tambem podem cair aqui num timeout do gateway (nao so boleto — ver
            // BookingsService.checkout) — dizer "aguardando boleto" pra quem nunca escolheu
            // boleto seria factualmente errado e confuso (bug encontrado e corrigido na revisao
            // geral de 2026-09-05).
            <p className="text-sm text-slate-600">
              Reserva registrada — o pagamento ainda está sendo processado. Assim que for aprovado, sua reserva é
              confirmada automaticamente e você recebe um e-mail.
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <Link href="/reservas" className={buttonVariants({ variant: 'primary' })}>
              Ver minha viagem
            </Link>
            <button type="button" onClick={() => void handleClose()} className={buttonVariants({ variant: 'outline' })}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {step.name === 'declined' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <XCircle className="h-10 w-10 text-red-600" aria-hidden="true" />
          <p className="text-sm text-slate-600">
            O pagamento foi recusado e a cabine foi liberada automaticamente. Você pode escolher outra forma de
            pagamento ou tentar novamente.
          </p>
          <button type="button" onClick={() => void handleClose()} className={buttonVariants({ variant: 'outline' })}>
            Fechar
          </button>
        </div>
      )}
    </Modal>
  );
}
