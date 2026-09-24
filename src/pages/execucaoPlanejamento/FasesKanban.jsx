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
// Evento vinculado (event_cycles/event_cycle_phases) usa um vocabulário
// PRÓPRIO de status de tarefa (a_fazer/em_andamento/concluida, sem
// "bloqueada") — normalizado aqui pra caber nas mesmas 4 colunas; mover um
// card de evento pra "Bloqueada" não tem correspondente no cycle_phase_tasks
// e é recusado com aviso, em vez de fingir suporte que a API não tem.
// =====================================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { projects as projectsApi, cycles as cyclesApi, planejamentoAnual as planApi } from '../../api';
import { C, cardStyle, btn, hint } from '../planejamentoAnual/comum';
import { useArrastoKanban } from '../marketing/useArrastoKanban';

const COLUNAS = [
  { key: 'pendente', label: 'Pendente', cor: C.t3 },
  { key: 'em-andamento', label: 'Em andamento', cor: C.blue },
  { key: 'concluida', label: 'Concluída', cor: C.green },
  { key: 'bloqueada', label: 'Bloqueada', cor: C.red },
];

// ── Projeto: o vocabulário de status JÁ é o das 4 colunas ───────────────
function statusDeTarefaProjeto(t) { return COLUNAS.some((c) => c.key === t.status) ? t.status : 'pendente'; }

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

// ── Evento: vocabulário próprio (a_fazer/em_andamento/concluida) ───────
const NORMALIZA_EVENTO = { a_fazer: 'pendente', em_andamento: 'em-andamento', concluida: 'concluida' };
const DENORMALIZA_EVENTO = { pendente: 'a_fazer', 'em-andamento': 'em_andamento', concluida: 'concluida' };
function statusDeTarefaEvento(t) { return NORMALIZA_EVENTO[t.status] || 'pendente'; }
function faseDaTarefaEvento(t, fases) {
  const f = fases.find((ph) => ph.id === t.event_phase_id);
  return f ? (f.nome_fase || `Fase ${f.numero_fase}`) : null;
}

export default function FasesKanban({ proposta, onMaterializado }) {
  const vinculo = proposta.vinculo || { tipo: null, id: null };
  const [carregando, setCarregando] = useState(Boolean(vinculo.tipo));
  const [cards, setCards] = useState([]); // {id, titulo, status, fase}
  const [materializando, setMaterializando] = useState(false);
  const containerRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!vinculo.tipo) { setCards([]); return; }
    setCarregando(true);
    try {
      if (vinculo.tipo === 'projeto') {
        const proj = await projectsApi.get(vinculo.id);
        const fases = proj?.phases || [];
        const tarefas = proj?.tasks || [];
        setCards(tarefas.map((t) => ({
          id: t.id, titulo: t.title || t.name || 'Tarefa',
          status: statusDeTarefaProjeto(t), fase: faseDaTarefaProjeto(t, fases),
        })));
      } else {
        const ciclo = await cyclesApi.get(vinculo.id);
        const fases = ciclo?.phases || [];
        const tarefas = ciclo?.tasks || [];
        setCards(tarefas.map((t) => ({
          id: t.id, titulo: t.titulo || 'Tarefa',
          status: statusDeTarefaEvento(t), fase: faseDaTarefaEvento(t, fases),
        })));
      }
    } catch {
      toast.error('Erro ao carregar as fases do vínculo');
    } finally { setCarregando(false); }
  }, [vinculo.tipo, vinculo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const moverCard = useCallback(async (cardId, novoEstado) => {
    if (novoEstado === null) return; // foi só um toque — nada a fazer aqui
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === novoEstado) return;
    if (vinculo.tipo === 'evento' && !DENORMALIZA_EVENTO[novoEstado]) {
      toast.error('Este status não existe para tarefas de ciclo de evento.');
      return;
    }
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, status: novoEstado } : c)));
    try {
      if (vinculo.tipo === 'projeto') {
        await projectsApi.updateTaskStatus(cardId, novoEstado);
      } else {
        await cyclesApi.updateTask(cardId, { status: DENORMALIZA_EVENTO[novoEstado] });
      }
    } catch (e) {
      toast.error(e.message || 'Não foi possível mover o card');
      carregar();
    }
  }, [cards, vinculo.tipo, carregar]);

  const arrastoK = useArrastoKanban({ onMover: moverCard, habilitado: Boolean(vinculo.tipo) });

  const colunas = useMemo(() => COLUNAS.map((col) => ({
    ...col,
    itens: cards.filter((c) => c.status === col.key),
  })), [cards]);

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
    </div>
  );
}
