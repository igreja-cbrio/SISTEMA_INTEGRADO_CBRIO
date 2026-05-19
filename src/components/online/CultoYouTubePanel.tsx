import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Clock, Eye, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  UserPlus, UserMinus, PieChart as PieIcon, Activity,
} from 'lucide-react';
import { online as onlineApi } from '../../api';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

type Trafico = { fonte: string; views: number; watch_minutes: number };
type CurvaPonto = { ratio_pct: number; audience_watch_ratio: number };

type CultoMetrica = {
  id: string;
  data: string;
  service_type_name: string | null;
  youtube_video_id: string;
  online_pico: number | null;
  online_ds: number | null;
  online_ddus: number | null;
  online_watch_minutes_ds: number | null;
  online_watch_minutes_ddus: number | null;
  online_retencao_pct_ds: number | null;
  online_retencao_pct_ddus: number | null;
  online_subs_ganhos: number | null;
  online_subs_perdidos: number | null;
  online_views_inscritos: number | null;
  online_views_nao_inscritos: number | null;
  trafico: Trafico[];
  retencao_curva: CurvaPonto[];
};

// Mapa de fontes do YouTube pra labels amigaveis
const FONTE_LABELS: Record<string, string> = {
  YT_SEARCH: 'Busca YouTube',
  YT_RELATED: 'Sugerido',
  EXT_URL: 'Links externos',
  BROWSE: 'Home/Feed',
  YT_CHANNEL: 'Pagina do canal',
  YT_PLAYLIST: 'Playlist',
  END_SCREEN: 'Tela final',
  SHORTS: 'Shorts',
  NO_LINK_OTHER: 'Direto/Outros',
  NOTIFICATION: 'Notificacao',
  YT_OTHER_PAGE: 'Outras paginas YT',
  UNKNOWN: 'Desconhecida',
};

