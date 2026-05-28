import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import { supabase } from '../../supabaseClient';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import {
  Megaphone, Plus, Filter, Clock, Loader2, CheckCircle2, AlertCircle,
  Zap, RefreshCw, ArrowRight, Calendar, CalendarDays, Settings, BarChart3, User2, FileText, Upload, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS = [
  { key: 'fila',                   label: 'Fila',                    icon: Clock,         color: 'border-t-amber-500'    },
  { key: 'em_producao',            label: 'Em produção',             icon: Loader2,       color: 'border-t-blue-500'     },
  { key: 'aguardando_solicitante', label: 'Aguardando solicitante',  icon: AlertCircle,   color: 'border-t-violet-500'   },
  { key: 'concluido',              label: 'Concluído',               icon: CheckCircle2,  color: 'border-t-emerald-600'  },
];

const ORIGEM_LABEL = {
  solicitacao: 'Solicitação',
  evento:      'Evento',
  interna:     'Interna',
};

const ORIGEM_COR = {
  solicitacao: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  evento:      'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  interna:     'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function MarketingKanban() {
  const navigate = useNavigate();
  const { profile, isAdmin, modulePerms } = useAuth();
  const lvl = useMemo(() => {
    const m = modulePerms?.marketing || modulePerms?.Marketing;
    return Math.max(m?.leitura || 0, m?.escrita || 0);
  }, [modulePerms]);
  const isCoordenador = isAdmin || lvl >= 5;

  const [cards, setCards]           = useState([]);
  const [tipos, setTipos]           = useState([]);
  const [destinos, setDestinos]     = useState([]);
  const [membros, setMembros]       = useState([]);
  const [loading, setLoading]       = useState(true);

  // Filtros
  const [fOrigem, setFOrigem]       = useState('todas');
  const [fTipo, setFTipo]           = useState('todas');
  const [fDestino, setFDestino]     = useState('todos');
  const [fMembro, setFMembro]       = useState('todos');

  // Detalhe (Drawer)
  const [detail, setDetail]         = useState(null);

  // Dialog nova task interna
  const [novaOpen, setNovaOpen]     = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [c, e, m] = await Promise.all([
        api.cards(),
        api.etiquetas(),
        api.membros(),
      ]);
      setCards(Array.isArray(c) ? c : []);
      setTipos(e.tipos || []);
      setDestinos(e.destinos || []);
      setMembros(m || []);
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar Kanban');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime · qualquer mudança em cards recarrega
  useEffect(() => {
    if (!supabase || !profile?.id) return;
    let timeout = null;
    function sched() {
      clearTimeout(timeout);
      timeout = setTimeout(carregar, 500);
    }
    const ch = supabase
      .channel(`marketing-cards:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_kanban_cards' }, sched)
      .subscribe();
    return () => { clearTimeout(timeout); supabase.removeChannel(ch); };
  }, [profile?.id, carregar]);

  const filtrados = useMemo(() => {
    return cards.filter(c => {
      if (fOrigem  !== 'todas'  && c.origem !== fOrigem) return false;
      if (fTipo    !== 'todas'  && c.etiqueta_tipo_id !== fTipo) return false;
      if (fDestino !== 'todos'  && c.etiqueta_destino_id !== fDestino) return false;
      if (fMembro  !== 'todos'  && c.atribuido_a !== fMembro) return false;
      return true;
    });
  }, [cards, fOrigem, fTipo, fDestino, fMembro]);

  const colunas = useMemo(() => {
    return ESTADOS.map(e => ({
      ...e,
      items: filtrados.filter(c => c.estado === e.key),
    }));
  }, [filtrados]);

  async function mudarEstado(id, novoEstado) {
    try {
      await api.atualizarCard(id, { estado: novoEstado });
      toast.success(`Movido para ${ESTADOS.find(e => e.key === novoEstado)?.label || novoEstado}`);
      carregar();
    } catch (err) {
      toast.error(err.message || 'Erro ao mover card');
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kanban de demandas criativas · 3 origens (solicitação · evento · interna)
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate('/marketing/calendario')} className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> Calendário
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/marketing/analytics')} className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Analytics
          </Button>
          {isCoordenador && (
            <Button variant="outline" size="sm" onClick={() => navigate('/marketing/admin')} className="gap-1.5">
              <Settings className="h-4 w-4" /> Admin
            </Button>
          )}
          {isCoordenador && (
            <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Nova task interna
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nova task interna</DialogTitle></DialogHeader>
                <NovaTaskForm
                  tipos={tipos}
                  destinos={destinos}
                  membros={membros}
                  onSuccess={() => { setNovaOpen(false); carregar(); }}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={fOrigem} onValueChange={setFOrigem}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas origens</SelectItem>
            <SelectItem value="solicitacao">Solicitação</SelectItem>
            <SelectItem value="evento">Evento</SelectItem>
            <SelectItem value="interna">Interna</SelectItem>
          </SelectContent>
        </Select>

        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos tipos</SelectItem>
            {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={fDestino} onValueChange={setFDestino}>
          <SelectTrigger className="w-[170px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos destinos</SelectItem>
            {destinos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={fMembro} onValueChange={setFMembro}>
          <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os membros</SelectItem>
            <SelectItem value="ninguem">⋯ Não atribuído</SelectItem>
            {membros.map(m => (
              <SelectItem key={m.id} value={m.id}>
                {m.profile?.name || '(sem nome)'} · {m.habilidade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={carregar} className="ml-auto gap-1.5">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {colunas.map(col => (
            <KanbanColumn
              key={col.key}
              col={col}
              isCoordenador={isCoordenador}
              currentProfileId={profile?.id}
              onClickCard={(c) => setDetail(c)}
              onMudarEstado={mudarEstado}
            />
          ))}
        </div>
      )}

      <CardDrawer
        card={detail}
        onClose={() => setDetail(null)}
        onUpdated={() => { carregar(); }}
        tipos={tipos}
        destinos={destinos}
        membros={membros}
        isCoordenador={isCoordenador}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Coluna do Kanban
// ═══════════════════════════════════════════════════════════════════════
function KanbanColumn({ col, isCoordenador, currentProfileId, onClickCard, onMudarEstado }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`flex flex-col rounded-lg transition-colors ${dragOver ? 'bg-accent/50 ring-2 ring-primary/30' : ''}`}
      onDragOver={e => { if (!isCoordenador) return; e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (!isCoordenador) return;
        const id = e.dataTransfer.getData('text/plain');
        if (id) onMudarEstado(id, col.key);
      }}
    >
      <div className={`flex items-center gap-2 pb-3 mb-3 border-b-2 ${col.color.replace('border-t-', 'border-b-')}`}>
        <col.icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{col.label}</span>
        <Badge variant="secondary" className="ml-auto text-xs">{col.items.length}</Badge>
      </div>
      <ScrollArea className="flex-1 max-h-[calc(100vh-340px)] md:max-h-[calc(100vh-300px)]">
        <div className="space-y-3 pr-1 min-h-[60px]">
          {col.items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Sem cards</p>
          )}
          {col.items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              draggable={isCoordenador}
              onClick={() => onClickCard(item)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Card
// ═══════════════════════════════════════════════════════════════════════
function KanbanCard({ item, draggable, onClick }) {
  const atraso = useMemo(() => {
    if (!item.prazo_confirmado || item.estado === 'concluido') return null;
    const horas = (new Date(item.prazo_confirmado).getTime() - Date.now()) / 3600000;
    if (horas < 0) return { label: `${Math.abs(Math.round(horas / 24))}d atrasado`, cor: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' };
    if (horas < 48) return { label: `${Math.round(horas)}h`, cor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    return null;
  }, [item.prazo_confirmado, item.estado]);

  // Spec 016 · alerta SLA individual · card em em_producao por tempo > esforco_max × 1.5
  const slaIndividual = useMemo(() => {
    if (item.estado !== 'em_producao') return null;
    const max = item.etiqueta_tipo?.esforco_max_h;
    if (!max || max <= 0) return null;
    const horasEstado = (Date.now() - new Date(item.estado_atualizado_em).getTime()) / 3600000;
    if (horasEstado > max * 1.5) {
      return {
        label: `${Math.round(horasEstado)}h · ${(horasEstado / max).toFixed(1)}× SLA`,
        cor: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
      };
    }
    if (horasEstado > max) {
      return { label: `${Math.round(horasEstado)}h · acima do SLA`, cor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    }
    return null;
  }, [item.estado, item.estado_atualizado_em, item.etiqueta_tipo?.esforco_max_h]);

  return (
    <Card
      className={`p-3 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${
        item.raia_rapida ? 'border-l-rose-500 bg-rose-500/5'
        : item.tem_revisao ? 'border-l-amber-500'
        : 'border-l-primary'
      } ${draggable ? 'active:opacity-60' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge className={`text-[10px] px-1.5 py-0.5 ${ORIGEM_COR[item.origem]}`}>
          {ORIGEM_LABEL[item.origem]}
        </Badge>
        <div className="flex items-center gap-1">
          {item.raia_rapida && (
            <Badge className="text-[10px] px-1.5 py-0.5 bg-rose-500/15 text-rose-700 dark:text-rose-400 gap-0.5">
              <Zap className="h-3 w-3" /> Urgente
            </Badge>
          )}
          {item.tem_revisao && (
            <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400">
              ⟳ Revisão
            </Badge>
          )}
        </div>
      </div>

      <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">{item.titulo}</p>

      {(item.etiqueta_tipo || item.etiqueta_destino) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {item.etiqueta_tipo && (
            <Badge
              className="text-[10px] px-1.5 py-0.5"
              style={item.etiqueta_tipo.cor ? { backgroundColor: `${item.etiqueta_tipo.cor}25`, color: item.etiqueta_tipo.cor } : undefined}
            >
              {item.etiqueta_tipo.nome}
            </Badge>
          )}
          {item.etiqueta_destino && (
            <Badge
              className="text-[10px] px-1.5 py-0.5"
              style={item.etiqueta_destino.cor ? { backgroundColor: `${item.etiqueta_destino.cor}25`, color: item.etiqueta_destino.cor } : undefined}
            >
              {item.etiqueta_destino.nome}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground truncate max-w-[140px] flex items-center gap-1">
          <User2 className="h-3 w-3" />
          {item.atribuido?.profile?.name || 'Não atribuído'}
        </span>
        <div className="flex items-center gap-1">
          {slaIndividual && <Badge className={`text-[10px] px-1.5 py-0.5 ${slaIndividual.cor}`}>⏱ {slaIndividual.label}</Badge>}
          {!slaIndividual && atraso && <Badge className={`text-[10px] px-1.5 py-0.5 ${atraso.cor}`}>⏱ {atraso.label}</Badge>}
          {item.prazo_confirmado && !atraso && !slaIndividual && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {fmtData(item.prazo_confirmado)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Drawer de detalhe + edição
// ═══════════════════════════════════════════════════════════════════════
function CardDrawer({ card, onClose, onUpdated, tipos, destinos, membros, isCoordenador }) {
  const open = !!card;
  const [edit, setEdit] = useState({});
  const [entregaveis, setEntregaveis] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!card) return;
    setEdit({
      titulo: card.titulo,
      descricao: card.descricao || '',
      etiqueta_tipo_id: card.etiqueta_tipo_id || null,
      etiqueta_destino_id: card.etiqueta_destino_id || null,
      atribuido_a: card.atribuido_a || null,
      prazo_confirmado: card.prazo_confirmado ? card.prazo_confirmado.slice(0, 10) : '',
      raia_rapida: !!card.raia_rapida,
      estado: card.estado,
    });
    // Carrega entregaveis
    api.entregaveis.list(card.id).then(setEntregaveis).catch(() => setEntregaveis([]));
  }, [card]);

  async function salvar() {
    if (!card) return;
    try {
      const payload = { ...edit };
      if (edit.prazo_confirmado) payload.prazo_confirmado = new Date(edit.prazo_confirmado + 'T12:00:00').toISOString();
      else payload.prazo_confirmado = null;
      await api.atualizarCard(card.id, payload);
      toast.success('Card atualizado');
      onUpdated();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    }
  }

  async function deletar() {
    if (!card) return;
    if (!confirm('Excluir este card?')) return;
    try {
      await api.removerCard(card.id);
      toast.success('Card excluído');
      onUpdated();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Erro ao excluir');
    }
  }

  async function uploadArquivo(file) {
    if (!card || !file) return;
    setUploading(true);
    try {
      await api.entregaveis.upload(card.id, file);
      toast.success('Arquivo enviado');
      const lista = await api.entregaveis.list(card.id);
      setEntregaveis(lista);
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {card?.titulo || 'Card'}
          </SheetTitle>
          {card && (
            <SheetDescription className="flex flex-wrap items-center gap-1">
              <Badge className={`text-[10px] ${ORIGEM_COR[card.origem]}`}>{ORIGEM_LABEL[card.origem]}</Badge>
              {card.raia_rapida && <Badge className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400">⚡ Urgente</Badge>}
              {card.tem_revisao && <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400">⟳ Revisão</Badge>}
              <span className="text-xs text-muted-foreground">criado em {fmtData(card.created_at)}</span>
            </SheetDescription>
          )}
        </SheetHeader>

        {card && (
          <div className="mt-4 space-y-4 pb-8">
            {/* Solicitante */}
            {card.solicitacao && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Origem · Solicitação</p>
                <p className="font-medium">{card.solicitacao.titulo}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Solicitante: {card.solicitacao.solicitante?.name || '—'}
                  {card.solicitacao.eh_urgente && ' · urgência marcada'}
                </p>
              </div>
            )}

            {/* Form de edição */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={edit.titulo || ''}
                  onChange={e => setEdit(s => ({ ...s, titulo: e.target.value }))}
                  disabled={!isCoordenador}
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  rows={3}
                  value={edit.descricao || ''}
                  onChange={e => setEdit(s => ({ ...s, descricao: e.target.value }))}
                  disabled={!isCoordenador}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={edit.etiqueta_tipo_id || ''}
                    onValueChange={v => setEdit(s => ({ ...s, etiqueta_tipo_id: v || null }))}
                    disabled={!isCoordenador}
                  >
                    <SelectTrigger><SelectValue placeholder="(sem)" /></SelectTrigger>
                    <SelectContent>
                      {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destino</Label>
                  <Select
                    value={edit.etiqueta_destino_id || ''}
                    onValueChange={v => setEdit(s => ({ ...s, etiqueta_destino_id: v || null }))}
                    disabled={!isCoordenador}
                  >
                    <SelectTrigger><SelectValue placeholder="(sem)" /></SelectTrigger>
                    <SelectContent>
                      {destinos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Atribuído a</Label>
                  <Select
                    value={edit.atribuido_a || ''}
                    onValueChange={v => setEdit(s => ({ ...s, atribuido_a: v || null }))}
                    disabled={!isCoordenador}
                  >
                    <SelectTrigger><SelectValue placeholder="(ninguém)" /></SelectTrigger>
                    <SelectContent>
                      {membros.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.profile?.name || '—'} · {m.habilidade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prazo confirmado</Label>
                  <Input
                    type="date"
                    value={edit.prazo_confirmado || ''}
                    onChange={e => setEdit(s => ({ ...s, prazo_confirmado: e.target.value }))}
                    disabled={!isCoordenador}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={edit.estado || 'fila'}
                  onValueChange={v => setEdit(s => ({ ...s, estado: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {isCoordenador && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={edit.raia_rapida || false}
                    onChange={e => setEdit(s => ({ ...s, raia_rapida: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  Raia rápida (urgência)
                </label>
              )}
            </div>

            {/* Entregáveis */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <FileText className="h-4 w-4" /> Entregáveis ({entregaveis.length})
                </Label>
                {isCoordenador && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && uploadArquivo(e.target.files[0])}
                      disabled={uploading}
                    />
                    <Button asChild size="sm" variant="outline" className="gap-1.5" disabled={uploading}>
                      <span>
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Enviar
                      </span>
                    </Button>
                  </label>
                )}
              </div>
              {entregaveis.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">Sem arquivos anexados</p>
              ) : (
                <ul className="space-y-1">
                  {entregaveis.map(e => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                      <a
                        href={api.entregaveis.download(e.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate flex-1 hover:underline"
                      >
                        {e.nome_arquivo}
                      </a>
                      <span className="text-muted-foreground shrink-0">
                        {e.tamanho_bytes ? `${Math.round(e.tamanho_bytes / 1024)} KB` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-4 border-t border-border">
              <Button onClick={salvar} className="flex-1">Salvar</Button>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              {isCoordenador && (
                <Button variant="outline" size="icon" onClick={deletar} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Form nova task interna
// ═══════════════════════════════════════════════════════════════════════
function NovaTaskForm({ tipos, destinos, membros, onSuccess }) {
  const [form, setForm] = useState({
    titulo: '', descricao: '',
    etiqueta_tipo_id: '', etiqueta_destino_id: '',
    atribuido_a: '', prazo_confirmado: '',
    raia_rapida: false,
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    setSubmitting(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao || null,
        etiqueta_tipo_id: form.etiqueta_tipo_id || null,
        etiqueta_destino_id: form.etiqueta_destino_id || null,
        atribuido_a: form.atribuido_a || null,
        raia_rapida: !!form.raia_rapida,
      };
      if (form.prazo_confirmado) payload.prazo_confirmado = new Date(form.prazo_confirmado + 'T12:00:00').toISOString();
      await api.criarCard(payload);
      toast.success('Task criada');
      onSuccess();
    } catch (e) {
      toast.error(e.message || 'Erro ao criar task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Título *</Label>
        <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Tipo (opcional)</Label>
          <Select value={form.etiqueta_tipo_id} onValueChange={v => setForm(f => ({ ...f, etiqueta_tipo_id: v }))}>
            <SelectTrigger><SelectValue placeholder="(sem)" /></SelectTrigger>
            <SelectContent>
              {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Destino (opcional)</Label>
          <Select value={form.etiqueta_destino_id} onValueChange={v => setForm(f => ({ ...f, etiqueta_destino_id: v }))}>
            <SelectTrigger><SelectValue placeholder="(sem)" /></SelectTrigger>
            <SelectContent>
              {destinos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Atribuir a (opcional)</Label>
          <Select value={form.atribuido_a} onValueChange={v => setForm(f => ({ ...f, atribuido_a: v }))}>
            <SelectTrigger><SelectValue placeholder="(ninguém)" /></SelectTrigger>
            <SelectContent>
              {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.profile?.name || '—'} · {m.habilidade}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Prazo (opcional)</Label>
          <Input type="date" value={form.prazo_confirmado} onChange={e => setForm(f => ({ ...f, prazo_confirmado: e.target.value }))} />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={form.raia_rapida}
          onChange={e => setForm(f => ({ ...f, raia_rapida: e.target.checked }))}
          className="h-4 w-4"
        />
        Raia rápida (alta prioridade)
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={submit} disabled={!form.titulo.trim() || submitting}>
          {submitting ? 'Criando...' : 'Criar task'}
        </Button>
      </div>
    </div>
  );
}
