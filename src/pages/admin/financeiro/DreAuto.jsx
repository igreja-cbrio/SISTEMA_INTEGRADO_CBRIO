import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Repeat, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = {
  primary: '#00B39D',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  fixa: '#3b82f6',
  variavel: '#f59e0b',
  eventual: '#8b5cf6',
};

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = (v) => {
  const n = Math.abs(Number(v || 0));
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(0)}k`;
  return fmtMoney(v);
};
const monthLabel = (yyyymm) => {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

const SUBTABS = ['Mensal', 'Comparativo', 'Recorrências'];

export default function DreAuto() {
  const [sub, setSub] = useState(0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUBTABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setSub(i)}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
              cursor: 'pointer',
              border: `1px solid ${sub === i ? COLORS.primary : 'var(--cbrio-border)'}`,
              background: sub === i ? '#00B39D18' : 'transparent',
              color: sub === i ? COLORS.primary : 'var(--cbrio-text2)',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {sub === 0 && <DreMensal />}
      {sub === 1 && <DreComparativo />}
      {sub === 2 && <Recorrencias />}
    </div>
  );
}

// ============================================================
// DRE MENSAL
// ============================================================
function DreMensal() {
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [mes, setMes] = useState(mesAtual);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    financeiroV2.dre.mensal(mes)
      .then(setData)
      .finally(() => setLoading(false));
  }, [mes]);

  const toggle = (k) => {
    const next = new Set(collapsed);
    next.has(k) ? next.delete(k) : next.add(k);
    setCollapsed(next);
  };

  const navegar = (delta) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  if (loading || !data) return <Loading />;

  return (
    <div className="space-y-4">
      {/* Header com navegação de mês */}
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => navegar(-1)}>← Mês anterior</Button>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Demonstrativo</div>
            <div className="text-lg font-bold capitalize">{monthLabel(mes)}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navegar(1)} disabled={mes >= mesAtual}>
            Próximo mês →
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Receitas" value={data.receitas.total} color={COLORS.green} icon={TrendingUp} />
        <KpiCard label="Despesas" value={data.despesas.total} color={COLORS.red} icon={TrendingDown} />
        <KpiCard label="Resultado" value={data.resultado}
          color={data.resultado >= 0 ? COLORS.green : COLORS.red} sub={data.resultado >= 0 ? 'Superávit' : 'Déficit'} />
        <KpiCard label="Margem" value={data.margem.toFixed(1) + '%'} isPct color={COLORS.blue} />
      </div>

      {/* RECEITAS */}
      <Section
        title="Receitas"
        total={data.receitas.total}
        color={COLORS.green}
        collapsed={collapsed.has('rec')}
        onToggle={() => toggle('rec')}
      >
        <Bloco
          titulo="Ordinárias (dízimos + ofertas)"
          total={data.receitas.total_ordinarias}
          linhas={data.receitas.ordinarias}
          cor={COLORS.green}
          totalGeral={data.receitas.total}
        />
        <Bloco
          titulo="Extraordinárias (campanhas, eventos, etc)"
          total={data.receitas.total_extraordinarias}
          linhas={data.receitas.extraordinarias}
          cor={COLORS.green}
          totalGeral={data.receitas.total}
        />
      </Section>

      {/* DESPESAS */}
      <Section
        title="Despesas"
        total={data.despesas.total}
        color={COLORS.red}
        collapsed={collapsed.has('desp')}
        onToggle={() => toggle('desp')}
      >
        <Bloco titulo="Fixas" total={data.despesas.total_fixas} linhas={data.despesas.fixas} cor={COLORS.fixa} totalGeral={data.despesas.total} classeBadge="fixa" />
        <Bloco titulo="Variáveis" total={data.despesas.total_variaveis} linhas={data.despesas.variaveis} cor={COLORS.variavel} totalGeral={data.despesas.total} classeBadge="variavel" />
        <Bloco titulo="Eventuais" total={data.despesas.total_eventuais} linhas={data.despesas.eventuais} cor={COLORS.eventual} totalGeral={data.despesas.total} classeBadge="eventual" />
        {data.despesas.total_sem_classe > 0 && (
          <Bloco
            titulo="⚠️ Sem classe atribuída (classifique no Plano de Contas)"
            total={data.despesas.total_sem_classe}
            linhas={data.despesas.sem_classe}
            cor="#94a3b8"
            totalGeral={data.despesas.total}
          />
        )}
      </Section>
    </div>
  );
}

function Section({ title, total, color, collapsed, onToggle, children }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between mb-3"
        >
          <div className="flex items-center gap-2">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <h3 className="text-base font-semibold">{title}</h3>
          </div>
          <div className="text-xl font-bold tabular-nums" style={{ color }}>
            {fmtMoney(total)}
          </div>
        </button>
        {!collapsed && <div className="space-y-4">{children}</div>}
      </CardContent>
    </Card>
  );
}

function Bloco({ titulo, total, linhas, cor, totalGeral, classeBadge }) {
  if (!linhas || linhas.length === 0) return null;

  // Agrupa por grupo_codigo (nivel 2 do plano)
  const grupos = new Map();
  for (const r of linhas) {
    const k = r.grupo_codigo;
    if (!grupos.has(k)) grupos.set(k, { codigo: k, linhas: [], total: 0 });
    grupos.get(k).linhas.push(r);
    grupos.get(k).total += Number(r.total);
  }
  const gruposOrd = Array.from(grupos.values()).sort((a, b) => b.total - a.total);

  return (
    <div className="border-l-4 pl-4" style={{ borderColor: cor }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{titulo}</span>
          {classeBadge && <Badge variant="outline" className="text-[10px]">{classeBadge}</Badge>}
        </div>
        <div className="text-sm font-bold tabular-nums" style={{ color: cor }}>
          {fmtMoney(total)}
          {totalGeral > 0 && (
            <span className="text-[10px] text-muted-foreground ml-2 font-normal">
              ({((total / totalGeral) * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>
      <div className="space-y-1">
        {gruposOrd.map(g => (
          <details key={g.codigo} className="text-xs">
            <summary className="cursor-pointer flex items-center justify-between py-1 hover:bg-muted/30 rounded px-2">
              <span className="font-mono opacity-60">{g.codigo} ·</span>
              <span className="flex-1 ml-2 truncate font-medium">
                {g.linhas[0]?.plano_nome?.split('·')[0] || g.codigo}
              </span>
              <span className="tabular-nums font-semibold ml-2">{fmtMoney(g.total)}</span>
            </summary>
            <div className="pl-6 pt-1 space-y-0.5">
              {g.linhas.map(r => (
                <div key={r.plano_codigo} className="flex items-center justify-between text-muted-foreground py-0.5">
                  <span className="truncate" title={`${r.plano_codigo} · ${r.plano_nome}`}>
                    {r.plano_nome}
                  </span>
                  <span className="tabular-nums ml-2">{fmtMoney(r.total)}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// COMPARATIVO
// ============================================================
function DreComparativo() {
  const [meses, setMeses] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiroV2.dre.comparativo(meses)
      .then(setData)
      .finally(() => setLoading(false));
  }, [meses]);

  if (loading || !data) return <Loading />;

  const dadosCharts = data.dados.map(d => ({
    mes: monthLabel(d.mes),
    Receitas: d.receita,
    Fixas: d.fixa,
    Variáveis: d.variavel,
    Eventuais: d.eventual,
    'Sem classe': d.sem_classe,
    Resultado: d.receita - d.fixa - d.variavel - d.eventual - d.sem_classe,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium mr-2">Comparativo dos últimos:</span>
          {[3, 6, 12].map(n => (
            <Button
              key={n}
              variant={meses === n ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMeses(n)}
            >
              {n} meses
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-1">Receitas vs Despesas por classe</h3>
          <p className="text-xs text-muted-foreground mb-4">Stacked bars · receita acima, despesas empilhadas abaixo</p>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={dadosCharts}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Receitas" fill={COLORS.green} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Fixas" stackId="d" fill={COLORS.fixa} />
                <Bar dataKey="Variáveis" stackId="d" fill={COLORS.variavel} />
                <Bar dataKey="Eventuais" stackId="d" fill={COLORS.eventual} />
                <Bar dataKey="Sem classe" stackId="d" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-4">Resultado mensal</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={dadosCharts}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
                <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="Resultado" radius={[4, 4, 0, 0]}>
                  {dadosCharts.map((d, i) => (
                    <rect key={i} fill={d.Resultado >= 0 ? COLORS.green : COLORS.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// RECORRÊNCIAS
// ============================================================
function Recorrencias() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ classe: '', ativa: 'true' });
  const [detectando, setDetectando] = useState(false);
  const [resultadoDeteccao, setResultadoDeteccao] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = { ativa: filter.ativa };
    if (filter.classe) params.classe = filter.classe;
    const result = await financeiroV2.recorrencias.list(params);
    setData(result || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const detectar = async (dryRun = false) => {
    setDetectando(true);
    try {
      const r = await financeiroV2.recorrencias.detectar({ meses: 6, dry_run: dryRun });
      setResultadoDeteccao(r);
      if (!dryRun) load();
    } finally {
      setDetectando(false);
    }
  };

  const atualizarRecorrencia = async (id, update) => {
    await financeiroV2.recorrencias.update(id, update);
    load();
  };

  const total = data.reduce((s, r) => s + Number(r.valor_medio || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Despesas recorrentes detectadas</h3>
            <p className="text-xs text-muted-foreground">
              {data.length} padrões · soma média mensal: <strong>{fmtMoney(total)}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => detectar(true)} disabled={detectando}>
              {detectando ? '...' : 'Preview detecção'}
            </Button>
            <Button size="sm" onClick={() => detectar(false)} disabled={detectando}>
              {detectando ? '...' : 'Detectar agora'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultadoDeteccao && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm">
              <strong>{resultadoDeteccao.dryRun ? 'Preview' : 'Resultado'}:</strong>
              {' '}
              {resultadoDeteccao.padroes_detectados} padrões em {resultadoDeteccao.total_analisadas} despesas analisadas
              · {resultadoDeteccao.transacoes_ligadas} transações ligadas
              {resultadoDeteccao.dryRun && ' (não persistido)'}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 pb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium mr-1">Filtrar:</span>
          {['', 'fixa', 'variavel', 'eventual'].map(c => (
            <Button
              key={c}
              variant={filter.classe === c ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter({ ...filter, classe: c })}
            >
              {c || 'Todas'}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground ml-4">
            Status:
          </span>
          <Button
            variant={filter.ativa === 'true' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter({ ...filter, ativa: 'true' })}
          >
            Ativas
          </Button>
          <Button
            variant={filter.ativa === 'false' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter({ ...filter, ativa: 'false' })}
          >
            Inativas
          </Button>
        </CardContent>
      </Card>

      {loading ? <Loading /> : (
        <div className="space-y-2">
          {data.map(r => (
            <Card key={r.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge style={{ background: COLORS[r.classe] + '22', color: COLORS[r.classe], borderColor: COLORS[r.classe] + '50' }}>
                        {r.classe}
                      </Badge>
                      <Badge variant="outline">{r.ocorrencias}x · {r.cadencia_dias}d</Badge>
                      {r.confirmada && <Badge variant="default" style={{ background: COLORS.green }}>confirmada</Badge>}
                      <span className="text-xs text-muted-foreground">
                        confiança {Math.round(r.confianca * 100)}%
                      </span>
                    </div>
                    <div className="text-sm font-semibold truncate">{r.descricao}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.plano?.codigo} · {r.plano?.nome || 'sem plano'}
                      {r.tipo_chave === 'documento' && (
                        <span className="ml-2 font-mono opacity-60">
                          · {r.chave_match}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                      <span>📅 Última: {r.ultima_ocorrencia}</span>
                      <span>📅 Próxima: <strong>{r.proxima_estimada}</strong></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold tabular-nums">{fmtMoney(r.valor_medio)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      min {fmtMoney(r.valor_minimo)} · max {fmtMoney(r.valor_maximo)}
                    </div>
                    <div className="flex items-center gap-1 mt-2 justify-end">
                      {!r.confirmada && (
                        <Button size="sm" variant="outline" onClick={() => atualizarRecorrencia(r.id, { confirmada: true })}>
                          ✓ Confirmar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => atualizarRecorrencia(r.id, { ativa: !r.ativa })}>
                        {r.ativa ? 'Desativar' : 'Reativar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {data.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma recorrência detectada · clique em "Detectar agora" pra analisar o histórico
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-componentes
// ============================================================
function KpiCard({ label, value, color, sub, icon: Icon, isPct }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
          {Icon && <Icon className="h-3.5 w-3.5" style={{ color }} />}
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums" style={{ color: sub === 'Déficit' ? COLORS.red : undefined }}>
          {isPct ? value : fmtMoney(value)}
        </div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
      Carregando...
    </div>
  );
}
