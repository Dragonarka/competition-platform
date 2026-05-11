import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Protected routes — match BOTH /dashboard and /es/dashboard etc., so the
// regex tolerates an optional leading /<locale> segment. The `as-needed`
// locale prefix means English routes have no prefix; Spanish routes get /es/.
const isProtectedRoute = createRouteMatcher([
  '/(en|es)?/?dashboard(.*)',
  '/dashboard(.*)',
  '/(en|es)?/?competitions(.*)',
  '/competitions(.*)',
  '/(en|es)?/?present/(.*)',
  '/present/(.*)',
]);

// Compose middlewares: Clerk authenticates first (using its own matcher logic),
// then we hand off to next-intl which does locale detection and rewriting.
// Both middlewares are designed to be composed — Clerk wraps the request
// handler and next-intl produces the actual response.
export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // Match everything except Next internals, static assets, and tRPC.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
