import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Loader2, X, RefreshCw, Edit, Trash2, PlayCircle, AlertTriangle,
  TrendingDown, TrendingUp, Calendar, Tag, Building2,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const CADENCIAS = [
  { dias: 7, label: 'Semanal' },
  { dias: 14, label: 'Quinzenal' },
  { dias: 30, label: 'Mensal' },
  { dias: 60, label: 'Bimestral' },
  { dias: 90, label: 'Trimestral' },
  { dias: 180, label: 'Semestral' },
  { dias: 365, label: 'Anual' },
];

const CLASSES = [
  { value: 'fixa', label: 'Fixa', color: '#3b82f6' },
  { value: 'variavel', label: 'Variável', color: '#f59e0b' },
];

export default function Recorrentes() {
  const [tab, setTab] = useState('lista');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Despesas Recorrentes · Projeção de Caixa</h2>
        <p className="text-xs text-muted-foreground">
          Cadastre fixos (aluguel, salários, assinaturas) · o sistema cria contas a pagar automaticamente e projeta o saldo dos próximos 6 meses.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[
          { k: 'lista', label: 'Cadastros' },
          { k: 'projecao', label: 'Projeção de caixa' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lista' && <AbaLista />}
      {tab === 'projecao' && <AbaProjecao />}
    </div>
  );
}

function AbaLista() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [novo, setNovo] = useState(false);
  const [geracao, setGeracao] = useState(null);

  const reload = () => {
    setLoading(true);
    financeiro.recorrentes.list({ ativa: 'true' })
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const gerarAgora = async () => {
    setGeracao('processando');
    try {
      const r = await financeiro.recorrentes.gerarContasPagar();
      setGeracao(r);
      setTimeout(() => setGeracao(null), 8000);
    } catch (e) {
      setGeracao({ error: e.message });
    }
  };

  const desativar = async (item) => {
    if (!confirm(`Desativar a recorrência "${item.descricao}"? (não cria mais contas automaticamente)`)) return;
    await financeiro.recorrentes.remove(item.id);
    reload();
  };

  const totalFixoMes = items
    .filter(r => r.ativa)
    .reduce((s, r) => {
      // converte pra valor mensal equivalente
      const mensal = (Number(r.valor_medio) * 30) / Number(r.cadencia_dias || 30);
      return s + mensal;
    }, 0);

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Cadastradas</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Custo fixo mensal estimado</div>
            <div className="text-2xl font-bold tabular-nums mt-1 text-rose-600">{fmtMoney(totalFixoMes)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">soma de todas as recorrências ativas, normalizadas pra mês</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Próxima do mês</div>
            <div className="text-sm font-semibold mt-1">
              {(() => {
                const proximas = items
                  .filter(r => r.proxima_estimada)
                  .sort((a, b) => new Date(a.proxima_estimada) - new Date(b.proxima_estimada));
                if (!proximas[0]) return '—';
                return (
                  <>
                    <div>{proximas[0].descricao}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(proximas[0].proxima_estimada)} · {fmtMoney(proximas[0].valor_medio)}</div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-sm font-semibold">Despesas Recorrentes</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={gerarAgora} disabled={geracao === 'processando'}>
                {geracao === 'processando'
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Gerando...</>
                  : <><PlayCircle className="h-3.5 w-3.5 mr-1" /> Gerar contas a pagar agora</>}
              </Button>
              <Button size="sm" onClick={() => setNovo(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nova recorrência
              </Button>
            </div>
          </div>

          {geracao && typeof geracao === 'object' && !geracao.error && (
            <div className="mb-3 text-xs bg-emerald-500/10 border border-emerald-500/30 rounded p-2.5">
              ✅ {geracao.criadas} contas criadas · {geracao.ja_existiam} já existiam neste mês
            </div>
          )}
          {geracao?.error && (
            <div className="mb-3 text-xs bg-rose-500/10 border border-rose-500/30 rounded p-2.5">
              ❌ {geracao.error}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma recorrência cadastrada
              <div className="mt-3">
                <Button size="sm" onClick={() => setNovo(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar primeira
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Descrição</th>
                    <th className="text-left py-2 px-2 font-medium">Cadência</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                    <th className="text-left py-2 px-2 font-medium">Próx. vencimento</th>
                    <th className="text-left py-2 px-2 font-medium">Classe</th>
                    <th className="text-right py-2 px-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => {
                    const cad = CADENCIAS.find(c => c.dias === r.cadencia_dias);
                    const cls = CLASSES.find(c => c.value === r.classe);
                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b border-border/50 hover:bg-muted/30"
                      >
                        <td className="py-2 px-2">
                          <div className="font-medium">{r.descricao}</div>
                          {r.fornecedor && <div className="text-[10px] text-muted-foreground">{r.fornecedor}</div>}
                        </td>
                        <td className="py-2 px-2 text-xs">
                          {cad?.label || `${r.cadencia_dias}d`}
                          {r.dia_vencimento && <span className="text-muted-foreground"> · dia {r.dia_vencimento}</span>}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(r.valor_medio)}</td>
                        <td className="py-2 px-2 text-xs">{fmtDate(r.proxima_estimada)}</td>
                        <td className="py-2 px-2">
                          {cls && (
                            <Badge className="text-[10px]" style={{ background: cls.color + '20', color: cls.color }}>
                              {cls.label}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => desativar(r)}>
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {(novo || edit) && (
          <FormDialog
            existing={edit}
            onClose={() => { setNovo(false); setEdit(null); }}
            onSuccess={() => { setNovo(false); setEdit(null); reload(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FormDialog({ existing, onClose, onSuccess }) {
  const [form, setForm] = useState({
    descricao: existing?.descricao || '',
    fornecedor: existing?.fornecedor || '',
    valor_medio: existing?.valor_medio || '',
    cadencia_dias: existing?.cadencia_dias || 30,
    dia_vencimento: existing?.dia_vencimento || '',
    classe: existing?.classe || 'fixa',
    pix_chave: existing?.pix_chave || '',
    observacao: existing?.observacao || '',
    gera_n_dias_antes: existing?.gera_n_dias_antes || 7,
    proxima_estimada: existing?.proxima_estimada || '',
  });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const submit = async () => {
    setErro(null);
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.dia_vencimento) delete payload.dia_vencimento;
      else payload.dia_vencimento = Number(payload.dia_vencimento);
      if (!payload.proxima_estimada) delete payload.proxima_estimada;
      payload.valor_medio = Number(payload.valor_medio);
      payload.cadencia_dias = Number(payload.cadencia_dias);

      if (existing) await financeiro.recorrentes.update(existing.id, payload);
      else await financeiro.recorrentes.create(payload);
      onSuccess();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-card rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">{existing ? 'Editar recorrência' : 'Nova recorrência'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição *</label>
            <input
              type="text" value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Ex: Aluguel · Salário Yago · Google Workspace"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Fornecedor / Beneficiário</label>
              <input
                type="text" value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                placeholder="Nome ou CNPJ"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Valor (R$) *</label>
              <input
                type="number" step="0.01" min="0.01"
                value={form.valor_medio}
                onChange={(e) => setForm({ ...form, valor_medio: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Cadência</label>
              <select
                value={form.cadencia_dias}
                onChange={(e) => setForm({ ...form, cadencia_dias: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              >
                {CADENCIAS.map(c => <option key={c.dias} value={c.dias}>{c.label} ({c.dias}d)</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Dia do mês {form.cadencia_dias == 30 && '(opcional)'}
              </label>
              <input
                type="number" min={1} max={31}
                value={form.dia_vencimento}
                onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
                placeholder="Ex: 5, 10, 15"
                disabled={form.cadencia_dias != 30}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Classe</label>
              <select
                value={form.classe}
                onChange={(e) => setForm({ ...form, classe: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              >
                {CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Gerar X dias antes</label>
              <input
                type="number" min={0} max={30}
                value={form.gera_n_dias_antes}
                onChange={(e) => setForm({ ...form, gera_n_dias_antes: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
              />
            </div>
          </div>

          {form.cadencia_dias != 30 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Próximo vencimento estimado</label>
              <input
                type="date"
                value={form.proxima_estimada}
                onChange={(e) => setForm({ ...form, proxima_estimada: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Chave PIX (opcional)</label>
            <input
              type="text" value={form.pix_chave}
              onChange={(e) => setForm({ ...form, pix_chave: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="email/celular/CNPJ/aleatória"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Observação</label>
            <textarea
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              rows={2}
            />
          </div>

          {erro && (
            <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {erro}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !form.descricao || !form.valor_medio}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {existing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AbaProjecao() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiro.projecaoCaixa()
      .then(r => setData(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  const maxAbs = Math.max(...data.map(d => Math.abs(Number(d.saldo_projetado) || 0)), 1);
  const minSaldo = Math.min(...data.map(d => Number(d.saldo_projetado) || 0));
  const mesCritico = data.find(d => Number(d.saldo_projetado) < 0);

  return (
    <div className="space-y-3">
      {/* Alerta crítico */}
      {mesCritico && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                Atenção · saldo negativo previsto em {mesCritico.mes_label}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Projeção fica em {fmtMoney(mesCritico.saldo_projetado)} considerando receita histórica média + despesas confirmadas + recorrentes.
                Reveja despesas variáveis ou planeje captação extra.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráfico de barras */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-4">Saldo projetado · próximos 6 meses</h3>
          <div className="space-y-2">
            {data.map((m, i) => {
              const saldo = Number(m.saldo_projetado) || 0;
              const positivo = saldo >= 0;
              const widthPct = Math.min(100, (Math.abs(saldo) / maxAbs) * 100);
              return (
                <motion.div
                  key={m.mes_inicio}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium uppercase tabular-nums">{m.mes_label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {fmtMoney(saldo)}
                    </span>
                  </div>
                  <div className="relative h-6 bg-muted/30 rounded overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full rounded transition-all ${positivo ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${widthPct}%`, opacity: 0.8 }}
                    />
                  </div>
                  <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                    <span><TrendingUp className="h-2.5 w-2.5 inline text-emerald-500" /> +{fmtMoney(m.receita_estimada)}</span>
                    <span><TrendingDown className="h-2.5 w-2.5 inline text-rose-500" /> -{fmtMoney(Number(m.despesa_confirmada) + Number(m.despesa_recorrente))}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Explicação da projeção */}
      <Card className="bg-muted/20">
        <CardContent className="pt-4 pb-4">
          <h4 className="text-xs font-semibold mb-2 uppercase tracking-wider text-muted-foreground">Como o cálculo é feito</h4>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li>• <strong>Receita estimada</strong>: média dos últimos 6 meses de receitas</li>
            <li>• <strong>Despesa confirmada</strong>: contas a pagar já cadastradas no mês</li>
            <li>• <strong>Despesa recorrente</strong>: fixos cadastrados aqui que vencem no mês</li>
            <li>• <strong>Saldo projetado</strong>: saldo atual + acumulado dos meses anteriores</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
