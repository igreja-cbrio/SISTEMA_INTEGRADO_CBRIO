// ============================================================================
// KpiQuickFillModal - modal minimo pra preencher um KPI em 2 cliques
//
// Aberto a partir de MinhaSemanaPendente (e onde mais quiser). Mostra
// nome do KPI + input valor + botao OK. Salva direto no kpi_registros
// via upsert (substitui se ja tem registro do mesmo periodo).
//
// Props:
//   open: boolean
//   kpi: { id, indicador, periodicidade, unidade, ... } | null
//   periodKey: string (ex '2026-W18', '2026-04')
//   onClose: () => void
//   onSaved: (registro) => void
// ============================================================================

import { useEffect, useState } from 'react';
import { kpis as kpisApi } from '../api';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D',
  red: '#ef4444', redBg: '#fee2e2',
  green: '#10b981', greenBg: '#d1fae5',
};

export default function KpiQuickFillModal({ open, kpi, periodKey, onClose, onSaved }) {
  const [valor, setValor] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValor('');
    setObs('');
    setErr(null);
    setDone(false);
  }, [open, kpi?.id]);

  if (!open || !kpi) return null;

  const submit = async () => {
    if (valor === '' || valor == null) {
      setErr('Informe o valor');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await kpisApi.v2.registros.create({
        indicador_id: kpi.id,
        periodo_referencia: periodKey,
        valor_realizado: Number(valor),
        observacoes: obs || null,
      });
      setDone(true);
      onSaved?.({ kpi, periodKey, valor: Number(valor) });
      // Auto-fecha apos 800ms pra dar feedback visual
      setTimeout(() => { onClose?.(); }, 800);
    } catch (e) {
      setErr(e?.message || 'Erro ao salvar');
      setSaving(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !saving && !done) submit();
    if (e.key === 'Escape') onClose?.();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay }}
      onClick={() => !saving && onClose?.()}
    >
      <div
        style={{ background: C.modalBg, borderRadius: 12, width: 460, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        {/* Header compacto */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{kpi.id}</span>
            {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>OKR</span>}
            <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>período {periodKey}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 16, color: C.text }}>{kpi.indicador || kpi.nome}</h2>
          {kpi.meta_descricao && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: C.t3 }}>Meta: {kpi.meta_descricao}</p>
          )}
        </div>

        {done ? (
          <div style={{ padding: 24, textAlign: 'center', background: C.greenBg, borderRadius: 8 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>Registrado com sucesso</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>
                Valor {kpi.unidade && <span style={{ color: C.t3, fontWeight: 400 }}>({kpi.unidade})</span>}
              </label>
              <input
                type="number"
                step="any"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Digite o valor..."
                autoFocus
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
                  fontSize: 16, fontWeight: 600, boxSizing: 'border-box',
                }}
              />
            </div>

            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: C.t3, userSelect: 'none' }}>+ Observação (opcional)</summary>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Comentário sobre este registro..."
                rows={2}
                style={{
                  marginTop: 6, width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
                  fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
                }}
              />
            </details>

            {err && (
              <div style={{ padding: 8, marginBottom: 10, borderRadius: 6, background: C.redBg, color: C.red, fontSize: 12 }}>{err}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={onClose}
                disabled={saving}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.t2, border: `1px solid ${C.border}` }}
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={saving || valor === ''}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving || valor === '' ? 'not-allowed' : 'pointer', background: C.primary, color: '#fff', border: 'none', opacity: saving || valor === '' ? 0.5 : 1 }}
              >
                {saving ? 'Salvando...' : 'Salvar (Enter)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
