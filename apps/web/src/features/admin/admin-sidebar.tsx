'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  CalendarRange,
  DoorClosed,
  FileClock,
  Mic2,
  ScanLine,
  Ship,
  Sparkles,
  Tag,
  Ticket,
  UtensilsCrossed,
  Users,
  Wallet,
} from 'lucide-react';

const LINKS = [
  { href: '/admin/usuarios', label: 'Usuários', icon: Users },
  { href: '/admin/organizadores', label: 'Organizadores', icon: Building2 },
  { href: '/admin/cruzeiros', label: 'Cruzeiros', icon: CalendarRange },
  { href: '/admin/navios', label: 'Navios', icon: Ship },
  { href: '/admin/cabines', label: 'Cabines', icon: DoorClosed },
  { href: '/admin/reservas', label: 'Reservas', icon: Ticket },
  { href: '/admin/pagamentos', label: 'Pagamentos', icon: Wallet },
  { href: '/admin/eventos', label: 'Eventos', icon: Mic2 },
  { href: '/admin/restaurantes', label: 'Restaurantes', icon: UtensilsCrossed },
  { href: '/admin/experiencias', label: 'Experiências', icon: Sparkles },
  { href: '/admin/cupons', label: 'Cupons', icon: Tag },
  { href: '/admin/tickets', label: 'Tickets', icon: Ticket },
  { href: '/admin/check-ins', label: 'Check-ins', icon: ScanLine },
  { href: '/admin/auditoria', label: 'Auditoria', icon: FileClock },
];

/** Navegacao do painel administrativo global — 13 modulos + auditoria (ver ADR-0018), so PLATFORM_ADMIN. */
export function AdminSidebar() {
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
