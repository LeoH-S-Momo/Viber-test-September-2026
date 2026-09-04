import { PartyPopper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import type { MyBookingExperience } from '@/types/booking';

/**
 * Somente leitura, de propósito: experiências são selecionadas no checkout
 * (`BookingsService.updateDetails`, reserva ainda `HELD`) — mudar isso depois
 * de `CONFIRMED` fica fora de escopo desta etapa (ver ADR-0014). Diferente de
 * eventos/restaurantes, `Experience` não tem horário no schema, então também
 * não entra na timeline (ver ADR-0015).
 */
export function TripExperiences({ experiences }: { experiences: MyBookingExperience[] }) {
  if (experiences.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="Além do navio"
        title="Experiências incluídas"
        icon={<PartyPopper className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Selecionadas no momento da reserva — sem horário fixo, combine durante a viagem."
      />
      <ul className="flex flex-wrap gap-2">
        {experiences.map((experience) => (
          <li key={experience.id}>
            <Badge tone="brand">
              {experience.experience.title} · {experience.partySize} pessoa{experience.partySize > 1 ? 's' : ''}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
