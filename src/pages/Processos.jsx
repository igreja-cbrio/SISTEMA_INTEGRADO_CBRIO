import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { processos as api, users as usersApi } from '../api';
import { CATEGORIAS, AREAS, CATEGORIA_AREAS, INDICADORES, getIndicadoresByArea, getAreaNome } from '../data/indicadores';

// ── Tema ──
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', tableHeader: 'var(--cbrio-table-header)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', amberBg: '#fef3c7', blue: '#3b82f6', blueBg: '#dbeafe',
  purple: '#8b5cf6', purpleBg: '#ede9fe',
};

const STATUS_MAP = {
  ativo:     { c: C.green,  bg: C.greenBg,  label: 'Ativo' },
  pausado:   { c: C.amber,  bg: C.amberBg,  label: 'Pausado' },
  concluido: { c: C.blue,   bg: C.blueBg,   label: 'Conclu\u00eddo' },
  arquivado: { c: '#6b7280', bg: '#6b728020', label: 'Arquivado' },
};

const CAT_MAP = {
  Ministerial: { c: C.primary, bg: C.primaryBg },
  Geracional:  { c: C.purple,  bg: C.purpleBg },
  Criativo:    { c: C.amber,   bg: C.amberBg },
  Operacoes:   { c: C.blue,    bg: C.blueBg },
};

const PERIOD_COLORS = {
  Semanal: '#3b82f6', Mensal: '#10b981', Trimestral: '#f59e0b', Semestral: '#8b5cf6',
};

