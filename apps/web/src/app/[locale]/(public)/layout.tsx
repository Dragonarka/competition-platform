import { setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="dark relative min-h-screen">
      <div className="absolute top-3 right-3 z-10">
        <LanguageSwitcher variant="compact" />
      </div>
      {children}
    </div>
  );
}
