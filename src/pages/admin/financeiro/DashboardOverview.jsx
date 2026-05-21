import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownRight, Wallet, CreditCard, TrendingUp, TrendingDown,
  Calendar, Upload, ClipboardList, Receipt, ArrowRight, ChevronRight, Banknote,
} from 'lucide-react';
import { financeiroV2 } from '../../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES_LBL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (yyyymm) => {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return `${MESES_LBL[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

const CATEGORY_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
];

const PERIOD_LABEL = {
  week: 'Esta Semana',
  month: 'Este Mês',
  quarter: 'Este Trimestre',
  year: 'Este Ano',
};

export default function DashboardOverview({ onNavigate }) {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiroV2.dashboard.overview(period)
      .then(setData)
      .finally(() => setLoading(false));
  }, [period]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
    }),
  };

  // IMPORTANTE: hooks (useMemo) devem vir ANTES de qualquer early return
  // pra nao violar a regra dos hooks do React (erro #310)
  const fluxoCaixa = useMemo(
    () => normalizarSerieAnual(data?.serie_6_meses),
    [data?.serie_6_meses]
  );
  const maxFluxo = useMemo(
    () => Math.max(...fluxoCaixa.map(p => Math.max(p.receita, p.despesa)), 1),
    [fluxoCaixa]
  );

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
        Carregando dashboard...
      </div>
    );
  }

  const { stats, pendencias, contas, top_despesas, transacoes_recentes, ultimo_upload } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">Visão geral financeira</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe receitas, despesas e saldo em tempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Esta Semana</SelectItem>
              <SelectItem value="month">Este Mês</SelectItem>
              <SelectItem value="quarter">Este Trimestre</SelectItem>
              <SelectItem value="year">Este Ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Atalhos rapidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ShortcutCard
          icon={Upload}
          color="text-primary"
          bgColor="bg-primary/10"
          title="Importar extratos"
          subtitle={ultimo_upload ? `Último: ${daysAgo(ultimo_upload.created_at)}` : 'Nenhum upload ainda'}
          onClick={() => onNavigate?.(8)}
        />
        <ShortcutCard
          icon={ClipboardList}
          color="text-amber-600"
          bgColor="bg-amber-500/10"
          title="Fila de classificação"
          subtitle={pendencias.fila_classificacao > 0
            ? `${pendencias.fila_classificacao} aguardando revisão`
            : 'Sem pendências ✓'}
          badge={pendencias.fila_classificacao}
          onClick={() => onNavigate?.(9)}
        />
        <ShortcutCard
          icon={CreditCard}
          color={pendencias.contas_pagar_vencidas > 0 ? 'text-rose-600' : 'text-blue-600'}
          bgColor={pendencias.contas_pagar_vencidas > 0 ? 'bg-rose-500/10' : 'bg-blue-500/10'}
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
          color="text-violet-600"
          bgColor="bg-violet-500/10"
          title="Reembolsos"
          subtitle={pendencias.reembolsos > 0
            ? `${pendencias.reembolsos} pendentes`
            : 'Sem pendências ✓'}
          badge={pendencias.reembolsos}
          onClick={() => onNavigate?.(4)}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          custom={0}
          variants={cardVariants}
          title="Saldo bancário"
          icon={Wallet}
          iconBg="bg-primary/10"
          iconColor="text-primary"
          gradient="from-emerald-500 to-emerald-400"
          delay={0.5}
          value={fmtMoney(stats.saldoTotal)}
          variation={null}
          subtitle={`${stats.contasAtivas} conta${stats.contasAtivas === 1 ? '' : 's'} ativa${stats.contasAtivas === 1 ? '' : 's'}`}
        />
        <StatCard
          custom={1}
          variants={cardVariants}
          title="Receitas"
          icon={TrendingUp}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600"
          gradient="from-emerald-500 to-emerald-400"
          delay={0.6}
          value={fmtMoney(stats.receitaMes)}
          variation={stats.receitaVariacao}
        />
        <StatCard
          custom={2}
          variants={cardVariants}
          title="Despesas"
          icon={TrendingDown}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-600"
          gradient="from-rose-500 to-rose-400"
          delay={0.7}
          value={fmtMoney(stats.despesaMes)}
          variation={stats.despesaVariacao}
          invertVariation
        />
        <StatCard
          custom={3}
          variants={cardVariants}
          title="Resultado"
          icon={Banknote}
          iconBg={stats.resultadoMes >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}
          iconColor={stats.resultadoMes >= 0 ? 'text-emerald-600' : 'text-rose-600'}
          gradient={stats.resultadoMes >= 0 ? 'from-emerald-500 to-emerald-400' : 'from-rose-500 to-rose-400'}
          delay={0.8}
          value={fmtMoney(stats.resultadoMes)}
          subtitle={stats.resultadoMes >= 0 ? 'Superávit' : 'Déficit'}
        />
      </div>

      {/* Chart Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <Card className="lg:col-span-2 border-border">
          <CardHeader>
            <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
            <p className="text-xs text-muted-foreground">Receitas vs Despesas · últimos 12 meses</p>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] flex items-end justify-around gap-1.5 px-2">
              {fluxoCaixa.map((p, i) => {
                const hReceita = (p.receita / maxFluxo) * 100;
                const hDespesa = (p.despesa / maxFluxo) * 100;
                return (
                  <div key={p.mes} className="flex-1 flex items-end justify-center gap-0.5 h-full">
                    <motion.div
                      className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md relative group cursor-pointer max-w-[14px]"
                      initial={{ height: 0 }}
                      animate={{ height: `${hReceita}%` }}
                      transition={{ delay: 0.6 + i * 0.04, duration: 0.5 }}
                      whileHover={{ scale: 1.1 }}
                    >
                      <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border border-border rounded px-2 py-1 text-[10px] whitespace-nowrap shadow-md z-10">
                        Receita: {fmtMoney(p.receita)}
                      </div>
                    </motion.div>
                    <motion.div
                      className="flex-1 bg-gradient-to-t from-rose-600 to-rose-400 rounded-t-md relative group cursor-pointer max-w-[14px]"
                      initial={{ height: 0 }}
                      animate={{ height: `${hDespesa}%` }}
                      transition={{ delay: 0.65 + i * 0.04, duration: 0.5 }}
                      whileHover={{ scale: 1.1 }}
                    >
                      <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border border-border rounded px-2 py-1 text-[10px] whitespace-nowrap shadow-md z-10">
                        Despesa: {fmtMoney(p.despesa)}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-around mt-4 text-[11px] text-muted-foreground">
              {fluxoCaixa.map(p => (<span key={p.mes}>{monthLabel(p.mes)}</span>))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-emerald-600 to-emerald-400" />
                Receita
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-rose-600 to-rose-400" />
                Despesa
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Distribuição de Despesas</CardTitle>
            <p className="text-xs text-muted-foreground">{PERIOD_LABEL[period]}</p>
          </CardHeader>
          <CardContent>
            {top_despesas.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Sem despesas classificadas
              </div>
            ) : (
              <div className="space-y-4">
                {top_despesas.map((item, i) => (
                  <motion.div
                    key={item.codigo}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.1 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate" title={`${item.codigo} · ${item.nome}`}>
                        {item.nome}
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                        {item.percentual.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${item.percentual}%` }}
                        transition={{ delay: 0.8 + i * 0.1, duration: 0.8 }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {fmtMoney(item.total)}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Transactions Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Transações Recentes</CardTitle>
              <Button variant="outline" size="sm" onClick={() => onNavigate?.(2)}>
                Ver Todas
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {transacoes_recentes.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhuma transação ainda · importe um extrato pra começar
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transacoes_recentes.map((t, i) => (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + i * 0.05 }}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <TableCell className="font-medium max-w-[260px] truncate" title={t.descricao}>
                          {t.descricao}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {t.plano_contas_nome || t.culto_nome || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(t.data_competencia).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'pago' || t.status === 'conciliado' ? 'default' : 'secondary'}>
                            {labelStatus(t.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={t.tipo === 'receita' ? 'text-emerald-600 font-semibold tabular-nums' : 'text-rose-600 font-semibold tabular-nums'}>
                            {t.tipo === 'receita' ? '+' : '−'}
                            {fmtMoney(Math.abs(t.valor))}
                          </span>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Contas bancarias · resumo */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Contas bancárias</CardTitle>
              <p className="text-xs text-muted-foreground">{contas.length} contas ativas</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate?.(1)}>
              Ver todas <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {contas.map(c => (
              <div key={c.id} className="border border-border rounded-lg p-3 bg-card/50">
                <div className="text-xs text-muted-foreground mb-1">{c.banco || 'Conta'}</div>
                <div className="text-sm font-semibold truncate">{c.nome}</div>
                <div className={`text-lg font-bold mt-1 tabular-nums ${c.saldo >= 0 ? 'text-foreground' : 'text-destructive'}`}>
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
function StatCard({ custom, variants, title, icon: Icon, iconBg, iconColor, gradient, delay, value, variation, invertVariation, subtitle }) {
  let varNode = null;
  if (variation !== null && variation !== undefined && !Number.isNaN(variation)) {
    const positive = invertVariation ? variation < 0 : variation > 0;
    const VarIcon = variation > 0 ? ArrowUpRight : ArrowDownRight;
    const corClass = positive ? 'text-emerald-600' : (Math.abs(variation) < 0.5 ? 'text-muted-foreground' : 'text-rose-600');
    varNode = (
      <div className={`flex items-center pt-1 text-xs ${corClass}`}>
        <VarIcon className="mr-1 h-3 w-3" />
        <span>{variation > 0 ? '+' : ''}{variation.toFixed(1)}% em relação ao período anterior</span>
      </div>
    );
  }

  return (
    <motion.div custom={custom} initial="hidden" animate="visible" variants={variants}>
      <Card className="relative overflow-hidden border-border hover:shadow-lg transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className={`p-2 rounded-lg ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          {varNode || (subtitle && (
            <div className="flex items-center pt-1 text-xs text-muted-foreground">
              <span>{subtitle}</span>
            </div>
          ))}
        </CardContent>
        <motion.div
          className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay, duration: 0.8 }}
          style={{ transformOrigin: 'left' }}
        />
      </Card>
    </motion.div>
  );
}

function ShortcutCard({ icon: Icon, color, bgColor, title, subtitle, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full bg-card border border-border rounded-xl p-4 transition-all hover:border-primary/50 hover:shadow-md group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        {badge ? (
          <Badge variant="secondary" className="font-bold">
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

// ============================================================
// Helpers
// ============================================================
function daysAgo(isoString) {
  if (!isoString) return '';
  const d = Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  if (d < 30) return `há ${Math.floor(d / 7)} semanas`;
  return `há ${Math.floor(d / 30)} meses`;
}

function labelStatus(s) {
  const m = {
    pago: 'Pago',
    conciliado: 'Conciliado',
    pendente: 'Pendente',
    cancelado: 'Cancelado',
  };
  return m[s] || s;
}

// Normaliza serie pra 12 meses recentes (preenche meses sem dado com 0)
function normalizarSerieAnual(serie) {
  const hoje = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const map = new Map((serie || []).map(p => [p.mes, p]));
  return meses.map(mes => ({
    mes,
    receita: map.get(mes)?.receita || 0,
    despesa: map.get(mes)?.despesa || 0,
  }));
}
