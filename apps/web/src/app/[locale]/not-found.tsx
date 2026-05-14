import { Compass, Home } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Locale-aware not-found. Catches any 404 below the [locale] segment
// (typoed URLs, deleted competitions, stale share links). The route group
// layouts won't render around this — Next.js shows it bare — so we inline
// brand chrome to avoid a dead-end blank page.
export default async function LocaleNotFound() {
  const t = await getTranslations('NotFound');
  const tApp = await getTranslations('App');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Compass className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}>
            <Home className="h-4 w-4" />
            {t('goHome')}
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            {t('goDashboard')}
          </Link>
        </div>
        <p className="text-xs text-muted-foreground/60">{tApp('title')}</p>
      </div>
    </div>
  );
}
