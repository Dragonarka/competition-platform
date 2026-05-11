import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware drop-in replacements for `next/navigation` and `next/link`.
// Use these everywhere in `apps/web/src/` so URL prefixes update automatically
// when the user switches language. Importing from `next-intl/navigation`
// directly is also fine; this barrel just bakes in the routing config.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
