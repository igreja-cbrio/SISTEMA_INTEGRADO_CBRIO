import { useState, useEffect, useCallback, useRef } from 'react';
import { Tag, ClipboardList, Trash2, Pencil, MapPin } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { patrimonio, logistica } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const STATUS_BEM = {
  ativo: { c: C.green, bg: C.greenBg, label: 'Ativo' },
  manutencao: { c: C.amber, bg: C.amberBg, label: 'Manutenção' },
  baixado: { c: C.text3, bg: '#73737318', label: 'Baixado' },
  extraviado: { c: C.red, bg: C.redBg, label: 'Extraviado' },
};

const TIPO_MOV = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência',
  manutencao: 'Manutenção', baixa: 'Baixa',
};

const INV_STATUS = {
  em_andamento: { c: C.blue, bg: C.blueBg, label: 'Em andamento' },
  concluido: { c: C.green, bg: C.greenBg, label: 'Concluído' },
  cancelado: { c: C.red, bg: C.redBg, label: 'Cancelado' },
};

const styles = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, lineHeight: 1.25 },
  subtitle: { fontSize: 14, color: C.text2, marginTop: 2, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab: (a) => ({ padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: a ? C.primary : C.text2, borderBottom: a ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }),
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
  kpi: (color) => ({ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, borderLeft: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }),
  kpiValue: { fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.25 },
  kpiLabel: { fontSize: 12, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden' },
  cardHeader: { padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 14, color: C.text, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 },
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: c, background: bg }),
  btn: (v = 'primary') => ({ padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}), ...(v === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}), ...(v === 'danger' ? { background: C.red, color: '#fff' } : {}), ...(v === 'ghost' ? { background: 'transparent', color: C.text2, padding: '6px 12px' } : {}) }),
  btnSm: { padding: '4px 10px', fontSize: 12 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', width: '100%', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)' },
  select: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', outline: 'none' },
  label: { fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  formGroup: { marginBottom: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  overlay: { position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 1000 },
  modal: { background: 'var(--cbrio-modal-bg)', borderRadius: 12, width: '95%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' },
  modalHeader: { padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 24px 24px' },
  modalFooter: { padding: '12px 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14, lineHeight: 1.5 },
  clickRow: { cursor: 'pointer', transition: 'background 0.1s' },
};

const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <Button variant="ghost" onClick={onClose} style={{ fontSize: 18 }}>✕</Button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}
function Input({ label, ...props }) { return (<div style={styles.formGroup}>{label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}<input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props} /></div>); }
function Select({ label, children, ...props }) { return (<div style={styles.formGroup}>{label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}<select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props}>{children}</select></div>); }
function Badge({ status, map }) { const s = map[status] || { c: C.text3, bg: '#73737318', label: status }; return <span style={styles.badge(s.c, s.bg)}>{s.label}</span>; }

const TABS = ['Dashboard', 'Bens', 'Scanner', 'Categorias / Localizações', 'Inventários', 'Movimentações'];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

