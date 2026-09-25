// =====================================================================
// Execução do Planejamento · aba Fases (Kanban)
// =====================================================================
// Substitui o stepper horizontal que Projetos usa (src/pages/Projetos.jsx)
// por colunas Kanban por STATUS (pendente/em-andamento/concluida/bloqueada
// — mesmo vocabulário fixo de PHASE_STATUS_MAP/TASK_STATUS_MAP de lá), com
// cada card mostrando a fase a que pertence (badge) via o mesmo matching
// heurístico de `getTasksForPhase` (Projetos.jsx:1568).
//
// Drag-and-drop reaproveita o padrão JÁ TESTADO do Marketing
// (src/lib/arrastoKanban.ts + src/pages/marketing/useArrastoKanban.js —
// pointer events, limiar clique×arrasto, auto-scroll) em vez do HTML5
// nativo de Projetos.jsx, documentado como quebrado em touch/mobile.
//
// ⚠️ `cycle_phase_tasks.status` usa o MESMO vocabulário hifenizado de
// `project_tasks` (pendente/em-andamento/concluida/bloqueada — conferido
// contra o CHECK constraint vivo no banco, não deduzido de comentário
// antigo). Não existe tradução a_fazer/em_andamento aqui: as 4 colunas
// deste Kanban servem os dois vínculos sem normalização.
//
// Criação/edição de tarefa (+ Tarefa): para PROJETO, `project_tasks` não tem
// coluna de fase — a associação é a mesma heurística de texto que
// Projetos.jsx já lê (`descrição contém "Fase: <nome>"`), só que agora
// escrita pelo formulário via um seletor de fase, em vez de exigir que
// alguém digite a marca à mão. Para EVENTO, `cycle_phase_tasks.event_phase_id`
// é FK real — o seletor grava o id da fase diretamente.
// =====================================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Lock, Plus } from 'lucide-react';
import { projects as projectsApi, cycles as cyclesApi, planejamentoAnual as planApi } from '../../api';
import { C, cardStyle, btn, hint } from '../planejamentoAnual/comum';
import { useArrastoKanban } from '../marketing/useArrastoKanban';
import FaseStepper from '../../components/FaseStepper';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

const COLUNAS = [
  { key: 'pendente', label: 'Pendente', cor: C.t3 },
  { key: 'em-andamento', label: 'Em andamento', cor: C.blue },
  { key: 'concluida', label: 'Concluída', cor: C.green },
  { key: 'bloqueada', label: 'Bloqueada', cor: C.red },
];

// Mesmas 7 fases fixas de Projetos.jsx (PHASE_NAMES/PHASE_ABBREVS) — projeto
// sempre nasce com elas via initPhases(). Evento usa as fases do PRÓPRIO
// ciclo criativo (número variável, nome vem de cycle_phase_templates), então
// a abreviação ali é derivada do nome.
const PHASE_NAMES_PROJETO = ['Concepção', 'Planejamento', 'Mobilização', 'Comunicação', 'Execução', 'Monitoramento', 'Encerramento'];
const PHASE_ABBREVS_PROJETO = ['CON', 'PLA', 'MOB', 'COM', 'EXE', 'MON', 'ENC'];

function abrevDoNome(nome) {
  const limpo = (nome || '').trim();
  if (!limpo) return '???';
  return limpo.slice(0, 3).toUpperCase();
}

// Status da fase é DERIVADO das tarefas vinculadas a ela (mesmo agrupamento
// que já alimenta os cards do Kanban), não de uma coluna de status da fase —
// para evento, `event_cycle_phases.status` fica parado em 'pendente' desde a
// criação (nada no backend a atualiza); para projeto o campo existe mas
// pode ficar desalinhado do que as tarefas realmente mostram.
function statusDaFase(nomeFase, cards) {
  const itens = cards.filter((c) => c.fase === nomeFase);
  if (itens.length === 0) return 'pendente';
  if (itens.every((c) => c.status === 'concluida')) return 'concluida';
  if (itens.some((c) => c.status === 'bloqueada')) return 'bloqueada';
  if (itens.some((c) => c.status === 'em-andamento' || c.status === 'concluida')) return 'em-andamento';
  return 'pendente';
}

// Vocabulário de status já é o das 4 colunas — vale pros dois vínculos.
function statusDeTarefa(t) { return COLUNAS.some((c) => c.key === t.status) ? t.status : 'pendente'; }

