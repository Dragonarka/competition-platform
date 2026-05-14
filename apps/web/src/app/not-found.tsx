// Fallback not-found for routes outside the [locale] segment. The intl
// middleware should rewrite all unknown URLs into the locale tree, so this
// rarely renders — but Next.js requires a root not-found to handle the
// edge cases. Hardcoded English; no locale context available here.
import Link from 'next/link';

export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '2rem',
          background: '#0a0a0a',
          color: '#fafafa',
        }}
      >
        <main style={{ textAlign: 'center', maxWidth: '32rem' }}>
          <p
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#888',
              margin: 0,
            }}
          >
            404
          </p>
          <h1 style={{ fontSize: '1.75rem', margin: '0.5rem 0 1rem' }}>Page not found</h1>
          <p style={{ color: '#aaa', margin: '0 0 1.5rem' }}>
            The link may be broken or the page no longer exists.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              background: '#fafafa',
              color: '#0a0a0a',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Back to home
          </Link>
        </main>
      </body>
    </html>
  );
}
