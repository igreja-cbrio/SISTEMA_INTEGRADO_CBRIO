// Módulo Propostas · ciclo anual de projetos/eventos/rotinas.
// Fase 1A: Configuração. Fase 1B: formulário, filas (líder/diretor), histórico
// e máquina de estados até EM_AVALIACAO.
import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { propostas } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { Plus, Trash2, Save, ClipboardCheck, Settings2, Loader2, Send, ArrowLeft, Check, X, RotateCcw, Paperclip, History, FileText } from 'lucide-react';

type Aux = { ciclos: any[]; areas: { id: number; nome: string }[]; lideresPorArea: Record<string, { id: string; name: string }>; diretor_de: number[]; me: string; nivel: number };
const money = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ESTADO_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_AJUSTE: 'Em ajuste', REPROVADO_AREA: 'Reprovada (área)', EM_AVALIACAO: 'Em avaliação', CANCELADO: 'Cancelada',
  EM_DELIBERACAO: 'Em deliberação', APROVADO: 'Aprovada', EM_ADEQUACAO: 'Em adequação (ressalvas)',
  EM_VERIFICACAO_RESSALVAS: 'Verificando ressalvas', AGUARDANDO_RECURSO: 'Aguardando recurso',
  EM_REAVALIACAO: 'Em reavaliação (recurso)', REPROVADO: 'Reprovada', CONSOLIDADO: 'Consolidada',
};
const estadoCor = (e: string) => ['REPROVADO_AREA', 'CANCELADO', 'REPROVADO'].includes(e) ? 'bg-red-500/15 text-red-600'
  : ['EM_AVALIACAO', 'APROVADO', 'CONSOLIDADO'].includes(e) ? 'bg-emerald-500/15 text-emerald-600'
  : ['EM_AJUSTE', 'EM_ADEQUACAO', 'AGUARDANDO_RECURSO', 'EM_VERIFICACAO_RESSALVAS', 'EM_REAVALIACAO'].includes(e) ? 'bg-amber-500/15 text-amber-600' : 'bg-foreground/10 text-foreground';

const TABS = [
  { id: 'minhas', label: 'Minhas propostas' },
  { id: 'avaliar', label: 'Avaliar', diretor: true },
  { id: 'mural', label: 'Mural da reunião', diretor: true },
  { id: 'config', label: 'Configuração', admin: true },
] as any[];

export default function Propostas() {
  const { getAccessLevel } = useAuth() as any;
  const nivelLocal = typeof getAccessLevel === 'function' ? getAccessLevel(['propostas']) : 5;
  const [aux, setAux] = useState<Aux | null>(null);
  const [tab, setTab] = useState('minhas');
  const [cicloId, setCicloId] = useState('');
  const [view, setView] = useState<{ modo: 'lista' | 'form' | 'detalhe'; id?: string }>({ modo: 'lista' });

  const carregarAux = useCallback(async () => {
    try { const a = await propostas.aux(); setAux(a); setCicloId(prev => prev || (a.ciclos?.[0]?.id ?? '')); }
    catch (e: any) { toast.error(e?.message || 'Erro ao carregar'); }
  }, []);
  useEffect(() => { carregarAux(); }, [carregarAux]);

  const nivel = aux?.nivel ?? nivelLocal;
  const isAdmin = nivel >= 5;

  if (!aux) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;

  const souAvaliador = isAdmin || (aux.diretor_de?.length || 0) > 0;
  const irLista = () => setView({ modo: 'lista' });

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-7 w-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Propostas</h1>
          <p className="text-sm text-muted-foreground">Ciclo anual de projetos, eventos e rotinas</p>
        </div>
        {view.modo === 'lista' && aux.ciclos.length > 0 && (
          <Button onClick={() => setView({ modo: 'form' })}><Plus className="h-4 w-4 mr-1" /> Nova proposta</Button>
        )}
      </div>

      {view.modo === 'lista' && (
        <>
          <div className="flex items-center gap-2 flex-wrap border-b border-border">
            {TABS.filter(t => (!t.admin || isAdmin) && (!t.diretor || souAvaliador)).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.label}
              </button>
            ))}
            <div className="ml-auto min-w-[150px]">
              <Select value={cicloId} onValueChange={setCicloId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Ciclo" /></SelectTrigger>
                <SelectContent className="z-[1001]">{aux.ciclos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.ano}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {tab === 'config' ? <ConfigTab isAdmin={isAdmin} /> :
            tab === 'avaliar' ? <AvaliarTab cicloId={cicloId} /> :
            tab === 'mural' ? <MuralTab cicloId={cicloId} /> :
            <ListaPropostas fila={tab} cicloId={cicloId} onAbrir={(id) => setView({ modo: 'detalhe', id })} />}
        </>
      )}

      {view.modo === 'form' && <PropostaForm aux={aux} cicloId={cicloId} propostaId={view.id} onVoltar={irLista} />}
      {view.modo === 'detalhe' && view.id && <PropostaDetalhe id={view.id} aux={aux} onVoltar={irLista} onEditar={(id) => setView({ modo: 'form', id })} />}
    </div>
  );
}

