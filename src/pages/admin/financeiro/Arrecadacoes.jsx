import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, RefreshCw, Heart, TrendingUp, Users, Filter,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

// Filtra plano_contas que comecam com 3.01 (receitas de contribuicao):
//   3.01.01 · Dizimos
//   3.01.02 · Ofertas
//   3.01.03 · Doacoes especificas
// Recupera todas as transacoes ja classificadas como receita-contribuicao.
export default function Arrecadacoes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todas');

  const reload = () => {
    setLoading(true);
    // Pega todas as transacoes do mes corrente · filtra client-side por plano_contas
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
    financeiroV2.transacoes({ tipo: 'receita', inicio, fim, limit: 1000 })
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || []);
        // So contribuicoes (plano 3.01.*)
        const filtradas = arr.filter(t => (t.plano_contas_codigo || '').startsWith('3.01'));
        setItems(filtradas);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const filtradasUI = filtroTipo === 'todas'
    ? items
    : items.filter(t => (t.plano_contas_codigo || '').startsWith(`3.01.${filtroTipo === 'dizimo' ? '01' : filtroTipo === 'oferta' ? '02' : '03'}`));

  // Stats
  const totalGeral = filtradasUI.reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalDizimo = items.filter(t => (t.plano_contas_codigo || '').startsWith('3.01.01')).reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalOferta = items.filter(t => (t.plano_contas_codigo || '').startsWith('3.01.02')).reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalOutras = items.filter(t => (t.plano_contas_codigo || '').startsWith('3.01.03')).reduce((s, t) => s + Number(t.valor || 0), 0);
  const doadoresUnicos = new Set(items.map(t => t.membro_id).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Heart className="h-5 w-5 text-rose-500" />
            Arrecadações do mês
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Total do mês</div>
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
            <h3 className="text-sm font-semibold">Lançamentos</h3>
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

          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtradasUI.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Heart className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma arrecadação classificada no mês corrente.
              <div className="text-[11px] mt-2">
                Classifique lançamentos na <strong>Fila de classificação</strong> com plano de contas 3.01.* (Dízimos / Ofertas / Doações) pra aparecer aqui.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {filtradasUI.map((t, i) => (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.01, 0.3) }}
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
