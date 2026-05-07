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

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useKpis } from '../hooks/useKpis';
import { AREAS } from '../data/indicadores';
import { rh as rhApi, estrategia as estrategiaApi } from '../api';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { toast } from 'sonner';

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
  objetivo_geral_id: '', memoria_calculo: '', observacoes: '',
};

export default function KpiEditorModal({ open, kpi, onClose, onSaved, defaultArea, allowedAreas }) {
  const { create, update } = useKpis();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [funcionarios, setFuncionarios] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [krs, setKrs] = useState([]);
  const [editKr, setEditKr] = useState(null);
  const isEdit = !!kpi;

  // Carrega dropdowns: funcionarios + objetivos
  useEffect(() => {
    if (!open) return;
    rhApi.funcionarios.list({ status: 'ativo' })
      .then(setFuncionarios)
      .catch(() => setFuncionarios([]));
    estrategiaApi.objetivos.list({ ativos: 'true' })
      .then(setObjetivos)
      .catch(() => setObjetivos([]));
  }, [open]);

  // Carrega KRs especificos do KPI (se em edicao)
  const loadKrs = useCallback(() => {
    if (!isEdit || !kpi?.id) { setKrs([]); return; }
    estrategiaApi.krs.list({ kpi_id: kpi.id })
      .then(setKrs)
      .catch(() => setKrs([]));
  }, [isEdit, kpi?.id]);
  useEffect(() => { if (open) loadKrs(); }, [open, loadKrs]);

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
        objetivo_geral_id: kpi.objetivo_geral_id || '',
        memoria_calculo: kpi.memoria_calculo || '',
        observacoes: kpi.observacoes || '',
      });
    } else {
      setForm({ ...EMPTY, area: defaultArea || '' });
    }
  }, [open, kpi, defaultArea]);

  const removerKr = async (kr) => {
    if (!window.confirm(`Remover KR "${kr.titulo}"?`)) return;
    try {
      await estrategiaApi.krs.remove(kr.id);
      toast.success('KR removido');
      loadKrs();
    } catch (e) { toast.error(e?.message); }
  };

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
        objetivo_geral_id: form.objetivo_geral_id || null,
        memoria_calculo: form.memoria_calculo || null,
        observacoes: form.observacoes || null,
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
            <select value={form.area} onChange={e => set('area', e.target.value)} style={inp} disabled={isEdit && allowedAreas && !allowedAreas.includes(String(form.area).toLowerCase())}>
              <option value="">Selecione...</option>
              {AREAS
                .filter(a => !allowedAreas || allowedAreas.includes(String(a.id).toLowerCase()))
                .map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            {allowedAreas && (
              <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                Você só pode criar KPIs nas áreas que lidera.
              </div>
            )}
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

          {/* Objetivo Geral + Memoria + Observacoes (Fase 2.5C) */}
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Objetivo Geral (agrupa KPIs do mesmo tema)" hint="Ex: 'Aumentar batismos' agrupa o KPI de cada area. Cascata automatica: ao preencher este KPI, o objetivo geral atualiza % automaticamente.">
              <select value={form.objetivo_geral_id || ''} onChange={e => set('objetivo_geral_id', e.target.value || null)} style={inp}>
                <option value="">— Sem objetivo geral —</option>
                {objetivos.length === 0 && <option disabled>Carregando objetivos...</option>}
                {objetivos.map(o => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Memoria de calculo" hint="Como o indicador eh efetivamente calculado. Ex: '% crescimento da frequencia em relacao a semana anterior'.">
              <textarea value={form.memoria_calculo} onChange={e => set('memoria_calculo', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }}
                placeholder="Ex: '8% da frequencia media dominical'" />
            </Field>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Observacoes adicionais">
              <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }}
                placeholder="Notas, ressalvas, etc" />
            </Field>
          </div>
        </div>

        {/* KRs especificos (so em edit, depois de salvo o KPI) */}
        {isEdit && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Resultados-chave (KRs) deste KPI
                </h3>
                <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
                  Analises que triangulam o KPI principal. Ex: alem de "% crescimento da frequencia",
                  KRs como "0 cultos com queda &gt; 15%" ou "% retencao semana-a-semana".
                </p>
              </div>
              <button type="button" onClick={() => setEditKr({ kpi_id: form.id })}
                style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: C.primary, color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Plus size={13} /> Novo KR
              </button>
            </div>
            {krs.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: C.t3, background: C.inputBg, borderRadius: 6, fontStyle: 'italic' }}>
                Nenhum KR especifico ainda. Sugerido: 2-4 KRs que ajudam a triangular o resultado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {krs.map(kr => (
                  <div key={kr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{kr.titulo}</div>
                      {(kr.meta_valor != null || kr.meta_texto) && (
                        <div style={{ fontSize: 10, color: C.t3 }}>
                          meta: {kr.meta_valor != null ? `${kr.meta_valor}${kr.unidade ? ' ' + kr.unidade : ''}` : kr.meta_texto}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setEditKr(kr)}
                      style={{ background: 'transparent', border: 'none', padding: 6, color: C.t3, cursor: 'pointer' }}><Pencil size={12} /></button>
                    <button type="button" onClick={() => removerKr(kr)}
                      style={{ background: 'transparent', border: 'none', padding: 6, color: '#ef4444', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

      {/* Sub-modal: editor de KR especifico */}
      {editKr && (
        <KrEditorInline
          kr={editKr}
          onClose={() => setEditKr(null)}
          onSaved={() => { setEditKr(null); loadKrs(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// KrEditorInline — modal-em-modal para editar KR especifico do KPI
// ============================================================================
function KrEditorInline({ kr, onClose, onSaved }) {
  const isNovo = !kr.id;
  const [form, setForm] = useState({
    titulo: kr.titulo || '',
    descricao: kr.descricao || '',
    formula_calculo: kr.formula_calculo || '',
    meta_valor: kr.meta_valor ?? '',
    meta_texto: kr.meta_texto || '',
    unidade: kr.unidade || '',
    ordem: kr.ordem || 99,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.titulo.trim()) return toast.error('Titulo obrigatorio');
    setSaving(true);
    try {
      const payload = {
        ...form,
        meta_valor: form.meta_valor === '' ? null : Number(form.meta_valor),
      };
      if (isNovo) {
        payload.kpi_id = kr.kpi_id;
        await estrategiaApi.krs.create(payload);
        toast.success('KR criado');
      } else {
        await estrategiaApi.krs.update(kr.id, payload);
        toast.success('KR atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar KR');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 12, width: 520, maxHeight: '85vh', overflow: 'auto' }}>
        <header style={{ padding: 16, borderBottom: '1px solid var(--cbrio-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {isNovo ? 'Novo KR especifico' : 'Editar KR'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cbrio-text3)', padding: 4 }}>
            <X size={18} />
          </button>
        </header>
        <div style={{ padding: 16 }}>
          <Field label="Titulo *">
            <input value={form.titulo} onChange={e => set('titulo', e.target.value)} style={inp}
              placeholder='Ex: "0 cultos com queda > 15%"' />
          </Field>
          <Field label="Descricao">
            <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </Field>
          <Field label="Formula de calculo">
            <input value={form.formula_calculo} onChange={e => set('formula_calculo', e.target.value)} style={inp}
              placeholder='Como medir' />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Meta (numerica)">
              <input type="number" value={form.meta_valor} onChange={e => set('meta_valor', e.target.value)} style={inp} />
            </Field>
            <Field label="Unidade">
              <input value={form.unidade} onChange={e => set('unidade', e.target.value)} style={inp} placeholder="%, pessoas, R$..." />
            </Field>
          </div>
          <Field label="Meta (texto, alternativa)">
            <input value={form.meta_texto} onChange={e => set('meta_texto', e.target.value)} style={inp} />
          </Field>
        </div>
        <footer style={{ padding: 14, borderTop: '1px solid var(--cbrio-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--cbrio-text2)', border: '1px solid var(--cbrio-border)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving}
            style={{ padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#00B39D', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
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
