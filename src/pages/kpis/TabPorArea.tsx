import { useState, useEffect, useCallback, useMemo } from 'react';
import { kpis as kpisApi } from '@/api';
import {
  Loader2, AlertCircle, CheckCircle2, Clock, ChevronDown, ChevronUp,
  Bot, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  CartesianGrid, AreaChart, Area,
} from 'recharts';

const C = {
  primary: '#00B39D',
  warn: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
};

const AREA_LABELS: Record<string, string> = {
  ami: 'AMI & Bridge',
  next: 'NEXT',
  generosidade: 'Generosidade',
  kids: 'CBKids',
  cuidados: 'Cuidados',
  grupos: 'Grupos',
  integracao: 'Integração',
  voluntariado: 'Voluntariado',
  cba: 'CBA',
};

const PERIODICIDADE_LABEL: Record<string, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

interface AreaSummary {
  area: string;
  total: number;
  verde: number;
  vermelho: number;
  pendente: number;
  pendentes_ou_atrasados: number;
  pct_verde: number;
}

interface Tatico {
  id: string;
  area: string;
  indicador: string;
  descricao?: string;
  periodicidade: string;
  meta_descricao?: string;
  meta_valor?: number;
  unidade?: string;
  responsavel_area?: string;
  fonte_auto?: string | null;
  ultimo_valor?: number;
  ultimo_periodo?: string;
  ultima_origem?: 'manual' | 'auto' | null;
  status: 'verde' | 'vermelho' | 'pendente';
}

interface Registro {
  id: string;
  periodo_referencia: string;
  valor_realizado: number | null;
  data_preenchimento: string;
  origem?: 'manual' | 'auto';
}

function statusColor(s: string): string {
  if (s === 'verde') return C.primary;
  if (s === 'vermelho') return C.danger;
  return '#6B7280';
}

// ── Card de saude da area ──────────────────────────────────────────────────────
function AreaHealthCard({ summary, expanded, onClick }: {
  summary: AreaSummary;
  expanded: boolean;
  onClick: () => void;
}) {
  const pct = summary.pct_verde || 0;
  const cor = pct >= 80 ? C.primary : pct >= 50 ? C.warn : C.danger;

  return (
    <div
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-5 cursor-pointer transition-all hover:border-[#00B39D]/50 hover:shadow-md"
      style={{ borderLeftWidth: 4, borderLeftColor: cor }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-foreground capitalize">
          {AREA_LABELS[summary.area] || summary.area}
        </h3>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold tabular-nums" style={{ color: cor }}>
          {pct}%
        </span>
        <span className="text-xs text-muted-foreground">em dia</span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.primary }} />
          <span className="font-bold tabular-nums">{summary.verde}</span>
          <span className="text-muted-foreground">verde</span>
        </span>
        {summary.vermelho > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.danger }} />
            <span className="font-bold tabular-nums">{summary.vermelho}</span>
            <span className="text-muted-foreground">atrasado</span>
          </span>
        )}
        {summary.pendente > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
            <span className="font-bold tabular-nums">{summary.pendente}</span>
            <span className="text-muted-foreground">pendente</span>
          </span>
        )}
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </div>
  );
}

