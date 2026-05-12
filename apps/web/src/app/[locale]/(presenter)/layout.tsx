import { LanguageSwitcher } from '@/components/i18n/language-switcher';

export default function PresenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-50 relative">
      <div className="absolute top-2 right-2 z-10 opacity-30 hover:opacity-100 transition-opacity">
        <LanguageSwitcher variant="compact" />
      </div>
      {children}
    </div>
  );
}
