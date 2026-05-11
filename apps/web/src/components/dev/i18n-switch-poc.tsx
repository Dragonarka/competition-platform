'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// AC #5 proof-of-concept: prove the locale swap re-renders translated keys
// without a full page reload. Story 8-2 builds the production language
// switcher; this component is only for the 8-1 acceptance check.
//
// REMOVE BEFORE MERGE — temporary verification harness, not a UI element.
export function I18nSwitchPoc() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const tApp = useTranslations('App');
  const tCommon = useTranslations('Common');

  function switchTo(next: 'en' | 'es') {
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      data-testid="i18n-switch-poc"
      className="rounded-md border border-dashed border-amber-400 bg-amber-50/40 p-3 text-xs"
    >
      <p className="font-semibold mb-1">🌐 i18n runtime POC (delete before merge)</p>
      <p className="mb-2">
        {tCommon('loading')} · {tApp('title')}
      </p>
      <div className="flex gap-2">
        {routing.locales.map((l) => (
          <button
            key={l}
            type="button"
            disabled={isPending || locale === l}
            onClick={() => switchTo(l)}
            className={`px-2 py-0.5 rounded border ${
              locale === l ? 'bg-amber-200 border-amber-500' : 'border-amber-300'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
