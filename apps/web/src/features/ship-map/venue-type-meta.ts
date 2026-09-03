import {
  Martini,
  Music,
  Palmtree,
  Sparkles,
  Theater,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { VenueType } from '@/types/ship-map';

export const VENUE_TYPE_META: Record<VenueType, { label: string; icon: LucideIcon; className: string }> = {
  THEATER: { label: 'Teatro', icon: Theater, className: 'fill-violet-200 stroke-violet-500' },
  LOUNGE: { label: 'Lounge', icon: Music, className: 'fill-indigo-200 stroke-indigo-500' },
  BAR: { label: 'Bar', icon: Martini, className: 'fill-amber-200 stroke-amber-600' },
  POOL: { label: 'Piscina', icon: Waves, className: 'fill-cyan-200 stroke-cyan-600' },
  LEISURE: { label: 'Área de lazer', icon: Palmtree, className: 'fill-emerald-200 stroke-emerald-600' },
  OTHER: { label: 'Outra instalação', icon: Sparkles, className: 'fill-slate-200 stroke-slate-500' },
};

export const RESTAURANT_META: { label: string; icon: LucideIcon; className: string } = {
  label: 'Restaurante',
  icon: UtensilsCrossed,
  className: 'fill-rose-200 stroke-rose-500',
};
