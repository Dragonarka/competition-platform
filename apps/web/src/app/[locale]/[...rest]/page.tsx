import { notFound } from 'next/navigation';

// Catch-all for unmatched paths under the [locale] segment. Calling
// notFound() here lets Next.js render the locale-aware not-found.tsx
// (branded, translated) instead of falling through to the root
// not-found which has no locale context.
//
// Without this file, `/es/no-existe` renders the bare root 404. With
// it, the same URL renders the branded Spanish 404.
export default function CatchAll() {
  notFound();
}
