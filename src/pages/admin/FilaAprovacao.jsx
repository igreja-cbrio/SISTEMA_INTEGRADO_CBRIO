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
  'fin.categorize_transaction': { icon: '🏷️', label: 'Categorizar lançamento', color: C.blue, bg: C.blueBg },
  'fin.mark_payable_paid':      { icon: '💸', label: 'Marcar conta como paga', color: C.green, bg: C.greenBg },
  'fin.reimbursement_decision': { icon: '🧾', label: 'Decidir reembolso',       color: C.amber, bg: C.amberBg },
  'fin.atender_alerta':         { icon: '🔔', label: 'Atender alerta',          color: C.primary, bg: C.primaryBg },
};

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
  const [triggering, setTriggering] = useState(false);

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

  const handleTrigger = async () => {
    setTriggering(true); setTriggerError(null);
    try {
      await agents.triggerWorker({ agentType: 'financeiro_executor' });
      // Esperar uns segundos pra worker enfileirar e dar refetch
      setTimeout(() => refetch(), 5000);
    } catch (e) {
      setTriggerError(e?.message || 'Erro ao disparar worker');
    } finally {
      setTriggering(false);
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
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            🤖 Executor Financeiro
          </div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
            Agente varre fila de classificação, contas a pagar, reembolsos e alertas · gera propostas pra você aprovar.
            Roda automaticamente 3x/dia (9h, 14h, 19h SP).
          </div>
        </div>
        <Button onClick={handleTrigger} disabled={triggering} style={{ background: C.primary, color: '#fff' }}>
          {triggering ? 'Disparando...' : 'Rodar agora'}
        </Button>
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
