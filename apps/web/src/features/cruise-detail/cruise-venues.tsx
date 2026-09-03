import { Sparkles, Users } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import type { Venue } from '@/types/cruise';

export function CruiseVenues({ venues }: { venues: Venue[] }) {
  if (venues.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="A bordo"
        title="Atrações do navio"
        icon={<Sparkles className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Espaços e estruturas disponíveis para os passageiros durante a viagem."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue) => (
          <div key={venue.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-display font-bold text-slate-900">{venue.name}</h3>
            {venue.description && (
              <p className="mt-1.5 text-sm text-slate-600">{venue.description}</p>
            )}
            {venue.capacity !== null && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Capacidade para {venue.capacity.toLocaleString('pt-BR')} pessoas
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
