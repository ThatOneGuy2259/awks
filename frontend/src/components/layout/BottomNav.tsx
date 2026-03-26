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
    <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4 bg-[#25252d]/60 backdrop-blur-3xl rounded-t-[3rem] shadow-[0_-8px_30px_rgb(165,51,255,0.08)]">
      {tabs.map(({ to, icon, label, primary }) => (
        <NavLink
          key={to + label}
          to={to}
          className={({ isActive }) =>
            primary
              ? 'flex flex-col items-center justify-center bg-purple-500 text-black rounded-full p-3 px-5 active:scale-110 transition-transform duration-300 shadow-xl shadow-purple-500/20'
              : `flex flex-col items-center justify-center p-3 hover:text-cyan-400 transition-all ${
                  isActive ? 'text-cyan-400' : 'text-gray-400'
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
