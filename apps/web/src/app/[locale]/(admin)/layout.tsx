import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { LayoutDashboard, Trophy } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// All admin routes are Clerk-gated and cannot be prerendered.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const t = await getTranslations('AdminNav');
  const tApp = await getTranslations('App');

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { href: '/competitions', icon: Trophy, label: t('competitions') },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Icon sidebar — 56px fixed width */}
      <aside className="w-14 flex flex-col items-center py-4 gap-1 border-r border-border bg-card shrink-0">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
          >
            <Icon size={20} />
          </Link>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="font-semibold text-foreground">{tApp('title')}</span>
          <UserButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
