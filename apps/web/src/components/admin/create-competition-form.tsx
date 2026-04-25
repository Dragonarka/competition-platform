'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { createCompetitionSchema } from '@competition-platform/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

export function CreateCompetitionForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = trpc.tournament.create.useMutation({
    onSuccess(data) {
      router.push(`/competitions/${data.id}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const input = {
      name: name.trim(),
      date: date ? `${date}T12:00:00.000Z` : null,
      description: description.trim() || null,
    };

    const result = createCompetitionSchema.safeParse(input);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    createMutation.mutate(result.data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Dance Battle 2026"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the competition"
              rows={3}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && (
              <p id="description-error" className="text-sm text-destructive">
                {errors.description}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Competition'}
          </Button>
        </CardFooter>
      </Card>

      {createMutation.error && (
        <p className="mt-4 text-sm text-destructive">{createMutation.error.message}</p>
      )}
    </form>
  );
}
