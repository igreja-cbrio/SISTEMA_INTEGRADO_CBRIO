import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tag, ClipboardList, Trash2, Archive, Pencil, MapPin, ScanLine } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
// Coordenador de Operações/Logística = quem tem o cargo lider-logistica (já
// tem nível 4 no módulo patrimonio na matriz) — decisão do usuário 2026-07-29:
// a permissão vem do Role do sistema, não de uma atribuição manual à parte.
const CARGO_COORDENADOR_REVISAO = 'lider-logistica';
import { patrimonio, logistica } from '../../../api';
import { Button } from '../../../components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import BarcodeScanner from '../../../components/BarcodeScanner';
import Paginacao, { usePaginacaoLocal } from '../../../components/Paginacao';

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

const CICLO_STATUS = {
  aberto: { c: C.blue, bg: C.blueBg, label: 'Aberto' },
  encerrado: { c: C.text3, bg: '#73737318', label: 'Encerrado' },
};
const CONVOCACAO_STATUS = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  em_andamento: { c: C.blue, bg: C.blueBg, label: 'Em andamento' },
  concluida: { c: C.green, bg: C.greenBg, label: 'Concluída' },
};
const STATUS_FISICO_ITEM = {
  ok: { c: C.green, bg: C.greenBg, label: 'OK' },
  danificado: { c: C.amber, bg: C.amberBg, label: 'Danificado' },
  nao_encontrado: { c: C.red, bg: C.redBg, label: 'Não encontrado' },
};

