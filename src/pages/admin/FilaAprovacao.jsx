import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock, AlertTriangle, ArrowRight, Banknote, BarChart3, BellRing, Bot, Boxes, Brain,
  CalendarClock, CalendarDays, ChevronDown, ChevronRight, Church, ClipboardList, CircleDollarSign,
  Construction, DoorOpen, FileQuestion, FileWarning, FolderKanban, Frown, Gauge, GraduationCap,
  Hand, HeartHandshake, HelpCircle, Hourglass, LifeBuoy, Microscope, Moon, Package, PackageOpen,
  Palmtree, PauseCircle, Play, Puzzle, Receipt, RefreshCw, Settings2, ShieldAlert, Siren, Sprout,
  Tag, Timer, UserMinus, UserX, Users, Wrench,
} from 'lucide-react';
import { agents } from '../../api';
import { Button } from '../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

// Ícones = lucide-react (o padrão do sistema · mesmo pacote do shadcn e das
// outras telas de /admin). `Icon` é o COMPONENTE, não uma string: renderizado com
// `<meta.Icon size={} color={} />` ele herda tamanho e cor do contexto, coisa que
// emoji não faz (emoji ignora `color` e muda de desenho por sistema operacional).
const ACTION_META = {
  // Financeiro
  'fin.categorize_transaction': { Icon: Tag,      label: 'Categorizar lançamento', color: C.blue, bg: C.blueBg },
  'fin.mark_payable_paid':      { Icon: Banknote, label: 'Marcar conta como paga', color: C.green, bg: C.greenBg },
  'fin.reimbursement_decision': { Icon: Receipt,  label: 'Decidir reembolso',       color: C.amber, bg: C.amberBg },
  'fin.atender_alerta':         { Icon: BellRing, label: 'Atender alerta',          color: C.primary, bg: C.primaryBg },
  // KPIs/OKRs
  'kpis.alertar_lider':         { Icon: BarChart3, label: 'Alertar líder de KPI',   color: C.purple, bg: C.purpleBg },
  // RH
  'rh.alertar_documento_vencendo':   { Icon: FileWarning,   label: 'Documento vencendo',   color: C.amber, bg: C.amberBg },
  'rh.alertar_treinamento_pendente': { Icon: GraduationCap, label: 'Treinamento pendente', color: C.blue, bg: C.blueBg },
  'rh.alertar_ferias_vencendo':      { Icon: Palmtree,      label: 'Férias a vencer',      color: C.primary, bg: C.primaryBg },
  // Cuidados/Integração
  'cui.alertar_jornada180':       { Icon: HeartHandshake, label: 'Jornada 180 parada',      color: C.purple, bg: C.purpleBg },
  'cui.alertar_visitante':        { Icon: Hand,           label: 'Visitante sem follow-up', color: C.amber, bg: C.amberBg },
  'cui.alertar_acompanhamento':   { Icon: HeartHandshake, label: 'Acompanhamento estagnado', color: C.red, bg: C.redBg },
  // Eventos
  'eventos.alertar_tarefa_atrasada':       { Icon: AlarmClock,    label: 'Tarefa atrasada',            color: C.red, bg: C.redBg },
  'eventos.alertar_tarefa_sem_responsavel':{ Icon: UserX,         label: 'Tarefa sem responsável',     color: C.amber, bg: C.amberBg },
  'eventos.alertar_evento_atrasado':       { Icon: CalendarClock, label: 'Evento com baixa preparação', color: C.red, bg: C.redBg },
  // Voluntariado
  'vol.alertar_inativo': { Icon: UserMinus,   label: 'Voluntário inativo',  color: C.purple, bg: C.purpleBg },
  'vol.alertar_pausa':   { Icon: PauseCircle, label: 'Voluntário em pausa', color: C.blue, bg: C.blueBg },
  // Logística
  'log.alertar_sla_resposta': { Icon: Timer,   label: 'SLA estourado',        color: C.red, bg: C.redBg },
  'log.alertar_urgente':      { Icon: Siren,   label: 'Urgente não atendida', color: C.red, bg: C.redBg },
  'log.alertar_ml_parado':    { Icon: Package, label: 'Rastreio ML parado',   color: C.amber, bg: C.amberBg },
  // Membresia
  'mem.alertar_duplicado':       { Icon: Users,         label: 'Duplicado detectado', color: C.purple, bg: C.purpleBg },
  'mem.alertar_cadastro_parado': { Icon: ClipboardList, label: 'Cadastro parado',     color: C.amber, bg: C.amberBg },
  // Patrimônio
  'pat.alertar_manutencao_longa':     { Icon: Wrench,       label: 'Manutenção prolongada',    color: C.amber, bg: C.amberBg },
  'pat.alertar_bem_emprestado':       { Icon: PackageOpen,  label: 'Bem emprestado sem retorno', color: C.amber, bg: C.amberBg },
  'pat.alertar_cadastro_incompleto':  { Icon: FileQuestion, label: 'Cadastro de bem incompleto', color: C.blue, bg: C.blueBg },
  // Cérebro
  'cerebro.alertar_erros':         { Icon: AlertTriangle,     label: 'Erros no pipeline',    color: C.red, bg: C.redBg },
  'cerebro.alertar_fila_travada':  { Icon: Construction,      label: 'Fila travada',         color: C.amber, bg: C.amberBg },
  'cerebro.alertar_custo':         { Icon: CircleDollarSign,  label: 'Custo alto de tokens', color: C.amber, bg: C.amberBg },
  // NEXT
  'next.alertar_sem_checkin':        { Icon: DoorOpen,   label: 'NEXT: sem check-in',      color: C.amber, bg: C.amberBg },
  'next.alertar_indicacao_pendente': { Icon: ArrowRight, label: 'NEXT: indicação pendente', color: C.blue, bg: C.blueBg },
  // Grupos
  'grupos.alertar_sem_encontro': { Icon: Puzzle,   label: 'Grupo sem encontro', color: C.amber, bg: C.amberBg },
  'grupos.alertar_sem_lider':    { Icon: LifeBuoy, label: 'Grupo sem líder',    color: C.red, bg: C.redBg },
  // NPS
  'nps.alertar_baixa_resposta':   { Icon: Gauge,      label: 'NPS: baixa resposta',  color: C.amber, bg: C.amberBg },
  'nps.alertar_analise_pendente': { Icon: Microscope, label: 'NPS: análise pendente', color: C.blue, bg: C.blueBg },
  'nps.alertar_detrator':         { Icon: Frown,      label: 'NPS: detrator',        color: C.red, bg: C.redBg },
  // Projetos
  'proj.alertar_atrasado':    { Icon: Hourglass,  label: 'Projeto atrasado',   color: C.red, bg: C.redBg },
  'proj.alertar_sem_lider':   { Icon: HelpCircle, label: 'Projeto sem líder',  color: C.amber, bg: C.amberBg },
  'proj.alertar_sem_update':  { Icon: Moon,       label: 'Projeto sem update', color: C.amber, bg: C.amberBg },
  // Cyber · achado é INFORMATIVO: aprovar aqui = a pessoa registrou ciência.
  // ⚠️ Sem esta entrada o chip mostrava o slug cru "cyber.achado_seguranca · 3".
  'cyber.achado_seguranca': { Icon: ShieldAlert, label: 'Achado de segurança', color: C.red, bg: C.redBg },
};

