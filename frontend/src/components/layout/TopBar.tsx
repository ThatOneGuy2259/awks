import { useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { ThemeModal } from '../settings/ThemeModal';

export function TopBar() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className="fixed top-0 right-0 left-0 lg:left-64 z-50 bg-background/60 backdrop-blur-xl flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-2 lg:hidden">
          <span className="text-2xl font-black text-primary tracking-tighter font-headline">AWKS</span>
        </div>
        <div className="hidden lg:block" />

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(true)}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-10 h-10',
              },
            }}
          />
        </div>
      </header>

      {showSettings && <ThemeModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