const styles = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, lineHeight: 1.25 },
  subtitle: { fontSize: 14, color: C.text2, marginTop: 2, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab: (a) => ({ padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: a ? C.primary : C.text2, borderBottom: a ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }),
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
  kpi: (color) => ({ background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', borderRadius: 16, padding: 16, border: '1px solid var(--hairline)', borderLeft: `4px solid ${color}`, boxShadow: 'var(--shadow), var(--hi)' }),
  kpiValue: { fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.25 },
  kpiLabel: { fontSize: 12, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  card: { background: 'var(--cbrio-card)', borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' },
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
  modal: { background: 'var(--panel)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)', border: '1px solid var(--hairline)', borderRadius: 16, width: '95%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-hover), var(--hi)' },
  modalHeader: { padding: '20px 24px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 24px 24px' },
  modalFooter: { padding: '12px 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14, lineHeight: 1.5 },
  clickRow: { cursor: 'pointer', transition: 'background 0.1s' },
};

// Árvore de localizações (pai_id) · pedido do usuário 2026-07-29. Monta a
// árvore a partir da lista plana e devolve tanto a versão aninhada (pra
// exibição expansível em CatLocTab) quanto achatada com profundidade (pra
// indentar as options dos <select> de localização em todo o módulo).
function buildLocTree(localizacoes) {
  const byId = new Map(localizacoes.map(l => [l.id, { ...l, children: [] }]));
  const roots = [];
  for (const l of byId.values()) {
    if (l.pai_id && byId.has(l.pai_id)) byId.get(l.pai_id).children.push(l);
    else roots.push(l);
  }
  const sortRec = (arr) => { arr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); arr.forEach(n => sortRec(n.children)); };
  sortRec(roots);
  return roots;
}
function flattenLocTree(tree, depth = 0, out = []) {
  for (const node of tree) {
    out.push({ ...node, depth });
    if (node.children?.length) flattenLocTree(node.children, depth + 1, out);
  }
  return out;
}
const locIndent = (depth) => depth > 0 ? '  '.repeat(depth) + '— ' : '';

const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
const fmtCodigo = (c) => {
  if (c == null) return '—';
  const s = String(c);
  const m = s.match(/^([A-Z]+-?)(\d+)$/);
  if (m) return m[1] + m[2].padStart(5, '0');
  if (/^\d+$/.test(s)) return s.padStart(5, '0');
  return s;
};

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

const TABS = ['Dashboard', 'Bens', 'Categorias / Localizações', 'Inventários', 'Revisão', 'Movimentações'];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

export default function Patrimonio() {
  const { isAdmin: isDiretor, cargoSlug } = useAuth();
  const isCoordenadorRevisao = isDiretor || cargoSlug === CARGO_COORDENADOR_REVISAO;
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
  const [saving, setSaving] = useState(false);

  const [dashError, setDashError] = useState(false);
  const [indicadores, setIndicadores] = useState(null);
  const [revisaoCiclos, setRevisaoCiclos] = useState([]);
  const [revisaoIndic, setRevisaoIndic] = useState(null);
  const [responsaveis, setResponsaveis] = useState([]);
  const [modalNovoCiclo, setModalNovoCiclo] = useState(false);
  const [modalConvocacao, setModalConvocacao] = useState(null);
  const loadDash = useCallback(async () => { try { setDashError(false); setDash(await patrimonio.dashboard()); } catch (e) { console.error(e); setDashError(true); setDash({ totalBens: 0, ativos: 0, manutencao: 0, baixados: 0, extraviados: 0, valorTotal: 0, porCategoria: {}, porLocalizacao: {}, inventariosAbertos: 0 }); } }, []);
  const loadIndicadores = useCallback(async () => { try { setIndicadores(await patrimonio.dashboardIndicadores()); } catch (e) { console.error(e); } }, []);
  const [depreciacaoIndic, setDepreciacaoIndic] = useState(null);
  const loadDepreciacao = useCallback(async () => { try { setDepreciacaoIndic(await patrimonio.dashboardDepreciacao()); } catch (e) { console.error(e); } }, []);
  const loadBens = useCallback(async () => {
    try { setLoading(true); const p = {}; if (filtroStatus) p.status = filtroStatus; if (filtroCat) p.categoria_id = filtroCat; if (filtroLoc) p.localizacao_id = filtroLoc; if (busca) p.busca = busca; setBens(await patrimonio.bens.list(p)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, [filtroStatus, filtroCat, filtroLoc, busca]);
  const loadCats = useCallback(async () => { try { setCategorias(await patrimonio.categorias.list()); } catch (e) { console.error(e); } }, []);
  const loadLocs = useCallback(async () => { try { setLocalizacoes(await patrimonio.localizacoes.list()); } catch (e) { console.error(e); } }, []);
  const loadInvs = useCallback(async () => { try { setInventarios(await patrimonio.inventarios.list()); } catch (e) { console.error(e); } }, []);
  const loadRevisao = useCallback(async () => { try { setRevisaoCiclos(await patrimonio.revisao.ciclos()); } catch (e) { console.error(e); } }, []);
  const loadRevisaoIndic = useCallback(async () => { try { setRevisaoIndic(await patrimonio.revisao.indicadores()); } catch (e) { console.error(e); } }, []);
  const loadResponsaveis = useCallback(async () => { try { setResponsaveis(await patrimonio.revisao.responsaveis()); } catch (e) { console.error(e); } }, []);

  // Aba central de Movimentações (pedido do usuário 2026-07-29, item 1) —
  // paginação server-side (lista pode crescer além do cap de 1000), carregada
  // só quando a aba é aberta ou os filtros/página mudam.
  const [movList, setMovList] = useState([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movPage, setMovPage] = useState(1);
  const [movLoading, setMovLoading] = useState(false);
  const [movFiltroTipo, setMovFiltroTipo] = useState('');
  const [movFiltroLoc, setMovFiltroLoc] = useState('');
  const [movBusca, setMovBusca] = useState('');
  const MOV_PAGE_SIZE = 50;
  const loadMovimentacoes = useCallback(async () => {
    try {
      setMovLoading(true);
      const p = { page: movPage, pageSize: MOV_PAGE_SIZE };
      if (movFiltroTipo) p.tipo = movFiltroTipo;
      if (movFiltroLoc) p.localizacao_id = movFiltroLoc;
      if (movBusca) p.busca = movBusca;
      const res = await patrimonio.movimentacoes.list(p);
      setMovList(res.data || []); setMovTotal(res.total || 0);
    } catch (e) { console.error(e); } finally { setMovLoading(false); }
  }, [movPage, movFiltroTipo, movFiltroLoc, movBusca]);

  useEffect(() => { loadDash(); loadIndicadores(); loadDepreciacao(); loadBens(); loadCats(); loadLocs(); loadInvs(); loadRevisao(); loadRevisaoIndic(); loadResponsaveis(); }, []);
  useEffect(() => { loadBens(); }, [filtroStatus, filtroCat, filtroLoc, busca]);
  useEffect(() => { if (tab === 5) loadMovimentacoes(); }, [tab, movPage, movFiltroTipo, movFiltroLoc, movBusca]);
  useEffect(() => { setMovPage(1); }, [movFiltroTipo, movFiltroLoc, movBusca]);

  async function saveBem(data) {
    try { if (data.id) await patrimonio.bens.update(data.id, data); else await patrimonio.bens.create(data); setModalBem(null); loadBens(); loadDash(); } catch (e) { setError(e.message); }
  }
  async function baixarBem(id) {
    if (!confirm('Dar baixa neste bem? Ele sai de "ativo" (fica marcado como baixado), mas o cadastro e o histórico de movimentações são preservados — dá pra reativar depois editando o status.')) return;
    try { await patrimonio.bens.remove(id); loadBens(); loadDash(); setModalDetail(null); } catch (e) { setError(e.message); }
  }
  async function openDetail(id) { try { setModalDetail(await patrimonio.bens.get(id)); } catch (e) { setError(e.message); } }
  async function openDetailPorCodigo(codigo) {
    try { setModalDetail(await patrimonio.bens.porCodigo(codigo)); }
    catch (e) { setError(`Nenhum bem encontrado para o código "${codigo}".`); }
  }
  async function saveMov(bemId, data) {
    try { await patrimonio.bens.movimentar(bemId, data); setModalMov(null); openDetail(bemId); loadBens(); loadDash(); } catch (e) { setError(e.message); }
  }
  async function dispensarAlerta(bemId) {
    try { await patrimonio.bens.dispensarAlerta(bemId); openDetail(bemId); loadBens(); } catch (e) { setError(e.message); }
  }
  async function addCat() { if (!newCat.trim()) return; try { await patrimonio.categorias.create({ nome: newCat }); setNewCat(''); loadCats(); loadDash(); } catch (e) { setError(e.message); } }
  async function removeCat(id) { if (!confirm('Remover categoria?')) return; try { await patrimonio.categorias.remove(id); loadCats(); } catch (e) { setError(e.message); } }
  async function updateCat(id, data) { try { await patrimonio.categorias.update(id, data); loadCats(); loadDepreciacao(); } catch (e) { setError(e.message); } }
  async function addLoc(nome, pai_id) { const n = nome ?? newLoc; if (!n.trim()) return; try { await patrimonio.localizacoes.create({ nome: n, pai_id: pai_id || null }); setNewLoc(''); loadLocs(); loadDash(); } catch (e) { setError(e.message); } }
  async function removeLoc(id) { if (!confirm('Remover localização? Bens e sub-localizações apontando pra ela não são movidos automaticamente.')) return; try { await patrimonio.localizacoes.remove(id); loadLocs(); } catch (e) { setError(e.message); } }
  async function updateLoc(id, data) { try { await patrimonio.localizacoes.update(id, data); loadLocs(); } catch (e) { setError(e.message); } }
  // Lista achatada em ordem de árvore (indentada) — usada em todo select de
  // localização do módulo (pedido do usuário 2026-07-29: agrupamento em árvore).
  const locOptions = useMemo(() => flattenLocTree(buildLocTree(localizacoes)), [localizacoes]);
  async function saveInv(data) { try { await patrimonio.inventarios.create(data); setModalInv(null); loadInvs(); loadDash(); } catch (e) { setError(e.message); } }
  async function updateInvStatus(id, status) { try { const upd = { status }; if (status === 'concluido') upd.data_fim = new Date().toISOString().slice(0, 10); await patrimonio.inventarios.atualizar(id, upd); loadInvs(); loadDash(); } catch (e) { setError(e.message); } }
  async function criarCiclo(data) { try { await patrimonio.revisao.criarCiclo(data); setModalNovoCiclo(false); loadRevisao(); } catch (e) { setError(e.message); } }
  async function abrirConvocacao(id) { try { setModalConvocacao(await patrimonio.revisao.convocacao(id)); } catch (e) { setError(e.message); } }
  async function iniciarConvocacao(id) { try { await patrimonio.revisao.iniciar(id); await abrirConvocacao(id); loadRevisao(); } catch (e) { setError(e.message); } }
  async function atualizarItemRevisao(itemId, data) { try { await patrimonio.revisao.atualizarItem(itemId, data); if (modalConvocacao) await abrirConvocacao(modalConvocacao.id); loadRevisao(); } catch (e) { setError(e.message); } }
  async function concluirConvocacao(id) { if (!confirm('Concluir esta convocação? Confirma que a conferência física terminou.')) return; try { await patrimonio.revisao.concluir(id); setModalConvocacao(null); loadRevisao(); loadRevisaoIndic(); } catch (e) { setError(e.message); } }


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

      {tab === 0 && (
        <DashboardTab
          dash={dash}
          indicadores={indicadores}
          depreciacaoIndic={depreciacaoIndic}
          onNavigate={(targetTab, status) => { setFiltroStatus(status || ''); setTab(targetTab); }}
          onNavigateFiltro={(f) => {
            setFiltroStatus(''); setFiltroCat(f.categoria_id || ''); setFiltroLoc(f.localizacao_id || '');
            setTab(1);
          }}
          onAbrirBem={openDetail}
        />
      )}
      {tab === 1 && (
        <BensTab bens={bens} loading={loading} busca={busca} setBusca={setBusca}
          filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
          filtroCat={filtroCat} setFiltroCat={setFiltroCat} filtroLoc={filtroLoc} setFiltroLoc={setFiltroLoc}
          categorias={categorias} localizacoes={localizacoes} locOptions={locOptions}
          onNew={() => setModalBem({})} onDetail={openDetail} onDetailPorCodigo={openDetailPorCodigo}
          onBaixar={baixarBem} isDiretor={isDiretor}
        />
      )}
      {tab === 2 && <CatLocTab categorias={categorias} localizacoes={localizacoes} locOptions={locOptions} newCat={newCat} setNewCat={setNewCat} addCat={addCat} removeCat={removeCat} updateCat={updateCat} addLoc={addLoc} removeLoc={removeLoc} updateLoc={updateLoc} isDiretor={isDiretor} />}
      {tab === 3 && <InventariosTab inventarios={inventarios} onNew={() => setModalInv({})} onUpdate={updateInvStatus} isDiretor={isDiretor} />}
      {tab === 4 && (
        <RevisaoTab ciclos={revisaoCiclos} indicadores={revisaoIndic}
          onNovoCiclo={() => setModalNovoCiclo(true)} onAbrirConvocacao={abrirConvocacao}
          isDiretor={isDiretor} isCoordenadorRevisao={isCoordenadorRevisao}
        />
      )}
      {tab === 5 && (
        <MovimentacoesTab list={movList} total={movTotal} page={movPage} pageSize={MOV_PAGE_SIZE} loading={movLoading}
          onPageChange={setMovPage} locOptions={locOptions}
          filtroTipo={movFiltroTipo} setFiltroTipo={setMovFiltroTipo}
          filtroLoc={movFiltroLoc} setFiltroLoc={setMovFiltroLoc}
          busca={movBusca} setBusca={setMovBusca}
          onAbrirBem={openDetail}
        />
      )}

      <BemFormModal open={!!modalBem} data={modalBem} categorias={categorias} locOptions={locOptions} responsaveis={responsaveis} onClose={() => setModalBem(null)} onSave={saveBem} />
      <BemDetailModal open={!!modalDetail} data={modalDetail} onClose={() => setModalDetail(null)} onEdit={(b) => { setModalDetail(null); setModalBem(b); }} onBaixar={baixarBem} onMov={(bemId) => setModalMov({ bem_id: bemId })} onDispensarAlerta={dispensarAlerta} isDiretor={isDiretor} />
      <MovFormModal open={!!modalMov} data={modalMov} locOptions={locOptions} onClose={() => setModalMov(null)} onSave={saveMov} />
      <InvFormModal open={!!modalInv} onClose={() => setModalInv(null)} onSave={saveInv} />
      <NovoCicloModal open={modalNovoCiclo} responsaveis={responsaveis} onClose={() => setModalNovoCiclo(false)} onSave={criarCiclo} />
      <ConvocacaoModal open={!!modalConvocacao} data={modalConvocacao} locOptions={locOptions} onClose={() => setModalConvocacao(null)} onIniciar={iniciarConvocacao} onAtualizarItem={atualizarItemRevisao} onConcluir={concluirConvocacao} isDiretor={isCoordenadorRevisao} />
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

function PatStatCard({ label, value, bg, svg, onClick }) {
  // Font-size adaptativo baseado no comprimento do texto
  const valueStr = String(value ?? '');
  let fontSize = 28;
  if (valueStr.length > 10) fontSize = 24;
  if (valueStr.length > 13) fontSize = 20;
  if (valueStr.length > 16) fontSize = 17;
  return (
    <div
      className="cbrio-kpi"
      onClick={onClick}
      title={valueStr}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--panel)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)',
        borderRadius: 16, padding: '20px 24px', minHeight: 100,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; } }}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow), var(--hi)'; } }}
    >
      {/* tint translúcido do acento + faixa no topo + ícone fantasma */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${bg}22, transparent 58%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: bg, opacity: 0.9 }} />
      <div style={{ position: 'absolute', right: -8, top: -4, opacity: 0.07 }}>{svg}</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text2, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize, fontWeight: 700, letterSpacing: -0.5, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      </div>
    </div>
  );
}

function DashboardTab({ dash, indicadores, depreciacaoIndic, onNavigate, onNavigateFiltro, onAbrirBem }) {
  if (!dash) return <div style={styles.empty}>Carregando dashboard...</div>;
  // Tab 1 = Bens; filtra por status quando aplicável
  const kpis = [
    { label: 'Total de Bens', value: dash.totalBens, bg: '#0a0a0a', status: '' },
    { label: 'Ativos', value: dash.ativos, bg: '#10b981', status: 'ativo' },
    { label: 'Manutenção', value: dash.manutencao, bg: '#f59e0b', status: 'manutencao' },
    { label: 'Baixados', value: dash.baixados, bg: '#6b7280', status: 'baixado' },
    { label: 'Extraviados', value: dash.extraviados, bg: '#ef4444', status: 'extraviado' },
    { label: 'Valor Total', value: fmtMoney(dash.valorTotal), bg: '#3b82f6', status: '' },
  ];
  const totalBens = indicadores?.total_bens || dash.totalBens || 0;
  const pct = (n) => totalBens ? `${Math.round((n / totalBens) * 100)}%` : '—';
  const saneamento = indicadores ? [
    { label: 'Sem Localização', value: `${indicadores.sem_localizacao} (${pct(indicadores.sem_localizacao)})`, bg: '#f59e0b', filtro: { localizacao_id: '__sem__' } },
    { label: 'Sem Categoria', value: `${indicadores.sem_categoria} (${pct(indicadores.sem_categoria)})`, bg: '#f59e0b', filtro: { categoria_id: '__sem__' } },
    { label: 'Sem Valor de Aquisição', value: `${indicadores.sem_valor} (${pct(indicadores.sem_valor)})`, bg: '#f59e0b', filtro: null },
  ] : [];
  return (
    <>
      <div className="cbrio-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {kpis.map((k, i) => <PatStatCard key={k.label} label={k.label} value={k.value} bg={k.bg} svg={PAT_STAT_SVGS[i % PAT_STAT_SVGS.length]} onClick={() => onNavigate(1, k.status)} />)}
      </div>

      {/* Saneamento de cadastro — pedido do usuário 2026-07-28: indicadores
          que viram lista de trabalho (clicável), não só números soltos. */}
      {indicadores && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Saneamento de cadastro</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {saneamento.map((k) => <PatStatCard key={k.label} label={k.label} value={k.value} bg={k.bg} svg={null} onClick={k.filtro ? () => onNavigateFiltro(k.filtro) : undefined} />)}
          </div>
        </div>
      )}

      {/* Depreciação · indicador GERENCIAL interno (pedido do usuário 2026-07-29) —
          linear, derivado sob demanda a partir da vida útil configurada por
          categoria. NÃO é cálculo contábil oficial. */}
      {depreciacaoIndic && depreciacaoIndic.bens_com_depreciacao > 0 && (
        <div style={{ ...styles.card, marginBottom: 24, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={styles.cardTitle}>Depreciação (indicador gerencial)</div>
            <div style={{ fontSize: 11, color: C.text3 }}>Cálculo linear interno — não substitui avaliação contábil oficial</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 12 }}>
            <div><div style={{ fontSize: 11, color: C.text2 }}>Valor de aquisição</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(depreciacaoIndic.valor_aquisicao_total)}</div></div>
            <div><div style={{ fontSize: 11, color: C.text2 }}>Valor atual estimado</div><div style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{fmtMoney(depreciacaoIndic.valor_atual_estimado_total)}</div></div>
            <div><div style={{ fontSize: 11, color: C.text2 }}>Bens com depreciação calculada</div><div style={{ fontSize: 16, fontWeight: 700 }}>{depreciacaoIndic.bens_com_depreciacao}</div></div>
            {depreciacaoIndic.bens_sem_configuracao > 0 && (
              <div><div style={{ fontSize: 11, color: C.text2 }}>Sem vida útil configurada</div><div style={{ fontSize: 16, fontWeight: 700, color: C.amber }}>{depreciacaoIndic.bens_sem_configuracao}</div></div>
            )}
          </div>
        </div>
      )}

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

      {indicadores && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={styles.card}>
            <div style={styles.cardHeader}><div style={styles.cardTitle}>Alto valor sem movimentação (365d+)</div></div>
            <div style={{ padding: 16 }}>
              {(indicadores.alto_valor_sem_movimentacao || []).map((b) => (
                <div key={b.id} className="cbrio-row" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}` }} onClick={() => onAbrirBem(b.id)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{b.nome}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{b.localizacao_nome || 'Sem localização'} · {b.dias_sem_mover != null ? `${b.dias_sem_mover}d sem mover` : 'Nunca movimentado'}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>{fmtMoney(b.valor_aquisicao)}</div>
                </div>
              ))}
              {(!indicadores.alto_valor_sem_movimentacao || indicadores.alto_valor_sem_movimentacao.length === 0) && <div style={styles.empty}>Nenhum bem de alto valor parado</div>}
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardHeader}><div style={styles.cardTitle}>Manutenção atrasada (30d+)</div></div>
            <div style={{ padding: 16 }}>
              {(indicadores.manutencao_atrasada || []).map((b) => (
                <div key={b.id} className="cbrio-row" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}` }} onClick={() => onAbrirBem(b.id)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{b.nome}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{b.localizacao_nome || 'Sem localização'}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{b.dias_em_manutencao != null ? `${b.dias_em_manutencao}d` : '—'}</div>
                </div>
              ))}
              {(!indicadores.manutencao_atrasada || indicadores.manutencao_atrasada.length === 0) && <div style={styles.empty}>Nenhuma manutenção atrasada</div>}
            </div>
          </div>
        </div>
      )}

      {indicadores?.tendencia_baixas_mensal?.length > 0 && (
        <div style={{ ...styles.card, marginBottom: 24 }}>
          <div style={styles.cardHeader}><div style={styles.cardTitle}>Tendência de baixas (últimos 12 meses)</div></div>
          <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'flex-end', height: 100, overflowX: 'auto' }}>
            {indicadores.tendencia_baixas_mensal.map((m) => {
              const max = Math.max(...indicadores.tendencia_baixas_mensal.map(x => x.total), 1);
              return (
                <div key={m.mes} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 36 }} title={`${m.mes}: ${m.total} baixa(s)`}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{m.total}</div>
                  <div style={{ width: 20, height: Math.max(4, (m.total / max) * 60), background: C.red, borderRadius: 3 }} />
                  <div style={{ fontSize: 10, color: C.text3 }}>{m.mes.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dash.inventariosAbertos > 0 && (
        <div style={{ ...styles.card, borderLeft: `4px solid ${C.amber}`, padding: 16, fontSize: 13, color: C.text }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClipboardList style={{ width: 16, height: 16, color: '#00B39D' }} /> {dash.inventariosAbertos} inventário(s) em andamento</span>
        </div>
      )}
    </>
  );
}

function BensTab({ bens, loading, busca, setBusca, filtroStatus, setFiltroStatus, filtroCat, setFiltroCat, filtroLoc, setFiltroLoc, categorias, locOptions, onNew, onDetail, onDetailPorCodigo, onBaixar, isDiretor }) {
  const { pageItems: bensPag, paginacaoProps: bensPagProps } = usePaginacaoLocal(bens, 25);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  function handleDetected(code) {
    setScanning(false);
    onDetailPorCodigo(code);
  }

  return (
    <>
      <div style={styles.filterRow}>
        <div style={{ display: 'flex', gap: 6, flex: '1 1 220px', minWidth: 200, maxWidth: 320 }}>
          <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="🔍 Buscar por nome ou número..." value={busca} onChange={e => setBusca(e.target.value)} />
          <Button variant={scanning ? 'destructive' : 'outline'} size="icon" title="Escanear código de barras" onClick={() => { setScanError(''); setScanning(s => !s); }}>
            <ScanLine style={{ width: 16, height: 16 }} />
          </Button>
        </div>
        <select style={styles.select} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_BEM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={styles.select} value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
          <option value="">Todas categorias</option>
          <option value="__sem__">— Sem categoria —</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select style={styles.select} value={filtroLoc} onChange={e => setFiltroLoc(e.target.value)}>
          <option value="">Todas localizações</option>
          <option value="__sem__">— Sem localização —</option>
          {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
        </select>
        {isDiretor && <div style={{ marginLeft: 'auto' }}><Button onClick={onNew}>+ Novo Bem</Button></div>}
      </div>

      {scanning && (
        <div style={{ ...styles.card, marginBottom: 16, padding: 20, maxWidth: 400 }}>
          <BarcodeScanner active={scanning} onDetect={handleDetected} onError={(msg) => { setScanError(msg); setScanning(false); }} />
          <div style={{ fontSize: 13, color: C.text2, marginTop: 8, textAlign: 'center' }}>Aponte a câmera para o código de barras do patrimônio</div>
        </div>
      )}
      {scanError && (
        <div style={{ background: '#ef444418', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>{scanError}</div>
      )}

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
              {bensPag.map(b => (
                <tr key={b.id} className="cbrio-row" onClick={() => onDetail(b.id)}>
                  <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 12 }}>{fmtCodigo(b.codigo_barras)}</td>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{b.nome}</td>
                  <td style={styles.td}>{b.pat_categorias?.nome || '—'}</td>
                  <td style={styles.td}>
                    {b.pat_localizacoes?.nome || '—'}
                    {b.localizacao_pendente && <span title="Localização virou um grupamento — precisa de realocação pra uma sala final" style={{ ...styles.badge(C.amber, C.amberBg), marginLeft: 6 }}>⚠ pendente</span>}
                    {b.alerta_divergencia_item_id && <span title="Encontrado em outro lugar numa revisão periódica — veja o popup do bem" style={{ ...styles.badge(C.amber, C.amberBg), marginLeft: 6 }}>⚠ divergência</span>}
                  </td>
                  <td style={styles.td}>{[b.marca, b.modelo].filter(Boolean).join(' ') || '—'}</td>
                  <td style={styles.td}>{fmtMoney(b.valor_aquisicao)}</td>
                  <td style={styles.td}><Badge status={b.status} map={STATUS_BEM} /></td>
                  {isDiretor && <td style={styles.td}>{b.status !== 'baixado' && <Button variant="ghost" size="xs" title="Dar baixa" onClick={e => { e.stopPropagation(); onBaixar(b.id); }}><Archive style={{ width: 14, height: 14 }} /></Button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Paginacao {...bensPagProps} itemLabel="bens" />
    </>
  );
}

// Nó da árvore de localizações (expandir/colapsar filhas · pedido do usuário
// 2026-07-29: "clique na localização-pai expande pra mostrar as salas").
function LocTreeNode({ node, depth, expanded, toggleExpanded, isDiretor, onEdit, removeLoc }) {
  const temFilhas = node.children.length > 0;
  const aberto = expanded.has(node.id);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', paddingLeft: depth * 18, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: temFilhas ? 'pointer' : 'default' }} onClick={() => temFilhas && toggleExpanded(node.id)}>
          {temFilhas ? <span style={{ width: 14, display: 'inline-block', fontSize: 11, color: C.text3 }}>{aberto ? '▾' : '▸'}</span> : <MapPin style={{ width: 14, height: 14, color: '#00B39D' }} />}
          {node.nome}
          {temFilhas && <span style={{ fontSize: 11, color: C.text3 }}>({node.children.length})</span>}
        </span>
        {isDiretor && (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button variant="ghost" size="xs" onClick={() => onEdit(node)}><Pencil style={{ width: 13, height: 13 }} /></Button>
            <Button variant="ghost" size="xs" onClick={() => removeLoc(node.id)}><Trash2 style={{ width: 14, height: 14 }} /></Button>
          </span>
        )}
      </div>
      {temFilhas && aberto && node.children.map(c => (
        <LocTreeNode key={c.id} node={c} depth={depth + 1} expanded={expanded} toggleExpanded={toggleExpanded} isDiretor={isDiretor} onEdit={onEdit} removeLoc={removeLoc} />
      ))}
    </div>
  );
}

function CatLocTab({ categorias, localizacoes, locOptions, newCat, setNewCat, addCat, removeCat, updateCat, addLoc, removeLoc, updateLoc, isDiretor }) {
  const [novoNomeLoc, setNovoNomeLoc] = useState('');
  const [novoPaiLoc, setNovoPaiLoc] = useState('');
  const [editLoc, setEditLoc] = useState(null); // { id, nome, pai_id }
  const [editCat, setEditCat] = useState(null); // { id, nome, icone, vida_util_meses }
  const [expanded, setExpanded] = useState(() => new Set());
  const tree = useMemo(() => buildLocTree(localizacoes), [localizacoes]);
  const toggleExpanded = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function submitNovaLoc() {
    if (!novoNomeLoc.trim()) return;
    addLoc(novoNomeLoc, novoPaiLoc || null);
    setNovoNomeLoc(''); setNovoPaiLoc('');
  }
  function salvarEdicaoLoc() {
    if (!editLoc.nome.trim()) return;
    updateLoc(editLoc.id, { nome: editLoc.nome, pai_id: editLoc.pai_id || null });
    setEditLoc(null);
  }
  function salvarEdicaoCat() {
    if (!editCat.nome.trim()) return;
    updateCat(editCat.id, { nome: editCat.nome, icone: editCat.icone || null, vida_util_meses: editCat.vida_util_meses ? Number(editCat.vida_util_meses) : null });
    setEditCat(null);
  }

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
              <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {c.icone && `${c.icone} `}{c.nome}
                {c.vida_util_meses ? <span style={{ fontSize: 11, color: C.text3 }}>({c.vida_util_meses}m vida útil)</span> : null}
              </span>
              {isDiretor && (
                <span style={{ display: 'flex', gap: 2 }}>
                  <Button variant="ghost" size="xs" onClick={() => setEditCat({ id: c.id, nome: c.nome, icone: c.icone || '', vida_util_meses: c.vida_util_meses || '' })}><Pencil style={{ width: 13, height: 13 }} /></Button>
                  <Button variant="ghost" size="xs" onClick={() => removeCat(c.id)}><Trash2 style={{ width: 14, height: 14 }} /></Button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.cardHeader}><div style={styles.cardTitle}>Localizações ({localizacoes.length})</div></div>
        <div style={{ padding: 16 }}>
          {isDiretor && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: '1 1 160px' }} placeholder="Nova localização..." value={novoNomeLoc} onChange={e => setNovoNomeLoc(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitNovaLoc()} />
              <select style={{ ...styles.select, flex: '1 1 160px' }} value={novoPaiLoc} onChange={e => setNovoPaiLoc(e.target.value)}>
                <option value="">— Localização pai (opcional) —</option>
                {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
              </select>
              <Button size="xs" onClick={submitNovaLoc}>+</Button>
            </div>
          )}
          {localizacoes.length === 0 && <div style={styles.empty}>Nenhuma localização</div>}
          {tree.map(node => (
            <LocTreeNode key={node.id} node={node} depth={0} expanded={expanded} toggleExpanded={toggleExpanded} isDiretor={isDiretor} onEdit={setEditLoc} removeLoc={removeLoc} />
          ))}
        </div>
      </div>
      <Modal open={!!editLoc} onClose={() => setEditLoc(null)} title="Editar localização" footer={<Button onClick={salvarEdicaoLoc}>Salvar</Button>}>
        {editLoc && (
          <>
            <Input label="Nome" value={editLoc.nome} onChange={e => setEditLoc(p => ({ ...p, nome: e.target.value }))} />
            <Select label="Localização pai" value={editLoc.pai_id || ''} onChange={e => setEditLoc(p => ({ ...p, pai_id: e.target.value }))}>
              <option value="">— Nenhuma (raiz) —</option>
              {locOptions.filter(l => l.id !== editLoc.id).map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
            </Select>
          </>
        )}
      </Modal>
      <Modal open={!!editCat} onClose={() => setEditCat(null)} title="Editar categoria" footer={<Button onClick={salvarEdicaoCat}>Salvar</Button>}>
        {editCat && (
          <>
            <Input label="Nome" value={editCat.nome} onChange={e => setEditCat(p => ({ ...p, nome: e.target.value }))} />
            <Input label="Ícone (emoji, opcional)" value={editCat.icone} onChange={e => setEditCat(p => ({ ...p, icone: e.target.value }))} />
            <Input label="Vida útil (meses) — indicador gerencial de depreciação, opcional" type="number" min="1" value={editCat.vida_util_meses} onChange={e => setEditCat(p => ({ ...p, vida_util_meses: e.target.value }))} />
            <div style={{ fontSize: 11, color: C.text3 }}>Deixe em branco pra não calcular depreciação nessa categoria. É um cálculo linear interno (não oficial/contábil).</div>
          </>
        )}
      </Modal>
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

// Histórico central de Movimentações (pedido do usuário 2026-07-29, item 1):
// todos os itens, local antigo/novo, motivo, com destaque pras que vieram de
// uma revisão agendada (revisao_item_id preenchido — hoje ainda não é escrito
// por nenhum fluxo; o destaque já fica pronto pro item 2).
function MovimentacoesTab({ list, total, page, pageSize, loading, onPageChange, locOptions, filtroTipo, setFiltroTipo, filtroLoc, setFiltroLoc, busca, setBusca, onAbrirBem }) {
  return (
    <>
      <div style={styles.filterRow}>
        <input className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ flex: '1 1 220px', minWidth: 200, maxWidth: 320 }} placeholder="🔍 Buscar por nome ou código do bem..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select style={styles.select} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_MOV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select style={styles.select} value={filtroLoc} onChange={e => setFiltroLoc(e.target.value)}>
          <option value="">Todas localizações (origem ou destino)</option>
          {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
        </select>
      </div>
      <div style={styles.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>Data</th><th style={styles.th}>Item</th><th style={styles.th}>Tipo</th>
              <th style={styles.th}>Local antigo</th><th style={styles.th}>Local novo</th>
              <th style={styles.th}>Motivo / descrição</th><th style={styles.th}>Responsável</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={7} style={{ ...styles.td, textAlign: 'center', color: C.text3 }}>Nenhuma movimentação encontrada</td></tr>}
              {!loading && list.map(m => (
                <tr key={m.id} className="cbrio-row" style={m.revisao_item_id ? { background: C.blueBg, cursor: m.bem?.id ? 'pointer' : 'default' } : { cursor: m.bem?.id ? 'pointer' : 'default' }} onClick={() => m.bem?.id && onAbrirBem(m.bem.id)}>
                  <td style={styles.td}>{fmtDateTime(m.data_movimentacao)}</td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{m.bem?.nome || '—'}</div>
                    <div style={{ fontSize: 11, color: C.text3, fontFamily: 'monospace' }}>{fmtCodigo(m.bem?.codigo_barras)}</div>
                  </td>
                  <td style={styles.td}>
                    {TIPO_MOV[m.tipo] || m.tipo}
                    {m.revisao_item_id && <div><span style={styles.badge(C.blue, C.blueBg)} title="Movimentação registrada a partir de uma divergência encontrada numa revisão periódica">Via revisão</span></div>}
                  </td>
                  <td style={styles.td}>{m.origem?.nome || '—'}</td>
                  <td style={styles.td}>{m.destino?.nome || '—'}</td>
                  <td style={styles.td}>{m.motivo || '—'}</td>
                  <td style={styles.td}>{m.responsavel?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Paginacao page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} itemLabel="movimentações" />
    </>
  );
}

function BemFormModal({ open, data, categorias, locOptions, responsaveis, onClose, onSave }) {
  const [f, setF] = useState({});
  const [formError, setFormError] = useState('');
  useEffect(() => { if (data) { setF({ ...data }); setFormError(''); } }, [data]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  // Sugestão automática do responsável (pedido do usuário 2026-07-29, item 4):
  // ao escolher a localização, se ainda não há responsável definido, sugere
  // quem é o coordenador daquela localização — só sugestão, sempre editável.
  function updLocalizacao(v) {
    setF(p => (p.responsavel_id ? { ...p, localizacao_id: v } : { ...p, localizacao_id: v, responsavel_id: locOptions.find(l => l.id === v)?.coordenador_id || p.responsavel_id }));
  }
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
        <Select label="Localização" value={f.localizacao_id || ''} onChange={e => updLocalizacao(e.target.value)}>
          <option value="">Selecionar</option>
          {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
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
        <div style={styles.formGroup}><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data Aquisição</label><DatePicker value={f.data_aquisicao || ''} onChange={v => upd('data_aquisicao', v)} /></div>
        <Input label="Nº da NF" value={f.numero_nf || ''} onChange={e => upd('numero_nf', e.target.value)} />
      </div>
      <div style={styles.formRow}>
        <Select label="Responsável pelo bem" value={f.responsavel_id || ''} onChange={e => upd('responsavel_id', e.target.value)}>
          <option value="">Selecionar</option>
          {(responsaveis || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        {f.id && <Select label="Status" value={f.status || 'ativo'} onChange={e => upd('status', e.target.value)}>
          {Object.entries(STATUS_BEM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>}
      </div>
      <div style={styles.formRow}>
        <div style={styles.formGroup}>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Garantia</label>
          <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.tem_garantia ? 'sim' : 'nao'} onChange={e => upd('tem_garantia', e.target.value === 'sim')}>
            <option value="nao">Sem garantia</option>
            <option value="sim">Com garantia</option>
          </select>
        </div>
        {f.tem_garantia && <div style={styles.formGroup}><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Garantia até</label><DatePicker value={f.garantia_ate || ''} onChange={v => upd('garantia_ate', v)} /></div>}
      </div>
      {f.id && f.status === 'baixado' && (
        <div style={styles.formGroup}><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data da baixa</label><DatePicker value={f.data_baixa || ''} onChange={v => upd('data_baixa', v)} /></div>
      )}
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

function BemDetailModal({ open, data, onClose, onEdit, onBaixar, onMov, onDispensarAlerta, isDiretor }) {
  if (!data) return null;
  return (
    <Modal open={open} onClose={onClose} title={data.nome}>
      {data.alerta_divergencia_item_id && data.alerta && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: C.amberBg, border: `1px solid ${C.amber}`, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            ⚠ <strong>Encontrado em outro lugar numa revisão</strong> — visto em <strong>{data.alerta.localizacao_encontrada?.nome || '—'}</strong> em {fmtDate(data.alerta.data_revisao?.slice(0, 10))}, mas mantido aqui na localização registrada.
          </div>
          {isDiretor && <Button size="xs" variant="secondary" onClick={() => onDispensarAlerta(data.id)}>Dispensar alerta</Button>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Código:</span><div style={{ fontSize: 14, fontFamily: 'monospace' }}>{fmtCodigo(data.codigo_barras)}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Status:</span><div><Badge status={data.status} map={STATUS_BEM} /></div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Categoria:</span><div style={{ fontSize: 14 }}>{data.pat_categorias?.nome || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Localização:</span><div style={{ fontSize: 14 }}>{data.pat_localizacoes?.nome || '—'}{data.localizacao_pendente && <div style={{ fontSize: 11, color: C.amber, marginTop: 2 }}>⚠ virou grupamento — realocar pra uma sala final</div>}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Marca/Modelo:</span><div style={{ fontSize: 14 }}>{[data.marca, data.modelo].filter(Boolean).join(' ') || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Nº Série:</span><div style={{ fontSize: 14 }}>{data.numero_serie || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Valor Aquisição:</span><div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(data.valor_aquisicao)}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Data Aquisição:</span><div style={{ fontSize: 14 }}>{fmtDate(data.data_aquisicao)}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Nº da NF:</span><div style={{ fontSize: 14 }}>{data.numero_nf || '—'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Garantia:</span><div style={{ fontSize: 14 }}>{data.tem_garantia ? `Sim${data.garantia_ate ? ` (até ${fmtDate(data.garantia_ate)})` : ''}` : 'Não'}</div></div>
        <div><span style={{ fontSize: 11, color: C.text2 }}>Responsável:</span><div style={{ fontSize: 14 }}>{data.responsavel?.name || '—'}</div></div>
        {data.status === 'baixado' && <div><span style={{ fontSize: 11, color: C.text2 }}>Data da baixa:</span><div style={{ fontSize: 14 }}>{fmtDate(data.data_baixa)}</div></div>}
      </div>
      {data.depreciacao && (
        <div style={{ padding: '8px 12px', background: 'var(--cbrio-input-bg)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>Depreciação (indicador gerencial): <strong>{data.depreciacao.percentual_depreciado}%</strong> · valor atual estimado <strong style={{ color: C.primary }}>{fmtMoney(data.depreciacao.valor_atual_estimado)}</strong></span>
          </div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Cálculo linear interno — não é avaliação contábil oficial</div>
        </div>
      )}
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
          {data.status !== 'baixado' && (
            <Button variant="destructive" onClick={() => onBaixar(data.id)}><Archive style={{ width: 14, height: 14, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Dar baixa</Button>
          )}
        </div>
      )}
    </Modal>
  );
}

function MovFormModal({ open, data, locOptions, onClose, onSave }) {
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
          {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
        </Select>
      )}
      {(f.tipo === 'transferencia' || f.tipo === 'entrada') && (
        <Select label="Localização Destino" value={f.localizacao_destino_id || ''} onChange={e => upd('localizacao_destino_id', e.target.value)}>
          <option value="">Selecionar</option>
          {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
        </Select>
      )}
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Motivo</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.motivo || ''} onChange={e => upd('motivo', e.target.value)} />
      </div>
    </Modal>
  );
}

function RevisaoTab({ ciclos, indicadores, onNovoCiclo, onAbrirConvocacao, isDiretor, isCoordenadorRevisao }) {
  const [expandido, setExpandido] = useState(null);
  return (
    <>
      <div style={{ ...styles.card, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Coordenador do processo</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Quem ocupa o cargo <strong>Líder de Logística</strong> na matriz de permissões acompanha os indicadores e ajusta as rotinas de revisão.</div>
      </div>
      {indicadores && (
        <div className="cbrio-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <PatStatCard label="Convocações concluídas" value={indicadores.total_convocacoes_concluidas ?? 0} bg="#3b82f6" svg={null} />
          <PatStatCard label="Pontualidade" value={indicadores.pontualidade_pct != null ? `${indicadores.pontualidade_pct}%` : '—'} bg="#10b981" svg={null} />
          <PatStatCard label="Tempo médio de execução" value={indicadores.tempo_medio_minutos != null ? `${indicadores.tempo_medio_minutos} min` : '—'} bg="#f59e0b" svg={null} />
          <PatStatCard label="Divergências" value={indicadores.divergencia_pct != null ? `${indicadores.divergencia_pct}%` : '—'} bg="#ef4444" svg={null} />
        </div>
      )}
      <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>
        Pontualidade = cumpriu o prazo da convocação · Velocidade (tempo médio) sempre lida junto com divergências — execução rápida com muita divergência não é bom desempenho.
      </div>
      {isCoordenadorRevisao && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}><Button onClick={onNovoCiclo}>+ Novo ciclo de revisão</Button></div>}
      {ciclos.length === 0 && <div style={styles.empty}>Nenhum ciclo de revisão criado ainda</div>}
      {ciclos.map(c => (
        <div key={c.id} style={{ ...styles.card, marginBottom: 12 }}>
          <div style={{ ...styles.cardHeader, cursor: 'pointer' }} onClick={() => setExpandido(expandido === c.id ? null : c.id)}>
            <div>
              <div style={styles.cardTitle}>Inventário {c.nome}</div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                {fmtDate(c.data_inicio)} – {fmtDate(c.data_fim)} · Responsável: {c.profiles?.name || '—'} · {c.total_concluidas}/{c.total_convocacoes} localizações revisadas
              </div>
            </div>
            <Badge status={c.status} map={CICLO_STATUS} />
          </div>
          {expandido === c.id && (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead><tr>
                  <th style={styles.th}>Localização</th><th style={styles.th}>Prazo</th><th style={styles.th}>Bens</th>
                  <th style={styles.th}>Conferidos</th><th style={styles.th}>Divergências</th><th style={styles.th}>Status</th>
                </tr></thead>
                <tbody>
                  {c.convocacoes.map(v => (
                    <tr key={v.id} className="cbrio-row" style={{ cursor: 'pointer' }} onClick={() => onAbrirConvocacao(v.id)}>
                      <td style={styles.td}>{v.pat_localizacoes?.nome || '—'}</td>
                      <td style={styles.td}>{fmtDate(v.prazo)}</td>
                      <td style={styles.td}>{v.total_bens_esperados}</td>
                      <td style={styles.td}>{v.total_bens_conferidos}</td>
                      <td style={styles.td}>{v.total_divergencias}</td>
                      <td style={styles.td}><Badge status={v.status} map={CONVOCACAO_STATUS} /></td>
                    </tr>
                  ))}
                  {c.convocacoes.length === 0 && <tr><td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: C.text3 }}>Nenhuma localização com bens ativos para revisar</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function NovoCicloModal({ open, responsaveis, onClose, onSave }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({ data_inicio: new Date().toISOString().slice(0, 10) }); }, [open]);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  function handleSave() { if (!f.responsavel_id || !f.data_inicio) return; onSave(f); }
  return (
    <Modal open={open} onClose={onClose} title="Novo ciclo de revisão" footer={<Button onClick={handleSave}>Criar ciclo</Button>}>
      <div style={{ fontSize: 13, color: C.text2, marginBottom: 12 }}>
        Cria um ciclo trimestral (3 meses) e gera automaticamente uma convocação por localização com bens ativos, com prazos distribuídos ao longo do período.
      </div>
      <Select label="Responsável pelas revisões *" value={f.responsavel_id || ''} onChange={e => upd('responsavel_id', e.target.value)}>
        <option value="">Selecionar</option>
        {(responsaveis || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      <div style={styles.formGroup}><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data de início *</label><DatePicker value={f.data_inicio || ''} onChange={v => upd('data_inicio', v)} /></div>
    </Modal>
  );
}

// Divergência de localização (pedido do usuário 2026-07-29, item 2): quando o
// revisor marca "encontrado em" um local DIFERENTE do esperado (o da própria
// convocação), o bem NÃO é movido sozinho — surgem 2 botões pra decisão
// humana explícita. A escolha só é enviada ao clicar num dos botões; o
// select de status continua salvando na hora, como já era.
function RevisaoItemRow({ item, esperadaLocId, locOptions, disabled, onSave }) {
  const conferido = item.encontrado !== null && item.encontrado !== undefined;
  const [statusFisico, setStatusFisico] = useState(item.status_fisico || 'ok');
  const [localEncontrada, setLocalEncontrada] = useState(item.localizacao_encontrada_id || esperadaLocId || '');
  useEffect(() => {
    setStatusFisico(item.status_fisico || 'ok');
    setLocalEncontrada(item.localizacao_encontrada_id || esperadaLocId || '');
  }, [item.id, item.status_fisico, item.localizacao_encontrada_id, esperadaLocId]);

  const divergente = conferido && statusFisico !== 'nao_encontrado' && localEncontrada && esperadaLocId && localEncontrada !== esperadaLocId;
  const decidido = !!item.divergencia_acao;

  function salvarStatus(novoStatus) {
    setStatusFisico(novoStatus);
    onSave({ encontrado: novoStatus !== 'nao_encontrado', status_fisico: novoStatus, localizacao_encontrada_id: item.localizacao_encontrada_id || null, divergencia_acao: item.divergencia_acao || null });
  }
  function decidirDivergencia(acao) {
    onSave({ encontrado: statusFisico !== 'nao_encontrado', status_fisico: statusFisico, localizacao_encontrada_id: localEncontrada, divergencia_acao: acao });
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{item.pat_bens?.nome}</div>
          <div style={{ fontSize: 11, color: C.text3, fontFamily: 'monospace' }}>{fmtCodigo(item.pat_bens?.codigo_barras)}</div>
        </div>
        {disabled ? (
          conferido
            ? <Badge status={item.status_fisico || (item.encontrado ? 'ok' : 'nao_encontrado')} map={STATUS_FISICO_ITEM} />
            : <span style={{ fontSize: 12, color: C.text3 }}>Aguardando início</span>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <select style={styles.select} value={statusFisico} onChange={e => salvarStatus(e.target.value)}>
              <option value="ok">Encontrado · OK</option>
              <option value="danificado">Encontrado · Danificado</option>
              <option value="nao_encontrado">Não encontrado</option>
            </select>
            {conferido && <span style={{ fontSize: 13, color: C.green }}>✓</span>}
          </div>
        )}
      </div>
      {!disabled && conferido && statusFisico !== 'nao_encontrado' && locOptions?.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.text2 }}>Encontrado em:</span>
            <select style={{ ...styles.select, fontSize: 12 }} value={localEncontrada} onChange={e => setLocalEncontrada(e.target.value)}>
              {locOptions.map(l => <option key={l.id} value={l.id}>{locIndent(l.depth)}{l.nome}</option>)}
            </select>
          </div>
          {divergente && !decidido && (
            <div style={{ marginTop: 6, padding: 8, borderRadius: 8, background: C.amberBg, border: `1px solid ${C.amber}` }}>
              <div style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>⚠ Encontrado fora da localização esperada. O item não é movido automaticamente — escolha o que fazer:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button size="xs" onClick={() => decidirDivergencia('movido')}>Mover pra cá</Button>
                <Button size="xs" variant="secondary" onClick={() => decidirDivergencia('alerta')}>Manter alerta (não mover)</Button>
              </div>
            </div>
          )}
          {divergente && decidido && (
            <div style={{ marginTop: 4, fontSize: 11, color: item.divergencia_acao === 'movido' ? C.green : C.amber }}>
              {item.divergencia_acao === 'movido' ? '✓ Movido pra cá' : '⚠ Alerta mantido — segue registrado na localização original'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConvocacaoModal({ open, data, locOptions, onClose, onIniciar, onAtualizarItem, onConcluir, isDiretor }) {
  if (!data) return null;
  const itens = data.itens || [];
  const todosConferidos = itens.length > 0 && itens.every(i => i.encontrado !== null && i.encontrado !== undefined);
  return (
    <Modal open={open} onClose={onClose} title={`Revisão · ${data.pat_localizacoes?.nome || ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: C.text2, display: 'flex', alignItems: 'center', gap: 8 }}>Prazo: {fmtDate(data.prazo)} <Badge status={data.status} map={CONVOCACAO_STATUS} /></div>
        {data.status === 'pendente' && isDiretor && <Button size="xs" onClick={() => onIniciar(data.id)}>Iniciar conferência</Button>}
      </div>
      {itens.length === 0 && <div style={styles.empty}>Nenhum bem nesta localização</div>}
      {itens.map(item => (
        <RevisaoItemRow key={item.id} item={item} esperadaLocId={data.localizacao_id} locOptions={locOptions} disabled={data.status !== 'em_andamento'} onSave={(payload) => onAtualizarItem(item.id, payload)} />
      ))}
      {data.status === 'em_andamento' && isDiretor && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <Button onClick={() => onConcluir(data.id)} disabled={!todosConferidos} title={!todosConferidos ? 'Confira todos os bens antes de concluir' : ''}>
            Concluir convocação
          </Button>
        </div>
      )}
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
      <div style={styles.formGroup}><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Data Início *</label><DatePicker value={f.data_inicio || ''} onChange={v => upd('data_inicio', v)} /></div>
      <div style={styles.formGroup}>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Observações</label>
        <textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 60, resize: 'vertical' }} value={f.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </div>
    </Modal>
  );
}


