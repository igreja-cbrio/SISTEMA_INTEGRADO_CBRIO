// Inbox de WhatsApp (estilo Multi360) · módulo Conversas.
// Tempo real (Supabase Realtime) + plim sonoro, filtros num ícone, foto do
// cadastro nos avatares, atribuição a qualquer colaborador, painel-resumo da
// pessoa (grupo/batismo/serve/NEXT) e anotações. Escopo por área.
import { useState, useEffect, useRef, useCallback } from 'react';
import { waInbox } from '@/api';
import { supabase } from '@/supabaseClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Loader2, Send, Search, Check, MessageCircle, RefreshCw, ExternalLink, Clock,
  User, CheckCheck, UserPlus, ChevronDown, UserCheck, Tag, Plus, Inbox, Filter,
  Users, Droplets, HandHelping, Sparkles, StickyNote, Paperclip,
} from 'lucide-react';
import { toast } from 'sonner';

type Colaborador = { id: string; name: string; avatar_url: string | null };
type Area = { nome: string; setor: string | null };
type Template = { key: string; rotulo: string; nome: string; params: { label: string }[] };
type Conversa = {
  id: string; telefone: string; nome: string | null; membro_id: string | null; foto_url: string | null;
  area: string | null; nao_lidas: number; resolvida: boolean; ultima_previa: string | null;
  atribuido_a: string | null; notas: string | null; last_message_at: string | null;
  dentro_janela: boolean; janela_expira_em: string | null;
};
type Msg = { id: string; direcao: 'in' | 'out'; tipo: string; texto: string | null; media_url: string | null; criado_em: string };
type Perfil = {
  membro: { id: string; nome: string; foto_url: string | null; data_nascimento: string | null; status: string | null } | null;
  grupo?: string | null; grupo_funcao?: string | null; batizado?: boolean;
  serve?: boolean; ministerios?: string[]; fez_next?: boolean;
};