function labelFonte(f: string): string {
  return FONTE_LABELS[f] || f;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtData(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMinutos(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (m >= 60) return (m / 60).toFixed(1) + 'h';
  return m + 'min';
}

export function CultoYouTubePanel() {
  const { data, isLoading } = useQuery<CultoMetrica[]>({
    queryKey: ['online', 'cultos-metricas'],
    queryFn: () => onlineApi.cultosMetricas(24),
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Carregando metricas dos cultos...
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Sem cultos com video do YouTube ainda. Conecte o canal e aguarde a primeira coleta automatica.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold leading-tight">Performance por Culto</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Clique num culto pra ver curva de retencao, fontes de trafego e split inscritos × nao-inscritos.
        </p>
        <div className="space-y-2">
          {data.map(c => (
            <CultoCard
              key={c.id}
              c={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CultoCard({ c, expanded, onToggle }: { c: CultoMetrica; expanded: boolean; onToggle: () => void }) {
  const totalViews = (c.online_ds || 0) + (c.online_ddus || 0);
  const totalSubsViews = (c.online_views_inscritos || 0) + (c.online_views_nao_inscritos || 0);
  const pctNaoInscritos = totalSubsViews > 0
    ? Math.round(((c.online_views_nao_inscritos || 0) / totalSubsViews) * 100)
    : null;
  const subsLiquido = (c.online_subs_ganhos || 0) - (c.online_subs_perdidos || 0);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 hover:bg-accent/50 transition-colors text-left flex items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{fmtData(c.data)}</span>
            {c.service_type_name && (
              <Badge variant="secondary" className="text-[10px]">{c.service_type_name}</Badge>
            )}
            {subsLiquido > 0 && (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] gap-1">
                <UserPlus className="h-2.5 w-2.5" /> +{subsLiquido}
              </Badge>
            )}
            {subsLiquido < 0 && (
              <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 text-[10px] gap-1">
                <UserMinus className="h-2.5 w-2.5" /> {subsLiquido}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Stat icon={<Eye className="h-3 w-3" />} label="Views D+7" value={fmtNum(totalViews)} />
            <Stat icon={<Clock className="h-3 w-3" />} label="Watch time" value={fmtMinutos(c.online_watch_minutes_ddus)} />
            <Stat
              icon={c.online_retencao_pct_ddus && c.online_retencao_pct_ddus >= 50 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              label="Retencao media"
              value={c.online_retencao_pct_ddus !== null ? `${c.online_retencao_pct_ddus.toFixed(0)}%` : '—'}
            />
            <Stat
              icon={<PieIcon className="h-3 w-3" />}
              label="Nao-inscritos"
              value={pctNaoInscritos !== null ? `${pctNaoInscritos}%` : '—'}
            />
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && <CultoDetalhe c={c} />}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">{label}</div>
        <div className="font-semibold text-foreground leading-tight mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function CultoDetalhe({ c }: { c: CultoMetrica }) {
  return (
    <div className="border-t border-border p-4 bg-muted/30 space-y-5">
      {/* Linha 1: numeros detalhados em grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <BoxNum label="Pico ao vivo" value={fmtNum(c.online_pico)} sub="concurrent viewers" />
        <BoxNum label="Views dia D" value={fmtNum(c.online_ds)} sub="ao vivo" />
        <BoxNum label="Views D+1..D+7" value={fmtNum(c.online_ddus)} sub="on-demand" />
        <BoxNum label="Subs ganhos" value={fmtNum(c.online_subs_ganhos)} sub={c.online_subs_perdidos ? `${c.online_subs_perdidos} perdidos` : ''} />
      </div>

      {/* Linha 2: 2 graficos lado a lado · curva retencao + split inscritos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg bg-card border border-border p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-primary" />
            Curva de retencao
          </h4>
          {c.retencao_curva.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Sem dado de retencao ainda · aguarde D+7.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={c.retencao_curva} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                <XAxis
                  dataKey="ratio_pct"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10 }}
                  stroke="var(--cbrio-text3)"
                />
                <YAxis
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 10 }}
                  stroke="var(--cbrio-text3)"
                />
                <Tooltip
                  formatter={(v: number) => [`${(v * 100).toFixed(1)}% assistindo`, '']}
                  labelFormatter={(l) => `${l}% do video`}
                  contentStyle={{ background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', fontSize: 11 }}
                />
                <Line type="monotone" dataKey="audience_watch_ratio" stroke="#00B39D" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg bg-card border border-border p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <PieIcon className="h-3 w-3 text-primary" />
            Inscritos × nao-inscritos
          </h4>
          <SubStatusChart c={c} />
        </div>
      </div>

      {/* Linha 3: bar chart de fontes de trafego */}
      <div className="rounded-lg bg-card border border-border p-3">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-primary" />
          De onde vieram os viewers
        </h4>
        {c.trafico.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Sem dado de trafego ainda · aguarde D+7.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, c.trafico.length * 24)}>
            <BarChart
              layout="vertical"
              data={c.trafico.slice(0, 8).map(t => ({ fonte: labelFonte(t.fonte), views: t.views }))}
              margin={{ top: 5, right: 30, bottom: 5, left: 90 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--cbrio-text3)" />
              <YAxis type="category" dataKey="fonte" tick={{ fontSize: 10 }} stroke="var(--cbrio-text3)" width={85} />
              <Tooltip
                formatter={(v: number) => [fmtNum(v) + ' views', '']}
                contentStyle={{ background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', fontSize: 11 }}
              />
              <Bar dataKey="views" fill="#00B39D" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="text-xs text-muted-foreground pt-1">
        <a
          href={`https://www.youtube.com/watch?v=${c.youtube_video_id}`}
          target="_blank" rel="noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Ver video no YouTube →
        </a>
      </div>
    </div>
  );
}

function BoxNum({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-card border border-border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold text-foreground leading-none mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function SubStatusChart({ c }: { c: CultoMetrica }) {
  const dados = [
    { name: 'Inscritos', value: c.online_views_inscritos || 0, color: '#00B39D' },
    { name: 'Nao-inscritos', value: c.online_views_nao_inscritos || 0, color: '#f59e0b' },
  ];
  const total = dados.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <p className="text-xs text-muted-foreground py-8 text-center">Sem dado ainda · aguarde D+7.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={dados}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={65}
          paddingAngle={2}
        >
          {dados.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => [fmtNum(v) + ' views', '']}
          contentStyle={{ background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', fontSize: 11 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10 }}
          formatter={(value, _, i) => `${value} (${Math.round((dados[i as number].value / total) * 100)}%)`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
