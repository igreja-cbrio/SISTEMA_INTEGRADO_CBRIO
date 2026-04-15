import { useNavigate, useLocation } from 'react-router-dom';
import { Home, QrCode, ClipboardCheck, Calendar, BarChart3, Settings, Monitor, Users, CalendarPlus, Church, CalendarOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const ALL_NAV_ITEMS = [
  { label: 'Inicio', icon: Home, path: '/ministerial/voluntariado', volOnly: false },
  { label: 'Check-in', icon: ClipboardCheck, path: '/ministerial/voluntariado/checkin', volOnly: true },
  { label: 'Modo Totem', icon: Monitor, path: '/voluntariado/totem', volOnly: true },
  { label: 'Montar Escala', icon: CalendarPlus, path: '/ministerial/voluntariado/montar-escala', volOnly: false },
  { label: 'Escalas', icon: Calendar, path: '/ministerial/voluntariado/escalas', volOnly: false },
  { label: 'Equipes', icon: Users, path: '/ministerial/voluntariado/equipes', volOnly: false },
  { label: 'Tipos de Culto', icon: Church, path: '/ministerial/voluntariado/tipos-culto', volOnly: false },
  { label: 'Disponibilidade', icon: CalendarOff, path: '/ministerial/voluntariado/disponibilidade', volOnly: false },
  { label: 'QR Codes', icon: QrCode, path: '/ministerial/voluntariado/qrcodes', volOnly: false },
  { label: 'Relatorios', icon: BarChart3, path: '/ministerial/voluntariado/relatorios', volOnly: false },
  { label: 'Admin', icon: Settings, path: '/ministerial/voluntariado/admin', volOnly: false },
];

export default function VolNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isVoluntario } = useAuth();

  const NAV_ITEMS = isVoluntario
    ? ALL_NAV_ITEMS.filter(item => item.volOnly)
    : ALL_NAV_ITEMS.filter(item => item.label !== 'Modo Totem');

  return (
    <div className="border-b border-border bg-card/50 mb-4 md:mb-6 -mx-4 md:-mx-6 px-2">
      <div className="flex gap-1 overflow-x-auto py-1 scrollbar-hide">
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/ministerial/voluntariado' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
