import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import MarketingNav from './MarketingNav';
import MarketingTriagemSheet from './MarketingTriagemSheet';
import MarketingEpicos from './MarketingEpicos';
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
  Zap, RefreshCw, ArrowRight, Calendar, CalendarDays, Settings, BarChart3, User2, FileText, Upload, Trash2, X, ListChecks, Paperclip,
  Inbox, Search, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

// Régua de 6 colunas (redesenho · igual ao Trello deles + Triagem/Revisão).
// `aceita` agrupa o valor canônico novo + o legado equivalente, então os cards
// antigos caem na coluna certa sem migration; o drop grava sempre o canônico.
const ESTADOS = [
  { key: 'triagem',   label: 'Triagem',   icon: Inbox,        dot: 'bg-pink-500',    aceita: ['triagem'] },
  { key: 'backlog',   label: 'Backlog',   icon: Clock,        dot: 'bg-amber-500',   aceita: ['backlog', 'fila'] },
  { key: 'pesquisa',  label: 'Pesquisa',  icon: Search,       dot: 'bg-cyan-500',    aceita: ['pesquisa'] },
  { key: 'producao',  label: 'Produção',  icon: Loader2,      dot: 'bg-blue-500',    aceita: ['producao', 'em_producao'] },
  { key: 'revisao',   label: 'Revisão',   icon: Eye,          dot: 'bg-violet-500',  aceita: ['revisao', 'aguardando_solicitante'] },
  { key: 'concluido', label: 'Concluído', icon: CheckCircle2, dot: 'bg-emerald-600', aceita: ['concluido'] },
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
  const [busca, setBusca]           = useState('');

  // Detalhe (Drawer)
  const [detail, setDetail]         = useState(null);

  // Dialog nova task interna
  const [novaOpen, setNovaOpen]     = useState(false);

  // Triagem embutida (consolidação F-B): campanhas-dor caem na 1ª coluna
  const [campanhasTriagem, setCampanhasTriagem] = useState([]);
  const [triagemSel, setTriagemSel] = useState(null);
  const [visao, setVisao] = useState('quadro'); // 'quadro' (colunas) | 'epicos' (por campanha/evento)

  const carregar = useCallback(async () => {
    try {
      const [c, e, m, camp] = await Promise.all([
        api.cards(),
        api.etiquetas(),
        api.membros(),
        api.campanhas.list('triagem').catch(() => []),
      ]);
      setCards(Array.isArray(c) ? c : []);
      setTipos(e.tipos || []);
      setDestinos(e.destinos || []);
      setMembros(m || []);
      setCampanhasTriagem(Array.isArray(camp) ? camp : []);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_campanhas' }, sched)
      .subscribe();
    return () => { clearTimeout(timeout); supabase.removeChannel(ch); };
  }, [profile?.id, carregar]);

  const filtrados = useMemo(() => {
    return cards.filter(c => {
      if (fOrigem  !== 'todas'  && c.origem !== fOrigem) return false;
      if (fTipo    !== 'todas'  && c.etiqueta_tipo_id !== fTipo) return false;
      if (fDestino !== 'todos'  && c.etiqueta_destino_id !== fDestino) return false;
      if (fMembro  !== 'todos'  && c.atribuido_a !== fMembro) return false;
      if (busca && !(c.titulo || '').toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [cards, fOrigem, fTipo, fDestino, fMembro, busca]);

  const colunas = useMemo(() => {
    return ESTADOS.map(e => ({
      ...e,
      // urgente no topo, depois a ordem da fila (absorve a antiga aba Fila)
      items: filtrados
        .filter(c => e.aceita.includes(c.estado))
        .sort((a, b) =>
          (b.raia_rapida ? 1 : 0) - (a.raia_rapida ? 1 : 0) ||
          (a.ordem_fila ?? 9999) - (b.ordem_fila ?? 9999)),
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
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setVisao('quadro')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${visao === 'quadro' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}>Quadro</button>
            <button onClick={() => setVisao('epicos')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${visao === 'epicos' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}>Épicos</button>
          </div>
          <MarketingNav />
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

      {visao === 'epicos' && <MarketingEpicos isCoord={isCoordenador} />}

      {visao === 'quadro' && (<>
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

        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar título…" className="h-9 w-[160px] text-sm ml-auto" />
        <Button variant="outline" size="sm" onClick={carregar} className="gap-1.5">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {colunas.map(col => (
            col.key === 'triagem' ? (
              <TriagemColumn
                key="triagem"
                col={col}
                campanhas={campanhasTriagem}
                isCoordenador={isCoordenador}
                onClickCampanha={(c) => setTriagemSel(c)}
              />
            ) : (
              <KanbanColumn
                key={col.key}
                col={col}
                isCoordenador={isCoordenador}
                currentProfileId={profile?.id}
                onClickCard={(c) => setDetail(c)}
                onMudarEstado={mudarEstado}
              />
            )
          ))}
        </div>
      )}
      </>)}

      <CardDrawer
        card={detail}
        onClose={() => setDetail(null)}
        onUpdated={() => { carregar(); }}
        tipos={tipos}
        destinos={destinos}
        membros={membros}
        isCoordenador={isCoordenador}
      />

      <MarketingTriagemSheet
        campanha={triagemSel}
        tipos={tipos}
        membros={membros}
        onClose={() => setTriagemSel(null)}
        onChanged={() => { carregar(); }}
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
      className={`flex flex-col rounded-xl shrink-0 w-[280px] bg-muted/50 dark:bg-muted/20 transition-shadow ${dragOver ? 'ring-2 ring-primary/40' : ''}`}
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
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
        <span className="text-sm font-semibold text-foreground">{col.label}</span>
        <Badge variant="secondary" className="ml-auto text-xs rounded-full px-2">{col.items.length}</Badge>
      </div>
      <ScrollArea className="flex-1 max-h-[calc(100vh-330px)] md:max-h-[calc(100vh-290px)]">
        <div className="px-2 pb-2 space-y-2 min-h-[40px]">
          {col.items.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-6">—</p>
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
// Coluna Triagem · campanhas-dor aguardando o Pedro definir a solução
// ═══════════════════════════════════════════════════════════════════════
function TriagemColumn({ col, campanhas, isCoordenador, onClickCampanha }) {
  return (
    <div className="flex flex-col rounded-xl shrink-0 w-[280px] bg-muted/50 dark:bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
        <span className="text-sm font-semibold text-foreground">{col.label}</span>
        <Badge variant="secondary" className="ml-auto text-xs rounded-full px-2">{campanhas.length}</Badge>
      </div>
      <ScrollArea className="flex-1 max-h-[calc(100vh-330px)] md:max-h-[calc(100vh-290px)]">
        <div className="px-2 pb-2 space-y-2 min-h-[40px]">
          {campanhas.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-6">
              {isCoordenador ? 'Nada pra triar' : '—'}
            </p>
          )}
          {campanhas.map(c => (
            <CampanhaCard key={c.id} campanha={c} clicavel={isCoordenador} onClick={() => isCoordenador && onClickCampanha(c)} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CampanhaCard({ campanha: c, onClick, clicavel }) {
  return (
    <div
      className={`bg-card rounded-lg border border-border/60 shadow-sm overflow-hidden transition-all ${clicavel ? 'cursor-pointer hover:shadow-md hover:border-border' : ''}`}
      onClick={onClick}
    >
      <div className={`h-1.5 ${c.eh_urgente ? 'bg-rose-500' : 'bg-pink-500'}`} />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-400">Campanha</span>
          {c.eh_urgente && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-400 flex items-center gap-0.5">
              <Zap className="h-3 w-3" /> Urgente
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{c.titulo}</p>
        {c.dor_descricao && <p className="text-[11px] text-muted-foreground line-clamp-2">{c.dor_descricao}</p>}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5 truncate">
            <span className="h-5 w-5 shrink-0 rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 text-[9px] font-semibold flex items-center justify-center">
              {(c.solicitante_nome || '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{c.solicitante_nome || '—'}</span>
          </span>
          {c.data_pedida && <span className="flex items-center gap-0.5 shrink-0"><Calendar className="h-3 w-3" />{fmtData(c.data_pedida)}</span>}
        </div>
        {clicavel && (
          <div className="text-[11px] text-primary flex items-center gap-1 font-medium pt-0.5">
            Triar <ArrowRight className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
}

// Etiqueta colorida no topo do card (estilo Trello label)
function Etiqueta({ cor, nome }) {
  const c = cor || '#64748b';
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded leading-tight max-w-[130px] truncate"
      style={{ backgroundColor: `${c}22`, color: c }}
      title={nome}
    >
      {nome}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Card · estilo Trello (etiquetas em barras coloridas no topo + avatar)
// ═══════════════════════════════════════════════════════════════════════
function KanbanCard({ item, draggable, onClick }) {
  // prazo de produção do entregável (data_fim/prazo_producao) ou o prazo legado
  const prazoCard = item.prazo_producao || item.prazo_confirmado;
  const atraso = useMemo(() => {
    if (!prazoCard || item.estado === 'concluido') return null;
    const horas = (new Date(prazoCard).getTime() - Date.now()) / 3600000;
    if (horas < 0) return { label: `${Math.abs(Math.round(horas / 24))}d atrasado`, cor: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' };
    if (horas < 48) return { label: `${Math.round(horas)}h`, cor: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    return null;
  }, [prazoCard, item.estado]);

  // Spec 016 · alerta SLA individual · card em em_producao por tempo > esforco_max × 1.5
  const slaIndividual = useMemo(() => {
    if (!['em_producao', 'producao'].includes(item.estado)) return null;
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
    <div
      className={`bg-card rounded-lg border border-border/60 shadow-sm hover:shadow-md hover:border-border transition-all overflow-hidden cursor-pointer ${draggable ? 'active:opacity-70' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
    >
      {/* faixa de prioridade no topo (urgente / revisão) — estilo Trello */}
      {item.raia_rapida ? <div className="h-1.5 bg-rose-500" /> : item.tem_revisao ? <div className="h-1.5 bg-amber-500" /> : null}

      <div className="p-2.5 space-y-1.5">
        {/* Etiquetas em barras coloridas */}
        {(item.etiqueta_tipo || item.etiqueta_destino || item.cycle_phase_task?.fase) && (
          <div className="flex flex-wrap gap-1">
            {item.etiqueta_tipo && <Etiqueta cor={item.etiqueta_tipo.cor} nome={item.etiqueta_tipo.nome} />}
            {item.etiqueta_destino && <Etiqueta cor={item.etiqueta_destino.cor} nome={item.etiqueta_destino.nome} />}
            {item.cycle_phase_task?.fase && <Etiqueta cor="#a855f7" nome={item.cycle_phase_task.fase} />}
          </div>
        )}

        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{item.titulo}</p>

        {item.cycle_phase_task?.event_name && (
          <p className="text-[10px] text-muted-foreground truncate">{item.cycle_phase_task.event_name}</p>
        )}

        {/* Badges de meta */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          {item.raia_rapida && <span className="flex items-center gap-0.5 font-medium text-rose-600 dark:text-rose-400"><Zap className="h-3 w-3" />Urgente</span>}
          {item.tem_revisao && <span className="flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400">⟳ Revisão</span>}
          {slaIndividual && <span className={`px-1.5 py-0.5 rounded ${slaIndividual.cor}`}>⏱ {slaIndividual.label}</span>}
          {!slaIndividual && atraso && <span className={`px-1.5 py-0.5 rounded ${atraso.cor}`}>⏱ {atraso.label}</span>}
          {prazoCard && !atraso && !slaIndividual && (
            <span className="flex items-center gap-0.5 text-muted-foreground"><Calendar className="h-3 w-3" />{fmtData(prazoCard)}</span>
          )}
          {item.checklist?.total > 0 && (
            <span className={`flex items-center gap-0.5 ${item.checklist.feitos === item.checklist.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
              <ListChecks className="h-3 w-3" />{item.checklist.feitos}/{item.checklist.total}
            </span>
          )}
          {item.campanha?.prazo_entrega && (
            <span className="flex items-center gap-0.5 text-muted-foreground" title="Entrega ao solicitante">🚩 {fmtData(item.campanha.prazo_entrega)}</span>
          )}
        </div>

        {/* Footer: origem + avatar */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${ORIGEM_COR[item.origem]}`}>{ORIGEM_LABEL[item.origem]}</span>
          {item.atribuido?.profile?.name ? (
            <span className="h-6 w-6 shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center" title={item.atribuido.profile.name}>
              {item.atribuido.profile.name.trim().charAt(0).toUpperCase()}
            </span>
          ) : (
            <span className="h-6 w-6 shrink-0 rounded-full bg-muted text-muted-foreground flex items-center justify-center" title="Não atribuído"><User2 className="h-3 w-3" /></span>
          )}
        </div>
      </div>
    </div>
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
  const [uploadingRef, setUploadingRef] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [novoItem, setNovoItem] = useState({ texto: '', grupo: '' });

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
    // Carrega entregaveis + checklist
    api.entregaveis.list(card.id).then(setEntregaveis).catch(() => setEntregaveis([]));
    api.checklist.list(card.id).then(setChecklist).catch(() => setChecklist([]));
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

  async function uploadArquivo(file, tipo) {
    if (!card || !file) return;
    const setBusy = tipo === 'referencia' ? setUploadingRef : setUploading;
    setBusy(true);
    try {
      await api.entregaveis.upload(card.id, file, tipo);
      toast.success(tipo === 'referencia' ? 'Referência enviada' : 'Arquivo enviado');
      const lista = await api.entregaveis.list(card.id);
      setEntregaveis(lista);
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar arquivo');
    } finally {
      setBusy(false);
    }
  }

  async function addChecklistItem() {
    const texto = novoItem.texto.trim();
    if (!card || !texto) return;
    try {
      await api.checklist.create(card.id, { texto, grupo: novoItem.grupo.trim() || null });
      setNovoItem(s => ({ texto: '', grupo: s.grupo }));
      setChecklist(await api.checklist.list(card.id));
    } catch (e) { toast.error(e.message || 'Erro ao adicionar'); }
  }

  async function toggleChecklistItem(item) {
    try {
      await api.checklist.update(item.id, { feito: !item.feito });
      setChecklist(cl => cl.map(i => (i.id === item.id ? { ...i, feito: !i.feito } : i)));
    } catch (e) { toast.error(e.message || 'Erro ao atualizar'); }
  }

  async function removeChecklistItem(id) {
    try {
      await api.checklist.remove(id);
      setChecklist(cl => cl.filter(i => i.id !== id));
    } catch (e) { toast.error(e.message || 'Erro ao remover'); }
  }

  const entregaveisFinais = entregaveis.filter(e => e.tipo !== 'referencia');
  const referencias = entregaveis.filter(e => e.tipo === 'referencia');
  const checklistFeitos = checklist.filter(i => i.feito).length;
  const checklistPct = checklist.length ? Math.round((checklistFeitos / checklist.length) * 100) : 0;
  const gruposChecklist = Object.entries(
    checklist.reduce((acc, i) => { const g = i.grupo || ''; (acc[g] = acc[g] || []).push(i); return acc; }, {})
  );

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

            {/* Ciclo criativo · evento + fase + link Abrir no Eventos */}
            {card.cycle_phase_task && (
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Origem · Ciclo criativo</p>
                <p className="font-medium">{card.cycle_phase_task.event_name || '(evento)'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Fase: {card.cycle_phase_task.fase || '—'}
                  {card.cycle_phase_task.is_critical && ' · ⚠️ crítica'}
                </p>
                {card.cycle_phase_task.link && (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="mt-2 gap-1.5 text-xs"
                  >
                    <a href={card.cycle_phase_task.link} target="_blank" rel="noreferrer">
                      <ArrowRight className="h-3 w-3" />
                      Abrir no Eventos
                    </a>
                  </Button>
                )}
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
                  <Label>Etiqueta interna</Label>
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

            {/* Checklist (sub-itens · estilo Trello) */}
            <div className="border-t border-border pt-4">
              <Label className="text-sm flex items-center gap-1.5 mb-2">
                <ListChecks className="h-4 w-4" /> Checklist
                {checklist.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">· {checklistFeitos}/{checklist.length}</span>
                )}
              </Label>
              {checklist.length > 0 && (
                <div className="h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${checklistPct}%` }} />
                </div>
              )}
              {checklist.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem itens · use frentes (ex: ID e Estratégia, Enxoval) pra agrupar.</p>
              ) : (
                <div className="space-y-3">
                  {gruposChecklist.map(([grupo, itens]) => (
                    <div key={grupo || '_sem'} className="space-y-1">
                      {grupo && <p className="text-xs font-semibold text-muted-foreground">{grupo}</p>}
                      {itens.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-sm group/item">
                          <input
                            type="checkbox"
                            checked={item.feito}
                            disabled={!isCoordenador}
                            onChange={() => toggleChecklistItem(item)}
                            className="h-4 w-4 shrink-0"
                          />
                          <span className={`flex-1 ${item.feito ? 'line-through text-muted-foreground' : ''}`}>{item.texto}</span>
                          {isCoordenador && (
                            <button
                              type="button"
                              onClick={() => removeChecklistItem(item.id)}
                              className="opacity-0 group-hover/item:opacity-100 text-red-600 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {isCoordenador && (
                <div className="flex gap-1.5 mt-2">
                  <Input
                    value={novoItem.grupo}
                    onChange={e => setNovoItem(s => ({ ...s, grupo: e.target.value }))}
                    placeholder="Frente"
                    className="h-8 text-xs w-28"
                  />
                  <Input
                    value={novoItem.texto}
                    onChange={e => setNovoItem(s => ({ ...s, texto: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                    placeholder="Novo item..."
                    className="h-8 text-xs flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={addChecklistItem} disabled={!novoItem.texto.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Referências (input · briefing/inspiração) */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4" /> Referências ({referencias.length})
                </Label>
                {isCoordenador && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && uploadArquivo(e.target.files[0], 'referencia')}
                      disabled={uploadingRef}
                    />
                    <Button asChild size="sm" variant="outline" className="gap-1.5" disabled={uploadingRef}>
                      <span>
                        {uploadingRef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Anexar
                      </span>
                    </Button>
                  </label>
                )}
              </div>
              {referencias.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">Briefing, inspiração, material de apoio.</p>
              ) : (
                <ul className="space-y-1">
                  {referencias.map(e => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                      <a href={api.entregaveis.download(e.id)} target="_blank" rel="noreferrer" className="truncate flex-1 hover:underline">
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

            {/* Entregáveis (output · arquivo final) */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <FileText className="h-4 w-4" /> Entregáveis ({entregaveisFinais.length})
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
              {entregaveisFinais.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">Sem arquivos anexados</p>
              ) : (
                <ul className="space-y-1">
                  {entregaveisFinais.map(e => (
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
          <Label>Etiqueta interna (opcional)</Label>
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
