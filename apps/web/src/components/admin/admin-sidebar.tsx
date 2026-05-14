'use client';

import { LayoutDashboard, Trophy, type LucideIcon } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type IconKey = 'dashboard' | 'trophy';

const iconMap: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  trophy: Trophy,
};

type AdminNavItem = {
  href: string;
  icon: IconKey;
  label: string;
};

export function AdminSidebar({ items, brand }: { items: AdminNavItem[]; brand: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Trophy className="size-4" />
        </span>
        <span className="font-heading text-sm font-semibold tracking-tight">{brand}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
        {items.map(({ href, icon, label }) => {
          const Icon = iconMap[icon];
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function AdminSidebarMobile({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-4 lg:hidden">
      {items.map(({ href, icon, label }) => {
        const Icon = iconMap[icon];
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            title={label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
            )}
          >
            <Icon size={20} />
          </Link>
        );
      })}
    </aside>
  );
}
