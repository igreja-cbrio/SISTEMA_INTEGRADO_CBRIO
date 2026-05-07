// ============================================================================
// /dados-brutos — Lider preenche numeros absolutos (frequencia, conversoes,
// batismos, doacoes, etc). KPIs com tipo_calculo automatico leem daqui.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dadosBrutos as dadosApi } from '../api';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import { Database, Plus, Pencil, Trash2, X, Save, Calendar, Filter } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
};

const AREAS_OFICIAIS = [
  { id: 'kids',   nome: 'Kids' },
  { id: 'bridge', nome: 'Bridge' },
  { id: 'ami',    nome: 'AMI' },
  { id: 'sede',   nome: 'Sede' },
  { id: 'online', nome: 'Online' },
  { id: 'cba',    nome: 'CBA' },
];

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DadosBrutos() {
  const { profile } = useAuth();
  const { kpiAreas, isAdmin } = useMyKpiAreas();
  const [tipos, setTipos] = useState([]);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().slice(0, 10);
  });
  const [editando, setEditando] = useState(null); // null | {} (novo) | {dado existente}

  // Todos veem todas as areas (read). So edita as proprias (validado no submit).
  const areasDisponiveis = AREAS_OFICIAIS;

  // Areas que o usuario pode editar (registrar/editar dados)
  const areasEditaveis = useMemo(() => {
    if (isAdmin) return AREAS_OFICIAIS;
    return AREAS_OFICIAIS.filter(a => kpiAreas.includes(a.id));
  }, [isAdmin, kpiAreas]);

  const podeRegistrar = areasEditaveis.length > 0;

  // Carregar tipos
  useEffect(() => {
    dadosApi.tipos.list()
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  // Carregar dados (com filtros)
  const loadDados = useCallback(async () => {
    setLoading(true);
    try {
      const params = { desde: filtroDesde };
      if (filtroArea) params.area = filtroArea;
      if (filtroTipo) params.tipo_id = filtroTipo;
      const data = await dadosApi.list(params);
      setDados(data);
    } catch (e) {
      toast.error(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [filtroArea, filtroTipo, filtroDesde]);

  useEffect(() => {
    if (filtroArea || isAdmin) loadDados();
  }, [loadDados, filtroArea, isAdmin]);

  const remover = async (d) => {
    if (!window.confirm(`Remover registro de ${d.tipo_nome} (${d.area} · ${d.data})?`)) return;
    try {
      await dadosApi.remove(d.id);
      toast.success('Removido');
      loadDados();
    } catch (e) { toast.error(e?.message); }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={22} style={{ color: C.primary }} />
            Dados Brutos
          </h1>
          <p style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
            Numeros absolutos da igreja (frequencia, conversoes, batismos, doacoes...).
            {isAdmin
              ? ' Voce pode editar dados de qualquer area (admin).'
              : podeRegistrar
                ? ` Voce pode registrar/editar dados de: ${areasEditaveis.map(a => a.nome).join(', ')}.`
                : ' Voce esta em modo leitura — peca um admin pra atribuir sua area.'}
          </p>
        </div>
        {podeRegistrar && (
          <button
            onClick={() => setEditando({})}
            style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Registrar dado
          </button>
        )}
      </header>

      {/* Filtros */}
      <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.t3, marginBottom: 8 }}>
          <Filter size={11} /> Filtros
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Field label="Area">
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={inp}>
              <option value="">Todas</option>
              {areasDisponiveis.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Field>
          <Field label="Tipo de dado">
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={inp}>
              <option value="">Todos</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Field>
          <Field label="Desde">
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={inp} />
          </Field>
        </div>
      </section>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : dados.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
          <Database size={28} style={{ marginBottom: 12, color: C.t3 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Nenhum dado registrado neste filtro.</p>
          <p style={{ fontSize: 11, marginTop: 6, color: C.t3 }}>
            Click em <strong>Registrar dado</strong> pra começar.
          </p>
        </div>
      ) : (
        <>
          {/* Tabela: desktop (>= 768px) */}
          <div className="dados-table-desktop" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.inputBg }}>
                  <th style={th}>Data</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Area</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={th}>Origem</th>
                  <th style={th}>Observação</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {dados.map(d => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{d.data}</td>
                    <td style={td}>
                      <strong>{d.tipo_nome}</strong>
                      {d.unidade && <span style={{ color: C.t3, fontSize: 10 }}> · {d.unidade}</span>}
                    </td>
                    <td style={{ ...td, textTransform: 'capitalize' }}>{d.area}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {Number(d.valor).toLocaleString('pt-BR')}
                    </td>
                    <td style={td}>
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 99,
                        background: d.origem === 'auto' ? '#3B82F620' : C.inputBg,
                        color: d.origem === 'auto' ? '#3B82F6' : C.t3,
                        fontWeight: 600, textTransform: 'uppercase',
                      }}>{d.origem}</span>
                    </td>
                    <td style={{ ...td, color: C.t3, fontSize: 11 }}>{d.observacao || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.origem !== 'auto' && (isAdmin || areasEditaveis.some(a => a.id === d.area)) && (
                        <>
                          <button onClick={() => setEditando(d)} style={btnIcon}><Pencil size={12} /></button>
                          <button onClick={() => remover(d)} style={{ ...btnIcon, color: '#EF4444' }}><Trash2 size={12} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards: mobile (< 768px) */}
          <div className="dados-cards-mobile" style={{ display: 'none', flexDirection: 'column', gap: 8 }}>
            {dados.map(d => (
              <div key={d.id} style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{d.tipo_nome}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                      <span style={{ textTransform: 'capitalize' }}>{d.area}</span> · {d.data}
                      {d.origem === 'auto' && (
                        <span style={{
                          marginLeft: 6, fontSize: 8, padding: '1px 5px', borderRadius: 99,
                          background: '#3B82F620', color: '#3B82F6', fontWeight: 600, textTransform: 'uppercase',
                        }}>auto</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                    {Number(d.valor).toLocaleString('pt-BR')}
                    {d.unidade && <span style={{ fontSize: 10, color: C.t3, marginLeft: 4 }}>{d.unidade}</span>}
                  </div>
                </div>
                {d.observacao && (
                  <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic', marginBottom: 6 }}>{d.observacao}</div>
                )}
                {d.origem !== 'auto' && (isAdmin || areasEditaveis.some(a => a.id === d.area)) && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => setEditando(d)}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Pencil size={12} /> Editar
                    </button>
                    <button onClick={() => remover(d)}
                      style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'transparent', color: '#EF4444', border: `1px solid #EF444440`, cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <style>{`
            @media (max-width: 767px) {
              .dados-table-desktop { display: none; }
              .dados-cards-mobile { display: flex !important; }
            }
          `}</style>
        </>
      )}

      {editando !== null && (
        <ModalRegistrar
          dado={editando}
          tipos={tipos}
          areasDisponiveis={areasEditaveis}
          areaDefault={
            (filtroArea && areasEditaveis.some(a => a.id === filtroArea))
              ? filtroArea
              : (areasEditaveis[0]?.id || '')
          }
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); loadDados(); }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// ModalRegistrar — criar/editar registro
// ----------------------------------------------------------------------------
function ModalRegistrar({ dado, tipos, areasDisponiveis, areaDefault, onClose, onSaved }) {
  const isNovo = !dado.id;
  const [form, setForm] = useState({
    tipo_id: dado.tipo_id || '',
    area: dado.area || areaDefault || '',
    data: dado.data || hoje(),
    valor: dado.valor != null ? String(dado.valor) : '',
    observacao: dado.observacao || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const tipoSelecionado = tipos.find(t => t.id === form.tipo_id);

  const submit = async () => {
    if (!form.tipo_id) return toast.error('Tipo obrigatorio');
    if (!form.area)    return toast.error('Area obrigatoria');
    if (!form.data)    return toast.error('Data obrigatoria');
    if (form.valor === '' || isNaN(Number(form.valor))) return toast.error('Valor invalido');

    setSaving(true);
    try {
      const payload = {
        ...form,
        valor: Number(form.valor),
        observacao: form.observacao.trim() || null,
      };
      if (isNovo) {
        await dadosApi.create(payload);
        toast.success('Dado registrado');
      } else {
        await dadosApi.update(dado.id, { valor: payload.valor, observacao: payload.observacao });
        toast.success('Dado atualizado');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ background: C.modalBg, borderRadius: 12, maxWidth: 520, width: '100%', maxHeight: '92vh', overflow: 'auto' }}
      >
        <header style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {isNovo ? 'Registrar dado' : 'Editar dado'}
          </h2>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 16 }}>
          <Field label="Tipo de dado *">
            <select value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)} style={inp} disabled={!isNovo}>
              <option value="">— Escolher —</option>
              {tipos.map(t => (
                <option key={t.id} value={t.id}>{t.nome}{t.unidade ? ` (${t.unidade})` : ''}</option>
              ))}
            </select>
          </Field>
          {tipoSelecionado && (
            <p style={{ fontSize: 10, color: C.t3, marginTop: -8, marginBottom: 12, fontStyle: 'italic' }}>
              {tipoSelecionado.descricao} · granularidade: {tipoSelecionado.granularidade}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Area *">
              <select value={form.area} onChange={e => set('area', e.target.value)} style={inp} disabled={!isNovo}>
                <option value="">— Escolher —</option>
                {areasDisponiveis.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </Field>
            <Field label="Data *">
              <input type="date" value={form.data} onChange={e => set('data', e.target.value)} style={inp} disabled={!isNovo} />
            </Field>
          </div>

          <Field label={`Valor *${tipoSelecionado?.unidade ? ' · ' + tipoSelecionado.unidade : ''}`}>
            <input type="number" step="any" value={form.valor} onChange={e => set('valor', e.target.value)} style={inp} placeholder="Ex: 850" autoFocus />
          </Field>

          <Field label="Observação">
            <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Notas opcionais (ex: 'culto extra de natal')" />
          </Field>

          {!isNovo && (
            <p style={{ fontSize: 10, color: C.t3, fontStyle: 'italic' }}>
              Tipo, area e data sao a chave do registro — nao podem ser editados. Pra mudar, remova e crie novo.
            </p>
          )}
        </div>

        <footer style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnGhost}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text,
  fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit',
};
const th = { textAlign: 'left', padding: 10, fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: 10 };
const btnPrimary = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  background: C.primary, color: '#fff', border: 'none', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`, cursor: 'pointer',
};
const btnIcon = {
  background: 'transparent', border: 'none', padding: 6, borderRadius: 4,
  cursor: 'pointer', color: C.t3,
};
