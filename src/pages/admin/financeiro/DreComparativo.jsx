import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Minus,
  Calendar, Banknote,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;

const calcPct = (atual, base) => {
  if (!base || Number(base) === 0) return null;
  return ((Number(atual) - Number(base)) / Math.abs(Number(base))) * 100;
};

const VariacaoBadge = ({ atual, base }) => {
  const pct = calcPct(atual, base);
  if (pct == null) return <span className="text-[10px] text-muted-foreground">—</span>;
  if (Math.abs(pct) < 1) return (
    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
      <Minus className="h-2.5 w-2.5" /> 0%
    </span>
  );
  const Icon = pct > 0 ? ArrowUp : ArrowDown;
  // Variação positiva em receita é boa, em despesa é ruim (e vice-versa) · cores
  // ficam mais informativas mostrando direção e magnitude
  const cor = Math.abs(pct) > 20 ? '#f59e0b' : pct > 0 ? '#10b981' : '#6b7280';
  return (
    <span className="text-[10px] flex items-center gap-0.5 tabular-nums" style={{ color: cor }}>
      <Icon className="h-2.5 w-2.5" /> {Math.abs(pct).toFixed(0)}%
    </span>
  );
};

export default function DreComparativo() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  useEffect(() => {
    setLoading(true);
    financeiro.dreComparativo()
      .then(setData)
      .catch(() => setData({ linhas: [], totais: [] }))
      .finally(() => setLoading(false));
  }, []);

  const totais = useMemo(() => {
    const arr = data?.totais || [];
    const r = arr.find(t => t.tipo === 'receita') || { atual: 0, anterior: 0, ano_passado: 0 };
    const d = arr.find(t => t.tipo === 'despesa') || { atual: 0, anterior: 0, ano_passado: 0 };
    return {
      receita: r,
      despesa: d,
      resultado: {
        atual: Number(r.atual) - Number(d.atual),
        anterior: Number(r.anterior) - Number(d.anterior),
        ano_passado: Number(r.ano_passado) - Number(d.ano_passado),
      },
    };
  }, [data]);

  const linhasFiltradas = useMemo(() => {
    const arr = data?.linhas || [];
    if (filtroTipo === 'todos') return arr;
    return arr.filter(l => l.tipo === filtroTipo);
  }, [data, filtroTipo]);

  const mesAtualLabel = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, []);
  const mesAnteriorLabel = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, []);
  const anoPassadoLabel = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, []);

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          DRE Comparativo Temporal
        </h2>
        <p className="text-xs text-muted-foreground">
          Mês atual ({mesAtualLabel}) vs mês anterior vs mesmo mês ano passado · análise de tendência
        </p>
      </div>

      {/* Header · totais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResumoCard
          tipo="receita" titulo="Receita" cor="#10b981" icone={TrendingUp}
          atual={totais.receita.atual}
          anterior={totais.receita.anterior}
          anoPassado={totais.receita.ano_passado}
        />
        <ResumoCard
          tipo="despesa" titulo="Despesa" cor="#ef4444" icone={TrendingDown}
          atual={totais.despesa.atual}
          anterior={totais.despesa.anterior}
          anoPassado={totais.despesa.ano_passado}
        />
        <ResumoCard
          tipo="resultado" titulo="Resultado" cor={totais.resultado.atual >= 0 ? '#10b981' : '#ef4444'}
          icone={Banknote}
          atual={totais.resultado.atual}
          anterior={totais.resultado.anterior}
          anoPassado={totais.resultado.ano_passado}
        />
      </div>

      {/* Tabela detalhada · por plano de contas */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold">Detalhamento por plano de contas</h3>
            <div className="flex gap-1">
              {[
                { v: 'todos', label: 'Todos' },
                { v: 'receita', label: 'Receitas' },
                { v: 'despesa', label: 'Despesas' },
              ].map(t => (
                <button
                  key={t.v}
                  onClick={() => setFiltroTipo(t.v)}
                  className={`px-2.5 py-1 text-[11px] rounded ${
                    filtroTipo === t.v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/40 hover:bg-muted/60 text-muted-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {linhasFiltradas.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma linha com movimento nos 3 períodos
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Plano</th>
                    <th className="text-right py-2 px-2 font-medium" colSpan={2}>{mesAtualLabel}</th>
                    <th className="text-right py-2 px-2 font-medium" colSpan={2}>{mesAnteriorLabel}</th>
                    <th className="text-right py-2 px-2 font-medium" colSpan={2}>{anoPassadoLabel}</th>
                  </tr>
                  <tr className="border-b border-border/50 text-[9px] uppercase text-muted-foreground/70">
                    <th></th>
                    <th className="text-right py-1 px-2">Valor</th>
                    <th className="text-right py-1 px-2">vs anterior</th>
                    <th className="text-right py-1 px-2">Valor</th>
                    <th className="text-right py-1 px-2">vs ano passado</th>
                    <th className="text-right py-1 px-2">Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map((l, i) => (
                    <motion.tr
                      key={`${l.plano_codigo}-${l.tipo}`}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.01, 0.3) }}
                      className="border-b border-border/30 hover:bg-muted/20"
                    >
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] font-mono shrink-0">{l.plano_codigo}</Badge>
                          <div className={`text-xs truncate ${l.tipo === 'receita' ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {l.plano_nome}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(l.atual)}</td>
                      <td className="py-2 px-2 text-right"><VariacaoBadge atual={l.atual} base={l.anterior} /></td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtMoney(l.anterior)}</td>
                      <td className="py-2 px-2 text-right"><VariacaoBadge atual={l.atual} base={l.ano_passado} /></td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtMoney(l.ano_passado)}</td>
                      <td></td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoCard({ titulo, cor, icone: Icone, atual, anterior, anoPassado }) {
  const pctAnt = calcPct(atual, anterior);
  const pctAno = calcPct(atual, anoPassado);

  return (
    <Card style={{ borderColor: cor + '40' }}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{titulo}</div>
          <Icone className="h-4 w-4" style={{ color: cor }} />
        </div>
        <div className="text-2xl font-bold tabular-nums" style={{ color: Number(atual) < 0 ? '#ef4444' : undefined }}>
          {fmtMoney(atual)}
        </div>
        <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
          <div className="border-r border-border/40 pr-1">
            <div className="text-muted-foreground uppercase">vs mês ant.</div>
            <div className="tabular-nums font-semibold mt-0.5">{fmtPct(pctAnt)}</div>
            <div className="text-muted-foreground tabular-nums">{fmtMoney(anterior)}</div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase">vs ano pass.</div>
            <div className="tabular-nums font-semibold mt-0.5">{fmtPct(pctAno)}</div>
            <div className="text-muted-foreground tabular-nums">{fmtMoney(anoPassado)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
