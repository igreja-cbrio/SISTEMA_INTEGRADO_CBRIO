import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, AlertCircle, RefreshCw, X, Loader2, FileText, Copy, Check, Ban, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { santander } from '../../../api';

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
const fmtDateShort = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const hojeISO = () => new Date().toISOString().slice(0, 10);
const em7dISO = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const STATUS_INFO = {
  PENDENTE:    { cor: '#6b7280', label: 'Pendente' },
  REGISTRADO:  { cor: '#3b82f6', label: 'Registrado' },
  LIQUIDADO:   { cor: '#10b981', label: 'Liquidado' },
  BAIXADO:     { cor: '#6b7280', label: 'Baixado' },
  PROTESTADO:  { cor: '#f59e0b', label: 'Protestado' },
  CANCELADO:   { cor: '#6b7280', label: 'Cancelado' },
  ERRO:        { cor: '#ef4444', label: 'Erro' },
};

export default function BoletosEmitidos() {
  const [health, setHealth] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => {
    santander.boletos.health().then(setHealth).catch(() => setHealth({ habilitado: false }));
    reload();
  }, []);

  const reload = () => {
    setLoading(true);
    santander.boletos.list({ limit: 50 })
      .then(r => setItems(r.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  const cancelar = async (id) => {
    if (!confirm('Baixar este boleto? Não poderá mais ser pago.')) return;
    try {
      await santander.boletos.cancelar(id);
      reload();
    } catch (e) {
      alert('Erro ao baixar: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Boletos Emitidos</h2>
          <p className="text-xs text-muted-foreground">
            Emite boletos de cobrança direto pela API Santander · sem precisar acessar o app
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={!health?.habilitado || !health?.workspace_configurado}>
          <Plus className="h-4 w-4 mr-1.5" /> Emitir boleto
        </Button>
      </div>

      {health && (!health.habilitado || !health.workspace_configurado) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-sm">
              <strong className="text-amber-700 dark:text-amber-400">Emissão de boletos desabilitada</strong>
              <p className="text-muted-foreground text-xs mt-1">
                {health.hint || 'Setar SANTANDER_BOLETOS_ENABLED + SANTANDER_BOLETOS_WORKSPACE_ID no Vercel'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {health?.habilitado && health?.workspace_preview && (
        <div className="text-xs text-muted-foreground">
          Workspace: <code className="bg-muted px-1.5 py-0.5 rounded">{health.workspace_preview}</code>
          {health.beneficiary_doc && <> · Beneficiário: <code className="bg-muted px-1.5 py-0.5 rounded">{health.beneficiary_doc}</code></>}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Boletos recentes</h3>
            <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum boleto emitido ainda
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Nosso número</th>
                    <th className="text-left py-2 px-2 font-medium">Pagador</th>
                    <th className="text-left py-2 px-2 font-medium">Vencimento</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b, i) => (
                    <motion.tr
                      key={b.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setShowDetail(b)}
                    >
                      <td className="py-2 px-2 font-mono text-[11px]">{b.nosso_numero}</td>
                      <td className="py-2 px-2 text-xs">{b.pagador_nome}</td>
                      <td className="py-2 px-2 text-xs tabular-nums">{fmtDateShort(b.data_vencimento)}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtMoney(b.valor)}</td>
                      <td className="py-2 px-2">
                        <Badge style={{ background: STATUS_INFO[b.status]?.cor + '20', color: STATUS_INFO[b.status]?.cor }} className="text-[10px]">
                          {STATUS_INFO[b.status]?.label || b.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {['PENDENTE', 'REGISTRADO'].includes(b.status) && (
                          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); cancelar(b.id); }} title="Baixar boleto">
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
          <BoletoFormDialog
            onClose={() => setShowForm(false)}
            onSuccess={(b) => { setShowForm(false); setShowDetail(b); reload(); }}
          />
        )}
        {showDetail && (
          <BoletoDetailDialog boleto={showDetail} onClose={() => setShowDetail(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function BoletoFormDialog({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    valor: '',
    vencimento: em7dISO(),
    pagadorNome: '',
    pagadorDoc: '',
    pagadorEmail: '',
    pagadorTelefone: '',
    descricao: '',
    instrucoes: '',
    pagadorLogradouro: '',
    pagadorNumero: '',
    pagadorBairro: '',
    pagadorCidade: '',
    pagadorUf: '',
    pagadorCep: '',
  });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [showMore, setShowMore] = useState(false);

  const submit = async () => {
    setErro(null);
    setLoading(true);
    try {
      const r = await santander.boletos.emitir({
        valor: Number(form.valor),
        vencimento: form.vencimento,
        descricao: form.descricao || undefined,
        instrucoes: form.instrucoes || undefined,
        origem: 'manual_admin',
        pagador: {
          nome: form.pagadorNome,
          documento: form.pagadorDoc,
          email: form.pagadorEmail || undefined,
          telefone: form.pagadorTelefone || undefined,
          logradouro: form.pagadorLogradouro || undefined,
          numero: form.pagadorNumero || undefined,
          bairro: form.pagadorBairro || undefined,
          cidade: form.pagadorCidade || undefined,
          uf: form.pagadorUf || undefined,
          cep: form.pagadorCep || undefined,
        },
      });
      onSuccess(r.boleto);
    } catch (e) {
      setErro(e.message || 'Erro ao emitir');
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
          <h3 className="text-base font-bold">Emitir boleto</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Valor (R$) *</label>
              <input
                type="number" step="0.01" min="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums font-bold"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Vencimento *</label>
              <input
                type="date" min={hojeISO()}
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pagador</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Nome / Razão social *</label>
                <input
                  type="text"
                  value={form.pagadorNome}
                  onChange={(e) => setForm({ ...form, pagadorNome: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                  placeholder="Nome completo"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">CPF/CNPJ *</label>
                  <input
                    type="text"
                    value={form.pagadorDoc}
                    onChange={(e) => setForm({ ...form, pagadorDoc: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Email</label>
                  <input
                    type="email"
                    value={form.pagadorEmail}
                    onChange={(e) => setForm({ ...form, pagadorEmail: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="text-xs text-primary hover:underline mt-2"
            >
              {showMore ? '− Ocultar endereço' : '+ Adicionar endereço (recomendado)'}
            </button>

            {showMore && (
              <div className="space-y-3 mt-3 pt-3 border-t border-border/50">
                <div className="grid grid-cols-[1fr_80px] gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Logradouro</label>
                    <input
                      type="text"
                      value={form.pagadorLogradouro}
                      onChange={(e) => setForm({ ...form, pagadorLogradouro: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Nº</label>
                    <input
                      type="text"
                      value={form.pagadorNumero}
                      onChange={(e) => setForm({ ...form, pagadorNumero: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Bairro</label>
                    <input
                      type="text"
                      value={form.pagadorBairro}
                      onChange={(e) => setForm({ ...form, pagadorBairro: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Cidade</label>
                    <input
                      type="text"
                      value={form.pagadorCidade}
                      onChange={(e) => setForm({ ...form, pagadorCidade: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">UF</label>
                    <input
                      type="text" maxLength={2}
                      value={form.pagadorUf}
                      onChange={(e) => setForm({ ...form, pagadorUf: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background uppercase"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">CEP</label>
                    <input
                      type="text"
                      value={form.pagadorCep}
                      onChange={(e) => setForm({ ...form, pagadorCep: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
                      placeholder="00000-000"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Telefone</label>
                    <input
                      type="text"
                      value={form.pagadorTelefone}
                      onChange={(e) => setForm({ ...form, pagadorTelefone: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background tabular-nums"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição (impressa no boleto)</label>
              <input
                type="text" maxLength={100}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                placeholder="Ex: Mensalidade · Inscrição"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Instruções ao caixa</label>
              <input
                type="text" maxLength={100}
                value={form.instrucoes}
                onChange={(e) => setForm({ ...form, instrucoes: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                placeholder="Ex: Não receber após o vencimento"
              />
            </div>
          </div>

          {erro && (
            <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
              {erro}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !form.valor || !form.pagadorNome || !form.pagadorDoc}>
            {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Emitir boleto
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BoletoDetailDialog({ boleto, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const copy = () => {
    if (boleto.linha_digitavel) {
      navigator.clipboard.writeText(boleto.linha_digitavel);
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
        className="bg-card rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">Boleto emitido</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="text-center mb-4">
          <div className="text-3xl font-bold tabular-nums" style={{ color: '#00B39D' }}>
            {fmtMoney(boleto.valor)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Vencimento: {fmtDateShort(boleto.data_vencimento)}
          </div>
          <Badge className="mt-2 text-xs" style={{ background: STATUS_INFO[boleto.status]?.cor + '20', color: STATUS_INFO[boleto.status]?.cor }}>
            {STATUS_INFO[boleto.status]?.label}
          </Badge>
        </div>

        <div className="space-y-2 text-sm bg-muted/30 rounded-md p-3 mb-3">
          <div><span className="text-muted-foreground">Pagador:</span> <strong>{boleto.pagador_nome}</strong></div>
          {boleto.pagador_documento && (
            <div><span className="text-muted-foreground">{boleto.pagador_tipo_doc}:</span> {boleto.pagador_documento}</div>
          )}
          <div><span className="text-muted-foreground">Nosso nº:</span> <code className="text-xs">{boleto.nosso_numero}</code></div>
        </div>

        {boleto.linha_digitavel ? (
          <>
            <div className="bg-muted/50 rounded-md p-3 mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Linha digitável</div>
              <div className="text-[12px] font-mono break-all leading-relaxed tabular-nums">{boleto.linha_digitavel}</div>
            </div>

            <Button onClick={copy} className="w-full mb-2" variant={copiado ? 'default' : 'outline'}>
              {copiado ? <><Check className="h-4 w-4 mr-1.5" /> Copiado!</> : <><Copy className="h-4 w-4 mr-1.5" /> Copiar linha digitável</>}
            </Button>
          </>
        ) : boleto.status === 'ERRO' ? (
          <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
            {boleto.status_detalhe || 'Erro ao emitir · linha digitável indisponível'}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-2">
            Linha digitável pendente · pode levar alguns segundos pra registrar no Santander
          </div>
        )}

        {boleto.pdf_url && (
          <a
            href={boleto.pdf_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
          >
            <ExternalLink className="h-3 w-3" /> Baixar PDF
          </a>
        )}
      </motion.div>
    </motion.div>
  );
}
