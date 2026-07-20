// Inbox de WhatsApp (estilo Multi360) · módulo Conversas.
// Três colunas: lista (com chips por área) · thread com composer · detalhes.
// Escopo por área: cada um vê a "Entrada" (não triada) + as conversas da sua
// área + as suas; admin vê tudo. Triagem e atribuição num clique. Botão de
// "Nova conversa" (número + template de abertura). Ligado à api.waInbox.
import { useState, useEffect, useRef, useCallback } from 'react';
import { waInbox } from '@/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Loader2, Send, Search, Check, MessageCircle, RefreshCw, ExternalLink, Clock,
  User, CheckCheck, UserPlus, ChevronDown, UserCheck, Tag, Plus, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

type Atendente = { id: string; name: string };
type Area = { nome: string; setor: string | null };
type Template = { key: string; rotulo: string; nome: string; params: { label: string }[] };
type Conversa = {
  id: string; telefone: string; nome: string | null; membro_id: string | null;
  area: string | null; nao_lidas: number; resolvida: boolean; ultima_previa: string | null;
  atribuido_a: string | null; last_message_at: string | null;
  dentro_janela: boolean; janela_expira_em: string | null;
};
type Msg = { id: string; direcao: 'in' | 'out'; tipo: string; texto: string | null; criado_em: string };

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