// ── Helpers ──
function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color, background: bg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay }} onClick={onClose}>
      <div style={{ background: C.modalBg, borderRadius: 12, width: wide ? 720 : 520, maxHeight: '90vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: C.text }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.t3 }}>&times;</button>
        </div>
        {children}
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>{footer}</div>}
      </div>
    </div>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled, style: sx }) {
  const base = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', opacity: disabled ? 0.5 : 1, transition: 'all .15s' };
  const variants = {
    primary: { background: C.primary, color: '#fff' },
    ghost: { background: 'transparent', color: C.t2, border: `1px solid ${C.border}` },
    danger: { background: C.red, color: '#fff' },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...sx }}>{children}</button>;
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 14, boxSizing: 'border-box' }} />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>{label}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 14, boxSizing: 'border-box' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Main Component ──
export default function Processos() {
  const { isAdmin, isDiretor } = useAuth();
  const canWrite = isAdmin || isDiretor;

  const [list, setList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [fArea, setFArea] = useState('');
  const [fOkr, setFOkr] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | processo
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({ nome: '', descricao: '', categoria: '', area: '', responsavel_id: '', responsavel_nome: '', indicador_ids: [], is_okr: false, status: 'ativo' });

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (fCat) params.categoria = fCat;
      if (fArea) params.area = fArea;
      if (fOkr === 'true') params.is_okr = 'true';
      if (fStatus) params.status = fStatus;
      setList(await api.list(params));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [fCat, fArea, fOkr, fStatus]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { usersApi.list().then(setUsersList).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(p => p.nome?.toLowerCase().includes(s) || p.area?.toLowerCase().includes(s) || p.responsavel_nome?.toLowerCase().includes(s));
  }, [list, search]);

  const openCreate = () => {
    setForm({ nome: '', descricao: '', categoria: '', area: '', responsavel_id: '', responsavel_nome: '', indicador_ids: [], is_okr: false, status: 'ativo' });
    setModal('create');
  };

  const openEdit = (p) => {
    setForm({ nome: p.nome, descricao: p.descricao || '', categoria: p.categoria, area: p.area, responsavel_id: p.responsavel_id || '', responsavel_nome: p.responsavel_nome || '', indicador_ids: p.indicador_ids || [], is_okr: p.is_okr || false, status: p.status });
    setModal(p);
  };

  const handleSave = async () => {
    if (!form.nome || !form.categoria || !form.area) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.create(form);
      } else {
        await api.update(modal.id, form);
      }
      setModal(null);
      loadList();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Arquivar este processo?')) return;
    try { await api.remove(id); loadList(); } catch (e) { console.error(e); }
  };

  const availableAreas = form.categoria ? (CATEGORIA_AREAS[form.categoria] || []) : AREAS.map(a => a.id);
  const availableKpis = form.area ? getIndicadoresByArea(form.area) : [];

  const toggleKpi = (id) => {
    setForm(f => ({
      ...f,
      indicador_ids: f.indicador_ids.includes(id) ? f.indicador_ids.filter(x => x !== id) : [...f.indicador_ids, id],
    }));
  };

  // Stats
  const stats = useMemo(() => {
    const total = list.length;
    const ativos = list.filter(p => p.status === 'ativo').length;
    const okrs = list.filter(p => p.is_okr).length;
    const byCat = {};
    CATEGORIAS.forEach(c => { byCat[c] = list.filter(p => p.categoria === c).length; });
    const byArea = {};
    AREAS.forEach(a => { byArea[a.id] = list.filter(p => p.area === a.id).length; });
    return { total, ativos, okrs, byCat, byArea };
  }, [list]);

  const tabs = ['Home', 'Lista', 'OKR', 'KPIs'];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Processos</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: C.t3 }}>Processos operacionais, OKRs e indicadores</p>
        </div>
        {canWrite && <Btn onClick={openCreate}>+ Novo Processo</Btn>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `2px solid ${C.border}`, paddingBottom: 0 }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === i ? 700 : 400, color: tab === i ? C.primary : C.t3, borderBottom: tab === i ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2, transition: 'all .15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && <TabHome stats={stats} list={list} />}
      {tab === 1 && <TabLista list={filtered} search={search} setSearch={setSearch} fCat={fCat} setFCat={setFCat} fArea={fArea} setFArea={setFArea} fOkr={fOkr} setFOkr={setFOkr} fStatus={fStatus} setFStatus={setFStatus} canWrite={canWrite} onEdit={openEdit} onDelete={handleDelete} loading={loading} />}
      {tab === 2 && <TabOKR list={list.filter(p => p.is_okr)} canWrite={canWrite} onEdit={openEdit} />}
      {tab === 3 && <TabKPIs list={list} />}

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Novo Processo' : 'Editar Processo'} wide
        footer={<><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={handleSave} disabled={saving || !form.nome || !form.categoria || !form.area}>{saving ? 'Salvando...' : 'Salvar'}</Btn></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Input label="Nome do Processo *" value={form.nome} onChange={v => setForm(f => ({ ...f, nome: v }))} placeholder="Ex: Acolhimento p\u00f3s-culto" />
          </div>
          <Select label="Categoria *" value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v, area: '', indicador_ids: [] }))} placeholder="Selecione..."
            options={CATEGORIAS.map(c => ({ value: c, label: c }))} />
          <Select label="\u00c1rea *" value={form.area} onChange={v => setForm(f => ({ ...f, area: v, indicador_ids: [] }))} placeholder={form.categoria ? 'Selecione...' : 'Selecione categoria primeiro'}
            options={availableAreas.map(a => ({ value: a, label: getAreaNome(a) }))} />
          <Select label="Respons\u00e1vel" value={form.responsavel_id} onChange={v => {
            const u = usersList.find(u => u.id === v);
            setForm(f => ({ ...f, responsavel_id: v, responsavel_nome: u?.name || '' }));
          }} placeholder="Selecione..."
            options={usersList.map(u => ({ value: u.id, label: u.name }))} />
          <Select label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
          <div style={{ gridColumn: '1/-1' }}>
            <TextArea label="Descri\u00e7\u00e3o" value={form.descricao} onChange={v => setForm(f => ({ ...f, descricao: v }))} placeholder="Descreva o processo..." />
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="okr-toggle" checked={form.is_okr} onChange={e => setForm(f => ({ ...f, is_okr: e.target.checked }))} />
            <label htmlFor="okr-toggle" style={{ fontSize: 14, fontWeight: 600, color: C.text, cursor: 'pointer' }}>Objetivo Estrat\u00e9gico (OKR)</label>
            <span style={{ fontSize: 12, color: C.t3 }}>Marque se este processo \u00e9 um resultado-chave para o planejamento estrat\u00e9gico</span>
          </div>
          {/* KPIs multi-select */}
          {availableKpis.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 8 }}>Indicadores vinculados ({form.indicador_ids.length} selecionados)</label>
              <div style={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                {availableKpis.map(kpi => (
                  <label key={kpi.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6, background: form.indicador_ids.includes(kpi.id) ? C.primaryBg : 'transparent' }}>
                    <input type="checkbox" checked={form.indicador_ids.includes(kpi.id)} onChange={() => toggleKpi(kpi.id)} style={{ marginTop: 2 }} />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{kpi.id}</span>
                      <span style={{ fontSize: 13, color: C.t2, marginLeft: 6 }}>{kpi.nome}</span>
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                        <Badge label={kpi.periodicidade} color={PERIOD_COLORS[kpi.periodicidade] || C.t3} bg={(PERIOD_COLORS[kpi.periodicidade] || C.t3) + '20'} />
                        <span style={{ marginLeft: 8 }}>Meta: {kpi.meta_2026}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── TAB HOME ──
function TabHome({ stats, list }) {
  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Total de Processos" value={stats.total} color={C.primary} />
        <KpiCard label="Ativos" value={stats.ativos} color={C.green} />
        <KpiCard label="OKRs" value={stats.okrs} color={C.purple} />
        <KpiCard label="KPIs Vinculados" value={list.reduce((s, p) => s + (p.indicador_ids?.length || 0), 0)} color={C.blue} />
      </div>

      {/* By category */}
      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12 }}>Por Categoria</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {CATEGORIAS.map(cat => {
          const cm = CAT_MAP[cat];
          const count = stats.byCat[cat] || 0;
          const areas = CATEGORIA_AREAS[cat] || [];
          return (
            <div key={cat} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Badge label={cat} color={cm.c} bg={cm.bg} />
                <span style={{ fontSize: 24, fontWeight: 700, color: cm.c }}>{count}</span>
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                {areas.length > 0 ? areas.map(a => getAreaNome(a)).join(', ') : 'Sem \u00e1reas definidas'}
              </div>
            </div>
          );
        })}
      </div>

      {/* By area */}
      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12 }}>Por \u00c1rea</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {AREAS.filter(a => stats.byArea[a.id] > 0 || true).map(area => {
          const count = stats.byArea[area.id] || 0;
          const kpiCount = getIndicadoresByArea(area.id).length;
          return (
            <div key={area.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{area.nome}</div>
                <div style={{ fontSize: 11, color: C.t3 }}>{kpiCount} KPIs</div>
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? C.primary : C.t3 }}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 12, color: C.t3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ── TAB LISTA ──
function TabLista({ list, search, setSearch, fCat, setFCat, fArea, setFArea, fOkr, setFOkr, fStatus, setFStatus, canWrite, onEdit, onDelete, loading }) {
  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 13, width: 200 }} />
        <select value={fCat} onChange={e => { setFCat(e.target.value); setFArea(''); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 13 }}>
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fArea} onChange={e => setFArea(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 13 }}>
          <option value="">Todas \u00e1reas</option>
          {(fCat ? (CATEGORIA_AREAS[fCat] || []) : AREAS.map(a => a.id)).map(a => <option key={a} value={a}>{getAreaNome(a)}</option>)}
        </select>
        <select value={fOkr} onChange={e => setFOkr(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 13 }}>
          <option value="">Todos</option>
          <option value="true">Apenas OKR</option>
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 13 }}>
          <option value="">Todos status</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Carregando...</p> : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>Nenhum processo encontrado</p>
          <p style={{ fontSize: 13 }}>Crie o primeiro processo para come\u00e7ar</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map(p => <ProcessoCard key={p.id} processo={p} canWrite={canWrite} onEdit={onEdit} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

function ProcessoCard({ processo: p, canWrite, onEdit, onDelete }) {
  const cat = CAT_MAP[p.categoria] || CAT_MAP.Ministerial;
  const st = STATUS_MAP[p.status] || STATUS_MAP.ativo;
  const kpiCount = p.indicador_ids?.length || 0;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{p.nome}</span>
          {p.is_okr && <Badge label="OKR" color={C.purple} bg={C.purpleBg} />}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <Badge label={p.categoria} color={cat.c} bg={cat.bg} />
          <Badge label={getAreaNome(p.area)} color={C.t2} bg={C.border} />
          <Badge label={st.label} color={st.c} bg={st.bg} />
        </div>
        {p.descricao && <p style={{ margin: '6px 0 0', fontSize: 13, color: C.t3, lineHeight: 1.4 }}>{p.descricao.length > 120 ? p.descricao.slice(0, 120) + '...' : p.descricao}</p>}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: C.t3 }}>
          {p.responsavel_nome && <span>Resp: <strong style={{ color: C.t2 }}>{p.responsavel_nome}</strong></span>}
          <span>{kpiCount} indicador{kpiCount !== 1 ? 'es' : ''}</span>
        </div>
      </div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(p)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: C.t2 }}>Editar</button>
          <button onClick={() => onDelete(p.id)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: C.red }}>Arquivar</button>
        </div>
      )}
    </div>
  );
}

