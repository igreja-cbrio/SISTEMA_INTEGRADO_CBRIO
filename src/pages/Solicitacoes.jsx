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
import { Plus, Filter, ClipboardList, Clock, CheckCircle2, XCircle, Search as SearchIcon, ArrowRight, List, Upload, FileText, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const CATEGORIAS = [
  { value: 'ti', label: 'TI', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'compras', label: 'Compras', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  { value: 'reembolso', label: 'Reembolso', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  { value: 'espaco', label: 'Reserva de Espaço', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
  { value: 'infraestrutura', label: 'Infraestrutura', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  { value: 'ferias', label: 'Férias', color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  { value: 'outro', label: 'Outro', color: 'bg-muted text-muted-foreground' },
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
  const FORM_INITIAL = { titulo: '', descricao: '', justificativa: '', categoria: '', urgencia: 'normal', valor_estimado: '', forma_pagamento: '', chave_pix: '', banco: '', agencia: '', conta: '', documento_file: null };
  const [form, setForm] = useState(FORM_INITIAL);

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

  const showValueField = ['compras', 'reembolso'].includes(form.categoria);
  const isReembolso = form.categoria === 'reembolso';
  const reembolsoValid = !isReembolso || (
    form.forma_pagamento &&
    (form.forma_pagamento !== 'pix' || form.chave_pix.trim()) &&
    (form.forma_pagamento !== 'transferencia_bancaria' || (form.banco.trim() && form.agencia.trim() && form.conta.trim()))
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Solicitações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">TI, compras, reembolso, infraestrutura, espaços e férias</p>
        </div>
        <div className="flex items-center gap-3">
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
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova Solicitação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Urgência</Label>
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
                  <Button onClick={handleCreate} disabled={!form.titulo || !form.categoria || !reembolsoValid || submitting}>
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
              return (
                <Card
                  key={item.id}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setDetailItem(item)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge className={`text-xs shrink-0 ${cat.color}`}>{cat.label}</Badge>
                      <p className="text-sm font-medium text-foreground truncate">{item.titulo}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
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
      <DetailDialog item={detailItem} onClose={() => setDetailItem(null)} isAdmin={isResponsavel} onStatusChange={handleStatusChange} />
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

function DetailDialog({ item, onClose, isAdmin, onStatusChange }) {
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
      <DialogContent className="sm:max-w-lg">
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
