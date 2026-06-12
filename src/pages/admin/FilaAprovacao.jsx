import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agents } from '../../api';
import { Button } from '../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const ACTION_META = {
  // Financeiro
  'fin.categorize_transaction': { icon: '🏷️', label: 'Categorizar lançamento', color: C.blue, bg: C.blueBg },
  'fin.mark_payable_paid':      { icon: '💸', label: 'Marcar conta como paga', color: C.green, bg: C.greenBg },
  'fin.reimbursement_decision': { icon: '🧾', label: 'Decidir reembolso',       color: C.amber, bg: C.amberBg },
  'fin.atender_alerta':         { icon: '🔔', label: 'Atender alerta',          color: C.primary, bg: C.primaryBg },
  // KPIs/OKRs
  'kpis.alertar_lider':         { icon: '📊', label: 'Alertar líder de KPI',    color: C.purple, bg: C.purpleBg },
  // RH
  'rh.alertar_documento_vencendo':   { icon: '📄', label: 'Documento vencendo',  color: C.amber, bg: C.amberBg },
  'rh.alertar_treinamento_pendente': { icon: '🎓', label: 'Treinamento pendente', color: C.blue, bg: C.blueBg },
  'rh.alertar_ferias_vencendo':      { icon: '🏖️', label: 'Férias a vencer',     color: C.primary, bg: C.primaryBg },
  // Cuidados/Integração
  'cui.alertar_jornada180':       { icon: '💜', label: 'Jornada 180 parada',     color: C.purple, bg: C.purpleBg },
  'cui.alertar_visitante':        { icon: '👋', label: 'Visitante sem follow-up', color: C.amber, bg: C.amberBg },
  'cui.alertar_acompanhamento':   { icon: '🤝', label: 'Acompanhamento estagnado', color: C.red, bg: C.redBg },
  // Eventos
  'eventos.alertar_tarefa_atrasada':       { icon: '⏰', label: 'Tarefa atrasada',     color: C.red, bg: C.redBg },
  'eventos.alertar_tarefa_sem_responsavel':{ icon: '❓', label: 'Tarefa sem responsável', color: C.amber, bg: C.amberBg },
  'eventos.alertar_evento_atrasado':       { icon: '📅', label: 'Evento com baixa preparação', color: C.red, bg: C.redBg },
  // Voluntariado
  'vol.alertar_inativo': { icon: '🌿', label: 'Voluntário inativo',  color: C.purple, bg: C.purpleBg },
  'vol.alertar_pausa':   { icon: '🌤️', label: 'Voluntário em pausa', color: C.blue, bg: C.blueBg },
  // Logística
  'log.alertar_sla_resposta': { icon: '⏱️', label: 'SLA estourado',        color: C.red, bg: C.redBg },
  'log.alertar_urgente':      { icon: '🚨', label: 'Urgente não atendida', color: C.red, bg: C.redBg },
  'log.alertar_ml_parado':    { icon: '📦', label: 'Rastreio ML parado',   color: C.amber, bg: C.amberBg },
  // Membresia
  'mem.alertar_duplicado':       { icon: '👯', label: 'Duplicado detectado', color: C.purple, bg: C.purpleBg },
  'mem.alertar_cadastro_parado': { icon: '📝', label: 'Cadastro parado',     color: C.amber, bg: C.amberBg },
  // Patrimônio
  'pat.alertar_manutencao_longa':     { icon: '🔧', label: 'Manutenção prolongada',   color: C.amber, bg: C.amberBg },
  'pat.alertar_bem_emprestado':       { icon: '📤', label: 'Bem emprestado sem retorno', color: C.amber, bg: C.amberBg },
  'pat.alertar_cadastro_incompleto':  { icon: '📋', label: 'Cadastro de bem incompleto', color: C.blue, bg: C.blueBg },
  // Cérebro
  'cerebro.alertar_erros':         { icon: '⚠️', label: 'Erros no pipeline',  color: C.red, bg: C.redBg },
  'cerebro.alertar_fila_travada':  { icon: '🚧', label: 'Fila travada',       color: C.amber, bg: C.amberBg },
  'cerebro.alertar_custo':         { icon: '💰', label: 'Custo alto de tokens', color: C.amber, bg: C.amberBg },
  // NEXT
  'next.alertar_sem_checkin':       { icon: '🚪', label: 'NEXT: sem check-in',     color: C.amber, bg: C.amberBg },
  'next.alertar_indicacao_pendente': { icon: '➡️', label: 'NEXT: indicação pendente', color: C.blue, bg: C.blueBg },
  // Grupos
  'grupos.alertar_sem_encontro': { icon: '🧩', label: 'Grupo sem encontro', color: C.amber, bg: C.amberBg },
  'grupos.alertar_sem_lider':    { icon: '🆘', label: 'Grupo sem líder',    color: C.red, bg: C.redBg },
  // NPS
  'nps.alertar_baixa_resposta':   { icon: '📊', label: 'NPS: baixa resposta', color: C.amber, bg: C.amberBg },
  'nps.alertar_analise_pendente': { icon: '🔬', label: 'NPS: análise pendente', color: C.blue, bg: C.blueBg },
  'nps.alertar_detrator':         { icon: '😞', label: 'NPS: detrator',     color: C.red, bg: C.redBg },
  // Projetos
  'proj.alertar_atrasado':    { icon: '⏳', label: 'Projeto atrasado',    color: C.red, bg: C.redBg },
  'proj.alertar_sem_lider':   { icon: '❓', label: 'Projeto sem líder',   color: C.amber, bg: C.amberBg },
  'proj.alertar_sem_update':  { icon: '💤', label: 'Projeto sem update',  color: C.amber, bg: C.amberBg },
};