export default function ConversasInbox({
  atendentes = [], currentUserId, userAreas = [], isAdmin = false,
}: { atendentes?: Atendente[]; currentUserId?: string; userAreas?: string[]; isAdmin?: boolean }) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [status, setStatus] = useState<'abertas' | 'todas'>('abertas');
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [areaFiltro, setAreaFiltro] = useState<string>('todas'); // 'todas'|'entrada'|'minhas'|<nome>
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [areasDisp, setAreasDisp] = useState<Area[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [novaOpen, setNovaOpen] = useState(false);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;

  // chips de área: admin vê todas as áreas; demais veem só as suas
  const areasChips = isAdmin ? areasDisp.map(a => a.nome) : userAreas;

  const carregarConversas = useCallback(async () => {
    try {
      const r = await waInbox.conversas({ status, q: busca || undefined, area: areaFiltro });
      setConversas(r?.conversas || []);
    } catch { setConversas([]); }
  }, [status, busca, areaFiltro]);

  const carregarThread = useCallback(async (id: string) => {
    try {
      const r = await waInbox.mensagens(id);
      setConv(r?.conversa || null);
      setMsgs(r?.mensagens || []);
    } catch { /* ignora */ }
  }, []);

  useEffect(() => {
    waInbox.areas().then(r => setAreasDisp(r?.areas || [])).catch(() => {});
    waInbox.templates().then(r => setTemplates(r?.templates || [])).catch(() => {});
  }, []);
  useEffect(() => { carregarConversas(); }, [carregarConversas]);
  useEffect(() => { if (selId) carregarThread(selId); }, [selId, carregarThread]);
  useEffect(() => {
    const t1 = setInterval(carregarConversas, 12_000);
    const t2 = setInterval(() => { if (selRef.current) carregarThread(selRef.current); }, 8_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [carregarConversas, carregarThread]);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const nomeResp = (id: string | null) => (id ? atendentes.find(a => a.id === id)?.name || null : null);

  async function responder() {
    const t = texto.trim();
    if (!t || !selId || enviando) return;
    setEnviando(true);
    try {
      await waInbox.responder(selId, { texto: t });
      setTexto('');
      await carregarThread(selId);
      carregarConversas();
    } catch (e: any) { toast.error(e?.message || 'Erro ao enviar'); }
    finally { setEnviando(false); }
  }

  async function resolver(resolvida: boolean) {
    if (!selId) return;
    try {
      await waInbox.atualizar(selId, { resolvida });
      toast.success(resolvida ? 'Conversa resolvida' : 'Conversa reaberta');
      carregarConversas(); carregarThread(selId);
    } catch { toast.error('Erro'); }
  }

  async function atribuir(userId: string | null) {
    if (!selId) return;
    setConv(c => (c ? { ...c, atribuido_a: userId } : c));
    try {
      await waInbox.atualizar(selId, { atribuido_a: userId });
      toast.success(userId ? `Atribuída a ${nomeResp(userId) || 'responsável'}` : 'Atribuição removida');
      carregarConversas(); carregarThread(selId);
    } catch { toast.error('Erro ao atribuir'); carregarThread(selId); }
  }

  async function triar(area: string | null) {
    if (!selId) return;
    setConv(c => (c ? { ...c, area } : c));
    try {
      await waInbox.atualizar(selId, { area });
      toast.success(area ? `Movida para ${area}` : 'Voltou para a Entrada');
      carregarConversas(); carregarThread(selId);
    } catch { toast.error('Erro ao triar'); carregarThread(selId); }
  }

  const foraJanela = conv && !conv.dentro_janela;
  const lista = (conversas || []).filter(c => !soNaoLidas || c.nao_lidas > 0);
  const totalNaoLidas = (conversas || []).reduce((a, c) => a + (c.nao_lidas || 0), 0);

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

          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" className="h-9 pl-8 text-sm" />
            </div>
          </div>

          {/* chips de área */}
          <div className="flex flex-wrap gap-1 px-3 pt-2.5">
            {[{ k: 'todas', l: 'Todas' }, { k: 'entrada', l: 'Entrada' }, ...(currentUserId ? [{ k: 'minhas', l: 'Minhas' }] : []), ...areasChips.map(a => ({ k: a, l: a }))].map(({ k, l }) => (
              <button key={k} onClick={() => setAreaFiltro(k)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${areaFiltro === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                {k === 'entrada' && <Inbox className="mr-0.5 inline h-3 w-3" />}{l}
              </button>
            ))}
          </div>

          {/* status + não lidas */}
          <div className="flex items-center gap-1 px-3 pt-2 pb-1">
            {(['abertas', 'todas'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${status === s ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {s === 'abertas' ? 'Abertas' : 'Todas (c/ resolvidas)'}
              </button>
            ))}
            <button onClick={() => setSoNaoLidas(v => !v)} className={`ml-auto rounded-md px-2 py-1 text-[11px] font-medium ${soNaoLidas ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>Não lidas</button>
            <button onClick={carregarConversas} className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground" title="Atualizar"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-0.5 p-2 pt-1.5">
              {conversas === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : lista.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 px-4 text-center text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Nenhuma conversa aqui.<br />Aparecem quando alguém escreve no WhatsApp da igreja — ou use "Nova".</p>
                </div>
              ) : lista.map(c => {
                const active = c.id === selId;
                return (
                  <button key={c.id} onClick={() => setSelId(c.id)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                    <Avatar className="h-11 w-11 shrink-0"><AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{iniciais(c.nome, c.telefone)}</AvatarFallback></Avatar>
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
                        {c.atribuido_a && nomeResp(c.atribuido_a) && (
                          <Tooltip><TooltipTrigger asChild><span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><UserCheck className="h-3 w-3" />{nomeResp(c.atribuido_a)!.split(' ')[0]}</span></TooltipTrigger><TooltipContent>Responsável: {nomeResp(c.atribuido_a)}</TooltipContent></Tooltip>
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
                  <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{iniciais(conv.nome, conv.telefone)}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{conv.nome || telBonito(conv.telefone)}</p>
                    <p className="text-[11px] text-muted-foreground">{telBonito(conv.telefone)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* triagem por área */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-violet-500" />{conv.area || 'Entrada'}<ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Triar para a área</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <div className="max-h-64 overflow-y-auto">
                        {areasDisp.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem áreas</div>}
                        {areasDisp.map(a => (
                          <DropdownMenuItem key={a.nome} onClick={() => triar(a.nome)} className="gap-2">
                            <span className={`h-2 w-2 rounded-full ${conv.area === a.nome ? 'bg-violet-500' : 'bg-muted-foreground/30'}`} />
                            <span className="flex-1 truncate">{a.nome}</span>
                            {conv.area === a.nome && <Check className="h-3.5 w-3.5 text-violet-500" />}
                          </DropdownMenuItem>
                        ))}
                      </div>
                      {conv.area && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => triar(null)} className="gap-2 text-muted-foreground"><Inbox className="h-4 w-4" />Voltar para a Entrada</DropdownMenuItem></>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {/* atribuição */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        {conv.atribuido_a && nomeResp(conv.atribuido_a) ? <><UserCheck className="h-3.5 w-3.5 text-primary" />{nomeResp(conv.atribuido_a)!.split(' ')[0]}</> : <><UserPlus className="h-3.5 w-3.5" />Atribuir</>}
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Responsável pela conversa</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {currentUserId && conv.atribuido_a !== currentUserId && (
                        <DropdownMenuItem onClick={() => atribuir(currentUserId)} className="gap-2"><UserCheck className="h-4 w-4 text-primary" />Atribuir a mim</DropdownMenuItem>
                      )}
                      <div className="max-h-56 overflow-y-auto">
                        {atendentes.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem equipe cadastrada</div>}
                        {atendentes.map(a => (
                          <DropdownMenuItem key={a.id} onClick={() => atribuir(a.id)} className="gap-2">
                            <span className={`h-2 w-2 rounded-full ${conv.atribuido_a === a.id ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                            <span className="flex-1 truncate">{a.name}</span>
                            {conv.atribuido_a === a.id && <Check className="h-3.5 w-3.5 text-primary" />}
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
                        <p className="leading-relaxed">{m.texto || <span className="italic opacity-60">[{m.tipo}]</span>}</p>
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
          <div className="hidden w-[260px] shrink-0 flex-col border-l border-border xl:flex">
            <div className="flex flex-col items-center gap-2 border-b border-border p-6">
              <Avatar className="h-16 w-16"><AvatarFallback className="bg-primary/15 text-primary text-lg font-semibold">{iniciais(conv.nome, conv.telefone)}</AvatarFallback></Avatar>
              <p className="text-sm font-semibold">{conv.nome || telBonito(conv.telefone)}</p>
              <p className="text-xs text-muted-foreground">{telBonito(conv.telefone)}</p>
              <a href={`https://wa.me/${conv.telefone.replace(/\D+/g, '')}`} target="_blank" rel="noreferrer" className="mt-1"><Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><ExternalLink className="h-3 w-3" />Abrir no WhatsApp</Button></a>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Área</p>
                {conv.area
                  ? <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400">{conv.area}</Badge>
                  : <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">Entrada (não triada)</Badge>}
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Responsável</p>
                {conv.atribuido_a && nomeResp(conv.atribuido_a) ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border p-2"><Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">{iniciais(nomeResp(conv.atribuido_a), '')}</AvatarFallback></Avatar><span className="flex-1 truncate text-sm">{nomeResp(conv.atribuido_a)}</span></div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground"><UserPlus className="h-4 w-4" />Não atribuído</div>
                )}
                {currentUserId && conv.atribuido_a !== currentUserId && (
                  <Button size="sm" variant="ghost" className="mt-1.5 h-7 gap-1 px-2 text-xs text-primary" onClick={() => atribuir(currentUserId)}><UserCheck className="h-3.5 w-3.5" />Atribuir a mim</Button>
                )}
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                {conv.resolvida ? <Badge variant="outline" className="border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400">Resolvida</Badge> : <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">Aberta</Badge>}
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadastro</p>
                {conv.membro_id ? (
                  <a href={`/ministerial/membresia?membro=${conv.membro_id}`} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm hover:bg-muted/50"><User className="h-4 w-4 text-primary" />Ver ficha do membro</a>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground"><User className="h-4 w-4" />Sem cadastro vinculado</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <NovaConversaModal
        open={novaOpen} onOpenChange={setNovaOpen} areas={areasDisp} templates={templates}
        onCriada={(c) => { setNovaOpen(false); carregarConversas(); setSelId(c.id); }}
      />
    </TooltipProvider>
  );
}

// ── Modal: iniciar nova conversa (número + template de abertura) ──────────
function NovaConversaModal({ open, onOpenChange, areas, templates, onCriada }: {
  open: boolean; onOpenChange: (v: boolean) => void; areas: Area[]; templates: Template[];
  onCriada: (c: Conversa) => void;
}) {
  const [telefone, setTelefone] = useState('');
  const [area, setArea] = useState<string>('');
  const [tplKey, setTplKey] = useState<string>('');
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const tpl = templates.find(t => t.key === tplKey) || null;

  useEffect(() => {
    if (!open) { setTelefone(''); setArea(''); setTplKey(''); setParams([]); }
  }, [open]);
  useEffect(() => { setParams(tpl ? tpl.params.map(() => '') : []); }, [tplKey]); // eslint-disable-line

  async function enviar() {
    const digits = telefone.replace(/\D+/g, '');
    if (!digits) { toast.error('Informe o telefone.'); return; }
    if (!tpl) { toast.error('Escolha um template de abertura.'); return; }
    if (tpl.params.some((_, i) => !params[i]?.trim())) { toast.error('Preencha os campos do template.'); return; }
    setEnviando(true);
    try {
      const r = await waInbox.nova({
        telefone: digits, area: area || undefined,
        template_name: tpl.nome, template_params: params.map(p => p.trim()),
      });
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
          <DialogDescription>
            Para iniciar uma conversa com quem não te escreveu nas últimas 24h, o WhatsApp exige um <b>template aprovado</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Telefone (com DDD)</Label>
            <Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(21) 99999-9999" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Área (opcional)</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Deixar na Entrada" /></SelectTrigger>
              <SelectContent>
                {areas.map(a => <SelectItem key={a.nome} value={a.nome}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Template de abertura</Label>
            {templates.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nenhum template configurado. Peça ao admin para cadastrar um template aprovado na Meta.</p>
            ) : (
              <Select value={tplKey} onValueChange={setTplKey}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.key} value={t.key}>{t.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {tpl && tpl.params.map((p, i) => (
            <div key={i}>
              <Label className="text-xs">{p.label}</Label>
              <Input value={params[i] || ''} onChange={e => setParams(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} className="mt-1" />
            </div>
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
