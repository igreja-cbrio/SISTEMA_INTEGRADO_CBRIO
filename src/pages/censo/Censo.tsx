// Módulo Censo · plataforma de pesquisas da CBRio.
//
// Feito no lugar de contratar a INDECX (R$ 59k) por três razões: cruzar o que a
// pessoa DECLARA com o que ela FAZ (frequência, generosidade, grupo,
// voluntariado — dado que só existe aqui dentro); convicção religiosa é dado
// sensível e não precisa sair de casa; e o módulo serve o censo de 2027, a
// pesquisa de evento e o pulso de grupo, não só este estudo.
//
// F0 (esta entrega): criar, configurar e publicar o questionário.
// F1: coleta pública por QR. F3: dashboards. F4: leitura da IA.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { censo } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmptyState from '@/components/EmptyState';
import AbaCobertura from '@/components/censo/AbaCobertura';
import AbaPerfil from '@/components/censo/AbaPerfil';
import AbaLeituraIA from '@/components/censo/AbaLeituraIA';
import AbaRespostas from '@/components/censo/AbaRespostas';
import QrLinkDialog from '@/components/QrLinkDialog';
import ConstrutorPerguntas from '@/components/censo/ConstrutorPerguntas';
import type { Pergunta as ConstrutorPergunta } from '@/components/censo/ConstrutorPerguntas';
import { toast } from 'sonner';
import {
  ClipboardList, Plus, Loader2, Copy, Trash2, Save, ArrowLeft,
  Play, Square, ListChecks, BarChart3, Sparkles, Users, User, HeartHandshake, Lock, Clock,
  QrCode, Copy as CopyIcon, ExternalLink, AlertTriangle,
} from 'lucide-react';

type Stats = {
  pesquisa_id: string; slug: string; titulo: string; tipo: string; status: string;
  total_perguntas: number; iniciadas: number; concluidas: number;
  identificadas: number; anonimas: number; taxa_conclusao: number;
  duracao_media_seg: number | null; ultima_resposta_em: string | null;
};

// Reusa o tipo do construtor: uma segunda definição aqui divergiria na primeira
// pergunta nova que o motor ganhasse.
type Pergunta = ConstrutorPergunta;

type Pesquisa = {
  id: string; slug: string; titulo: string; subtitulo: string | null;
  tipo: string; status: string; perguntas: Pergunta[];
  consentimento_texto: string | null; abre_em: string | null; fecha_em: string | null;
  stats?: Stats | null;
};

type Aux = {
  tipos_pergunta: string[]; tipos_pesquisa: string[];
  consentimento_default: string; nivel: number;
  /** Ler a RESPOSTA do bloco sensível com nome — só a lista nomeada. */
  pode_ver_sensivel?: boolean;
  /** Operar a FILA de cuidado — lista OU super-admin. São coisas diferentes. */
  pode_ver_cuidado?: boolean;
};

type CuidadoResumo = {
  pesquisa_id: string; tipo: string; total: number; abertos: number;
  em_contato: number; concluidos: number; sem_retorno: number;
  dias_do_mais_antigo: number | null;
};

type CuidadoItem = {
  id: string; tipo: string; status: string; criado_em: string;
  pessoa_nome: string | null; pessoa_contato: string | null; pessoa_email: string | null;
  responsavel_nome: string | null; fora_da_base: boolean; dias_aberto: number;
  observacao: string | null;
};

type Form = { titulo: string; subtitulo: string; tipo: string; slug: string; consentimento_texto: string };

const msg = (e: unknown, fallback: string) =>
  (e instanceof Error && e.message) ? e.message : fallback;

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', aberta: 'Aberta', encerrada: 'Encerrada', arquivada: 'Arquivada',
};
const statusCor = (s: string) =>
  s === 'aberta' ? 'bg-emerald-500/15 text-emerald-600'
  : s === 'encerrada' ? 'bg-amber-500/15 text-amber-600'
  : s === 'arquivada' ? 'bg-foreground/10 text-muted-foreground'
  : 'bg-sky-500/15 text-sky-600';

const TIPO_LABEL: Record<string, string> = {
  censo: 'Censo', pulso: 'Pulso', evento: 'Evento', nps: 'NPS', outro: 'Outro',
};