// Agentes disponíveis pra disparo manual + descrição
const AGENTES_DISPONIVEIS = [
  {
    agentType: 'financeiro_executor',
    icon: '🤖',
    titulo: 'Executor Financeiro',
    descricao: 'Varre fila de classificação, contas a pagar, reembolsos e alertas · gera propostas pra você aprovar.',
  },
  {
    agentType: 'kpis_watcher',
    icon: '📊',
    titulo: 'Watcher de KPIs/OKRs',
    descricao: 'Monitora saúde dos 150 KPIs táticos e OKRs · gera relatório e propõe alertas pros líderes responsáveis.',
  },
  {
    agentType: 'rh_executor',
    icon: '👥',
    titulo: 'Executor RH',
    descricao: 'Detecta documentos vencendo, treinamentos pendentes e férias a vencer · alerta RH e gestor direto.',
  },
  {
    agentType: 'cuidados_watcher',
    icon: '💜',
    titulo: 'Watcher Cuidados/Integração',
    descricao: 'Vigia Jornada 180, visitantes sem follow-up e acompanhamentos estagnados · alerta time pastoral.',
  },
  {
    agentType: 'eventos_watcher',
    icon: '📅',
    titulo: 'Watcher Eventos',
    descricao: 'Monitora eventos próximos, tarefas atrasadas e órfãs · alerta líderes de área e responsável do evento.',
  },
  {
    agentType: 'voluntariado_watcher',
    icon: '🌿',
    titulo: 'Watcher Voluntariado',
    descricao: 'Detecta voluntários inativos (60d+) e em pausa recente (30-60d) · alerta líder do ministério pra contato pastoral.',
  },
  {
    agentType: 'logistica_watcher',
    icon: '📦',
    titulo: 'Watcher Logística',
    descricao: 'Vigia SLA das solicitações, urgentes não atendidas e rastreios Mercado Livre parados.',
  },
  {
    agentType: 'membresia_watcher',
    icon: '⛪',
    titulo: 'Watcher Membresia',
    descricao: 'Detecta cadastros duplicados (vw_membros_duplicados) e cadastros pendentes parados há 7d+.',
  },
  {
    agentType: 'patrimonio_watcher',
    icon: '🏷️',
    titulo: 'Watcher Patrimônio',
    descricao: 'Bens em manutenção prolongada, emprestados sem retorno e cadastros incompletos de bens valiosos.',
  },
  {
    agentType: 'cerebro_watcher',
    icon: '🧠',
    titulo: 'Watcher Cérebro CBRio',
    descricao: 'Monitora saúde do pipeline · erros acumulados, fila travada e custo de tokens crescente.',
  },
  {
    agentType: 'next_watcher',
    icon: '➡️',
    titulo: 'Watcher NEXT',
    descricao: 'Detecta inscritos no NEXT que não compareceram e check-ins sem indicações marcadas.',
  },
  {
    agentType: 'grupos_watcher',
    icon: '🧩',
    titulo: 'Watcher Grupos',
    descricao: 'Vigia grupos sem encontro registrado nos últimos 30d e grupos sem líder atribuído.',
  },
  {
    agentType: 'nps_watcher',
    icon: '📊',
    titulo: 'Watcher NPS',
    descricao: 'Pesquisas com taxa de resposta baixa, vencidas sem análise IA e detratores recentes (score ≤ 6).',
  },
  {
    agentType: 'projetos_watcher',
    icon: '📁',
    titulo: 'Watcher Projetos',
    descricao: 'Projetos atrasados (date_end passou), sem líder e sem atualização ha 30d+.',
  },
];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

function Badge({ children, color, bg }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, color, background: bg,
    }}>
      {children}
    </span>
  );
}

