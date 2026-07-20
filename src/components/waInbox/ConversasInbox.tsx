// Inbox de WhatsApp (estilo Multi360) · Cuidados → Conversas.
// Três colunas: lista de conversas · thread com composer · detalhes do contato.
// Só entra aqui quem NÃO é fluxo do bot (convertidos, visitantes). Responde por
// texto livre dentro da janela de 24h do WhatsApp; fora dela, o campo bloqueia.
// Ligado ao backend real (api.waInbox); atualiza por polling.
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
  Loader2, Send, Search, Check, MessageCircle, RefreshCw,
  ExternalLink, Clock, User, CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';

type Conversa = {
  id: string; telefone: string; nome: string | null; membro_id: string | null;
  nao_lidas: number; resolvida: boolean; ultima_previa: string | null;
  last_message_at: string | null; dentro_janela: boolean; janela_expira_em: string | null;
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

export default function ConversasInbox() {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [filtro, setFiltro] = useState<'abertas' | 'nao_lidas' | 'todas'>('abertas');
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;

  const statusApi = filtro === 'todas' || filtro === 'nao_lidas' ? 'todas' : 'abertas';

  const carregarConversas = useCallback(async () => {
    try {
      const r = await waInbox.conversas({ status: statusApi, q: busca || undefined });
      setConversas(r?.conversas || []);
    } catch { setConversas([]); }
  }, [statusApi, busca]);

  const carregarThread = useCallback(async (id: string) => {
    try {
      const r = await waInbox.mensagens(id);
      setConv(r?.conversa || null);
      setMsgs(r?.mensagens || []);
    } catch { /* ignora */ }
  }, []);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);
  useEffect(() => { if (selId) carregarThread(selId); }, [selId, carregarThread]);
  useEffect(() => {
    const t1 = setInterval(carregarConversas, 12_000);
    const t2 = setInterval(() => { if (selRef.current) carregarThread(selRef.current); }, 8_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [carregarConversas, carregarThread]);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function responder() {
    const t = texto.trim();
    if (!t || !selId || enviando) return;
    setEnviando(true);
    try {
      await waInbox.responder(selId, { texto: t });
      setTexto('');
      await carregarThread(selId);
      carregarConversas();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar');
    } finally { setEnviando(false); }
  }

  async function resolver(resolvida: boolean) {
    if (!selId) return;
    try {
      await waInbox.atualizar(selId, { resolvida });
      toast.success(resolvida ? 'Conversa resolvida' : 'Conversa reaberta');
      carregarConversas();
      carregarThread(selId);
    } catch { toast.error('Erro'); }
  }

  const foraJanela = conv && !conv.dentro_janela;
  const lista = (conversas || []).filter(c => filtro !== 'nao_lidas' || c.nao_lidas > 0);
  const totalNaoLidas = (conversas || []).reduce((a, c) => a + (c.nao_lidas || 0), 0);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-[640px] w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        {/* ── Lista ─────────────────────────────────────────── */}
        <div className="flex w-[330px] shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MessageCircle className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Conversas</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">WhatsApp da igreja</p>
              </div>
            </div>
            {totalNaoLidas > 0 && (
              <Badge className="bg-primary text-primary-foreground">{totalNaoLidas}</Badge>
            )}
          </div>

          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar nome ou telefone" className="h-9 pl-8 text-sm" />
            </div>
          </div>

          <div className="flex gap-1 px-3 pt-2.5">
            {([['abertas', 'Abertas'], ['nao_lidas', 'Não lidas'], ['todas', 'Todas']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFiltro(k)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${filtro === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                {label}
              </button>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={carregarConversas} className="rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /></button>
              </TooltipTrigger>
              <TooltipContent>Atualizar</TooltipContent>
            </Tooltip>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-0.5 p-2 pt-2.5">
              {conversas === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : lista.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 px-4 text-center text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Nenhuma conversa {filtro === 'abertas' ? 'aberta' : filtro === 'nao_lidas' ? 'não lida' : ''} ainda.<br />Aparecem aqui quando alguém escreve no WhatsApp da igreja.</p>
                </div>
              ) : lista.map(c => {
                const active = c.id === selId;
                return (
                  <button key={c.id} onClick={() => setSelId(c.id)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{iniciais(c.nome, c.telefone)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.nome || telBonito(c.telefone)}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{horaCurta(c.last_message_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.ultima_previa || telBonito(c.telefone)}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {c.resolvida
                          ? <Badge variant="outline" className="h-4.5 border-blue-500/25 bg-blue-500/10 px-1.5 py-0 text-[10px] font-normal text-blue-600 dark:text-blue-400">Resolvida</Badge>
                          : <Badge variant="outline" className="h-4.5 border-primary/25 bg-primary/10 px-1.5 py-0 text-[10px] font-normal text-primary">Aberta</Badge>}
                        {c.nao_lidas > 0 && (
                          <span className="ml-auto flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{c.nao_lidas}</span>
                        )}
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
              <MessageCircle className="h-10 w-10 opacity-20" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{iniciais(conv.nome, conv.telefone)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{conv.nome || telBonito(conv.telefone)}</p>
                    <p className="text-[11px] text-muted-foreground">{telBonito(conv.telefone)}</p>
                  </div>
                  {conv.resolvida
                    ? <Badge variant="outline" className="border-blue-500/25 bg-blue-500/10 text-[11px] text-blue-600 dark:text-blue-400">Resolvida</Badge>
                    : <Badge variant="outline" className="border-primary/25 bg-primary/10 text-[11px] text-primary">Aberta</Badge>}
                </div>
                {conv.resolvida
                  ? <Button size="sm" variant="outline" onClick={() => resolver(false)}>Reabrir</Button>
                  : <Button size="sm" variant="outline" onClick={() => resolver(true)}><Check className="mr-1 h-3.5 w-3.5" />Resolver</Button>}
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
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${m.direcao === 'out' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {horaCurta(m.criado_em)}
                          {m.direcao === 'out' && <CheckCheck className="h-3 w-3" />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={fimRef} />
                </div>
              </ScrollArea>

              {foraJanela ? (
                <div className="border-t border-border bg-amber-50 px-4 py-3 text-[12px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  ⚠️ Fora da janela de 24h do WhatsApp — só é possível enviar um <b>template aprovado</b> agora. Assim que a pessoa responder, o campo de texto libera. (Para reengajar, use os disparos abaixo.)
                </div>
              ) : (
                <div className="border-t border-border p-3">
                  <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2">
                    <textarea
                      value={texto} onChange={e => setTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } }}
                      rows={1} placeholder="Escreva uma mensagem…  (Enter envia · Shift+Enter quebra linha)"
                      className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground" />
                    <Button size="icon" disabled={enviando || !texto.trim()} onClick={responder} className="h-9 w-9 shrink-0">
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {conv.janela_expira_em && janelaRestante(conv.janela_expira_em) && (
                    <div className="mt-1.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> Janela de resposta livre expira em <span className="font-medium text-foreground">{janelaRestante(conv.janela_expira_em)}</span>
                    </div>
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
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/15 text-primary text-lg font-semibold">{iniciais(conv.nome, conv.telefone)}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-semibold">{conv.nome || telBonito(conv.telefone)}</p>
              <p className="text-xs text-muted-foreground">{telBonito(conv.telefone)}</p>
              <a href={`https://wa.me/${conv.telefone.replace(/\D+/g, '')}`} target="_blank" rel="noreferrer" className="mt-1">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><ExternalLink className="h-3 w-3" />Abrir no WhatsApp</Button>
              </a>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                {conv.resolvida
                  ? <Badge variant="outline" className="border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400">Resolvida</Badge>
                  : <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">Aberta</Badge>}
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadastro</p>
                {conv.membro_id ? (
                  <a href={`/admin/membresia?id=${conv.membro_id}`} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm hover:bg-muted/50">
                    <User className="h-4 w-4 text-primary" /> Ver ficha do membro
                  </a>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" /> Sem cadastro vinculado
                  </div>
                )}
              </div>
              <Separator />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Só entram aqui conversas de quem <b>não</b> é fluxo do bot (novos convertidos, visitantes). Coletas de líderes e notas fiscais continuam no fluxo automático.
              </p>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
