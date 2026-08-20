import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { hrefConversa } from '@/lib/conversas';
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, Users, Heart, Wallet,
  UserCheck, UserX, AlertTriangle, Phone, Mail, ExternalLink, ArrowUp, ArrowDown,
  Trophy, X,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMoneyShort = (v) => {
  const n = Number(v || 0);
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
};
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export default function Generosidade() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" />
          Dashboard de Generosidade
        </h2>
        <p className="text-xs text-muted-foreground">
          Acompanhe doações, evolução mensal, doadores anônimos e quem parou de contribuir · ação pastoral baseada em dado.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[
          { k: 'overview',  label: 'Visão geral',     icon: TrendingUp },
          { k: 'topo',      label: 'Top contribuintes', icon: Trophy },
          { k: 'anonimos',  label: 'Doadores anônimos', icon: UserX },
          { k: 'pararam',   label: 'Pararam de doar',  icon: AlertTriangle },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${
              tab === t.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <AbaOverview />}
      {tab === 'topo'     && <AbaTopo />}
      {tab === 'anonimos' && <AbaAnonimos />}
      {tab === 'pararam'  && <AbaPararam />}
    </div>
  );
}

function AbaOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    financeiro.generosidade.overview()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;
  }
  if (!data) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Não foi possível carregar.</div>;
  }

  const { mensal = [], mes_atual = {}, variacao_pct, dizimo_medio, pct_membros_doando, doadores_unicos_mes, membros_ativos } = data;
  const maxTotal = Math.max(...mensal.map(m => Number(m.total || 0)), 1);

  return (
    <div className="space-y-4">
      {/* Stats principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Receita do mês</div>
              <Wallet className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{fmtMoney(mes_atual.total)}</div>
            {variacao_pct != null && (
              <div className={`text-xs mt-0.5 ${variacao_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {variacao_pct >= 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                {' '}{fmtPct(variacao_pct)} vs mês anterior
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Dízimo médio</div>
              <Heart className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{fmtMoney(dizimo_medio)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">por doador único no mês</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Doadores únicos</div>
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{mes_atual.qtd_doadores_unicos || 0}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{mes_atual.qtd_doacoes || 0} doações no mês</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">% membros doando</div>
              <UserCheck className="h-4 w-4 text-violet-500" />
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{pct_membros_doando.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {doadores_unicos_mes} de {membros_ativos} ativos
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico mensal · barras */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Evolução · últimos 12 meses</h3>
            <Button size="sm" variant="ghost" onClick={reload}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
            </Button>
          </div>

          {mensal.every(m => Number(m.total) === 0) ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma doação registrada ainda.
              <div className="text-[11px] mt-1">
                Dados virão de <code>mem_contribuicoes</code>, <code>fin_transacoes</code> (receitas) ou <code>fin_pix_detalhe</code>.
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {mensal.map((m, i) => {
                const total = Number(m.total || 0);
                const widthPct = (total / maxTotal) * 100;
                return (
                  <motion.div
                    key={m.mes}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-2"
                  >
                    <div className="text-[10px] uppercase tabular-nums w-14 text-muted-foreground shrink-0">
                      {m.mes_label}
                    </div>
                    <div className="flex-1 relative h-5 bg-muted/30 rounded overflow-hidden">
                      <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                      {total > 0 && (
                        <div className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                          {widthPct > 25 && fmtMoneyShort(total)}
                        </div>
                      )}
                    </div>
                    <div className="text-xs tabular-nums w-20 text-right">
                      {fmtMoney(total)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Composicao · dizimo vs oferta */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3">Composição do mês</h3>
          {(() => {
            const total = (mes_atual.dizimo || 0) + (mes_atual.oferta || 0) + (mes_atual.outras || 0);
            if (total === 0) {
              return <div className="text-xs text-muted-foreground text-center py-4">Sem dados no mês atual</div>;
            }
            return (
              <div className="space-y-2">
                {[
                  { label: 'Dízimos', valor: mes_atual.dizimo, cor: '#ec4899' },
                  { label: 'Ofertas', valor: mes_atual.oferta, cor: '#10b981' },
                  { label: 'Outras',  valor: mes_atual.outras, cor: '#6b7280' },
                ].filter(x => x.valor > 0).map(x => (
                  <div key={x.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{x.label}</span>
                      <span className="tabular-nums">
                        {fmtMoney(x.valor)} · {((x.valor / total) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted/30 rounded overflow-hidden">
                      <div className="h-full rounded transition-all" style={{ background: x.cor, width: `${(x.valor / total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

function AbaAnonimos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiro.generosidade.anonimos()
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Top doadores anônimos · últimos 90 dias</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Pessoas que doaram via PIX mas ainda não estão cadastradas como membros. Oportunidade pastoral · identificar e acolher.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum doador anônimo recorrente nos últimos 90d
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">#</th>
                  <th className="text-left py-2 px-2 font-medium">Nome</th>
                  <th className="text-left py-2 px-2 font-medium">CPF/CNPJ</th>
                  <th className="text-right py-2 px-2 font-medium">Doações</th>
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                  <th className="text-left py-2 px-2 font-medium">Última</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d, i) => (
                  <tr key={d.identificador} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2 px-2 font-medium">{d.nome || '—'}</td>
                    <td className="py-2 px-2 text-xs font-mono">{d.documento || '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{d.qtd_doacoes}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(d.total)}</td>
                    <td className="py-2 px-2 text-xs">{fmtDate(d.ultima_doacao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TIPO_LABEL = { dizimo: 'Dízimo', oferta: 'Oferta', campanha: 'Campanha', outro: 'Outra', doacao_pix: 'PIX' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function labelPeriodo(p) {
  if (p === 'tudo') return 'Todo o período';
  if (p === '12m') return 'Últimos 12 meses';
  const [a, m] = p.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

function AbaTopo() {
  const [periodoMode, setPeriodoMode] = useState('12m'); // '12m' | 'tudo' | 'mes'
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [ordem, setOrdem] = useState('desc'); // 'desc' = maior valor · 'asc' = menor valor
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState(null);

  const periodoEfetivo = periodoMode === 'mes' && mes ? mes : periodoMode;

  useEffect(() => {
    setLoading(true);
    financeiro.generosidade.top(periodoEfetivo, ordem)
      .then(r => setItems(Array.isArray(r?.top) ? r.top : []))
      .finally(() => setLoading(false));
  }, [periodoEfetivo, ordem]);

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top contribuintes
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                Membros que {ordem === 'desc' ? 'mais' : 'menos'} contribuíram, por valor total
                no período. Considera as contribuições cadastradas (<code>mem_contribuicoes</code>)
                — doações via PIX ainda não identificadas ficam na aba "Doadores anônimos".
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden">
                {[
                  ['12m', '12 meses'],
                  ['tudo', 'Todo período'],
                  ['mes', 'Mês'],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setPeriodoMode(k)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      periodoMode === k ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {periodoMode === 'mes' && (
                <input
                  type="month"
                  value={mes}
                  onChange={e => setMes(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-input px-2 text-xs"
                />
              )}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {[
                  ['desc', 'Maior valor', ArrowDown],
                  ['asc', 'Menor valor', ArrowUp],
                ].map(([k, label, Icon]) => (
                  <button
                    key={k}
                    onClick={() => setOrdem(k)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      ordem === k ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3 w-3 inline mr-1" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma contribuição cadastrada no período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">#</th>
                    <th className="text-left py-2 px-2 font-medium">Membro</th>
                    <th className="text-right py-2 px-2 font-medium">Doações</th>
                    <th className="text-right py-2 px-2 font-medium">Total</th>
                    <th className="text-left py-2 px-2 font-medium">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d, i) => (
                    <tr
                      key={d.membro_id}
                      onClick={() => setSelecionado(d)}
                      title="Ver histórico de contribuições"
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                    >
                      <td className="py-2 px-2 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="py-2 px-2 font-medium">{d.nome || '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{d.qtd_doacoes}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(d.total)}</td>
                      <td className="py-2 px-2 text-xs">{fmtDate(d.ultima_doacao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {selecionado && (
          <HistoricoDialog contribuinte={selecionado} periodo={periodoEfetivo} onClose={() => setSelecionado(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function HistoricoDialog({ contribuinte, periodo, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiro.generosidade.historico(contribuinte.membro_id, periodo)
      .then(r => setData(r || null))
      .finally(() => setLoading(false));
  }, [contribuinte.membro_id, periodo]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-card rounded-lg shadow-xl w-full max-w-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <Badge variant="outline" className="text-[10px] mb-1">{contribuinte.nome || 'Membro'}</Badge>
            <h3 className="text-base font-bold">Histórico de contribuições</h3>
            <p className="text-[11px] text-muted-foreground">
              {labelPeriodo(periodo)}
            </p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : !data || (data.contribuicoes || []).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Sem contribuições no período</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="text-center bg-emerald-500/10 border border-emerald-500/30 rounded p-2">
                <div className="text-[9px] uppercase text-emerald-700 dark:text-emerald-400">Total</div>
                <div className="text-sm font-bold tabular-nums">{fmtMoney(data.total)}</div>
              </div>
              <div className="text-center border border-border bg-muted/20 rounded p-2">
                <div className="text-[9px] uppercase text-muted-foreground">Doações</div>
                <div className="text-sm font-bold tabular-nums">{data.qtd_doacoes}</div>
              </div>
              <div className="text-center border border-border bg-muted/20 rounded p-2">
                <div className="text-[9px] uppercase text-muted-foreground">Primeira</div>
                <div className="text-xs font-bold">{fmtDate(data.primeira_doacao)}</div>
              </div>
              <div className="text-center border border-border bg-muted/20 rounded p-2">
                <div className="text-[9px] uppercase text-muted-foreground">Última</div>
                <div className="text-xs font-bold">{fmtDate(data.ultima_doacao)}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Data</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                    <th className="text-left py-2 px-2 font-medium">Tipo</th>
                    <th className="text-left py-2 px-2 font-medium">Forma</th>
                    <th className="text-left py-2 px-2 font-medium">Campanha</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.contribuicoes || []).map(c => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="py-2 px-2 text-xs">{fmtDate(c.data)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(c.valor)}</td>
                      <td className="py-2 px-2 text-xs">{TIPO_LABEL[c.tipo] || c.tipo || '—'}</td>
                      <td className="py-2 px-2 text-xs">{c.forma_pagamento || '—'}</td>
                      <td className="py-2 px-2 text-xs">{c.campanha || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function AbaPararam() {
  const [periodo, setPeriodo] = useState('2m'); // '2m' | '3m' | '6m'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Ordenação: por valor total ou nº de doações. Default = maior valor primeiro
  // (quem mais doava e parou · prioridade pastoral). Clicar inverte a direção.
  const [sortKey, setSortKey] = useState('valor_total'); // 'valor_total' | 'doacoes_total'
  const [sortDir, setSortDir] = useState('desc');         // 'desc' | 'asc'

  useEffect(() => {
    setLoading(true);
    financeiro.generosidade.pararam(periodo)
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  }, [periodo]);

  function ordenarPor(k) {
    if (sortKey === k) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const va = Number(a[sortKey] || 0);
      const vb = Number(b[sortKey] || 0);
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const SetaSort = ({ col }) => sortKey !== col ? null
    : (sortDir === 'desc' ? <ArrowDown className="h-3 w-3 inline ml-1" /> : <ArrowUp className="h-3 w-3 inline ml-1" />);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Membros que pararam de doar
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Doadores regulares (≥3 doações no histórico) que não doam há mais de{' '}
              {{ '2m': '2 meses', '3m': '3 meses', '6m': '6 meses' }[periodo]}. Conversa pastoral pode reativar.
            </p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[
              ['2m', '2 meses'],
              ['3m', '3 meses'],
              ['6m', '6 meses'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPeriodo(k)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  periodo === k ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum doador regular nesse período de inatividade
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">Membro</th>
                  <th className="text-left py-2 px-2 font-medium">Contato</th>
                  <th className="text-right py-2 px-2 font-medium">
                    <button onClick={() => ordenarPor('doacoes_total')}
                      className={`inline-flex items-center hover:text-foreground uppercase ${sortKey === 'doacoes_total' ? 'text-foreground' : ''}`}
                      title="Ordenar por nº de doações">
                      Doações<SetaSort col="doacoes_total" />
                    </button>
                  </th>
                  <th className="text-right py-2 px-2 font-medium">
                    <button onClick={() => ordenarPor('valor_total')}
                      className={`inline-flex items-center hover:text-foreground uppercase ${sortKey === 'valor_total' ? 'text-foreground' : ''}`}
                      title="Ordenar por valor total">
                      Total histórico<SetaSort col="valor_total" />
                    </button>
                  </th>
                  <th className="text-left py-2 px-2 font-medium">Última</th>
                  <th className="text-right py-2 px-2 font-medium">Inativo há</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => {
                  const dias = Number(d.dias_inativo || 0);
                  const cor = dias > 180 ? 'text-rose-600' : dias > 120 ? 'text-amber-600' : 'text-muted-foreground';
                  return (
                    <tr key={d.membro_id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{d.nome}</td>
                      <td className="py-2 px-2 text-xs">
                        {d.telefone && (
                          <Link to={hrefConversa(`55${(d.telefone || '').replace(/\D/g, '')}`)}
                             className="inline-flex items-center gap-1 hover:underline">
                            <Phone className="h-3 w-3" /> {d.telefone}
                          </Link>
                        )}
                        {d.email && (
                          <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1 hover:underline mt-1">
                            <Mail className="h-3 w-3" /> {d.email}
                          </a>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{d.doacoes_total}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(d.valor_total)}</td>
                      <td className="py-2 px-2 text-xs">{fmtDate(d.ultima_doacao)}</td>
                      <td className={`py-2 px-2 text-right tabular-nums text-xs font-semibold ${cor}`}>{dias}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
