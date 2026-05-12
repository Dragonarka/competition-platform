'use client';

import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { usePathname, useRouter } from '@/i18n/navigation';
import { writeStoredLocale } from '@/lib/i18n/preference-storage';
import { trpc } from '@/lib/trpc';
import type { SupportedLocale } from '@competition-platform/shared';
import { SUPPORTED_LOCALES } from '@competition-platform/shared';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'default' | 'compact';
  className?: string;
  onChange?: (next: SupportedLocale) => void;
}

// Shared switcher mounted in admin / judge / public / presenter / auth
// surfaces. Drives:
//   • next-intl router.replace(...) → swaps the locale segment of the URL.
//     The next-intl middleware writes the NEXT_LOCALE cookie on that response.
//   • localStorage mirror → safety net for cookie-clearing browsers (Safari
//     ITP, private mode).
//   • For authenticated organizers: best-effort `user.setPreference` write so
//     the choice follows them to other devices. Failures are logged but do
//     not block the UI.
export function LanguageSwitcher({
  variant = 'default',
  className,
  onChange,
}: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as SupportedLocale;
  const t = useTranslations('LanguageSwitcher');
  const { isLoaded, isSignedIn } = useAuth();
  const setPreference = trpc.user.setPreference.useMutation();
  const [isPending, startTransition] = useTransition();

  const isCompact = variant === 'compact';

  const handleChange = (next: SupportedLocale) => {
    if (next === locale) return;
    writeStoredLocale(next);
    if (isLoaded && isSignedIn) {
      // Mark that a locale switch is in progress so OrganizerLocaleReconciler
      // skips its redirect check on the first mount after navigation. Without
      // this flag the reconciler can race the in-flight setPreference mutation
      // and redirect back to the old locale (es→en case).
      try {
        sessionStorage.setItem('locale-switch-pending', '1');
      } catch {
        // Restricted iframe contexts — acceptable; the mutation will complete
        // before the user navigates back to an admin route.
      }
      setPreference.mutate(
        { locale: next },
        {
          onError: (err) => {
            console.warn('[i18n] failed to persist preference', err);
          },
        },
      );
    }
    onChange?.(next);
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <label
      className={cn(
        'inline-flex items-center gap-1 text-sm text-muted-foreground',
        isCompact && 'gap-0.5',
        className,
      )}
      aria-label={t('label')}
    >
      <Languages size={isCompact ? 14 : 16} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">{t('label')}</span>
      <select
        data-testid="language-switcher"
        value={locale}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value as SupportedLocale)}
        className={cn(
          'cursor-pointer rounded-md border border-input bg-transparent px-1.5 py-0.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          isCompact && 'border-none bg-transparent px-1 text-xs uppercase',
          isPending && 'opacity-60',
        )}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {isCompact
              ? t(code === 'en' ? 'shortEn' : 'shortEs')
              : t(code === 'en' ? 'english' : 'spanish')}
          </option>
        ))}
      </select>
    </label>
  );
}