// Mesma heurística de Projetos.jsx:1568 (getTasksForPhase), invertida: pra
// CADA tarefa, acha a 1ª fase cujo critério bate (descrição "Fase: X" ou
// sobreposição de datas).
function faseDaTarefaProjeto(t, fases) {
  for (const ph of fases) {
    const nome = ph.name || '';
    const phStart = ph.date_start || ph.start_date;
    const phEnd = ph.date_end || ph.end_date;
    if (t.description && nome && t.description.includes('Fase: ' + nome)) return nome;
    if (phStart && phEnd && (t.start_date || t.deadline)) {
      const tStart = t.start_date || t.deadline;
      const tEnd = t.deadline || t.start_date;
      if (tStart && tEnd && tStart <= phEnd && tEnd >= phStart) return nome;
    }
  }
  return null;
}

function faseDaTarefaEvento(t, fases) {
  const f = fases.find((ph) => ph.id === t.event_phase_id);
  return f ? (f.nome_fase || `Fase ${f.numero_fase}`) : null;
}

// ── Fase ↔ Tarefa (formulário "+ Tarefa") ───────────────────────────────
// Sentinela do <Select> pra "sem fase" — Radix não aceita SelectItem com
// value="". Só existe pro lado PROJETO: evento sempre exige uma fase real
// (event_phase_id é NOT NULL em cycle_phase_tasks).
const SEM_FASE = '__sem_fase__';

