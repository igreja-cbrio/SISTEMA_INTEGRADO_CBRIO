import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { processos as api, users as usersApi } from '../api';
import { CATEGORIAS, AREAS, CATEGORIA_AREAS, INDICADORES, getIndicadoresByArea, getAreaNome } from '../data/indicadores';

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

const PERIOD_COLORS = { Semanal: '#3b82f6', Mensal: '#10b981', Trimestral: '#f59e0b', Semestral: '#8b5cf6' };
const DIAS = ['Domingo', 'Segunda', 'Ter\u00e7a', 'Quarta', 'Quinta', 'Sexta', 'S\u00e1bado'];

function Badge({ label, color, bg }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color, background: bg, whiteSpace: 'nowrap' }}>{label}</span>;
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
  const base = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', opacity: disabled ? 0.5 : 1 };
  const v = { primary: { background: C.primary, color: '#fff' }, ghost: { background: 'transparent', color: C.t2, border: `1px solid ${C.border}` }, danger: { background: C.red, color: '#fff' } };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant], ...sx }}>{children}</button>;
}

function Field({ label, children }) {
  return <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 4 }}>{label}</label>{children}</div>;
}

const inp = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

// ════════════════════════════════════════════════════
export default function Processos() {
  const { isAdmin, isDiretor, profile } = useAuth();
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
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [agenda, setAgenda] = useState([]);
  const [registros, setRegistros] = useState([]);

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

  const loadAgenda = useCallback(async () => {
    try { setAgenda(await api.agenda.list()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { usersApi.list().then(setUsersList).catch(() => {}); loadAgenda(); }, [loadAgenda]);

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
  const openDetail = async (p) => {
    setDetail(p);
    setDetailTab('info');
    setTab(5);
    try { setRegistros(await api.registros.list({ processo_id: p.id })); } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!form.nome || !form.categoria || !form.area) return;
    setSaving(true);
    try {
      if (modal === 'create') await api.create(form);
      else await api.update(modal.id, form);
      setModal(null);
      loadList();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Arquivar este processo?')) return;
    try { await api.remove(id); loadList(); } catch (e) { console.error(e); }
  };

  const [coletando, setColetando] = useState(false);
  const handleColetar = async () => {
    if (!confirm('Rodar coletor automatico agora? Os indicadores com fonte automatica serao atualizados.')) return;
    setColetando(true);
    try {
      const r = await api.coletar();
      alert(`Coletor: ${r.ok}/${r.total} indicadores atualizados.`);
      if (detail?.id) setRegistros(await api.registros.list({ processo_id: detail.id }));
    } catch (e) { console.error(e); alert('Erro ao coletar: ' + (e.message || 'desconhecido')); }
    setColetando(false);
  };

  const availableAreas = form.categoria ? (CATEGORIA_AREAS[form.categoria] || []) : AREAS.map(a => a.id);
  const availableKpis = form.area ? getIndicadoresByArea(form.area) : [];
  const toggleKpi = (id) => setForm(f => ({ ...f, indicador_ids: f.indicador_ids.includes(id) ? f.indicador_ids.filter(x => x !== id) : [...f.indicador_ids, id] }));

  const stats = useMemo(() => {
    const total = list.length, ativos = list.filter(p => p.status === 'ativo').length, okrs = list.filter(p => p.is_okr).length;
    const byCat = {}; CATEGORIAS.forEach(c => { byCat[c] = list.filter(p => p.categoria === c).length; });
    const byArea = {}; AREAS.forEach(a => { byArea[a.id] = list.filter(p => p.area === a.id).length; });
    return { total, ativos, okrs, byCat, byArea };
  }, [list]);

  const tabs = ['Home', 'Lista', 'OKR', 'KPIs', 'Agenda'];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Processos</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: C.t3 }}>Processos operacionais, OKRs e indicadores</p>
        </div>
        {canWrite && tab !== 5 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={handleColetar} disabled={coletando}>
              {coletando ? 'Coletando...' : 'Coletar agora'}
            </Btn>
            <Btn onClick={openCreate}>+ Novo Processo</Btn>
          </div>
        )}
      </div>

      {/* Tabs */}
      {tab !== 5 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `2px solid ${C.border}` }}>
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === i ? 700 : 400, color: tab === i ? C.primary : C.t3, borderBottom: tab === i ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2 }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === 0 && <TabHome stats={stats} list={list} />}
      {tab === 1 && <TabLista list={filtered} search={search} setSearch={setSearch} fCat={fCat} setFCat={setFCat} fArea={fArea} setFArea={setFArea} fOkr={fOkr} setFOkr={setFOkr} fStatus={fStatus} setFStatus={setFStatus} canWrite={canWrite} onEdit={openEdit} onDelete={handleDelete} onDetail={openDetail} loading={loading} />}
      {tab === 2 && <TabOKR list={list.filter(p => p.is_okr)} canWrite={canWrite} onEdit={openEdit} onDetail={openDetail} />}
      {tab === 3 && <TabKPIs list={list} onDetail={openDetail} />}
      {tab === 4 && <TabAgenda agenda={agenda} canWrite={canWrite} onSave={async items => { try { await api.agenda.saveBulk(items); loadAgenda(); } catch (e) { console.error(e); } }} />}
      {tab === 5 && detail && <DetailView processo={detail} registros={registros} canWrite={canWrite} onBack={() => { setTab(1); setDetail(null); }} onEdit={openEdit} detailTab={detailTab} setDetailTab={setDetailTab} profile={profile} onRegistroSaved={async () => { setRegistros(await api.registros.list({ processo_id: detail.id })); }} />}

      {/* Modal criar/editar */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? 'Novo Processo' : 'Editar Processo'} wide
        footer={<><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn onClick={handleSave} disabled={saving || !form.nome || !form.categoria || !form.area}>{saving ? 'Salvando...' : 'Salvar'}</Btn></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Nome do Processo *"><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Acolhimento p\u00f3s-culto" style={inp} /></Field>
          </div>
          <Field label="Categoria *"><select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value, area: '', indicador_ids: [] }))} style={inp}><option value="">Selecione...</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label={'\u00c1rea *'}><select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value, indicador_ids: [] }))} style={inp}><option value="">{form.categoria ? 'Selecione...' : 'Selecione categoria'}</option>{availableAreas.map(a => <option key={a} value={a}>{getAreaNome(a)}</option>)}</select></Field>
          <Field label={'Respons\u00e1vel'}><select value={form.responsavel_id} onChange={e => { const u = usersList.find(u => u.id === e.target.value); setForm(f => ({ ...f, responsavel_id: e.target.value, responsavel_nome: u?.name || '' })); }} style={inp}><option value="">Selecione...</option>{usersList.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Status"><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inp}>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label={'Descri\u00e7\u00e3o'}><textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva o processo..." rows={3} style={{ ...inp, resize: 'vertical' }} /></Field>
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="okr-toggle" checked={form.is_okr} onChange={e => setForm(f => ({ ...f, is_okr: e.target.checked }))} />
            <label htmlFor="okr-toggle" style={{ fontSize: 14, fontWeight: 600, color: C.text, cursor: 'pointer' }}>{'Objetivo Estrat\u00e9gico (OKR)'}</label>
          </div>
          {availableKpis.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <Field label={`Indicadores vinculados (${form.indicador_ids.length})`}>
                <div style={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
                  {availableKpis.map(kpi => (
                    <label key={kpi.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6, background: form.indicador_ids.includes(kpi.id) ? C.primaryBg : 'transparent' }}>
                      <input type="checkbox" checked={form.indicador_ids.includes(kpi.id)} onChange={() => toggleKpi(kpi.id)} style={{ marginTop: 2 }} />
                      <div><span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{kpi.id}</span><span style={{ fontSize: 13, color: C.t2, marginLeft: 6 }}>{kpi.nome}</span></div>
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ════ TAB HOME ════
function TabHome({ stats, list }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[{ l: 'Total de Processos', v: stats.total, c: C.primary }, { l: 'Ativos', v: stats.ativos, c: C.green }, { l: 'OKRs', v: stats.okrs, c: C.purple }, { l: 'KPIs Vinculados', v: list.reduce((s, p) => s + (p.indicador_ids?.length || 0), 0), c: C.blue }].map(k => (
          <div key={k.l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, borderLeft: `4px solid ${k.c}` }}>
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12 }}>Por Categoria</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {CATEGORIAS.map(cat => { const cm = CAT_MAP[cat]; return (
          <div key={cat} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><Badge label={cat} color={cm.c} bg={cm.bg} /><span style={{ fontSize: 24, fontWeight: 700, color: cm.c }}>{stats.byCat[cat] || 0}</span></div>
            <div style={{ fontSize: 12, color: C.t3 }}>{(CATEGORIA_AREAS[cat] || []).map(a => getAreaNome(a)).join(', ') || 'Sem \u00e1reas'}</div>
          </div>
        ); })}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12 }}>{'Por \u00c1rea'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {AREAS.map(area => { const count = stats.byArea[area.id] || 0; return (
          <div key={area.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{area.nome}</div><div style={{ fontSize: 11, color: C.t3 }}>{getIndicadoresByArea(area.id).length} KPIs</div></div>
            <span style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? C.primary : C.t3 }}>{count}</span>
          </div>
        ); })}
      </div>
    </div>
  );
}

// ════ TAB LISTA ════
function TabLista({ list, search, setSearch, fCat, setFCat, fArea, setFArea, fOkr, setFOkr, fStatus, setFStatus, canWrite, onEdit, onDelete, onDetail, loading }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ ...inp, width: 200 }} />
        <select value={fCat} onChange={e => { setFCat(e.target.value); setFArea(''); }} style={{ ...inp, width: 'auto' }}><option value="">Todas categorias</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select value={fArea} onChange={e => setFArea(e.target.value)} style={{ ...inp, width: 'auto' }}><option value="">{`Todas \u00e1reas`}</option>{(fCat ? (CATEGORIA_AREAS[fCat] || []) : AREAS.map(a => a.id)).map(a => <option key={a} value={a}>{getAreaNome(a)}</option>)}</select>
        <select value={fOkr} onChange={e => setFOkr(e.target.value)} style={{ ...inp, width: 'auto' }}><option value="">Todos</option><option value="true">Apenas OKR</option></select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ ...inp, width: 'auto' }}><option value="">Todos status</option>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>
      {loading ? <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Carregando...</p> : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}><p style={{ fontSize: 16 }}>Nenhum processo encontrado</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map(p => <ProcessoCard key={p.id} p={p} canWrite={canWrite} onEdit={onEdit} onDelete={onDelete} onDetail={onDetail} />)}
        </div>
      )}
    </div>
  );
}

