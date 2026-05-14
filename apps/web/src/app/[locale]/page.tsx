import { auth } from '@clerk/nextjs/server';
import { ArrowRight, Gauge, Trophy, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';

export const dynamic = 'force-dynamic';

export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await auth();
  if (userId) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('Landing');
  const features = [
    { icon: Trophy, key: 'cypher' as const },
    { icon: Users, key: 'judges' as const },
    { icon: Gauge, key: 'realtime' as const },
  ];

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[36rem] bg-[radial-gradient(ellipse_at_top,oklch(0.65_0.22_264/0.18),transparent_60%)]"
      />

      <header className="flex items-center justify-between px-6 py-5 sm:px-12">
        <span className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
          <Logo size={22} className="text-primary" />
          {t('brand')}
        </span>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {t('signIn')}
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: 'sm' })}>
            {t('getStarted')}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-12 sm:px-12 sm:py-20">
        <section className="flex flex-col items-start gap-6">
          <StatusBadge variant="live" dot>
            {t('eyebrow')}
          </StatusBadge>
          <h1 className="max-w-3xl font-heading text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            {t('headline')}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">{t('subhead')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className={buttonVariants({ size: 'lg' })}>
              {t('ctaPrimary')}
              <ArrowRight />
            </Link>
            <Link href="/sign-in" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              {t('ctaSecondary')}
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, key }) => (
            <Card key={key} className="bg-card/60">
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{t(`features.${key}.title`)}</CardTitle>
                <CardDescription>{t(`features.${key}.description`)}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border px-6 py-6 text-xs text-muted-foreground sm:px-12">
        {t('footer')}
      </footer>
    </div>
  );
}
