import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, AlertCircle, RefreshCw, Loader2, ShoppingCart, Wallet,
  AlertTriangle, Clock, FileText, ExternalLink, Flame,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../../../components/ui/avatar';
import { DatePicker } from '@/components/ui/date-picker';
import { financeiro, solicitacoes } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
const fmtDateShort = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const iniciais = (nome) => {
  if (!nome) return '?';
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const SLA_COR = (deadline) => {
  if (!deadline) return null;
  const horas = (new Date(deadline).getTime() - Date.now()) / 3600000;
  if (horas < 0) return { cor: '#ef4444', label: `${Math.abs(Math.round(horas))}h atrasado` };
  if (horas < 4) return { cor: '#f59e0b', label: `${Math.round(horas)}h restantes` };
  return { cor: '#10b981', label: `${Math.round(horas)}h restantes` };
};

const CAT_INFO = {
  compras:    { label: 'Compra',    icon: ShoppingCart, cor: '#3b82f6' },
  reembolso:  { label: 'Reembolso', icon: Wallet,       cor: '#10b981' },
};

export default function SolicitacoesFinanceiro({ solicitacaoId = null }) {
  const [tab, setTab] = useState('pendentes');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Solicitações · Financeiro</h2>
        <p className="text-xs text-muted-foreground">
          Aprove compras e reembolsos antes de virar pra logística / pagamento. Acompanhe quem solicita urgência frequente.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {['pendentes', 'urgencia-frequente'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'pendentes' ? 'Aguardando aprovação' : 'Urgência frequente'}
          </button>
        ))}
      </div>

      {tab === 'pendentes' && <AbaPendentes solicitacaoId={solicitacaoId} />}
      {tab === 'urgencia-frequente' && <AbaUrgenciaFrequente />}
    </div>
  );
}

