import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../contexts/AuthContext';
import { Kanban, ListOrdered, CalendarDays, BarChart3, Settings } from 'lucide-react';

// Header compartilhado das 5 telas Marketing · destaca a atual
// e sempre mostra link pra todas as outras (Admin so pra coordenador).
export default function MarketingNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, modulePerms } = useAuth();
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const here = (path) => location.pathname === path;

  const items = [
    { path: '/marketing',           label: 'Kanban',     icon: Kanban },
    { path: '/marketing/fila',      label: 'Fila',       icon: ListOrdered },
    { path: '/marketing/calendario',label: 'Calendário', icon: CalendarDays },
    { path: '/marketing/analytics', label: 'Analytics',  icon: BarChart3 },
    ...(isCoord ? [{ path: '/marketing/admin', label: 'Admin', icon: Settings }] : []),
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {items.map(it => {
        const ativo = here(it.path);
        const Icon = it.icon;
        return (
          <Button
            key={it.path}
            variant={ativo ? 'default' : 'outline'}
            size="sm"
            onClick={() => navigate(it.path)}
            disabled={ativo}
            className="gap-1.5"
          >
            <Icon className="h-4 w-4" /> {it.label}
          </Button>
        );
      })}
    </div>
  );
}
