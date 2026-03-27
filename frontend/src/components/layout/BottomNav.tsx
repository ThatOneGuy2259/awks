import { NavLink } from 'react-router-dom';
import { useUserStore } from '../../stores/userStore';

const baseTabs = [
  { to: '/', icon: 'graphic_eq', label: 'Now Playing', primary: true },
  { to: '/search', icon: 'search', label: 'Search' },
  { to: '/history', icon: 'history', label: 'History' },
];

const adminTab = { to: '/admin', icon: 'dashboard_customize', label: 'Admin' };

export function BottomNav() {
  const isAdmin = useUserStore((s) => s.role === 'admin');
  const tabs = isAdmin ? [...baseTabs, adminTab] : baseTabs;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4 bg-surface-container-highest/60 backdrop-blur-3xl rounded-t-[3rem] shadow-[0_-8px_30px_rgba(0,0,0,0.15)]">
      {tabs.map(({ to, icon, label, primary }) => (
        <NavLink
          key={to + label}
          to={to}
          className={({ isActive }) =>
            primary
              ? 'flex flex-col items-center justify-center bg-primary text-on-primary-fixed rounded-full p-3 px-5 active:scale-110 transition-transform duration-300 shadow-xl shadow-primary/20'
              : `flex flex-col items-center justify-center p-3 hover:text-secondary transition-all ${
                  isActive ? 'text-secondary' : 'text-on-surface-variant'
                }`
          }
        >
          <span
            className="material-symbols-outlined mb-0.5"
            style={primary ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            {icon}
          </span>
          <span className="font-body font-semibold text-[8px] uppercase tracking-widest">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
