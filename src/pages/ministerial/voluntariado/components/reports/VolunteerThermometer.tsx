import { Badge } from '@/components/ui/badge';
import { Flame, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ThermometerEntry {
  planningCenterId: string;
  name: string;
  team: string | null;
  scheduled: number;
  checkedIn: number;
  rate: number;
  level: 'very_active' | 'regular' | 'low' | 'inactive';
}

const levelConfig = {
  very_active: { label: 'Muito ativo', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: Flame },
  regular: { label: 'Regular', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: TrendingUp },
  low: { label: 'Baixo', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: TrendingDown },
  inactive: { label: 'Inativo', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', icon: Minus },
};

export default function VolunteerThermometer({ data }: { data: ThermometerEntry[] }) {
  const sorted = [...data].sort((a, b) => b.rate - a.rate);
  const counts = { very_active: 0, regular: 0, low: 0, inactive: 0 };
  sorted.forEach(v => counts[v.level]++);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => {
          const cfg = levelConfig[level];
          const Icon = cfg.icon;
          return (
            <div key={level} className="p-3 rounded-lg border bg-card text-center">
              <Icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {sorted.map(v => {
          const cfg = levelConfig[v.level];
          return (
            <div key={v.planningCenterId} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <p className="font-medium">{v.name}</p>
                {v.team && <p className="text-sm text-muted-foreground">{v.team}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{v.checkedIn}/{v.scheduled} ({Math.round(v.rate * 100)}%)</span>
                <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
