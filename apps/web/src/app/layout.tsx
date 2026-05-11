// Root layout for the `[locale]` segment structure. Next.js requires exactly
// one root layout; with locale-segment routing, the actual `<html>` element
// and providers live in `[locale]/layout.tsx` so the `lang` attribute can be
// set from the resolved locale. This file simply passes children through.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
