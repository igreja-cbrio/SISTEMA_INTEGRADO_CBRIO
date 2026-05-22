import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, RefreshCw, Heart, Users, Filter, Calendar,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function rangePeriodo(modo, ano, mes, inicioCustom, fimCustom) {
  if (modo === 'mes') {
    const ini = new Date(ano, mes, 1).toISOString().slice(0, 10);
    const fim = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
    return { inicio: ini, fim };
  }
  if (modo === 'ano') {
    return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  }
  return { inicio: inicioCustom, fim: fimCustom };
}

export default function Arrecadacoes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todas');

  // Filtros de periodo
  const hoje = new Date();
  const [modo, setModo] = useState('mes'); // 'mes' | 'ano' | 'custom'
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [inicioCustom, setInicioCustom] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
  const [fimCustom, setFimCustom] = useState(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10));

  const periodo = useMemo(() => rangePeriodo(modo, ano, mes, inicioCustom, fimCustom), [modo, ano, mes, inicioCustom, fimCustom]);

  const reload = () => {
    setLoading(true);
    financeiroV2.transacoes({ tipo: 'receita', inicio: periodo.inicio, fim: periodo.fim, limit: 10000 })
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || []);
        const filtradas = arr.filter(t => (t.plano_contas_codigo || '').startsWith('3.01'));
        setItems(filtradas);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [periodo.inicio, periodo.fim]);

  const filtradasUI = filtroTipo === 'todas'
    ? items
    : items.filter(t => (t.plano_contas_codigo || '').startsWith(`3.01.${filtroTipo === 'dizimo' ? '01' : filtroTipo === 'oferta' ? '02' : '03'}`));

  const totalDizimo = items.filter(t => (t.plano_contas_codigo || '').startsWith('3.01.01')).reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalOferta = items.filter(t => (t.plano_contas_codigo || '').startsWith('3.01.02')).reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalOutras = items.filter(t => (t.plano_contas_codigo || '').startsWith('3.01.03')).reduce((s, t) => s + Number(t.valor || 0), 0);
  const doadoresUnicos = new Set(items.map(t => t.membro_id).filter(Boolean)).size;

  // Lista de anos disponiveis (2022 ate ano corrente + 1)
  const anosDisponiveis = useMemo(() => {
    const arr = [];
    for (let y = hoje.getFullYear() + 1; y >= 2022; y--) arr.push(y);
    return arr;
  }, [hoje]);

  const tituloPeriodo = modo === 'mes' ? `${MES_NOMES[mes]} de ${ano}`
    : modo === 'ano' ? `Ano ${ano}`
    : `${fmtDate(inicioCustom)} a ${fmtDate(fimCustom)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500" />
            Arrecadações · {tituloPeriodo}
          </h2>
          <p className="text-xs text-muted-foreground">
            Apenas transações classificadas como contribuição (dízimos, ofertas, doações específicas).
            Alimenta o dashboard de Generosidade e o NSM (valor "Generosidade").
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Filtros de periodo */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-1 rounded bg-muted/40 p-0.5">
              {[
                { v: 'mes', label: 'Mês' },
                { v: 'ano', label: 'Ano' },
                { v: 'custom', label: 'Personalizado' },
              ].map(m => (
                <button
                  key={m.v}
                  onClick={() => setModo(m.v)}
                  className={`px-3 py-1 text-xs rounded transition ${
                    modo === m.v ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {modo === 'mes' && (
              <>
                <select value={mes} onChange={e => setMes(Number(e.target.value))}
                  className="px-2 py-1 text-xs rounded border bg-background">
                  {MES_NOMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
                <select value={ano} onChange={e => setAno(Number(e.target.value))}
                  className="px-2 py-1 text-xs rounded border bg-background">
                  {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </>
            )}

            {modo === 'ano' && (
              <select value={ano} onChange={e => setAno(Number(e.target.value))}
                className="px-2 py-1 text-xs rounded border bg-background">
                {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}

            {modo === 'custom' && (
              <>
                <input type="date" value={inicioCustom} onChange={e => setInicioCustom(e.target.value)}
                  className="px-2 py-1 text-xs rounded border bg-background" />
                <span className="text-xs text-muted-foreground">até</span>
                <input type="date" value={fimCustom} onChange={e => setFimCustom(e.target.value)}
                  className="px-2 py-1 text-xs rounded border bg-background" />
              </>
            )}

            <div className="ml-auto flex gap-1 text-[10px]">
              {[
                { label: '30d', dias: 30 },
                { label: '90d', dias: 90 },
                { label: '6m', dias: 180 },
                { label: '12m', dias: 365 },
              ].map(q => (
                <button
                  key={q.label}
                  onClick={() => {
                    setModo('custom');
                    const fim = new Date();
                    const ini = new Date(); ini.setDate(ini.getDate() - q.dias);
                    setInicioCustom(ini.toISOString().slice(0, 10));
                    setFimCustom(fim.toISOString().slice(0, 10));
                  }}
                  className="px-2 py-1 rounded bg-muted/40 hover:bg-muted/60 text-muted-foreground"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Total do período</div>
            <div className="text-2xl font-bold tabular-nums mt-1 text-emerald-600">{fmtMoney(totalDizimo + totalOferta + totalOutras)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{items.length} lançamentos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Dízimos</div>
            <div className="text-xl font-bold tabular-nums mt-1">{fmtMoney(totalDizimo)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Ofertas</div>
            <div className="text-xl font-bold tabular-nums mt-1">{fmtMoney(totalOferta)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider flex items-center gap-1">
              <Users className="h-3 w-3" /> Doadores únicos
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{doadoresUnicos}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">membros identificados</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-sm font-semibold">Lançamentos {filtradasUI.length > 0 && <span className="text-xs text-muted-foreground">({filtradasUI.length})</span>}</h3>
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {[
                { v: 'todas', label: 'Todas' },
                { v: 'dizimo', label: 'Dízimos' },
                { v: 'oferta', label: 'Ofertas' },
                { v: 'outras', label: 'Outras' },
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

          {loading && items.length === 0 ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtradasUI.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Heart className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma arrecadação classificada no período selecionado.
              <div className="text-[11px] mt-2">
                Classifique lançamentos na <strong>Fila de classificação</strong> com plano de contas 3.01.* (Dízimos / Ofertas / Doações) pra aparecer aqui.
              </div>
            </div>
          ) : (
            <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Data</th>
                    <th className="text-left py-2 px-2 font-medium">Descrição</th>
                    <th className="text-left py-2 px-2 font-medium">Categoria</th>
                    <th className="text-left py-2 px-2 font-medium">Membro</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradasUI.slice(0, 500).map((t, i) => (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.005, 0.2) }}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="py-2 px-2 text-xs tabular-nums">{fmtDate(t.data_competencia)}</td>
                      <td className="py-2 px-2 text-xs max-w-[300px] truncate" title={t.descricao}>{t.descricao}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-[10px] font-mono">{t.plano_contas_codigo}</Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">{t.membro_nome || '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-emerald-600">
                        +{fmtMoney(t.valor)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {filtradasUI.length > 500 && (
                <div className="text-[11px] text-muted-foreground text-center pt-3">
                  Exibindo primeiras 500 de {filtradasUI.length} · refine o período pra ver tudo
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