// ── Lista ────────────────────────────────────────────────────────────────
function ListaPropostas({ fila, cicloId, onAbrir }: { fila: string; cicloId: string; onAbrir: (id: string) => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const params: any = {};
    if (cicloId) params.ciclo_id = cicloId;
    propostas.list(params).then(setLista).catch((e: any) => toast.error(e?.message || 'Erro')).finally(() => setLoading(false));
  }, [fila, cicloId]);
  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>;
  if (!lista.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma proposta aqui ainda.</p>;
  return (
    <div className="space-y-2">
      {lista.map(p => (
        <button key={p.id} onClick={() => onAbrir(p.id)} className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:border-primary/50 transition flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{p.codigo ? `${p.codigo} · ` : ''}{p.titulo || '(sem título)'}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="capitalize">{p.tipo}</span>
              {p.area?.nome && <span>· {p.area.nome}</span>}
              <span>· líquido {money(p.custo_liquido)}</span>
              {p.classificacao_custo && p.classificacao_custo !== 'nao_classificado' && <span>· {p.classificacao_custo}</span>}
            </div>
          </div>
          <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${estadoCor(p.estado)}`}>{ESTADO_LABEL[p.estado] || p.estado}</span>
        </button>
      ))}
    </div>
  );
}

// ── Formulário (criar/editar) ──────────────────────────────────────────────
const OBRIG: Record<string, string[]> = {
  comum: ['titulo', 'area_id', 'descricao_motivacao', 'publico_alvo', 'relevancia', 'pertencimento', 'transformacao', 'impacto_esperado', 'participantes_estimados', 'espacos_necessarios', 'equipes_necessarias', 'custo_total'],
  projeto: ['data_inicio_prevista', 'data_termino_prevista'],
  evento: ['data_realizacao_prevista'],
  rotina: ['frequencia', 'periodo_do_ano'],
};
const FORM0 = () => ({
  tipo: 'projeto', area_id: '', lider_usuario_id: '', titulo: '',
  data_inicio_prevista: '', data_termino_prevista: '', data_realizacao_prevista: '', frequencia: '', periodo_do_ano: '',
  descricao_motivacao: '', publico_alvo: '',
  relevancia: '', pertencimento: '', transformacao: '',
  contribui_visao_cbrio: false, explicacao_visao_cbrio: '',
  impacto_esperado: '', participantes_estimados: '', espacos_necessarios: '', equipes_necessarias: '',
  custo_total: '', arrecadacao_prevista: '',
});

function PropostaForm({ aux, cicloId, propostaId, onVoltar }: { aux: Aux; cicloId: string; propostaId?: string; onVoltar: () => void }) {
  const [f, setF] = useState<any>(FORM0());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!propostaId);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!propostaId) return;
    propostas.get(propostaId).then((p: any) => {
      setF({ ...FORM0(), ...p, area_id: p.area_id ? String(p.area_id) : '', lider_usuario_id: p.lider_usuario_id || '',
        participantes_estimados: p.participantes_estimados ?? '', custo_total: p.custo_total ?? '', arrecadacao_prevista: p.arrecadacao_prevista ?? '' });
    }).catch((e: any) => toast.error(e?.message || 'Erro')).finally(() => setLoading(false));
  }, [propostaId]);

  // Líder da área é sempre derivado da área escolhida (usuario_areas.is_principal)
  // — não é mais um select manual. Reacopla sempre que a área mudar.
  useEffect(() => {
    const lider = f.area_id ? aux.lideresPorArea[f.area_id] : null;
    const novoId = lider?.id || '';
    if (f.lider_usuario_id !== novoId) set('lider_usuario_id', novoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.area_id, aux.lideresPorArea]);

  const custoLiquido = Number(f.custo_total || 0) - Number(f.arrecadacao_prevista || 0);
  const pendentes = useMemo(() => {
    const req = [...OBRIG.comum, ...(OBRIG[f.tipo] || [])];
    const faltando = req.filter(k => { const v = f[k]; return v === '' || v == null; });
    if (f.contribui_visao_cbrio && !String(f.explicacao_visao_cbrio || '').trim()) faltando.push('explicacao_visao_cbrio');
    return faltando.length;
  }, [f]);

  const payload = () => ({
    ...f, ciclo_id: cicloId, area_id: f.area_id ? Number(f.area_id) : null, lider_usuario_id: f.lider_usuario_id || null,
    explicacao_visao_cbrio: f.contribui_visao_cbrio ? f.explicacao_visao_cbrio : null,
  });

  const salvar = async () => {
    if (!f.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    setSaving(true);
    try {
      if (propostaId) { await propostas.atualizar(propostaId, payload()); toast.success('Proposta salva'); }
      else { const p = await propostas.criar(payload()); toast.success(`Proposta ${p.codigo || ''} criada (rascunho)`); }
      onVoltar();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSaving(false); }
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>;
  const isP = f.tipo === 'projeto', isE = f.tipo === 'evento', isR = f.tipo === 'rotina';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right text-xs text-muted-foreground">
            <div>Custo líquido: <b className="text-foreground">{money(custoLiquido)}</b></div>
            <div>{pendentes === 0 ? '✓ tudo preenchido' : `${pendentes} obrigatório(s) pendente(s)`}</div>
          </div>
          <Button onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar rascunho</>}</Button>
        </div>
      </div>

      <Etapa titulo="Apresentação do Projeto">
        <Secao titulo="Apresentação do Projeto">
          <Campo label="Nome do evento/projeto/rotina *"><Input value={f.titulo} onChange={e => set('titulo', e.target.value)} /></Campo>
          <div className="grid grid-cols-3 gap-2">
            {[['projeto', 'Projeto', 'Tem começo, fim e entregas'], ['evento', 'Evento', 'Acontece numa data/período'], ['rotina', 'Rotina', 'Se repete ao longo do ano']].map(([v, t, d]) => (
              <button key={v} onClick={() => set('tipo', v)} className={`text-left rounded-lg border p-3 transition ${f.tipo === v ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                <div className="font-semibold text-sm">{t}</div><div className="text-[11px] text-muted-foreground">{d}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            <Campo label="Área do projeto" cls="flex-1 min-w-[180px]">
              <Select value={f.area_id || '__none__'} onValueChange={v => set('area_id', v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
                <SelectContent className="z-[1001]"><SelectItem value="__none__">—</SelectItem>{aux.areas.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Líder da área" cls="flex-1 min-w-[180px]">
              <Input disabled value={f.area_id ? (aux.lideresPorArea[f.area_id]?.name || 'Nenhum líder definido pra esta área') : 'Escolha a área primeiro'} />
            </Campo>
          </div>
          {isP && <div className="flex gap-3 flex-wrap">
            <Campo label="Começa em" cls="flex-1 min-w-[150px]"><DatePicker value={f.data_inicio_prevista} onChange={(v: string) => set('data_inicio_prevista', v)} /></Campo>
            <Campo label="Termina em" cls="flex-1 min-w-[150px]"><DatePicker value={f.data_termino_prevista} onChange={(v: string) => set('data_termino_prevista', v)} /></Campo>
          </div>}
          {isE && <Campo label="Data"><DatePicker value={f.data_realizacao_prevista} onChange={(v: string) => set('data_realizacao_prevista', v)} /></Campo>}
          {isR && <div className="flex gap-3 flex-wrap">
            <Campo label="Frequência (qtd. de ocorrências)" cls="flex-1 min-w-[150px]">
              <Select value={f.frequencia || '__none__'} onValueChange={v => set('frequencia', v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Frequência" /></SelectTrigger>
                <SelectContent className="z-[1001]"><SelectItem value="__none__">—</SelectItem>{['mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'durante o ano todo'].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Período do ano *" cls="flex-1 min-w-[150px]"><Input value={f.periodo_do_ano} onChange={e => set('periodo_do_ano', e.target.value)} placeholder="Ex.: março a novembro" /></Campo>
          </div>}
          <Campo label="Conte sobre o projeto"><Textarea rows={3} value={f.descricao_motivacao} onChange={e => set('descricao_motivacao', e.target.value)} /></Campo>
          <Campo label="Público-alvo"><Input value={f.publico_alvo} onChange={e => set('publico_alvo', e.target.value)} /></Campo>
        </Secao>
      </Etapa>

      <Etapa titulo="Critérios de avaliação">
        <Secao titulo="Ouriço">
          <Campo label="Relevância"><Textarea rows={2} value={f.relevancia} onChange={e => set('relevancia', e.target.value)} /></Campo>
          <Campo label="Pertencimento"><Textarea rows={2} value={f.pertencimento} onChange={e => set('pertencimento', e.target.value)} /></Campo>
          <Campo label="Transformação (contribuição para algum dos 5 valores)"><Textarea rows={2} value={f.transformacao} onChange={e => set('transformacao', e.target.value)} /></Campo>
        </Secao>

        <Secao titulo="Cultura">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.contribui_visao_cbrio} onChange={e => set('contribui_visao_cbrio', e.target.checked)} /> Esse projeto contribui para a visão CBRio?</label>
          {f.contribui_visao_cbrio && <Campo label="Explique"><Textarea rows={2} value={f.explicacao_visao_cbrio} onChange={e => set('explicacao_visao_cbrio', e.target.value)} /></Campo>}
        </Secao>

        <Secao titulo="Operacional">
          <div className="flex gap-3 flex-wrap">
            <Campo label="Impacto" cls="flex-1 min-w-[150px]">
              <Select value={f.impacto_esperado || '__none__'} onValueChange={v => set('impacto_esperado', v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="z-[1001]"><SelectItem value="__none__">—</SelectItem>{[['baixo', 'Baixo'], ['medio', 'Médio'], ['alto', 'Alto']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo label="Público esperado" cls="flex-1 min-w-[150px]"><Input value={f.participantes_estimados} onChange={e => set('participantes_estimados', e.target.value.replace(/\D/g, ''))} /></Campo>
          </div>
          <Campo label="Espaços necessários"><Textarea rows={2} value={f.espacos_necessarios} onChange={e => set('espacos_necessarios', e.target.value)} /></Campo>
          <Campo label="Equipes necessárias"><Textarea rows={2} value={f.equipes_necessarias} onChange={e => set('equipes_necessarias', e.target.value)} /></Campo>
          <div className="flex gap-3 flex-wrap items-end">
            <Campo label="Custo (R$)" cls="flex-1 min-w-[140px]"><Input type="number" value={f.custo_total} onChange={e => set('custo_total', e.target.value)} /></Campo>
            <Campo label="Expectativa de arrecadação (R$)" cls="flex-1 min-w-[140px]"><Input type="number" value={f.arrecadacao_prevista} onChange={e => set('arrecadacao_prevista', e.target.value)} /></Campo>
            <div className="flex-1 min-w-[140px] text-sm"><div className="text-xs text-muted-foreground">Custo líquido p/ a igreja</div><div className="text-lg font-bold">{money(custoLiquido)}</div></div>
          </div>
        </Secao>
      </Etapa>

      {propostaId && <AnexosPanel propostaId={propostaId} />}
    </div>
  );
}

function Etapa({ titulo, children }: { titulo: string; children: any }) {
  return <div className="space-y-3"><div className="text-sm font-bold text-foreground border-b border-border pb-1.5">{titulo}</div>{children}</div>;
}
function Secao({ titulo, children }: { titulo: string; children: any }) {
  return <div className="rounded-lg border border-border p-4 space-y-3"><div className="text-xs font-semibold uppercase tracking-wide text-primary">{titulo}</div>{children}</div>;
}
function Campo({ label, cls, children }: { label: string; cls?: string; children: any }) {
  return <div className={cls}><label className="text-xs text-muted-foreground block mb-0.5">{label}</label>{children}</div>;
}

function AnexosPanel({ propostaId }: { propostaId: string }) {
  const [lista, setLista] = useState<any[]>([]);
  const [up, setUp] = useState(false);
  const carregar = useCallback(() => { propostas.get(propostaId).then((p: any) => setLista(p.anexos || [])).catch(() => {}); }, [propostaId]);
  useEffect(() => { carregar(); }, [carregar]);
  const enviar = async (e: any) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUp(true);
    try { await propostas.uploadAnexo(propostaId, file); toast.success('Anexo enviado'); carregar(); }
    catch (err: any) { toast.error(err?.message || 'Erro no upload'); } finally { setUp(false); e.target.value = ''; }
  };
  return (
    <Secao titulo="Anexos (orçamentos, propostas de fornecedores)">
      {lista.map(a => (
        <div key={a.id} className="flex items-center gap-2 text-sm"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /><span className="flex-1 truncate">{a.nome}</span>
          <button onClick={async () => { await propostas.removerAnexo(a.id); carregar(); }} className="text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button></div>
      ))}
      <label className="inline-flex items-center gap-2 text-sm text-primary cursor-pointer">
        {up ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} adicionar anexo
        <input type="file" className="hidden" onChange={enviar} accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,.doc,.docx" />
      </label>
    </Secao>
  );
}

// ── Detalhe + transições + histórico ────────────────────────────────────────
function PropostaDetalhe({ id, aux, onVoltar, onEditar }: { id: string; aux: Aux; onVoltar: () => void; onEditar: (id: string) => void }) {
  const [p, setP] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [busy, setBusy] = useState(false);
  const carregar = useCallback(() => {
    propostas.get(id).then(setP).catch((e: any) => toast.error(e?.message || 'Erro'));
    propostas.historico(id).then(setHist).catch(() => {});
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!p) return <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>;

  const me = aux.me; const admin = aux.nivel >= 5;
  const souAutorLider = p.criado_por_usuario_id === me || p.lider_usuario_id === me;
  const souDiretor = admin || (p.area_id && aux.diretor_de.includes(p.area_id));

  const acao = async (a: string, precisaMotivo = false) => {
    let comentario: string | undefined;
    if (precisaMotivo) { comentario = window.prompt('Motivo (obrigatório):') || ''; if (!comentario.trim()) return; }
    setBusy(true);
    try { const r = await propostas.transicao(id, a, comentario); if (r?.ok === false) { toast.error(r.motivo || 'Ação não permitida'); } else { toast.success('Feito'); carregar(); } }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setBusy(false); }
  };

  const acoes: any[] = [];
  if (p.estado === 'RASCUNHO' && (souAutorLider || admin)) { acoes.push(['enviar', 'Enviar', Send, false]); acoes.push(['descartar', 'Descartar', X, false]); }
  if (p.estado === 'EM_AJUSTE' && (souAutorLider || admin)) { acoes.push(['reenviar', 'Reenviar', Send, false]); }
  // Fase 3 · ressalvas + recurso
  if (p.estado === 'EM_ADEQUACAO' && (souAutorLider || admin)) { acoes.push(['enviar_adequacao', 'Enviar adequação', Send, false]); }
  if (p.estado === 'EM_VERIFICACAO_RESSALVAS' && souDiretor) { acoes.push(['ressalvas_atendidas', 'Ressalvas atendidas', Check, false]); acoes.push(['ressalvas_nao_atendidas', 'Não atendidas', RotateCcw, true]); }
  if (p.estado === 'AGUARDANDO_RECURSO' && (souAutorLider || admin)) { acoes.push(['interpor_recurso', 'Interpor recurso', Send, false]); }
  if (p.estado === 'EM_REAVALIACAO' && souDiretor) { acoes.push(['reav_aprovar', 'Aprovar recurso', Check, false]); acoes.push(['reav_ressalvas', 'Aprovar c/ ressalvas', Check, false]); acoes.push(['reav_manter', 'Manter reprovação', X, true]); }
  const podeEditar = ['RASCUNHO', 'EM_AJUSTE'].includes(p.estado) && (souAutorLider || admin);

  const linha = (label: string, v: any) => v ? <div className="text-sm"><span className="text-muted-foreground">{label}: </span>{String(v)}</div> : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${estadoCor(p.estado)}`}>{ESTADO_LABEL[p.estado] || p.estado}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHist(s => !s)}><History className="h-4 w-4 mr-1" /> Histórico</Button>
          {podeEditar && <Button variant="outline" size="sm" onClick={() => onEditar(id)}>Editar</Button>}
        </div>
      </div>

      <Card><CardContent className="pt-5 space-y-2">
        <div className="text-lg font-bold">{p.codigo ? `${p.codigo} · ` : ''}{p.titulo}</div>
        <div className="text-xs text-muted-foreground capitalize">{p.tipo} · {p.area?.nome || 'sem área'} · versão {p.versao}</div>
        <div className="grid md:grid-cols-2 gap-1 pt-2">
          {linha('Conte sobre o projeto', p.descricao_motivacao)}
          {linha('Público-alvo', p.publico_alvo)}
          {linha('Público esperado', p.participantes_estimados)}
          {linha('Custo', money(p.custo_total))}
          {linha('Expectativa de arrecadação', money(p.arrecadacao_prevista))}
          {linha('Custo líquido', money(p.custo_liquido))}
          {linha('Classificação', p.classificacao_custo)}
          {linha('Impacto', p.impacto_esperado)}
        </div>
        {(p.indicadores?.length > 0 || p.anexos?.length > 0) && <div className="text-xs text-muted-foreground pt-1">{p.indicadores?.length || 0} indicador(es) · {p.atividades?.length || 0} atividade(s) · {p.riscos?.length || 0} risco(s) · {p.desembolsos?.length || 0} desembolso(s) · {p.anexos?.length || 0} anexo(s)</div>}
      </CardContent></Card>

      {acoes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {acoes.map(([a, label, Icon, motivo]) => (
            <Button key={a} size="sm" variant={a === 'negar' || a === 'reav_manter' || String(a).startsWith('devolver') || a === 'ressalvas_nao_atendidas' || a === 'descartar' ? 'outline' : 'default'} disabled={busy} onClick={() => acao(a, motivo)}>
              <Icon className="h-4 w-4 mr-1" /> {label}
            </Button>
          ))}
        </div>
      )}

      {p.estado === 'CONSOLIDADO' && <PosEventoPanel id={id} />}

      {showHist && (
        <Card><CardContent className="pt-4 space-y-2">
          <div className="text-sm font-semibold">Histórico</div>
          {hist.map(h => (
            <div key={h.id} className="text-xs border-b border-border/50 pb-1.5">
              <span className="font-medium">{h.acao}</span> · {h.de_estado || '—'} → {h.para_estado}
              <span className="text-muted-foreground"> · {h.ator_nome} · {new Date(h.ocorrido_em).toLocaleString('pt-BR')}</span>
              {h.comentario && <div className="text-muted-foreground italic">"{h.comentario}"</div>}
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}

// ═══ Configuração (Fase 1A) ═══════════════════════════════════════════════
function ConfigTab({ isAdmin }: { isAdmin: boolean }) {
  const [ciclos, setCiclos] = useState<any[]>([]);
  const [selId, setSelId] = useState('');
  const sel = ciclos.find(c => c.id === selId) || null;
  const carregar = useCallback(async () => { try { const cs = await propostas.config.ciclos(); setCiclos(cs || []); setSelId(prev => prev || (cs?.[0]?.id ?? '')); } catch (e: any) { toast.error(e?.message || 'Erro'); } }, []);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <Card><CardContent className="pt-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4 text-primary" /> Configuração do ciclo</div>
      <CiclosBar ciclos={ciclos} selId={selId} onSel={setSelId} isAdmin={isAdmin} onCreated={carregar} />
      {sel ? (
        <div className="space-y-6 pt-2">
          <CicloDatas ciclo={sel} isAdmin={isAdmin} onSaved={carregar} />
          <ParametrosPanel cicloId={sel.id} isAdmin={isAdmin} />
          <CriteriosPanel cicloId={sel.id} isAdmin={isAdmin} />
          <AreasPanel isAdmin={isAdmin} />
        </div>
      ) : <p className="text-sm text-muted-foreground">Nenhum ciclo.{isAdmin ? ' Crie o ciclo do ano acima.' : ''}</p>}
    </CardContent></Card>
  );
}

function CiclosBar({ ciclos, selId, onSel, isAdmin, onCreated }: any) {
  const [novoAno, setNovoAno] = useState(String(new Date().getFullYear() + 1));
  const [saving, setSaving] = useState(false);
  const criar = async () => { setSaving(true); try { const c = await propostas.config.criarCiclo({ ano: Number(novoAno) }); toast.success(`Ciclo ${c.ano} criado`); onCreated(); onSel(c.id); } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSaving(false); } };
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="min-w-[180px]"><label className="text-xs text-muted-foreground">Ciclo</label>
        <Select value={selId} onValueChange={onSel}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent className="z-[1001]">{ciclos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.ano} · {c.estado}</SelectItem>)}</SelectContent></Select></div>
      {isAdmin && <div className="flex items-end gap-2"><div className="w-28"><label className="text-xs text-muted-foreground">Novo ciclo (ano)</label><Input value={novoAno} onChange={e => setNovoAno(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
        <Button size="sm" onClick={criar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Criar</>}</Button></div>}
    </div>
  );
}

function CicloDatas({ ciclo, isAdmin, onSaved }: any) {
  const [f, setF] = useState({ ...ciclo });
  useEffect(() => { setF({ ...ciclo }); }, [ciclo.id]); // eslint-disable-line
  const [saving, setSaving] = useState(false);
  const salvar = async () => { setSaving(true); try { await propostas.config.atualizarCiclo(ciclo.id, { data_abertura_submissao: f.data_abertura_submissao, data_corte_submissao: f.data_corte_submissao, prazo_avaliacao: f.prazo_avaliacao, orcamento_disponivel: f.orcamento_disponivel, estado: f.estado }); toast.success('Ciclo salvo'); onSaved(); } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSaving(false); } };
  const cls = 'flex-1 min-w-[150px]';
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Janela e orçamento</div>
      <div className="flex gap-3 flex-wrap">
        <div className={cls}><label className="text-xs text-muted-foreground">Abertura</label><DatePicker value={f.data_abertura_submissao || ''} onChange={(v: string) => setF({ ...f, data_abertura_submissao: v })} disabled={!isAdmin} /></div>
        <div className={cls}><label className="text-xs text-muted-foreground">Corte</label><DatePicker value={f.data_corte_submissao || ''} onChange={(v: string) => setF({ ...f, data_corte_submissao: v })} disabled={!isAdmin} /></div>
        <div className={cls}><label className="text-xs text-muted-foreground">Prazo de avaliação</label><DatePicker value={f.prazo_avaliacao || ''} onChange={(v: string) => setF({ ...f, prazo_avaliacao: v })} disabled={!isAdmin} /></div>
      </div>
      <div className="flex gap-3 flex-wrap items-end">
        <div className={cls}><label className="text-xs text-muted-foreground">Orçamento (R$)</label><Input type="number" value={f.orcamento_disponivel} onChange={e => setF({ ...f, orcamento_disponivel: Number(e.target.value) })} disabled={!isAdmin} /><span className="text-[11px] text-muted-foreground">{money(f.orcamento_disponivel)}</span></div>
        <div className="min-w-[180px]"><label className="text-xs text-muted-foreground">Estado</label>
          <Select value={f.estado} onValueChange={v => setF({ ...f, estado: v })} disabled={!isAdmin}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1001]">{['configuracao', 'submissao_aberta', 'em_avaliacao', 'em_deliberacao', 'encerrado'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
        {isAdmin && <Button size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar</>}</Button>}
        {isAdmin && <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm('Consolidar o ciclo? As propostas APROVADAS viram projetos/eventos e o ciclo é encerrado.')) return; try { const r = await propostas.consolidarCiclo(ciclo.id); toast.success(`${r.consolidadas} proposta(s) consolidada(s)`); onSaved(); } catch (e: any) { toast.error(e?.message || 'Erro'); } }}>Consolidar ciclo</Button>}
      </div>
    </div>
  );
}

function ParametrosPanel({ cicloId, isAdmin }: any) {
  const [p, setP] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { propostas.config.parametros(cicloId).then(setP).catch(() => {}); }, [cicloId]);
  const salvar = async () => { setSaving(true); try { await propostas.config.salvarParametros(cicloId, p); toast.success('Parâmetros salvos'); } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSaving(false); } };
  const campo = (chave: string, label: string, dica?: string) => (
    <div className="flex-1 min-w-[160px]"><label className="text-xs text-muted-foreground">{label}</label><Input value={p[chave] ?? ''} onChange={e => setP({ ...p, [chave]: e.target.value })} disabled={!isAdmin} />{dica && <span className="text-[11px] text-muted-foreground">{dica}</span>}</div>
  );
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Faixas de custo e parâmetros</div>
      <div className="flex gap-3 flex-wrap">{campo('faixa_custo_baixo_ate', 'Custo Baixo até (R$)')}{campo('faixa_custo_medio_ate', 'Custo Médio até (R$)', 'acima = Alto')}{campo('min_avaliadores', 'Mín. avaliadores')}{campo('prazo_recurso_dias', 'Prazo recurso (dias)')}</div>
      {isAdmin && <Button size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar parâmetros</>}</Button>}
    </div>
  );
}

function CriteriosPanel({ cicloId, isAdmin }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [novo, setNovo] = useState({ nome: '', peso: '1' });
  const carregar = useCallback(() => { propostas.config.criterios(cicloId).then(setLista).catch(() => {}); }, [cicloId]);
  useEffect(() => { carregar(); }, [carregar]);
  const add = async () => { if (!novo.nome.trim()) return; try { await propostas.config.criarCriterio(cicloId, { nome: novo.nome.trim(), peso: Number(novo.peso || 1), ordem: lista.length }); setNovo({ nome: '', peso: '1' }); carregar(); } catch (e: any) { toast.error(e?.message || 'Erro'); } };
  const remover = async (id: string) => { try { await propostas.config.removerCriterio(id); carregar(); } catch (e: any) { toast.error(e?.message || 'Erro'); } };
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Critérios de avaliação (0–5, média ponderada)</div>
      {lista.filter(c => c.ativo).map(c => (<div key={c.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 py-1.5"><span className="flex-1 min-w-0 truncate">{c.nome} <span className="text-muted-foreground">· peso {c.peso}</span></span>{isAdmin && <button onClick={() => remover(c.id)} className="text-red-500 shrink-0 p-1"><Trash2 className="h-4 w-4" /></button>}</div>))}
      {isAdmin && <div className="flex items-end gap-2 pt-1"><div className="flex-1"><label className="text-xs text-muted-foreground">Novo critério</label><Input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} /></div><div className="w-20"><label className="text-xs text-muted-foreground">Peso</label><Input value={novo.peso} onChange={e => setNovo({ ...novo, peso: e.target.value })} /></div><Button size="sm" onClick={add}><Plus className="h-4 w-4" /></Button></div>}
    </div>
  );
}

function AreasPanel({ isAdmin }: any) {
  const [areas, setAreas] = useState<any[]>([]);
  const [aux, setAux] = useState<{ areas: any[]; diretores: any[] }>({ areas: [], diretores: [] });
  const carregar = useCallback(() => { propostas.config.areas().then(setAreas).catch(() => {}); propostas.config.aux().then(setAux).catch(() => {}); }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const mapaCfg = new Map(areas.map((a: any) => [a.area_id, a]));
  const salvar = async (areaId: any, diretor_usuario_id: any, ativa: boolean) => { try { await propostas.config.salvarArea(areaId, { diretor_usuario_id, ativa }); carregar(); } catch (e: any) { toast.error(e?.message || 'Erro'); } };
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Áreas participantes e diretor de cada uma</div>
      <div className="space-y-1.5">{aux.areas.map((area: any) => { const cfg: any = mapaCfg.get(area.id); const diretorId = cfg?.diretor_usuario_id || ''; const ativa = cfg ? cfg.ativa : false; return (
        <div key={area.id} className="flex items-center gap-2 flex-wrap border-b border-border/50 py-1.5">
          <span className="w-40 text-sm font-medium truncate">{area.nome}</span>
          <div className="min-w-[200px] flex-1"><Select value={diretorId || '__none__'} onValueChange={v => isAdmin && salvar(area.id, v === '__none__' ? null : v, ativa || true)} disabled={!isAdmin}><SelectTrigger className="h-8"><SelectValue placeholder="Diretor da área" /></SelectTrigger><SelectContent className="z-[1001]"><SelectItem value="__none__">— sem diretor —</SelectItem>{aux.diretores.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
          {isAdmin && <label className="flex items-center gap-1.5 text-xs shrink-0"><input type="checkbox" checked={ativa} onChange={e => salvar(area.id, diretorId || null, e.target.checked)} /> participa</label>}
        </div>); })}</div>
    </div>
  );
}

// ═══ Fase 2 · Avaliar ═════════════════════════════════════════════════════
function AvaliarTab({ cicloId }: { cicloId: string }) {
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState<string | null>(null);
  const carregar = useCallback(() => { propostas.avaliarFila(cicloId).then(setData).catch((e: any) => toast.error(e?.message || 'Erro')); }, [cicloId]);
  useEffect(() => { carregar(); }, [carregar]);
  if (sel) return <AvaliacaoForm id={sel} onVoltar={() => { setSel(null); carregar(); }} />;
  if (!data) return <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>;
  return (
    <div className="space-y-2 pt-3">
      <p className="text-xs text-muted-foreground">{data.pendentes} proposta(s) faltando você avaliar.</p>
      {data.propostas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma proposta em avaliação neste ciclo.</p>}
      {data.propostas.map((p: any) => (
        <button key={p.id} onClick={() => setSel(p.id)} className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:border-primary/50 transition flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p.codigo ? `${p.codigo} · ` : ''}{p.titulo}</div><div className="text-xs text-muted-foreground capitalize">{p.tipo} · {p.area?.nome || 'sem área'} · líquido {money(p.custo_liquido)}</div></div>
          <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${p.avaliei ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>{p.avaliei ? 'avaliada' : 'pendente'}</span>
        </button>
      ))}
    </div>
  );
}

function AvaliacaoForm({ id, onVoltar }: { id: string; onVoltar: () => void }) {
  const [p, setP] = useState<any>(null);
  const [criterios, setCriterios] = useState<any[]>([]);
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [coment, setComent] = useState('');
  const [enviada, setEnviada] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    propostas.get(id).then(setP).catch(() => {});
    propostas.avaliacao(id).then((a: any) => { setCriterios(a.criterios || []); setNotas(a.notas || {}); setComent(a.avaliacao?.comentario || ''); setEnviada(!!a.avaliacao?.enviada_em); }).catch(() => {});
  }, [id]);
  const salvar = async (enviar: boolean) => {
    if (enviar && !coment.trim()) { toast.error('Comentário obrigatório para enviar'); return; }
    setBusy(true);
    try { const r = await propostas.salvarAvaliacao(id, { comentario: coment, notas, enviar }); if (r?.error) throw new Error(r.error); toast.success(enviar ? 'Avaliação enviada' : 'Rascunho salvo'); onVoltar(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setBusy(false); }
  };
  if (!p) return <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button></div>
      <Card><CardContent className="pt-5 space-y-1">
        <div className="text-lg font-bold">{p.codigo ? `${p.codigo} · ` : ''}{p.titulo}</div>
        <div className="text-xs text-muted-foreground capitalize">{p.tipo} · {p.area?.nome || 'sem área'} · líquido {money(p.custo_liquido)}</div>
        {p.objetivo_geral && <div className="text-sm pt-1"><span className="text-muted-foreground">Objetivo: </span>{p.objetivo_geral}</div>}
        {p.descricao_motivacao && <div className="text-sm"><span className="text-muted-foreground">Descrição: </span>{p.descricao_motivacao}</div>}
      </CardContent></Card>

      {enviada ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">Você já enviou esta avaliação — não pode ser editada (RN08).</div>
      ) : (
        <Card><CardContent className="pt-5 space-y-4">
          <div className="text-sm font-semibold">Sua pontuação (0–5 por critério)</div>
          {criterios.length === 0 && <p className="text-sm text-muted-foreground">Este ciclo não tem critérios cadastrados — cadastre em Configuração.</p>}
          {criterios.map(c => (
            <div key={c.id} className="space-y-1">
              <div className="text-sm font-medium">{c.nome} <span className="text-xs text-muted-foreground">· peso {c.peso}</span></div>
              {c.descricao && <div className="text-xs text-muted-foreground">{c.descricao}</div>}
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setNotas({ ...notas, [c.id]: n })} className={`h-8 w-8 rounded-md border text-sm font-semibold transition ${notas[c.id] === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50'}`}>{n}</button>
                ))}
              </div>
            </div>
          ))}
          <div><label className="text-xs text-muted-foreground">Comentário (obrigatório para enviar)</label><Textarea rows={3} value={coment} onChange={e => setComent(e.target.value)} /></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => salvar(false)} disabled={busy}><Save className="h-4 w-4 mr-1" /> Salvar rascunho</Button>
            <Button size="sm" onClick={() => salvar(true)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Enviar avaliação</>}</Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}

// ═══ Fase 2 · Mural da reunião ════════════════════════════════════════════
function MuralTab({ cicloId }: { cicloId: string }) {
  const [d, setD] = useState<any>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [expand, setExpand] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const carregar = useCallback(() => { propostas.mural(cicloId).then(setD).catch((e: any) => toast.error(e?.message || 'Erro')); }, [cicloId]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!d) return <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…</div>;

  const soma = d.propostas.filter((p: any) => marcadas.has(p.id)).reduce((s: number, p: any) => s + Number(p.custo_liquido || 0), 0);
  const saldo = Number(d.orcamento_disponivel || 0) - soma;
  const toggle = (id: string) => setMarcadas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const nota = (v: any) => v == null ? '—' : Number(v).toFixed(2);
  const decidir = async (id: string, resultado: string) => {
    let ressalvas: string | undefined, motivo: string | undefined;
    if (resultado === 'aprovado_com_ressalvas') { ressalvas = window.prompt('Ressalvas (obrigatório):') || ''; if (!ressalvas.trim()) return; }
    if (resultado === 'devolvido' || resultado === 'reprovado') { motivo = window.prompt('Motivo (obrigatório):') || ''; if (!motivo.trim()) return; }
    setBusy(id);
    try { const r = await propostas.deliberar(id, { resultado, ressalvas, motivo }); if (r?.ok === false) toast.error(r.motivo || 'Não permitido'); else { toast.success('Decisão registrada'); carregar(); } }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setBusy(''); }
  };
  const exportCsv = () => {
    const head = ['Pos', 'Código', 'Título', 'Área', 'Tipo', 'CustoLíquido', 'Classificação', 'NotaOutros', 'NotaDiretorÁrea', 'Avaliadores', 'Complexidade', 'Impacto', 'Ouriço', 'Estado'];
    const rows = d.propostas.map((p: any) => [p.posicao ?? '', p.codigo ?? '', (p.titulo || '').replace(/;/g, ','), p.area || '', p.tipo, p.custo_liquido, p.classificacao_custo || '', p.nota_outros ?? '', p.nota_area ?? '', p.n_avaliadores, p.complexidade || '', p.impacto || '', p.passa_no_ourico ? 'sim' : 'não', p.estado]);
    const csv = [head, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mural-propostas-${cicloId}.csv`; a.click();
  };
  const deliberavel = (e: string) => e === 'EM_AVALIACAO' || e === 'EM_DELIBERACAO';

  return (
    <div className="space-y-3 pt-3">
      {/* faixa fixa de orçamento */}
      <div className={`sticky top-2 z-10 rounded-lg border p-3 flex items-center gap-4 flex-wrap ${saldo < 0 ? 'border-red-500 bg-red-500/10' : 'border-primary/40 bg-primary/5'}`}>
        <div><div className="text-[11px] text-muted-foreground uppercase">Orçamento</div><div className="font-bold">{money(d.orcamento_disponivel)}</div></div>
        <div><div className="text-[11px] text-muted-foreground uppercase">Marcadas ({marcadas.size})</div><div className="font-bold">{money(soma)}</div></div>
        <div><div className="text-[11px] text-muted-foreground uppercase">Saldo</div><div className={`font-bold ${saldo < 0 ? 'text-red-600' : ''}`}>{money(saldo)}</div></div>
        {saldo < 0 && <div className="text-sm font-semibold text-red-600">⚠ Excedeu o orçamento</div>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}><FileText className="h-4 w-4 mr-1" /> Exportar CSV</Button>
      </div>

      {d.propostas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma proposta em avaliação/deliberação neste ciclo.</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="p-2">#</th><th className="p-2">Proposta</th><th className="p-2">Área</th><th className="p-2 text-right">Líquido</th><th className="p-2">Classe</th>
            <th className="p-2 text-right" title="Média dos diretores de outras áreas">Nota (outros)</th><th className="p-2 text-right" title="Nota do diretor da área proponente">Nota (área)</th><th className="p-2 text-center">Aval.</th>
            <th className="p-2 text-center">Aprovar</th><th className="p-2">Decisão</th>
          </tr></thead>
          <tbody>
            {d.propostas.map((p: any) => (
              <Fragment key={p.id}>
                <tr className="border-b border-border/50 align-top">
                  <td className="p-2 font-semibold">{p.posicao ?? '—'}</td>
                  <td className="p-2"><button onClick={() => setExpand(expand === p.id ? null : p.id)} className="text-left hover:text-primary"><div className="font-medium">{p.codigo}</div><div className="text-xs text-muted-foreground truncate max-w-[220px]">{p.titulo}</div></button>
                    <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${estadoCor(p.estado)}`}>{ESTADO_LABEL[p.estado] || p.estado}</span></td>
                  <td className="p-2 text-xs">{p.area || '—'}</td>
                  <td className="p-2 text-right tabular-nums">{money(p.custo_liquido)}</td>
                  <td className="p-2 text-xs">{p.classificacao_custo === 'nao_classificado' ? '—' : p.classificacao_custo}</td>
                  <td className="p-2 text-right tabular-nums">{p.quorum ? nota(p.nota_outros) : <span className="text-amber-600 text-xs">faltam {p.faltam}</span>}</td>
                  <td className="p-2 text-right tabular-nums">{nota(p.nota_area)}</td>
                  <td className="p-2 text-center tabular-nums">{p.n_avaliadores}{d.total_avaliadores ? `/${d.total_avaliadores}` : ''}</td>
                  <td className="p-2 text-center"><input type="checkbox" checked={marcadas.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="p-2">
                    {deliberavel(p.estado) ? (
                      <div className="flex gap-1 flex-wrap">
                        <button disabled={busy === p.id} onClick={() => decidir(p.id, 'aprovado')} className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">Aprovar</button>
                        <button disabled={busy === p.id} onClick={() => decidir(p.id, 'aprovado_com_ressalvas')} className="text-[11px] px-1.5 py-0.5 rounded border border-emerald-600 text-emerald-700">Ressalvas</button>
                        <button disabled={busy === p.id} onClick={() => decidir(p.id, 'devolvido')} className="text-[11px] px-1.5 py-0.5 rounded border border-amber-500 text-amber-600">Devolver</button>
                        <button disabled={busy === p.id} onClick={() => decidir(p.id, 'reprovado')} className="text-[11px] px-1.5 py-0.5 rounded border border-red-500 text-red-600">Reprovar</button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">decidida</span>}
                  </td>
                </tr>
                {expand === p.id && (
                  <tr className="border-b border-border/50 bg-muted/30"><td colSpan={10} className="p-3">
                    <div className="text-xs font-semibold mb-1">Comentários dos avaliadores</div>
                    {p.comentarios.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma avaliação enviada ainda.</div>}
                    {p.comentarios.map((c: any, i: number) => <div key={i} className="text-xs mb-1"><b>{c.diretor}</b> · nota {nota(c.nota)}{c.comentario ? ` — ${c.comentario}` : ''}</div>)}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Nota = média ponderada dos critérios (0–5). O ranking só fecha quando <b>todos os {d.total_avaliadores || 'N'} diretores</b> avaliam a proposta — a decisão fica bloqueada até lá. A classificação de custo é relativa à <b>média</b> dos projetos do ciclo (até as faixas serem definidas). Marcar "Aprovar" só soma no orçamento; a decisão oficial é nos botões de Decisão.</p>
    </div>
  );
}

// ═══ Fase 3 · Pós-evento ═══════════════════════════════════════════════════
function PosEventoPanel({ id }: { id: string }) {
  const [f, setF] = useState<any>({ data_realizacao: '', resultados_obtidos: '', licoes_aprendidas: '', recomendacoes: '', avaliacao_final: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { propostas.posEvento(id).then((d: any) => { if (d) setF({ data_realizacao: d.data_realizacao || '', resultados_obtidos: d.resultados_obtidos || '', licoes_aprendidas: d.licoes_aprendidas || '', recomendacoes: d.recomendacoes || '', avaliacao_final: d.avaliacao_final || '' }); }).catch(() => {}); }, [id]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const salvar = async () => { setSaving(true); try { await propostas.salvarPosEvento(id, f); toast.success('Pós-evento salvo'); } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSaving(false); } };
  return (
    <Secao titulo="Pós-evento (após a realização)">
      <div className="flex gap-3 flex-wrap">
        <Campo label="Data de realização" cls="flex-1 min-w-[150px]"><DatePicker value={f.data_realizacao} onChange={(v: string) => set('data_realizacao', v)} /></Campo>
        <Campo label="Avaliação final" cls="flex-1 min-w-[180px]">
          <Select value={f.avaliacao_final || '__none__'} onValueChange={v => set('avaliacao_final', v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className="z-[1001]"><SelectItem value="__none__">—</SelectItem><SelectItem value="repetir">Repetir</SelectItem><SelectItem value="repetir_com_ajustes">Repetir com ajustes</SelectItem><SelectItem value="nao_repetir">Não repetir</SelectItem></SelectContent>
          </Select>
        </Campo>
      </div>
      <Campo label="Resultados obtidos"><Textarea rows={2} value={f.resultados_obtidos} onChange={e => set('resultados_obtidos', e.target.value)} /></Campo>
      <Campo label="Lições aprendidas"><Textarea rows={2} value={f.licoes_aprendidas} onChange={e => set('licoes_aprendidas', e.target.value)} /></Campo>
      <Campo label="Recomendações"><Textarea rows={2} value={f.recomendacoes} onChange={e => set('recomendacoes', e.target.value)} /></Campo>
      <Button size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar pós-evento</>}</Button>
    </Secao>
  );
}