const metaDe = (actionType) =>
  ACTION_META[actionType] || { Icon: Settings2, label: actionType || 'Sem tipo', color: C.text2, bg: C.bg };

// Agentes disponíveis pra disparo manual + descrição.
// ⚠️ A lista espelha SCHEDULED_AGENTS de agent-worker/src/scheduler.ts (cron semanal
// "0 6 * * 1" = segunda 06:00 SP). Agente novo lá entra aqui também.
const AGENTES_DISPONIVEIS = [
  {
    agentType: 'financeiro_executor',
    Icon: Bot,
    titulo: 'Executor Financeiro',
    descricao: 'Varre fila de classificação, contas a pagar, reembolsos e alertas · gera propostas pra você aprovar.',
  },
  {
    agentType: 'kpis_watcher',
    Icon: BarChart3,
    titulo: 'Watcher de KPIs/OKRs',
    descricao: 'Monitora saúde dos 150 KPIs táticos e OKRs · gera relatório e propõe alertas pros líderes responsáveis.',
  },
  {
    agentType: 'rh_executor',
    Icon: Users,
    titulo: 'Executor RH',
    descricao: 'Detecta documentos vencendo, treinamentos pendentes e férias a vencer · alerta RH e gestor direto.',
  },
  {
    agentType: 'cuidados_watcher',
    Icon: HeartHandshake,
    titulo: 'Watcher Cuidados/Integração',
    descricao: 'Vigia Jornada 180, visitantes sem follow-up e acompanhamentos estagnados · alerta time pastoral.',
  },
  {
    agentType: 'eventos_watcher',
    Icon: CalendarDays,
    titulo: 'Watcher Eventos',
    descricao: 'Monitora eventos próximos, tarefas atrasadas e órfãs · alerta líderes de área e responsável do evento.',
  },
  {
    agentType: 'voluntariado_watcher',
    Icon: Sprout,
    titulo: 'Watcher Voluntariado',
    descricao: 'Detecta voluntários inativos (60d+) e em pausa recente (30-60d) · alerta líder do ministério pra contato pastoral.',
  },
  {
    agentType: 'logistica_watcher',
    Icon: Package,
    titulo: 'Watcher Logística',
    descricao: 'Vigia SLA das solicitações, urgentes não atendidas e rastreios Mercado Livre parados.',
  },
  {
    agentType: 'membresia_watcher',
    Icon: Church,
    titulo: 'Watcher Membresia',
    descricao: 'Detecta cadastros duplicados (vw_membros_duplicados) e cadastros pendentes parados há 7d+.',
  },
  {
    agentType: 'patrimonio_watcher',
    Icon: Boxes,
    titulo: 'Watcher Patrimônio',
    descricao: 'Bens em manutenção prolongada, emprestados sem retorno e cadastros incompletos de bens valiosos.',
  },
  {
    agentType: 'cerebro_watcher',
    Icon: Brain,
    titulo: 'Watcher Cérebro CBRio',
    descricao: 'Monitora saúde do pipeline · erros acumulados, fila travada e custo de tokens crescente.',
  },
  {
    agentType: 'next_watcher',
    Icon: ArrowRight,
    titulo: 'Watcher NEXT',
    descricao: 'Detecta inscritos no NEXT que não compareceram e check-ins sem indicações marcadas.',
  },
  {
    agentType: 'grupos_watcher',
    Icon: Puzzle,
    titulo: 'Watcher Grupos',
    descricao: 'Vigia grupos sem encontro registrado nos últimos 30d e grupos sem líder atribuído.',
  },
  {
    agentType: 'nps_watcher',
    Icon: Gauge,
    titulo: 'Watcher NPS',
    descricao: 'Pesquisas com taxa de resposta baixa, vencidas sem análise IA e detratores recentes (score ≤ 6).',
  },
  {
    agentType: 'projetos_watcher',
    Icon: FolderKanban,
    titulo: 'Watcher Projetos',
    descricao: 'Projetos atrasados (date_end passou), sem líder e sem atualização há 30d+.',
  },
];