function ProcessoCard({ p, canWrite, onEdit, onDelete, onDetail }) {
  const cat = CAT_MAP[p.categoria] || CAT_MAP.Ministerial;
  const st = STATUS_MAP[p.status] || STATUS_MAP.ativo;
  return (
    <div onClick={() => onDetail(p)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, transition: 'border-color .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.primary} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
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
          {p.responsavel_nome && <span>{'Resp: '}<strong style={{ color: C.t2 }}>{p.responsavel_nome}</strong></span>}
          <span>{(p.indicador_ids?.length || 0)} indicador{(p.indicador_ids?.length || 0) !== 1 ? 'es' : ''}</span>
        </div>
      </div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onEdit(p)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: C.t2 }}>Editar</button>
          <button onClick={() => onDelete(p.id)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: C.red }}>Arquivar</button>
        </div>
      )}
    </div>
  );
}

// ════ DETAIL VIEW ════
function DetailView({ processo: p, registros, canWrite, onBack, onEdit, detailTab, setDetailTab, profile, onRegistroSaved }) {
  const kpis = (p.indicador_ids || []).map(id => INDICADORES.find(k => k.id === id)).filter(Boolean);
  const cat = CAT_MAP[p.categoria] || CAT_MAP.Ministerial;
  const st = STATUS_MAP[p.status] || STATUS_MAP.ativo;
  const [regForm, setRegForm] = useState({ indicador_id: '', valor: '', periodo: '', observacoes: '' });
  const [savingReg, setSavingReg] = useState(false);

  const submitRegistro = async () => {
    if (!regForm.indicador_id || !regForm.valor) return;
    setSavingReg(true);
    try {
      await api.registros.create({ processo_id: p.id, ...regForm, valor: Number(regForm.valor) });
      setRegForm({ indicador_id: '', valor: '', periodo: '', observacoes: '' });
      onRegistroSaved();
    } catch (e) { console.error(e); }
    setSavingReg(false);
  };

  const subTabs = ['info', 'indicadores', 'preencher'];

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 14, fontWeight: 600, marginBottom: 16, padding: 0 }}>{'← Voltar para lista'}</button>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>{p.nome}</h2>
              {p.is_okr && <Badge label="OKR" color={C.purple} bg={C.purpleBg} />}
              <Badge label={st.label} color={st.c} bg={st.bg} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Badge label={p.categoria} color={cat.c} bg={cat.bg} />
              <Badge label={getAreaNome(p.area)} color={C.t2} bg={C.border} />
            </div>
          </div>
          {canWrite && <Btn variant="ghost" onClick={() => onEdit(p)}>Editar</Btn>}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `2px solid ${C.border}` }}>
        {[['info', 'Informa\u00e7\u00f5es'], ['indicadores', 'Indicadores'], ['preencher', 'Preencher']].map(([k, l]) => (
          <button key={k} onClick={() => setDetailTab(k)}
            style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: detailTab === k ? 700 : 400, color: detailTab === k ? C.primary : C.t3, borderBottom: detailTab === k ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2 }}>
            {l}
          </button>
        ))}
      </div>

      {detailTab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>{'Respons\u00e1vel'}</div>
            <div style={{ fontSize: 14, color: C.text }}>{p.responsavel_nome || 'N\u00e3o definido'}</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Indicadores vinculados</div>
            <div style={{ fontSize: 14, color: C.text }}>{kpis.length}</div>
          </div>
          {p.descricao && (
            <div style={{ gridColumn: '1/-1', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>{'Descri\u00e7\u00e3o'}</div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{p.descricao}</div>
            </div>
          )}
        </div>
      )}

      {detailTab === 'indicadores' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {kpis.length === 0 ? <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Nenhum indicador vinculado</p> :
            kpis.map(kpi => (
              <div key={kpi.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div><span style={{ fontWeight: 600, color: C.text }}>{kpi.id}</span><span style={{ color: C.t2, marginLeft: 8 }}>{kpi.nome}</span></div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge label={kpi.periodicidade} color={PERIOD_COLORS[kpi.periodicidade] || C.t3} bg={(PERIOD_COLORS[kpi.periodicidade] || C.t3) + '20'} />
                  <span style={{ fontSize: 12, color: C.t3 }}>Meta: {kpi.meta_2026}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {detailTab === 'preencher' && (
        <div>
          {canWrite && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 0, marginBottom: 12 }}>Novo registro</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Indicador *">
                  <select value={regForm.indicador_id} onChange={e => setRegForm(f => ({ ...f, indicador_id: e.target.value }))} style={inp}>
                    <option value="">Selecione...</option>
                    {kpis.map(k => <option key={k.id} value={k.id}>{k.id} - {k.nome}</option>)}
                  </select>
                </Field>
                <Field label="Valor *"><input type="number" value={regForm.valor} onChange={e => setRegForm(f => ({ ...f, valor: e.target.value }))} placeholder="0" style={inp} /></Field>
                <Field label={'Per\u00edodo'}><input value={regForm.periodo} onChange={e => setRegForm(f => ({ ...f, periodo: e.target.value }))} placeholder="Semana 18/2026" style={inp} /></Field>
              </div>
              <Field label={'Observa\u00e7\u00f5es'}><textarea value={regForm.observacoes} onChange={e => setRegForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>
              <Btn onClick={submitRegistro} disabled={savingReg || !regForm.indicador_id || !regForm.valor}>{savingReg ? 'Salvando...' : 'Registrar'}</Btn>
            </div>
          )}
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>{'Hist\u00f3rico'}</h3>
          {registros.length === 0 ? <p style={{ color: C.t3, textAlign: 'center', padding: 30 }}>Nenhum registro ainda</p> : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: C.tableHeader }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Data</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Indicador</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Valor</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>{'Per\u00edodo'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>{'Respons\u00e1vel'}</th>
                </tr></thead>
                <tbody>{registros.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 12px', color: C.text }}>{r.data_preenchimento}</td>
                    <td style={{ padding: '8px 12px', color: C.t2 }}>{r.indicador_id}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: C.primary }}>{r.valor}</td>
                    <td style={{ padding: '8px 12px', color: C.t3 }}>{r.periodo || '-'}</td>
                    <td style={{ padding: '8px 12px', color: C.t3 }}>{r.responsavel_nome || '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════ TAB OKR ════
function TabOKR({ list, canWrite, onEdit, onDetail }) {
  const grouped = useMemo(() => { const g = {}; list.forEach(p => { if (!g[p.area]) g[p.area] = []; g[p.area].push(p); }); return g; }, [list]);
  if (list.length === 0) return <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}><p style={{ fontSize: 16 }}>Nenhum processo marcado como OKR</p></div>;
  return (
    <div>
      {Object.entries(grouped).map(([area, procs]) => (
        <div key={area} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12 }}>{getAreaNome(area)} <Badge label={`${procs.length} OKR${procs.length > 1 ? 's' : ''}`} color={C.purple} bg={C.purpleBg} /></h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {procs.map(p => (
              <div key={p.id} onClick={() => onDetail(p)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, borderLeft: `4px solid ${C.purple}`, cursor: 'pointer' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{p.nome}</span>
                {p.indicador_ids?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                    {p.indicador_ids.map(id => { const kpi = INDICADORES.find(k => k.id === id); if (!kpi) return null; return (
                      <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: C.bg, borderRadius: 4, fontSize: 12 }}>
                        <span><strong>{kpi.id}</strong> {kpi.nome}</span>
                        <span style={{ color: C.t3 }}>{kpi.meta_2026}</span>
                      </div>
                    ); })}
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

// ════ TAB KPIs ════
function TabKPIs({ list, onDetail }) {
  const kpiMap = useMemo(() => { const m = {}; list.forEach(p => (p.indicador_ids || []).forEach(id => { if (!m[id]) m[id] = []; m[id].push(p); })); return m; }, [list]);
  return (
    <div>
      {AREAS.map(area => { const kpis = getIndicadoresByArea(area.id); return (
        <div key={area.id} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>{area.nome} <span style={{ fontSize: 12, fontWeight: 400, color: C.t3 }}>{kpis.length} indicadores</span></h3>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: C.tableHeader }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Indicador</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Periodicidade</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Meta 2026</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Processos</th>
              </tr></thead>
              <tbody>{kpis.map(kpi => { const procs = kpiMap[kpi.id] || []; return (
                <tr key={kpi.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: C.text }}>{kpi.id}</td>
                  <td style={{ padding: '8px 12px', color: C.t2 }}>{kpi.nome}</td>
                  <td style={{ padding: '8px 12px' }}><Badge label={kpi.periodicidade} color={PERIOD_COLORS[kpi.periodicidade] || C.t3} bg={(PERIOD_COLORS[kpi.periodicidade] || C.t3) + '20'} /></td>
                  <td style={{ padding: '8px 12px', color: C.t3, fontSize: 12 }}>{kpi.meta_2026}</td>
                  <td style={{ padding: '8px 12px' }}>{procs.length > 0 ? procs.map(pr => <span key={pr.id} onClick={() => onDetail(pr)} style={{ cursor: 'pointer', color: C.primary, textDecoration: 'underline', marginRight: 6, fontSize: 12 }}>{pr.nome}</span>) : <span style={{ fontSize: 12, color: C.t3 }}>-</span>}</td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
        </div>
      ); })}
    </div>
  );
}

// ════ TAB AGENDA ════
function TabAgenda({ agenda, canWrite, onSave }) {
  const [local, setLocal] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterArea, setFilterArea] = useState('');

  useEffect(() => {
    const m = {};
    agenda.forEach(a => { m[a.indicador_id] = a.dia_semana; });
    setLocal(m);
    setDirty(false);
  }, [agenda]);

  const setDay = (indId, area, day) => {
    setLocal(prev => {
      const next = { ...prev };
      if (next[indId] === day) delete next[indId];
      else next[indId] = day;
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const items = Object.entries(local).map(([indicador_id, dia_semana]) => {
      const ind = INDICADORES.find(k => k.id === indicador_id);
      return { indicador_id, dia_semana, area: ind?.area || '' };
    });
    await onSave(items);
    setDirty(false);
    setSaving(false);
  };

  const areasToShow = filterArea ? AREAS.filter(a => a.id === filterArea) : AREAS;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 14, color: C.t3, margin: 0 }}>Configure em qual dia da semana cada indicador deve ser preenchido. Todos os colaboradores veem esta agenda.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filterArea} onChange={e => setFilterArea(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="">{`Todas \u00e1reas`}</option>
            {AREAS.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          {canWrite && dirty && <Btn onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar agenda'}</Btn>}
        </div>
      </div>

      {areasToShow.map(area => {
        const kpis = getIndicadoresByArea(area.id);
        if (kpis.length === 0) return null;
        return (
          <div key={area.id} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{area.nome}</h3>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                <thead><tr style={{ background: C.tableHeader }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12, minWidth: 200 }}>Indicador</th>
                  {DIAS.map((d, i) => <th key={i} style={{ padding: '8px 10px', textAlign: 'center', color: C.t2, fontWeight: 600, fontSize: 11, minWidth: 60 }}>{d}</th>)}
                </tr></thead>
                <tbody>
                  {kpis.map(kpi => (
                    <tr key={kpi.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontWeight: 600, color: C.text, fontSize: 12 }}>{kpi.id}</span>
                        <span style={{ color: C.t2, marginLeft: 6, fontSize: 12 }}>{kpi.nome}</span>
                      </td>
                      {DIAS.map((_, di) => {
                        const selected = local[kpi.id] === di;
                        return (
                          <td key={di} style={{ padding: '4px', textAlign: 'center' }}>
                            <button
                              onClick={() => canWrite && setDay(kpi.id, area.id, di)}
                              disabled={!canWrite}
                              style={{
                                width: 32, height: 32, borderRadius: 8, border: 'none', cursor: canWrite ? 'pointer' : 'default',
                                background: selected ? C.primary : 'transparent',
                                color: selected ? '#fff' : C.t3, fontSize: 16, fontWeight: 700,
                              }}>
                              {selected ? '\u2713' : '\u00b7'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
