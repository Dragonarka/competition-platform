import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TrpcProvider } from '@/lib/trpc';
import { routing } from '@/i18n/routing';
import { IntlProviderClient } from '@/i18n/IntlProviderClient';
import { LocaleBootstrap } from '@/components/i18n/locale-bootstrap';
import '../globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'App' });
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      type: 'website',
      locale,
      siteName: t('title'),
      title: t('title'),
      description: t('description'),
      images: [
        {
          url: '/brand/og.svg',
          width: 1200,
          height: 630,
          alt: t('title'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: ['/brand/og.svg'],
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Tell next-intl which locale this RSC tree is rendering so getTranslations
  // works inside descendant server components.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <ClerkProvider afterSignOutUrl="/">
      <html
        lang={locale}
        className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <IntlProviderClient locale={locale} messages={messages}>
            <TrpcProvider>
              <LocaleBootstrap />
              {children}
            </TrpcProvider>
          </IntlProviderClient>
        </body>
      </html>
    </ClerkProvider>
  );
}
