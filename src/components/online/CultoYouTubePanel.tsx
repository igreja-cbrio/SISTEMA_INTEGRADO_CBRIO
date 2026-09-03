import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, ReferenceLine,
} from 'recharts';
import {
  Clock, Eye, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  UserPlus, UserMinus, PieChart as PieIcon, Activity,
} from 'lucide-react';
import { online as onlineApi } from '../../api';
import { lerCurva as lerCurvaBase } from '../../lib/curvaRetencao';
import {
  compararComAnteriores, acharQuedas, serieDoTipo,
  type CultoBase,
} from '../../lib/analiseCulto';
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
  actual_start_time: string | null;
  actual_end_time: string | null;
  video_titulo: string | null;
};

// UTC -> BRT (America/Sao_Paulo) · 'HH:mm'
function fmtHoraBRT(isoUtc: string | null): string {
  if (!isoUtc) return '—';
  return new Date(isoUtc).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Curva de audiência com o eixo em MINUTOS reais da transmissão.
// ⚠️ A duração vem de actual_start/actual_end; sem elas o eixo cai para % do
// vídeo, que é o que confundia antes — mas aí é o melhor que existe.
function lerCurva(c: CultoMetrica) {
  return lerCurvaBase(c.retencao_curva, duracaoMin(c.actual_start_time, c.actual_end_time));
}

// Duração em min entre 2 ISO
function duracaoMin(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null;
  return Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000);
}

