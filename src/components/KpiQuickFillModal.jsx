// ============================================================================
// KpiQuickFillModal - modal minimo pra preencher um KPI em 2 cliques
//
// Aberto a partir de /meus-kpis. Mostra nome do KPI + input valor + botao OK.
// Salva direto no kpi_registros via upsert (substitui se ja tem registro do
// mesmo periodo).
//
// Por padrao usa o periodo passado em props (periodKey). Se o usuario clicar
// em "alterar periodo", abre um seletor pra escolher um periodo passado
// (uteis pra preenchimento historico).
//
// Props:
//   open: boolean
//   kpi: { id, indicador, periodicidade, unidade, ... } | null
//   periodKey: string (ex '2026-W18', '2026-04')  - periodo default (corrente)
//   onClose: () => void
//   onSaved: (registro) => void
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { kpis as kpisApi } from '../api';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D',
  red: '#ef4444', redBg: '#fee2e2',
  green: '#10b981', greenBg: '#d1fae5',
};

// Calcula periodKey a partir de uma data e periodicidade (espelha backend)
function calcPeriodKey(periodicidade, date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'mensal': return `${y}-${m}`;
    case 'trimestral': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'semestral': return `${y}-S${date.getUTCMonth() < 6 ? 1 : 2}`;
    case 'anual': return `${y}`;
    default: return `${y}-${m}`;
  }
}

const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Gera lista de periodos passados (incluindo o atual) para o seletor
function gerarPeriodosPassados(periodicidade, qtd = 12) {
  const out = [];
  const hoje = new Date();
  for (let i = 0; i < qtd; i++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
    if (periodicidade === 'mensal') d.setUTCMonth(d.getUTCMonth() - i);
    else if (periodicidade === 'semanal') d.setUTCDate(d.getUTCDate() - i * 7);
    else if (periodicidade === 'trimestral') d.setUTCMonth(d.getUTCMonth() - i * 3);
    else if (periodicidade === 'semestral') d.setUTCMonth(d.getUTCMonth() - i * 6);
    else if (periodicidade === 'anual') d.setUTCFullYear(d.getUTCFullYear() - i);
    else d.setUTCMonth(d.getUTCMonth() - i);

    const key = calcPeriodKey(periodicidade, d);
    const label = formatarPeriodoLabel(periodicidade, d);
    if (!out.find(p => p.key === key)) out.push({ key, label, isCurrent: i === 0 });
  }
  return out;
}

function formatarPeriodoLabel(periodicidade, date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  switch (periodicidade) {
    case 'mensal': return `${MES_LABEL[m]}/${y}`;
    case 'semanal': return calcPeriodKey('semanal', date).replace('-W', ' · sem ');
    case 'trimestral': return `Q${Math.floor(m / 3) + 1}/${y}`;
    case 'semestral': return `S${m < 6 ? 1 : 2}/${y}`;
    case 'anual': return `${y}`;
    default: return calcPeriodKey(periodicidade, date);
  }
}

export default function KpiQuickFillModal({ open, kpi, periodKey, onClose, onSaved }) {
  const [valor, setValor] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(periodKey);
  const [editPeriod, setEditPeriod] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValor('');
    setObs('');
    setErr(null);
    setDone(false);
    setEditPeriod(false);
    setSelectedPeriod(periodKey);
  }, [open, kpi?.id, periodKey]);

  const periodOptions = useMemo(() => {
    if (!kpi) return [];
    return gerarPeriodosPassados(kpi.periodicidade || 'mensal', 12);
  }, [kpi]);

  if (!open || !kpi) return null;

  const isPeriodPassado = selectedPeriod !== periodKey;

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
        periodo_referencia: selectedPeriod,
        valor_realizado: Number(valor),
        observacoes: obs || null,
      });
      setDone(true);
      onSaved?.({ kpi, periodKey: selectedPeriod, valor: Number(valor) });
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
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: isPeriodPassado ? '#f59e0b' : C.t3, fontWeight: isPeriodPassado ? 700 : 400 }}>
                período {selectedPeriod}{isPeriodPassado ? ' (histórico)' : ''}
              </span>
              {!editPeriod && (
                <button
                  type="button"
                  onClick={() => setEditPeriod(true)}
                  style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 10, padding: 0, fontWeight: 600 }}
                >
                  alterar
                </button>
              )}
            </div>
          </div>
          <h2 style={{ margin: 0, fontSize: 16, color: C.text }}>{kpi.indicador || kpi.nome}</h2>
          {kpi.meta_descricao && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: C.t3 }}>Meta: {kpi.meta_descricao}</p>
          )}
        </div>

        {/* Seletor de periodo (so abre quando o usuario clica em "alterar") */}
        {editPeriod && !done && (
          <div style={{ marginBottom: 10, padding: 10, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 6 }}>
              Selecione o período de referência
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
                fontSize: 13, boxSizing: 'border-box',
              }}
            >
              {periodOptions.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label} {p.isCurrent ? '(atual)' : ''} — {p.key}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>
              Use para preencher meses/semanas anteriores. Se já existe registro nesse período, será substituído.
            </div>
          </div>
        )}

        {done ? (
          <div style={{ padding: 24, textAlign: 'center', background: C.greenBg, borderRadius: 8 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>Registrado em {selectedPeriod}</div>
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