function AbaPendentes({ solicitacaoId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState(null);
  const [avisoLink, setAvisoLink] = useState(null);
  const solicitacaoDoLinkAbertaRef = useRef(null);

  const reload = () => {
    setLoading(true);
    setErro(null);
    financeiro.solicitacoesPendentesFinanceiro()
      .then(r => {
        const lista = Array.isArray(r) ? r : [];
        setItems(lista);
        if (solicitacaoId && solicitacaoDoLinkAbertaRef.current !== solicitacaoId) {
          solicitacaoDoLinkAbertaRef.current = solicitacaoId;
          setAvisoLink(null);
          const item = lista.find(itemDaFila => itemDaFila.id === solicitacaoId);
          if (item) setDetalhe(item);
          else setAvisoLink('Esta solicitação não está mais aguardando a sua aprovação financeira.');
        }
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [solicitacaoId]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Aguardando aprovação financeira</h3>
            {items.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>

        {erro && (
          <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2 mb-3">
            {erro}
          </div>
        )}

        {avisoLink && (
          <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 mb-3">
            {avisoLink}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Check className="h-10 w-10 mx-auto mb-2 text-emerald-500/40" />
            Nada pendente · todas aprovadas ou nada chegou ainda
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((s, i) => {
              const cat = CAT_INFO[s.categoria] || { label: s.categoria, cor: '#6b7280' };
              const sla = SLA_COR(s.sla_resposta_deadline);
              const Icon = cat.icon || FileText;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border border-border rounded-lg p-3 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetalhe(s)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                           style={{ background: cat.cor + '20', color: cat.cor }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold truncate">{s.titulo}</h4>
                          <Badge variant="outline" className="text-[9px]" style={{ borderColor: cat.cor, color: cat.cor }}>
                            {cat.label}
                          </Badge>
                          {s.eh_urgente && (
                            <Badge className="text-[9px] bg-rose-500/15 text-rose-600">
                              <Flame className="h-2.5 w-2.5 mr-0.5" /> URGENTE
                            </Badge>
                          )}
                          {sla && (
                            <Badge className="text-[9px]" style={{ background: sla.cor + '20', color: sla.cor }}>
                              <Clock className="h-2.5 w-2.5 mr-0.5" /> {sla.label}
                            </Badge>
                          )}
                        </div>
                        {s.descricao && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{s.descricao}</p>
                        )}
                        <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap items-center">
                          <span><strong className="text-foreground">{fmtMoney(s.valor_estimado)}</strong></span>
                          {s.solicitante_nome && (
                            <span className="flex items-center gap-1.5">
                              <Avatar className="h-5 w-5">
                                {s.solicitante_avatar && <AvatarImage src={s.solicitante_avatar} alt={s.solicitante_nome} />}
                                <AvatarFallback className="text-[8px] bg-primary/20 text-primary font-bold">
                                  {iniciais(s.solicitante_nome)}
                                </AvatarFallback>
                              </Avatar>
                              <strong className="text-foreground">{s.solicitante_nome}</strong>
                            </span>
                          )}
                          <span>{fmtDate(s.created_at)}</span>
                          {s.area_cliente && <span>Área: {s.area_cliente}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AnimatePresence>
        {detalhe && (
          <DetalheDialog
            solicitacao={detalhe}
            onClose={() => setDetalhe(null)}
            onAction={() => { setDetalhe(null); reload(); }}
          />
        )}
      </AnimatePresence>
    </Card>
  );
}

function DetalheDialog({ solicitacao: s, onClose, onAction }) {
  const [loading, setLoading] = useState(false);
  const [reprovaModal, setReprovaModal] = useState(false);
  const [sobrestaModal, setSobrestaModal] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [revisao, setRevisao] = useState('');
  const [obs, setObs] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [erro, setErro] = useState(null);
  const [cotacoes, setCotacoes] = useState([]);
  const [cotacoesLoading, setCotacoesLoading] = useState(false);
  const [cotacoesErro, setCotacoesErro] = useState(false);
  // Compra/serviço exige a forma de pagamento na aprovação: define quem executa
  // (cartão → Amaury compra; demais → Cristina paga).
  const ehCompraServico = ['compras', 'servico'].includes(s.categoria);

  useEffect(() => {
    let ativo = true;
    if (!['compras', 'servico'].includes(s.categoria) || !s.cotacao_em) {
      setCotacoes([]);
      setCotacoesLoading(false);
      setCotacoesErro(false);
      return () => { ativo = false; };
    }

    setCotacoesLoading(true);
    setCotacoesErro(false);
    solicitacoes.listarCotacoes(s.id)
      .then(resultado => { if (ativo) setCotacoes(Array.isArray(resultado) ? resultado : []); })
      .catch(() => { if (ativo) { setCotacoes([]); setCotacoesErro(true); } })
      .finally(() => { if (ativo) setCotacoesLoading(false); });
    return () => { ativo = false; };
  }, [s.id, s.categoria, s.cotacao_em]);

  const aprovar = async () => {
    if (ehCompraServico && !formaPagamento) { setErro('Escolha a forma de pagamento para aprovar.'); return; }
    setLoading(true); setErro(null);
    try {
      await financeiro.solicitacaoAprovarFinanceiro(s.id, obs, formaPagamento || undefined);
      onAction();
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };

  const reprovar = async () => {
    if (motivo.trim().length < 5) { setErro('Informe o motivo (mínimo 5 caracteres)'); return; }
    setLoading(true); setErro(null);
    try {
      await financeiro.solicitacaoReprovarFinanceiro(s.id, motivo);
      onAction();
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };

  // Sobrestar · põe a solicitação "em espera" (sai da fila até ser retomada)
  const sobrestar = async () => {
    if (motivo.trim().length < 5) { setErro('Informe o motivo (mínimo 5 caracteres)'); return; }
    setLoading(true); setErro(null);
    try {
      await financeiro.solicitacaoSobrestarFinanceiro(s.id, motivo.trim(), revisao || undefined);
      onAction();
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };

  const cat = CAT_INFO[s.categoria] || { label: s.categoria, cor: '#6b7280' };

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
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <Badge variant="outline" className="text-[10px] mb-2" style={{ borderColor: cat.cor, color: cat.cor }}>
              {cat.label}
            </Badge>
            <h3 className="text-base font-bold">{s.titulo}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {s.descricao && <p className="text-sm text-muted-foreground mb-3">{s.descricao}</p>}

        <div className="grid grid-cols-2 gap-3 text-sm mb-4 bg-muted/30 rounded-md p-3">
          {(s.solicitante_nome || s.solicitante_email) && (
            <div className="col-span-2">
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Solicitante</div>
              <div className="flex items-center gap-2.5">
                <Avatar className="h-10 w-10 shrink-0">
                  {s.solicitante_avatar && <AvatarImage src={s.solicitante_avatar} alt={s.solicitante_nome || ''} />}
                  <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
                    {iniciais(s.solicitante_nome || s.solicitante_email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{s.solicitante_nome || s.solicitante_email}</div>
                  {s.solicitante_nome && s.solicitante_email && (
                    <div className="text-[10px] text-muted-foreground truncate">{s.solicitante_email}</div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Valor</div>
            <div className="font-bold tabular-nums">{fmtMoney(s.valor_estimado)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Criada em</div>
            <div className="text-xs">{fmtDate(s.created_at)}</div>
          </div>
          {s.area_cliente && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Área cliente</div>
              <div className="text-xs">{s.area_cliente}</div>
            </div>
          )}
          {s.data_necessaria && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Data necessária</div>
              <div className="text-xs">{fmtDateShort(s.data_necessaria)}</div>
            </div>
          )}
        </div>

        {['compras', 'servico'].includes(s.categoria) && s.cotacao_em && (
          <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
            <div className="mb-2 text-[10px] font-semibold uppercase text-primary">Cotações enviadas pela logística</div>
            {cotacoesLoading ? (
              <div className="text-xs text-muted-foreground">Carregando cotações...</div>
            ) : cotacoesErro ? (
              <div style={{ padding: 12, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar as cotações</div>
                <div style={{ fontSize: 11, color: '#791F1F' }}>Verifique com a logística se as cotações foram registradas antes de aprovar.</div>
              </div>
            ) : cotacoes.length ? (
              <div className="space-y-2">
                {cotacoes.map(cotacao => (
                  <div key={cotacao.id} className={`rounded border p-2 text-xs ${cotacao.sugerida ? 'border-primary/40 bg-primary/10' : 'border-border/70 bg-background/50'}`}>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="font-semibold">{cotacao.fornecedor}</span>
                      <span className="font-semibold tabular-nums">· {fmtMoney(cotacao.valor)}</span>
                      {cotacao.sugerida && <Badge className="h-4 bg-primary/15 px-1.5 text-[9px] text-primary hover:bg-primary/15">Sugerida</Badge>}
                      {cotacao.prazo && <span className="text-muted-foreground">· {cotacao.prazo}</span>}
                    </div>
                    {cotacao.link && (
                      <a href={cotacao.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Abrir cotação
                      </a>
                    )}
                    {cotacao.observacao && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{cotacao.observacao}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="font-semibold tabular-nums">{fmtMoney(s.valor_cotado ?? s.valor_estimado)}</div>
                {s.cotacao_fornecedor && <div className="mt-1 text-xs text-muted-foreground">Fornecedor: {s.cotacao_fornecedor}</div>}
                {s.cotacao_observacao && <div className="mt-1 text-xs text-muted-foreground">{s.cotacao_observacao}</div>}
              </>
            )}
          </div>
        )}

        {s.eh_urgente && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-md p-3 mb-3">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">
              <Flame className="h-4 w-4" /> Marcada como URGENTE
            </div>
            {s.justificativa_urgencia && (
              <p className="text-xs">{s.justificativa_urgencia}</p>
            )}
          </div>
        )}

        {s.justificativa && (
          <div className="mb-3">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Justificativa</div>
            <div className="text-sm">{s.justificativa}</div>
          </div>
        )}

        {/* Bloco específico de reembolso */}
        {s.categoria === 'reembolso' && (
          <div className="space-y-2 bg-emerald-500/5 border border-emerald-500/20 rounded-md p-3 mb-3">
            <div className="text-[10px] uppercase font-semibold text-emerald-700 dark:text-emerald-400">Dados de reembolso</div>
            {s.motivo_reembolso && (
              <div className="text-sm">
                <strong className="text-xs">Motivo:</strong> {s.motivo_reembolso}
              </div>
            )}
            {s.data_compra && (
              <div className="text-sm">
                <strong className="text-xs">Data da compra:</strong> {fmtDateShort(s.data_compra)}
              </div>
            )}
            {s.forma_pagamento && (
              <div className="text-sm">
                <strong className="text-xs">Forma:</strong> {s.forma_pagamento}
                {s.chave_pix && <> · <code className="text-[11px]">{s.chave_pix}</code></>}
                {s.banco && <> · {s.banco} ag {s.agencia} c/c {s.conta}</>}
              </div>
            )}
            {s.documento_url && (
              <a href={s.documento_url} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Ver comprovante
              </a>
            )}
            {s.nota_fiscal_url && (
              <a href={s.nota_fiscal_url} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-xs text-primary hover:underline ml-3">
                <ExternalLink className="h-3 w-3" /> Ver nota fiscal
              </a>
            )}
          </div>
        )}

        {!reprovaModal && !sobrestaModal ? (
          <>
            {ehCompraServico && (
              <div className="mb-3">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Forma de pagamento *</label>
                <select
                  value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                >
                  <option value="">Selecione…</option>
                  <option value="cartao_credito">Cartão de crédito — Amaury compra</option>
                  <option value="boleto">Boleto — financeiro paga</option>
                  <option value="pix">Pix — financeiro paga</option>
                  <option value="transferencia_bancaria">Transferência — financeiro paga</option>
                  <option value="dinheiro">Dinheiro — financeiro paga</option>
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">Cartão → volta pro Amaury comprar. Demais → o financeiro (Cristina) executa o pagamento.</p>
              </div>
            )}
            <div className="mb-3">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Observação (opcional)</label>
              <textarea
                value={obs} onChange={e => setObs(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                placeholder="Ex: aprovado · usar fornecedor X"
              />
            </div>
            {erro && (
              <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2 mb-3">
                {erro}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setReprovaModal(true); setErro(null); }} disabled={loading} className="flex-1">
                <X className="h-4 w-4 mr-1.5" /> Reprovar
              </Button>
              <Button variant="outline" onClick={() => { setSobrestaModal(true); setErro(null); }} disabled={loading}
                className="flex-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                <Clock className="h-4 w-4 mr-1.5" /> Sobrestar
              </Button>
              <Button onClick={aprovar} disabled={loading || (ehCompraServico && !formaPagamento)} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Aprovar
              </Button>
            </div>
          </>
        ) : sobrestaModal ? (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-3">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2">
                <Clock className="h-4 w-4" /> Sobrestar (em espera)
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                A solicitação sai da fila até ser retomada. O motivo fica visível pro solicitante.
              </p>
              <label className="text-xs block mb-1">Motivo *</label>
              <textarea
                value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
                className="w-full px-3 py-2 text-sm rounded-md border border-amber-500/30 bg-background"
                placeholder="Por que este pedido vai esperar? Ex: aguardar caixa do próximo mês"
              />
              <label className="text-xs block mb-1 mt-2">Data de revisão (opcional)</label>
              <DatePicker
                value={revisao} onChange={v => setRevisao(v)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              />
            </div>
            {erro && (
              <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2 mb-3">
                {erro}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSobrestaModal(false); setMotivo(''); setRevisao(''); setErro(null); }} disabled={loading} className="flex-1">
                Voltar
              </Button>
              <Button onClick={sobrestar} disabled={loading || motivo.trim().length < 5}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Confirmar espera
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-md p-3 mb-3">
              <div className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5 mb-2">
                <AlertCircle className="h-4 w-4" /> Reprovar solicitação
              </div>
              <label className="text-xs block mb-1">Motivo *</label>
              <textarea
                value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
                className="w-full px-3 py-2 text-sm rounded-md border border-rose-500/30 bg-background"
                placeholder="Explique por que está reprovando · esta mensagem é enviada pro solicitante"
              />
            </div>
            {erro && (
              <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2 mb-3">
                {erro}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setReprovaModal(false); setMotivo(''); setErro(null); }} disabled={loading} className="flex-1">
                Voltar
              </Button>
              <Button variant="destructive" onClick={reprovar} disabled={loading || motivo.trim().length < 5} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Confirmar reprovação
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function AbaUrgenciaFrequente() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiro.urgenciaFrequente()
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Top solicitantes urgentes · últimos 90 dias
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Urgência frequente geralmente é sintoma de planejamento ruim · pode justificar conversa pastoral
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Check className="h-10 w-10 mx-auto mb-2 text-emerald-500/40" />
            Ninguém tem padrão de urgência frequente nos últimos 90d
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">#</th>
                  <th className="text-left py-2 px-2 font-medium">Solicitante</th>
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                  <th className="text-right py-2 px-2 font-medium">Urgentes</th>
                  <th className="text-right py-2 px-2 font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u, i) => (
                  <tr key={u.solicitante_id} className="border-b border-border/50">
                    <td className="py-2 px-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2 px-2">
                      <div className="font-medium">{u.nome}</div>
                      {u.email && <div className="text-[10px] text-muted-foreground">{u.email}</div>}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{u.total}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <Badge className="bg-rose-500/15 text-rose-600 text-[10px]">
                        <Flame className="h-2.5 w-2.5 mr-0.5" /> {u.urgentes}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <span className={u.taxa >= 0.5 ? 'text-rose-600 font-semibold' : ''}>
                        {(u.taxa * 100).toFixed(0)}%
                      </span>
                    </td>
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
