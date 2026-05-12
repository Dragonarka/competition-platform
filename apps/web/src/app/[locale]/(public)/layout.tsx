import { LanguageSwitcher } from '@/components/i18n/language-switcher';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative min-h-screen">
      <div className="absolute top-3 right-3 z-10">
        <LanguageSwitcher variant="compact" />
      </div>
      {children}
    </div>
  );
}
