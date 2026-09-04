'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';
import { createExperience, getMyCruises, getMyExperiences } from '@/services/organizers.service';
import type { CruiseSummary } from '@/types/cruise';
import type { OrganizerExperience } from '@/types/organizer';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; experiences: OrganizerExperience[] };

function NewExperienceForm({
  accessToken,
  cruises,
  onCreated,
}: {
  accessToken: string;
  cruises: CruiseSummary[];
  onCreated: () => void;
}) {
  const [cruiseId, setCruiseId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [isIncluded, setIsIncluded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!cruiseId) return;
    setSubmitting(true);
    setError(null);
    const result = await createExperience(accessToken, {
      cruiseId,
      title,
      category: category || undefined,
      price: !isIncluded && price ? Number(price) : undefined,
      capacity: capacity ? Number(capacity) : undefined,
      isIncluded,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTitle('');
    setCategory('');
    setPrice('');
    setCapacity('');
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="experience-cruise" className={labelClassName}>
            Cruzeiro
          </label>
          <select id="experience-cruise" required value={cruiseId} onChange={(e) => setCruiseId(e.target.value)} className={inputClassName}>
            <option value="">Selecione um cruzeiro</option>
            {cruises.map((cruise) => (
              <option key={cruise.id} value={cruise.id}>
                {cruise.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="experience-title" className={labelClassName}>
            Título
          </label>
          <input id="experience-title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="experience-category" className={labelClassName}>
            Categoria (opcional)
          </label>
          <input id="experience-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="experience-capacity" className={labelClassName}>
            Capacidade (opcional)
          </label>
          <input id="experience-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="experience-price" className={labelClassName}>
            Preço (se não incluso)
          </label>
          <input
            id="experience-price"
            type="number"
            min={0}
            step="0.01"
            disabled={isIncluded}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isIncluded} onChange={(e) => setIsIncluded(e.target.checked)} />
        Incluída na tarifa (sem custo adicional)
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
        {submitting ? 'Criando…' : 'Criar experiência'}
      </button>
    </form>
  );
}

function ExperiencesContent() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [cruises, setCruises] = useState<CruiseSummary[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const [experiencesResult, cruisesResult] = await Promise.all([getMyExperiences(accessToken), getMyCruises(accessToken)]);
    if (cruisesResult.ok) setCruises(cruisesResult.data.data);
    setState(
      experiencesResult.ok ? { status: 'ready', experiences: experiencesResult.data } : { status: 'error', message: experiencesResult.message },
    );
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Além do navio"
        title="Experiências"
        icon={<Sparkles className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Passeios e atividades extras oferecidas nos seus cruzeiros."
      />

      {state.status === 'loading' && <Skeleton className="h-32 w-full rounded-2xl" />}
      {state.status === 'error' && <ErrorState message={state.message} />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-6">
          {state.experiences.length === 0 ? (
            <EmptyState icon={<Sparkles className="h-6 w-6" aria-hidden="true" />} title="Nenhuma experiência cadastrada ainda" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.experiences.map((experience) => (
                <div key={experience.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-bold text-slate-900">{experience.title}</h3>
                    <Badge tone={experience.isIncluded ? 'success' : 'neutral'}>
                      {experience.isIncluded ? 'Incluso' : experience.price ? formatPrice(experience.price) : 'Avulso'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{experience.cruise.title}</p>
                  {experience.category && <p className="mt-1 text-xs text-slate-500">{experience.category}</p>}
                </div>
              ))}
            </div>
          )}

          {accessToken && <NewExperienceForm accessToken={accessToken} cruises={cruises} onCreated={load} />}
        </div>
      )}
    </>
  );
}

export default function OrganizerExperiencesPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <ExperiencesContent />
    </RequireRole>
  );
}
