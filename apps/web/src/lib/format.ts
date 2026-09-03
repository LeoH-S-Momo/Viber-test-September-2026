const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** Preco vem do Prisma como Decimal serializado em string ("2200.00"). */
export function formatPrice(value: string | number): string {
  return currencyFormatter.format(Number(value));
}

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value));
}

export function formatDayMonth(value: string | Date): string {
  return dayMonthFormatter.format(new Date(value));
}

/** Horarios de dining slot vem como datetime "1970-01-01THH:mm:ssZ" (so a hora importa). */
export function formatTime(value: string | Date): string {
  return timeFormatter.format(new Date(value));
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function durationInNights(start: string | Date, end: string | Date): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export function formatDuration(start: string | Date, end: string | Date): string {
  const nights = durationInNights(start, end);
  return `${nights} ${nights === 1 ? 'noite' : 'noites'}`;
}

export function minPrice(pricings: Array<{ price: string | number }>): number | null {
  if (pricings.length === 0) return null;
  return Math.min(...pricings.map((p) => Number(p.price)));
}