const fmtData = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const semAcento = (v) => (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const tituloDe = (row) => row.action_label || row.description || '(sem título)';

// Texto onde a busca procura: título, motivo e o payload serializado (é lá que
// moram nome, id e valores que a pessoa lembra na hora de achar uma proposta).
const textoBusca = (row) =>
  semAcento([tituloDe(row), row.reasoning, JSON.stringify(row.payload || {})].join(' '));

function Chip({ ativo, onClick, children, cor, fundo, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
        borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${ativo ? (cor || C.primary) : C.border}`,
        background: ativo ? (fundo || C.primaryBg) : 'transparent',
        color: ativo ? (cor || C.primary) : C.text2,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function PainelAgentes({ aberto, onFechar, triggering, onDisparar, erro }) {
  if (!aberto) return null;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Disparar um agente agora</div>
        <div style={{ fontSize: 12, color: C.text3, flex: 1, minWidth: 200 }}>
          Todos rodam sozinhos toda segunda às 06:00 (SP). As propostas aparecem aqui em alguns minutos.
        </div>
        <Button size="sm" variant="ghost" onClick={onFechar}>Fechar</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {AGENTES_DISPONIVEIS.map((a) => {
          const rodando = triggering === a.agentType;
          return (
            <button
              key={a.agentType}
              onClick={() => onDisparar(a.agentType)}
              disabled={!!triggering}
              title={a.descricao}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                background: rodando ? C.primaryBg : C.bg, cursor: triggering ? 'default' : 'pointer',
                opacity: triggering && !rodando ? 0.5 : 1,
                color: C.text, fontSize: 13, fontWeight: 600, minWidth: 0,
              }}
            >
              <a.Icon size={17} color={rodando ? C.primary : C.text2} style={{ flexShrink: 0 }} aria-hidden />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.titulo}
              </span>
              <span style={{ fontSize: 11, color: rodando ? C.primary : C.text3, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                {rodando ? 'disparando…' : <Play size={13} aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>

      {erro && (
        <div style={{
          fontSize: 12, color: C.red, background: C.redBg, padding: 10,
          borderRadius: 8, border: `1px solid ${C.red}40`,
        }}>
          {erro}
        </div>
      )}
    </div>
  );
}

function LinhaProposta({ row, selecionada, onSelecionar, aberta, onAlternar, onAplicar, onRejeitar, agindo, ultima }) {
  const meta = metaDe(row.action_type);
  return (
    <div style={{
      borderBottom: ultima ? 'none' : `1px solid ${C.border}`,
      background: selecionada ? C.primaryBg : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap' }}>
        <input
          type="checkbox"
          checked={selecionada}
          onChange={() => onSelecionar(row.id)}
          aria-label="Selecionar proposta"
          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: C.primary }}
        />
        <button
          onClick={onAlternar}
          title={aberta ? 'Recolher' : 'Ver por que o agente propôs'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
          }}
        >
          {aberta
            ? <ChevronDown size={14} color={C.text3} style={{ flexShrink: 0 }} aria-hidden />
            : <ChevronRight size={14} color={C.text3} style={{ flexShrink: 0 }} aria-hidden />}
          <meta.Icon size={15} color={meta.color} style={{ flexShrink: 0 }} aria-hidden />
          <span style={{
            fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: aberta ? 'normal' : 'nowrap',
          }}>
            {tituloDe(row)}
          </span>
        </button>

        <span style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>{fmtData(row.created_at)}</span>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Button
            size="sm"
            onClick={() => onAplicar(row.id)}
            disabled={!!agindo}
            title="Aprovar e aplicar"
            style={{ background: meta.color, color: '#fff', height: 30, padding: '0 12px' }}
          >
            {agindo === 'apply' ? 'Aplicando…' : 'Aprovar'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRejeitar(row.id)}
            disabled={!!agindo}
            title="Rejeitar proposta"
            style={{ height: 30, padding: '0 12px' }}
          >
            {agindo === 'reject' ? 'Rejeitando…' : 'Rejeitar'}
          </Button>
        </div>
      </div>

      {aberta && (
        <div style={{ padding: '0 12px 12px 48px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {row.reasoning && (
            <div style={{
              fontSize: 13, color: C.text2, lineHeight: 1.5,
              padding: 10, background: C.bg, borderRadius: 8, borderLeft: `3px solid ${meta.color}`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Por que o agente propôs
              </span>
              <div style={{ marginTop: 4 }}>{row.reasoning}</div>
            </div>
          )}

          {row.payload && typeof row.payload === 'object' && Object.keys(row.payload).length > 0 && (
            <details>
              <summary style={{ fontSize: 11, color: C.text3, cursor: 'pointer' }}>
                Payload técnico ({Object.keys(row.payload).length} {Object.keys(row.payload).length === 1 ? 'campo' : 'campos'})
              </summary>
              <pre style={{
                marginTop: 6, fontSize: 11, color: C.text2, background: C.bg,
                padding: 10, borderRadius: 6, border: `1px solid ${C.border}`,
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            </details>
          )}

          {row.apply_error && (
            <div style={{
              fontSize: 12, color: C.red, background: C.redBg, padding: 8,
              borderRadius: 6, border: `1px solid ${C.red}40`,
            }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden />
              Erro anterior: {row.apply_error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilaAprovacao() {
  const qc = useQueryClient();
  const [agindoId, setAgindoId] = useState(null);
  const [agindoTipo, setAgindoTipo] = useState(null); // 'apply' | 'reject'
  const [triggerErro, setTriggerErro] = useState(null);
  const [triggering, setTriggering] = useState(null);
  const [painelAgentes, setPainelAgentes] = useState(false);

  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState(null);      // action_type ou null = todos
  const [abertas, setAbertas] = useState(() => new Set()); // propostas expandidas
  const [recolhidos, setRecolhidos] = useState(() => new Set()); // grupos recolhidos
  const [sel, setSel] = useState(() => new Set());
  const [lote, setLote] = useState(null);        // { tipo, total, feitos }
  const [resumoLote, setResumoLote] = useState(null);

  const { data: rows = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['agent-queue', 'pending'],
    queryFn: () => agents.queue('pending'),
    refetchInterval: 30000,
  });

  // Contagem por tipo sai da fila INTEIRA (os chips precisam mostrar o que existe,
  // não o que sobrou depois do filtro que a própria pessoa aplicou).
  const porTipo = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const k = r.action_type || 'desconhecido';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return rows.filter((r) => {
      if (tipoFiltro && (r.action_type || 'desconhecido') !== tipoFiltro) return false;
      if (termo && !textoBusca(r).includes(termo)) return false;
      return true;
    });
  }, [rows, tipoFiltro, busca]);

  const grupos = useMemo(() => {
    const m = new Map();
    for (const r of filtradas) {
      const k = r.action_type || 'desconhecido';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtradas]);

  // ⚠️ Conta só os grupos VISÍVEIS agora: `recolhidos` guarda tipo que a pessoa
  // recolheu antes e que pode ter saído da tela pelo filtro — usar o tamanho do
  // Set faria o botão dizer "expandir todos" com grupo aberto na frente.
  const recolhidosVisiveis = useMemo(
    () => grupos.filter(([t]) => recolhidos.has(t)).length,
    [grupos, recolhidos],
  );
  const todosRecolhidos = grupos.length > 0 && recolhidosVisiveis === grupos.length;

  const idsVisiveis = useMemo(() => filtradas.map((r) => r.id), [filtradas]);
  const selecionadasVisiveis = useMemo(
    () => idsVisiveis.filter((id) => sel.has(id)),
    [idsVisiveis, sel],
  );

  const alternarSet = (setter) => (id) => setter((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const alternarSelecao = alternarSet(setSel);
  const alternarAberta = alternarSet(setAbertas);
  const alternarGrupo = alternarSet(setRecolhidos);

  function selecionarGrupo(lista, marcar) {
    setSel((prev) => {
      const n = new Set(prev);
      for (const r of lista) { if (marcar) n.add(r.id); else n.delete(r.id); }
      return n;
    });
  }

  async function agirUma(id, tipo) {
    setAgindoId(id); setAgindoTipo(tipo);
    try {
      if (tipo === 'apply') await agents.apply(id);
      else await agents.reject(id, 'Rejeitado pelo aprovador');
      setSel((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } catch (e) {
      setResumoLote({ total: 1, ok: 0, erros: [{ id, msg: e?.message || 'Erro' }] });
    } finally {
      setAgindoId(null); setAgindoTipo(null);
      qc.invalidateQueries({ queryKey: ['agent-queue'] });
    }
  }

  // ⚠️ Sequencial e com progresso REAL no botão: cada item é uma requisição que já
  // persiste sozinha no servidor, então uma falha no meio não desfaz o que já
  // passou — o resumo diz quantas entraram e quais ficaram.
  async function agirEmLote(tipo) {
    const ids = selecionadasVisiveis;
    if (ids.length === 0) return;
    setLote({ tipo, total: ids.length, feitos: 0 });
    const erros = [];
    let ok = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        if (tipo === 'apply') await agents.apply(id);
        else await agents.reject(id, 'Rejeitado em lote pelo aprovador');
        ok += 1;
        setSel((prev) => { const n = new Set(prev); n.delete(id); return n; });
      } catch (e) {
        erros.push({ id, msg: e?.message || 'Erro' });
      }
      setLote((l) => (l ? { ...l, feitos: i + 1 } : l));
    }
    setLote(null);
    setResumoLote({ total: ids.length, ok, erros });
    qc.invalidateQueries({ queryKey: ['agent-queue'] });
  }

  async function disparar(agentType) {
    setTriggering(agentType); setTriggerErro(null);
    try {
      await agents.triggerWorker({ agentType });
      setTimeout(() => refetch(), 5000);
    } catch (e) {
      setTriggerErro(e?.message || 'Erro ao disparar o agente');
    } finally {
      setTriggering(null);
    }
  }

  const emLote = !!lote;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Barra de comando */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{rows.length}</span>
          <span style={{ fontSize: 13, color: C.text2 }}>
            {rows.length === 1 ? 'proposta pendente' : 'propostas pendentes'}
          </span>
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, motivo ou payload…"
          style={{
            flex: 1, minWidth: 220, maxWidth: 360, height: 34, padding: '0 12px',
            borderRadius: 8, border: `1px solid ${C.border}`,
            background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13,
          }}
        />

        <div style={{ flex: 1 }} />

        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} style={{ marginRight: 6 }} aria-hidden />
          {isFetching ? 'Atualizando…' : 'Atualizar'}
        </Button>
        <Button size="sm" onClick={() => setPainelAgentes((v) => !v)}>
          <Play size={14} style={{ marginRight: 6 }} aria-hidden />
          {painelAgentes ? 'Ocultar agentes' : 'Rodar um agente'}
        </Button>
      </div>

      <PainelAgentes
        aberto={painelAgentes}
        onFechar={() => setPainelAgentes(false)}
        triggering={triggering}
        onDisparar={disparar}
        erro={triggerErro}
      />

      {!painelAgentes && triggerErro && (
        <div style={{
          fontSize: 12, color: C.red, background: C.redBg, padding: 10,
          borderRadius: 8, border: `1px solid ${C.red}40`,
        }}>
          {triggerErro}
        </div>
      )}

      {/* Filtro por tipo */}
      {porTipo.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip ativo={!tipoFiltro} onClick={() => setTipoFiltro(null)}>
            Todas · {rows.length}
          </Chip>
          {porTipo.map(([tipo, n]) => {
            const meta = metaDe(tipo);
            return (
              <Chip
                key={tipo}
                ativo={tipoFiltro === tipo}
                cor={meta.color}
                fundo={meta.bg}
                title={tipo}
                onClick={() => setTipoFiltro((t) => (t === tipo ? null : tipo))}
              >
                <meta.Icon size={13} aria-hidden /> {meta.label} · {n}
              </Chip>
            );
          })}
        </div>
      )}

      {/* Barra de seleção · só aparece com algo marcado */}
      {selecionadasVisiveis.length > 0 && (
        <div style={{
          position: 'sticky', top: 8, zIndex: 5,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: C.primaryBg, border: `1px solid ${C.primary}55`,
          borderRadius: 10, padding: '8px 12px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>
            {selecionadasVisiveis.length} selecionada{selecionadasVisiveis.length > 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1 }} />
          <Button size="sm" onClick={() => agirEmLote('apply')} disabled={emLote}>
            {emLote && lote.tipo === 'apply' ? `Aprovando ${lote.feitos} de ${lote.total}…` : 'Aprovar e aplicar'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => agirEmLote('reject')} disabled={emLote}>
            {emLote && lote.tipo === 'reject' ? `Rejeitando ${lote.feitos} de ${lote.total}…` : 'Rejeitar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())} disabled={emLote}>
            Limpar
          </Button>
        </div>
      )}

      {resumoLote && (
        <div style={{
          fontSize: 13, borderRadius: 10, padding: '10px 12px',
          color: resumoLote.erros.length ? C.amber : C.green,
          background: resumoLote.erros.length ? C.amberBg : C.greenBg,
          border: `1px solid ${(resumoLote.erros.length ? C.amber : C.green)}40`,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span>
            {resumoLote.ok} de {resumoLote.total} concluída{resumoLote.total > 1 ? 's' : ''}
            {resumoLote.erros.length > 0 && ` · ${resumoLote.erros.length} com erro: ${resumoLote.erros[0].msg}`}
          </span>
          <div style={{ flex: 1 }} />
          <Button size="sm" variant="ghost" onClick={() => setResumoLote(null)}>Fechar</Button>
        </div>
      )}

      {isError && (
        <div style={{
          fontSize: 13, color: C.red, background: C.redBg, padding: 12,
          borderRadius: 10, border: `1px solid ${C.red}40`,
        }}>
          Não conseguimos carregar a fila: {error?.message || 'erro desconhecido'}. Tente atualizar.
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3 }}>Carregando fila…</div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 40, color: C.text3,
          background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
        }}>
          Nenhuma proposta pendente. Os agentes rodam sozinhos toda segunda às 06:00 (SP) —
          você também pode disparar um agora em “Rodar um agente”.
        </div>
      )}

      {!isLoading && rows.length > 0 && filtradas.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 30, color: C.text3,
          background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
        }}>
          Nenhuma proposta com esses filtros.{' '}
          <button
            onClick={() => { setBusca(''); setTipoFiltro(null); }}
            style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontWeight: 600 }}
          >
            Limpar filtros
          </button>
        </div>
      )}

      {grupos.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.text3 }}>
          <span>
            {grupos.length} {grupos.length === 1 ? 'tipo' : 'tipos'} de proposta ·{' '}
            {todosRecolhidos ? 'todos recolhidos' : `${grupos.length - recolhidosVisiveis} abertos`}
          </span>
          <div style={{ flex: 1 }} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(grupos.map(([t]) => t)))}
          >
            {todosRecolhidos
              ? <><ChevronDown size={14} style={{ marginRight: 6 }} aria-hidden />Expandir todos</>
              : <><ChevronRight size={14} style={{ marginRight: 6 }} aria-hidden />Recolher todos</>}
          </Button>
        </div>
      )}

      {grupos.map(([tipo, lista]) => {
        const meta = metaDe(tipo);
        const recolhido = recolhidos.has(tipo);
        const todasMarcadas = lista.every((r) => sel.has(r.id));
        return (
          <div key={tipo} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderBottom: recolhido ? 'none' : `1px solid ${C.border}`,
            }}>
              <input
                type="checkbox"
                checked={todasMarcadas}
                onChange={() => selecionarGrupo(lista, !todasMarcadas)}
                aria-label={`Selecionar todas de ${meta.label}`}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: C.primary }}
              />
              {/* O chevron ganhou CAIXA com borda: como botão-texto puro ele passava
                  despercebido e a pessoa não descobria que dava pra recolher. */}
              <button
                onClick={() => alternarGrupo(tipo)}
                aria-expanded={!recolhido}
                title={recolhido ? `Expandir ${meta.label}` : `Recolher ${meta.label}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, flex: 1,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: `1px solid ${C.border}`, background: C.bg, color: C.text2,
                }}>
                  {recolhido ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                </span>
                <meta.Icon size={15} color={meta.color} style={{ flexShrink: 0 }} aria-hidden />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{meta.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg,
                  padding: '1px 8px', borderRadius: 999,
                }}>
                  {lista.length}
                </span>
                <span style={{ fontSize: 11, color: C.text3 }}>
                  {recolhido ? 'recolhido' : ''}
                </span>
              </button>
            </div>

            {!recolhido && lista.map((row, i) => (
              <LinhaProposta
                key={row.id}
                row={row}
                ultima={i === lista.length - 1}
                selecionada={sel.has(row.id)}
                onSelecionar={alternarSelecao}
                aberta={abertas.has(row.id)}
                onAlternar={() => alternarAberta(row.id)}
                onAplicar={(id) => agirUma(id, 'apply')}
                onRejeitar={(id) => agirUma(id, 'reject')}
                agindo={agindoId === row.id ? agindoTipo : null}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
