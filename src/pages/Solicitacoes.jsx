import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { solicitacoes as api } from '../api';
import { playSuccessSound } from '../lib/sounds';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Plus, Filter, ClipboardList, Clock, CheckCircle2, XCircle, Search as SearchIcon, ArrowRight, List, Upload, FileText, X, Users, Star } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const CATEGORIAS = [
  { value: 'ti',             label: 'TI',                  color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',       areaResp: 'ti' },
  { value: 'compras',        label: 'Compras',             color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', areaResp: 'logistica_compras' },
  { value: 'reembolso',      label: 'Reembolso',           color: 'bg-green-500/15 text-green-700 dark:text-green-400',    areaResp: 'financeiro' },
  { value: 'reserva_espaco', label: 'Reserva de Espaço',   color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400', areaResp: 'reserva_espaco' },
  { value: 'infraestrutura', label: 'Infraestrutura',      color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400', areaResp: 'manutencao' },
  { value: 'marketing',      label: 'Marketing',           color: 'bg-pink-500/15 text-pink-700 dark:text-pink-400',       areaResp: 'marketing' },
  { value: 'ferias',         label: 'Férias',              color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',       areaResp: 'rh' },
  { value: 'licenca',        label: 'Licença',             color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400',       areaResp: 'rh' },
  { value: 'outro',          label: 'Outro',               color: 'bg-muted text-muted-foreground',                         areaResp: null },
];

const AREAS_CLIENTE = [
  { value: 'kids',   label: 'CBKids' },
  { value: 'ami',    label: 'AMI' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'sede',   label: 'Sede' },
  { value: 'online', label: 'Online' },
  { value: 'cba',    label: 'CBA' },
];

const URGENCIAS = [
  { value: 'baixa', label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'alta', label: 'Alta', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { value: 'critica', label: 'Crítica', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
];

const KANBAN_COLUMNS = [
  { key: 'pendente', label: 'Pendente', icon: Clock, color: 'border-t-amber-500' },
  { key: 'em_analise', label: 'Em Análise', icon: SearchIcon, color: 'border-t-blue-500' },
  { key: 'aprovado', label: 'Aprovado', icon: CheckCircle2, color: 'border-t-green-500' },
  { key: 'rejeitado', label: 'Rejeitado', icon: XCircle, color: 'border-t-red-500' },
  { key: 'concluido', label: 'Concluído', icon: CheckCircle2, color: 'border-t-emerald-600' },
];

const STATUS_LABELS = {
  pendente: { label: 'Pendente', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  em_analise: { label: 'Em Análise', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  aprovado: { label: 'Aprovado', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  rejeitado: { label: 'Rejeitado', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  concluido: { label: 'Concluído', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
};

function getCatMeta(cat) {
  return CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[CATEGORIAS.length - 1];
}
function getUrgMeta(urg) {
  return URGENCIAS.find(u => u.value === urg) || URGENCIAS[1];
}
function getStatusMeta(status) {
  return STATUS_LABELS[status] || { label: status, color: 'bg-muted text-muted-foreground' };
}

export default function Solicitacoes() {
  const { profile, isAdmin, canAccessModule } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterCat, setFilterCat] = useState('todas');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Determine if user is a "responsável" (can see Kanban)
  const isResponsavel = isAdmin || canAccessModule(['DP', 'Pessoas', 'Financeiro', 'Logística', 'Patrimônio', 'Membresia', 'TI']);

  // Form state
  const FORM_INITIAL = {
    titulo: '', descricao: '', justificativa: '',
    categoria: '', urgencia: 'normal', valor_estimado: '',
    area_cliente: '',
    eh_urgente: false, justificativa_urgencia: '',
    data_necessaria: '',
    espaco_solicitado: '', data_uso: '', horario_inicio: '', horario_fim: '', qtde_pessoas: '',
    forma_pagamento: '', chave_pix: '', banco: '', agencia: '', conta: '', documento_file: null,
  };
  const [form, setForm] = useState(FORM_INITIAL);
  const [slaDefs, setSlaDefs] = useState([]);

  // Carrega SLAs pra mostrar prazo expected no form
  useEffect(() => {
    api.slaDefs?.().then(setSlaDefs).catch(() => setSlaDefs([]));
  }, []);

  // Pre-preenche area_cliente baseado em profile.kpi_areas
  useEffect(() => {
    const minhasAreas = profile?.kpi_areas || [];
    const primeira = AREAS_CLIENTE.find(a => minhasAreas.includes(a.value));
    if (primeira && !form.area_cliente) {
      setForm(f => ({ ...f, area_cliente: primeira.value }));
    }
  }, [profile?.kpi_areas]);

  async function load() {
    try {
      const params = isResponsavel ? {} : { mine: 'true' };
      const data = await api.list(params);
      setItems(data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Realtime · qualquer INSERT/UPDATE/DELETE em `solicitacoes` recarrega
  // o kanban. Debounce 400ms agrega rajadas (ex: trigger de SLA atualiza
  // a mesma row varias vezes em sequencia).
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    let timeout = null;
    function schedReload() {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => { load(); }, 400);
    }
    const channel = supabase
      .channel(`solicitacoes:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes' },
        schedReload
      )
      .subscribe();
    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, isResponsavel]);

  const filtered = useMemo(() => {
    if (filterCat === 'todas') return items;
    return items.filter(i => i.categoria === filterCat);
  }, [items, filterCat]);

  const columns = useMemo(() => {
    return KANBAN_COLUMNS.map(col => ({
      ...col,
      items: filtered.filter(i => i.status === col.key),
    }));
  }, [filtered]);

  async function handleCreate() {
    try {
      setSubmitting(true);
      const payload = { ...form };
      delete payload.documento_file;

      if (payload.valor_estimado) payload.valor_estimado = parseFloat(payload.valor_estimado);
      else delete payload.valor_estimado;

      // Limpa campos opcionais vazios
      if (!payload.data_necessaria) delete payload.data_necessaria;
      if (!payload.data_uso) delete payload.data_uso;
      if (!payload.horario_inicio) delete payload.horario_inicio;
      if (!payload.horario_fim) delete payload.horario_fim;
      if (!payload.qtde_pessoas) delete payload.qtde_pessoas;
      else payload.qtde_pessoas = parseInt(payload.qtde_pessoas, 10);
      if (!payload.justificativa_urgencia) delete payload.justificativa_urgencia;
      if (!payload.espaco_solicitado) delete payload.espaco_solicitado;

      // Upload do comprovante para Supabase Storage (bucket: solicitacoes)
      if (form.documento_file && supabase) {
        const ext = form.documento_file.name.split('.').pop().toLowerCase();
        const path = `comprovantes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('solicitacoes')
          .upload(path, form.documento_file, { upsert: false });
        if (uploadError) throw new Error('Erro ao enviar comprovante: ' + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from('solicitacoes').getPublicUrl(path);
        payload.documento_url = publicUrl;
      }

      await api.create(payload);
      toast.success('Solicitação criada com sucesso!');
      setDialogOpen(false);
      setForm(FORM_INITIAL);
      setDragOver(false);
      load();
    } catch (e) {
      console.error('[SOLICITACOES] create error:', e);
      toast.error(e.message || 'Erro ao criar solicitação');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, newStatus, observacoes) {
    try {
      const payload = { status: newStatus };
      if (observacoes) payload.observacoes = observacoes;
      await api.update(id, payload);
      if (newStatus === 'concluido') {
        playSuccessSound();
        toast.success('Solicitação concluída!');
      } else {
        toast.success('Status atualizado');
      }
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleNpsSubmit(id, nota, comentario) {
    try {
      const updated = await api.update(id, { nps_nota: nota, nps_comentario: comentario });
      toast.success('Obrigado pela avaliação!');
      // Mescla com o item atual pra preservar campos enriquecidos (solicitante/responsavel)
      setDetailItem(curr => (curr ? { ...curr, ...updated } : updated));
      load();
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar avaliação');
      throw e;
    }
  }

  const showValueField = ['compras', 'reembolso'].includes(form.categoria);
  const isReembolso = form.categoria === 'reembolso';
  const isReservaEspaco = form.categoria === 'reserva_espaco';
  const reembolsoValid = !isReembolso || (
    form.forma_pagamento &&
    (form.forma_pagamento !== 'pix' || form.chave_pix.trim()) &&
    (form.forma_pagamento !== 'transferencia_bancaria' || (form.banco.trim() && form.agencia.trim() && form.conta.trim()))
  );
  const reservaEspacoValid = !isReservaEspaco || (form.espaco_solicitado.trim() && form.data_uso);
  const urgenciaValid = !form.eh_urgente || form.justificativa_urgencia.trim().length >= 5;
  const areaClienteValid = !!form.area_cliente;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Solicitações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">TI, marketing, compras, reembolso, infraestrutura, reservas, férias e licenças</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Config de responsaveis · so admin/diretor */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/admin/solicitacoes-responsaveis'}
              className="gap-1.5"
              title="Configurar responsáveis por área"
            >
              <Users className="h-4 w-4" /> Responsáveis
            </Button>
          )}
          {/* Category filter — only for responsáveis */}
          {isResponsavel && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* New request — everyone */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Nova Solicitação
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova Solicitação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Área (cliente) *</Label>
                    <Select value={form.area_cliente} onValueChange={v => setForm(f => ({ ...f, area_cliente: v }))}>
                      <SelectTrigger><SelectValue placeholder="Quem pede" /></SelectTrigger>
                      <SelectContent>
                        {AREAS_CLIENTE.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Justificativa</Label>
                  <Textarea value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} rows={2} />
                </div>

                {/* Urgente checkbox · reduz SLA · pra compras significa "sai pra rua mesmo dia" */}
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.eh_urgente}
                      onChange={e => setForm(f => ({ ...f, eh_urgente: e.target.checked }))}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span className="text-sm font-medium">Esta solicitação é urgente</span>
                  </label>
                  <p className="text-xs text-muted-foreground ml-6">
                    Reduz o prazo. Compras urgentes não passam por cotação · alguém sai pra comprar no mesmo dia.
                    Use só quando necessário · o sistema mapeia quem solicita urgência frequente.
                  </p>
                  {form.eh_urgente && (
                    <div className="ml-6 mt-2">
                      <Label className="text-xs">Justificativa da urgência *</Label>
                      <Textarea
                        value={form.justificativa_urgencia}
                        onChange={e => setForm(f => ({ ...f, justificativa_urgencia: e.target.value }))}
                        rows={2}
                        placeholder="Por que precisa ser urgente?"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>

                {/* Reserva de Espaco · campos especificos */}
                {form.categoria === 'reserva_espaco' && (
                  <div className="space-y-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-400">Detalhes da reserva</p>
                    <div className="space-y-2">
                      <Label className="text-xs">Espaço solicitado *</Label>
                      <Input
                        value={form.espaco_solicitado}
                        onChange={e => setForm(f => ({ ...f, espaco_solicitado: e.target.value }))}
                        placeholder="ex: Auditório principal, Sala Kids, Cozinha"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Data *</Label>
                        <Input type="date" value={form.data_uso} onChange={e => setForm(f => ({ ...f, data_uso: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Início</Label>
                        <Input type="time" value={form.horario_inicio} onChange={e => setForm(f => ({ ...f, horario_inicio: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Fim</Label>
                        <Input type="time" value={form.horario_fim} onChange={e => setForm(f => ({ ...f, horario_fim: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Qtde de pessoas (estimada)</Label>
                      <Input type="number" value={form.qtde_pessoas} onChange={e => setForm(f => ({ ...f, qtde_pessoas: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                )}

                {/* Data necessaria (outras categorias) */}
                {form.categoria && form.categoria !== 'reserva_espaco' && (
                  <div className="space-y-2">
                    <Label>Data necessária (opcional)</Label>
                    <Input type="date" value={form.data_necessaria} onChange={e => setForm(f => ({ ...f, data_necessaria: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">
                      Se preencher, alertaremos caso o SLA padrão não bata.
                    </p>
                  </div>
                )}

                {/* SLA esperado em tempo real */}
                {(() => {
                  const cat = CATEGORIAS.find(c => c.value === form.categoria);
                  if (!cat?.areaResp) return null;
                  const sla = slaDefs.find(s => s.area_responsavel === cat.areaResp && s.eh_urgente === !!form.eh_urgente);
                  if (!sla) return null;
                  return (
                    <div className="rounded-md bg-blue-500/5 border border-blue-500/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                      <strong>Prazo esperado:</strong> resposta em ~{Math.round(sla.sla_resposta_horas/24*10)/10} dias · conclusão em ~{Math.round(sla.sla_resolucao_horas/24*10)/10} dias
                      {form.eh_urgente && ' · modo urgente'}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Urgência (sentimento)</Label>
                    <Select value={form.urgencia} onValueChange={v => setForm(f => ({ ...f, urgencia: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {URGENCIAS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {showValueField && (
                    <div className="space-y-2">
                      <Label>Valor estimado (R$)</Label>
                      <Input type="number" step="0.01" value={form.valor_estimado} onChange={e => setForm(f => ({ ...f, valor_estimado: e.target.value }))} />
                    </div>
                  )}
                </div>
                {isReembolso && (
                  <>
                    {/* Comprovante — drag and drop */}
                    <div className="space-y-2">
                      <Label>Comprovante / Documento</Label>
                      <div
                        className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer
                          ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}
                          ${form.documento_file ? 'border-green-500 bg-green-500/5' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => {
                          e.preventDefault(); setDragOver(false);
                          const file = e.dataTransfer.files[0];
                          if (file) setForm(f => ({ ...f, documento_file: file }));
                        }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {form.documento_file ? (
                          <div className="flex items-center justify-center gap-2">
                            <FileText className="h-5 w-5 text-green-600 shrink-0" />
                            <span className="text-sm text-green-700 truncate max-w-[220px]">{form.documento_file.name}</span>
                            <button type="button" className="ml-1 text-muted-foreground hover:text-red-500"
                              onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, documento_file: null })); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5">
                            <Upload className="h-7 w-7 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
                            <p className="text-xs text-muted-foreground">PDF, JPG, PNG — até 10 MB</p>
                          </div>
                        )}
                      </div>
                      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={e => { const f = e.target.files[0]; if (f) setForm(prev => ({ ...prev, documento_file: f })); }} />
                    </div>

                    {/* Forma de pagamento */}
                    <div className="space-y-2">
                      <Label>Forma de pagamento *</Label>
                      <Select value={form.forma_pagamento} onValueChange={v => setForm(f => ({ ...f, forma_pagamento: v, chave_pix: '', banco: '', agencia: '', conta: '' }))}>
                        <SelectTrigger><SelectValue placeholder="Como quer receber?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="transferencia_bancaria">Transferência Bancária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.forma_pagamento === 'pix' && (
                      <div className="space-y-2">
                        <Label>Chave PIX *</Label>
                        <Input value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                      </div>
                    )}

                    {form.forma_pagamento === 'transferencia_bancaria' && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Banco *</Label>
                          <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil, Nubank..." />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Agência *</Label>
                            <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
                          </div>
                          <div className="space-y-2">
                            <Label>Conta *</Label>
                            <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={!form.titulo || !form.categoria || !areaClienteValid || !reembolsoValid || !reservaEspacoValid || !urgenciaValid || submitting}>
                    {submitting ? 'Criando...' : 'Criar Solicitação'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content: Kanban for responsáveis, List for collaborators */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : isResponsavel ? (
        /* ── Kanban Board (managers/admins) ── */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {columns.map(col => (
            <div
              key={col.key}
              className={`flex flex-col rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/50 ring-2 ring-primary/30' : ''}`}
              onDragOver={e => { if (!isResponsavel) return; e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault();
                setDragOverCol(null);
                if (!isResponsavel) return;
                const itemId = e.dataTransfer.getData('text/plain');
                if (itemId) handleStatusChange(itemId, col.key);
              }}
            >
              <div className={`flex items-center gap-2 pb-3 mb-3 border-b-2 ${col.color.replace('border-t-', 'border-b-')}`}>
                <col.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{col.items.length}</Badge>
              </div>
              <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
                <div className="space-y-3 pr-1 min-h-[60px]">
                  {col.items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Nenhuma solicitação</p>
                  )}
                  {col.items.map(item => (
                    <SolicitacaoCard
                      key={item.id}
                      item={item}
                      isAdmin={isResponsavel}
                      onStatusChange={handleStatusChange}
                      onClick={() => setDetailItem(item)}
                      draggable={isResponsavel}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      ) : (
        /* ── Simple list (collaborators) ── */
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="p-8 text-center">
              <List className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Você ainda não tem solicitações.</p>
              <p className="text-sm text-muted-foreground mt-1">Clique em "Nova Solicitação" para começar.</p>
            </Card>
          ) : (
            filtered.map(item => {
              const cat = getCatMeta(item.categoria);
              const urg = getUrgMeta(item.urgencia);
              const st = getStatusMeta(item.status);
              const date = new Date(item.created_at).toLocaleDateString('pt-BR');
              const precisaAvaliar = item.status === 'concluido'
                && item.solicitante_id === profile?.id
                && item.nps_nota == null;
              return (
                <Card
                  key={item.id}
                  className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${
                    precisaAvaliar ? 'border-l-4 border-l-amber-500 bg-amber-500/5' : ''
                  }`}
                  onClick={() => setDetailItem(item)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge className={`text-xs shrink-0 ${cat.color}`}>{cat.label}</Badge>
                      <p className="text-sm font-medium text-foreground truncate">{item.titulo}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {precisaAvaliar && (
                        <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1">
                          <Star className="h-3 w-3" /> Avalie
                        </Badge>
                      )}
                      {item.ml_last_status && ML_STATUS_META[item.ml_last_status] && (
                        <Badge className={`text-xs ${ML_STATUS_META[item.ml_last_status].color}`}>
                          {ML_STATUS_META[item.ml_last_status].emoji} {ML_STATUS_META[item.ml_last_status].label}
                        </Badge>
                      )}
                      <Badge className={`text-xs ${urg.color}`}>{urg.label}</Badge>
                      <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                      <span className="text-xs text-muted-foreground">{date}</span>
                    </div>
                  </div>
                  {item.descricao && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{item.descricao}</p>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Detail dialog */}
      <DetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
        isAdmin={isResponsavel}
        currentUserId={profile?.id}
        onStatusChange={handleStatusChange}
        onNpsSubmit={handleNpsSubmit}
        onItemRefresh={async () => {
          // recarrega a lista e atualiza o detailItem com a versao fresca
          const data = await api.list();
          setItems(data);
          setDetailItem(curr => (curr ? data.find(d => d.id === curr.id) || curr : curr));
        }}
      />
    </div>
  );
}

function SolicitacaoCard({ item, isAdmin, onStatusChange, onClick, draggable }) {
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);
  const solicitante = item.solicitante?.name || 'Desconhecido';
  const date = new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  return (
    <Card
      className={`p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${draggable ? 'active:opacity-60 active:scale-[0.97]' : ''}`}
      style={{ borderLeftColor: item.urgencia === 'critica' ? 'var(--destructive)' : item.urgencia === 'alta' ? '#f59e0b' : 'transparent' }}
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={`text-[10px] px-1.5 py-0.5 ${cat.color}`}>{cat.label}</Badge>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{date}</span>
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2 mb-1.5">{item.titulo}</p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{solicitante}</span>
        <Badge className={`text-[10px] px-1.5 py-0.5 ${urg.color}`}>{urg.label}</Badge>
      </div>
      {isAdmin && item.status === 'pendente' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'em_analise'); }}>
            Analisar <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
      {isAdmin && item.status === 'em_analise' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 text-green-600" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'aprovado'); }}>Aprovar</Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 text-red-600" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'rejeitado'); }}>Rejeitar</Button>
        </div>
      )}
      {isAdmin && item.status === 'aprovado' && (
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={e => { e.stopPropagation(); onStatusChange(item.id, 'concluido'); }}>
            Concluir <CheckCircle2 className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
    </Card>
  );
}

// Status do tracking ML · ordem visual da timeline
const ML_STATUS_FLOW = [
  { key: 'pending',         label: 'Pedido recebido',  emoji: '📋' },
  { key: 'handling',        label: 'Preparando envio', emoji: '📦' },
  { key: 'ready_to_ship',   label: 'Pronto p/ envio',  emoji: '📮' },
  { key: 'shipped',         label: 'Saiu para entrega',emoji: '🚚' },
  { key: 'delivered',       label: 'Entregue',         emoji: '✅' },
];
const ML_STATUS_META = {
  pending:          { label: 'Pedido recebido',     emoji: '📋', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  handling:         { label: 'Preparando envio',    emoji: '📦', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  ready_to_ship:    { label: 'Pronto p/ envio',     emoji: '📮', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  shipped:          { label: 'Saiu p/ entrega',     emoji: '🚚', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  in_transit:       { label: 'A caminho',           emoji: '🚚', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  out_for_delivery: { label: 'Saiu para entrega',   emoji: '🛵', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  delivered:        { label: 'Entregue',            emoji: '✅', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  not_delivered:    { label: 'Tentativa frustrada', emoji: '⚠️', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  cancelled:        { label: 'Cancelado',           emoji: '❌', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

function statusIndex(status) {
  const i = ML_STATUS_FLOW.findIndex(s => s.key === status);
  if (i >= 0) return i;
  // status que nao estao no flow (in_transit, out_for_delivery) caem entre shipped e delivered
  if (status === 'in_transit' || status === 'out_for_delivery') return 3.5;
  return -1;
}

function MLTrackingBlock({ item, canEdit, onChanged }) {
  const [mlInput, setMlInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [eventos, setEventos] = useState([]);
  const [showInput, setShowInput] = useState(false);

  const hasLink = !!item.ml_order_id;
  const status = item.ml_last_status;
  const meta = ML_STATUS_META[status] || null;
  const idx = statusIndex(status);

  useEffect(() => {
    if (!hasLink) { setEventos([]); return; }
    api.mlTimeline(item.id)
      .then(r => setEventos(r.eventos || []))
      .catch(() => setEventos([]));
  }, [item.id, hasLink, item.ml_last_status_changed_at]);

  async function vincular() {
    if (!mlInput.trim()) return;
    setLinking(true);
    try {
      await api.vincularML(item.id, mlInput.trim());
      toast.success('Pedido vinculado! Voce e o solicitante recebem as atualizacoes automaticamente.');
      setShowInput(false);
      setMlInput('');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao vincular pedido');
    } finally {
      setLinking(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await api.atualizarML(item.id);
      toast.success('Status atualizado do Mercado Livre');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao atualizar');
    } finally {
      setRefreshing(false);
    }
  }

  async function unlink() {
    if (!confirm('Tem certeza que quer desvincular o pedido do Mercado Livre? O tracking sera removido.')) return;
    setUnlinking(true);
    try {
      await api.desvincularML(item.id);
      toast.success('Pedido desvinculado');
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Erro ao desvincular');
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span>🛒</span> Pedido no Mercado Livre
        </p>
        {hasLink && canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Atualizando...' : 'Atualizar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={unlink} disabled={unlinking}
              className="text-red-500 hover:text-red-700">
              Desvincular
            </Button>
          </div>
        )}
      </div>

      {!hasLink && (
        <div>
          {!showInput ? (
            canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setShowInput(true)}>
                Vincular pedido do ML
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Aguardando o comprador vincular o pedido.
              </p>
            )
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Cole a URL ou o numero do pedido do Mercado Livre
              </Label>
              <div className="flex gap-2">
                <Input
                  value={mlInput}
                  onChange={e => setMlInput(e.target.value)}
                  placeholder="ex: 2000012345678 ou link completo"
                  className="text-sm"
                  autoFocus
                />
                <Button size="sm" onClick={vincular} disabled={linking || !mlInput.trim()}>
                  {linking ? 'Vinculando...' : 'Vincular'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowInput(false); setMlInput(''); }}>
                  Cancelar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O solicitante e voce passarao a receber atualizacoes automaticas (in-app + WhatsApp se configurado).
              </p>
            </div>
          )}
        </div>
      )}

      {hasLink && (
        <div className="space-y-3">
          {/* Cabecalho do pedido */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {item.ml_item_title && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Item</span>
                <p className="font-medium line-clamp-2">{item.ml_item_title}</p>
              </div>
            )}
            {item.ml_total_amount != null && (
              <div>
                <span className="text-muted-foreground text-xs">Valor</span>
                <p className="font-medium">R$ {Number(item.ml_total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {item.ml_tracking_number && (
              <div>
                <span className="text-muted-foreground text-xs">Rastreio</span>
                <p className="font-medium font-mono text-xs">{item.ml_tracking_number}</p>
              </div>
            )}
            {meta && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Status atual</span>
                <p><Badge className={meta.color}>{meta.emoji} {meta.label}</Badge></p>
              </div>
            )}
          </div>

          {/* Timeline visual · etapas */}
          <div className="flex items-center justify-between gap-1 pt-2">
            {ML_STATUS_FLOW.map((step, i) => {
              const reached = idx >= i;
              const current = idx >= i && idx < i + 1;
              return (
                <div key={step.key} className="flex-1 flex flex-col items-center text-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors
                      ${reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                      ${current ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                  >
                    {reached ? step.emoji : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 leading-tight ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                  {i < ML_STATUS_FLOW.length - 1 && (
                    <div className={`h-0.5 w-full mt-[-22px] ${idx > i ? 'bg-primary' : 'bg-border'}`}
                      style={{ position: 'relative', top: -16, zIndex: -1 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Historico de eventos */}
          {eventos.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Historico</p>
              <ul className="space-y-1.5">
                {eventos.slice().reverse().map(ev => {
                  const m = ML_STATUS_META[ev.status] || { label: ev.status, emoji: '•' };
                  return (
                    <li key={ev.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5">{m.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.label}</span>
                          <span className="text-muted-foreground text-[10px]">
                            {new Date(ev.ocorrido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {ev.descricao && ev.descricao !== m.label && (
                          <p className="text-muted-foreground line-clamp-1">{ev.descricao}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Link pro pedido no ML */}
          <a
            href={`https://www.mercadolivre.com.br/pedidos/${item.ml_order_id}/detalhe`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Ver pedido completo no Mercado Livre →
          </a>
        </div>
      )}
    </div>
  );
}

function DetailDialog({ item, onClose, isAdmin, currentUserId, onStatusChange, onNpsSubmit, onItemRefresh }) {
  const [actionPending, setActionPending] = useState(null); // e.g. 'aprovado', 'rejeitado', 'concluido', 'em_analise'
  const [obsText, setObsText] = useState('');

  if (!item) return null;
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);

  const ACTION_LABELS = {
    em_analise: 'Analisar',
    aprovado: 'Aprovar',
    rejeitado: 'Rejeitar',
    concluido: 'Concluir',
  };

  function confirmAction() {
    if (!actionPending) return;
    onStatusChange(item.id, actionPending, obsText.trim() || undefined);
    setActionPending(null);
    setObsText('');
    onClose();
  }

  function cancelAction() {
    setActionPending(null);
    setObsText('');
  }

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) { cancelAction(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={cat.color}>{cat.label}</Badge>
            {item.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Solicitante</span>
              <p className="font-medium">{item.solicitante?.name || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Urgência</span>
              <p><Badge className={urg.color}>{urg.label}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium capitalize">{item.status?.replace('_', ' ')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Data</span>
              <p className="font-medium">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            {item.valor_estimado != null && (
              <div>
                <span className="text-muted-foreground">Valor estimado</span>
                <p className="font-medium">R$ {Number(item.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            {item.responsavel?.name && (
              <div>
                <span className="text-muted-foreground">Responsável</span>
                <p className="font-medium">{item.responsavel.name}</p>
              </div>
            )}
          </div>
          {item.descricao && (
            <div>
              <span className="text-sm text-muted-foreground">Descrição</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{item.descricao}</p>
            </div>
          )}
          {item.justificativa && (
            <div>
              <span className="text-sm text-muted-foreground">Justificativa</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{item.justificativa}</p>
            </div>
          )}
          {item.observacoes && (
            <div>
              <span className="text-sm text-muted-foreground">Observações</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{item.observacoes}</p>
            </div>
          )}

          {/* Tracking de pedido Mercado Livre (apenas compras) */}
          {item.categoria === 'compras' && (
            <MLTrackingBlock
              item={item}
              canEdit={isAdmin
                || item.solicitante_id === currentUserId
                || item.responsavel_id === currentUserId}
              onChanged={() => onItemRefresh?.()}
            />
          )}

          {/* Dados de reembolso */}
          {item.categoria === 'reembolso' && (item.forma_pagamento || item.documento_url) && (
            <div className="space-y-3 pt-3 border-t border-border">
              <p className="text-sm font-semibold text-foreground">Dados de reembolso</p>
              {item.forma_pagamento && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Forma de pagamento</span>
                    <p className="font-medium">{item.forma_pagamento === 'pix' ? 'PIX' : 'Transferência Bancária'}</p>
                  </div>
                  {item.forma_pagamento === 'pix' && item.chave_pix && (
                    <div>
                      <span className="text-muted-foreground">Chave PIX</span>
                      <p className="font-medium font-mono">{item.chave_pix}</p>
                    </div>
                  )}
                  {item.forma_pagamento === 'transferencia_bancaria' && (
                    <>
                      {item.banco && <div><span className="text-muted-foreground">Banco</span><p className="font-medium">{item.banco}</p></div>}
                      {item.agencia && <div><span className="text-muted-foreground">Agência</span><p className="font-medium">{item.agencia}</p></div>}
                      {item.conta && <div><span className="text-muted-foreground">Conta</span><p className="font-medium">{item.conta}</p></div>}
                    </>
                  )}
                </div>
              )}
              {item.documento_url && (
                <a href={item.documento_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <FileText className="h-4 w-4" /> Ver comprovante
                </a>
              )}
            </div>
          )}

          {isAdmin && !actionPending && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {item.status === 'pendente' && <Button size="sm" onClick={() => setActionPending('em_analise')}>Analisar</Button>}
              {item.status === 'em_analise' && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setActionPending('aprovado')}>Aprovar</Button>
                  <Button size="sm" variant="destructive" onClick={() => setActionPending('rejeitado')}>Rejeitar</Button>
                </>
              )}
              {item.status === 'aprovado' && <Button size="sm" onClick={() => setActionPending('concluido')}>Concluir</Button>}
            </div>
          )}

          {/* NPS pos-conclusao · so pro solicitante apos status concluido */}
          {item.status === 'concluido'
            && currentUserId
            && item.solicitante_id === currentUserId
            && onNpsSubmit && (
              <NpsBlock item={item} onSubmit={onNpsSubmit} />
          )}

          {actionPending && (
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-sm font-medium text-foreground">
                Confirmar ação: <span className="text-primary">{ACTION_LABELS[actionPending]}</span>
              </p>
              <div className="space-y-2">
                <Label className="text-sm">Observações (opcional)</Label>
                <Textarea
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  placeholder="Adicione observações sobre esta decisão..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={cancelAction}>Cancelar</Button>
                <Button size="sm" onClick={confirmAction}>{ACTION_LABELS[actionPending]}</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NpsBlock({ item, onSubmit }) {
  const [nota, setNota] = useState(item.nps_nota ?? null);
  const [comentario, setComentario] = useState(item.nps_comentario || '');
  const [submitting, setSubmitting] = useState(false);
  const jaAvaliou = item.nps_nota != null;

  if (jaAvaliou) {
    return (
      <div className="space-y-2 pt-3 border-t border-border">
        <p className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Star className="h-4 w-4 text-primary fill-primary" />
          Sua avaliação
        </p>
        <p className="text-2xl font-bold text-primary">{item.nps_nota}/10</p>
        {item.nps_comentario && (
          <p className="text-sm text-muted-foreground italic">"{item.nps_comentario}"</p>
        )}
      </div>
    );
  }

  async function handleSubmit() {
    if (nota == null) {
      toast.error('Selecione uma nota de 0 a 10');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(item.id, nota, comentario.trim() || null);
    } catch {
      // erro ja foi exibido pelo handler do pai
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div>
        <p className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Star className="h-4 w-4 text-primary" />
          Como você avalia o atendimento?
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          0 = muito ruim · 10 = excelente
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setNota(n)}
            className={`w-9 h-9 rounded-md border text-sm font-medium transition ${
              nota === n
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:border-primary'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <Textarea
        value={comentario}
        onChange={e => setComentario(e.target.value)}
        placeholder="Deixe um comentário (opcional)..."
        rows={2}
      />
      <Button size="sm" onClick={handleSubmit} disabled={submitting} className="w-full">
        {submitting ? 'Enviando...' : 'Enviar avaliação'}
      </Button>
    </div>
  );
}
