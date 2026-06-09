// ============================================================================
// /admin/feedback · Onda 0 · painel de feedback + erros do piloto (2026-06-09)
//
// Onde o time vê o que os testadores reportaram (botão "Reportar") e os erros
// 500 capturados no backend. Read + marcar status. O agente Haiku de triagem
// (PR seguinte) vai resumir isto num relatório diário · esta tela é a fonte.
// ============================================================================
import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { feedback as feedbackApi } from '../../api';
import { toast } from 'sonner';
import { MessageSquareWarning, Bug, HelpCircle, Lightbulb, Heart, RefreshCw } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)',
  t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)', primary: '#00B39D',
};

const TIPO_META = {
  bug:       { label: 'Quebrou',  icon: Bug,         cor: '#ef4444' },
  confusao:  { label: 'Confuso',  icon: HelpCircle,  cor: '#f59e0b' },
  sugestao:  { label: 'Ideia',    icon: Lightbulb,   cor: '#3b82f6' },
  elogio:    { label: 'Elogio',   icon: Heart,       cor: '#10b981' },
};

const SEV_COR = { baixa: '#94a3b8', media: '#f59e0b', alta: '#f97316', critica: '#ef4444' };
const STATUS_OPCOES = ['novo', 'triado', 'em_andamento', 'resolvido', 'descartado'];
const STATUS_LABEL = {
  novo: 'Novo', triado: 'Triado', em_andamento: 'Em andamento',
  resolvido: 'Resolvido', descartado: 'Descartado',
};
const FILTROS = ['todos', 'novo', 'triado', 'em_andamento', 'resolvido'];