const PRIORIDADE_PROJETO = [
  { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' }, { valor: 'urgente', rotulo: 'Urgente' },
];
// cycle_phase_tasks_prioridade_check só aceita estes 3 (sem "urgente").
const PRIORIDADE_EVENTO = [
  { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'normal', rotulo: 'Normal' }, { valor: 'alta', rotulo: 'Alta' },
];
// cycle_phase_tasks_area_check — lista fechada, conferida no banco.
const AREA_EVENTO_OPCOES = [
  { valor: 'marketing', rotulo: 'Marketing' }, { valor: 'adm', rotulo: 'Administrativo' },
  { valor: 'compras', rotulo: 'Compras' }, { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'manutencao', rotulo: 'Manutenção' }, { valor: 'limpeza', rotulo: 'Limpeza' },
  { valor: 'cozinha', rotulo: 'Cozinha' }, { valor: 'producao', rotulo: 'Produção' },
];

function normDate(d) { return d ? String(d).slice(0, 10) : ''; }

// Projeto não tem coluna de fase — lê/escreve a marca "Fase: <nome>" no
// início da descrição (mesma convenção que Projetos.jsx já entende).
function extrairFaseEDescricao(descricaoBruta, nomesFases) {
  const desc = descricaoBruta || '';
  for (const nome of nomesFases) {
    const marca = `Fase: ${nome}`;
    if (desc === marca) return { fase: nome, resto: '' };
    if (desc.startsWith(marca + '\n')) return { fase: nome, resto: desc.slice(marca.length + 1) };
  }
  return { fase: null, resto: desc };
}
function montarDescricaoComFase(faseNome, resto) {
  const corpo = (resto || '').trim();
  if (!faseNome) return corpo;
  return corpo ? `Fase: ${faseNome}\n${corpo}` : `Fase: ${faseNome}`;
}

export default function FasesKanban({ proposta, onMaterializado }) {
  const vinculo = proposta.vinculo || { tipo: null, id: null };
  const [carregando, setCarregando] = useState(Boolean(vinculo.tipo));
  const [cards, setCards] = useState([]); // {id, titulo, status, fase}
  const [fasesBrutas, setFasesBrutas] = useState([]); // fases cruas do vínculo (projeto.phases | ciclo.phases)
  const [faseSelecionada, setFaseSelecionada] = useState(null);
  const [materializando, setMaterializando] = useState(false);
  const [iniciandoFases, setIniciandoFases] = useState(false);
  const [modalTarefa, setModalTarefa] = useState(null); // null fechado · {} nova · {...raw} editar
  const [salvandoTarefa, setSalvandoTarefa] = useState(false);
  const containerRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!vinculo.tipo) { setCards([]); setFasesBrutas([]); return; }
    setCarregando(true);
    try {
      if (vinculo.tipo === 'projeto') {
        const proj = await projectsApi.get(vinculo.id);
        const fases = proj?.phases || [];
        const tarefas = proj?.tasks || [];
        setFasesBrutas([...fases].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
        setCards(tarefas.map((t) => ({
          id: t.id, titulo: t.title || t.name || 'Tarefa',
          status: statusDeTarefa(t), fase: faseDaTarefaProjeto(t, fases), raw: t,
        })));
      } else {
        const ciclo = await cyclesApi.get(vinculo.id);
        const fases = ciclo?.phases || [];
        const tarefas = ciclo?.tasks || [];
        setFasesBrutas([...fases].sort((a, b) => (a.numero_fase || 0) - (b.numero_fase || 0)));
        setCards(tarefas.map((t) => ({
          id: t.id, titulo: t.titulo || 'Tarefa',
          status: statusDeTarefa(t), fase: faseDaTarefaEvento(t, fases), raw: t,
        })));
      }
    } catch {
      toast.error('Erro ao carregar as fases do vínculo');
    } finally { setCarregando(false); }
  }, [vinculo.tipo, vinculo.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setFaseSelecionada(null); }, [vinculo.tipo, vinculo.id]);

  // Fases resolvidas para o stepper: {id, nome, abrev, status}. Projeto usa
  // os 7 nomes/abreviações fixos (por posição, como o stepper de /projetos);
  // evento usa nome_fase do próprio ciclo, com abreviação derivada.
  const fasesStepper = useMemo(() => {
    if (fasesBrutas.length === 0) return [];
    if (vinculo.tipo === 'projeto') {
      return fasesBrutas.map((f, i) => {
        const nome = f.name || PHASE_NAMES_PROJETO[i] || `Fase ${i + 1}`;
        return { id: f.id, nome, abrev: PHASE_ABBREVS_PROJETO[i] || abrevDoNome(nome), status: statusDaFase(nome, cards) };
      });
    }
    return fasesBrutas.map((f) => {
      const nome = f.nome_fase || `Fase ${f.numero_fase}`;
      return { id: f.id, nome, abrev: abrevDoNome(nome), status: statusDaFase(nome, cards) };
    });
  }, [fasesBrutas, cards, vinculo.tipo]);

  // Projetos materializados ANTES desta correção (ou que por algum motivo
  // ficaram sem fase) não têm o que o stepper desenhe — oferece o mesmo
  // "Iniciar Fases" de Projetos.jsx em vez de deixar a aba só com o Kanban
  // vazio e sem explicação.
  const iniciarFasesPadrao = useCallback(async () => {
    if (vinculo.tipo !== 'projeto') return;
    setIniciandoFases(true);
    try {
      for (let i = 0; i < PHASE_NAMES_PROJETO.length; i++) {
        await projectsApi.createPhase(vinculo.id, { name: PHASE_NAMES_PROJETO[i], phase_order: i + 1, status: 'pendente' });
      }
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível iniciar as fases do projeto');
    } finally { setIniciandoFases(false); }
  }, [vinculo.tipo, vinculo.id, carregar]);

  const nomeDaFaseSelecionada = faseSelecionada
    ? fasesStepper.find((f) => f.id === faseSelecionada)?.nome
    : null;

  const moverCard = useCallback(async (cardId, novoEstado) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (novoEstado === null) { setModalTarefa(card.raw || { id: cardId }); return; } // foi um toque — abre pra editar
    if (card.status === novoEstado) return;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, status: novoEstado } : c)));
    try {
      if (vinculo.tipo === 'projeto') {
        await projectsApi.updateTaskStatus(cardId, novoEstado);
      } else {
        await cyclesApi.updateTask(cardId, { status: novoEstado });
      }
    } catch (e) {
      toast.error(e.message || 'Não foi possível mover o card');
      carregar();
    }
  }, [cards, vinculo.tipo, carregar]);

  const abrirNovaTarefa = useCallback(() => {
    if (vinculo.tipo === 'projeto') {
      setModalTarefa({ faseValor: nomeDaFaseSelecionada || SEM_FASE });
    } else {
      setModalTarefa({ event_phase_id: faseSelecionada || fasesStepper[0]?.id || '' });
    }
  }, [vinculo.tipo, nomeDaFaseSelecionada, faseSelecionada, fasesStepper]);

  const salvarTarefa = useCallback(async (form) => {
    setSalvandoTarefa(true);
    try {
      if (vinculo.tipo === 'projeto') {
        const payload = {
          name: form.name,
          responsible: form.responsible || '',
          start_date: form.start_date || null,
          deadline: form.deadline || null,
          status: form.status || 'pendente',
          priority: form.priority || 'media',
          description: montarDescricaoComFase(form.faseValor === SEM_FASE ? null : form.faseValor, form.descricao),
        };
        if (form.id) await projectsApi.updateTask(form.id, payload);
        else await projectsApi.createTask(vinculo.id, payload);
      } else {
        const payload = {
          event_id: vinculo.id,
          event_phase_id: form.event_phase_id,
          titulo: form.titulo,
          area: form.area,
          prazo: form.prazo || null,
          responsavel_nome: form.responsavel_nome || '',
          status: form.status || 'pendente',
          prioridade: form.prioridade || 'baixa',
          descricao: form.descricao || '',
        };
        if (form.id) await cyclesApi.updateTask(form.id, payload);
        else await cyclesApi.createTask(payload);
      }
      setModalTarefa(null);
      toast.success(form.id ? 'Tarefa atualizada' : 'Tarefa criada');
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar a tarefa');
    } finally { setSalvandoTarefa(false); }
  }, [vinculo.tipo, vinculo.id, carregar]);

  const excluirTarefa = useCallback(async (taskId) => {
    setSalvandoTarefa(true);
    try {
      if (vinculo.tipo === 'projeto') await projectsApi.removeTask(taskId);
      else await cyclesApi.deleteTask(taskId);
      setModalTarefa(null);
      toast.success('Tarefa excluída');
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível excluir a tarefa');
    } finally { setSalvandoTarefa(false); }
  }, [vinculo.tipo, carregar]);

  const arrastoK = useArrastoKanban({ onMover: moverCard, habilitado: Boolean(vinculo.tipo) });

  const colunas = useMemo(() => {
    const base = nomeDaFaseSelecionada ? cards.filter((c) => c.fase === nomeDaFaseSelecionada) : cards;
    return COLUNAS.map((col) => ({ ...col, itens: base.filter((c) => c.status === col.key) }));
  }, [cards, nomeDaFaseSelecionada]);

  // ── Vínculo ainda não existe: estado vazio + CTA de materializar ──────
  if (!vinculo.tipo) {
    const tipoAlvo = proposta.natureza; // 'projeto' | 'evento' (rotina não chega aqui)
    const rotuloTipo = tipoAlvo === 'projeto' ? 'Projeto' : 'Evento';
    const podeMaterializar = proposta.no_calendario;

    const materializar = async () => {
      setMaterializando(true);
      try {
        await planApi.execucao.materializar(proposta.id, tipoAlvo);
        toast.success(`${rotuloTipo} vinculado criado`);
        onMaterializado?.();
      } catch (e) {
        toast.error(e.message || `Não foi possível criar o ${rotuloTipo.toLowerCase()} vinculado`);
      } finally { setMaterializando(false); }
    };

    return (
      <div style={{ ...cardStyle, padding: 32, textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
        <Lock size={28} color={C.t3} />
        <p style={{ margin: 0, fontSize: 14, color: C.t2, maxWidth: 420 }}>
          Esta proposta ainda não tem {rotuloTipo.toLowerCase()} vinculado. A criação só fica disponível depois
          que a proposta entra no calendário.
        </p>
        <button
          style={btn(podeMaterializar ? 'primary' : 'ghost')}
          disabled={!podeMaterializar || materializando}
          title={podeMaterializar ? undefined : 'A proposta ainda não entrou no calendário (ressalva pendente de verificação, ou fora do estado aprovado)'}
          onClick={materializar}
        >
          {materializando ? 'Criando…' : `Criar ${rotuloTipo} vinculado`}
        </button>
        {!podeMaterializar && (
          <p style={{ ...hint, maxWidth: 420 }}>
            Aguardando calendário — se a proposta foi aprovada com ressalvas, o Pastor precisa marcar a ressalva
            como verificada antes de ela entrar no calendário.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {carregando ? (
        <p style={{ fontSize: 13, color: C.t3 }}>Carregando fases…</p>
      ) : (
        <>
          {fasesStepper.length > 0 ? (
            <div style={cardStyle}>
              <FaseStepper fases={fasesStepper} selecionada={faseSelecionada} onSelecionar={setFaseSelecionada} />
              {faseSelecionada && (
                <div style={{ textAlign: 'center', paddingBottom: 8 }}>
                  <button style={btn('ghost')} onClick={() => setFaseSelecionada(null)}>
                    Mostrar todas as fases
                  </button>
                </div>
              )}
            </div>
          ) : vinculo.tipo === 'projeto' && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 16 }}>
              <p style={{ ...hint, margin: '0 0 8px' }}>Este projeto ainda não tem as fases iniciadas.</p>
              <button style={btn('primary')} onClick={iniciarFasesPadrao} disabled={iniciandoFases}>
                {iniciandoFases ? 'Iniciando…' : 'Iniciar Fases (7 fases)'}
              </button>
            </div>
          )}
        {fasesStepper.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ ...hint, margin: 0 }}>Clique num card pra editar · arraste pra mudar o status.</p>
            <button style={{ ...btn('primary'), padding: '5px 11px', fontSize: 12 }} onClick={abrirNovaTarefa}>
              <Plus size={13} /> Tarefa
            </button>
          </div>
        )}
        <div
          ref={arrastoK.containerRef}
          className={`flex gap-3 overflow-x-auto pb-2 ${arrastoK.arrastando ? 'select-none' : ''}`}
        >
          {colunas.map((col) => (
            <div
              key={col.key}
              data-coluna={col.key}
              style={{
                flex: '0 0 240px', width: 240, borderRadius: 12,
                background: 'var(--cbrio-bg)', border: arrastoK.colunaSobre === col.key ? `2px solid ${C.primary}` : '1px solid var(--hairline)',
                display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 380px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.cor }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{col.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3, background: 'var(--cbrio-card)', borderRadius: 999, padding: '1px 7px' }}>{col.itens.length}</span>
              </div>
              <div style={{ overflowY: 'auto', padding: '0 8px 8px', display: 'grid', gap: 6, minHeight: 30 }}>
                {col.itens.length === 0 && (
                  <p style={{ fontSize: 11.5, color: C.t3, textAlign: 'center', padding: '10px 0', margin: 0 }}>—</p>
                )}
                {col.itens.map((c) => (
                  <div
                    key={c.id}
                    onPointerDown={(e) => arrastoK.aoPressionar(e, c)}
                    style={{
                      background: 'var(--cbrio-card)', border: '1px solid var(--hairline)', borderRadius: 8,
                      padding: '8px 10px', fontSize: 12.5, color: C.text, touchAction: 'none', cursor: 'grab',
                      opacity: arrastoK.cardArrastado === c.id ? 0.4 : 1,
                    }}
                  >
                    <div>{c.titulo}</div>
                    {c.fase && (
                      <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 600, color: C.primary, background: C.primaryBg, borderRadius: 999, padding: '1px 7px' }}>
                        {c.fase}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
      {arrastoK.arrastando && (
        <div
          ref={arrastoK.fantasmaRef}
          className="fixed top-0 left-0 z-[1300] pointer-events-none rounded-lg border shadow-lg"
          style={{
            transform: `translate(${arrastoK.arrasto.x + 8}px, ${arrastoK.arrasto.y + 8}px)`,
            background: 'var(--cbrio-card)', borderColor: C.primary, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: C.text,
          }}
        >
          Movendo…
        </div>
      )}
      <TarefaModal
        open={Boolean(modalTarefa)}
        data={modalTarefa}
        vinculoTipo={vinculo.tipo}
        fasesStepper={fasesStepper}
        salvando={salvandoTarefa}
        onClose={() => setModalTarefa(null)}
        onSave={salvarTarefa}
        onDelete={excluirTarefa}
      />
    </div>
  );
}

// =====================================================================
// Modal de criar/editar tarefa. Um formulário só, que se adapta ao vínculo:
// PROJETO grava a fase como texto na descrição (project_tasks não tem
// coluna de fase); EVENTO grava event_phase_id, que é FK real.
// =====================================================================
function TarefaModal({ open, data, vinculoTipo, fasesStepper, salvando, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({});
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const ehEvento = vinculoTipo === 'evento';
  const nomesFases = useMemo(() => fasesStepper.map((f) => f.nome), [fasesStepper]);

  useEffect(() => {
    if (!data) return;
    setConfirmandoExcluir(false);
    if (ehEvento) {
      setForm({
        id: data.id, titulo: data.titulo || '', responsavel_nome: data.responsavel_nome || '',
        prazo: normDate(data.prazo), status: data.status || 'pendente', prioridade: data.prioridade || 'baixa',
        area: data.area || '', event_phase_id: data.event_phase_id || '', descricao: data.descricao || '',
      });
    } else {
      const { fase, resto } = extrairFaseEDescricao(data.description, nomesFases);
      setForm({
        id: data.id, name: data.name || '', responsible: data.responsible || '',
        start_date: normDate(data.start_date), deadline: normDate(data.deadline),
        status: data.status || 'pendente', priority: data.priority || 'media',
        faseValor: data.faseValor || fase || SEM_FASE, descricao: resto,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ehEvento]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const editando = Boolean(form.id);

  const handleSalvar = () => {
    if (ehEvento) {
      if (!form.titulo?.trim()) { toast.error('Título é obrigatório'); return; }
      if (!form.event_phase_id) { toast.error('Escolha a fase'); return; }
      if (!form.area) { toast.error('Escolha a área'); return; }
    } else if (!form.name?.trim()) { toast.error('Nome é obrigatório'); return; }
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>{editando ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 space-y-3">
          <div className="space-y-1">
            <Label>{ehEvento ? 'Título *' : 'Nome *'}</Label>
            {ehEvento ? (
              <Input value={form.titulo || ''} onChange={(e) => set('titulo', e.target.value)} />
            ) : (
              <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
            )}
          </div>

          <div className="space-y-1">
            <Label>Fase{ehEvento ? ' *' : ''}</Label>
            <Select
              value={ehEvento ? (form.event_phase_id || '') : (form.faseValor || SEM_FASE)}
              onValueChange={(v) => set(ehEvento ? 'event_phase_id' : 'faseValor', v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {!ehEvento && <SelectItem value={SEM_FASE}>Sem fase</SelectItem>}
                {fasesStepper.map((f) => (
                  <SelectItem key={f.id} value={ehEvento ? f.id : f.nome}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Input
                value={(ehEvento ? form.responsavel_nome : form.responsible) || ''}
                onChange={(e) => set(ehEvento ? 'responsavel_nome' : 'responsible', e.target.value)}
              />
            </div>
            {ehEvento && (
              <div className="space-y-1">
                <Label>Área *</Label>
                <Select value={form.area || ''} onValueChange={(v) => set('area', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {AREA_EVENTO_OPCOES.map((a) => <SelectItem key={a.valor} value={a.valor}>{a.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!ehEvento && (
              <div className="space-y-1">
                <Label>Início</Label>
                <DatePicker value={form.start_date || ''} onChange={(v) => set('start_date', v)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Prazo</Label>
              <DatePicker
                value={(ehEvento ? form.prazo : form.deadline) || ''}
                onChange={(v) => set(ehEvento ? 'prazo' : 'deadline', v)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status || 'pendente'} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUNAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select
                value={(ehEvento ? form.prioridade : form.priority) || (ehEvento ? 'baixa' : 'media')}
                onValueChange={(v) => set(ehEvento ? 'prioridade' : 'priority', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(ehEvento ? PRIORIDADE_EVENTO : PRIORIDADE_PROJETO).map((p) => (
                    <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1 pb-4">
            <Label>Descrição</Label>
            <Textarea value={form.descricao || ''} onChange={(e) => set('descricao', e.target.value)} />
          </div>
        </div>

        <DialogFooter className="p-6 pt-3 border-t">
          {editando && (
            confirmandoExcluir ? (
              <button
                type="button"
                style={{ ...btn('danger'), marginRight: 'auto' }}
                disabled={salvando}
                onClick={() => onDelete(form.id)}
              >
                Confirmar exclusão
              </button>
            ) : (
              <button
                type="button"
                style={{ ...btn('ghost'), marginRight: 'auto', color: C.red }}
                onClick={() => setConfirmandoExcluir(true)}
              >
                Excluir
              </button>
            )
          )}
          <button type="button" style={btn('ghost')} onClick={onClose}>Cancelar</button>
          <button type="button" style={btn('primary')} disabled={salvando} onClick={handleSalvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
