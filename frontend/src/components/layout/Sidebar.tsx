import { NavLink } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { useUserStore } from '../../stores/userStore';

const baseNavItems = [
  { to: '/', icon: 'graphic_eq', label: 'Now Playing' },
  { to: '/search', icon: 'search', label: 'Search' },
  { to: '/history', icon: 'history', label: 'History' },
];

const adminNavItem = { to: '/admin', icon: 'dashboard_customize', label: 'Admin' };

interface SidebarProps {
  listening?: boolean;
}

export function Sidebar({ listening }: SidebarProps) {
  const { signOut } = useClerk();
  const isAdmin = useUserStore((s) => s.role === 'admin');
  const navItems = isAdmin ? [...baseNavItems, adminNavItem] : baseNavItems;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 border-r border-gray-800/20 bg-[#131319] hidden lg:flex flex-col py-8 z-40">
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full signature-gradient flex items-center justify-center text-on-primary-fixed shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined">graphic_eq</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-purple-500 font-headline leading-tight">AWKS</h2>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold font-label">
            Fill the Awkward Silence
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-2 px-2">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              isActive
                ? 'bg-purple-500/10 text-purple-400 border-r-2 border-purple-500 px-4 py-3 flex items-center gap-3 font-body font-medium text-sm transition-all'
                : 'text-gray-500 px-4 py-3 flex items-center gap-3 font-body font-medium text-sm hover:bg-white/5 hover:text-purple-300 transition-all'
            }
          >
            <span className="material-symbols-outlined">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-4 mt-auto space-y-2">
        {listening === false && (
          <div className="px-4 py-2 flex items-center gap-3 text-xs text-amber-400/80">
            <span className="material-symbols-outlined text-sm animate-pulse">hearing</span>
            <span>Click anywhere to listen</span>
          </div>
        )}
        <div className="pt-4 border-t border-outline-variant/10">
          <a className="text-gray-500 px-4 py-2 flex items-center gap-3 text-xs hover:text-purple-300 transition-colors" href="#">
            <span className="material-symbols-outlined">help</span>
            <span>Help</span>
          </a>
          <button
            onClick={() => signOut()}
            className="text-gray-500 px-4 py-2 flex items-center gap-3 text-xs hover:text-purple-300 transition-colors w-full text-left"
          >
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