function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackAdmin() {
  const { isAdmin } = useAuth();
  const [aba, setAba] = useState('feedback');
  const [itens, setItens] = useState([]);
  const [erros, setErros] = useState([]);
  const [relatorios, setRelatorios] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, res, errs, rels] = await Promise.all([
        feedbackApi.list(filtro === 'todos' ? undefined : { status: filtro }),
        feedbackApi.resumo(),
        feedbackApi.erros(),
        feedbackApi.relatorios().catch(() => []),
      ]);
      setItens(lista || []);
      setResumo(res || null);
      setErros(errs || []);
      setRelatorios(rels || []);
    } catch (e) {
      toast.error(e?.message || 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(id, status) {
    try {
      await feedbackApi.atualizar(id, { status });
      toast.success('Atualizado.');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Erro ao atualizar.');
    }
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <MessageSquareWarning size={24} color={C.primary} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Feedback do piloto</h1>
        <button onClick={carregar} disabled={loading}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, cursor: 'pointer', fontSize: 12 }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Atualizar
        </button>
      </div>
      <p style={{ marginTop: 0, fontSize: 13, color: C.t3 }}>
        O que os testadores reportaram + os erros capturados. Em breve um agente resume isto num relatório diário.
      </p>

      {/* Resumo */}
      {resumo && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0 20px' }}>
          <Stat label="Total" valor={resumo.total} />
          <Stat label="Novos" valor={resumo.novos} cor={C.primary} />
          <Stat label="Críticos abertos" valor={resumo.criticos} cor={resumo.criticos ? '#ef4444' : C.t3} />
          <Stat label="Erros 500" valor={erros.length} cor={erros.length ? '#f97316' : C.t3} />
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[['feedback', 'Feedback'], ['erros', `Erros do servidor (${erros.length})`], ['relatorio', 'Relatório do agente']].map(([k, lbl]) => (
          <button key={k} onClick={() => setAba(k)}
            style={{
              padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              color: aba === k ? C.primary : C.t3,
              borderBottom: aba === k ? `2px solid ${C.primary}` : '2px solid transparent',
            }}>
            {lbl}
          </button>
        ))}
      </div>

      {aba === 'feedback' && (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {FILTROS.map((f) => (
              <button key={f} onClick={() => setFiltro(f)}
                style={{
                  padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${filtro === f ? C.primary : C.border}`,
                  background: filtro === f ? '#00B39D18' : 'transparent',
                  color: filtro === f ? C.primary : C.t2,
                }}>
                {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ color: C.t3, fontSize: 13 }}>Carregando…</p>
          ) : itens.length === 0 ? (
            <p style={{ color: C.t3, fontSize: 13 }}>Nenhum feedback {filtro !== 'todos' ? 'neste filtro' : 'ainda'}. (Bom sinal — ou ninguém testou ainda.)</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {itens.map((it) => {
                const tm = TIPO_META[it.tipo] || TIPO_META.bug;
                const Icon = tm.icon;
                return (
                  <div key={it.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', borderLeft: `4px solid ${SEV_COR[it.severidade] || C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: tm.cor }}>
                        <Icon size={13} /> {tm.label}
                      </span>
                      <span style={{ fontSize: 11, color: C.t3 }}>· {it.user_email || 'anônimo'} {it.user_role ? `(${it.user_role})` : ''}</span>
                      <span style={{ fontSize: 11, color: C.t3 }}>· {quando(it.created_at)}</span>
                      {it.rota && <code style={{ fontSize: 11, color: C.t2, background: 'var(--cbrio-input-bg)', padding: '1px 6px', borderRadius: 4 }}>{it.rota}</code>}
                      <select value={it.status} onChange={(e) => mudarStatus(it.id, e.target.value)}
                        style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: 'pointer' }}>
                        {STATUS_OPCOES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div style={{ fontSize: 14, color: C.text, whiteSpace: 'pre-wrap' }}>{it.mensagem}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {aba === 'erros' && (
        loading ? (
          <p style={{ color: C.t3, fontSize: 13 }}>Carregando…</p>
        ) : erros.length === 0 ? (
          <p style={{ color: C.t3, fontSize: 13 }}>Nenhum erro 500 capturado. 🎉</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {erros.map((e) => (
              <div key={e.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', borderLeft: '4px solid #f97316' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: C.t3, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: '#f97316' }}>{e.status}</span>
                  <code style={{ color: C.t2 }}>{e.metodo} {e.rota}</code>
                  <span>· {e.user_email || 'sistema'}</span>
                  <span style={{ marginLeft: 'auto' }}>{quando(e.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text }}>{e.mensagem}</div>
              </div>
            ))}
          </div>
        )
      )}

      {aba === 'relatorio' && (
        loading ? (
          <p style={{ color: C.t3, fontSize: 13 }}>Carregando…</p>
        ) : relatorios.length === 0 ? (
          <p style={{ color: C.t3, fontSize: 13 }}>
            Nenhum relatório ainda. O agente roda 1x/dia (07:00), resume os reportes + erros do dia aqui e te avisa no sino. Pra ver agora, dispare uma vez no worker.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {relatorios.map((r) => {
              const at = r.actions_taken || {};
              return (
                <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 11, color: C.t3 }}>
                    <span style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{quando(r.created_at)}</span>
                    {typeof at.feedbacks === 'number' && <span>· {at.feedbacks} reporte(s)</span>}
                    {typeof at.erros === 'number' && <span>· {at.erros} erro(s)</span>}
                    {at.criticos ? <span style={{ color: '#ef4444', fontWeight: 700 }}>· {at.criticos} crítico(s)</span> : null}
                    {r.status === 'failed' && <span style={{ color: '#ef4444' }}>· falhou</span>}
                  </div>
                  <div style={{ fontSize: 13.5, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.summary || '(sem conteúdo)'}</div>
                </div>
              );
            })}
          </div>
        )
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Stat({ label, valor, cor }) {
  return (
    <div style={{ background: 'var(--cbrio-card)', border: '1px solid var(--cbrio-border)', borderRadius: 12, padding: '12px 18px', minWidth: 110 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || 'var(--cbrio-text)', lineHeight: 1 }}>{valor ?? '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--cbrio-text3)', marginTop: 4 }}>{label}</div>
    </div>
  );
}
