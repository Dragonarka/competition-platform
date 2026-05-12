import { LanguageSwitcher } from '@/components/i18n/language-switcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative">
      <div className="absolute top-3 right-3 z-10">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
