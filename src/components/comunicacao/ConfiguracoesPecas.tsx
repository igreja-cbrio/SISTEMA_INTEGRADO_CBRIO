// Peças da faxina de Configurações (F4 do redesenho · 09/09/2026).
//
//  · Conexao            → substitui a sub-aba Números: card SÓ LEITURA do número em
//                         uso, webhook (o freio de emergência, nível 5), quem responde
//                         e os sinais de vida — com os alertas que a régua pura decide
//                         (backend/utils/conexaoWhatsapp.js).
//  · TesteTemplate      → o "testar disparo pra mim" que morava em Bot → Configuração,
//                         agora embaixo da lista de Templates (é sobre template).
//  · MenuRespondeSozinho → o interruptor "responder sozinho" que morava em Bot →
//                         Configuração, agora no TOPO do Menu do bot (é sobre o menu).
//                         Escreve pelo MESMO endpoint do seletor de três (bot-ia/config),
//                         então nunca desalinha do que a aba IA por área mostra.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Phone, Power, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { comunicacao } from '../../api';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';

// ── Conexão ─────────────────────────────────────────────────────────────────
type Conexao = {
  numero: { phone_number_id: string | null; origem: 'env' | null; waba_id: string | null };
  cadastrados: number;
  webhook: 'ligado' | 'desligado';
  quem_responde: 'ninguem' | 'menu' | 'ia';
  sinais: { inbound_h: number | null; outbound_h: number | null; sync_templates_h: number | null; templates_aprovados: number; templates_total: number };
  alertas: { codigo: string; texto: string }[];
  saude: 'ok' | 'atencao';
  numeros_cadastrados: { id: string; phone_number_id: string; rotulo?: string | null; is_default?: boolean; ativo?: boolean }[];
  config_atualizada_em: string | null;
  avisos: string[];
};
const QUEM: Record<Conexao['quem_responde'], string> = { ninguem: 'Ninguém — só gente responde', menu: 'Menu de setores (bot antigo)', ia: 'IA por área' };
/** "há 2h" · "há 3 d" · "nunca". */
function ha(h: number | null) {
  if (h === null) return 'nunca';
  if (h < 1) return 'há menos de 1h';
  if (h < 48) return `há ${Math.round(h)}h`;
  return `há ${Math.round(h / 24)} d`;
}
function Spinner() { return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>; }
function ErroBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{ margin: 16, padding: 16, background: '#FCEBEB', border: '1px dashed #F09595', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#501313', marginBottom: 4 }}>Não foi possível carregar</div>
      <div style={{ fontSize: 11, color: '#791F1F', marginBottom: 10 }}>{msg}</div>
      <button onClick={onRetry} style={{ background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Tentar de novo</button>
    </div>
  );
}

export function Conexao({ podeNvl5 }: { podeNvl5: boolean }) {
  const [dados, setDados] = useState<Conexao | null>(null);
  const [erro, setErro] = useState(false);
  const [confirmandoDesligar, setConfirmandoDesligar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErro(false); setDados(null);
    comunicacao.conexao.get().then((r: Conexao) => setDados(r)).catch(() => setErro(true));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudarWebhook(ligar: boolean) {
    setSalvando(true);
    try {
      await comunicacao.conexao.salvar({ webhook_ligado: ligar });
      toast.success(ligar ? 'Webhook ligado — as mensagens voltam a entrar no inbox.' : 'Webhook DESLIGADO. Nada do que chegar vai ser registrado até religar.');
      setConfirmandoDesligar(false); carregar();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  if (erro) return <ErroBox msg="Falha ao consultar a conexão." onRetry={carregar} />;
  if (!dados) return <Spinner />;
  const s = dados.sinais;
  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Só leitura: o estado real da conexão com a Meta. O que se configura aqui é um interruptor — o freio de emergência.</p>
        <Button variant="outline" size="sm" onClick={carregar} title="Recarregar"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {dados.avisos.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">Parte do estado não carregou: {dados.avisos.join(' · ')}. O que não veio não é zero.</div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4 text-primary" />Número em uso</div>
            {dados.numero.phone_number_id ? (
              <>
                <div className="mt-1 font-mono text-sm">{dados.numero.phone_number_id}</div>
                <div className="text-[11px] text-muted-foreground">phone_number_id da variável de ambiente (WHATSAPP_PHONE_NUMBER_ID){dados.numero.waba_id ? <> · WABA <span className="font-mono">{dados.numero.waba_id}</span></> : null}</div>
              </>
            ) : <div className="mt-1 text-sm text-red-600">Nenhum número configurado.</div>}
            {dados.cadastrados > 0 && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                {dados.cadastrados} número(s) cadastrado(s) em <span className="font-mono">wa_numeros</span> — o envio ainda não lê o cadastro; com um número só, o inbox não tem seletor.
              </div>
            )}
          </div>
          <Badge variant={dados.saude === 'ok' ? 'outline' : 'destructive'} className={dados.saude === 'ok' ? 'border-emerald-500/40 text-emerald-700' : ''}>
            {dados.saude === 'ok' ? <><CheckCircle2 className="mr-1 h-3 w-3" />saudável</> : <><AlertTriangle className="mr-1 h-3 w-3" />atenção</>}
          </Badge>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Power className="h-4 w-4 text-primary" />Webhook (Bot ativo)</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Freio de emergência: desligado, o webhook inteiro para — as mensagens que chegam <b>deixam de aparecer em Conversas</b>.
              Para só calar o bot, use "quem responde" em Bot → IA por área.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${dados.webhook === 'ligado' ? 'text-emerald-700' : 'text-red-600'}`}>{dados.webhook}</span>
            <Switch checked={dados.webhook === 'ligado'} disabled={!podeNvl5 || salvando}
              onCheckedChange={(v) => { if (v) mudarWebhook(true); else setConfirmandoDesligar(true); }} />
          </div>
        </div>
        {confirmandoDesligar && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">Desligar para de registrar TODA mensagem recebida. Confirma?</span>
            <Button size="sm" variant="destructive" disabled={salvando} onClick={() => mudarWebhook(false)}>Desligar</Button>
            <Button size="sm" variant="outline" disabled={salvando} onClick={() => setConfirmandoDesligar(false)}>Cancelar</Button>
          </div>
        )}
        {!podeNvl5 && <p className="mt-2 text-[11px] text-muted-foreground">Mexer no webhook exige nível 5 no módulo.</p>}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-primary" />Quem responde quem escreve</div>
        <div className="mt-1 text-sm">{QUEM[dados.quem_responde]}</div>
        <p className="text-[11px] text-muted-foreground">Troca-se em Bot → IA por área (seletor de três) ou no topo do Menu do bot.</p>
      </Card>

      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sinais de vida</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div><div className="text-[11px] text-muted-foreground">Última mensagem recebida</div><div className="font-medium">{ha(s.inbound_h)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Último envio da fila</div><div className="font-medium">{ha(s.outbound_h)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Templates sincronizados</div><div className="font-medium">{ha(s.sync_templates_h)}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Templates aprovados</div><div className="font-medium tabular-nums">{s.templates_aprovados} de {s.templates_total}</div></div>
        </div>
      </Card>

      {dados.alertas.length > 0 ? (
        <ul className="space-y-1">
          {dados.alertas.map(a => (
            <li key={a.codigo} className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{a.texto}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Nenhum alerta.</p>
      )}
    </div>
  );
}

// ── Teste de template ───────────────────────────────────────────────────────
const CHAVES_TESTE = [
  { chave: 'pedido_atualizado', rotulo: 'pedido_atualizado (solicitação)' },
  { chave: 'inscricao_confirmada', rotulo: 'inscricao_confirmada' },
  { chave: 'kids_precheckin', rotulo: 'kids_precheckin' },
  { chave: 'kids_vinculo', rotulo: 'kids_vinculo' },
  { chave: 'batismo_lembrete', rotulo: 'batismo_lembrete' },
  { chave: 'aniversario', rotulo: 'aniversario (Marketing · exige opt-in)' },
];
const MOTIVO_SKIP: Record<string, string> = {
  template_nao_configurado: 'Env do template não setado na Vercel (ou sem redeploy).',
  sem_telefone: 'Seu membro está sem telefone.',
  sem_optin: 'Você não está com opt-in (template de Marketing).',
  wpp_nao_configurado: 'Token/número do WhatsApp não configurado.',
};
export function TesteTemplate({ podeTestar }: { podeTestar: boolean }) {
  const [chave, setChave] = useState('pedido_atualizado');
  const [testando, setTestando] = useState(false);
  async function testar() {
    setTestando(true);
    try {
      const r = await comunicacao.templates.testar(chave);
      if (r?.ok) toast.success('Enviado! Confira seu WhatsApp.');
      else {
        const skipped = r?.resultado?.skipped as string | undefined;
        const motivo = r?.motivo || (skipped && MOTIVO_SKIP[skipped]) || JSON.stringify(r?.resultado || {});
        toast.error(`Não enviou: ${motivo}`, { duration: 9000 });
      }
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro no teste'); }
    finally { setTestando(false); }
  }
  return (
    <Card className="mt-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Send className="h-4 w-4 text-primary" />Testar um template no MEU WhatsApp</p>
          <p className="text-xs text-muted-foreground">Envia o template escolhido para você e diz o motivo se não sair — valida o env do template e o redeploy. Chaves do <code>notificarMembro</code>, não o catálogo inteiro.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={chave} onChange={(e) => setChave(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={!podeTestar}>
            {CHAVES_TESTE.map(c => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
          </select>
          <Button size="sm" onClick={testar} disabled={!podeTestar || testando} className="gap-1.5">
            {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar teste pra mim
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── "Responder sozinho" no topo do Menu ─────────────────────────────────────
type CfgBot = { modo: 'ninguem' | 'menu' | 'ia'; menu_ligado: boolean };
export function MenuRespondeSozinho({ podeEscrever }: { podeEscrever: boolean }) {
  const [cfg, setCfg] = useState<CfgBot | null>(null);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => {
    setErro(false);
    comunicacao.botIa.config().then((r: CfgBot) => setCfg(r)).catch(() => setErro(true));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudar(ligar: boolean) {
    setSalvando(true);
    try {
      const r = await comunicacao.botIa.salvarConfig({ modo: ligar ? 'menu' : 'ninguem' });
      setCfg((c) => (c ? { ...c, modo: r?.modo || (ligar ? 'menu' : 'ninguem'), menu_ligado: ligar } : c));
      toast.success(ligar ? 'Menu de setores ligado — o bot volta a responder quem escreve.' : 'Ninguém responde sozinho — só gente. As mensagens continuam chegando em Conversas.');
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Erro ao mudar'); }
    finally { setSalvando(false); }
  }

  if (erro) return <Card className="mb-3 p-3 text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />Não deu para ler quem responde agora. <button className="underline" onClick={carregar}>Tentar de novo</button></Card>;
  if (!cfg) return null;
  return (
    <Card className="mb-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Bot className="h-4 w-4 text-primary" />O menu responde sozinho a quem escreve</p>
          <p className="text-xs text-muted-foreground">
            {cfg.modo === 'ia'
              ? <>A <b>IA por área</b> está respondendo agora. O menu só volta trocando o modo em Bot → IA por área.</>
              : <>Desligado, ninguém recebe o menu de setores — as mensagens continuam chegando em Conversas para a equipe responder. Os disparos (grupos, censo, inscrições…) <b>não</b> são afetados.</>}
          </p>
        </div>
        {cfg.modo === 'ia'
          ? <Badge>IA por área</Badge>
          : <Switch checked={cfg.modo === 'menu'} disabled={!podeEscrever || salvando} onCheckedChange={mudar} />}
      </div>
    </Card>
  );
}
