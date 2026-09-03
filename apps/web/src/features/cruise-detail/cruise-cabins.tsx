import { BedDouble, Users } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { buttonVariants } from '@/components/ui/button-styles';
import { formatPrice } from '@/lib/format';
import type { CruiseCabinPricing } from '@/types/cruise';

export function CruiseCabins({ pricings }: { pricings: CruiseCabinPricing[] }) {
  if (pricings.length === 0) return null;

  return (
    <div id="cabines" className="scroll-mt-20">
      <SectionHeading
        eyebrow="Hospedagem"
        title="Categorias de cabine"
        icon={<BedDouble className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Escolha a acomodação ideal para sua viagem — preços por passageiro."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {pricings.map((pricing) => (
          <div
            key={pricing.id}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <h3 className="font-display text-lg font-bold text-slate-900">
              {pricing.cabinCategory.name}
            </h3>
            {pricing.cabinCategory.description && (
              <p className="mt-1 text-sm text-slate-600">{pricing.cabinCategory.description}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                até {pricing.cabinCategory.maxOccupancy} pessoas
              </span>
              {pricing.cabinCategory.sizeSqm && <span>{pricing.cabinCategory.sizeSqm} m²</span>}
            </div>

            {pricing.cancellationPolicy && (
              <p className="mt-2 text-xs text-slate-500">{pricing.cancellationPolicy}</p>
            )}

            <div className="mt-auto flex items-center justify-between pt-4">
              <p className="font-display text-2xl font-bold text-brand-800">
                {formatPrice(pricing.price)}
              </p>
              <span className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Consultar
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
