// ============================================================================
// /admin/estrutura-okr — gestao da estrutura OKR completa
//
// Administra:
//   - Direcionadores (UNIDADE, etc)
//   - Objetivos Gerais (25 da planilha)
//   - KRs Gerais (vinculados a objetivos)
//
// KRs especificos de cada KPI ficam editaveis no KpiEditorModal
// (Fase 2.5B-2). KPIs em si ficam editaveis na pagina de Meus KPIs.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { estrategia as estrategiaApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Target, ListChecks, Activity, X, Save } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const VALOR_LABELS = {
  seguir: 'Seguir', conectar: 'Conectar',
  investir: 'Investir', servir: 'Servir', generosidade: 'Generosidade',
};
const VALOR_CORES = {
  seguir: '#8B5CF6', conectar: '#3B82F6', investir: '#F59E0B',
  servir: '#10B981', generosidade: '#EC4899',
};

export default function EstruturaOkr() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);

  const [direcionadores, setDirecionadores] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedObj, setExpandedObj] = useState(null);
  const [editObj, setEditObj] = useState(null);
  const [editKr, setEditKr] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [dirs, objs] = await Promise.all([
        estrategiaApi.direcionadores.list(),
        estrategiaApi.objetivos.list({ ativos: 'true' }),
      ]);
      setDirecionadores(dirs);
      setObjetivos(objs);
    } catch (e) {
      toast.error(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const removerObjetivo = async (obj) => {
    if (!window.confirm(`Inativar objetivo "${obj.nome}"? KPIs vinculados ficam orfaos.`)) return;
    try {
      await estrategiaApi.objetivos.remove(obj.id);
      toast.success('Objetivo inativado');
      carregar();
    } catch (e) { toast.error(e?.message); }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>
        Apenas admin/diretor pode gerenciar a estrutura OKR.
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Target size={22} style={{ color: C.primary }} />
            Estrutura OKR
          </h1>
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
            Direcionadores → Objetivos Gerais → KPIs · {objetivos.length} objetivos · {direcionadores.length} direcionadores
          </p>
        </div>
        <button onClick={() => setEditObj({})} style={btnPrimary}>
          <Plus size={14} /> Novo objetivo
        </button>
      </header>

      {/* Direcionadores (compactos) */}
      <section style={{ ...cardStyle, marginBottom: 16 }}>
        <h3 style={hh3}>Direcionadores ({direcionadores.length})</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {direcionadores.map(d => (
            <div key={d.id} style={{
              padding: '6px 14px', borderRadius: 99,
              background: C.primary, color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            }}>
              {d.nome}
            </div>
          ))}
        </div>
      </section>

      {/* Objetivos Gerais */}
      <section style={cardStyle}>
        <h3 style={hh3}>Objetivos Gerais ({objetivos.length})</h3>
        <p style={{ fontSize: 11, color: C.t3, marginTop: -4, marginBottom: 12 }}>
          Click pra expandir e gerenciar KRs gerais e ver KPIs vinculados.
        </p>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
        ) : objetivos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>
            Nenhum objetivo cadastrado.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {objetivos.map(o => (
              <ObjetivoLinha
                key={o.id}
                objetivo={o}
                expanded={expandedObj === o.id}
                onToggle={() => setExpandedObj(expandedObj === o.id ? null : o.id)}
                onEdit={() => setEditObj(o)}
                onRemove={() => removerObjetivo(o)}
                onAddKr={() => setEditKr({ objetivo_geral_id: o.id, _objetivoLabel: o.nome })}
                onEditKr={(kr) => setEditKr(kr)}
                onAfterChange={carregar}
              />
            ))}
          </div>
        )}
      </section>

      {/* Modais */}
      {editObj !== null && (
        <ModalObjetivo
          objetivo={editObj}
          direcionadores={direcionadores}
          onClose={() => setEditObj(null)}
          onSaved={() => { setEditObj(null); carregar(); }}
        />
      )}
      {editKr !== null && (
        <ModalKr
          kr={editKr}
          onClose={() => setEditKr(null)}
          onSaved={() => { setEditKr(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// ObjetivoLinha — linha expandivel com KRs e KPIs
// ============================================================================
function ObjetivoLinha({ objetivo, expanded, onToggle, onEdit, onRemove, onAddKr, onEditKr, onAfterChange }) {
  const [detalhes, setDetalhes] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expanded && !detalhes) {
      setLoading(true);
      estrategiaApi.objetivos.get(objetivo.id)
        .then(setDetalhes)
        .finally(() => setLoading(false));
    }
  }, [expanded, detalhes, objetivo.id]);

  const removerKr = async (kr) => {
    if (!window.confirm(`Remover KR "${kr.titulo}"?`)) return;
    try {
      await estrategiaApi.krs.remove(kr.id);
      toast.success('KR removido');
      setDetalhes(null);
      onAfterChange?.();
    } catch (e) { toast.error(e?.message); }
  };

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
        <button
          onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: C.text }}>{objetivo.nome}</strong>
            {(objetivo.valores || []).map(v => (
              <span key={v} style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 99,
                background: VALOR_CORES[v] + '20', color: VALOR_CORES[v], fontWeight: 700,
              }}>
                {VALOR_LABELS[v] || v}
              </span>
            ))}
          </div>
          {objetivo.indicador_geral && (
            <p style={{ fontSize: 11, color: C.t3, margin: '2px 0 0', lineHeight: 1.4 }}>
              {objetivo.indicador_geral}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 10, color: C.t3 }}>
          <span><strong>{objetivo.total_kpis || 0}</strong> KPIs</span>
          <span><strong>{objetivo.total_krs || 0}</strong> KRs</span>
        </div>
        <button onClick={onEdit} style={btnIcon} title="Editar"><Pencil size={13} /></button>
        <button onClick={onRemove} style={{ ...btnIcon, color: '#ef4444' }} title="Inativar"><Trash2 size={13} /></button>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px 14px', borderTop: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)' }}>
          {loading ? (
            <div style={{ padding: 16, fontSize: 12, color: C.t3, textAlign: 'center' }}>Carregando...</div>
          ) : !detalhes ? null : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {/* KRs Gerais */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <h4 style={hh4}><ListChecks size={11} /> KRs Gerais ({detalhes.krs.length})</h4>
                  <button onClick={onAddKr} style={btnGhostSm}><Plus size={12} /> Novo</button>
                </div>
                {detalhes.krs.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.t3, padding: 8 }}>
                    Nenhum KR ainda. Sugestao: 3-5 KRs por objetivo (ex: "% atinge X", "0 cultos com queda > 15%", etc).
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {detalhes.krs.map(kr => (
                      <div key={kr.id} style={krStyle}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{kr.titulo}</div>
                          {kr.meta_valor != null && (
                            <div style={{ fontSize: 10, color: C.t3 }}>
                              meta: {kr.meta_valor}{kr.unidade ? ' ' + kr.unidade : ''}
                            </div>
                          )}
                          {kr.meta_texto && !kr.meta_valor && (
                            <div style={{ fontSize: 10, color: C.t3 }}>meta: {kr.meta_texto}</div>
                          )}
                        </div>
                        <button onClick={() => onEditKr(kr)} style={btnIcon}><Pencil size={11} /></button>
                        <button onClick={() => removerKr(kr)} style={{ ...btnIcon, color: '#ef4444' }}><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* KPIs Vinculados */}
              <div>
                <h4 style={hh4}><Activity size={11} /> KPIs Vinculados ({detalhes.kpis.length})</h4>
                {detalhes.kpis.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.t3, padding: 8 }}>Nenhum KPI vinculado.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {detalhes.kpis.map(k => (
                      <div key={k.id} style={krStyle}>
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 99,
                          background: C.primaryBg, color: C.primaryDark, fontWeight: 700,
                          minWidth: 50, textAlign: 'center',
                        }}>
                          {k.id}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: C.text, lineHeight: 1.3 }}>{k.indicador}</div>
                          <div style={{ fontSize: 9, color: C.t3, textTransform: 'capitalize' }}>{k.area} · {k.periodicidade}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 10, color: C.t3, marginTop: 8, fontStyle: 'italic' }}>
                  Editar KPI individualmente em /minha-area (clicando no KPI).
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ModalObjetivo — criar/editar objetivo geral
// ============================================================================
function ModalObjetivo({ objetivo, direcionadores, onClose, onSaved }) {
  const isNovo = !objetivo.id;
  const [form, setForm] = useState({
    nome: objetivo.nome || '',
    descricao: objetivo.descricao || '',
    indicador_geral: objetivo.indicador_geral || '',
    valores: objetivo.valores || [],
    direcionador_id: objetivo.direcionador_id || direcionadores[0]?.id || null,
    ordem: objetivo.ordem || 99,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleValor = (v) => set('valores',
    form.valores.includes(v) ? form.valores.filter(x => x !== v) : [...form.valores, v]
  );

  const submit = async () => {
    if (!form.nome.trim()) return toast.error('Nome obrigatorio');
    setSaving(true);
    try {
      if (isNovo) {
        await estrategiaApi.objetivos.create(form);
        toast.success('Objetivo criado');
      } else {
        await estrategiaApi.objetivos.update(objetivo.id, form);
        toast.success('Objetivo atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isNovo ? 'Novo Objetivo Geral' : 'Editar Objetivo Geral'} onSubmit={submit} saving={saving}>
      <Field label="Nome *">
        <input value={form.nome} onChange={e => set('nome', e.target.value)} style={inp} placeholder='Ex: "Aumentar batismos"' />
      </Field>
      <Field label="Descricao">
        <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </Field>
      <Field label="Indicador Geral (como medir no agregado)">
        <input value={form.indicador_geral} onChange={e => set('indicador_geral', e.target.value)} style={inp}
          placeholder='Ex: "% crescimento de batismos em relacao ao ultimo evento"' />
      </Field>
      <Field label="Valores da Jornada (alimentados por este objetivo)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(VALOR_LABELS).map(([k, lbl]) => {
            const ativo = form.valores.includes(k);
            return (
              <button
                key={k}
                onClick={() => toggleValor(k)}
                style={{
                  padding: '5px 12px', borderRadius: 99,
                  fontSize: 11, fontWeight: 600,
                  border: ativo ? `2px solid ${VALOR_CORES[k]}` : `1px solid ${C.border}`,
                  background: ativo ? VALOR_CORES[k] + '20' : 'transparent',
                  color: ativo ? VALOR_CORES[k] : C.t3,
                  cursor: 'pointer',
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Direcionador">
        <select value={form.direcionador_id || ''} onChange={e => set('direcionador_id', e.target.value || null)} style={inp}>
          <option value="">— Sem direcionador —</option>
          {direcionadores.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      </Field>
      <Field label="Ordem">
        <input type="number" value={form.ordem} onChange={e => set('ordem', Number(e.target.value) || 99)} style={inp} />
      </Field>
    </Modal>
  );
}

// ============================================================================
// ModalKr — criar/editar KR (geral ou especifico)
// ============================================================================
function ModalKr({ kr, onClose, onSaved }) {
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
        // Vincular ao parent (objetivo OU KPI)
        if (kr.objetivo_geral_id) payload.objetivo_geral_id = kr.objetivo_geral_id;
        if (kr.kpi_id) payload.kpi_id = kr.kpi_id;
        await estrategiaApi.krs.create(payload);
        toast.success('KR criado');
      } else {
        await estrategiaApi.krs.update(kr.id, payload);
        toast.success('KR atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const tipoLabel = kr.objetivo_geral_id || kr._objetivoLabel
    ? `KR Geral · objetivo "${kr._objetivoLabel || ''}"`
    : 'KR Especifico (do KPI)';

  return (
    <Modal onClose={onClose} title={isNovo ? 'Novo KR' : 'Editar KR'} onSubmit={submit} saving={saving}>
      <div style={{
        fontSize: 11, color: C.primaryDark, fontWeight: 600,
        padding: '6px 10px', background: C.primaryBg, borderRadius: 6, marginBottom: 12,
      }}>
        {tipoLabel}
      </div>
      <Field label="Titulo *">
        <input value={form.titulo} onChange={e => set('titulo', e.target.value)} style={inp}
          placeholder='Ex: "Frequencia media mensal >= 2500"' />
      </Field>
      <Field label="Descricao">
        <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </Field>
      <Field label="Formula de calculo">
        <input value={form.formula_calculo} onChange={e => set('formula_calculo', e.target.value)} style={inp}
          placeholder='Ex: "media(frequencia_diaria) no mes"' />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Meta (valor)">
          <input type="number" value={form.meta_valor} onChange={e => set('meta_valor', e.target.value)} style={inp} placeholder="Numero" />
        </Field>
        <Field label="Unidade">
          <input value={form.unidade} onChange={e => set('unidade', e.target.value)} style={inp} placeholder="ex: %, pessoas, R$" />
        </Field>
      </div>
      <Field label="Meta (texto descritivo, alternativa)">
        <input value={form.meta_texto} onChange={e => set('meta_texto', e.target.value)} style={inp}
          placeholder="ex: '60% dos lideres treinados em 12 meses'" />
      </Field>
      <Field label="Ordem">
        <input type="number" value={form.ordem} onChange={e => set('ordem', Number(e.target.value) || 99)} style={inp} />
      </Field>
    </Modal>
  );
}

// ============================================================================
// Componentes auxiliares
// ============================================================================
function Modal({ title, children, onClose, onSubmit, saving }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}
    onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.modalBg, borderRadius: 12, maxWidth: 600, width: '100%',
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
      }}>
        <header style={{ padding: 18, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>
        <div style={{ padding: 18 }}>{children}</div>
        <footer style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={onSubmit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
            <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const cardStyle = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18,
};
const hh3 = {
  fontSize: 13, fontWeight: 700, color: C.t2, margin: 0, marginBottom: 8,
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const hh4 = {
  fontSize: 11, fontWeight: 700, color: C.t2, margin: 0,
  display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};
const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
  fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};
const krStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px', background: C.card, borderRadius: 6,
  border: `1px solid ${C.border}`,
};
const btnPrimary = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
};
const btnGhostSm = {
  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
  background: 'transparent', color: C.primaryDark, border: `1px solid ${C.primary}40`, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
const btnIcon = {
  background: 'transparent', border: 'none', padding: 6, borderRadius: 4,
  cursor: 'pointer', color: 'var(--cbrio-text3)',
};
