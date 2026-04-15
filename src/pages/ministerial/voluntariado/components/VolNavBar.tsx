import { useNavigate, useLocation } from 'react-router-dom';
import { Home, QrCode, ClipboardCheck, Calendar, BarChart3, Settings, Monitor, Users, CalendarPlus, Church, CalendarOff, LayoutDashboard, List, ScanLine, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Staff navigation — all management tabs
const STAFF_NAV_ITEMS = [
  { label: 'Inicio', icon: Home, path: '/ministerial/voluntariado' },
  { label: 'Check-in', icon: ClipboardCheck, path: '/ministerial/voluntariado/checkin' },
  { label: 'Montar Escala', icon: CalendarPlus, path: '/ministerial/voluntariado/montar-escala' },
  { label: 'Voluntarios', icon: List, path: '/ministerial/voluntariado/lista' },
  { label: 'Escalas', icon: Calendar, path: '/ministerial/voluntariado/escalas' },
  { label: 'Equipes', icon: Users, path: '/ministerial/voluntariado/equipes' },
  { label: 'Tipos de Culto', icon: Church, path: '/ministerial/voluntariado/tipos-culto' },
  { label: 'Disponibilidade', icon: CalendarOff, path: '/ministerial/voluntariado/disponibilidade' },
  { label: 'QR Codes', icon: QrCode, path: '/ministerial/voluntariado/qrcodes' },
  { label: 'Relatorios', icon: BarChart3, path: '/ministerial/voluntariado/relatorios' },
  { label: 'Admin', icon: Settings, path: '/ministerial/voluntariado/admin' },
];

// Volunteer navigation — only their portal tabs
const VOL_NAV_ITEMS = [
  { label: 'Meu Painel', icon: LayoutDashboard, path: '/voluntariado/checkin/painel' },
  { label: 'Check-in', icon: ScanLine, path: '/voluntariado/checkin/checkin' },
  { label: 'Meu Perfil', icon: User, path: '/voluntariado/checkin/perfil' },
];

export default function VolNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isColaborador } = useAuth();

  // Se o usuario nao e admin/colaborador, e um voluntario — mostra navegacao simples.
  // Tambem, se a URL ja e de voluntario (/voluntariado/checkin/*), mostra navegacao simples.
  const isSimpleView = !isAdmin && !isColaborador || location.pathname.startsWith('/voluntariado/checkin');
  const NAV_ITEMS = isSimpleView ? VOL_NAV_ITEMS : STAFF_NAV_ITEMS;

  return (
    <div className="border-b border-border bg-card/50 mb-4 md:mb-6 -mx-4 md:-mx-6 px-2">
      <div className="flex gap-1 overflow-x-auto py-1 scrollbar-hide">
        {NAV_ITEMS.map(item => {
          const basePath = isSimpleView ? '/voluntariado/checkin' : '/ministerial/voluntariado';
          const isActive = location.pathname === item.path ||
            (item.path !== basePath && location.pathname.startsWith(item.path));
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
