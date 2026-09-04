import { AnchorIcon, IdCard, Info, MapPin, Sailboat } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDate, formatTime } from '@/lib/format';
import type { MyBooking } from '@/types/booking';
import type { CruiseDetail } from '@/types/cruise';

const DOCUMENT_LABEL: Record<MyBooking['guests'][number]['documentType'], string> = {
  PASSPORT: 'Passaporte',
  NATIONAL_ID: 'RG/Identidade',
};

function InfoRow({ icon: Icon, label, value }: { icon: typeof Info; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-slate-700">{value}</p>
      </div>
    </div>
  );
}

/** Cabine, navio, documentos e embarque/desembarque — tudo com dado real da reserva/cruzeiro, nada inventado (ver ADR-0015). */
export function TripInfo({ booking, catalog }: { booking: MyBooking; catalog: CruiseDetail }) {
  return (
    <div>
      <SectionHeading
        eyebrow="Antes de embarcar"
        title="Informações importantes"
        icon={<Info className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Cabine, navio e o que cada passageiro precisa levar para o embarque."
      />

      <div className="grid grid-cols-1 gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <InfoRow
          icon={AnchorIcon}
          label="Embarque"
          value={`${catalog.embarkationPort.name}, ${catalog.embarkationPort.country} · ${formatDate(catalog.embarkationDate)} às ${formatTime(catalog.embarkationDate)}`}
        />
        <InfoRow
          icon={MapPin}
          label="Desembarque"
          value={`${catalog.disembarkationPort.name}, ${catalog.disembarkationPort.country} · ${formatDate(catalog.disembarkationDate)} às ${formatTime(catalog.disembarkationDate)}`}
        />
        <InfoRow
          icon={Sailboat}
          label="Navio"
          value={catalog.ship.description ? `${catalog.ship.name} — ${catalog.ship.description}` : catalog.ship.name}
        />
        <InfoRow
          icon={IdCard}
          label="Cabine"
          value={`${booking.cabin.code} · ${booking.cabin.cabinCategory.name} (até ${booking.cabin.cabinCategory.maxOccupancy} hóspedes)`}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Documentos por passageiro</p>
        <ul className="flex flex-col gap-2">
          {booking.guests.map((guest) => (
            <li key={guest.id} className="flex items-center justify-between text-sm text-slate-700">
              <span>{guest.fullName}</span>
              <span className="text-slate-500">
                {DOCUMENT_LABEL[guest.documentType]} · {guest.documentNumber}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Leve o documento acima (original, com foto) para o check-in — o mesmo usado no cadastro desta reserva.
        </p>
      </div>
    </div>
  );
}
