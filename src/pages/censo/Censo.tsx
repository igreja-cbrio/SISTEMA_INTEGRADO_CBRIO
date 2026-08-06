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
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import {
  ClipboardList, Plus, Loader2, Copy, Trash2, Save, ArrowLeft,
  Play, Square, ListChecks, BarChart3, Sparkles, Users, HeartHandshake, Lock, Clock,
} from 'lucide-react';

type Stats = {
  pesquisa_id: string; slug: string; titulo: string; tipo: string; status: string;
  total_perguntas: number; iniciadas: number; concluidas: number;
  identificadas: number; anonimas: number; taxa_conclusao: number;
  duracao_media_seg: number | null; ultima_resposta_em: string | null;
};

type Pergunta = { id: string; tipo: string; texto: string; opcoes?: string[]; obrigatoria?: boolean };

type Pesquisa = {
  id: string; slug: string; titulo: string; subtitulo: string | null;
  tipo: string; status: string; perguntas: Pergunta[];
  consentimento_texto: string | null; abre_em: string | null; fecha_em: string | null;
  stats?: Stats | null;
};

type Aux = {
  tipos_pergunta: string[]; tipos_pesquisa: string[];
  consentimento_default: string; nivel: number;
  pode_ver_sensivel?: boolean;
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
  { id: 'pesquisas', label: 'Pesquisas', icon: ListChecks, futuro: false },
  { id: 'cuidado', label: 'Cuidado', icon: HeartHandshake, futuro: false },
  { id: 'cobertura', label: 'Cobertura', icon: BarChart3, futuro: true },
  { id: 'perfil', label: 'Perfil', icon: Users, futuro: true },
  { id: 'ia', label: 'Leitura da IA', icon: Sparkles, futuro: true },
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

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';

export default function Censo() {
  // AuthContext é JSX sem tipos — mesmo acesso que os outros módulos fazem.
  const { getAccessLevel } = useAuth() as { getAccessLevel?: (m: string[]) => number };
  const nivelLocal = typeof getAccessLevel === 'function' ? getAccessLevel(['censo']) : 1;

  const [aux, setAux] = useState<Aux | null>(null);
  const [lista, setLista] = useState<Stats[] | null>(null);
  const [tab, setTab] = useState('pesquisas');
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

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
      const nova: Pesquisa = await censo.criar({ titulo: 'Censo CBRio 2026', tipo: 'censo' });
      toast.success('Pesquisa criada em rascunho');
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
              icon={ClipboardList}
              title="Nenhuma pesquisa ainda"
              description={podeEditar
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
                    <p className="text-[11px] text-muted-foreground">
                      {TIPO_LABEL[p.tipo] || p.tipo} · última resposta {fmtData(p.ultima_resposta_em)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cuidado">
          <AbaCuidado
            pesquisas={lista || []}
            podeVerFila={aux?.pode_ver_sensivel === true}
          />
        </TabsContent>

        {TABS.filter((t) => t.futuro).map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <EmptyState
              icon={t.icon}
              title={`${t.label} — em construção`}
              description="Esta aba entra quando a coleta estiver no ar: os números só fazem sentido com resposta na mesa."
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
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
        icon={HeartHandshake}
        title="Nenhum pedido ainda"
        description="Quando o censo começar a receber respostas, os pedidos de acompanhamento, aconselhamento e oração aparecem aqui."
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
            <EmptyState icon={HeartHandshake} title="Nada nesta fila"
              description="Nenhum pedido com este status." />
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
          <h3 className="font-semibold mb-1">Perguntas</h3>
          <p className="text-sm text-muted-foreground">
            {p.perguntas?.length
              ? `${p.perguntas.length} pergunta(s) configurada(s).`
              : 'Nenhuma pergunta ainda. O construtor de perguntas entra na próxima fase — a pesquisa não abre sem pelo menos uma pergunta válida.'}
          </p>
          {!!p.perguntas?.length && (
            <ol className="mt-3 space-y-1 text-sm list-decimal list-inside">
              {p.perguntas.map((q) => (
                <li key={q.id} className="text-muted-foreground">
                  <span className="text-foreground">{q.texto}</span>
                  <span className="text-[11px] ml-2 font-mono">{q.tipo}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
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
