import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/brand/logo';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const appTitle = t('App.title');
  const brandTagline = t('Auth.brandTagline');
  const brandSubtitle = t('Auth.brandSubtitle');

  return (
    <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary px-12 py-12 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,oklch(1_0_0/0.18),transparent_55%),radial-gradient(circle_at_bottom_right,oklch(0_0_0/0.35),transparent_60%)]"
        />
        <Link
          href="/"
          className="relative z-10 inline-flex items-center gap-2 font-heading text-sm font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary-foreground/15 backdrop-blur-sm">
            <Logo size={16} />
          </span>
          {appTitle}
        </Link>

        <div className="relative z-10 flex flex-col gap-3">
          <p className="font-heading text-3xl leading-tight font-semibold tracking-tight">
            {brandTagline}
          </p>
          <p className="max-w-md text-sm text-primary-foreground/80">{brandSubtitle}</p>
        </div>
      </aside>

      <main className="relative flex flex-col items-center justify-center bg-background px-6 py-10">
        <div className="absolute top-3 right-3 z-10">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
