type DurationUnit = 's' | 'm' | 'h' | 'd';

const UNIT_TO_MS: Record<DurationUnit, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

function isDurationUnit(value: string): value is DurationUnit {
  return value in UNIT_TO_MS;
}

/** Converte "15m", "7d" etc. (mesmo formato aceito pelo `jsonwebtoken`) em milissegundos. */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  const amount = match?.[1];
  const unit = match?.[2];

  if (!amount || !unit || !isDurationUnit(unit)) {
    throw new Error(`Formato de duracao invalido: "${value}" (use algo como "15m" ou "7d")`);
  }

  return Number(amount) * UNIT_TO_MS[unit];
}
