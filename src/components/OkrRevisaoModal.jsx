// ============================================================================
// OkrRevisaoModal — registra revisao de OKR (regra de ouro do ritual mensal)
//
// "Todo desvio gera causa, decisao, responsavel e proximo passo."
//
// Props:
//   open, kpi (objeto KPI), onClose, onSaved
//   defaultPeriodKey? (string ex: '2026-05')
// ============================================================================

import { useEffect, useState } from 'react';
import { ritual as ritualApi, rh as rhApi } from '../api';
import { AlertCircle, X, Save } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryDark: '#00897B',
  red: '#ef4444', redBg: '#fee2e2',
};

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.inputBg,
  color: C.text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};

function periodoMensalAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

  useEffect(() => {
    if (!open || !kpi) return;
    const periodo = defaultPeriodKey || periodoMensalAtual();
    const traj = kpi.trajetoria;
    const statusInicial = traj?.status_trajetoria === 'critico' ? 'vermelho'
      : traj?.status_trajetoria === 'atras' ? 'amarelo'
      : 'vermelho';
    setForm({
      periodo_referencia: periodo,
      status_no_periodo: statusInicial,
      causa_desvio: '',
      decisao: '',
      responsavel_funcionario_id: kpi.lider_funcionario_id || '',
      proximo_passo: '',
      prazo_proximo_passo: '',
    });
    setErr(null);
    rhApi.funcionarios.list({ status: 'ativo' })
      .then(setFuncionarios)
      .catch(() => setFuncionarios([]));
  }, [open, kpi, defaultPeriodKey]);

  if (!open || !kpi) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.causa_desvio.trim()) return setErr('Causa do desvio obrigatoria');
    if (!form.decisao.trim())     return setErr('Decisao tomada obrigatoria');
    if (!form.periodo_referencia) return setErr('Periodo obrigatorio');

    setErr(null);
    setSaving(true);
    try {
      await ritualApi.revisar(kpi.id, {
        periodo_referencia: form.periodo_referencia,
        status_no_periodo: form.status_no_periodo,
        causa_desvio: form.causa_desvio.trim(),
        decisao: form.decisao.trim(),
        responsavel_funcionario_id: form.responsavel_funcionario_id || null,
        proximo_passo: form.proximo_passo.trim() || null,
        prazo_proximo_passo: form.prazo_proximo_passo || null,
      });
      toast.success('Revisao registrada');
      onSaved?.();
    } catch (e) {
      setErr(e?.message || 'Erro ao salvar');
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay, padding: 16 }}
      onClick={() => !saving && onClose?.()}
    >
      <div
        style={{ background: C.modalBg, borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.primaryDark, letterSpacing: 0.5 }}>{kpi.id}</span>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, textTransform: 'capitalize' }}>{kpi.area}</span>
              {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>OKR</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: 16, color: C.text, lineHeight: 1.3 }}>{kpi.indicador || kpi.nome}</h2>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: C.t3 }}>
              Registrar revisao (causa do desvio + decisao + proximo passo)
            </p>
          </div>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Periodo *">
              <input value={form.periodo_referencia} onChange={e => set('periodo_referencia', e.target.value)}
                placeholder="2026-05" style={inp} />
            </Field>
            <Field label="Status no periodo">
              <select value={form.status_no_periodo} onChange={e => set('status_no_periodo', e.target.value)} style={inp}>
                <option value="vermelho">Vermelho — fora do alvo</option>
                <option value="amarelo">Amarelo — em risco</option>
                <option value="verde">Verde — no alvo (revisao preventiva)</option>
                <option value="pendente">Pendente — sem dado</option>
              </select>
            </Field>
            <FieldFull label="Causa do desvio *">
              <textarea value={form.causa_desvio} onChange={e => set('causa_desvio', e.target.value)}
                placeholder="Por que o KPI esta fora do alvo?"
                rows={2} style={{ ...inp, resize: 'vertical' }} />
            </FieldFull>
            <FieldFull label="Decisao tomada *">
              <textarea value={form.decisao} onChange={e => set('decisao', e.target.value)}
                placeholder="O que foi decidido na revisao?"
                rows={2} style={{ ...inp, resize: 'vertical' }} />
            </FieldFull>
            <Field label="Responsavel (proximo passo)">
              <select value={form.responsavel_funcionario_id} onChange={e => set('responsavel_funcionario_id', e.target.value)} style={inp}>
                <option value="">— Sem responsavel —</option>
                {funcionarios.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}{f.cargo ? ` — ${f.cargo}` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Prazo do proximo passo">
              <input type="date" value={form.prazo_proximo_passo} onChange={e => set('prazo_proximo_passo', e.target.value)} style={inp} />
            </Field>
            <FieldFull label="Proximo passo">
              <textarea value={form.proximo_passo} onChange={e => set('proximo_passo', e.target.value)}
                placeholder="Acao concreta a ser executada"
                rows={2} style={{ ...inp, resize: 'vertical' }} />
            </FieldFull>
          </div>

          {err && (
            <div style={{ display: 'flex', gap: 8, padding: 10, marginTop: 12, borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{err}</span>
            </div>
          )}
        </div>

        <footer style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.t2, border: `1px solid ${C.border}` }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving}
            style={{ padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', background: C.primary, color: '#fff', border: 'none', opacity: saving ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Registrar revisao'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}
function FieldFull({ label, children }) {
  return (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}
