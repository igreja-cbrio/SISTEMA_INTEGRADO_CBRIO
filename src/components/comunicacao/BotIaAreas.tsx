// Bot de IA por área (Comunicação → Bot → IA por área) · 08/09/2026.
//
// Pedido do Marcos: um assistente simples respondendo dúvidas rápidas no
// WhatsApp da igreja enquanto não há gente atendendo — e POR ÁREA, pra desligar
// só na área que começar a atender de verdade. Esta tela é onde se decide quem
// responde (ninguém · menu · IA), o contato humano do encaminhamento, o
// conhecimento e o interruptor de cada área, e onde se TESTA sem enviar nada.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { comunicacao } from '@/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2, Sparkles, Bot, Pencil, Plus, Trash2, FlaskConical, RefreshCw, AlertTriangle, Users, Save, Link2,
  Mail, Play, Eye, CalendarSearch,
} from 'lucide-react';

type Modo = 'ninguem' | 'menu' | 'ia';
type BotIaCfg = {
  ativo: boolean; contato_humano: string; contato_link: string | null;
  limite_dia: number; limite_conversa_dia: number; horas_silencio_apos_humano: number; instrucoes: string;
  varredura_emails?: string[];
};
type Config = {
  modo: Modo; ia_ativa: boolean; menu_ligado: boolean; bot_ia: BotIaCfg;
  migration_ok: boolean; modelo: string; anthropic_configurada: boolean;
};
type LinkArea = { rotulo: string; url: string };
type Area = { area: string; ativo: boolean; descricao: string; conhecimento: string; links: LinkArea[]; encaminhar_para: string };
type Simulacao = {
  acao: string; area: string | null; motivo: string; texto?: string;
  uso?: { input: number; output: number } | null; avisos?: string[]; modelo?: string; modelo_chamado?: boolean;
  removidos?: { links: number; telefones: number } | null;
  conversa?: { id: string; nome: string | null; area: string | null; cadastrada: boolean } | null;
};
type Resumo = {
  dias: number; total: number; por_acao: Record<string, number>;
  por_area: { area: string; total: number; responder: number; encaminhar: number; silencio: number }[];
  por_motivo: { motivo: string; n: number }[]; tokens: number; truncado: boolean;
  ultimo_erro_modelo?: string | null; ultimo_erro_em?: string | null;
};

const MODOS: { valor: Modo; titulo: string; descricao: string }[] = [
  { valor: 'ninguem', titulo: 'Ninguém', descricao: 'Só gente responde. A mensagem cai na aba Conversas e fica lá até alguém atender.' },
  { valor: 'menu', titulo: 'Menu de setores', descricao: 'O bot antigo: pergunta o setor, pede o nome e avisa a equipe da área.' },
  { valor: 'ia', titulo: 'IA por área', descricao: 'Responde dúvidas rápidas com o conhecimento de cada área ligada; área desligada = a equipe responde; dúvida profunda = manda o contato humano.' },
];

const ACAO_ROTULO: Record<string, string> = {
  responder: 'respondeu', encaminhar: 'encaminhou', silencio: 'ficou em silêncio',
  erro: 'erro', desligado: 'desligado', duplicado: 'reentrega ignorada', pendente: 'pendente',
};
const MOTIVO_ROTULO: Record<string, string> = {
  area_desligada: 'área desligada (a equipe responde)', sem_area: 'assunto de nenhuma área',
  sem_contato_humano: 'sem contato humano configurado', resposta_vazia: 'o modelo não escreveu resposta',
  resposta_so_inventada: 'resposta só tinha link/telefone inventado', agradecimento: 'só agradecimento',
  sem_texto: 'sem texto', sem_area_ativa: 'nenhuma área ligada', limite_dia: 'teto do dia atingido',
  limite_conversa: 'teto da conversa atingido', humano_ativo: 'um humano respondeu há pouco',
  modelo_silencio: 'a mensagem não pedia nada', modelo_encaminhar: 'exige gente', modelo_responder: 'respondeu com o conhecimento',
  migration_ausente: 'migration não aplicada', bot_desligado: 'bot desligado', sem_areas: 'sem áreas cadastradas',
};

function rotuloMotivo(m?: string | null) { return m ? (MOTIVO_ROTULO[m] || m) : '—'; }

function Spinner() { return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>; }

