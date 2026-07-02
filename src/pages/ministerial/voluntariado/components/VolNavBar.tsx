import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, QrCode, ClipboardCheck, Calendar, BarChart3, Settings, Users, CalendarPlus,
  Church, CalendarOff, LayoutDashboard, List, ScanLine, User, History, CalendarCheck,
  Inbox, UserPlus, Activity, ChevronDown, KeyRound, Mail,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type Item = { label: string; icon: any; path: string };
type Grupo = { label: string; icon: any; itens: Item[] };

const BASE = '/ministerial/voluntariado';

// Início é direto; o resto vira menus agrupados pra não estourar a largura.
const INICIO: Item = { label: 'Início', icon: Home, path: BASE };
const STAFF_GRUPOS: Grupo[] = [
  {
    label: 'Operação', icon: ClipboardCheck, itens: [
      { label: 'Check-in', icon: ClipboardCheck, path: `${BASE}/checkin` },
      { label: 'Escalas', icon: Calendar, path: `${BASE}/escalas` },
      { label: 'Montar Escala', icon: CalendarPlus, path: `${BASE}/montar-escala` },
      { label: 'Tipos de Culto', icon: Church, path: `${BASE}/tipos-culto` },
      { label: 'Disponibilidade', icon: CalendarOff, path: `${BASE}/disponibilidade` },
    ],
  },
  {
    label: 'Pessoas', icon: Users, itens: [
      { label: 'Voluntários', icon: List, path: `${BASE}/lista` },
      { label: 'Equipes', icon: Users, path: `${BASE}/equipes` },
      { label: 'Inscrições', icon: Inbox, path: `${BASE}/inscricoes` },
      { label: 'Encaminhados', icon: UserPlus, path: `${BASE}/encaminhados` },
      { label: 'E-mails', icon: Mail, path: `${BASE}/emails` },
      { label: 'Acessos', icon: KeyRound, path: `${BASE}/acessos` },
    ],
  },
  {
    label: 'Análise', icon: BarChart3, itens: [
      { label: 'Frequência', icon: Activity, path: `${BASE}/frequencia` },
      { label: 'Relatórios', icon: BarChart3, path: `${BASE}/relatorios` },
    ],
  },
  {
    label: 'Config', icon: Settings, itens: [
      { label: 'QR Codes', icon: QrCode, path: `${BASE}/qrcodes` },
      { label: 'Administração', icon: Settings, path: `${BASE}/admin` },
    ],
  },
];

// Navegacao simples do voluntário (poucas abas · sem agrupar)
const VOL_NAV_ITEMS: Item[] = [
  { label: 'Meu Painel', icon: LayoutDashboard, path: '/voluntariado/checkin/painel' },
  { label: 'Check-in', icon: ScanLine, path: '/voluntariado/checkin/checkin' },
  { label: 'Disponibilidade', icon: CalendarCheck, path: '/voluntariado/checkin/disponibilidade' },
  { label: 'Meus Check-ins', icon: History, path: '/voluntariado/checkin/historico' },
  { label: 'Meu Perfil', icon: User, path: '/voluntariado/checkin/perfil' },
];

export default function VolNavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isColaborador } = useAuth();
  const path = location.pathname;

  const isSimpleView = (!isAdmin && !isColaborador) || path.startsWith('/voluntariado/checkin');

  const btnCls = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`;

  return (
    <div className="border-b border-border bg-card/50 mb-4 md:mb-6 -mx-4 md:-mx-6 px-2">
      <div className="flex gap-1 overflow-x-auto py-1 scrollbar-hide">
        {isSimpleView ? (
          VOL_NAV_ITEMS.map(item => {
            const base = '/voluntariado/checkin';
            const active = path === item.path || (item.path !== base && path.startsWith(item.path));
            const Icon = item.icon;
            return (
              <button key={item.path} onClick={() => navigate(item.path)} className={btnCls(active)}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })
        ) : (
          <>
            <button onClick={() => navigate(INICIO.path)} className={btnCls(path === BASE)}>
              <Home className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{INICIO.label}</span>
            </button>
            {STAFF_GRUPOS.map(grupo => {
              const Icon = grupo.icon;
              const active = grupo.itens.some(i => path === i.path || path.startsWith(i.path + '/') || path === i.path);
              return (
                <DropdownMenu key={grupo.label}>
                  <DropdownMenuTrigger className={btnCls(active) + ' outline-none'}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{grupo.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    {grupo.itens.map(item => {
                      const ItemIcon = item.icon;
                      const itemActive = path === item.path || path.startsWith(item.path + '/');
                      return (
                        <DropdownMenuItem
                          key={item.path}
                          onClick={() => navigate(item.path)}
                          className={`gap-2 cursor-pointer ${itemActive ? 'text-primary font-medium' : ''}`}
                        >
                          <ItemIcon className="h-4 w-4" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
