import { redirect } from '@/i18n/navigation';

// `/` (and `/{locale}`) has no UI of its own — the admin dashboard at
// `/dashboard` is the landing surface for authenticated users. Clerk's
// middleware will bounce unauthenticated visitors to `/sign-in` from there.
//
// No translatable strings live here; an unconditional redirect keeps the
// home route from being a hardcoded-text vector for AC #1.
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/dashboard', locale });
}
