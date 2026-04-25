import { CreateCompetitionForm } from '@/components/admin/create-competition-form';

export default function NewCompetitionPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Create Competition</h1>
      <CreateCompetitionForm />
    </div>
  );
}
