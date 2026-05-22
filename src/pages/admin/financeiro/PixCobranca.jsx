import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Copy, Check, AlertCircle, RefreshCw, X, Loader2, QrCode } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { santander } from '../../../api';

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

const STATUS_INFO = {
  ATIVA:                                  { cor: '#10b981', label: 'Ativa' },
  CONCLUIDA:                              { cor: '#3b82f6', label: 'Paga' },
  REMOVIDA_PELO_USUARIO_RECEBEDOR:        { cor: '#6b7280', label: 'Cancelada' },
  REMOVIDA_PELO_PSP:                      { cor: '#f59e0b', label: 'Removida PSP' },
  ERRO:                                   { cor: '#ef4444', label: 'Erro' },
};

export default function PixCobranca() {
  const [health, setHealth] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showQr, setShowQr] = useState(null); // cobranca recém-criada / selecionada

  useEffect(() => {
    santander.pixCob.health().then(setHealth).catch(() => setHealth({ habilitado: false }));
    reload();
  }, []);

  const reload = () => {
    setLoading(true);
    santander.pixCob.list({ limit: 50 })
      .then(r => setItems(r.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">PIX Cobrança · QR Code</h2>
          <p className="text-xs text-muted-foreground">
            Gera QR Code dinâmico (BR Code) via API Santander · doações instantâneas com rastreio
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={!health?.habilitado}>
          <Plus className="h-4 w-4 mr-1.5" /> Nova cobrança
        </Button>
      </div>

      {health && !health.habilitado && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-sm">
              <strong className="text-amber-700 dark:text-amber-400">PIX Cobrança desabilitado</strong>
              <p className="text-muted-foreground text-xs mt-1">
                {health.hint || 'Configurar envs SANTANDER_PIX_COB_ENABLED=true + SANTANDER_PIX_COB_CHAVE no Vercel'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {health?.habilitado && health?.chave_preview && (
        <div className="text-xs text-muted-foreground">
          Chave PIX configurada: <code className="bg-muted px-1.5 py-0.5 rounded">{health.chave_preview}</code>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Cobranças recentes</h3>
            <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma cobrança gerada ainda
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Criada</th>
                    <th className="text-left py-2 px-2 font-medium">txid</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                    <th className="text-left py-2 px-2 font-medium">Devedor</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c, i) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="py-2 px-2 text-xs text-muted-foreground tabular-nums">{fmtDate(c.created_at)}</td>
                      <td className="py-2 px-2 font-mono text-[11px]">{c.txid.slice(0, 14)}...</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(c.valor)}</td>
                      <td className="py-2 px-2 text-xs">{c.devedor_nome || '—'}</td>
                      <td className="py-2 px-2">
                        <Badge style={{ background: STATUS_INFO[c.status]?.cor + '20', color: STATUS_INFO[c.status]?.cor }} className="text-[10px]">
                          {STATUS_INFO[c.status]?.label || c.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {c.qrcode_payload && (
                          <Button size="sm" variant="ghost" onClick={() => setShowQr(c)}>
                            <QrCode className="h-3.5 w-3.5" />
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
          <CobrancaFormDialog
            onClose={() => setShowForm(false)}
            onSuccess={(cob) => {
              setShowForm(false);
              setShowQr(cob);
              reload();
            }}
          />
        )}
        {showQr && (
          <QrCodeDialog cob={showQr} onClose={() => setShowQr(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function CobrancaFormDialog({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    valor: '',
    solicitacao: '',
    devedorNome: '',
    devedorDoc: '',
    expiracao: 3600,
  });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const submit = async () => {
    setErro(null);
    setLoading(true);
    try {
      const doc = (form.devedorDoc || '').replace(/\D/g, '');
      const payload = {
        valor: Number(form.valor),
        solicitacao: form.solicitacao || undefined,
        expiracao: Number(form.expiracao) || 3600,
        origem: 'manual_admin',
      };
      if (doc.length === 11 || doc.length === 14) {
        payload.devedor = {
          nome: form.devedorNome || 'Pagador',
          [doc.length === 11 ? 'cpf' : 'cnpj']: doc,
        };
      }
      const r = await santander.pixCob.criar(payload);
      onSuccess(r.cob);
    } catch (e) {
      setErro(e.message || 'Erro ao criar cobrança');
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
        className="bg-card rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">Nova cobrança PIX</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Valor (R$) *</label>
            <input
              type="number" step="0.01" min="0.01"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums text-lg font-bold"
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição (até 140 chars)</label>
            <input
              type="text" maxLength={140}
              value={form.solicitacao}
              onChange={(e) => setForm({ ...form, solicitacao: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Ex: Doação · Oferta culto"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Devedor (opcional)</label>
              <input
                type="text"
                value={form.devedorNome}
                onChange={(e) => setForm({ ...form, devedorNome: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                placeholder="Nome"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">CPF/CNPJ</label>
              <input
                type="text"
                value={form.devedorDoc}
                onChange={(e) => setForm({ ...form, devedorDoc: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
                placeholder="00000000000"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Expiração (segundos · default 3600 = 1h)</label>
            <input
              type="number" min={60} step={60}
              value={form.expiracao}
              onChange={(e) => setForm({ ...form, expiracao: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
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
          <Button onClick={submit} disabled={loading || !form.valor}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Gerar QR Code
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function QrCodeDialog({ cob, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const copy = () => {
    if (cob.qrcode_payload) {
      navigator.clipboard.writeText(cob.qrcode_payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
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
        className="bg-card rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">Cobrança PIX gerada</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center mb-4">
          <div className="text-3xl font-bold tabular-nums" style={{ color: '#00B39D' }}>
            {fmtMoney(cob.valor)}
          </div>
          {cob.solicitacao_pagador && (
            <div className="text-sm text-muted-foreground mt-1">{cob.solicitacao_pagador}</div>
          )}
          <Badge className="mt-2 text-xs" style={{ background: STATUS_INFO[cob.status]?.cor + '20', color: STATUS_INFO[cob.status]?.cor }}>
            {STATUS_INFO[cob.status]?.label}
          </Badge>
        </div>

        {cob.qrcode_payload ? (
          <>
            <div className="bg-white p-4 rounded-lg flex items-center justify-center mb-3">
              <QRCodeSVG value={cob.qrcode_payload} size={240} level="M" />
            </div>

            <div className="bg-muted/50 rounded-md p-3 mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">PIX Copia e Cola</div>
              <div className="text-[11px] font-mono break-all leading-relaxed">{cob.qrcode_payload}</div>
            </div>

            <Button onClick={copy} className="w-full" variant={copiado ? 'default' : 'outline'}>
              {copiado ? <><Check className="h-4 w-4 mr-1.5" /> Copiado!</> : <><Copy className="h-4 w-4 mr-1.5" /> Copiar código</>}
            </Button>
          </>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-4">
            QR code indisponível (cobrança em status {cob.status})
          </div>
        )}

        <div className="text-[10px] text-muted-foreground mt-3 font-mono">
          txid: {cob.txid}
        </div>
      </motion.div>
    </motion.div>
  );
}
