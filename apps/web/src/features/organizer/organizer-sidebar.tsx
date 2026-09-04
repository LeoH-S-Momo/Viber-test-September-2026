'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarRange,
  LayoutDashboard,
  Mic2,
  ScanLine,
  Ship,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Users,
  FileBarChart,
} from 'lucide-react';

const LINKS = [
  { href: '/organizador/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/organizador/cruzeiros', label: 'Cruzeiros', icon: CalendarRange },
  { href: '/organizador/navios', label: 'Navios', icon: Ship },
  { href: '/organizador/eventos', label: 'Eventos', icon: Mic2 },
  { href: '/organizador/restaurantes', label: 'Restaurantes', icon: UtensilsCrossed },
  { href: '/organizador/experiencias', label: 'Experiências', icon: Sparkles },
  { href: '/organizador/reservas', label: 'Reservas', icon: Ticket },
  { href: '/organizador/passageiros', label: 'Passageiros', icon: Users },
  { href: '/organizador/relatorios', label: 'Relatórios', icon: FileBarChart },
  { href: '/organizador/check-in', label: 'Check-in', icon: ScanLine },
];

/** Navegacao do painel do organizador — 9 areas de gestao + check-in (ver ADR-0016). */
export function OrganizerSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 flex-col gap-1 sm:w-56">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active ? 'bg-brand-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
