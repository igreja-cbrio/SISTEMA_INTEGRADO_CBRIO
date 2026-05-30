import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../contexts/AuthContext';
import { Kanban, CalendarRange, BarChart3, Settings } from 'lucide-react';

// Header do Marketing consolidado em 4 telas (Kanban · Planner · Analytics · Admin)
// · destaca a aba atual. Triagem/Fila/Ciclo viraram parte do Kanban; Calendário → Planner.
export default function MarketingNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, modulePerms } = useAuth();
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const here = (path) => location.pathname === path;

  const items = [
    { path: '/marketing',                  label: 'Kanban',     icon: Kanban },
    ...(isCoord ? [{ path: '/marketing/planner', label: 'Planner', icon: CalendarRange }] : []),
    { path: '/marketing/analytics',        label: 'Analytics',  icon: BarChart3 },
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
