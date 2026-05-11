import { Suspense } from 'react';
import { CreateCompetitionForm } from '@/components/admin/create-competition-form';
import { NewCompetitionHeader } from '@/components/admin/new-competition-header';

export default function NewCompetitionPage() {
  return (
    <div className="max-w-2xl">
      <Suspense
        fallback={
          <h1 className="text-2xl font-semibold text-foreground mb-6">Create Competition</h1>
        }
      >
        <NewCompetitionHeader />
      </Suspense>
      <Suspense>
        <CreateCompetitionForm />
      </Suspense>
    </div>
  );
}