const TABS = [
  { id: 'pesquisas', label: 'Pesquisas', icon: ListChecks },
  { id: 'respostas', label: 'Respostas', icon: User },
  { id: 'cuidado', label: 'Cuidado', icon: HeartHandshake },
  { id: 'cobertura', label: 'Cobertura', icon: BarChart3 },
  { id: 'perfil', label: 'Perfil', icon: Users },
  { id: 'ia', label: 'Leitura da IA', icon: Sparkles },
];

const CUIDADO_LABEL: Record<string, string> = {
  familiar: 'Acompanhamento familiar',
  aconselhamento: 'Aconselhamento',
  oracao: 'Contato para oração',
  conversa: 'Quer conversar com alguém',
};
const STATUS_CUIDADO: Record<string, string> = {
  aberto: 'Aberto', em_contato: 'Em contato', concluido: 'Concluído', sem_retorno: 'Sem retorno',
};

/**
 * Endereço público do formulário. Montado a partir do host ATUAL, então sai
 * certo em qualquer ambiente sem env nova.
 *
 * ⚠️ Duas armadilhas que já custaram tempo aqui:
 *  · `cbrio.com.br` serve SÓ o site institucional (tem um `path="*"` que joga
 *    tudo para a home), então um link com esse domínio abre o site da igreja em
 *    vez do formulário. O ERP e os formulários públicos vivem em `cbrio.org`.
 *  · URLs `*.vercel.app` têm a proteção de SSO da Vercel ligada (só os domínios
 *    próprios estão isentos), então um QR gerado a partir de um preview leva o
 *    visitante para uma tela de login da Vercel.
 * Por isso o aviso abaixo, em vez de deixar alguém imprimir 500 QRs errados.
 */
