import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { ThemeModal } from '../settings/ThemeModal';
import { AwksLogo } from '../AwksLogo';
import { QuickSearch } from './QuickSearch';

export function TopBar() {
  const [showSettings, setShowSettings] = useState(false);
  const { pathname } = useLocation();
  const onSearchPage = pathname === '/search';

  return (
    <>
      <header className="fixed top-0 right-0 left-0 lg:left-64 z-50 bg-background/60 backdrop-blur-xl flex items-center px-6 py-4">
        <div className="flex items-center gap-2 lg:hidden">
          <AwksLogo className="h-7 w-auto" />
        </div>
        <div className="hidden lg:block" />

        {!onSearchPage && (
          <div className="flex-1 flex justify-center">
            <QuickSearch />
          </div>
        )}
        {onSearchPage && <div className="flex-1" />}

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(true)}
            className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
          >
            <span className="material-symbols-outlined leading-none">settings</span>
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