// ── Mini sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: { x: string; y: number | null }[]; color: string }) {
  if (!data || data.length < 2) {
    return <span className="text-xs text-muted-foreground/50">sem histórico</span>;
  }
  return (
    <div style={{ width: 100, height: 32 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="y"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Trend arrow ────────────────────────────────────────────────────────────────
function TrendIndicator({ data }: { data: { y: number | null }[] }) {
  const valores = data.map(d => d.y).filter((v): v is number => v !== null);
  if (valores.length < 2) return null;
  const ultimo = valores[valores.length - 1];
  const penultimo = valores[valores.length - 2];
  if (ultimo === penultimo) {
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  if (ultimo > penultimo) {
    return <TrendingUp className="h-3.5 w-3.5" style={{ color: C.primary }} />;
  }
  return <TrendingDown className="h-3.5 w-3.5" style={{ color: C.danger }} />;
}

// ── Chart full-size de um indicador ────────────────────────────────────────────
function IndicadorChart({ tatico, registros }: { tatico: Tatico; registros: Registro[] }) {
  const data = useMemo(() => {
    const sorted = [...registros]
      .filter(r => r.valor_realizado != null)
      .sort((a, b) => (a.periodo_referencia || '').localeCompare(b.periodo_referencia || ''));
    return sorted.map(r => ({
      periodo: r.periodo_referencia,
      valor: r.valor_realizado,
      origem: r.origem,
    }));
  }, [registros]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">Sem registros ainda — quando os valores forem lançados em Processos, o gráfico aparece aqui.</p>
      </div>
    );
  }

  const cor = statusColor(tatico.status);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">
          {data.length} ponto(s) · {PERIODICIDADE_LABEL[tatico.periodicidade]}
        </div>
        {tatico.meta_valor != null && (
          <div className="text-xs">
            <span className="text-muted-foreground">Meta: </span>
            <span className="font-bold text-foreground">
              {Number(tatico.meta_valor).toLocaleString('pt-BR')}
              {tatico.unidade ? ` ${tatico.unidade}` : ''}
            </span>
          </div>
        )}
      </div>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${tatico.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={cor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--cbrio-border)" strokeDasharray="3 3" vertical={false} opacity={0.4} />
            <XAxis
              dataKey="periodo"
              tick={{ fontSize: 10, fill: 'var(--cbrio-text3)' }}
              axisLine={{ stroke: 'var(--cbrio-border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--cbrio-text3)' }}
              axisLine={{ stroke: 'var(--cbrio-border)' }}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--cbrio-card)',
                border: '1px solid var(--cbrio-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: any) => [
                `${Number(v).toLocaleString('pt-BR')}${tatico.unidade ? ' ' + tatico.unidade : ''}`,
                'Valor',
              ]}
            />
            {tatico.meta_valor != null && (
              <ReferenceLine
                y={tatico.meta_valor}
                stroke={C.primary}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: 'Meta', position: 'right', fill: C.primary, fontSize: 10 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="valor"
              stroke={cor}
              strokeWidth={2}
              fill={`url(#grad-${tatico.id})`}
              dot={{ r: 3, fill: cor, stroke: 'var(--cbrio-card)', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Linha da tabela de indicadores com sparkline ──────────────────────────────
function IndicadorRow({ tatico, expanded, onToggle }: {
  tatico: Tatico;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingHist(true);
      try {
        const data = await kpisApi.v2.taticoDetail(tatico.id, 24);
        if (alive) setRegistros(data?.historico || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoadingHist(false);
      }
    })();
    return () => { alive = false; };
  }, [tatico.id]);

  const sparkData = useMemo(() => {
    return [...registros]
      .filter(r => r.valor_realizado != null)
      .sort((a, b) => (a.periodo_referencia || '').localeCompare(b.periodo_referencia || ''))
      .slice(-12)
      .map(r => ({ x: r.periodo_referencia, y: r.valor_realizado }));
  }, [registros]);

  const cor = statusColor(tatico.status);

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {tatico.status === 'verde' && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: cor }} />}
            {tatico.status === 'vermelho' && <AlertCircle className="h-3.5 w-3.5" style={{ color: cor }} />}
            {tatico.status === 'pendente' && <Clock className="h-3.5 w-3.5" style={{ color: cor }} />}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground/60">{tatico.id}</span>
            {tatico.fonte_auto && (
              <span title="Coletado automaticamente">
                <Bot className="h-3 w-3" style={{ color: C.primary }} />
              </span>
            )}
          </div>
          <p className="text-sm text-foreground">{tatico.indicador}</p>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {PERIODICIDADE_LABEL[tatico.periodicidade] || tatico.periodicidade}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate" title={tatico.meta_descricao || ''}>
          {tatico.meta_descricao || '—'}
        </td>
        <td className="px-4 py-3">
          {tatico.ultimo_valor != null ? (
            <div className="flex items-center gap-1.5">
              <span className="font-bold tabular-nums text-foreground text-sm">
                {Number(tatico.ultimo_valor).toLocaleString('pt-BR')}
                {tatico.unidade ? ` ${tatico.unidade}` : ''}
              </span>
              <TrendIndicator data={sparkData} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {loadingHist ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Sparkline data={sparkData} color={cor} />
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground inline" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={7} className="px-4 py-4">
            <IndicadorChart tatico={tatico} registros={registros} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Painel detalhado de uma area (tabela + charts) ─────────────────────────────
function AreaDetail({ area }: { area: string }) {
  const [taticos, setTaticos] = useState<Tatico[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await kpisApi.v2.taticos({ area });
        if (alive) setTaticos(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [area]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (taticos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">Sem indicadores táticos cadastrados nesta área.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Indicador</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periodicidade</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meta</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Último valor</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evolução</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {taticos.map(t => (
              <IndicadorRow
                key={t.id}
                tatico={t}
                expanded={expandedId === t.id}
                onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab principal ──────────────────────────────────────────────────────────────
export default function TabPorArea() {
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kpisApi.v2.areas();
      setAreas(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Ordena por nome amigavel
  const sorted = [...areas].sort((a, b) =>
    (AREA_LABELS[a.area] || a.area).localeCompare(AREA_LABELS[b.area] || b.area)
  );

  const totalIndicadores = sorted.reduce((s, a) => s + a.total, 0);
  const totalVerde = sorted.reduce((s, a) => s + a.verde, 0);
  const totalVermelho = sorted.reduce((s, a) => s + a.vermelho, 0);
  const totalPendente = sorted.reduce((s, a) => s + a.pendente, 0);
  const pctGlobal = totalIndicadores > 0 ? Math.round((totalVerde / totalIndicadores) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Resumo global */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Saúde global</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums" style={{ color: pctGlobal >= 80 ? C.primary : pctGlobal >= 50 ? C.warn : C.danger }}>
                {pctGlobal}%
              </span>
              <span className="text-sm text-muted-foreground">
                {totalVerde} de {totalIndicadores} indicadores em dia
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.primary }} />
              <span className="font-bold tabular-nums">{totalVerde}</span>
              <span className="text-muted-foreground">em dia</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.danger }} />
              <span className="font-bold tabular-nums">{totalVermelho}</span>
              <span className="text-muted-foreground">atrasado</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
              <span className="font-bold tabular-nums">{totalPendente}</span>
              <span className="text-muted-foreground">pendente</span>
            </span>
          </div>
        </div>
      </div>

      {/* Cards de areas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map(a => (
          <AreaHealthCard
            key={a.area}
            summary={a}
            expanded={expandedArea === a.area}
            onClick={() => setExpandedArea(expandedArea === a.area ? null : a.area)}
          />
        ))}
      </div>

      {/* Detalhe da area expandida */}
      {expandedArea && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-foreground">
              {AREA_LABELS[expandedArea] || expandedArea}
            </h3>
            <span className="text-xs text-muted-foreground">
              clique numa linha para ver o gráfico de evolução
            </span>
          </div>
          <AreaDetail area={expandedArea} />
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Como funciona:</strong> esta página mostra a evolução temporal dos
        indicadores táticos. Os lançamentos são feitos no módulo <strong>Processos</strong>; aqui é só
        visualização. Indicadores com <Bot className="h-3 w-3 inline" style={{ color: C.primary }} /> são
        coletados automaticamente pelo sistema (cron diário).
      </div>
    </div>
  );
}
