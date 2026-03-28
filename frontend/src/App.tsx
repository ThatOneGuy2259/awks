import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { BottomNav } from './components/layout/BottomNav';
import { PlayerBar } from './components/layout/PlayerBar';
import { MusicQueueView } from './pages/MusicQueueView';
import { SearchRequestView } from './pages/SearchRequestView';
import { AdminDashboardView } from './pages/AdminDashboardView';
import { HistoryView } from './pages/HistoryView';
import { useWebSocket } from './hooks/useWebSocket';
import { useWebRTC } from './hooks/useWebRTC';
import { setGetTokenFn, api } from './lib/api';
import { useUserStore } from './stores/userStore';
import { useThemeStore, applyTheme } from './stores/themeStore';
import { getAllThemes } from './stores/customThemeStore';
import { AwksLogo } from './components/AwksLogo';
import { ToastContainer } from './components/ToastContainer';
import { ConnectionBanner } from './components/ConnectionBanner';
import { BackgroundEffectCanvas } from './components/BackgroundEffect';

// Apply saved theme on module load (before React renders)
const startupThemeId = useThemeStore.getState().currentTheme;
const startupTheme = getAllThemes().find((t) => t.id === startupThemeId);
if (startupTheme) {
  applyTheme(startupTheme);
} else {
  applyTheme('neon_groove');
}

function AuthenticatedApp() {
  const { getToken } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setGetTokenFn(() => getToken());
    // Sync user to backend shadow table before rendering app
    api.syncMe()
      .then((user) => {
        console.log('[syncMe] response:', user);
        useUserStore.getState().setUser(user);
      })
      .catch((err) => console.error('[syncMe] failed:', err))
      .finally(() => setReady(true));
  }, [getToken]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
      </div>
    );
  }

  return <AppContent />;
}

function AppContent() {
  useWebSocket();
  const { volume, setVolume, listening, analyserRef } = useWebRTC();

  return (
    <>
      <BackgroundEffectCanvas analyserRef={analyserRef} />
      <TopBar />
      <Sidebar listening={listening} />
      <ConnectionBanner />

      <main className="lg:pl-64 pt-20 pb-32 min-h-screen relative z-[2]">
        <Routes>
          <Route path="/" element={<MusicQueueView />} />
          <Route path="/search" element={<SearchRequestView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/admin" element={<AdminRoute />} />
        </Routes>
      </main>

      <PlayerBar volume={volume} onVolumeChange={setVolume} analyserRef={analyserRef} />
      <BottomNav />
    </>
  );
}

function AdminRoute() {
  const isAdmin = useUserStore((s) => s.role === 'admin');
  if (!isAdmin) {
    return (
      <div className="text-center py-24 text-on-surface-variant">
        <span className="material-symbols-outlined text-5xl mb-4 block">lock</span>
        <p className="text-xl font-bold">Admin access required</p>
      </div>
    );
  }
  return <AdminDashboardView />;
}

function GoogleOnlyLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <AwksLogo className="h-14 w-auto mx-auto mb-2" />
        <p className="text-on-surface-variant text-xs font-label uppercase tracking-widest mb-8">Fill the Awkward Silence</p>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: { backgroundColor: 'transparent', boxShadow: 'none', border: 'none' },
              socialButtonsBlockButton: {
                backgroundColor: 'var(--color-surface-container-high)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '9999px',
                padding: '12px 32px',
              },
              socialButtonsBlockButtonText: { color: 'var(--color-on-surface)', fontWeight: '600' },
              headerTitle: { display: 'none' },
              headerSubtitle: { display: 'none' },
              dividerRow: { display: 'none' },
              formFieldRow: { display: 'none' },
              formButtonPrimary: { display: 'none' },
              identityPreview: { display: 'none' },
              alternativeMethods: { display: 'none' },
              backLink: { display: 'none' },
              footer: { display: 'none' },
              footerAction: { display: 'none' },
            },
          }}
        />
      </div>
    </div>
  );
}

function FullLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <AwksLogo className="h-14 w-auto mx-auto mb-2" />
        <p className="text-on-surface-variant text-xs font-label uppercase tracking-widest mb-8">Fill the Awkward Silence</p>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: {
                backgroundColor: 'var(--color-surface-container-high)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '1rem',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
              },
              socialButtonsBlockButton: {
                backgroundColor: 'var(--color-surface-container)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '9999px',
              },
              socialButtonsBlockButtonText: { color: 'var(--color-on-surface)' },
              formFieldInput: {
                backgroundColor: 'var(--color-surface-container-low)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--color-on-surface)',
                borderRadius: '0.75rem',
              },
              formFieldLabel: { color: 'var(--color-on-surface-variant)' },
              formButtonPrimary: {
                background: 'var(--signature-gradient)',
                borderRadius: '9999px',
                fontWeight: '700',
              },
              headerTitle: { color: 'var(--color-on-surface)' },
              headerSubtitle: { color: 'var(--color-on-surface-variant)' },
              dividerLine: { borderColor: 'rgba(255,255,255,0.1)' },
              dividerText: { color: 'var(--color-on-surface-variant)' },
              footerActionLink: { color: 'var(--color-primary)' },
              footer: { display: 'none' },
            },
          }}
        />
      </div>
    </div>
  );
}

function LoginRouter() {
  const location = useLocation();

  if (location.pathname === '/login/credentials') {
    return <FullLogin />;
  }
  return <GoogleOnlyLogin />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
      <SignedOut>
        <LoginRouter />
      </SignedOut>
    </BrowserRouter>
  );
}