export default function BotIaAreas({ podeEscrever }: { podeEscrever: boolean }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoModo, setSalvandoModo] = useState(false);
  const [form, setForm] = useState({ contato_humano: '', limite_dia: '', limite_conversa_dia: '', horas_silencio_apos_humano: '', instrucoes: '', varredura_emails: '' });
  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [editando, setEditando] = useState<Area | null>(null);
  const [novaArea, setNovaArea] = useState('');
  const [resumo, setResumo] = useState<Resumo | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [c, a] = await Promise.all([comunicacao.botIa.config(), comunicacao.botIa.areas()]);
      setCfg(c);
      setAreas(a?.areas || []);
      setCatalogo(a?.catalogo || []);
      setForm({
        contato_humano: c?.bot_ia?.contato_humano || '',
        limite_dia: String(c?.bot_ia?.limite_dia ?? ''),
        limite_conversa_dia: String(c?.bot_ia?.limite_conversa_dia ?? ''),
        horas_silencio_apos_humano: String(c?.bot_ia?.horas_silencio_apos_humano ?? ''),
        instrucoes: c?.bot_ia?.instrucoes || '',
        varredura_emails: (c?.bot_ia?.varredura_emails || []).join(', '),
      });
    } catch (e: unknown) {
      setErro((e as Error)?.message || 'Falha ao carregar a configuração do bot.');
    }
    comunicacao.botIa.resumo(7).then((r: Resumo) => setResumo(r)).catch(() => setResumo(null));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudarModo(modo: Modo) {
    if (!podeEscrever || !cfg || cfg.modo === modo) return;
    if (modo === 'ia' && !form.contato_humano.trim()) {
      toast.warning('Antes de ligar a IA, preencha o contato humano (o número do CBZap) — é pra onde o bot manda as dúvidas profundas.', { duration: 8000 });
    }
    setSalvandoModo(true);
    try {
      const r = await comunicacao.botIa.salvarConfig({ modo });
      setCfg((c) => (c ? { ...c, modo: r?.modo || modo, bot_ia: r?.bot_ia || c.bot_ia, menu_ligado: modo === 'menu' } : c));
      toast.success(modo === 'ninguem' ? 'Ninguém responde sozinho — só gente.' : modo === 'menu' ? 'Menu de setores ligado.' : 'IA por área ligada — só nas áreas marcadas como ligadas.');
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao mudar o modo'); }
    finally { setSalvandoModo(false); }
  }

  async function salvarCfg() {
    if (!podeEscrever) return;
    setSalvandoCfg(true);
    try {
      const r = await comunicacao.botIa.salvarConfig({
        contato_humano: form.contato_humano,
        limite_dia: Number(form.limite_dia), limite_conversa_dia: Number(form.limite_conversa_dia),
        horas_silencio_apos_humano: Number(form.horas_silencio_apos_humano), instrucoes: form.instrucoes,
        varredura_emails: form.varredura_emails,
      });
      setCfg((c) => (c ? { ...c, bot_ia: r?.bot_ia || c.bot_ia } : c));
      // O servidor devolve a lista que GRAVOU — é ela que fica no campo, pra
      // ninguém achar que um endereço inválido foi salvo.
      if (r?.bot_ia?.varredura_emails) setForm((f) => ({ ...f, varredura_emails: r.bot_ia.varredura_emails.join(', ') }));
      if (r?.varredura_emails_descartados > 0) {
        toast.warning(`${r.varredura_emails_descartados} endereço(s) da varredura não parecia(m) e-mail e não foi(ram) salvo(s).`, { duration: 8000 });
      } else {
        toast.success('Configuração salva');
      }
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao salvar'); }
    finally { setSalvandoCfg(false); }
  }

  async function alternarArea(a: Area) {
    if (!podeEscrever) return;
    const novo = !a.ativo;
    setAreas((list) => (list || []).map((x) => (x.area === a.area ? { ...x, ativo: novo } : x)));
    try {
      await comunicacao.botIa.salvarArea(a.area, { ativo: novo });
      toast.success(novo ? `Bot LIGADO em ${a.area}.` : `Bot desligado em ${a.area} — a equipe responde.`);
    } catch (e: unknown) {
      setAreas((list) => (list || []).map((x) => (x.area === a.area ? { ...x, ativo: !novo } : x)));
      toast.error((e as Error)?.message || 'Erro ao alternar');
    }
  }

  async function adicionarArea() {
    const nome = novaArea.trim();
    if (!nome || !podeEscrever) return;
    try {
      const r: Area = await comunicacao.botIa.salvarArea(nome, { ativo: false });
      setAreas((list) => [...(list || []).filter((x) => x.area !== r.area), r].sort((x, y) => x.area.localeCompare(y.area, 'pt-BR')));
      setNovaArea('');
      setEditando(r);
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao adicionar área'); }
  }

  const areasNaoConfiguradas = useMemo(() => {
    const tem = new Set((areas || []).map((a) => a.area.toLowerCase()));
    return catalogo.filter((c) => !tem.has(c.toLowerCase()));
  }, [areas, catalogo]);

  const ligadas = (areas || []).filter((a) => a.ativo).length;

  if (erro) {
    return (
      <div style={{ margin: 16, padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar o bot</div>
        <div style={{ fontSize: 11, color: '#791F1F', marginBottom: 10 }}>{erro}</div>
        <button onClick={carregar} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
      </div>
    );
  }
  if (!cfg || areas === null) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-primary" />Bot de IA por área</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Responde dúvidas rápidas de quem escreve no WhatsApp da igreja, usando só o conhecimento que você escrever aqui.
            Área <b>ligada</b>: o bot responde. Área <b>desligada</b>: o bot fica em silêncio e a equipe responde pela aba Conversas.
            Dúvida que exige gente: o bot manda o contato humano.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {!cfg.migration_ok && (
        <Card className="flex items-start gap-2 border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <b>A migration <code>20260908120000_wa_bot_ia_areas.sql</code> ainda não foi aplicada.</b> Sem ela o bot fica desligado e nada aqui salva.
            Aplique no SQL Editor e recarregue.
          </div>
        </Card>
      )}
      {!cfg.ia_ativa && (
        <Card className="flex items-start gap-2 border-red-500/40 bg-red-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div><b>O webhook está desligado</b> ("Bot ativo" em Bot → Configuração). Nada chega ao inbox nem ao bot enquanto isso estiver assim.</div>
        </Card>
      )}
      {!cfg.anthropic_configurada && (
        <Card className="flex items-start gap-2 border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div><b>ANTHROPIC_API_KEY não está configurada</b> no servidor — o bot não consegue chamar o modelo.</div>
        </Card>
      )}
      {resumo?.ultimo_erro_modelo === 'anthropic_sem_credito' && (
        <Card className="flex items-start gap-2 border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <b>A IA está sem crédito</b> — a conta da Anthropic ficou sem saldo, e o bot não responde até o crédito voltar
            {resumo.ultimo_erro_em ? ` (última tentativa: ${new Date(resumo.ultimo_erro_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})` : ''}.
            Quem resolve é quem administra a conta, em console.anthropic.com → Plans &amp; Billing. Nada se perde: as mensagens continuam na aba Conversas.
          </div>
        </Card>
      )}

      {/* ── quem responde ─────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Quem responde quem escreve para o número da igreja</p>
          {salvandoModo && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {MODOS.map((m) => {
            const ativo = cfg.modo === m.valor;
            return (
              <button key={m.valor} disabled={!podeEscrever || salvandoModo} onClick={() => mudarModo(m.valor)}
                className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${ativo ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{m.titulo}</span>
                  {ativo && <Badge>ativo</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.descricao}</p>
              </button>
            );
          })}
        </div>
        {cfg.modo === 'ia' && ligadas === 0 && (
          <p className="mt-3 text-xs text-amber-600">⚠️ A IA está ligada, mas <b>nenhuma área está ligada</b> — o bot vai ficar em silêncio em tudo. Ligue as áreas abaixo.</p>
        )}
        {cfg.modo === 'ia' && !form.contato_humano.trim() && (
          <p className="mt-3 text-xs text-amber-600">⚠️ Sem <b>contato humano</b>, dúvida profunda vira silêncio em vez de encaminhamento. Preencha abaixo.</p>
        )}
      </Card>

      {/* ── contato humano + limites ──────────────────────────────── */}
      <Card className="space-y-3 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />Contato humano e limites</p>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label className="text-xs">Contato humano (WhatsApp do CBZap)</Label>
            <Input className="mt-1" placeholder="(21) 99756-7770" value={form.contato_humano} disabled={!podeEscrever}
              onChange={(e) => setForm((f) => ({ ...f, contato_humano: e.target.value }))} />
            <p className="mt-1 text-[11px] text-muted-foreground">É o número que o bot manda quando a dúvida exige gente. Vai com link wa.me quando for um celular.</p>
          </div>
          <div>
            <Label className="text-xs">Máx. respostas por dia (igreja toda)</Label>
            <Input className="mt-1" type="number" min={1} value={form.limite_dia} disabled={!podeEscrever}
              onChange={(e) => setForm((f) => ({ ...f, limite_dia: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Máx. por conversa por dia</Label>
            <Input className="mt-1" type="number" min={1} value={form.limite_conversa_dia} disabled={!podeEscrever}
              onChange={(e) => setForm((f) => ({ ...f, limite_conversa_dia: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">Silêncio após resposta humana (horas)</Label>
            <Input className="mt-1" type="number" min={1} value={form.horas_silencio_apos_humano} disabled={!podeEscrever}
              onChange={(e) => setForm((f) => ({ ...f, horas_silencio_apos_humano: e.target.value }))} />
            <p className="mt-1 text-[11px] text-muted-foreground">Se alguém da equipe respondeu nesta conversa há menos tempo que isso, o bot não entra.</p>
          </div>
          <div className="md:col-span-4">
            <Label className="flex items-center gap-1 text-xs"><Mail className="h-3.5 w-3.5" />E-mails da varredura mensal</Label>
            <Input className="mt-1" value={form.varredura_emails} disabled={!podeEscrever}
              placeholder="nome@cbrio.com.br, outro@cbrio.com.br"
              onChange={(e) => setForm((f) => ({ ...f, varredura_emails: e.target.value }))} />
            <p className="mt-1 text-[11px] text-muted-foreground">Quem recebe, no dia 1 de cada mês, o resumo dos temas do WhatsApp. Separe por vírgula (até 5). O e-mail leva só temas e contagens — nunca o texto de ninguém.</p>
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Instruções extras pro bot (opcional)</Label>
            <Textarea className="mt-1" rows={3} value={form.instrucoes} disabled={!podeEscrever}
              placeholder="Ex.: Chame a igreja de CBRio. Não fale de dinheiro. Em setembro estamos em campanha do Kids."
              onChange={(e) => setForm((f) => ({ ...f, instrucoes: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">Modelo: <code>{cfg.modelo}</code></p>
          <Button size="sm" className="gap-1.5" disabled={!podeEscrever || salvandoCfg} onClick={salvarCfg}>
            {salvandoCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
          </Button>
        </div>
      </Card>

      {/* ── áreas ─────────────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Áreas · {ligadas} ligada{ligadas === 1 ? '' : 's'} de {areas.length}</p>
            <p className="text-[11px] text-muted-foreground">Ligue só a área que NÃO tem gente atendendo. Quando uma equipe começar a responder pela aba Conversas, desligue aqui — a mensagem continua chegando pra ela.</p>
          </div>
          {podeEscrever && (
            <div className="flex items-center gap-2">
              <Select value={novaArea} onValueChange={setNovaArea}>
                <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Adicionar área…" /></SelectTrigger>
                <SelectContent>
                  {areasNaoConfiguradas.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Todas as áreas já estão aqui</div>}
                  {areasNaoConfiguradas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!novaArea} onClick={adicionarArea}><Plus className="h-3.5 w-3.5" />Adicionar</Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Área</th>
                <th className="px-3 py-2.5 text-center font-medium">Bot</th>
                <th className="px-3 py-2.5 text-left font-medium">O que ele sabe</th>
                <th className="px-3 py-2.5 text-center font-medium">Links</th>
                <th className="px-3 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {areas.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Nenhuma área ainda. {cfg.migration_ok ? 'Adicione ao lado.' : 'Aplique a migration.'}</td></tr>
              ) : areas.map((a) => (
                <tr key={a.area} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{a.area}</div>
                    {a.descricao && <div className="text-[11px] text-muted-foreground">{a.descricao}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Switch checked={a.ativo} disabled={!podeEscrever} onCheckedChange={() => alternarArea(a)} />
                      <span className={`text-[10px] ${a.ativo ? 'text-primary' : 'text-muted-foreground'}`}>{a.ativo ? 'responde' : 'equipe'}</span>
                    </div>
                  </td>
                  <td className="max-w-[420px] px-3 py-2.5">
                    {a.conhecimento
                      ? <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{a.conhecimento}</p>
                      : <span className="text-xs text-amber-600">sem conhecimento — {a.ativo ? 'ligada assim, só encaminha' : 'escreva antes de ligar'}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{a.links.length}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button disabled={!podeEscrever} onClick={() => setEditando(a)} className="rounded p-1.5 text-muted-foreground hover:text-primary disabled:opacity-40" title="Editar"><Pencil className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── testar ────────────────────────────────────────────────── */}
      <Simulador podeEscrever={podeEscrever} />

      {/* ── resumo ────────────────────────────────────────────────── */}
      {resumo && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Últimos {resumo.dias} dias · {resumo.total} mensagem{resumo.total === 1 ? '' : 's'} avaliada{resumo.total === 1 ? '' : 's'}</p>
          {resumo.total === 0 ? (
            <p className="text-sm text-muted-foreground">O bot ainda não avaliou nenhuma mensagem. Ele só entra com a IA ligada, área ligada e o menu desligado.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">O que fez</p>
                {Object.entries(resumo.por_acao).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span>{ACAO_ROTULO[k] || k}</span><span className="tabular-nums font-medium">{v}</span></div>
                ))}
                <p className="mt-2 text-[11px] text-muted-foreground">{resumo.tokens.toLocaleString('pt-BR')} tokens</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Por área</p>
                {resumo.por_area.slice(0, 8).map((r) => (
                  <div key={r.area} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{r.area}</span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{r.responder} resp · {r.encaminhar} enc · {r.silencio} sil</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Por que ficou em silêncio / encaminhou</p>
                {resumo.por_motivo.slice(0, 8).map((r) => (
                  <div key={r.motivo} className="flex justify-between gap-2 text-sm"><span className="truncate">{rotuloMotivo(r.motivo)}</span><span className="tabular-nums font-medium">{r.n}</span></div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── varredura mensal ──────────────────────────────────────── */}
      <VarreduraMensal podeEscrever={podeEscrever} />

      <EditorArea area={editando} onClose={() => setEditando(null)} onSalvo={(r) => {
        setAreas((list) => (list || []).map((x) => (x.area === r.area ? r : x)));
        setEditando(null);
      }} />
    </div>
  );
}

// ── editor de uma área ───────────────────────────────────────────────────
function EditorArea({ area, onClose, onSalvo }: { area: Area | null; onClose: () => void; onSalvo: (a: Area) => void }) {
  const [f, setF] = useState<Area | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setF(area ? { ...area, links: area.links.map((l) => ({ ...l })) } : null); }, [area]);

  async function salvar() {
    if (!f) return;
    const linksRuins = f.links.filter((l) => l.url.trim() && !/^https?:\/\//i.test(l.url.trim()));
    if (linksRuins.length) { toast.error('Todo link precisa começar com https:// — o bot só envia o que estiver exatamente aqui.'); return; }
    setSalvando(true);
    try {
      const r: Area = await comunicacao.botIa.salvarArea(f.area, {
        ativo: f.ativo, descricao: f.descricao, conhecimento: f.conhecimento, encaminhar_para: f.encaminhar_para,
        links: f.links.filter((l) => l.url.trim()),
      });
      toast.success(`${r.area} salva`);
      onSalvo(r);
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={!!area} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{area?.area}</DialogTitle>
          <DialogDescription>O bot só usa o que está escrito aqui. Se não está aqui, ele não sabe — e encaminha.</DialogDescription>
        </DialogHeader>
        {f && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{f.ativo ? 'Bot responde nesta área' : 'Equipe responde (bot em silêncio)'}</p>
                <p className="text-[11px] text-muted-foreground">Desligue quando alguém da área começar a atender pela aba Conversas.</p>
              </div>
              <Switch checked={f.ativo} onCheckedChange={(v) => setF((x) => (x ? { ...x, ativo: v } : x))} />
            </div>
            <div>
              <Label className="text-xs">Descrição (1 linha · ajuda o bot a reconhecer o assunto)</Label>
              <Input className="mt-1" value={f.descricao} placeholder="Ex.: grupos de conexão — inscrição, encontros, links, líderes"
                onChange={(e) => setF((x) => (x ? { ...x, descricao: e.target.value } : x))} />
            </div>
            <div>
              <Label className="text-xs">O que o bot pode dizer</Label>
              <Textarea className="mt-1" rows={9} value={f.conhecimento}
                placeholder={'Escreva como se explicasse pra um voluntário novo. Ex.:\n- A inscrição em grupos é pelo site (link abaixo). Quem já está inscrito recebe o link do encontro pela liderança do grupo.\n- Os encontros são semanais, à noite. O dia varia por grupo.\n- Dúvida sobre um grupo específico: falar com o líder.'}
                onChange={(e) => setF((x) => (x ? { ...x, conhecimento: e.target.value } : x))} />
              <p className="mt-1 text-[11px] text-muted-foreground">{f.conhecimento.length}/6000 · não escreva telefone aqui — telefone que não seja o contato humano é apagado da resposta.</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="flex items-center gap-1 text-xs"><Link2 className="h-3.5 w-3.5" />Links que o bot PODE enviar</Label>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setF((x) => (x ? { ...x, links: [...x.links, { rotulo: '', url: '' }] } : x))}><Plus className="h-3 w-3" />Link</Button>
              </div>
              {f.links.length === 0 && <p className="text-xs text-muted-foreground">Nenhum. Qualquer link que o modelo inventar é apagado da resposta.</p>}
              <div className="space-y-1.5">
                {f.links.map((l, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input className="h-8 w-40" placeholder="Rótulo" value={l.rotulo} onChange={(e) => setF((x) => (x ? { ...x, links: x.links.map((y, j) => (j === i ? { ...y, rotulo: e.target.value } : y)) } : x))} />
                    <Input className="h-8 flex-1" placeholder="https://…" value={l.url} onChange={(e) => setF((x) => (x ? { ...x, links: x.links.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)) } : x))} />
                    <button onClick={() => setF((x) => (x ? { ...x, links: x.links.filter((_, j) => j !== i) } : x))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Ao encaminhar nesta área, citar (opcional)</Label>
              <Input className="mt-1" value={f.encaminhar_para} placeholder="Ex.: a coordenação de Grupos responde pelo CBZap"
                onChange={(e) => setF((x) => (x ? { ...x, encaminhar_para: e.target.value } : x))} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando} onClick={salvar} className="gap-1.5">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── simulador (não envia nada) ───────────────────────────────────────────
function Simulador({ podeEscrever }: { podeEscrever: boolean }) {
  const [texto, setTexto] = useState('');
  const [telefone, setTelefone] = useState('');
  const [rodando, setRodando] = useState(false);
  const [r, setR] = useState<Simulacao | null>(null);

  async function simular() {
    if (!texto.trim()) return;
    setRodando(true); setR(null);
    try {
      const res: Simulacao = await comunicacao.botIa.simular({ texto, telefone: telefone.replace(/\D/g, '') || undefined });
      setR(res);
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao simular'); }
    finally { setRodando(false); }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-primary" />Testar o bot (não envia nada)</p>
        <p className="text-[11px] text-muted-foreground">Escreva como a pessoa escreveria. Opcional: o telefone de uma conversa real, pra o bot usar o contexto dela (cadastro, grupo, histórico). O teste ignora os tetos do dia.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_200px]">
        <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Oi, como faço pra entrar num grupo?" disabled={!podeEscrever} />
        <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone (opcional)" disabled={!podeEscrever} />
      </div>
      <Button size="sm" className="gap-1.5" disabled={!podeEscrever || rodando || !texto.trim()} onClick={simular}>
        {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Simular
      </Button>
      {r && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={r.acao === 'responder' ? 'default' : r.acao === 'encaminhar' ? 'secondary' : 'outline'}>{ACAO_ROTULO[r.acao] || r.acao}</Badge>
            {r.area && <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400">área · {r.area}</Badge>}
            <span className="text-xs text-muted-foreground">motivo: {rotuloMotivo(r.motivo)}</span>
            {r.conversa && <span className="text-xs text-muted-foreground">· contexto de {r.conversa.nome || 'contato'}{r.conversa.cadastrada ? '' : ' (sem cadastro)'}</span>}
          </div>
          {r.texto ? (
            <div className="rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground whitespace-pre-wrap">{r.texto}</div>
          ) : (
            <p className="text-xs italic text-muted-foreground">Nada seria enviado — a mensagem ficaria só na aba Conversas.</p>
          )}
          {(r.avisos || []).length > 0 && (
            <p className="text-xs text-amber-600">⚠️ Em produção hoje: {(r.avisos || []).map((a) => rotuloMotivo(a)).join(' · ')}.</p>
          )}
          {r.removidos && (r.removidos.links > 0 || r.removidos.telefones > 0) && (
            <p className="text-xs text-amber-600">O modelo tentou incluir {r.removidos.links} link(s) e {r.removidos.telefones} telefone(s) fora da lista — foram apagados da resposta.</p>
          )}
          {r.uso && <p className="text-[11px] text-muted-foreground">{r.uso.input + r.uso.output} tokens · {r.modelo}</p>}
        </div>
      )}
    </Card>
  );
}

// ── varredura mensal do WhatsApp (26/09/2026) ────────────────────────────
// Do que as pessoas falaram com o WhatsApp da igreja no mês, e o que o bot não
// saberia responder. ⚠️ A tela nunca diz "enviado" quando o e-mail não saiu, e
// "erro" sempre vem com o motivo (a lei de 05/08: caixa verde com zero envio).
type TemaVarredura = {
  tema: string; contagem: number; area_sugerida: string; o_bot_saberia: boolean;
  lacuna: string | null; exemplo_ids: string[];
};
type LacunaVarredura = { area: string; lacuna: string; sugestao_conhecimento: string | null };
type Varredura = {
  id: string; periodo: string; status: 'rodando' | 'ok' | 'sem_dados' | 'erro';
  gerado_em: string | null; iniciado_em: string; total_mensagens: number | null; total_conversas: number | null;
  excluidas_pastoral: number | null; excluidas_conversas_cuidados: number | null;
  temas: TemaVarredura[]; lacunas: LacunaVarredura[]; modelo: string | null;
  email_enviado_em: string | null; email_destinos: string[] | null; email_erro: string | null;
  erro: string | null; forcado: boolean;
};
type ExemplosVarredura = {
  periodo: string;
  temas: { tema: string; area_sugerida: string; contagem: number; exemplos: { id: string; criado_em: string; texto: string }[] }[];
};
type ResultadoRodar = { periodo?: string; pulou?: string; status?: string; erro?: string; email?: string; temas?: number };

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function rotuloMes(periodo: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo || '');
  return m ? `${MESES_PT[Number(m[2]) - 1]} de ${m[1]}` : periodo;
}
function dataHora(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
const ERRO_VARREDURA: Record<string, string> = {
  anthropic_sem_credito: 'a conta da Anthropic está sem crédito — a varredura não rodou',
  anthropic_nao_configurada: 'a chave da Anthropic não está configurada no servidor',
  anthropic_chave_invalida: 'a chave da Anthropic foi recusada (inválida ou revogada)',
  modelo_sem_resultado: 'o modelo não devolveu nenhum tema válido',
  modelo_resposta_cortada: 'a resposta do modelo veio cortada (grande demais)',
  sem_destinatarios: 'nenhum e-mail está configurado para receber',
  email_sem_canal: 'o servidor não tem canal de e-mail configurado (o resumo ficou só no sistema)',
};
function rotuloErro(e: string | null | undefined) { return e ? (ERRO_VARREDURA[e] || e) : 'motivo não informado'; }
const PULOU_ROTULO: Record<string, string> = {
  ja_existe: 'já existe varredura deste mês — nada foi refeito',
  em_curso: 'já há uma varredura deste mês rodando agora',
  erro_anterior: 'este mês já falhou antes',
  desligado: 'a varredura está desligada em Comunicação → Envios → Automáticos',
  periodo_invalido: 'período inválido',
  migration_ausente: 'a migration 20260926130000 ainda não foi aplicada',
};

function VarreduraMensal({ podeEscrever }: { podeEscrever: boolean }) {
  const [lista, setLista] = useState<Varredura[] | null>(null);
  const [migrationOk, setMigrationOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exemplos, setExemplos] = useState<ExemplosVarredura | null>(null);
  const [carregandoEx, setCarregandoEx] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await comunicacao.botIa.varreduras();
      setLista(r?.varreduras || []);
      setMigrationOk(r?.migration_ok !== false);
    } catch (e: unknown) {
      setErro((e as Error)?.message || 'Falha ao carregar as varreduras.');
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function rodarAgora() {
    if (!podeEscrever) return;
    if (!confirmando) { setConfirmando(true); return; }
    setConfirmando(false); setRodando(true); setAviso(null);
    try {
      const r: ResultadoRodar = await comunicacao.botIa.rodarVarredura();
      const mes = rotuloMes(r?.periodo || '');
      if (r?.pulou) {
        setAviso(`Varredura de ${mes}: ${PULOU_ROTULO[r.pulou] || r.pulou}.`);
      } else if (r?.status === 'erro') {
        setAviso(`A varredura de ${mes} não rodou: ${rotuloErro(r.erro)}.`);
      } else if (r?.status === 'sem_dados') {
        setAviso(`Não houve mensagem analisável em ${mes} — nada foi enviado.`);
      } else if (r?.status === 'ok') {
        if (r.email === 'enviado') toast.success(`Varredura de ${mes} pronta · ${r.temas ?? 0} tema(s) · e-mail enviado.`);
        else setAviso(`Varredura de ${mes} pronta, mas o e-mail NÃO saiu: ${rotuloErro(r.email)}.`);
      } else if (r?.erro) {
        setAviso(`A varredura falhou: ${rotuloErro(r.erro)}.`);
      }
      await carregar();
    } catch (e: unknown) {
      // ⚠️ Timeout do navegador não prova que nada aconteceu (lei de 04/08): o
      // servidor pode ter terminado. Recarregar a lista diz a verdade.
      setAviso(`Não deu para confirmar o resultado (${(e as Error)?.message || 'erro'}). A varredura pode ter rodado — recarregue a lista antes de tentar de novo.`);
    } finally { setRodando(false); }
  }

  async function verExemplos(periodo: string) {
    if (!podeEscrever) return;
    if (exemplos?.periodo === periodo) { setExemplos(null); return; }
    setCarregandoEx(true);
    try { setExemplos(await comunicacao.botIa.varreduraExemplos(periodo)); }
    catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao buscar os exemplos'); }
    finally { setCarregandoEx(false); }
  }

  const ultima = lista?.[0] || null;
  const anteriores = (lista || []).slice(1);
  const foraUltima = (ultima?.excluidas_pastoral || 0) + (ultima?.excluidas_conversas_cuidados || 0);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><CalendarSearch className="h-4 w-4 text-primary" />Varredura mensal do WhatsApp</p>
          <p className="max-w-3xl text-[11px] text-muted-foreground">
            No dia 1 de cada mês (a partir das 6h), a IA agrupa por tema as mensagens que o WhatsApp da igreja recebeu no mês anterior e aponta o que o bot não saberia responder.
            Conversas de Cuidados e mensagens pastorais ficam de fora; telefones, CPFs e e-mails são mascarados antes. O e-mail leva só temas e contagens.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button>
          {podeEscrever && (
            <Button size="sm" variant={confirmando ? 'default' : 'outline'} className="gap-1.5" disabled={rodando || !migrationOk} onClick={rodarAgora}>
              {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {rodando ? 'Rodando… (até 2 min)' : confirmando ? 'Confirmar: chamar a IA e mandar o e-mail' : 'Rodar agora (mês anterior)'}
            </Button>
          )}
          {confirmando && !rodando && <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>}
        </div>
      </div>

      {aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /><span>{aviso}</span>
        </div>
      )}
      {!migrationOk && (
        <p className="text-xs text-amber-600">⚠️ A migration <code>20260926130000_wa_bot_varreduras.sql</code> ainda não foi aplicada — a varredura não roda.</p>
      )}
      {erro && <p className="text-xs text-red-600">Não foi possível carregar as varreduras: {erro}</p>}
      {lista === null && !erro && <Spinner />}

      {lista !== null && !ultima && migrationOk && (
        <p className="text-sm text-muted-foreground">Nenhuma varredura ainda. A primeira roda sozinha no próximo dia 1, ou pelo botão acima.</p>
      )}

      {ultima && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold capitalize">{rotuloMes(ultima.periodo)}</span>
            <Badge variant={ultima.status === 'ok' ? 'default' : 'outline'}>
              {ultima.status === 'ok' ? 'pronta' : ultima.status === 'sem_dados' ? 'sem mensagens' : ultima.status === 'rodando' ? 'rodando' : 'não rodou'}
            </Badge>
            {ultima.forcado && <span className="text-[11px] text-muted-foreground">· rodada pelo botão</span>}
            <span className="text-[11px] text-muted-foreground">· {dataHora(ultima.gerado_em || ultima.iniciado_em)}</span>
          </div>

          {ultima.status === 'erro' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                {ultima.erro === 'anthropic_sem_credito'
                  ? <><b>A conta da Anthropic está sem crédito — a varredura não rodou.</b> Depois que o crédito voltar, use "Rodar agora" para refazer este mês (o cron não re-tenta sozinho).</>
                  : <>A varredura não rodou: {rotuloErro(ultima.erro)}. Use "Rodar agora" para tentar de novo.</>}
              </span>
            </div>
          )}
          {ultima.status === 'rodando' && <p className="text-xs text-muted-foreground">Rodando desde {dataHora(ultima.iniciado_em)}.</p>}
          {ultima.status === 'sem_dados' && (
            <p className="text-xs text-muted-foreground">
              Não houve mensagem analisável no período
              {foraUltima > 0 ? ` (${foraUltima} mensagem(ns) ficaram de fora por serem pastorais ou de Cuidados)` : ''}.
              Nenhum e-mail foi enviado.
            </p>
          )}

          {(ultima.status === 'ok' || ultima.status === 'sem_dados') && (
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <div><div className="text-muted-foreground">Mensagens recebidas</div><div className="text-base font-semibold tabular-nums">{(ultima.total_mensagens ?? 0).toLocaleString('pt-BR')}</div></div>
              <div><div className="text-muted-foreground">Conversas</div><div className="text-base font-semibold tabular-nums">{(ultima.total_conversas ?? 0).toLocaleString('pt-BR')}</div></div>
              <div><div className="text-muted-foreground">Fora por serem pastorais</div><div className="text-base font-semibold tabular-nums">{(ultima.excluidas_pastoral ?? 0).toLocaleString('pt-BR')}</div></div>
              <div><div className="text-muted-foreground">Fora por serem de Cuidados</div><div className="text-base font-semibold tabular-nums">{(ultima.excluidas_conversas_cuidados ?? 0).toLocaleString('pt-BR')}</div></div>
            </div>
          )}

          {ultima.status === 'ok' && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 text-left font-medium">Tema</th>
                      <th className="px-2 py-1.5 text-right font-medium">Msgs</th>
                      <th className="px-2 py-1.5 text-left font-medium">Área</th>
                      <th className="px-2 py-1.5 text-center font-medium">Bot saberia?</th>
                      <th className="py-1.5 text-left font-medium">O que falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ultima.temas || []).map((t, i) => (
                      <tr key={`${t.tema}-${i}`} className="border-b border-border/60">
                        <td className="py-1.5">{t.tema}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{t.contagem}</td>
                        <td className="px-2 py-1.5">{t.area_sugerida}</td>
                        <td className="px-2 py-1.5 text-center">{t.o_bot_saberia ? 'sim' : <b className="text-red-600">não</b>}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{t.lacuna || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(ultima.lacunas || []).length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">O que escrever no conhecimento do bot</p>
                  <ul className="space-y-1 text-sm">
                    {ultima.lacunas.map((l, i) => (
                      <li key={`${l.area}-${i}`}>
                        <b>{l.area}</b> — {l.lacuna}
                        {l.sugestao_conhecimento && <div className="text-xs text-muted-foreground">Sugestão: {l.sugestao_conhecimento}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className={`text-xs ${ultima.email_enviado_em ? 'text-muted-foreground' : 'text-amber-600'}`}>
                {ultima.email_enviado_em
                  ? <>E-mail enviado em {dataHora(ultima.email_enviado_em)} para {(ultima.email_destinos || []).join(', ')}.</>
                  : <>⚠️ O e-mail NÃO saiu: {rotuloErro(ultima.email_erro)}.</>}
              </p>

              {podeEscrever && (
                <div className="space-y-2">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={carregandoEx} onClick={() => verExemplos(ultima.periodo)}>
                    {carregandoEx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    {exemplos?.periodo === ultima.periodo ? 'Esconder exemplos' : 'Ver exemplos'}
                  </Button>
                  {exemplos?.periodo === ultima.periodo && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-[11px] text-amber-600">São trechos de conversas de pessoas, com telefone, CPF, e-mail e link mascarados. Use para ajustar o conhecimento do bot — não copie para fora do sistema.</p>
                      {exemplos.temas.map((t, i) => (
                        <div key={`${t.tema}-${i}`}>
                          <p className="text-xs font-semibold">{t.tema} <span className="font-normal text-muted-foreground">· {t.area_sugerida}</span></p>
                          {t.exemplos.length === 0
                            ? <p className="text-[11px] italic text-muted-foreground">Os exemplos deste tema não estão mais disponíveis.</p>
                            : (
                              <ul className="ml-3 list-disc text-xs text-muted-foreground">
                                {t.exemplos.map((ex) => <li key={ex.id} className="whitespace-pre-wrap">{ex.texto}</li>)}
                              </ul>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {anteriores.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Meses anteriores</p>
          {anteriores.map((v) => (
            <div key={v.id} className="flex flex-wrap justify-between gap-2 border-b border-border/60 py-1 text-xs last:border-0">
              <span className="capitalize">{rotuloMes(v.periodo)}</span>
              <span className="text-muted-foreground">
                {v.status === 'ok'
                  ? `${(v.temas || []).length} tema(s) · e-mail ${v.email_enviado_em ? 'enviado' : 'não saiu'}`
                  : v.status === 'sem_dados' ? 'sem mensagens' : v.status === 'rodando' ? 'rodando' : `não rodou · ${rotuloErro(v.erro)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
