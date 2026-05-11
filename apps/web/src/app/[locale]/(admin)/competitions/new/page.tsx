import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CreateCompetitionForm } from '@/components/admin/create-competition-form';
import { NewCompetitionHeader } from '@/components/admin/new-competition-header';

export default async function NewCompetitionPage() {
  const t = await getTranslations('Competitions');
  return (
    <div className="max-w-2xl">
      <Suspense
        fallback={<h1 className="text-2xl font-semibold text-foreground mb-6">{t('create')}</h1>}
      >
        <NewCompetitionHeader />
      </Suspense>
      <Suspense>
        <CreateCompetitionForm />
      </Suspense>
    </div>
  );
}
