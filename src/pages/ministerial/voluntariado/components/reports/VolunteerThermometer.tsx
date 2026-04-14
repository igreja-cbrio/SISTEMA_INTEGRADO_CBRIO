import { Badge } from '@/components/ui/badge';

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
  very_active: { label: 'Muito Ativo', color: '#3b82f6', bgClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  regular: { label: 'Regular', color: '#22c55e', bgClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  low: { label: 'Pouco Ativo', color: '#eab308', bgClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  inactive: { label: 'Inativo', color: '#ef4444', bgClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

export default function VolunteerThermometer({ data }: { data: ThermometerEntry[] }) {
  const sorted = [...data].sort((a, b) => b.rate - a.rate);
  const counts = { very_active: 0, regular: 0, low: 0, inactive: 0 };
  sorted.forEach(v => counts[v.level]++);
  const total = sorted.length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => {
          const cfg = levelConfig[level];
          return (
            <div key={level} className="p-4 rounded-lg border bg-card text-center">
              <div className="h-8 w-8 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ backgroundColor: `${cfg.color}20` }}>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
              </div>
              <p className="text-3xl font-bold">{count}</p>
              <p className="text-sm text-muted-foreground">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Distribution bar */}
      {total > 0 && (
        <div className="p-4 rounded-lg border bg-card space-y-3">
          <h4 className="font-semibold">Distribuicao</h4>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => {
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={level}
                  style={{ width: `${pct}%`, backgroundColor: levelConfig[level].color }}
                  className="transition-all"
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 justify-center text-sm">
            {(Object.entries(counts) as [keyof typeof counts, number][]).map(([level, count]) => (
              <div key={level} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: levelConfig[level].color }} />
                <span className="text-muted-foreground">{levelConfig[level].label}: {count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Volunteer list */}
      <div className="p-4 rounded-lg border bg-card space-y-3">
        <h4 className="font-semibold">Voluntarios ({total})</h4>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {sorted.map(v => {
            const cfg = levelConfig[v.level];
            const pct = v.scheduled > 0 ? Math.round((v.checkedIn / v.scheduled) * 100) : 0;
            return (
              <div key={v.planningCenterId} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30">
                <Badge variant="outline" className={`${cfg.bgClass} shrink-0 text-xs`}>
                  {cfg.label}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{v.name}</p>
                  {v.team && <p className="text-xs text-muted-foreground truncate">{v.team}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cfg.color }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {v.checkedIn}/{v.scheduled}
                  </span>
                  <span className="text-xs text-muted-foreground w-10">escalas</span>
                </div>
              </div>
            );
          })}
          {total === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum voluntario encontrado no periodo</p>
          )}
        </div>
      </div>
    </div>
  );
}
