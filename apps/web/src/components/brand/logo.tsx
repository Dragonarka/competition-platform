import * as React from 'react';

import { cn } from '@/lib/utils';

export function Logo({
  className,
  size = 16,
  ...props
}: React.SVGAttributes<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...props}
    >
      <path
        d="M 52 22 A 22 22 0 1 0 52 42"
        fill="none"
        stroke="currentColor"
        strokeWidth={9}
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="5" fill="currentColor" />
    </svg>
  );
}