export default function Patrimonio() {
  const { isDiretor } = useAuth();
  const [tab, setTab] = useState(0);
  const [dash, setDash] = useState(null);
  const [bens, setBens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [inventarios, setInventarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [filtroLoc, setFiltroLoc] = useState('');
  const [busca, setBusca] = useState('');
  const [modalBem, setModalBem] = useState(null);
  const [modalDetail, setModalDetail] = useState(null);
  const [modalMov, setModalMov] = useState(null);
  const [modalInv, setModalInv] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [error, setError] = useState('');
  // Movimentações de Estoque (logística)
  const [logMovimentacoes, setLogMovimentacoes] = useState([]);
  const [filtroLogMovTipo, setFiltroLogMovTipo] = useState('');
  const [modalLogMov, setModalLogMov] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadDash = useCallback(async () => { try { setDash(await patrimonio.dashboard()); } catch (e) { console.error(e); } }, []);
  const loadBens = useCallback(async () => {
    try { setLoading(true); const p = {}; if (filtroStatus) p.status = filtroStatus; if (filtroCat) p.categoria_id = filtroCat; if (filtroLoc) p.localizacao_id = filtroLoc; if (busca) p.busca = busca; setBens(await patrimonio.bens.list(p)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, [filtroStatus, filtroCat, filtroLoc, busca]);
  const loadCats = useCallback(async () => { try { setCategorias(await patrimonio.categorias.list()); } catch (e) { console.error(e); } }, []);
  const loadLocs = useCallback(async () => { try { setLocalizacoes(await patrimonio.localizacoes.list()); } catch (e) { console.error(e); } }, []);
  const loadInvs = useCallback(async () => { try { setInventarios(await patrimonio.inventarios.list()); } catch (e) { console.error(e); } }, []);
  const loadLogMovs = useCallback(async () => {
    try {
      setLoading(true);
      const params = filtroLogMovTipo ? { tipo: filtroLogMovTipo } : undefined;
      setLogMovimentacoes(await logistica.movimentacoes.list(params) || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroLogMovTipo]);

  useEffect(() => { loadDash(); loadBens(); loadCats(); loadLocs(); loadInvs(); }, []);
  useEffect(() => { loadBens(); }, [filtroStatus, filtroCat, filtroLoc, busca]);
  useEffect(() => { if (tab === 5) loadLogMovs(); }, [tab, loadLogMovs]);

  async function saveBem(data) {
    try { if (data.id) await patrimonio.bens.update(data.id, data); else await patrimonio.bens.create(data); setModalBem(null); loadBens(); loadDash(); } catch (e) { setError(e.message); }
  }
  async function deleteBem(id) { if (!confirm('Remover este bem?')) return; try { await patrimonio.bens.remove(id); loadBens(); loadDash(); setModalDetail(null); } catch (e) { setError(e.message); } }
  async function openDetail(id) { try { setModalDetail(await patrimonio.bens.get(id)); } catch (e) { setError(e.message); } }
  async function saveMov(bemId, data) {
    try { await patrimonio.bens.movimentar(bemId, data); setModalMov(null); openDetail(bemId); loadBens(); loadDash(); } catch (e) { setError(e.message); }
  }
  async function addCat() { if (!newCat.trim()) return; try { await patrimonio.categorias.create({ nome: newCat }); setNewCat(''); loadCats(); loadDash(); } catch (e) { setError(e.message); } }
  async function removeCat(id) { if (!confirm('Remover categoria?')) return; try { await patrimonio.categorias.remove(id); loadCats(); } catch (e) { setError(e.message); } }
  async function addLoc() { if (!newLoc.trim()) return; try { await patrimonio.localizacoes.create({ nome: newLoc }); setNewLoc(''); loadLocs(); loadDash(); } catch (e) { setError(e.message); } }
  async function removeLoc(id) { if (!confirm('Remover localização?')) return; try { await patrimonio.localizacoes.remove(id); loadLocs(); } catch (e) { setError(e.message); } }
  async function saveInv(data) { try { await patrimonio.inventarios.create(data); setModalInv(null); loadInvs(); loadDash(); } catch (e) { setError(e.message); } }
  async function updateInvStatus(id, status) { try { const upd = { status }; if (status === 'concluido') upd.data_fim = new Date().toISOString().slice(0, 10); await patrimonio.inventarios.atualizar(id, upd); loadInvs(); loadDash(); } catch (e) { setError(e.message); } }

  async function saveLogMov() {
    if (!modalLogMov?.codigo_barras?.trim()) { setError('Código de barras é obrigatório'); return; }
    if (!modalLogMov?.tipo) { setError('Tipo é obrigatório'); return; }
    setSaving(true);
    try {
      await logistica.movimentacoes.create(modalLogMov);
      setModalLogMov(null); loadLogMovs();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }
  const upLogMov = (k, v) => setModalLogMov(prev => ({ ...prev, [k]: v }));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div><div style={{ ...styles.title, display: 'flex', alignItems: 'center', gap: 10 }}><Tag className="h-7 w-7" style={{ color: '#00B39D' }} /> Patrimônio</div><div style={styles.subtitle}>Gestão de bens, localizações e inventários</div></div>
      </div>
      {error && (
        <div style={{ background: '#ef444418', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ef4444', fontSize: 13 }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700, padding: '0 4px' }}>&#10005;</button>
        </div>
      )}
      <div style={styles.tabs}>{TABS.map((t, i) => <button key={t} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>)}</div>

      {tab === 0 && <DashboardTab dash={dash} />}
      {tab === 1 && (
        <BensTab bens={bens} loading={loading} busca={busca} setBusca={setBusca}
          filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
          filtroCat={filtroCat} setFiltroCat={setFiltroCat} filtroLoc={filtroLoc} setFiltroLoc={setFiltroLoc}
          categorias={categorias} localizacoes={localizacoes}
          onNew={() => setModalBem({})} onDetail={openDetail} onDelete={deleteBem} isDiretor={isDiretor}
        />
      )}
      {tab === 2 && <ScannerTab localizacoes={localizacoes} onMov={saveMov} onDetail={openDetail} />}
      {tab === 3 && <CatLocTab categorias={categorias} localizacoes={localizacoes} newCat={newCat} setNewCat={setNewCat} addCat={addCat} removeCat={removeCat} newLoc={newLoc} setNewLoc={setNewLoc} addLoc={addLoc} removeLoc={removeLoc} isDiretor={isDiretor} />}
      {tab === 4 && <InventariosTab inventarios={inventarios} onNew={() => setModalInv({})} onUpdate={updateInvStatus} isDiretor={isDiretor} />}
      {tab === 5 && (
        <LogMovimentacoesTab data={logMovimentacoes} loading={loading}
          filtroTipo={filtroLogMovTipo} setFiltroTipo={setFiltroLogMovTipo}
          onNew={() => setModalLogMov({ tipo: 'entrada', codigo_barras: '', descricao: '', quantidade: 1, unidade: 'un', localizacao: '', observacoes: '' })}
          onReload={loadLogMovs}
        />
      )}

      <BemFormModal open={!!modalBem} data={modalBem} categorias={categorias} localizacoes={localizacoes} onClose={() => setModalBem(null)} onSave={saveBem} />
      <BemDetailModal open={!!modalDetail} data={modalDetail} onClose={() => setModalDetail(null)} onEdit={(b) => { setModalDetail(null); setModalBem(b); }} onDelete={deleteBem} onMov={(bemId) => setModalMov({ bem_id: bemId })} isDiretor={isDiretor} />
      <MovFormModal open={!!modalMov} data={modalMov} localizacoes={localizacoes} onClose={() => setModalMov(null)} onSave={saveMov} />
      <InvFormModal open={!!modalInv} onClose={() => setModalInv(null)} onSave={saveInv} />
      <LogMovimentacaoModal open={modalLogMov !== null} data={modalLogMov} onClose={() => setModalLogMov(null)}
        onSave={saveLogMov} saving={saving} upLogMov={upLogMov} />
    </div>
  );
}

const PAT_STAT_SVGS = [
  <svg key="p0" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="100" r="90" fill="#fff" fillOpacity="0.08" /><circle cx="260" cy="60" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="p1" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="140" r="100" fill="#fff" fillOpacity="0.07" /><circle cx="270" cy="40" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="p2" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="240" cy="80" r="80" fill="#fff" fillOpacity="0.08" /><circle cx="280" cy="150" r="55" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="p3" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="210" cy="120" r="95" fill="#fff" fillOpacity="0.07" /><circle cx="265" cy="50" r="45" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="p4" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="230" cy="90" r="85" fill="#fff" fillOpacity="0.08" /><circle cx="270" cy="160" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="p5" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="100" r="90" fill="#fff" fillOpacity="0.07" /><circle cx="260" cy="40" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
];

function PatStatCard({ label, value, bg, svg }) {
  return (
    <div
      className="cbrio-kpi"
      style={{ position: 'relative', overflow: 'hidden', background: bg, borderRadius: 12, padding: '20px 24px', color: '#fff', minHeight: 100 }}
    >
      {svg}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>{value}</div>
      </div>
    </div>
  );
}

function DashboardTab({ dash }) {
  if (!dash) return <div style={styles.empty}>Carregando dashboard...</div>;
  const kpis = [
    { label: 'Total de Bens', value: dash.totalBens, bg: '#0a0a0a' },
    { label: 'Ativos', value: dash.ativos, bg: '#10b981' },
    { label: 'Manutenção', value: dash.manutencao, bg: '#f59e0b' },
    { label: 'Baixados', value: dash.baixados, bg: '#6b7280' },
    { label: 'Extraviados', value: dash.extraviados, bg: '#ef4444' },
    { label: 'Valor Total', value: fmtMoney(dash.valorTotal), bg: '#3b82f6' },
  ];
  return (
    <>
      <div className="cbrio-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {kpis.map((k, i) => <PatStatCard key={k.label} label={k.label} value={k.value} bg={k.bg} svg={PAT_STAT_SVGS[i % PAT_STAT_SVGS.length]} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={styles.card}>
          <div style={styles.cardHeader}><div style={styles.cardTitle}>Por Categoria</div></div>
          <div style={{ padding: 16 }}>
            {Object.entries(dash.porCategoria || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13 }}>{k}</span><span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{v}</span>
              </div>
            ))}
            {Object.keys(dash.porCategoria || {}).length === 0 && <div style={styles.empty}>Nenhum dado</div>}
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardHeader}><div style={styles.cardTitle}>Por Localização</div></div>
          <div style={{ padding: 16 }}>
            {Object.entries(dash.porLocalizacao || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13 }}>{k}</span><span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{v}</span>
              </div>
            ))}
            {Object.keys(dash.porLocalizacao || {}).length === 0 && <div style={styles.empty}>Nenhum dado</div>}
          </div>
        </div>
      </div>
      {dash.inventariosAbertos > 0 && (
        <div style={{ ...styles.card, borderLeft: `4px solid ${C.amber}`, padding: 16, fontSize: 13, color: C.text }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardList style={{ width: 16, height: 16, color: '#00B39D' }} /> {dash.inventariosAbertos} inventário(s) em andamento</span>
        </div>
      )}
    </>
  );
}

function BensTab({ bens, loading, busca, setBusca, filtroStatus, setFiltroStatus, filtroCat, setFiltroCat, filtroLoc, setFiltroLoc, categorias, localizacoes, onNew, onDetail, onDelete, isDiretor }) {
  return (
    <>
      <div style={styles.filterRow}>
        <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ maxWidth: 280 }} placeholder="🔍 Buscar por nome..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_BEM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
          <option value="">Todas categorias</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroLoc} onChange={e => setFiltroLoc(e.target.value)}>
          <option value="">Todas localizações</option>
          {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        {isDiretor && <div style={{ marginLeft: 'auto' }}><Button onClick={onNew}>+ Novo Bem</Button></div>}
      </div>
      <div style={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Código</th><th style={styles.th}>Nome</th><th style={styles.th}>Categoria</th>
              <th style={styles.th}>Localização</th><th style={styles.th}>Marca/Modelo</th><th style={styles.th}>Valor</th><th style={styles.th}>Status</th>
              {isDiretor && <th style={styles.th}></th>}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>}
              {!loading && bens.length === 0 && <tr><td colSpan={8}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhum bem encontrado</span></div></td></tr>}
              {bens.map(b => (
                <tr key={b.id} className="cbrio-row" onClick={() => onDetail(b.id)}>
                  <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 12 }}>{b.codigo_barras}</td>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{b.nome}</td>
                  <td style={styles.td}>{b.pat_categorias?.nome || '—'}</td>
                  <td style={styles.td}>{b.pat_localizacoes?.nome || '—'}</td>
                  <td style={styles.td}>{[b.marca, b.modelo].filter(Boolean).join(' ') || '—'}</td>
                  <td style={styles.td}>{fmtMoney(b.valor_aquisicao)}</td>
                  <td style={styles.td}><Badge status={b.status} map={STATUS_BEM} /></td>
                  {isDiretor && <td style={styles.td}><Button variant="ghost" size="xs" onClick={e => { e.stopPropagation(); onDelete(b.id); }}><Trash2 style={{ width: 14, height: 14 }} /></Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CatLocTab({ categorias, localizacoes, newCat, setNewCat, addCat, removeCat, newLoc, setNewLoc, addLoc, removeLoc, isDiretor }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={styles.card}>
        <div style={styles.cardHeader}><div style={styles.cardTitle}>Categorias ({categorias.length})</div></div>
        <div style={{ padding: 16 }}>
          {isDiretor && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: 1 }} placeholder="Nova categoria..." value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCat()} />
              <Button size="xs" onClick={addCat}>+</Button>
            </div>
          )}
          {categorias.length === 0 && <div style={styles.empty}>Nenhuma categoria</div>}
          {categorias.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13 }}>{c.icone && `${c.icone} `}{c.nome}</span>
              {isDiretor && <Button variant="ghost" size="xs" onClick={() => removeCat(c.id)}><Trash2 style={{ width: 14, height: 14 }} /></Button>}
            </div>
          ))}
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.cardHeader}><div style={styles.cardTitle}>Localizações ({localizacoes.length})</div></div>
        <div style={{ padding: 16 }}>
          {isDiretor && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: 1 }} placeholder="Nova localização..." value={newLoc} onChange={e => setNewLoc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLoc()} />
              <Button size="xs" onClick={addLoc}>+</Button>
            </div>
          )}
          {localizacoes.length === 0 && <div style={styles.empty}>Nenhuma localização</div>}
          {localizacoes.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin style={{ width: 14, height: 14, color: '#00B39D' }} /> {l.nome}</span>
              {isDiretor && <Button variant="ghost" size="xs" onClick={() => removeLoc(l.id)}><Trash2 style={{ width: 14, height: 14 }} /></Button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InventariosTab({ inventarios, onNew, onUpdate, isDiretor }) {
  return (
    <>
      {isDiretor && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}><Button onClick={onNew}>+ Novo Inventário</Button></div>}
      <div style={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Nome</th><th style={styles.th}>Data Início</th><th style={styles.th}>Data Fim</th>
              <th style={styles.th}>Responsável</th><th style={styles.th}>Status</th>{isDiretor && <th style={styles.th}>Ações</th>}
            </tr></thead>
            <tbody>
              {inventarios.length === 0 && <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: C.text3 }}>Nenhum inventário</td></tr>}
              {inventarios.map(inv => (
                <tr key={inv.id}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{inv.nome}</td>
                  <td style={styles.td}>{fmtDate(inv.data_inicio)}</td>
                  <td style={styles.td}>{fmtDate(inv.data_fim)}</td>
                  <td style={styles.td}>{inv.profiles?.name || '—'}</td>
                  <td style={styles.td}><Badge status={inv.status} map={INV_STATUS} /></td>
                  {isDiretor && (
                    <td style={styles.td}>
                      {inv.status === 'em_andamento' && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button size="xs" onClick={() => onUpdate(inv.id, 'concluido')}>✓ Concluir</Button>
                          <Button variant="destructive" size="xs" onClick={() => onUpdate(inv.id, 'cancelado')}>✕ Cancelar</Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function BemFormModal({ open, data, categorias, localizacoes, onClose, onSave }) {
  const [f, setF] = useState({});
  const [formError, setFormError] = useState('');
  useEffect(() => { if (data) { setF({ ...data }); setFormError(''); } }, [data]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  function handleSave() {
    if (!f.nome || !f.nome.trim()) { setFormError('Nome é obrigatório.'); return; }
    if (!f.codigo_barras || !f.codigo_barras.trim()) { setFormError('Código de barras é obrigatório.'); return; }
    if (f.valor_aquisicao !== undefined && f.valor_aquisicao !== '' && Number(f.valor_aquisicao) < 0) { setFormError('Valor de aquisição deve ser >= 0.'); return; }
    setFormError('');
    onSave(f);
  }
  return (
    <Modal open={open} onClose={onClose} title={f?.id ? 'Editar Bem' : 'Novo Bem'}
      footer={<Button onClick={handleSave}>Salvar</Button>}>
      {formError && (
        <div style={{ background: '#ef444418', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ef4444', fontSize: 13 }}>
          <span>{formError}</span>
          <button onClick={() => setFormError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700, padding: '0 4px' }}>&#10005;</button>
        </div>
      )}
      <div style={styles.formRow}>
        <Input label="Código de Barras *" value={f.codigo_barras || ''} onChange={e => upd('codigo_barras', e.target.value)} />
        <Input label="Nome *" value={f.nome || ''} onChange={e => upd('nome', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Select label="Categoria" value={f.categoria_id || ''} onChange={e => upd('categoria_id', e.target.value)}>
          <option value="">Selecionar</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select label="Localização" value={f.localizacao_id || ''} onChange={e => upd('localizacao_id', e.target.value)}>
          <option value="">Selecionar</option>
          {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </Select>
      </div>
      <div style={styles.formRow}>
        <Input label="Marca" value={f.marca || ''} onChange={e => upd('marca', e.target.value)} />
        <Input label="Modelo" value={f.modelo || ''} onChange={e => upd('modelo', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Nº Série" value={f.numero_serie || ''} onChange={e => upd('numero_serie', e.target.value)} />
        <Input label="Valor Aquisição (R$)" type="number" value={f.valor_aquisicao || ''} onChange={e => upd('valor_aquisicao', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Input label="Data Aquisição" type="date" value={f.data_aquisicao || ''} onChange={e => upd('data_aquisicao', e.target.value)} />
        {f.id && <Select label="Status" value={f.status || 'ativo'} onChange={e => upd('status', e.target.value)}>
          {Object.entries(STATUS_BEM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>}
      </div>
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Descrição</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 50, resize: 'vertical' }} value={f.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
      </div>
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 40, resize: 'vertical' }} value={f.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </div>
    </Modal>
  );
}

function BemDetailModal({ open, data, onClose, onEdit, onDelete, onMov, isDiretor }) {
  if (!data) return null;
  return (
    <Modal open={open} onClose={onClose} title={data.nome}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Código:</span><div style={{ fontSize: 14, fontFamily: 'monospace' }}>{data.codigo_barras}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Status:</span><div><Badge status={data.status} map={STATUS_BEM} /></div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Categoria:</span><div style={{ fontSize: 14 }}>{data.pat_categorias?.nome || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Localização:</span><div style={{ fontSize: 14 }}>{data.pat_localizacoes?.nome || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Marca/Modelo:</span><div style={{ fontSize: 14 }}>{[data.marca, data.modelo].filter(Boolean).join(' ') || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Nº Série:</span><div style={{ fontSize: 14 }}>{data.numero_serie || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Valor Aquisição:</span><div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(data.valor_aquisicao)}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Data Aquisição:</span><div style={{ fontSize: 14 }}>{fmtDate(data.data_aquisicao)}</div></div>
      </div>
      {data.descricao && <div style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: C.text2 }}>{data.descricao}</div>}
      {data.observacoes && <div style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.text2 }}>{data.observacoes}</div>}

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardList style={{ width: 14, height: 14, color: '#00B39D' }} /> Movimentações ({(data.movimentacoes || []).length})</span>
          {isDiretor && <Button variant="ghost" size="xs" onClick={() => onMov(data.id)}>+ Registrar</Button>}
        </div>
        {(data.movimentacoes || []).length === 0 && <div style={{ fontSize: 13, color: C.text3 }}>Nenhuma movimentação registrada</div>}
        {(data.movimentacoes || []).map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
            <div><span style={{ fontWeight: 600 }}>{TIPO_MOV[m.tipo] || m.tipo}</span>{m.motivo && ` — ${m.motivo}`}</div>
            <div style={{ color: C.text2 }}>{m.profiles?.name || ''} • {new Date(m.data_movimentacao).toLocaleDateString('pt-BR')}</div>
          </div>
        ))}
      </div>

      {isDiretor && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <Button variant="outline" onClick={() => onEdit(data)}><Pencil style={{ width: 14, height: 14, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Editar</Button>
          <Button variant="destructive" onClick={() => onDelete(data.id)}><Trash2 style={{ width: 14, height: 14, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Remover</Button>
        </div>
      )}
    </Modal>
  );
}

function MovFormModal({ open, data, localizacoes, onClose, onSave }) {
  const [f, setF] = useState({ tipo: 'transferencia' });
  useEffect(() => { if (open) setF({ tipo: 'transferencia' }); }, [open]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="Registrar Movimentação"
      footer={<Button onClick={() => onSave(data?.bem_id, f)}>Registrar</Button>}>
      <Select label="Tipo *" value={f.tipo} onChange={e => upd('tipo', e.target.value)}>
        {Object.entries(TIPO_MOV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {(f.tipo === 'transferencia' || f.tipo === 'saida') && (
        <Select label="Localização Origem" value={f.localizacao_origem_id || ''} onChange={e => upd('localizacao_origem_id', e.target.value)}>
          <option value="">Selecionar</option>
          {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </Select>
      )}
      {(f.tipo === 'transferencia' || f.tipo === 'entrada') && (
        <Select label="Localização Destino" value={f.localizacao_destino_id || ''} onChange={e => upd('localizacao_destino_id', e.target.value)}>
          <option value="">Selecionar</option>
          {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </Select>
      )}
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Motivo</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.motivo || ''} onChange={e => upd('motivo', e.target.value)} />
      </div>
    </Modal>
  );
}

function InvFormModal({ open, onClose, onSave }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({}); }, [open]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="Novo Inventário"
      footer={<Button onClick={() => onSave(f)}>Criar</Button>}>
      <Input label="Nome *" value={f.nome || ''} onChange={e => upd('nome', e.target.value)} />
      <Input label="Data Início *" type="date" value={f.data_inicio || ''} onChange={e => upd('data_inicio', e.target.value)} />
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: Scanner de Código de Barras
// ═══════════════════════════════════════════════════════════
const MOV_TIPO_COLORS = {
  entrada: { c: C.green, bg: C.greenBg, label: 'Entrada', icon: '📥' },
  saida: { c: C.red, bg: C.redBg, label: 'Saída', icon: '📤' },
  transferencia: { c: C.blue, bg: C.blueBg, label: 'Transferência', icon: '🔄' },
  manutencao: { c: C.amber, bg: C.amberBg, label: 'Manutenção', icon: '🔧' },
  baixa: { c: '#737373', bg: '#73737318', label: 'Baixa', icon: '❌' },
};

function ScannerTab({ localizacoes, onMov, onDetail }) {
  const [scanning, setScanning] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [bem, setBem] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMov, setShowMov] = useState(false);
  const [movForm, setMovForm] = useState({ tipo: 'transferencia', localizacao_origem_id: '', localizacao_destino_id: '', motivo: '' });
  const [saving, setSaving] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const [scanError, setScanError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  async function buscarPorCodigo(code) {
    if (!code) return;
    setLoading(true); setNotFound(false); setBem(null);
    try {
      const data = await patrimonio.bens.porCodigo(code);
      setBem(data);
      setRecentScans(prev => [{ codigo: code, nome: data.nome, status: data.status, time: new Date() }, ...prev.slice(0, 9)]);
    } catch (e) {
      setNotFound(true);
    }
    setLoading(false);
  }

  async function startScan() {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'codabar', 'itf'] });
        const detectLoop = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              setCodigo(code);
              stopScan();
              buscarPorCodigo(code);
              return;
            }
          } catch (e) { /* continue */ }
          requestAnimationFrame(detectLoop);
        };
        requestAnimationFrame(detectLoop);
      }
    } catch (e) {
      setScanError('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      setScanning(false);
    }
  }

  function stopScan() {
    setScanning(false);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && codigo.trim()) {
      buscarPorCodigo(codigo.trim());
    }
  }

  async function handleRegistrarMov() {
    if (!bem) return;
    setSaving(true);
    try {
      await onMov(bem.id, movForm);
      setShowMov(false);
      setMovForm({ tipo: 'transferencia', localizacao_origem_id: '', localizacao_destino_id: '', motivo: '' });
      // Recarregar o bem para ver movimentação atualizada
      buscarPorCodigo(codigo);
    } catch (e) { setScanError(e.message); }
    setSaving(false);
  }

  return (
    <>
      {scanError && (
        <div style={{ background: '#ef444418', border: '1px solid #ef4444', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ef4444', fontSize: 13 }}>
          <span>{scanError}</span>
          <button onClick={() => setScanError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700, padding: '0 4px' }}>&#10005;</button>
        </div>
      )}
      {/* Barra de busca + botão scanner */}
      <div style={{ ...styles.card, marginBottom: 16, padding: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: scanning ? 16 : 0 }}>
          <span style={{ fontSize: 24 }}>🏷️</span>
          <input
            ref={inputRef}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ flex: 1, fontSize: 16, fontFamily: 'monospace', fontWeight: 700, padding: '12px 16px' }}
            placeholder="Digite o código de barras e pressione Enter"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <Button variant={scanning ? 'destructive' : 'default'} onClick={scanning ? stopScan : startScan}>
            {scanning ? '⏹ Parar' : '📷 Escanear'}
          </Button>
        </div>

        {/* Camera preview */}
        {scanning && (
          <div style={{ textAlign: 'center' }}>
            <video ref={videoRef} style={{ width: '100%', maxWidth: 400, borderRadius: 12, background: '#000', border: `3px solid ${C.primary}` }} autoPlay playsInline muted />
            <div style={{ fontSize: 13, color: C.text2, marginTop: 8 }}>Aponte a câmera para o código de barras do patrimônio</div>
            {!('BarcodeDetector' in window) && (
              <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>
                Scanner automático não disponível neste navegador. Use o campo acima para digitar manualmente.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && <div style={{ ...styles.card, padding: 40, textAlign: 'center', marginBottom: 16 }}><div style={{ color: C.text2, fontSize: 14 }}>Buscando patrimônio...</div></div>}

      {/* Not found */}
      {notFound && (
        <div style={{ ...styles.card, padding: 24, marginBottom: 16, borderLeft: `4px solid ${C.red}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>❌</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Patrimônio não encontrado</div>
              <div style={{ fontSize: 13, color: C.text2 }}>Código <strong style={{ fontFamily: 'monospace' }}>{codigo}</strong> não está cadastrado no sistema.</div>
            </div>
          </div>
        </div>
      )}

      {/* Resultado — ficha do bem */}
      {bem && (
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{bem.nome}</div>
                <div style={{ fontSize: 13, color: C.text2, fontFamily: 'monospace', marginTop: 4 }}>Cód: {bem.codigo_barras}</div>
              </div>
              <Badge status={bem.status} map={STATUS_BEM} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px 20px', marginTop: 16 }}>
              <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Categoria</div><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{bem.pat_categorias?.nome || '—'}</div></div>
              <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Localização</div><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{bem.pat_localizacoes?.nome || '—'}</div></div>
              <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Marca/Modelo</div><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{[bem.marca, bem.modelo].filter(Boolean).join(' ') || '—'}</div></div>
              <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>N° Série</div><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{bem.numero_serie || '—'}</div></div>
              <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Valor Aquisição</div><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{fmtMoney(bem.valor_aquisicao)}</div></div>
              <div><div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Data Aquisição</div><div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{fmtDate(bem.data_aquisicao)}</div></div>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Button onClick={() => { setShowMov(true); setMovForm({ tipo: 'transferencia', localizacao_origem_id: bem.localizacao_id || '', localizacao_destino_id: '', motivo: '' }); }}>
                🔄 Registrar Movimentação
              </Button>
              <Button variant="outline" onClick={() => onDetail(bem.id)}>
                📋 Ver Detalhes Completos
              </Button>
            </div>
          </div>

          {/* Form de movimentação inline */}
          {showMov && (
            <div style={{ padding: 20, background: 'var(--cbrio-input-bg)', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Nova Movimentação</div>
              <div style={styles.formGroup}>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Tipo de Movimentação *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(MOV_TIPO_COLORS).map(([k, v]) => (
                    <button key={k} onClick={() => setMovForm(f => ({ ...f, tipo: k }))}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `2px solid ${movForm.tipo === k ? v.c : C.border}`,
                        background: movForm.tipo === k ? v.bg : 'transparent', color: movForm.tipo === k ? v.c : C.text2,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
              </div>
              {['transferencia'].includes(movForm.tipo) && (
                <div style={styles.formRow}>
                  <Select label="Origem" value={movForm.localizacao_origem_id || ''} onChange={e => setMovForm(f => ({ ...f, localizacao_origem_id: e.target.value }))}>
                    <option value="">Local atual ({bem.pat_localizacoes?.nome || '—'})</option>
                    {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </Select>
                  <Select label="Destino *" value={movForm.localizacao_destino_id || ''} onChange={e => setMovForm(f => ({ ...f, localizacao_destino_id: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </Select>
                </div>
              )}
              {['entrada', 'saida'].includes(movForm.tipo) && (
                <Select label="Localização" value={movForm.localizacao_destino_id || ''} onChange={e => setMovForm(f => ({ ...f, localizacao_destino_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {localizacoes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </Select>
              )}
              <div style={styles.formGroup}>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Motivo / Observação</label>
                <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }}
                  value={movForm.motivo || ''} onChange={e => setMovForm(f => ({ ...f, motivo: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={handleRegistrarMov} disabled={saving}>
                  {saving ? 'Registrando...' : 'Confirmar Movimentação'}
                </Button>
                <Button variant="ghost" onClick={() => setShowMov(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Histórico de movimentações */}
          {(bem.movimentacoes || []).length > 0 && (
            <div style={{ padding: '0' }}>
              <div style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
                Histórico de Movimentações ({bem.movimentacoes.length})
              </div>
              {bem.movimentacoes.map(m => (
                <div key={m.id} style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{MOV_TIPO_COLORS[m.tipo]?.icon || '📋'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        <Badge status={m.tipo} map={MOV_TIPO_COLORS} />
                        {m.origem?.nome && m.destino?.nome && <span style={{ fontSize: 12, color: C.text2, marginLeft: 8 }}>{m.origem.nome} → {m.destino.nome}</span>}
                      </div>
                      {m.motivo && <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{m.motivo}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: C.text2 }}>{fmtDateTime(m.data_movimentacao)}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{m.profiles?.name || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leituras recentes */}
      {recentScans.length > 0 && !bem && (
        <div style={styles.card}>
          <div style={styles.cardHeader}><div style={styles.cardTitle}>Leituras Recentes</div></div>
          {recentScans.map((s, i) => (
            <div key={i} style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => { setCodigo(s.codigo); buscarPorCodigo(s.codigo); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: C.primary }}>{s.codigo}</span>
                <span style={{ fontSize: 13, color: C.text }}>{s.nome}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge status={s.status} map={STATUS_BEM} />
                <span style={{ fontSize: 11, color: C.text3 }}>{s.time.toLocaleTimeString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Movimentações de Estoque (Logística)
// ═══════════════════════════════════════════════════════════
const LOG_MOV_TIPO = {
  entrada: { c: C.green, bg: C.greenBg, label: 'Entrada', icon: '📥' },
  saida: { c: C.red, bg: C.redBg, label: 'Saída', icon: '📤' },
  transferencia: { c: C.blue, bg: C.blueBg, label: 'Transferência', icon: '🔄' },
  devolucao: { c: C.amber, bg: C.amberBg, label: 'Devolução', icon: '↩️' },
  inventario: { c: '#8b5cf6', bg: '#8b5cf618', label: 'Inventário', icon: '📋' },
};

function LogMovimentacoesTab({ data, loading, filtroTipo, setFiltroTipo, onNew, onReload }) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [historico, setHistorico] = useState([]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  async function startScan() {
    setScanning(true); setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] });
        const detectLoop = async () => {
          if (!videoRef.current || !scanning) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) { setScanResult(barcodes[0].rawValue); stopScan(); loadHistorico(barcodes[0].rawValue); return; }
          } catch (e) { /* continue */ }
          requestAnimationFrame(detectLoop);
        };
        requestAnimationFrame(detectLoop);
      }
    } catch (e) { setScanning(false); }
  }

  function stopScan() {
    setScanning(false);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  async function loadHistorico(codigo) {
    try { setHistorico(await logistica.movimentacoes.historico(codigo)); } catch (e) { console.error(e); }
  }

  function handleManualCode(e) {
    if (e.key === 'Enter' && e.target.value) { setScanResult(e.target.value); loadHistorico(e.target.value); }
  }

  return (<>
    <div style={styles.filterRow}>
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
        <option value="">Todos os tipos</option>
        {Object.entries(LOG_MOV_TIPO).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
      </select>
      <Button onClick={onNew}>+ Nova Movimentação</Button>
      <Button variant="outline" onClick={scanning ? stopScan : startScan}>
        {scanning ? '⏹ Parar Scanner' : '📷 Escanear Código'}
      </Button>
    </div>

    {scanning && (
      <div style={{ ...styles.card, marginBottom: 16, padding: 16, textAlign: 'center' }}>
        <video ref={videoRef} style={{ width: '100%', maxWidth: 400, borderRadius: 12, background: '#000' }} autoPlay playsInline muted />
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8 }}>Aponte a câmera para o código de barras</div>
      </div>
    )}

    {!scanning && (
      <div style={{ ...styles.card, marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: 1 }} placeholder="Digite ou escaneie o código de barras e pressione Enter"
            onKeyDown={handleManualCode} defaultValue={scanResult || ''} />
        </div>
      </div>
    )}

    {scanResult && (
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.cardHeader}>
          <div>
            <div style={styles.cardTitle}>Código: {scanResult}</div>
            <div style={{ fontSize: 12, color: C.text2 }}>{historico.length} movimentação(ões)</div>
          </div>
          <Button variant="ghost" onClick={() => { setScanResult(null); setHistorico([]); }}>✕</Button>
        </div>
        {historico.length > 0 ? (
          <table style={styles.table}><thead><tr>
            <th style={styles.th}>Data</th><th style={styles.th}>Tipo</th><th style={styles.th}>Descrição</th><th style={styles.th}>Qtd</th><th style={styles.th}>Local</th><th style={styles.th}>Responsável</th>
          </tr></thead><tbody>
            {historico.map(m => (
              <tr key={m.id}>
                <td style={styles.td}>{fmtDateTime(m.created_at)}</td>
                <td style={styles.td}><Badge status={m.tipo} map={LOG_MOV_TIPO} /></td>
                <td style={styles.td}>{m.descricao || '—'}</td>
                <td style={styles.td}>{m.quantidade} {m.unidade}</td>
                <td style={styles.td}>{m.localizacao || '—'}</td>
                <td style={styles.td}>{m.profiles?.name || '—'}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <div style={{ padding: 20, textAlign: 'center', color: C.text3 }}>Nenhuma movimentação para este código</div>}
      </div>
    )}

    <div style={styles.card}><div style={styles.cardHeader}><div style={styles.cardTitle}>Movimentações Recentes</div></div>
    <table style={styles.table}><thead><tr>
      <th style={styles.th}>Data</th><th style={styles.th}>Tipo</th><th style={styles.th}>Código</th><th style={styles.th}>Descrição</th><th style={styles.th}>Qtd</th><th style={styles.th}>Local</th><th style={styles.th}>Responsável</th>
    </tr></thead><tbody>
      {loading ? <tr><td style={styles.td} colSpan={7}>Carregando...</td></tr>
      : data.length === 0 ? <tr><td style={styles.td} colSpan={7}><div style={styles.empty}>Nenhuma movimentação registrada</div></td></tr>
      : data.map(m => (
        <tr key={m.id}>
          <td style={styles.td}>{fmtDateTime(m.created_at)}</td>
          <td style={styles.td}><Badge status={m.tipo} map={LOG_MOV_TIPO} /></td>
          <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 600 }}>{m.codigo_barras}</td>
          <td style={styles.td}>{m.descricao || '—'}</td>
          <td style={styles.td}>{m.quantidade} {m.unidade}</td>
          <td style={styles.td}>{m.localizacao || '—'}</td>
          <td style={styles.td}>{m.profiles?.name || '—'}</td>
        </tr>
      ))}
    </tbody></table></div>
  </>);
}

function LogMovimentacaoModal({ open, data, onClose, onSave, saving, upLogMov }) {
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  async function startScan() {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] });
        const detect = async () => {
          if (!videoRef.current) return;
          try { const b = await detector.detect(videoRef.current); if (b.length > 0) { upLogMov('codigo_barras', b[0].rawValue); stopScan(); return; } } catch {}
          if (scanning) requestAnimationFrame(detect);
        };
        requestAnimationFrame(detect);
      }
    } catch (e) { setScanning(false); }
  }

  function stopScan() {
    setScanning(false);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  useEffect(() => { if (!open) stopScan(); }, [open]);

  return (
    <Modal open={open} onClose={() => { stopScan(); onClose(); }} title="Nova Movimentação"
      footer={<><Button variant="outline" onClick={() => { stopScan(); onClose(); }}>Cancelar</Button><Button onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button></>}>
      {data && (<>
        <Select label="Tipo *" value={data.tipo || 'entrada'} onChange={e => upLogMov('tipo', e.target.value)}>
          {Object.entries(LOG_MOV_TIPO).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </Select>
        <div style={styles.formGroup}>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Código de Barras *</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: 1, fontFamily: 'monospace', fontSize: 16, fontWeight: 700 }}
              value={data.codigo_barras || ''} onChange={e => upLogMov('codigo_barras', e.target.value)} placeholder="Digite ou escaneie" />
            <Button variant={scanning ? 'destructive' : 'outline'} onClick={scanning ? stopScan : startScan}>
              {scanning ? '⏹' : '📷'}
            </Button>
          </div>
        </div>
        {scanning && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <video ref={videoRef} style={{ width: '100%', maxWidth: 300, borderRadius: 10, background: '#000' }} autoPlay playsInline muted />
          </div>
        )}
        <Input label="Descrição" value={data.descricao || ''} onChange={e => upLogMov('descricao', e.target.value)} />
        <div style={styles.formRow}>
          <Input label="Quantidade" type="number" step="0.001" value={data.quantidade || ''} onChange={e => upLogMov('quantidade', e.target.value)} />
          <Input label="Unidade" value={data.unidade || 'un'} onChange={e => upLogMov('unidade', e.target.value)} />
        </div>
        <Input label="Localização" value={data.localizacao || ''} onChange={e => upLogMov('localizacao', e.target.value)} placeholder="Ex: Depósito A, Sala 3" />
        <div style={styles.formGroup}>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
          <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 70, resize: 'vertical' }} value={data.observacoes || ''} onChange={e => upLogMov('observacoes', e.target.value)} />
        </div>
      </>)}
    </Modal>
  );
}
