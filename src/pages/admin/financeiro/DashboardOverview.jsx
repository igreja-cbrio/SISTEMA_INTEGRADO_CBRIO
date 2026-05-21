import { useEffect, useState } from 'react';
import { financeiroV2 } from '../../../api';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  TrendingUp, TrendingDown, Minus, Upload, ClipboardList,
  AlertCircle, Receipt, ArrowRight, Wallet, Banknote, ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = {
  primary: '#00B39D',
  primarySoft: '#00B39D22',
  green: '#10b981',
  greenSoft: '#10b98118',
  red: '#ef4444',
  redSoft: '#ef444418',
  amber: '#f59e0b',
  amberSoft: '#f59e0b18',
  blue: '#3b82f6',
  blueSoft: '#3b82f618',
  purple: '#8b5cf6',
};
const CULTO_COLORS = ['#00B39D', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#EF4444'];

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(0)}k`;
  return fmtMoney(n);
};
const monthLabel = (yyyymm) => {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  const labels = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${labels[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

export default function DashboardOverview({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiroV2.dashboard.overview()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
        Carregando dashboard...
      </div>
    );
  }

  const { stats, pendencias, contas, serie_6_meses, receita_por_culto, top_despesas, ultimo_upload } = data;

  return (
    <div className="space-y-6">
      {/* Atalhos rapidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ShortcutCard
          icon={Upload}
          color={COLORS.primary}
          colorSoft={COLORS.primarySoft}
          title="Importar extratos"
          subtitle={ultimo_upload
            ? `Ultimo upload: ${formatDaysAgo(ultimo_upload.created_at)}`
            : 'Nenhum upload ainda'}
          onClick={() => onNavigate?.(8)}
        />
        <ShortcutCard
          icon={ClipboardList}
          color={COLORS.amber}
          colorSoft={COLORS.amberSoft}
          title="Fila de classificacao"
          subtitle={pendencias.fila_classificacao > 0
            ? `${pendencias.fila_classificacao} aguardando revisao`
            : 'Sem pendencias ✓'}
          badge={pendencias.fila_classificacao}
          onClick={() => onNavigate?.(9)}
        />
        <ShortcutCard
          icon={AlertCircle}
          color={pendencias.contas_pagar_vencidas > 0 ? COLORS.red : COLORS.blue}
          colorSoft={pendencias.contas_pagar_vencidas > 0 ? COLORS.redSoft : COLORS.blueSoft}
          title="Contas a pagar"
          subtitle={pendencias.contas_pagar_vencidas > 0
            ? `${pendencias.contas_pagar_vencidas} vencidas`
            : pendencias.contas_pagar_vencendo_7d > 0
              ? `${pendencias.contas_pagar_vencendo_7d} vencem em 7d`
              : `${pendencias.contas_pagar} pendentes`}
          badge={pendencias.contas_pagar_vencidas || null}
          onClick={() => onNavigate?.(3)}
        />
        <ShortcutCard
          icon={Receipt}
          color={COLORS.purple}
          colorSoft="#8b5cf618"
          title="Reembolsos"
          subtitle={pendencias.reembolsos > 0
            ? `${pendencias.reembolsos} pendentes · ${fmtCompact(pendencias.valor_reembolsos)}`
            : 'Sem pendencias ✓'}
          badge={pendencias.reembolsos}
          onClick={() => onNavigate?.(4)}
        />
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Wallet}
          label="Saldo total"
          value={fmtMoney(stats.saldoTotal)}
          subtitle={`${stats.contasAtivas} conta${stats.contasAtivas === 1 ? '' : 's'} ativa${stats.contasAtivas === 1 ? '' : 's'}`}
          color={COLORS.primary}
        />
        <KpiCard
          icon={TrendingUp}
          label="Receita do mes"
          value={fmtMoney(stats.receitaMes)}
          variation={stats.receitaVariacao}
          color={COLORS.green}
        />
        <KpiCard
          icon={TrendingDown}
          label="Despesa do mes"
          value={fmtMoney(stats.despesaMes)}
          variation={stats.despesaVariacao}
          invertVariation
          color={COLORS.red}
        />
        <KpiCard
          icon={Banknote}
          label="Resultado do mes"
          value={fmtMoney(stats.resultadoMes)}
          subtitle={stats.resultadoMes >= 0 ? 'Superavit' : 'Deficit'}
          color={stats.resultadoMes >= 0 ? COLORS.green : COLORS.red}
        />
      </div>

      {/* Receita vs Despesa 6 meses · grafico full-width */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Receita vs Despesa</h3>
              <p className="text-xs text-muted-foreground">Ultimos 6 meses</p>
            </div>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={serie_6_meses} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDespesa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickFormatter={monthLabel} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                <Tooltip
                  formatter={(v) => fmtMoney(v)}
                  labelFormatter={monthLabel}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="receita" name="Receita" stroke={COLORS.green} fill="url(#colorReceita)" strokeWidth={2} />
                <Area type="monotone" dataKey="despesa" name="Despesa" stroke={COLORS.red} fill="url(#colorDespesa)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 2 cards lado a lado · receita por culto + top despesas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Receita por culto</h3>
                <p className="text-xs text-muted-foreground">Ultimos 6 meses</p>
              </div>
            </div>
            {receita_por_culto.length === 0 ? (
              <EmptyChart text="Sem receita classificada por culto ainda" />
            ) : (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={receita_por_culto}
                      dataKey="total"
                      nameKey="nome"
                      cx="50%" cy="50%"
                      outerRadius={80} innerRadius={45}
                      paddingAngle={2}
                    >
                      {receita_por_culto.map((_, i) => (
                        <Cell key={i} fill={CULTO_COLORS[i % CULTO_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Top categorias de despesa</h3>
                <p className="text-xs text-muted-foreground">Mes atual</p>
              </div>
            </div>
            {top_despesas.length === 0 ? (
              <EmptyChart text="Sem despesas classificadas no mes" />
            ) : (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={top_despesas} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                    <YAxis type="category" dataKey="codigo" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" fill={COLORS.red} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contas bancarias · resumo */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Contas bancarias</h3>
              <p className="text-xs text-muted-foreground">{contas.length} contas ativas</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate?.(1)}>
              Ver todas <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {contas.map(c => (
              <div key={c.id} className="border border-border rounded-lg p-3 bg-card/50">
                <div className="text-xs text-muted-foreground mb-1">{c.banco || 'Conta'}</div>
                <div className="text-sm font-semibold truncate">{c.nome}</div>
                <div className={`text-lg font-bold mt-1 ${c.saldo >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                  {fmtMoney(c.saldo)}
                </div>
              </div>
            ))}
            {contas.length === 0 && (
              <div className="col-span-full text-center py-6 text-sm text-muted-foreground">
                Nenhuma conta ativa
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Sub-componentes
// ============================================================
function ShortcutCard({ icon: Icon, color, colorSoft, title, subtitle, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-card border border-border rounded-lg p-4 transition-all hover:border-primary/50 hover:shadow-sm group"
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center"
          style={{ background: colorSoft, color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        {badge ? (
          <Badge variant="secondary" style={{ background: colorSoft, color, border: 'none' }}>
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
        <span className="truncate">{subtitle}</span>
        <ArrowRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

function KpiCard({ icon: Icon, label, value, subtitle, variation, invertVariation, color }) {
  let varNode = null;
  if (variation !== null && variation !== undefined && !Number.isNaN(variation)) {
    const positive = invertVariation ? variation < 0 : variation > 0;
    const negative = invertVariation ? variation > 0 : variation < 0;
    const VarIcon = Math.abs(variation) < 0.5 ? Minus : (variation > 0 ? TrendingUp : TrendingDown);
    const corVar = positive ? COLORS.green : negative ? COLORS.red : COLORS.amber;
    varNode = (
      <div className="flex items-center gap-1 text-xs font-medium" style={{ color: corVar }}>
        <VarIcon className="h-3 w-3" />
        {variation > 0 ? '+' : ''}{variation.toFixed(1)}%
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          {label}
        </div>
        <div className="text-2xl font-bold leading-tight" style={{ color: color === COLORS.red && Number(String(value).replace(/[^\d-]/g, '')) > 0 ? undefined : undefined }}>
          {value}
        </div>
        <div className="flex items-center justify-between mt-2">
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          {varNode}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function formatDaysAgo(isoString) {
  if (!isoString) return '';
  const dias = Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `ha ${dias} dias`;
  if (dias < 30) return `ha ${Math.floor(dias / 7)} semanas`;
  return `ha ${Math.floor(dias / 30)} meses`;
}