function horaCurta(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const mesmoDia = d.toDateString() === new Date().toDateString();
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function telBonito(t: string) {
  const d = (t || '').replace(/\D+/g, '');
  const n = d.startsWith('55') ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t;
}
function iniciais(nome: string | null, tel: string) {
  const base = (nome || '').trim();
  if (base) return base.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const d = tel.replace(/\D+/g, '');
  return d.slice(-2) || '?';
}
function janelaRestante(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`;
}
function idade(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso); const hoje = new Date();
  let a = hoje.getFullYear() - d.getFullYear();
  const mm = hoje.getMonth() - d.getMonth();
  if (mm < 0 || (mm === 0 && hoje.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

export default function ConversasInbox({
  currentUserId, userAreas = [], isAdmin = false,
}: { atendentes?: any[]; currentUserId?: string; userAreas?: string[]; isAdmin?: boolean }) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [status, setStatus] = useState<'abertas' | 'todas'>('abertas');
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [areaFiltro, setAreaFiltro] = useState<string>('todas');
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [areasDisp, setAreasDisp] = useState<Area[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [buscaResp, setBuscaResp] = useState('');
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [notasDraft, setNotasDraft] = useState('');
  const [novaOpen, setNovaOpen] = useState(false);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef<string | null>(null);
  const unreadRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  selRef.current = selId;

  const areasChips = isAdmin ? areasDisp.map(a => a.nome) : userAreas;
  const statusApi = status === 'abertas' ? 'abertas' : 'todas';
  const respName = (id: string | null) => (id ? colaboradores.find(a => a.id === id)?.name || null : null);
  const respFoto = (id: string | null) => (id ? colaboradores.find(a => a.id === id)?.avatar_url || null : null);

  function plim() {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return;
      if (!audioRef.current) audioRef.current = new AC();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1180, ctx.currentTime + 0.09);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.3);
    } catch { /* silencioso */ }
  }

  const carregarConversas = useCallback(async (comSom = false) => {
    try {
      const r = await waInbox.conversas({ status: statusApi, q: busca || undefined, area: areaFiltro });
      const lista = r?.conversas || [];
      const total = lista.reduce((a: number, c: Conversa) => a + (c.nao_lidas || 0), 0);
      if (comSom && unreadRef.current != null && total > unreadRef.current) plim();
      unreadRef.current = total;
      setConversas(lista);
    } catch { setConversas([]); }
  }, [statusApi, busca, areaFiltro]);

  const carregarThread = useCallback(async (id: string) => {
    try {
      const r = await waInbox.mensagens(id);
      setConv(r?.conversa || null);
      setMsgs(r?.mensagens || []);
    } catch { /* ignora */ }
  }, []);

  // catálogos
  useEffect(() => {
    waInbox.areas().then(r => setAreasDisp(r?.areas || [])).catch(() => {});
    waInbox.templates().then(r => setTemplates(r?.templates || [])).catch(() => {});
    waInbox.colaboradores().then(r => setColaboradores(r?.colaboradores || [])).catch(() => {});
  }, []);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);
  useEffect(() => { if (selId) carregarThread(selId); }, [selId, carregarThread]);

  // perfil da pessoa + anotações ao abrir conversa
  useEffect(() => {
    if (!selId) { setPerfil(null); return; }
    waInbox.perfil(selId).then(setPerfil).catch(() => setPerfil(null));
  }, [selId]);
  useEffect(() => { setNotasDraft(conv?.notas || ''); }, [conv?.id]); // eslint-disable-line

  // ── Tempo real ──────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    let t: any = null;
    const sched = (fn: () => void) => { clearTimeout(t); t = setTimeout(fn, 350); };
    const ch = supabase
      .channel(`wa-inbox:${currentUserId || 'anon'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_mensagens' }, (payload: any) => {
        const m = payload?.new;
        if (m?.conversa_id && selRef.current && m.conversa_id === selRef.current) sched(() => carregarThread(selRef.current!));
        sched(() => carregarConversas(true)); // toca plim se aumentar não-lidas do MEU escopo
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wa_conversas' }, () => sched(() => carregarConversas(false)))
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [currentUserId, carregarConversas, carregarThread]);

  // rede de segurança (reconexão): polling lento
  useEffect(() => {
    const t1 = setInterval(() => carregarConversas(false), 20_000);
    const t2 = setInterval(() => { if (selRef.current) carregarThread(selRef.current); }, 15_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [carregarConversas, carregarThread]);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function responder() {
    const tx = texto.trim();
    if (!tx || !selId || enviando) return;
    setEnviando(true);
    try {
      await waInbox.responder(selId, { texto: tx });
      setTexto('');
      await carregarThread(selId);
      carregarConversas();
    } catch (e: any) { toast.error(e?.message || 'Erro ao enviar'); }
    finally { setEnviando(false); }
  }
  async function enviarAnexo(file: File) {
    if (!selId || anexando) return;
    if (file.size > 16 * 1024 * 1024) { toast.error('Arquivo muito grande (máx. 16MB).'); return; }
    setAnexando(true);
    try { await waInbox.anexar(selId, file); await carregarThread(selId); carregarConversas(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao enviar anexo'); }
    finally { setAnexando(false); }
  }
  async function resolver(resolvida: boolean) {
    if (!selId) return;
    try { await waInbox.atualizar(selId, { resolvida }); toast.success(resolvida ? 'Conversa resolvida' : 'Conversa reaberta'); carregarConversas(); carregarThread(selId); }
    catch { toast.error('Erro'); }
  }
  async function atribuir(userId: string | null) {
    if (!selId) return;
    setConv(c => (c ? { ...c, atribuido_a: userId } : c));
    try { await waInbox.atualizar(selId, { atribuido_a: userId }); toast.success(userId ? `Atribuída a ${respName(userId) || 'responsável'}` : 'Atribuição removida'); carregarConversas(); carregarThread(selId); }
    catch { toast.error('Erro ao atribuir'); carregarThread(selId); }
  }
  async function triar(area: string | null) {
    if (!selId) return;
    setConv(c => (c ? { ...c, area } : c));
    try { await waInbox.atualizar(selId, { area }); toast.success(area ? `Movida para ${area}` : 'Voltou para a Entrada'); carregarConversas(); carregarThread(selId); }
    catch { toast.error('Erro ao triar'); carregarThread(selId); }
  }
  async function salvarNotas() {
    if (!selId || notasDraft === (conv?.notas || '')) return;
    try { await waInbox.atualizar(selId, { notas: notasDraft }); setConv(c => (c ? { ...c, notas: notasDraft } : c)); toast.success('Anotação salva'); }
    catch { toast.error('Erro ao salvar anotação'); }
  }

  const foraJanela = conv && !conv.dentro_janela;
  const lista = (conversas || []).filter(c => !soNaoLidas || c.nao_lidas > 0);
  const totalNaoLidas = (conversas || []).reduce((a, c) => a + (c.nao_lidas || 0), 0);
  const filtroLabel = areaFiltro === 'todas' ? 'Todas' : areaFiltro === 'entrada' ? 'Entrada' : areaFiltro === 'minhas' ? 'Minhas' : areaFiltro;
  const filtroAtivo = areaFiltro !== 'todas' || status !== 'abertas' || soNaoLidas;
  const respFiltrados = colaboradores.filter(c => c.name.toLowerCase().includes(buscaResp.toLowerCase()));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[640px] w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        {/* ── Lista ─────────────────────────────────────────── */}
        <div className="flex w-[330px] shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><MessageCircle className="h-4.5 w-4.5" /></div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-none">Conversas</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{totalNaoLidas > 0 ? `${totalNaoLidas} não lidas` : 'WhatsApp da igreja'}</p>
              </div>
            </div>
            <Button size="sm" className="h-8 gap-1 shrink-0" onClick={() => setNovaOpen(true)}><Plus className="h-3.5 w-3.5" />Nova</Button>
          </div>

          <div className="flex items-center gap-2 px-3 pt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar" className="h-9 pl-8 text-sm" />
            </div>
            {/* filtros dentro de um ícone (clean) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className={`h-9 w-9 shrink-0 relative ${filtroAtivo ? 'border-primary text-primary' : ''}`}>
                  <Filter className="h-4 w-4" />
                  {filtroAtivo && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Ver</DropdownMenuLabel>
                {[{ k: 'todas', l: 'Todas' }, { k: 'entrada', l: 'Entrada (não triada)' }, ...(currentUserId ? [{ k: 'minhas', l: 'Minhas' }] : [])].map(({ k, l }) => (
                  <DropdownMenuItem key={k} onClick={() => setAreaFiltro(k)} className="gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${areaFiltro === k ? 'bg-primary' : 'bg-transparent'}`} />{l}{areaFiltro === k && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
                {areasChips.length > 0 && <DropdownMenuSeparator />}
                {areasChips.length > 0 && <DropdownMenuLabel className="text-[10px]">Por área</DropdownMenuLabel>}
                <div className="max-h-48 overflow-y-auto">
                  {areasChips.map(a => (
                    <DropdownMenuItem key={a} onClick={() => setAreaFiltro(a)} className="gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${areaFiltro === a ? 'bg-primary' : 'bg-transparent'}`} />{a}{areaFiltro === a && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={status === 'todas'} onCheckedChange={v => setStatus(v ? 'todas' : 'abertas')}>Incluir resolvidas</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={soNaoLidas} onCheckedChange={v => setSoNaoLidas(!!v)}>Só não lidas</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => carregarConversas()} title="Atualizar"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="px-3 pt-1.5 text-[11px] text-muted-foreground">Vendo: <span className="font-medium text-foreground">{filtroLabel}</span>{status === 'todas' ? ' · c/ resolvidas' : ''}{soNaoLidas ? ' · não lidas' : ''}</div>

          <ScrollArea className="flex-1 mt-1">
            <div className="flex flex-col gap-0.5 p-2 pt-1.5">
              {conversas === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : lista.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 px-4 text-center text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Nenhuma conversa aqui.<br />Aparecem quando alguém escreve — ou use "Nova".</p>
                </div>
              ) : lista.map(c => {
                const active = c.id === selId;
                return (
                  <button key={c.id} onClick={() => setSelId(c.id)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                    <Avatar className="h-11 w-11 shrink-0">
                      {c.foto_url && <AvatarImage src={c.foto_url} alt={c.nome || ''} />}
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{iniciais(c.nome, c.telefone)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.nome || telBonito(c.telefone)}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{horaCurta(c.last_message_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.ultima_previa || telBonito(c.telefone)}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {c.area
                          ? <Badge variant="outline" className="h-4.5 border-violet-500/25 bg-violet-500/10 px-1.5 py-0 text-[10px] font-normal text-violet-600 dark:text-violet-400">{c.area}</Badge>
                          : <Badge variant="outline" className="h-4.5 border-amber-500/25 bg-amber-500/10 px-1.5 py-0 text-[10px] font-normal text-amber-600 dark:text-amber-400">Entrada</Badge>}
                        {c.resolvida && <Badge variant="outline" className="h-4.5 border-blue-500/25 bg-blue-500/10 px-1.5 py-0 text-[10px] font-normal text-blue-600 dark:text-blue-400">Resolvida</Badge>}
                        {c.atribuido_a && respName(c.atribuido_a) && (
                          <Tooltip><TooltipTrigger asChild><span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><UserCheck className="h-3 w-3" />{respName(c.atribuido_a)!.split(' ')[0]}</span></TooltipTrigger><TooltipContent>Responsável: {respName(c.atribuido_a)}</TooltipContent></Tooltip>
                        )}
                        {c.nao_lidas > 0 && <span className="ml-auto flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{c.nao_lidas}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* ── Thread ────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0">
          {!conv ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-20" /><p className="text-sm">Selecione uma conversa</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10">{conv.foto_url && <AvatarImage src={conv.foto_url} alt={conv.nome || ''} />}<AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{iniciais(conv.nome, conv.telefone)}</AvatarFallback></Avatar>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{conv.nome || telBonito(conv.telefone)}</p><p className="text-[11px] text-muted-foreground">{telBonito(conv.telefone)}</p></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* triagem por área */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5"><Tag className="h-3.5 w-3.5 text-violet-500" />{conv.area || 'Entrada'}<ChevronDown className="h-3 w-3 opacity-60" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Triar para a área</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <div className="max-h-64 overflow-y-auto">
                        {areasDisp.map(a => (
                          <DropdownMenuItem key={a.nome} onClick={() => triar(a.nome)} className="gap-2">
                            <span className={`h-2 w-2 rounded-full ${conv.area === a.nome ? 'bg-violet-500' : 'bg-muted-foreground/30'}`} /><span className="flex-1 truncate">{a.nome}</span>{conv.area === a.nome && <Check className="h-3.5 w-3.5 text-violet-500" />}
                          </DropdownMenuItem>
                        ))}
                      </div>
                      {conv.area && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => triar(null)} className="gap-2 text-muted-foreground"><Inbox className="h-4 w-4" />Voltar para a Entrada</DropdownMenuItem></>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* atribuição · todos os colaboradores */}
                  <DropdownMenu onOpenChange={o => { if (!o) setBuscaResp(''); }}>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        {conv.atribuido_a && respName(conv.atribuido_a) ? <><UserCheck className="h-3.5 w-3.5 text-primary" />{respName(conv.atribuido_a)!.split(' ')[0]}</> : <><UserPlus className="h-3.5 w-3.5" />Atribuir</>}<ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>Responsável pela conversa</DropdownMenuLabel>
                      <div className="px-1.5 pb-1.5"><Input autoFocus value={buscaResp} onChange={e => setBuscaResp(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Buscar colaborador" className="h-8 text-xs" /></div>
                      {currentUserId && conv.atribuido_a !== currentUserId && (
                        <DropdownMenuItem onClick={() => atribuir(currentUserId)} className="gap-2"><UserCheck className="h-4 w-4 text-primary" />Atribuir a mim</DropdownMenuItem>
                      )}
                      <div className="max-h-56 overflow-y-auto">
                        {respFiltrados.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum colaborador</div>}
                        {respFiltrados.map(a => (
                          <DropdownMenuItem key={a.id} onClick={() => atribuir(a.id)} className="gap-2">
                            <Avatar className="h-5 w-5">{a.avatar_url && <AvatarImage src={a.avatar_url} />}<AvatarFallback className="text-[8px]">{iniciais(a.name, '')}</AvatarFallback></Avatar>
                            <span className="flex-1 truncate">{a.name}</span>{conv.atribuido_a === a.id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </div>
                      {conv.atribuido_a && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => atribuir(null)} className="gap-2 text-muted-foreground">Remover atribuição</DropdownMenuItem></>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {conv.resolvida
                    ? <Button size="sm" variant="outline" onClick={() => resolver(false)}>Reabrir</Button>
                    : <Button size="sm" variant="outline" onClick={() => resolver(true)}><Check className="mr-1 h-3.5 w-3.5" />Resolver</Button>}
                </div>
              </div>

              <ScrollArea className="flex-1 bg-muted/20">
                <div className="flex flex-col gap-2 p-5">
                  <div className="mx-auto rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">Conversa</div>
                  {msgs.map(m => (
                    <div key={m.id} className={`flex ${m.direcao === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm whitespace-pre-wrap break-words ${m.direcao === 'out' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm border border-border bg-background'}`}>
                        {m.tipo === 'template' && <p className="mb-0.5 text-[10px] font-medium opacity-70">template</p>}
                        {m.tipo === 'institucional' && <p className="mb-0.5 text-[10px] font-medium opacity-70">resposta automática</p>}
                        {m.tipo === 'image' && m.media_url && <img src={m.media_url} alt="imagem" className="mb-1 max-h-60 rounded-lg" />}
                        {m.tipo === 'document' && m.media_url && <a href={m.media_url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 underline"><ExternalLink className="h-3.5 w-3.5" />documento</a>}
                        {m.texto && <p className="leading-relaxed">{m.texto}</p>}
                        {!m.texto && !m.media_url && <p className="italic opacity-60">[{m.tipo}]</p>}
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${m.direcao === 'out' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{horaCurta(m.criado_em)}{m.direcao === 'out' && <CheckCheck className="h-3 w-3" />}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={fimRef} />
                </div>
              </ScrollArea>

              {foraJanela ? (
                <div className="border-t border-border bg-amber-50 px-4 py-3 text-[12px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  ⚠️ Fora da janela de 24h do WhatsApp — só é possível enviar um <b>template aprovado</b> agora. Assim que a pessoa responder, o campo de texto libera.
                </div>
              ) : (
                <div className="border-t border-border p-3">
                  <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2">
                    <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) enviarAnexo(f); e.target.value = ''; }} />
                    <Button size="icon" variant="ghost" disabled={anexando} onClick={() => fileRef.current?.click()} className="h-9 w-9 shrink-0 text-muted-foreground" title="Anexar foto ou documento">
                      {anexando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                    <textarea value={texto} onChange={e => setTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                      rows={1} placeholder="Escreva uma mensagem…  (Enter envia · Shift+Enter quebra linha)"
                      className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground" />
                    <Button size="icon" disabled={enviando || !texto.trim()} onClick={responder} className="h-9 w-9 shrink-0">{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                  </div>
                  {conv.janela_expira_em && janelaRestante(conv.janela_expira_em) && (
                    <div className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />Janela de resposta livre expira em <span className="font-medium text-foreground">{janelaRestante(conv.janela_expira_em)}</span></div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Detalhes ──────────────────────────────────────── */}
        {conv && (
          <div className="hidden w-[268px] shrink-0 flex-col border-l border-border xl:flex">
            <ScrollArea className="flex-1">
              <div className="flex flex-col items-center gap-2 border-b border-border p-5">
                <Avatar className="h-16 w-16">{conv.foto_url && <AvatarImage src={conv.foto_url} alt={conv.nome || ''} />}<AvatarFallback className="bg-primary/15 text-primary text-lg font-semibold">{iniciais(conv.nome, conv.telefone)}</AvatarFallback></Avatar>
                <p className="text-sm font-semibold text-center">{conv.nome || telBonito(conv.telefone)}</p>
                <p className="text-xs text-muted-foreground">{telBonito(conv.telefone)}{perfil?.membro?.data_nascimento && idade(perfil.membro.data_nascimento) != null ? ` · ${idade(perfil.membro.data_nascimento)} anos` : ''}</p>
                <a href={`https://wa.me/${conv.telefone.replace(/\D+/g, '')}`} target="_blank" rel="noreferrer" className="mt-1"><Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><ExternalLink className="h-3 w-3" />Abrir no WhatsApp</Button></a>
              </div>
              <div className="flex flex-col gap-3.5 p-4">
                {/* resumo da pessoa */}
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Perfil</p>
                  {perfil?.membro ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-muted-foreground">Grupo:</span> <span className="truncate">{perfil.grupo || <span className="text-muted-foreground">nenhum</span>}</span></div>
                      <div className="flex items-center gap-2"><Droplets className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-muted-foreground">Batizado:</span> {perfil.batizado ? <Badge variant="outline" className="h-5 border-blue-500/25 bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400">Sim</Badge> : <span>Não</span>}</div>
                      <div className="flex items-start gap-2"><HandHelping className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /><span className="text-muted-foreground">Serve:</span> <span className="flex-1">{perfil.serve ? (perfil.ministerios?.join(', ') || 'Sim') : 'Não'}</span></div>
                      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-muted-foreground">Fez o NEXT:</span> {perfil.fez_next ? <Badge variant="outline" className="h-5 border-primary/25 bg-primary/10 text-[10px] text-primary">Sim</Badge> : <span>Não</span>}</div>
                      <a href={`/ministerial/membresia?membro=${perfil.membro.id}`} className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"><User className="h-3.5 w-3.5" />Ver ficha completa</a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground"><User className="h-4 w-4" />Sem cadastro vinculado</div>
                  )}
                </div>
                <Separator />
                {/* área + status */}
                <div className="flex items-center justify-between">
                  <div><p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Área</p>{conv.area ? <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400">{conv.area}</Badge> : <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">Entrada</Badge>}</div>
                  <div><p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>{conv.resolvida ? <Badge variant="outline" className="border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400">Resolvida</Badge> : <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">Aberta</Badge>}</div>
                </div>
                {conv.atribuido_a && respName(conv.atribuido_a) && (
                  <div><p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Responsável</p><div className="flex items-center gap-2 text-sm"><Avatar className="h-6 w-6">{respFoto(conv.atribuido_a) && <AvatarImage src={respFoto(conv.atribuido_a)!} />}<AvatarFallback className="text-[9px]">{iniciais(respName(conv.atribuido_a), '')}</AvatarFallback></Avatar>{respName(conv.atribuido_a)}</div></div>
                )}
                <Separator />
                {/* anotações */}
                <div>
                  <p className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"><StickyNote className="h-3.5 w-3.5" />Anotações</p>
                  <textarea value={notasDraft} onChange={e => setNotasDraft(e.target.value)} onBlur={salvarNotas} rows={4}
                    placeholder="Anotações internas sobre a pessoa (salva ao sair do campo)…"
                    className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <NovaConversaModal open={novaOpen} onOpenChange={setNovaOpen} areas={areasDisp} templates={templates}
        onCriada={(c) => { setNovaOpen(false); carregarConversas(); setSelId(c.id); }} />
    </TooltipProvider>
  );
}

// ── Modal: iniciar nova conversa ──────────────────────────────────────────
function NovaConversaModal({ open, onOpenChange, areas, templates, onCriada }: {
  open: boolean; onOpenChange: (v: boolean) => void; areas: Area[]; templates: Template[]; onCriada: (c: Conversa) => void;
}) {
  const [telefone, setTelefone] = useState('');
  const [area, setArea] = useState<string>('');
  const [tplKey, setTplKey] = useState<string>('');
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const tpl = templates.find(t => t.key === tplKey) || null;

  useEffect(() => { if (!open) { setTelefone(''); setArea(''); setTplKey(''); setParams([]); } }, [open]);
  useEffect(() => { setParams(tpl ? tpl.params.map(() => '') : []); }, [tplKey]); // eslint-disable-line

  async function enviar() {
    const digits = telefone.replace(/\D+/g, '');
    if (!digits) { toast.error('Informe o telefone.'); return; }
    if (!tpl) { toast.error('Escolha um template de abertura.'); return; }
    if (tpl.params.some((_, i) => !params[i]?.trim())) { toast.error('Preencha os campos do template.'); return; }
    setEnviando(true);
    try {
      const r = await waInbox.nova({ telefone: digits, area: area || undefined, template_name: tpl.nome, template_params: params.map(p => p.trim()) });
      toast.success('Conversa iniciada!');
      if (r?.conversa) onCriada(r.conversa);
    } catch (e: any) { toast.error(e?.message || 'Erro ao iniciar conversa'); }
    finally { setEnviando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>Para iniciar com quem não te escreveu nas últimas 24h, o WhatsApp exige um <b>template aprovado</b>.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Telefone (com DDD)</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(21) 99999-9999" className="mt-1" /></div>
          <div><Label className="text-xs">Área (opcional)</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Deixar na Entrada" /></SelectTrigger>
              <SelectContent>{areas.map(a => <SelectItem key={a.nome} value={a.nome}>{a.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Template de abertura</Label>
            {templates.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nenhum template configurado. Peça ao admin para cadastrar um template aprovado na Meta.</p>
            ) : (
              <Select value={tplKey} onValueChange={setTplKey}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                <SelectContent>{templates.map(t => <SelectItem key={t.key} value={t.key}>{t.rotulo}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          {tpl && tpl.params.map((p, i) => (
            <div key={i}><Label className="text-xs">{p.label}</Label><Input value={params[i] || ''} onChange={e => setParams(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} className="mt-1" /></div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando}>{enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
