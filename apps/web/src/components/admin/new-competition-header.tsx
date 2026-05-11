'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function NewCompetitionHeader() {
  const searchParams = useSearchParams();
  const isSimulation = searchParams.get('simulation') === 'true';
  const t = useTranslations('Competitions');

  return (
    <h1 className="text-2xl font-semibold text-foreground mb-6">
      {isSimulation ? t('createSimulation') : t('create')}
    </h1>
  );
}