function linkPublico(slug: string) {
  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origem}/censo/p/${slug}`;
}

function hostSuspeito() {
  if (typeof window === 'undefined') return null;
  const h = window.location.hostname;
  if (h.includes('vercel.app')) {
    return 'Você está num endereço de pré-visualização da Vercel. Um QR gerado aqui pede login da Vercel para quem escanear — gere pelo endereço de produção.';
  }
  if (h.includes('cbrio.com.br')) {
    return 'O domínio cbrio.com.br serve o site institucional: este link abriria a home da igreja, não o formulário. Use o endereço do sistema (cbrio.org).';
  }
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'Você está em ambiente local — este link só funciona neste computador.';
  }
  return null;
}

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

export default function Censo() {
  // AuthContext é JSX sem tipos — mesmo acesso que os outros módulos fazem.
  const { getAccessLevel } = useAuth() as { getAccessLevel?: (m: string[]) => number };
  const nivelLocal = typeof getAccessLevel === 'function' ? getAccessLevel(['censo']) : 1;

  const [aux, setAux] = useState<Aux | null>(null);
  const [lista, setLista] = useState<Stats[] | null>(null);
  const [tab, setTab] = useState('pesquisas');
  // Qual pesquisa as três abas de análise estão olhando. Nulo até a lista
  // carregar; então cai na primeira, que é a mais recente.
  const [pesquisaAnalise, setPesquisaAnalise] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  // Escolha explícita ganha; senão, a primeira da lista. Sem isto a aba abriria
  // vazia esperando um clique que, com uma única pesquisa, nem tem onde dar.
  const pesquisaEscolhida = pesquisaAnalise || lista?.[0]?.pesquisa_id || null;

  const nivel = aux?.nivel ?? nivelLocal;
  const podeEditar = nivel >= 4;

  const carregar = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([censo.aux(), censo.pesquisas()]);
      setAux(a);
      setLista(l || []);
    } catch (e: unknown) {
      toast.error(msg(e, 'Erro ao carregar o censo'));
      setLista([]);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    setCriando(true);
    try {
      const nova: Pesquisa = await censo.criar({ titulo: 'Nova pesquisa', tipo: 'censo' });
      toast.success('Pesquisa criada em rascunho — dê um nome e monte as perguntas');
      await carregar();
      setAbrindo(nova.id);
    } catch (e: unknown) { toast.error(msg(e, 'Erro ao criar')); }
    finally { setCriando(false); }
  }

  if (abrindo) {
    return (
      <Detalhe
        id={abrindo}
        podeEditar={podeEditar}
        nivel={nivel}
        consentimentoDefault={aux?.consentimento_default || ''}
        tiposPesquisa={aux?.tipos_pesquisa || Object.keys(TIPO_LABEL)}
        onVoltar={() => { setAbrindo(null); carregar(); }}
      />
    );
  }

  return (
    <div className="cbrio-glass-scope max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <ModuleHeader
        icon={ClipboardList}
        title="Censo"
        subtitle="Perfil demográfico e engajamento da comunidade · pesquisas próprias, dado que não sai de casa"
        actions={podeEditar ? (
          <Button onClick={criar} disabled={criando}>
            {criando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Nova pesquisa
          </Button>
        ) : null}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="inline-flex flex-wrap h-auto w-auto bg-transparent p-0 gap-1 border-b border-border rounded-none mb-5">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent"
            >
              <t.icon className="size-3.5 mr-1.5 hidden sm:inline-block" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="pesquisas">
          {lista === null ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : lista.length === 0 ? (
            <EmptyState
              icone={ClipboardList}
              titulo="Nenhuma pesquisa ainda"
              mensagem={podeEditar
                ? 'Crie a primeira pesquisa. Ela nasce em rascunho — você monta as perguntas e só depois abre para respostas.'
                : 'Nenhuma pesquisa foi criada. Fale com quem administra o módulo.'}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {lista.map((p) => (
                <Card
                  key={p.pesquisa_id}
                  className="cursor-pointer transition-colors hover:border-primary/40"
                  onClick={() => setAbrindo(p.pesquisa_id)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{p.titulo}</h3>
                        <p className="text-xs text-muted-foreground font-mono truncate">/{p.slug}</p>
                      </div>
                      <Badge className={statusCor(p.status)} variant="secondary">
                        {STATUS_LABEL[p.status] || p.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <Metrica label="perguntas" valor={p.total_perguntas} />
                      <Metrica label="respostas" valor={p.concluidas} />
                      <Metrica label="conclusão" valor={`${p.taxa_conclusao ?? 0}%`} />
                      <Metrica label="identific." valor={p.identificadas} />
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px] text-muted-foreground">
                        {TIPO_LABEL[p.tipo] || p.tipo} · última resposta {fmtData(p.ultima_resposta_em)}
                      </p>
                      <Compartilhar slug={p.slug} status={p.status} compacto />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cuidado">
          <AbaCuidado
            pesquisas={lista || []}
            podeVerFila={aux?.pode_ver_cuidado === true}
          />
        </TabsContent>

        {/* As três abas de análise compartilham o mesmo seletor de pesquisa: o
            número só quer dizer algo junto com "de qual censo". */}
        {(['respostas', 'cobertura', 'perfil', 'ia'] as const).map((id) => (
          <TabsContent key={id} value={id}>
            <div className="space-y-4">
              {(lista || []).length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(lista || []).map((p) => (
                    <button
                      key={p.pesquisa_id}
                      type="button"
                      onClick={() => setPesquisaAnalise(p.pesquisa_id)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        pesquisaEscolhida === p.pesquisa_id
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p.titulo}
                    </button>
                  ))}
                </div>
              )}
              {id === 'respostas' && (
                <AbaRespostas pesquisaId={pesquisaEscolhida} podeApagar={podeEditar} />
              )}
              {id === 'cobertura' && <AbaCobertura pesquisaId={pesquisaEscolhida} />}
              {id === 'perfil' && <AbaPerfil pesquisaId={pesquisaEscolhida} />}
              {id === 'ia' && <AbaLeituraIA pesquisaId={pesquisaEscolhida} />}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Link público + QR para compartilhar. É o que vai no QR impresso do culto e no
 * WhatsApp. O QR é gerado LOCALMENTE (QrLinkDialog usa a lib `qrcode`), então a
 * URL do censo não passa por servidor de terceiro — diferente do QR de
 * membresia, que usa uma API externa.
 */
function Compartilhar({ slug, status, compacto }: { slug: string; status: string; compacto?: boolean }) {
  const [qrAberto, setQrAberto] = useState(false);
  const link = linkPublico(slug);
  const aviso = hostSuspeito();

  async function copiar(e: React.MouseEvent) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar'); }
  }

  const abrirQr = (e: React.MouseEvent) => { e.stopPropagation(); setQrAberto(true); };

  return (
    <>
      <div className={compacto ? 'flex items-center gap-1.5' : 'space-y-3'}>
        {!compacto && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <code className="flex-1 text-xs font-mono truncate">{link}</code>
              <button type="button" onClick={copiar} title="Copiar link"
                className="text-muted-foreground hover:text-foreground shrink-0">
                <CopyIcon className="size-4" />
              </button>
            </div>
            {aviso && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {aviso}
              </p>
            )}
            {status !== 'aberta' && (
              <p className="text-xs text-muted-foreground">
                A pesquisa está {STATUS_LABEL[status]?.toLowerCase()}: quem abrir o link vê
                um aviso de que ela não está recebendo respostas.
              </p>
            )}
          </>
        )}
        <div className={compacto ? 'flex gap-1.5' : 'flex flex-wrap gap-2'}>
          <Button size={compacto ? 'sm' : 'default'} variant="secondary" onClick={abrirQr}>
            <QrCode className="h-4 w-4 mr-1" /> QR code
          </Button>
          {compacto && (
            <Button size="sm" variant="ghost" onClick={copiar} title="Copiar link">
              <CopyIcon className="h-4 w-4" />
            </Button>
          )}
          <Button size={compacto ? 'sm' : 'default'} variant="ghost" asChild>
            <a href={link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="h-4 w-4 mr-1" /> {compacto ? '' : 'Abrir o formulário'}
            </a>
          </Button>
        </div>
      </div>

      {qrAberto && (
        <QrLinkDialog
          link={link}
          titulo="Censo"
          nomeArquivo={`qr-${slug}`}
          descricao="Aponte a câmera do celular para responder o censo. Baixe o PNG para imprimir ou projetar no telão."
          onClose={() => setQrAberto(false)}
        />
      )}
    </>
  );
}

function Metrica({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums leading-none">{valor}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ── Aba Cuidado · a fila de follow-up dos 4 gatilhos ───────────────────────
//
// A especificação do censo é explícita: o gatilho de cuidado "só tem valor se
// houver retorno para quem pediu". Então isto não é um gráfico — é fila, com
// responsável, status e o tempo de espera à vista.
//
// Quem NÃO está na equipe designada vê apenas as contagens. Não é para esconder
// trabalho: é que um pedido de aconselhamento com nome ao lado é, ele próprio,
// dado sensível. O servidor é quem filtra; aqui só evitamos que a pessoa bata
// num 403 sem entender por quê.
function AbaCuidado({ pesquisas, podeVerFila }: { pesquisas: Stats[]; podeVerFila: boolean }) {
  const comResposta = pesquisas.filter((p) => p.concluidas > 0);
  const [pesquisaId, setPesquisaId] = useState<string>(comResposta[0]?.pesquisa_id || '');
  const [resumo, setResumo] = useState<CuidadoResumo[] | null>(null);
  const [fila, setFila] = useState<CuidadoItem[] | null>(null);
  const [status, setStatus] = useState<string>('aberto');

  const carregar = useCallback(async () => {
    if (!pesquisaId) { setResumo([]); setFila([]); return; }
    try {
      const r: CuidadoResumo[] = await censo.cuidadoResumo(pesquisaId);
      setResumo(r || []);
    } catch { setResumo([]); }
    if (!podeVerFila) { setFila([]); return; }
    try {
      const f: CuidadoItem[] = await censo.cuidado(pesquisaId, status === 'todos' ? {} : { status });
      setFila(f || []);
    } catch { setFila([]); }
  }, [pesquisaId, status, podeVerFila]);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudar(id: string, dados: Record<string, unknown>) {
    try { await censo.cuidadoAtualizar(id, dados); toast.success('Atualizado'); carregar(); }
    catch (e: unknown) { toast.error(msg(e, 'Não foi possível atualizar')); }
  }

  if (!pesquisaId) {
    return (
      <EmptyState
        icone={HeartHandshake}
        titulo="Nenhum pedido ainda"
        mensagem="Quando o censo começar a receber respostas, os pedidos de acompanhamento, aconselhamento e oração aparecem aqui."
      />
    );
  }

  const abertosTotal = (resumo || []).reduce((n, r) => n + r.abertos + r.em_contato, 0);
  const maisAntigo = Math.max(0, ...(resumo || []).map((r) => r.dias_do_mais_antigo || 0));

  return (
    <div className="space-y-4">
      {comResposta.length > 1 && (
        <Select value={pesquisaId} onValueChange={setPesquisaId}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            {comResposta.map((p) => (
              <SelectItem key={p.pesquisa_id} value={p.pesquisa_id}>{p.titulo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Contagens: liberadas para quem tem o módulo, sem PII. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(resumo || []).map((r) => (
          <Card key={r.tipo}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {CUIDADO_LABEL[r.tipo] || r.tipo}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{r.abertos + r.em_contato}</span>
                <span className="text-xs text-muted-foreground">em aberto de {r.total}</span>
              </div>
              {!!r.dias_do_mais_antigo && r.dias_do_mais_antigo > 0 && (
                <p className="mt-1 text-[11px] text-amber-600 flex items-center gap-1">
                  <Clock className="size-3" /> mais antigo há {r.dias_do_mais_antigo} dia(s)
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {abertosTotal > 0 && maisAntigo >= 7 && (
        <p className="text-sm text-amber-600">
          Há pedido esperando há {maisAntigo} dias. Um pedido de ajuda sem retorno é
          pior do que não ter perguntado.
        </p>
      )}

      {!podeVerFila ? (
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <Lock className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Os nomes ficam com a equipe de cuidado.</p>
              <p className="mt-1">
                Um pedido de aconselhamento com nome ao lado é dado sensível, então a lista
                nominal é restrita a quem foi designado para o acompanhamento pastoral. Os
                números acima são a visão completa para o resto da equipe.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-border">
            {['aberto', 'em_contato', 'concluido', 'sem_retorno', 'todos'].map((s) => (
              <button
                key={s} type="button" onClick={() => setStatus(s)}
                className={`px-3 py-2 text-[13px] border-b-2 transition-colors ${
                  status === s ? 'border-b-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'todos' ? 'Todos' : STATUS_CUIDADO[s]}
              </button>
            ))}
          </div>

          {fila === null ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : fila.length === 0 ? (
            <EmptyState icone={HeartHandshake} titulo="Nada nesta fila"
              mensagem="Nenhum pedido com este status." />
          ) : (
            <div className="space-y-2">
              {fila.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{c.pessoa_nome || 'Sem identificação'}</span>
                          {c.fora_da_base && (
                            <Badge variant="secondary" className="bg-amber-500/15 text-amber-600">
                              fora da base
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {CUIDADO_LABEL[c.tipo] || c.tipo}
                          {c.pessoa_contato ? ` · ${c.pessoa_contato}` : ''}
                          {c.dias_aberto > 0 ? ` · há ${c.dias_aberto} dia(s)` : ' · hoje'}
                        </p>
                        {c.responsavel_nome && (
                          <p className="text-xs text-muted-foreground mt-0.5">com {c.responsavel_nome}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {!c.responsavel_nome && c.status === 'aberto' && (
                          <Button size="sm" variant="secondary" onClick={() => mudar(c.id, { assumir: true, status: 'em_contato' })}>
                            Assumir
                          </Button>
                        )}
                        {c.status !== 'concluido' && (
                          <Button size="sm" variant="ghost" onClick={() => mudar(c.id, { status: 'concluido' })}>
                            Concluir
                          </Button>
                        )}
                        {c.status === 'em_contato' && (
                          <Button size="sm" variant="ghost" className="text-muted-foreground"
                            onClick={() => mudar(c.id, { status: 'sem_retorno' })}>
                            Sem retorno
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Detalhe / configuração da pesquisa ─────────────────────────────────────
type DetalheProps = {
  id: string;
  podeEditar: boolean;
  nivel: number;
  consentimentoDefault: string;
  tiposPesquisa: string[];
  onVoltar: () => void;
};

const FORM_VAZIO: Form = { titulo: '', subtitulo: '', tipo: 'censo', slug: '', consentimento_texto: '' };

function Detalhe({ id, podeEditar, nivel, consentimentoDefault, tiposPesquisa, onVoltar }: DetalheProps) {
  const [p, setP] = useState<Pesquisa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<Form>(FORM_VAZIO);

  const carregar = useCallback(async () => {
    try {
      const d: Pesquisa = await censo.pesquisa(id);
      setP(d);
      setForm({
        titulo: d.titulo || '', subtitulo: d.subtitulo || '', tipo: d.tipo,
        slug: d.slug || '', consentimento_texto: d.consentimento_texto || '',
      });
    } catch (e: unknown) { toast.error(msg(e, 'Erro ao carregar')); onVoltar(); }
  }, [id, onVoltar]);
  useEffect(() => { carregar(); }, [carregar]);

  const emRascunho = p?.status === 'rascunho';
  const temResposta = (p?.stats?.iniciadas || 0) > 0;

  const sujo = useMemo(() => {
    if (!p) return false;
    return form.titulo !== (p.titulo || '') || form.subtitulo !== (p.subtitulo || '')
      || form.tipo !== p.tipo || form.slug !== (p.slug || '')
      || form.consentimento_texto !== (p.consentimento_texto || '');
  }, [p, form]);

  async function salvar() {
    setSalvando(true);
    try {
      const d: Pesquisa = await censo.atualizar(id, form);
      setP((prev) => (prev ? { ...prev, ...d } : d));
      toast.success('Salvo');
    } catch (e: unknown) { toast.error(msg(e, 'Erro ao salvar')); }
    finally { setSalvando(false); }
  }

  const [salvandoPerguntas, setSalvandoPerguntas] = useState(false);
  async function salvarPerguntas(perguntas: Pergunta[]) {
    setSalvandoPerguntas(true);
    try {
      // O servidor revalida tudo (ids, condicionais, opções neutras) e é ele
      // quem PRESERVA o id de cada pergunta — a resposta dele é a verdade.
      const d: Pesquisa = await censo.atualizar(id, { perguntas });
      setP((prev) => (prev ? { ...prev, ...d } : d));
      toast.success(`${(d.perguntas || []).filter((q) => q.tipo !== 'secao').length} pergunta(s) salva(s)`);
    } catch (e: unknown) { toast.error(msg(e, 'Não foi possível salvar as perguntas')); }
    finally { setSalvandoPerguntas(false); }
  }

  async function mudarStatus(alvo: string) {
    try {
      const d: Pesquisa = await censo.status(id, alvo);
      setP((prev) => (prev ? { ...prev, ...d } : d));
      toast.success(alvo === 'aberta' ? 'Pesquisa aberta para respostas' : `Status: ${STATUS_LABEL[alvo] || alvo}`);
    } catch (e: unknown) { toast.error(msg(e, 'Não foi possível mudar o status')); }
  }

  async function duplicar() {
    try { await censo.duplicar(id); toast.success('Cópia criada em rascunho'); onVoltar(); }
    catch (e: unknown) { toast.error(msg(e, 'Erro ao duplicar')); }
  }

  async function remover() {
    if (temResposta) { toast.error('Esta pesquisa já tem respostas — encerre em vez de apagar.'); return; }
    try { await censo.remover(id); toast.success('Pesquisa apagada'); onVoltar(); }
    catch (e: unknown) { toast.error(msg(e, 'Erro ao apagar')); }
  }

  if (!p) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="cbrio-glass-scope max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Pesquisas
        </Button>
        <Badge className={statusCor(p.status)} variant="secondary">
          {STATUS_LABEL[p.status] || p.status}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <Campo label="Título">
            <Input
              value={form.titulo}
              disabled={!podeEditar}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
            />
          </Campo>

          <Campo label="Subtítulo" ajuda="Aparece abaixo do título no formulário.">
            <Input
              value={form.subtitulo}
              disabled={!podeEditar}
              onChange={(e) => setForm((f) => ({ ...f, subtitulo: e.target.value }))}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Tipo">
              <Select
                value={form.tipo}
                disabled={!podeEditar}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tiposPesquisa.map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABEL[t] || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo
              label="Endereço (slug)"
              ajuda={emRascunho
                ? 'É o que vai no QR impresso.'
                : 'Travado: o QR já em circulação aponta para este endereço.'}
            >
              <Input
                value={form.slug}
                disabled={!podeEditar || !emRascunho}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </Campo>
          </div>

          <Campo
            label="Texto de consentimento"
            ajuda="Convicção religiosa é dado sensível (LGPD art. 5º II). O texto aceito é gravado junto de cada resposta."
          >
            <Textarea
              rows={4}
              value={form.consentimento_texto}
              disabled={!podeEditar}
              onChange={(e) => setForm((f) => ({ ...f, consentimento_texto: e.target.value }))}
            />
            {podeEditar && consentimentoDefault && !form.consentimento_texto && (
              <button
                type="button"
                className="text-xs text-primary hover:underline mt-1"
                onClick={() => setForm((f) => ({ ...f, consentimento_texto: consentimentoDefault }))}
              >
                usar o texto padrão
              </button>
            )}
          </Campo>

          {podeEditar && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={salvar} disabled={!sujo || salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar
              </Button>
              {p.status === 'rascunho' && (
                <Button variant="secondary" onClick={() => mudarStatus('aberta')}>
                  <Play className="h-4 w-4 mr-1" /> Abrir para respostas
                </Button>
              )}
              {p.status === 'aberta' && (
                <Button variant="secondary" onClick={() => mudarStatus('encerrada')}>
                  <Square className="h-4 w-4 mr-1" /> Encerrar
                </Button>
              )}
              <Button variant="ghost" onClick={duplicar}>
                <Copy className="h-4 w-4 mr-1" /> Duplicar
              </Button>
              {nivel >= 5 && !temResposta && (
                <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={remover}>
                  <Trash2 className="h-4 w-4 mr-1" /> Apagar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-1">Compartilhar</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Este é o endereço que vai no QR impresso do culto e nas mensagens.
          </p>
          <Compartilhar slug={p.slug} status={p.status} />
        </CardContent>
      </Card>

      <CardVinculoPendente pesquisaId={id} podeRodar={podeEditar} />

      <ConstrutorPerguntas
        perguntas={p.perguntas || []}
        respostas={p.stats?.iniciadas || 0}
        podeEditar={podeEditar}
        salvando={salvandoPerguntas}
        onSalvar={salvarPerguntas}
      />
    </div>
  );
}

/**
 * Fila do pós-processamento. Durante o culto a coleta só GRAVA a resposta:
 * medido, o matcher (achar a pessoa na base) mais a correção do cadastro eram 7
 * das 8,3 idas ao banco por resposta — ~17 mil queries de trabalho derivado com
 * 2.500 pessoas esperando a tela. Isto roda depois, e é melhor assim: dá para
 * revisar conflito de cadastro com calma.
 */
function CardVinculoPendente({ pesquisaId, podeRodar }: { pesquisaId: string; podeRodar: boolean }) {
  const [info, setInfo] = useState<{ pendentes: number; com_erro: number } | null>(null);
  const [rodando, setRodando] = useState(false);

  const carregar = useCallback(async () => {
    try { setInfo(await censo.pendentes(pesquisaId)); } catch { setInfo(null); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function rodar() {
    setRodando(true);
    try {
      // Em lotes: um clique não deve tentar processar 2.500 de uma vez.
      let total = 0; let vinculadas = 0; let conflitos = 0; let restantes = 0;
      for (let volta = 0; volta < 20; volta += 1) {
        const r = await censo.posProcessar(pesquisaId);
        total += r.processadas; vinculadas += r.vinculadas;
        conflitos += r.conflitos; restantes = r.restantes;
        if (!r.processadas || !r.restantes) break;
      }
      toast.success(
        `${total} processada(s) · ${vinculadas} vinculada(s) a pessoas`
        + (conflitos ? ` · ${conflitos} conflito(s) de cadastro para revisar` : '')
        + (restantes ? ` · ${restantes} ainda na fila` : ''),
      );
      carregar();
    } catch (e: unknown) { toast.error(msg(e, 'Erro ao processar')); }
    finally { setRodando(false); }
  }

  if (!info || (info.pendentes === 0 && info.com_erro === 0)) return null;

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="font-semibold mb-1">Vínculo com as pessoas</h3>
        <p className="text-sm text-muted-foreground">
          {info.pendentes > 0
            ? `${info.pendentes} resposta(s) aguardando ser ligada(s) à pessoa na base e aplicada(s) ao cadastro.`
            : 'Nenhuma resposta pendente.'}
          {info.com_erro > 0 && ` ${info.com_erro} com erro na última tentativa.`}
        </p>
        <p className="text-[11px] text-muted-foreground mt-2">
          Isto não roda durante a coleta de propósito: no culto, cada consulta a mais
          é a tela demorando para todo mundo.
        </p>
        {podeRodar && (
          <Button className="mt-3" onClick={rodar} disabled={rodando}>
            {rodando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Processar agora
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {children}
      {ajuda && <p className="text-[11px] text-muted-foreground mt-1">{ajuda}</p>}
    </div>
  );
}
