import { Calendar, MapPin, Moon, Ship as ShipIcon, Tag, Users } from 'lucide-react';
import { formatDate, formatDuration, formatPrice, minPrice } from '@/lib/format';
import type { CruiseDetail } from '@/types/cruise';

export function CruiseOverview({ cruise }: { cruise: CruiseDetail }) {
  const from = minPrice(cruise.cabinPricings);

  const facts: Array<{ icon: React.ReactNode; label: string; value: string }> = [
    {
      icon: <Calendar className="h-5 w-5" aria-hidden="true" />,
      label: 'Embarque',
      value: formatDate(cruise.embarkationDate),
    },
    {
      icon: <Moon className="h-5 w-5" aria-hidden="true" />,
      label: 'Duração',
      value: formatDuration(cruise.embarkationDate, cruise.disembarkationDate),
    },
    {
      icon: <MapPin className="h-5 w-5" aria-hidden="true" />,
      label: 'Origem',
      value: `${cruise.embarkationPort.name}, ${cruise.embarkationPort.country}`,
    },
    {
      icon: <MapPin className="h-5 w-5" aria-hidden="true" />,
      label: 'Destino final',
      value: `${cruise.disembarkationPort.name}, ${cruise.disembarkationPort.country}`,
    },
    {
      icon: <ShipIcon className="h-5 w-5" aria-hidden="true" />,
      label: 'Navio',
      value: cruise.ship.name,
    },
    {
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
      label: 'Capacidade',
      value: `${cruise.ship.passengerCapacity.toLocaleString('pt-BR')} passageiros`,
    },
    {
      icon: <Tag className="h-5 w-5" aria-hidden="true" />,
      label: 'Preço inicial',
      value: from !== null ? formatPrice(from) : 'Consulte',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h2 className="font-display text-2xl font-bold text-slate-900">Sobre este cruzeiro</h2>
        <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">
          {cruise.description ?? 'Descrição em breve.'}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-1">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-start gap-3">
            <span className="mt-0.5 text-brand-600">{fact.icon}</span>
            <div>
              <dt className="text-xs text-slate-500">{fact.label}</dt>
              <dd className="font-medium text-slate-900">{fact.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