function PayloadView({ payload }) {
  const [expanded, setExpanded] = useState(false);
  if (!payload || typeof payload !== 'object') return null;
  const keys = Object.keys(payload);
  if (keys.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ background: 'none', border: 'none', color: C.text3, fontSize: 11, cursor: 'pointer', padding: 0 }}
      >
        {expanded ? '▼' : '▶'} Payload técnico ({keys.length} {keys.length === 1 ? 'campo' : 'campos'})
      </button>
      {expanded && (
        <pre style={{
          marginTop: 6, fontSize: 11, color: C.text2, background: C.bg,
          padding: 10, borderRadius: 6, border: `1px solid ${C.border}`,
          overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PropostaCard({ row, onApply, onReject, applying, rejecting }) {
  const meta = ACTION_META[row.action_type] || { icon: '⚙️', label: row.action_type, color: C.text2, bg: C.bg };
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>{meta.icon}</span>
        <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
        <span style={{ fontSize: 11, color: C.text3, marginLeft: 'auto' }}>{fmtDate(row.created_at)}</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
        {row.action_label || row.description || '(sem título)'}
      </div>

      {row.reasoning && (
        <div style={{
          fontSize: 13, color: C.text2, lineHeight: 1.5,
          padding: 10, background: C.bg, borderRadius: 6, borderLeft: `3px solid ${meta.color}`,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Por que o agente propôs
          </span>
          <div style={{ marginTop: 4 }}>{row.reasoning}</div>
        </div>
      )}

      <PayloadView payload={row.payload} />

      {row.apply_error && (
        <div style={{
          fontSize: 12, color: C.red, background: C.redBg, padding: 8,
          borderRadius: 6, border: `1px solid ${C.red}40`,
        }}>
          ⚠ Erro anterior: {row.apply_error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button
          onClick={() => onApply(row.id)}
          disabled={applying || rejecting}
          style={{ background: meta.color, color: '#fff', flex: 1 }}
        >
          {applying ? 'Aplicando...' : 'Aprovar e aplicar'}
        </Button>
        <Button
          onClick={() => onReject(row.id)}
          disabled={applying || rejecting}
          variant="outline"
          style={{ flex: 1 }}
        >
          {rejecting ? 'Rejeitando...' : 'Rejeitar'}
        </Button>
      </div>
    </div>
  );
}

export default function FilaAprovacao() {
  const qc = useQueryClient();
  const [actingId, setActingId] = useState(null);
  const [acting, setActing] = useState(null); // 'apply' | 'reject'
  const [triggerError, setTriggerError] = useState(null);
  const [triggeringAgent, setTriggeringAgent] = useState(null); // agentType atual

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['agent-queue', 'pending'],
    queryFn: () => agents.queue('pending'),
    refetchInterval: 30000,
  });

  const applyMutation = useMutation({
    mutationFn: (id) => agents.apply(id),
    onMutate: (id) => { setActingId(id); setActing('apply'); },
    onSettled: () => {
      setActingId(null); setActing(null);
      qc.invalidateQueries({ queryKey: ['agent-queue'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => agents.reject(id, 'Rejeitado pelo aprovador'),
    onMutate: (id) => { setActingId(id); setActing('reject'); },
    onSettled: () => {
      setActingId(null); setActing(null);
      qc.invalidateQueries({ queryKey: ['agent-queue'] });
    },
  });

  const handleTrigger = async (agentType) => {
    setTriggeringAgent(agentType); setTriggerError(null);
    try {
      await agents.triggerWorker({ agentType });
      setTimeout(() => refetch(), 5000);
    } catch (e) {
      setTriggerError(e?.message || 'Erro ao disparar worker');
    } finally {
      setTriggeringAgent(null);
    }
  };

  const agrupado = rows.reduce((acc, r) => {
    const k = r.action_type || 'desconhecido';
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
        {AGENTES_DISPONIVEIS.map((a) => (
          <div key={a.agentType} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              {a.icon} {a.titulo}
            </div>
            <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
              {a.descricao}
            </div>
            <div style={{ fontSize: 11, color: C.text3 }}>
              Cron · segunda 06:00 SP
            </div>
            <Button
              onClick={() => handleTrigger(a.agentType)}
              disabled={triggeringAgent === a.agentType}
              style={{ background: C.primary, color: '#fff', marginTop: 'auto' }}
            >
              {triggeringAgent === a.agentType ? 'Disparando...' : 'Rodar agora'}
            </Button>
          </div>
        ))}
      </div>

      {triggerError && (
        <div style={{
          fontSize: 12, color: C.red, background: C.redBg, padding: 10,
          borderRadius: 6, border: `1px solid ${C.red}40`,
        }}>
          {triggerError}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3 }}>Carregando fila…</div>
      )}

      {!isLoading && rows.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 40, color: C.text3,
          background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10,
        }}>
          Nenhuma proposta pendente. O agente vai rodar de novo nos próximos horários (9h, 14h ou 19h SP),
          ou você pode disparar manualmente.
        </div>
      )}

      {Object.entries(agrupado).map(([action_type, lista]) => {
        const meta = ACTION_META[action_type] || { label: action_type };
        return (
          <div key={action_type}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {meta.label} · {lista.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
              {lista.map(row => (
                <PropostaCard
                  key={row.id}
                  row={row}
                  onApply={(id) => applyMutation.mutate(id)}
                  onReject={(id) => rejectMutation.mutate(id)}
                  applying={actingId === row.id && acting === 'apply'}
                  rejecting={actingId === row.id && acting === 'reject'}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
