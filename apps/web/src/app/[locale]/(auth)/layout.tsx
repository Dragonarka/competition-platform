import { setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative">
      <div className="absolute top-3 right-3 z-10">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
