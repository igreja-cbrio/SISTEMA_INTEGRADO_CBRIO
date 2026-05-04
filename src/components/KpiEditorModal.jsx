// ============================================================================
// KpiEditorModal - cria/edita um indicador tatico (kpi_indicadores_taticos)
//
// Props:
//   open: boolean
//   kpi: objeto vindo de useKpis() | null  (null = create)
//   onClose: () => void
//   onSaved: (kpi) => void
//
// Campos editaveis:
//   id (so na criacao), area, indicador, descricao, periodicidade,
//   periodo_offset_meses, meta_descricao, meta_valor, unidade, pilar,
//   responsavel_area, apuracao, sort_order, ativo, valores[].
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useKpis } from '../hooks/useKpis';
import { AREAS } from '../data/indicadores';
import { rh as rhApi } from '../api';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#e6f7f5',
  red: '#ef4444', redBg: '#fee2e2',
};

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)',
  color: 'var(--cbrio-text)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};

const PERIODICIDADES = ['semanal', 'mensal', 'trimestral', 'semestral', 'anual'];
const VALORES_KEYS = [
  { key: 'seguir', label: 'Seguir Jesus', color: '#3b82f6' },
  { key: 'conectar', label: 'Conectar', color: '#8b5cf6' },
  { key: 'investir', label: 'Investir Tempo', color: '#f59e0b' },
  { key: 'servir', label: 'Servir', color: '#10b981' },
  { key: 'generosidade', label: 'Generosidade', color: '#ef4444' },
];

// Opcoes de offset segundo a periodicidade.
function offsetOptionsFor(periodicidade) {
  const p = String(periodicidade || '').toLowerCase();
  if (p === 'trimestral') {
    return [
      { value: 0, label: 'Jan/Abr/Jul/Out (padrão)' },
      { value: 1, label: 'Fev/Mai/Ago/Nov' },
      { value: 2, label: 'Mar/Jun/Set/Dez' },
    ];
  }
  if (p === 'semestral') {
    return [
      { value: 0, label: 'Jan/Jul (padrão)' },
      { value: 1, label: 'Fev/Ago' },
      { value: 2, label: 'Mar/Set' },
      { value: 3, label: 'Abr/Out' },
      { value: 4, label: 'Mai/Nov' },
      { value: 5, label: 'Jun/Dez' },
    ];
  }
  if (p === 'anual') {
    return [
      { value: 0, label: 'Janeiro (padrão)' },
      { value: 1, label: 'Fevereiro' },
      { value: 2, label: 'Março' },
      { value: 3, label: 'Abril' },
      { value: 4, label: 'Maio' },
      { value: 5, label: 'Junho' },
      { value: 6, label: 'Julho' },
      { value: 7, label: 'Agosto' },
      { value: 8, label: 'Setembro' },
      { value: 9, label: 'Outubro' },
      { value: 10, label: 'Novembro' },
      { value: 11, label: 'Dezembro' },
    ];
  }
  return null;
}

const EMPTY = {
  id: '', area: '', indicador: '', descricao: '',
  periodicidade: 'mensal', periodo_offset_meses: 0,
  meta_descricao: '', meta_valor: '', unidade: '', pilar: '',
  responsavel_area: '', apuracao: '', sort_order: 0, ativo: true,
  valores: [], is_okr: false, lider_funcionario_id: '',
};

