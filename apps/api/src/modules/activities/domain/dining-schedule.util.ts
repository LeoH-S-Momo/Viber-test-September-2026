import { ConflictException } from '@nestjs/common';

/**
 * `DiningSlot.startTime`/`endTime` sao horarios RECORRENTES (`@db.Time` — o
 * Prisma devolve um `Date` com a parte de data arbitraria, so a hora
 * importa). Uma reserva de verdade precisa de uma data especifica da
 * viagem — esta funcao combina as duas em uma janela absoluta, pura,
 * usada tanto pela checagem de conflito de horario quanto pela exibicao.
 */
export function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setUTCHours(time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds(), 0);
  return combined;
}

export function diningSlotWindowOn(date: Date, startTime: Date, endTime: Date): { start: Date; end: Date } {
  const start = combineDateAndTime(date, startTime);
  let end = combineDateAndTime(date, endTime);
  // Um jantar que atravessa a meia-noite (raro, mas o schema permite qualquer horario) — a hora de
  // fim "menor" que a de inicio significa que termina no dia seguinte, nao que a janela e invertida.
  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

/**
 * Uma reserva (evento ou restaurante) so faz sentido dentro do periodo real
 * do cruzeiro — evita marcar um jantar "no dia 47" de um cruzeiro de 5
 * dias. Comparação por DATA (nao hora): o dia de embarque e desembarque
 * contam inteiros.
 */
export function assertDateWithinCruise(date: Date, embarkationDate: Date, disembarkationDate: Date): void {
  const dayOnly = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const target = dayOnly(date);
  if (target < dayOnly(embarkationDate) || target > dayOnly(disembarkationDate)) {
    throw new ConflictException('Esta data esta fora do período do cruzeiro.');
  }
}
