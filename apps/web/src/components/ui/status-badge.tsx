import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted text-muted-foreground',
        success:
          'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
        warning:
          'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
        danger: 'border-destructive/20 bg-destructive/10 text-destructive',
        live: 'border-primary/30 bg-primary/10 text-primary',
        idle: 'border-border bg-card text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

type StatusBadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof statusBadgeVariants> & {
    dot?: boolean;
  };

function StatusBadge({
  className,
  variant = 'neutral',
  dot,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      className={cn(statusBadgeVariants({ variant, className }))}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn(
            'inline-block size-1.5 rounded-full bg-current',
            variant === 'live' && 'animate-pulse-ring',
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