export default function KpiEditorModal({ open, kpi, onClose, onSaved }) {
  const { create, update } = useKpis();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [funcionarios, setFuncionarios] = useState([]);
  const isEdit = !!kpi;

  // Carrega funcionarios ativos pra dropdown de lider
  useEffect(() => {
    if (!open) return;
    rhApi.funcionarios.list({ status: 'ativo' })
      .then(setFuncionarios)
      .catch(() => setFuncionarios([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (kpi) {
      setForm({
        id: kpi.id,
        area: kpi.area || '',
        indicador: kpi.indicador || kpi.nome || '',
        descricao: kpi.descricao || '',
        periodicidade: kpi.periodicidade || 'mensal',
        periodo_offset_meses: kpi.periodo_offset_meses ?? 0,
        meta_descricao: kpi.meta_descricao || '',
        meta_valor: kpi.meta_valor ?? '',
        unidade: kpi.unidade || '',
        pilar: kpi.pilar || '',
        responsavel_area: kpi.responsavel_area || '',
        apuracao: kpi.apuracao || '',
        sort_order: kpi.sort_order ?? 0,
        ativo: kpi.ativo !== false,
        valores: kpi.valores || [],
        is_okr: !!kpi.is_okr,
        lider_funcionario_id: kpi.lider_funcionario_id || '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, kpi]);

  const offsetOpts = useMemo(() => offsetOptionsFor(form.periodicidade), [form.periodicidade]);

  if (!open) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleValor = (key) => {
    setForm(f => {
      const has = f.valores.includes(key);
      return { ...f, valores: has ? f.valores.filter(x => x !== key) : [...f.valores, key] };
    });
  };

  const submit = async () => {
    setErr(null);
    if (!form.indicador.trim()) { setErr('Nome do indicador obrigatório'); return; }
    if (!form.area) { setErr('Área obrigatória'); return; }
    if (!isEdit && !form.id.trim()) { setErr('ID obrigatório (ex: GRUP-06)'); return; }
    if (form.is_okr && form.valores.length === 0) {
      setErr('KPI marcado como OKR precisa ter pelo menos 1 valor da jornada vinculado');
      return;
    }
    if (form.valores.length === 0) {
      setErr('Selecione pelo menos 1 valor da jornada (todo KPI deve estar vinculado a um valor)');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        meta_valor: form.meta_valor === '' ? null : Number(form.meta_valor),
        periodo_offset_meses: Number(form.periodo_offset_meses) || 0,
        sort_order: Number(form.sort_order) || 0,
      };
      const saved = isEdit
        ? await update(kpi.id, payload)
        : await create(payload);
      onSaved?.(saved);
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay }} onClick={onClose}>
      <div style={{ background: C.modalBg, borderRadius: 12, width: 720, maxHeight: '92vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: C.text }}>{isEdit ? `Editar ${kpi.id}` : 'Novo KPI'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.t3 }}>×</button>
        </div>

        {err && (
          <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13 }}>{err}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* ID (so create) */}
          {!isEdit && (
            <Field label="ID *" hint="ex: GRUP-06, AMI-10">
              <input value={form.id} onChange={e => set('id', e.target.value.toUpperCase())} style={inp} />
            </Field>
          )}

          {/* Area */}
          <Field label="Área *">
            <select value={form.area} onChange={e => set('area', e.target.value)} style={inp}>
              <option value="">Selecione...</option>
              {AREAS.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>

          {/* Nome (span full) */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Nome do indicador *">
              <input value={form.indicador} onChange={e => set('indicador', e.target.value)} style={inp} />
            </Field>
          </div>

          {/* Descricao */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Descrição (contexto, o porque)">
              <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
            </Field>
          </div>

          {/* Periodicidade */}
          <Field label="Periodicidade *">
            <select value={form.periodicidade} onChange={e => { set('periodicidade', e.target.value); set('periodo_offset_meses', 0); }} style={inp}>
              {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          {/* Offset (quando aplicavel) */}
          {offsetOpts ? (
            <Field label={`Mês inicial (${form.periodicidade})`}>
              <select value={form.periodo_offset_meses} onChange={e => set('periodo_offset_meses', Number(e.target.value))} style={inp}>
                {offsetOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          ) : (
            <Field label=" "><div style={{ height: 36 }} /></Field>
          )}

          {/* Meta */}
          <Field label="Meta (descrição)">
            <input value={form.meta_descricao} onChange={e => set('meta_descricao', e.target.value)} placeholder="ex: +30% em 6m" style={inp} />
          </Field>
          <Field label="Meta (valor numérico)">
            <input type="number" value={form.meta_valor} onChange={e => set('meta_valor', e.target.value)} style={inp} />
          </Field>
          <Field label="Unidade">
            <input value={form.unidade} onChange={e => set('unidade', e.target.value)} placeholder="%, R$, pessoas..." style={inp} />
          </Field>
          <Field label="Pilar">
            <input value={form.pilar} onChange={e => set('pilar', e.target.value)} placeholder="Crescimento, Servico..." style={inp} />
          </Field>

          {/* Responsavel + Apuracao */}
          <Field label="Responsável (área/cargo) — descrição livre">
            <input value={form.responsavel_area} onChange={e => set('responsavel_area', e.target.value)} style={inp} placeholder="Ex: Coord Voluntariado" />
          </Field>
          <Field label="Apuração (como calcular)">
            <input value={form.apuracao} onChange={e => set('apuracao', e.target.value)} style={inp} />
          </Field>

          {/* Lider funcionario (vincula com RH) */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Líder responsável (funcionário)" hint="Quem é cobrado pelo OKR. Notificações e filtro 'meus OKRs' usam este campo.">
              <select value={form.lider_funcionario_id || ''} onChange={e => set('lider_funcionario_id', e.target.value || null)} style={inp}>
                <option value="">— Sem líder definido —</option>
                {funcionarios.length === 0 && <option disabled>Carregando funcionários...</option>}
                {funcionarios.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.nome}{f.cargo ? ` — ${f.cargo}` : ''}{f.area ? ` (${f.area})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Sort + Ativo */}
          <Field label="Ordem">
            <input type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} style={inp} />
          </Field>
          <Field label="Ativo">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} />
              <span style={{ fontSize: 13, color: C.text }}>{form.ativo ? 'Sim — aparece nos dashboards' : 'Não — soft-deleted'}</span>
            </label>
          </Field>

          {/* OKR toggle (span full) */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Marcar como OKR (objetivo estratégico chave)" hint="Quando OKR, é obrigatório vincular pelo menos 1 valor da jornada abaixo.">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `2px solid ${form.is_okr ? '#f59e0b' : C.border}`, background: form.is_okr ? '#fef3c7' : C.inputBg, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_okr} onChange={e => set('is_okr', e.target.checked)} />
                <span style={{ fontSize: 13, fontWeight: 600, color: form.is_okr ? '#b45309' : C.text }}>
                  {form.is_okr ? '⭐ É um OKR — destaque na visão estratégica' : 'KPI operacional comum'}
                </span>
              </label>
            </Field>
          </div>

          {/* Valores (5 chips) */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label={`Valores da jornada que este KPI alimenta * ${form.valores.length === 0 ? '(obrigatório)' : `(${form.valores.length} selecionado${form.valores.length > 1 ? 's' : ''})`}`}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VALORES_KEYS.map(v => {
                  const sel = form.valores.includes(v.key);
                  return (
                    <button key={v.key} type="button" onClick={() => toggleValor(v.key)}
                      style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                               border: sel ? `2px solid ${v.color}` : `1px solid ${C.border}`,
                               background: sel ? v.color + '20' : 'transparent',
                               color: sel ? v.color : C.t2 }}>
                      {sel ? '✓ ' : ''}{v.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.t2, border: `1px solid ${C.border}` }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', background: C.primary, color: '#fff', border: 'none', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar KPI'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cbrio-text2)', display: 'block', marginBottom: 4 }}>
        {label}
        {hint && <span style={{ fontSize: 10, color: 'var(--cbrio-text3)', fontWeight: 400, marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}