// Mapa de fontes do YouTube pra labels amigaveis
const FONTE_LABELS: Record<string, string> = {
  YT_SEARCH: 'Busca YouTube',
  YT_RELATED: 'Sugerido',
  EXT_URL: 'Links externos',
  BROWSE: 'Home/Feed',
  YT_CHANNEL: 'Página do canal',
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

// Número completo em pt-BR (1.317, não "1.3K") — pedido do gestor 2026-07-02:
// nunca abreviar valores de views/pico/DS.
function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('pt-BR');
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
              todos={data}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CultoCard({ c, todos, expanded, onToggle }: { c: CultoMetrica; todos: CultoMetrica[]; expanded: boolean; onToggle: () => void }) {
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
            <Stat icon={<Eye className="h-3 w-3" />} label="Views totais" value={fmtNum(totalViews)} />
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

      {expanded && <CultoDetalhe c={c} todos={todos} />}
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

function CultoDetalhe({ c, todos }: { c: CultoMetrica; todos: CultoMetrica[] }) {
  const dur = duracaoMin(c.actual_start_time, c.actual_end_time);
  return (
    <div className="border-t border-border p-4 bg-muted/30 space-y-5">
      {/* Horarios reais da live em BRT */}
      {(c.actual_start_time || c.actual_end_time) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs px-1">
          <span className="text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wide">Início</span>
            <span className="ml-1.5 font-semibold text-foreground">{fmtHoraBRT(c.actual_start_time)}</span>
          </span>
          <span className="text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wide">Fim</span>
            <span className="ml-1.5 font-semibold text-foreground">{fmtHoraBRT(c.actual_end_time)}</span>
          </span>
          {dur != null && (
            <span className="text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wide">Duração</span>
              <span className="ml-1.5 font-semibold text-foreground">{Math.floor(dur / 60) ? `${Math.floor(dur / 60)}h${String(dur % 60).padStart(2, '0')}` : `${dur}min`}</span>
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/70 italic">horário Brasília</span>
        </div>
      )}

      {/* Comparação · evolução · onde caiu */}
      <ComparacaoComAnteriores c={c} todos={todos} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <EvolucaoDoTipo c={c} todos={todos} />
        <OndeCaiu c={c} dur={dur} />
      </div>

      {/* Linha 1: números detalhados em grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <BoxNum label="Pico ao vivo" value={fmtNum(c.online_pico)} sub="concurrent viewers" />
        <BoxNum label="DS · views" value={fmtNum(c.online_ds)} sub="acumulado · manhã seguinte" />
        <BoxNum label="DDUS · views" value={fmtNum(c.online_ddus)} sub="on-demand · D+7 − DS" />
        <BoxNum label="Subs ganhos" value={fmtNum(c.online_subs_ganhos)} sub={c.online_subs_perdidos ? `${c.online_subs_perdidos} perdidos` : ''} />
      </div>

      {/* Linha 2: 2 gráficos lado a lado · curva retencao + split inscritos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg bg-card border border-border p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-primary" />
            Audiência ao longo da transmissão
          </h4>
          {c.retencao_curva.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Sem dado de retencao ainda · aguarde D+7.</p>
          ) : (() => {
            const r = lerCurva(c);
            return (
              <>
                <p className="text-[10.5px] text-muted-foreground mb-1.5 leading-snug">
                  De cada 100 visualizações do vídeo, quantas estavam nesse minuto.
                  {r.abertura && (
                    <> A <strong>abertura</strong> ({r.abertura}) é a espera antes do culto —
                    quem chega depois pula, e por isso a linha sobe.</>
                  )}
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={r.pontos} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={[0, r.max]}
                      tickFormatter={r.fmtEixo}
                      tick={{ fontSize: 10 }}
                      stroke="var(--cbrio-text3)"
                    />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 10 }}
                      stroke="var(--cbrio-text3)"
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${(v * 100).toFixed(0)} de cada 100 visualizações`, '']}
                      labelFormatter={(l: number) => r.fmtRotulo(l)}
                      contentStyle={{ background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', fontSize: 11 }}
                    />
                    {/* ⚠️ A média é a régua: sem ela, "45%" não diz se é bom. */}
                    <ReferenceLine
                      y={r.media}
                      stroke="var(--cbrio-text3)"
                      strokeDasharray="4 3"
                      label={{ value: `média ${Math.round(r.media * 100)}%`, position: 'insideTopRight', fontSize: 9, fill: 'var(--cbrio-text3)' }}
                    />
                    {r.inicioCulto != null && (
                      <ReferenceLine
                        x={r.inicioCulto}
                        stroke="#c98a1d"
                        strokeDasharray="3 3"
                        label={{ value: 'culto começa', position: 'insideTopLeft', fontSize: 9, fill: '#c98a1d' }}
                      />
                    )}
                    <Line type="monotone" dataKey="y" stroke="#00B39D" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[10.5px] text-muted-foreground">
                  <span>pico <strong className="text-foreground">{Math.round(r.pico * 100)}%</strong> em {r.fmtRotulo(r.picoX)}</span>
                  <span>fim da transmissão <strong className="text-foreground">{Math.round(r.fim * 100)}%</strong></span>
                  {r.abertura && <span>abertura descartada: {r.abertura}</span>}
                </div>
              </>
            );
          })()}
        </div>

        <div className="rounded-lg bg-card border border-border p-3">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <PieIcon className="h-3 w-3 text-primary" />
            Inscritos × nao-inscritos
          </h4>
          <SubStatusChart c={c} />
        </div>
      </div>

      {/* Linha 3: bar chart de fontes de tráfego */}
      <div className="rounded-lg bg-card border border-border p-3">
        <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-primary" />
          De onde vieram os viewers
        </h4>
        {c.trafico.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Sem dado de tráfego ainda · aguarde D+7.</p>
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


// ─────────────────────────────────────────────────────────────────────────────
// Como este culto foi contra os anteriores DO MESMO TIPO.
// ⚠️ Só o mesmo tipo, e só cultos ANTERIORES — ver analiseCulto.ts.
function ComparacaoComAnteriores({ c, todos }: { c: CultoMetrica; todos: CultoMetrica[] }) {
  const r = compararComAnteriores(c as CultoBase, todos as CultoBase[]);
  if (r.linhas.length === 0) {
    return (
      <div className="rounded-lg bg-card border border-border p-3 text-[11px] text-muted-foreground">
        Ainda não há cultos anteriores de <strong>{r.tipo || 'mesmo tipo'}</strong> suficientes
        para comparar ({r.base} {r.base === 1 ? 'culto' : 'cultos'}) — a régua começa com 3.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-card border border-border p-3">
      <h4 className="text-xs font-semibold mb-0.5 flex items-center gap-1.5">
        <Activity className="h-3 w-3 text-primary" />
        Contra os {r.base} cultos anteriores de {r.tipo}
      </h4>
      <p className="text-[10.5px] text-muted-foreground mb-2">
        Só o mesmo tipo de culto, e só os que vieram antes deste.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {r.linhas.map((l) => (
          <div key={l.chave} className="rounded-md border border-border/70 px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{l.rotulo}</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-semibold text-sm tabular-nums">{l.valor == null ? '—' : fmtNum(Math.round(l.valor))}</span>
              {l.difPct != null && (
                <span className={`text-[11px] font-semibold ${l.difPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {l.difPct >= 0 ? '+' : ''}{l.difPct.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              média {l.media == null ? '—' : fmtNum(Math.round(l.media))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Série histórica do mesmo tipo de culto — tendência, não foto.
function EvolucaoDoTipo({ c, todos }: { c: CultoMetrica; todos: CultoMetrica[] }) {
  const serie = serieDoTipo(c as CultoBase, todos as CultoBase[]);
  return (
    <div className="rounded-lg bg-card border border-border p-3">
      <h4 className="text-xs font-semibold mb-0.5 flex items-center gap-1.5">
        <TrendingUp className="h-3 w-3 text-primary" />
        Evolução · {c.service_type_name || 'este culto'}
      </h4>
      <p className="text-[10.5px] text-muted-foreground mb-2">Pico ao vivo, culto a culto · o mais recente à direita.</p>
      {serie.length < 2 ? (
        <p className="text-[11px] text-muted-foreground py-6 text-center">Sem histórico suficiente ainda.</p>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={serie} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 9 }} stroke="var(--cbrio-text3)" />
            <YAxis tick={{ fontSize: 9 }} stroke="var(--cbrio-text3)" />
            <Tooltip
              formatter={(v: number, n: string) => [fmtNum(v), n === 'pico' ? 'Pico ao vivo' : n]}
              contentStyle={{ background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', fontSize: 11 }}
            />
            <Line type="monotone" dataKey="pico" stroke="#00B39D" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Onde a audiência caiu — com a hora real, pra achar o trecho no vídeo.
// ⚠️ A abertura fica de fora: a maior queda de toda live é a saída da tela de
// espera, e ela seria a resposta de todo culto.
function OndeCaiu({ c, dur }: { c: CultoMetrica; dur: number | null }) {
  const r = lerCurva(c);
  const inicioPct = r.inicioCulto != null && dur ? (r.inicioCulto / dur) * 100 : 0;
  const quedas = acharQuedas(c.retencao_curva, {
    inicioAposPct: inicioPct, duracaoMin: dur, inicioIso: c.actual_start_time, quantas: 3,
  });
  return (
    <div className="rounded-lg bg-card border border-border p-3">
      <h4 className="text-xs font-semibold mb-0.5 flex items-center gap-1.5">
        <TrendingDown className="h-3 w-3 text-primary" />
        Onde a audiência mais caiu
      </h4>
      <p className="text-[10.5px] text-muted-foreground mb-2">
        Depois da abertura e antes do encerramento — os dois caem em todo culto.
      </p>
      {quedas.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-6 text-center">Sem curva de retenção ainda.</p>
      ) : (
        <ol className="space-y-1.5">
          {quedas.map((q, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[11px]">
              <span className="text-muted-foreground tabular-nums w-4">{i + 1}.</span>
              <span className="font-semibold tabular-nums">{r.fmtEixo(q.x)}</span>
              {q.hora && <span className="text-muted-foreground">({q.hora})</span>}
              <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums ml-auto">
                −{Math.round(q.tamanho * 100)} pts
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
