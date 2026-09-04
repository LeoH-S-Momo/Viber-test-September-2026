'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarRange, CheckCircle2, EyeOff } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import {
  getCruiseById,
  getShipCabinCategories,
  publishCruise,
  setCruisePricing,
  unpublishCruise,
  updateCruise,
} from '@/services/organizers.service';
import type { CruiseDetail } from '@/types/cruise';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700';

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Publicado',
  DRAFT: 'Rascunho',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
};

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

function PricingPanel({
  cruise,
  accessToken,
  onChanged,
}: {
  cruise: CruiseDetail;
  accessToken: string;
  onChanged: () => void;
}) {
  const [categories, setCategories] = useState<Array<{ id: string; name: string; maxOccupancy: number }>>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getShipCabinCategories(cruise.ship.id);
      if (!cancelled && result.ok) setCategories(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [cruise.ship.id]);

  const pricingByCategory = new Map(cruise.cabinPricings.map((p) => [p.cabinCategory.id, p]));

  async function handleSave(categoryId: string) {
    const price = Number(prices[categoryId]);
    if (!price || price <= 0) return;
    setSavingId(categoryId);
    setError(null);
    const result = await setCruisePricing(accessToken, cruise.id, { cabinCategoryId: categoryId, price });
    setSavingId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChanged();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-display font-bold text-slate-900">Preço por categoria de cabine</h3>
      <div className="flex flex-col gap-3">
        {categories.map((category) => {
          const existing = pricingByCategory.get(category.id);
          return (
            <div key={category.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-[10rem] flex-1">
                <p className="text-sm font-medium text-slate-800">{category.name}</p>
                <p className="text-xs text-slate-500">Até {category.maxOccupancy} hóspedes</p>
              </div>
              {existing && <Badge tone="success">{formatPrice(existing.price)}</Badge>}
              <input
                type="number"
                min={1}
                step="0.01"
                placeholder={existing ? 'Novo preço' : 'Preço (R$)'}
                value={prices[category.id] ?? ''}
                onChange={(e) => setPrices((prev) => ({ ...prev, [category.id]: e.target.value }))}
                className={`${inputClassName} w-32`}
              />
              <button
                type="button"
                onClick={() => handleSave(category.id)}
                disabled={savingId === category.id || !prices[category.id]}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {savingId === category.id ? 'Salvando…' : existing ? 'Atualizar' : 'Definir'}
              </button>
            </div>
          );
        })}
        {categories.length === 0 && <p className="text-sm text-slate-500">Este navio ainda não tem categorias de cabine cadastradas.</p>}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function EditCruiseContent({ cruiseId }: { cruiseId: string }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [cruise, setCruise] = useState<CruiseDetail | null>(null);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [statusActionBusy, setStatusActionBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [embarkationDate, setEmbarkationDate] = useState('');
  const [disembarkationDate, setDisembarkationDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await getCruiseById(accessToken, cruiseId);
    if (!result.ok) {
      setState({ status: 'error', message: result.message });
      return;
    }
    setCruise(result.data);
    setTitle(result.data.title);
    setTheme(result.data.theme);
    setDescription(result.data.description ?? '');
    setEmbarkationDate(toDateTimeLocal(result.data.embarkationDate));
    setDisembarkationDate(toDateTimeLocal(result.data.disembarkationDate));
    setState({ status: 'ready' });
  }, [accessToken, cruiseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSubmitting(true);
    setSaveError(null);
    const result = await updateCruise(accessToken, cruiseId, {
      title,
      theme,
      description: description || undefined,
      embarkationDate: new Date(embarkationDate),
      disembarkationDate: new Date(disembarkationDate),
    });
    setSubmitting(false);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    setCruise(result.data);
    setSavedAt(Date.now());
  }

  async function handlePublishToggle() {
    if (!accessToken || !cruise) return;
    setStatusActionBusy(true);
    setStatusActionError(null);
    const result = cruise.status === 'PUBLISHED' ? await unpublishCruise(accessToken, cruise.id) : await publishCruise(accessToken, cruise.id);
    setStatusActionBusy(false);
    if (!result.ok) {
      setStatusActionError(result.message);
      return;
    }
    await load();
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full max-w-2xl rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') return <ErrorState message={state.message} />;
  if (!cruise) return null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          eyebrow="Editar"
          title={cruise.title}
          icon={<CalendarRange className="h-6 w-6 text-accent-600" aria-hidden="true" />}
          description={`${cruise.ship.name} — status atual: ${STATUS_LABEL[cruise.status] ?? cruise.status}`}
        />
        <button
          type="button"
          onClick={handlePublishToggle}
          disabled={statusActionBusy}
          className={buttonVariants({ variant: cruise.status === 'PUBLISHED' ? 'outline' : 'primary' })}
        >
          {cruise.status === 'PUBLISHED' ? (
            <>
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              Despublicar
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Publicar
            </>
          )}
        </button>
      </div>

      {statusActionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {statusActionError}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <form onSubmit={handleSubmit} className="flex max-w-2xl flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className={labelClassName}>
                Título
              </label>
              <input id="title" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
            </div>
            <div>
              <label htmlFor="theme" className={labelClassName}>
                Tema
              </label>
              <input id="theme" required minLength={2} value={theme} onChange={(e) => setTheme(e.target.value)} className={inputClassName} />
            </div>
          </div>

          <div>
            <label htmlFor="description" className={labelClassName}>
              Descrição
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="embark-date" className={labelClassName}>
                Data/hora de embarque
              </label>
              <input
                id="embark-date"
                type="datetime-local"
                required
                value={embarkationDate}
                onChange={(e) => setEmbarkationDate(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="disembark-date" className={labelClassName}>
                Data/hora de desembarque
              </label>
              <input
                id="disembark-date"
                type="datetime-local"
                required
                value={disembarkationDate}
                onChange={(e) => setDisembarkationDate(e.target.value)}
                className={inputClassName}
              />
            </div>
          </div>

          {saveError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          )}
          {savedAt && !saveError && <p className="text-sm text-emerald-700">Alterações salvas.</p>}

          <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'primary', className: 'mt-2 self-start' })}>
            {submitting ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </form>

        {accessToken && <PricingPanel cruise={cruise} accessToken={accessToken} onChanged={load} />}
      </div>
    </>
  );
}

export default function EditCruisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <EditCruiseContent cruiseId={id} />
    </RequireRole>
  );
}
