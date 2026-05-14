import * as React from 'react';

import { cn } from '@/lib/utils';

function PageHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        'group/page-header flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderText({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-text"
      className={cn('flex flex-col gap-1.5', className)}
      {...props}
    />
  );
}

function PageHeaderEyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-header-eyebrow"
      className={cn('text-xs font-medium tracking-wide text-muted-foreground uppercase', className)}
      {...props}
    />
  );
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn(
        'font-heading text-2xl leading-tight font-semibold tracking-tight sm:text-3xl',
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-header-description"
      className={cn('max-w-xl text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderText,
  PageHeaderEyebrow,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
};
