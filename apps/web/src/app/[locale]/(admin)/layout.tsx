import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import { OrganizerLocaleReconciler } from '@/components/i18n/organizer-locale-reconciler';
import { AdminSidebar, AdminSidebarMobile } from '@/components/admin/admin-sidebar';

// All admin routes are Clerk-gated and cannot be prerendered.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const t = await getTranslations('AdminNav');
  const tApp = await getTranslations('App');

  const navItems = [
    { href: '/dashboard', icon: 'dashboard' as const, label: t('dashboard') },
    { href: '/competitions', icon: 'trophy' as const, label: t('competitions') },
  ];

  return (
    <div className="flex min-h-screen">
      <OrganizerLocaleReconciler />
      <AdminSidebar items={navItems} brand={tApp('title')} />
      <AdminSidebarMobile items={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
          <LanguageSwitcher />
          <UserButton appearance={{ elements: { avatarBox: 'h-8 w-8' } }} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
