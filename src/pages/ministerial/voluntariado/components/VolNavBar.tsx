import { useNavigate, useLocation } from 'react-router-dom';
import { Home, QrCode, ClipboardCheck, Calendar, BarChart3, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Inicio', icon: Home, path: '/ministerial/voluntariado' },
  { label: 'QR Codes', icon: QrCode, path: '/ministerial/voluntariado/qrcodes' },
  { label: 'Check-in', icon: ClipboardCheck, path: '/ministerial/voluntariado/checkin' },
  { label: 'Escalas', icon: Calendar, path: '/ministerial/voluntariado/escalas' },
  { label: 'Relatorios', icon: BarChart3, path: '/ministerial/voluntariado/relatorios' },
  { label: 'Admin', icon: Settings, path: '/ministerial/voluntariado/admin' },
];

export default function VolNavBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="border-b border-border bg-card/50 mb-6">
      <div className="flex gap-1 overflow-x-auto px-2 py-1">
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/ministerial/voluntariado' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
