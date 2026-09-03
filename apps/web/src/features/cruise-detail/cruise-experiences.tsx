import { PartyPopper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatPrice } from '@/lib/format';
import type { Experience } from '@/types/cruise';

export function CruiseExperiences({ experiences }: { experiences: Experience[] }) {
  if (experiences.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="Além do navio"
        title="Experiências"
        icon={<PartyPopper className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Passeios, oficinas e atividades extras para tornar a viagem ainda mais memorável."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {experiences.map((experience) => (
          <div key={experience.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-bold text-slate-900">{experience.title}</h3>
              <Badge tone={experience.isIncluded ? 'success' : 'neutral'}>
                {experience.isIncluded
                  ? 'Incluso'
                  : experience.price
                    ? formatPrice(experience.price)
                    : 'Avulso'}
              </Badge>
            </div>
            {experience.category && (
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{experience.category}</p>
            )}
            {experience.description && (
              <p className="mt-2 text-sm text-slate-600">{experience.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
