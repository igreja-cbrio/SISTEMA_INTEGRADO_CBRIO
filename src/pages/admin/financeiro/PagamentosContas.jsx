import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, AlertCircle, RefreshCw, X, Loader2, Receipt, Ban, Check } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { santander } from '../../../api';

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
const fmtDateShort = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const hojeISO = () => new Date().toISOString().slice(0, 10);

const STATUS_INFO = {
  PENDENTE:               { cor: '#6b7280', label: 'Pendente' },
  AGENDADO:               { cor: '#3b82f6', label: 'Agendado' },
  AGUARDANDO_APROVACAO:   { cor: '#f59e0b', label: 'Aguard. aprovação' },
  EFETIVADO:              { cor: '#10b981', label: 'Efetivado' },
  REJEITADO:              { cor: '#ef4444', label: 'Rejeitado' },
  CANCELADO:              { cor: '#6b7280', label: 'Cancelado' },
  ERRO:                   { cor: '#ef4444', label: 'Erro' },
};

const TIPO_LABEL = {
  boleto: 'Boleto',
  tributo: 'Tributo',
  darf: 'DARF',
  concessionaria: 'Concessionária',
};

export default function PagamentosContas() {
  const [health, setHealth] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    santander.pagamentos.health().then(setHealth).catch(() => setHealth({ habilitado: false }));
    reload();
  }, []);

  const reload = () => {
    setLoading(true);
    santander.pagamentos.list({ limit: 50 })
      .then(r => setItems(r.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  const cancelar = async (id) => {
    if (!confirm('Cancelar este pagamento agendado?')) return;
    try {
      await santander.pagamentos.cancelar(id);
      reload();
    } catch (e) {
      alert('Erro ao cancelar: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Pagamento de Contas</h2>
          <p className="text-xs text-muted-foreground">
            Agenda pagamentos de boletos, tributos e concessionárias direto pela API Santander
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={!health?.habilitado}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo pagamento
        </Button>
      </div>

      {health && !health.habilitado && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-sm">
              <strong className="text-amber-700 dark:text-amber-400">Pagamentos desabilitados</strong>
              <p className="text-muted-foreground text-xs mt-1">
                {health.hint || 'Configurar SANTANDER_PAGTO_ENABLED=true no Vercel'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Pagamentos recentes</h3>
            <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum pagamento agendado ainda
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Criado</th>
                    <th className="text-left py-2 px-2 font-medium">Tipo</th>
                    <th className="text-left py-2 px-2 font-medium">Beneficiário</th>
                    <th className="text-left py-2 px-2 font-medium">Pagamento</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="py-2 px-2 text-xs text-muted-foreground tabular-nums">{fmtDate(p.created_at)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[p.tipo] || p.tipo}</Badge>
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {p.beneficiario_nome || p.descricao || '—'}
                      </td>
                      <td className="py-2 px-2 text-xs tabular-nums">{fmtDateShort(p.data_pagamento)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(p.valor)}</td>
                      <td className="py-2 px-2">
                        <Badge style={{ background: STATUS_INFO[p.status]?.cor + '20', color: STATUS_INFO[p.status]?.cor }} className="text-[10px]">
                          {STATUS_INFO[p.status]?.label || p.status}
                        </Badge>
                        {p.status_detalhe && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] truncate" title={p.status_detalhe}>
                            {p.status_detalhe}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {['AGENDADO', 'PENDENTE', 'AGUARDANDO_APROVACAO'].includes(p.status) && (
                          <Button size="sm" variant="ghost" onClick={() => cancelar(p.id)} title="Cancelar">
                            <Ban className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {showForm && (
          <PagamentoFormDialog
            onClose={() => setShowForm(false)}
            onSuccess={() => { setShowForm(false); reload(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PagamentoFormDialog({ onClose, onSuccess }) {
  const [linha, setLinha] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [erro, setErro] = useState(null);
  const [form, setForm] = useState({
    dataPagamento: hojeISO(),
    descricao: '',
    beneficiarioNome: '',
  });
  const [loading, setLoading] = useState(false);

  const validar = async () => {
    if (!linha || linha.replace(/\D/g, '').length < 47) return;
    setParsing(true);
    setErro(null);
    try {
      const r = await santander.pagamentos.parse(linha);
      setParsed(r);
      if (r.vencimento && !form.dataPagamento) {
        setForm(f => ({ ...f, dataPagamento: r.vencimento }));
      }
    } catch (e) {
      setErro(e.message);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  // Auto-valida ao colar
  useEffect(() => {
    const norm = linha.replace(/\D/g, '');
    if (norm.length === 47 || norm.length === 48) {
      validar();
    } else {
      setParsed(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linha]);

  const submit = async () => {
    if (!parsed) return;
    setErro(null);
    setLoading(true);
    try {
      await santander.pagamentos.criar({
        linha,
        dataPagamento: form.dataPagamento,
        descricao: form.descricao || undefined,
        beneficiarioNome: form.beneficiarioNome || undefined,
        origem: 'manual_admin',
      });
      onSuccess();
    } catch (e) {
      setErro(e.message || 'Erro ao agendar pagamento');
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
          <h3 className="text-base font-bold">Novo pagamento</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Linha digitável (47 dígitos boleto · 48 tributo/concessionária) *
            </label>
            <textarea
              value={linha}
              onChange={(e) => setLinha(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background font-mono tabular-nums"
              placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
              rows={3}
              autoFocus
            />
            {parsing && <div className="text-xs text-muted-foreground mt-1"><Loader2 className="h-3 w-3 inline animate-spin mr-1" /> Validando...</div>}
          </div>

          {parsed && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Linha válida · {TIPO_LABEL[parsed.tipo] || parsed.tipo}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Valor:</span>{' '}
                  <strong className="tabular-nums">{fmtMoney(parsed.valor)}</strong>
                </div>
                {parsed.vencimento && (
                  <div>
                    <span className="text-muted-foreground">Vencimento:</span>{' '}
                    <strong className="tabular-nums">{fmtDateShort(parsed.vencimento)}</strong>
                  </div>
                )}
              </div>
              {parsed.codigo_barras && (
                <div className="text-[10px] font-mono text-muted-foreground break-all">
                  {parsed.codigo_barras}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Data do pagamento *</label>
            <input
              type="date"
              value={form.dataPagamento}
              min={hojeISO()}
              onChange={(e) => setForm({ ...form, dataPagamento: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              Hoje = pagamento à vista · futuro = agendamento
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Beneficiário (opcional)</label>
            <input
              type="text"
              value={form.beneficiarioNome}
              onChange={(e) => setForm({ ...form, beneficiarioNome: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Nome do recebedor"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição interna</label>
            <input
              type="text" maxLength={100}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Ex: Aluguel · Conta de luz · IPTU"
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
          <Button onClick={submit} disabled={loading || !parsed}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Agendar pagamento
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
