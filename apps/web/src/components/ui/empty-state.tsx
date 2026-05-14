import * as React from 'react';

import { cn } from '@/lib/utils';

function EmptyState({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center',
        className,
      )}
      {...props}
    />
  );
}

function EmptyStateIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state-icon"
      className={cn(
        'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6',
        className,
      )}
      {...props}
    />
  );
}

function EmptyStateTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="empty-state-title"
      className={cn('font-heading text-lg font-medium tracking-tight', className)}
      {...props}
    />
  );
}

function EmptyStateDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-state-description"
      className={cn('max-w-sm text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function EmptyStateAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-state-action"
      className={cn('mt-2 flex items-center gap-2', className)}
      {...props}
    />
  );
}

export { EmptyState, EmptyStateIcon, EmptyStateTitle, EmptyStateDescription, EmptyStateAction };
