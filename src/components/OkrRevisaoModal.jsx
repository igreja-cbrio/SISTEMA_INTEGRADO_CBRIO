// ============================================================================
// OkrRevisaoModal - registra revisao de OKR (regra de ouro do ritual)
//
// "Todo desvio deve gerar causa, decisao, responsavel e proximo passo."
//
// Props:
//   open, kpi (objeto KPI completo), onClose, onSaved
//   defaultPeriodKey (string, ex: '2026-04')
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { okrs as okrsApi, rh as rhApi } from '../api';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#e6f7f5',
  red: '#ef4444', redBg: '#fee2e2',
  green: '#10b981', greenBg: '#d1fae5',
  amber: '#f59e0b', amberBg: '#fef3c7',
};

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.inputBg,
  color: C.text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};

function periodKeyDefault(periodicidade) {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const p = String(periodicidade || 'mensal').toLowerCase();
  if (p === 'mensal') return `${y}-${String(m).padStart(2, '0')}`;
  if (p === 'trimestral') return `${y}-Q${Math.ceil(m / 3)}`;
  if (p === 'semestral') return `${y}-S${m <= 6 ? 1 : 2}`;
  if (p === 'anual') return String(y);
  // semanal: ISO week
  const tmp = new Date(d); tmp.setHours(0,0,0,0);
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

export default function OkrRevisaoModal({ open, kpi, onClose, onSaved, defaultPeriodKey }) {
  const [funcionarios, setFuncionarios] = useState([]);
  const [form, setForm] = useState({
    periodo_referencia: '',
    status_no_periodo: 'vermelho',
    causa_desvio: '',
    decisao: '',
    responsavel_funcionario_id: '',
    proximo_passo: '',
    prazo_proximo_passo: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const periodoDefault = useMemo(() =>
    defaultPeriodKey || (kpi ? periodKeyDefault(kpi.periodicidade) : '')
  , [kpi, defaultPeriodKey]);

  useEffect(() => {
    if (!open || !kpi) return;
    setForm({
      periodo_referencia: periodoDefault,
      status_no_periodo: 'vermelho',
      causa_desvio: '',
      decisao: '',
      responsavel_funcionario_id: kpi.lider_funcionario_id || '',
      proximo_passo: '',
      prazo_proximo_passo: '',
    });
    setErr(null);
    setDone(false);
    rhApi.funcionarios.list({ status: 'ativo' })
      .then(setFuncionarios)
      .catch(() => setFuncionarios([]));
  }, [open, kpi, periodoDefault]);

  if (!open || !kpi) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.causa_desvio.trim()) { setErr('Causa do desvio é obrigatória'); return; }
    if (!form.decisao.trim()) { setErr('Decisão tomada é obrigatória'); return; }
    if (!form.periodo_referencia.trim()) { setErr('Período é obrigatório'); return; }
    setErr(null);
    setSaving(true);
    try {
      await okrsApi.revisoes.create(kpi.id, {
        periodo_referencia: form.periodo_referencia,
        status_no_periodo: form.status_no_periodo,
        causa_desvio: form.causa_desvio.trim(),
        decisao: form.decisao.trim(),
        responsavel_funcionario_id: form.responsavel_funcionario_id || null,
        proximo_passo: form.proximo_passo.trim() || null,
        prazo_proximo_passo: form.prazo_proximo_passo || null,
      });
      setDone(true);
      onSaved?.();
      setTimeout(() => { onClose?.(); }, 1000);
    } catch (e) {
      setErr(e?.message || 'Erro ao salvar');
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay }}
      onClick={() => !saving && onClose?.()}
    >
      <div
        style={{ background: C.modalBg, borderRadius: 12, width: 600, maxHeight: '92vh', overflow: 'auto', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{kpi.id}</span>
          {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>⭐ OKR</span>}
        </div>
        <h2 style={{ margin: 0, fontSize: 18, color: C.text }}>{kpi.indicador || kpi.nome}</h2>
        <p style={{ margin: '4px 0 16px', fontSize: 12, color: C.t3 }}>
          Registrar revisão (causa do desvio + decisão + próximo passo). Esta é a "regra de ouro" do ritual mensal.
        </p>

        {done ? (
          <div style={{ padding: 24, textAlign: 'center', background: C.greenBg, borderRadius: 8 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>Revisão registrada</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>Período *</label>
                <input value={form.periodo_referencia} onChange={e => set('periodo_referencia', e.target.value)}
                  placeholder="2026-04 / 2026-Q1 / 2026-S1" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>Status no período</label>
                <select value={form.status_no_periodo} onChange={e => set('status_no_periodo', e.target.value)} style={inp}>
                  <option value="vermelho">🔴 Vermelho — fora do alvo</option>
                  <option value="amarelo">🟡 Amarelo — em risco</option>
                  <option value="verde">🟢 Verde — no alvo (revisão preventiva)</option>
                  <option value="pendente">⏳ Pendente — sem dado</option>
                </select>
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>
                  Causa do desvio *
                </label>
                <textarea value={form.causa_desvio} onChange={e => set('causa_desvio', e.target.value)}
                  placeholder="Por que o KPI está fora do alvo?"
                  rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>
                  Decisão tomada *
                </label>
                <textarea value={form.decisao} onChange={e => set('decisao', e.target.value)}
                  placeholder="O que foi decidido na revisão?"
                  rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>
                  Responsável (próximo passo)
                </label>
                <select value={form.responsavel_funcionario_id} onChange={e => set('responsavel_funcionario_id', e.target.value)} style={inp}>
                  <option value="">— Sem responsável —</option>
                  {funcionarios.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.nome}{f.cargo ? ` — ${f.cargo}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>
                  Prazo do próximo passo
                </label>
                <input type="date" value={form.prazo_proximo_passo} onChange={e => set('prazo_proximo_passo', e.target.value)} style={inp} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>
                  Próximo passo
                </label>
                <textarea value={form.proximo_passo} onChange={e => set('proximo_passo', e.target.value)}
                  placeholder="Ação concreta a ser executada"
                  rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>

            {err && (
              <div style={{ display: 'flex', gap: 8, padding: 10, marginTop: 12, borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13 }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>{err}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <button onClick={onClose} disabled={saving}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.t2, border: `1px solid ${C.border}` }}>
                Cancelar
              </button>
              <button onClick={submit} disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', background: C.primary, color: '#fff', border: 'none', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Salvando...' : 'Registrar revisão'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
