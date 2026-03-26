import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
      <div className="min-h-screen flex items-center justify-center bg-[#0e0e13]">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
      </div>
    );
  }

  return <AppContent />;
}

function AppContent() {
  useWebSocket();
  const { volume, setVolume, listening } = useWebRTC();

  return (
    <>
      <TopBar />
      <Sidebar listening={listening} />

      <main className="lg:pl-64 pt-20 pb-32 min-h-screen">
        <Routes>
          <Route path="/" element={<MusicQueueView />} />
          <Route path="/search" element={<SearchRequestView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/admin" element={<AdminRoute />} />
        </Routes>
      </main>

      <PlayerBar volume={volume} onVolumeChange={setVolume} />
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

export default function App() {
  return (
    <BrowserRouter>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen flex items-center justify-center bg-[#0e0e13]">
          <div className="text-center">
            <h1 className="text-4xl font-black text-purple-500 font-headline mb-2 tracking-tighter">AWKS</h1>
            <p className="text-on-surface-variant text-sm font-body mb-8">The Neon Nocturne</p>
            <SignIn
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'bg-surface-container-high border-none shadow-2xl shadow-purple-500/10',
                },
              }}
            />
          </div>
        </div>
      </SignedOut>
    </BrowserRouter>
  );
}
