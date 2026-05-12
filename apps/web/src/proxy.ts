import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Protected routes — cover both the English (no prefix, as-needed strategy)
// and Spanish (/es/ prefix) variants of each protected path.
// path-to-regexp v6 (used by createRouteMatcher) does not support unnamed
// capture groups with the `?` modifier; list each locale explicitly instead.
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/es/dashboard(.*)',
  '/competitions(.*)',
  '/es/competitions(.*)',
  '/present/(.*)',
  '/es/present/(.*)',
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