// ── TAB OKR ──
function TabOKR({ list, canWrite, onEdit }) {
  const grouped = useMemo(() => {
    const g = {};
    list.forEach(p => {
      if (!g[p.area]) g[p.area] = [];
      g[p.area].push(p);
    });
    return g;
  }, [list]);

  if (list.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
        <p style={{ fontSize: 16, marginBottom: 4 }}>Nenhum processo marcado como OKR</p>
        <p style={{ fontSize: 13 }}>Edite um processo e marque "Objetivo Estrat\u00e9gico (OKR)" para que ele apare\u00e7a aqui</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: C.t3, marginBottom: 20 }}>Processos marcados como Objetivos Estrat\u00e9gicos, agrupados por \u00e1rea, com seus indicadores-chave.</p>
      {Object.entries(grouped).map(([area, procs]) => (
        <div key={area} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {getAreaNome(area)}
            <Badge label={`${procs.length} OKR${procs.length > 1 ? 's' : ''}`} color={C.purple} bg={C.purpleBg} />
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {procs.map(p => (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, borderLeft: `4px solid ${C.purple}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{p.nome}</span>
                  {canWrite && <button onClick={() => onEdit(p)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: C.t2 }}>Editar</button>}
                </div>
                {p.descricao && <p style={{ fontSize: 13, color: C.t3, margin: '0 0 10px' }}>{p.descricao}</p>}
                {p.indicador_ids?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Resultados-Chave (KPIs)</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {p.indicador_ids.map(id => {
                        const kpi = INDICADORES.find(k => k.id === id);
                        if (!kpi) return null;
                        return (
                          <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: C.bg, borderRadius: 6, fontSize: 13 }}>
                            <div>
                              <span style={{ fontWeight: 600, color: C.text }}>{kpi.id}</span>
                              <span style={{ color: C.t2, marginLeft: 8 }}>{kpi.nome}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <Badge label={kpi.periodicidade} color={PERIOD_COLORS[kpi.periodicidade] || C.t3} bg={(PERIOD_COLORS[kpi.periodicidade] || C.t3) + '20'} />
                              <span style={{ fontSize: 12, color: C.t3 }}>{kpi.meta_2026}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TAB KPIs ──
function TabKPIs({ list }) {
  const kpiProcessMap = useMemo(() => {
    const m = {};
    list.forEach(p => {
      (p.indicador_ids || []).forEach(id => {
        if (!m[id]) m[id] = [];
        m[id].push(p);
      });
    });
    return m;
  }, [list]);

  return (
    <div>
      <p style={{ fontSize: 14, color: C.t3, marginBottom: 20 }}>Todos os 69 indicadores organizados por \u00e1rea. Indicadores vinculados a processos aparecem destacados.</p>
      {AREAS.map(area => {
        const kpis = getIndicadoresByArea(area.id);
        return (
          <div key={area.id} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              {area.nome}
              <span style={{ fontSize: 12, fontWeight: 400, color: C.t3 }}>{kpis.length} indicadores</span>
            </h3>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.tableHeader }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>ID</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Indicador</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Periodicidade</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Meta 2026</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Processos</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map(kpi => {
                    const procs = kpiProcessMap[kpi.id] || [];
                    return (
                      <tr key={kpi.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: C.text }}>{kpi.id}</td>
                        <td style={{ padding: '8px 12px', color: C.t2 }}>{kpi.nome}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge label={kpi.periodicidade} color={PERIOD_COLORS[kpi.periodicidade] || C.t3} bg={(PERIOD_COLORS[kpi.periodicidade] || C.t3) + '20'} />
                        </td>
                        <td style={{ padding: '8px 12px', color: C.t3, fontSize: 12 }}>{kpi.meta_2026}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {procs.length > 0 ? procs.map(p => (
                            <Badge key={p.id} label={p.nome} color={C.primary} bg={C.primaryBg} />
                          )) : <span style={{ fontSize: 12, color: C.t3 }}>-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
