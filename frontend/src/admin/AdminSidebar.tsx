import { NavLink } from 'react-router-dom';
import { useWs } from './WebSocketProvider';

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/admin/feed', label: 'Live Feed', icon: '📡' },
  { to: '/admin/config', label: 'Config', icon: '⚙️' },
];

export default function AdminSidebar() {
  const { isConnected } = useWs();

  return (
    <aside className="w-56 border-r border-white/5 min-h-[calc(100vh-73px)] p-4 shrink-0">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-400">
            {isConnected ? 'WS Connected' : 'WS Disconnected'}
          </span>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                isActive ? 'bg-teal/10 text-teal' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
