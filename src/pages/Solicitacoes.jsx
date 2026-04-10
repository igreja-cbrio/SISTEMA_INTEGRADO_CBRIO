import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { solicitacoes as api } from '../api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Plus, Filter, ClipboardList, Clock, CheckCircle2, XCircle, Search as SearchIcon, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS = [
  { value: 'ti', label: 'TI', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'compras', label: 'Compras', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  { value: 'reembolso', label: 'Reembolso', color: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  { value: 'espaco', label: 'Reserva de Espaço', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
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

function getCatMeta(cat) {
  return CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[5];
}
function getUrgMeta(urg) {
  return URGENCIAS.find(u => u.value === urg) || URGENCIAS[1];
}

export default function Solicitacoes() {
  const { profile, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('todas');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Form state
  const [form, setForm] = useState({ titulo: '', descricao: '', justificativa: '', categoria: '', urgencia: 'normal', valor_estimado: '' });

  async function load() {
    try {
      const data = await api.list();
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

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (payload.valor_estimado) payload.valor_estimado = parseFloat(payload.valor_estimado);
      else delete payload.valor_estimado;
      await api.create(payload);
      toast.success('Solicitação criada com sucesso!');
      setDialogOpen(false);
      setForm({ titulo: '', descricao: '', justificativa: '', categoria: '', urgencia: 'normal', valor_estimado: '' });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await api.update(id, { status: newStatus });
      toast.success('Status atualizado');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  const showValueField = ['compras', 'reembolso'].includes(form.categoria);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Solicitações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">TI, compras, reembolso, espaços e férias</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Category filter */}
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

          {/* New request */}
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
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
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
                  <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} required />
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
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={!form.titulo || !form.categoria}>Criar Solicitação</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {columns.map(col => (
            <div
              key={col.key}
              className={`flex flex-col rounded-lg transition-colors ${dragOverCol === col.key ? 'bg-accent/50 ring-2 ring-primary/30' : ''}`}
              onDragOver={e => { if (!isAdmin) return; e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault();
                setDragOverCol(null);
                if (!isAdmin) return;
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
                      isAdmin={isAdmin}
                      onStatusChange={handleStatusChange}
                      onClick={() => setDetailItem(item)}
                      draggable={isAdmin}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <DetailDialog item={detailItem} onClose={() => setDetailItem(null)} isAdmin={isAdmin} onStatusChange={handleStatusChange} />
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
  if (!item) return null;
  const cat = getCatMeta(item.categoria);
  const urg = getUrgMeta(item.urgencia);

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onClose(); }}>
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

          {isAdmin && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {item.status === 'pendente' && <Button size="sm" onClick={() => { onStatusChange(item.id, 'em_analise'); onClose(); }}>Analisar</Button>}
              {item.status === 'em_analise' && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { onStatusChange(item.id, 'aprovado'); onClose(); }}>Aprovar</Button>
                  <Button size="sm" variant="destructive" onClick={() => { onStatusChange(item.id, 'rejeitado'); onClose(); }}>Rejeitar</Button>
                </>
              )}
              {item.status === 'aprovado' && <Button size="sm" onClick={() => { onStatusChange(item.id, 'concluido'); onClose(); }}>Concluir</Button>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
