import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { logistica, ml, arquivei } from '../../../api';
import { supabase } from '../../../supabaseClient';
import { Button } from '../../../components/ui/button';

// ── Tema ────────────────────────────────────────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', purple: '#8b5cf6', purpleBg: '#8b5cf618',
};

const URGENCIA_COLORS = {
  urgente: { c: C.red, bg: C.redBg, label: 'Urgente' },
  alta: { c: C.amber, bg: C.amberBg, label: 'Alta' },
  normal: { c: C.blue, bg: C.blueBg, label: 'Normal' },
  baixa: { c: C.text3, bg: '#73737318', label: 'Baixa' },
};

const SOLICITACAO_STATUS = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  aprovado: { c: C.green, bg: C.greenBg, label: 'Aprovado' },
  rejeitado: { c: C.red, bg: C.redBg, label: 'Rejeitado' },
  em_cotacao: { c: C.blue, bg: C.blueBg, label: 'Em Cotação' },
  pedido_gerado: { c: C.primary, bg: C.primaryBg, label: 'Pedido Gerado' },
};

const PEDIDO_STATUS = {
  aguardando: { c: C.amber, bg: C.amberBg, label: 'Aguardando' },
  em_transito: { c: C.blue, bg: C.blueBg, label: 'Em Trânsito' },
  recebido: { c: C.green, bg: C.greenBg, label: 'Recebido' },
  cancelado: { c: C.red, bg: C.redBg, label: 'Cancelado' },
};

const CATEGORIAS = ['Escritório', 'Tecnologia', 'Limpeza', 'Alimentação', 'Construção', 'Serviços', 'Outros'];

// ── Estilos ─────────────────────────────────────────────────
const styles = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, lineHeight: 1.25 },
  subtitle: { fontSize: 14, color: C.text2, marginTop: 2, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24, flexWrap: 'wrap' },
  tab: (active) => ({
    padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
    color: active ? C.primary : C.text2,
    borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  }),
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
  kpi: (color) => ({
    background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`,
    borderLeft: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  }),
  kpiValue: { fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.25 },
  kpiLabel: { fontSize: 12, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden' },
  cardHeader: { padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 14, color: C.text, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 },
  badge: (color, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color, background: bg }),
  btn: (variant = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
    ...(variant === 'primary' ? { background: C.primary, color: '#fff' } : {}),
    ...(variant === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}),
    ...(variant === 'danger' ? { background: C.red, color: '#fff' } : {}),
    ...(variant === 'ghost' ? { background: 'transparent', color: C.text2, padding: '6px 12px' } : {}),
    ...(variant === 'success' ? { background: C.green, color: '#fff' } : {}),
  }),
  btnSm: { padding: '4px 10px', fontSize: 12 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', width: '100%', transition: 'border 0.15s', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)' },
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

// ── Helpers ─────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

// ── Componentes auxiliares ──────────────────────────────────
function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, ...(wide ? { maxWidth: 720 } : {}) }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <Button variant="ghost" className="text-lg" onClick={onClose}>&#x2715;</Button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (<div style={styles.formGroup}>{label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}<input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props} /></div>);
}
function Select({ label, children, ...props }) {
  return (<div style={styles.formGroup}>{label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}<select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props}>{children}</select></div>);
}
function Textarea({ label, ...props }) {
  return (<div style={styles.formGroup}>{label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}<textarea className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ minHeight: 70, resize: 'vertical' }} {...props} /></div>);
}
function Badge({ status, map }) {
  const s = map[status] || { c: C.text3, bg: '#73737318', label: status || '—' };
  return <span style={styles.badge(s.c, s.bg)}>{s.label}</span>;
}

// ── TABS ────────────────────────────────────────────────────
const TABS = ['Dashboard', 'Fornecedores', 'Solicitações', 'Pedidos', 'Notas Fiscais', 'Compras ML', 'Rastreio'];

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Logistica() {
  const { isDiretor } = useAuth();
  const [tab, setTab] = useState(0);
  const [dash, setDash] = useState(null);
  const [fornecedores, setFornecedores] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filtros
  const [filtroFornAtivo, setFiltroFornAtivo] = useState('');
  const [filtroSolStatus, setFiltroSolStatus] = useState('');
  const [filtroPedStatus, setFiltroPedStatus] = useState('');
  // Modals
  const [modalForn, setModalForn] = useState(null);
  const [modalSol, setModalSol] = useState(null);
  const [modalPed, setModalPed] = useState(null);
  const [modalReceber, setModalReceber] = useState(null);
  const [modalNota, setModalNota] = useState(null);
  const [modalItens, setModalItens] = useState(null); // pedido_id
  const [saving, setSaving] = useState(false);

  // ── Fetch ──────────────────────────────────────────────
  const fetchDash = useCallback(async () => {
    try { setDash(await logistica.dashboard()); } catch (e) { console.error(e); }
  }, []);

  const fetchFornecedores = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroFornAtivo !== '' ? { ativo: filtroFornAtivo } : undefined;
      setFornecedores(await logistica.fornecedores.list(params) || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [filtroFornAtivo]);

  const fetchSolicitacoes = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroSolStatus ? { status: filtroSolStatus } : undefined;
      setSolicitacoes(await logistica.solicitacoes.list(params) || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [filtroSolStatus]);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtroPedStatus ? { status: filtroPedStatus } : undefined;
      setPedidos(await logistica.pedidos.list(params) || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [filtroPedStatus]);

  const fetchNotas = useCallback(async () => {
    setLoading(true);
    try { setNotas(await logistica.notas.list() || []); } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 0) fetchDash();
    if (tab === 1) fetchFornecedores();
    if (tab === 2) fetchSolicitacoes();
    if (tab === 3) { fetchPedidos(); fetchFornecedores(); }
    if (tab === 4) { fetchNotas(); fetchFornecedores(); fetchPedidos(); }
  }, [tab, fetchDash, fetchFornecedores, fetchSolicitacoes, fetchPedidos, fetchNotas]);

  // ── Fornecedor CRUD ────────────────────────────────────
  const saveFornecedor = async () => {
    if (!modalForn?.razao_social?.trim()) { setError('Razão Social é obrigatória'); return; }
    if (modalForn.cnpj && modalForn.cnpj.replace(/\D/g, '').length > 0 && modalForn.cnpj.replace(/\D/g, '').length !== 14) { setError('CNPJ deve ter 14 dígitos'); return; }
    if (modalForn.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(modalForn.email)) { setError('Email inválido'); return; }
    setSaving(true);
    try {
      const { id, ...rest } = modalForn;
      if (id) await logistica.fornecedores.update(id, rest);
      else await logistica.fornecedores.create(rest);
      setModalForn(null); fetchFornecedores();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteFornecedor = async (id) => {
    if (!confirm('Excluir este fornecedor?')) return;
    try { await logistica.fornecedores.remove(id); fetchFornecedores(); } catch (e) { setError(e.message); }
  };

  const toggleFornecedorAtivo = async (forn) => {
    try { await logistica.fornecedores.update(forn.id, { ativo: !forn.ativo }); fetchFornecedores(); } catch (e) { setError(e.message); }
  };

  // ── Solicitação ────────────────────────────────────────
  const saveSolicitacao = async () => {
    if (!modalSol?.titulo?.trim()) { setError('Título é obrigatório'); return; }
    if (modalSol.valor_estimado && Number(modalSol.valor_estimado) < 0) { setError('Valor não pode ser negativo'); return; }
    setSaving(true);
    try {
      const { id, profiles, ...rest } = modalSol;
      if (id) await logistica.solicitacoes.atualizar(id, rest);
      else await logistica.solicitacoes.create(rest);
      setModalSol(null); fetchSolicitacoes(); fetchDash();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const atualizarStatusSolicitacao = async (id, status) => {
    try { await logistica.solicitacoes.atualizar(id, { status }); fetchSolicitacoes(); fetchDash(); } catch (e) { setError(e.message); }
  };

  // ── Pedido CRUD ────────────────────────────────────────
  const savePedido = async () => {
    if (!modalPed?.descricao?.trim()) { setError('Descrição é obrigatória'); return; }
    if (modalPed.valor_total && Number(modalPed.valor_total) < 0) { setError('Valor não pode ser negativo'); return; }
    setSaving(true);
    try {
      const { id, log_fornecedores, ...rest } = modalPed;
      if (id) await logistica.pedidos.update(id, rest);
      else await logistica.pedidos.create(rest);
      setModalPed(null); fetchPedidos(); fetchDash();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deletePedido = async (id) => {
    if (!confirm('Excluir este pedido?')) return;
    try { await logistica.pedidos.remove(id); fetchPedidos(); fetchDash(); } catch (e) { setError(e.message); }
  };

  const receberPedido = async () => {
    setSaving(true);
    try {
      await logistica.pedidos.receber(modalReceber.id, modalReceber);
      setModalReceber(null); fetchPedidos(); fetchDash();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  // ── Nota Fiscal ────────────────────────────────────────
  const saveNota = async () => {
    if (!modalNota?.numero?.trim()) { setError('Número da nota é obrigatório'); return; }
    if (!modalNota?.valor || Number(modalNota.valor) <= 0) { setError('Valor é obrigatório e deve ser positivo'); return; }
    if (!modalNota?.data_emissao) { setError('Data de emissão é obrigatória'); return; }
    setSaving(true);
    try {
      await logistica.notas.create(modalNota);
      setModalNota(null); fetchNotas();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteNota = async (id) => {
    if (!confirm('Excluir esta nota fiscal?')) return;
    try { await logistica.notas.remove(id); fetchNotas(); } catch (e) { setError(e.message); }
  };

  // ── Field updaters ─────────────────────────────────────
  const upForn = (k, v) => setModalForn(prev => ({ ...prev, [k]: v }));
  const upSol = (k, v) => setModalSol(prev => ({ ...prev, [k]: v }));
  const upPed = (k, v) => setModalPed(prev => ({ ...prev, [k]: v }));
  const upRec = (k, v) => setModalReceber(prev => ({ ...prev, [k]: v }));
  const upNota = (k, v) => setModalNota(prev => ({ ...prev, [k]: v }));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>🚚 Logística</div>
          <div style={styles.subtitle}>Fornecedores, compras, pedidos e notas fiscais</div>
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <Button variant="ghost" onClick={() => setError('')}>&#x2715;</Button>
        </div>
      )}

      <div style={styles.tabs}>
        {TABS.map((t, i) => (
          <button key={t} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && <DashboardTab dash={dash} />}
      {tab === 1 && (
        <FornecedoresTab data={fornecedores} loading={loading} isDiretor={isDiretor}
          filtroAtivo={filtroFornAtivo} setFiltroAtivo={setFiltroFornAtivo}
          onNew={() => setModalForn({ razao_social: '', nome_fantasia: '', cnpj: '', email: '', telefone: '', contato: '', categoria: '', ativo: true, observacoes: '' })}
          onEdit={(f) => setModalForn({ ...f })} onDelete={deleteFornecedor} onToggle={toggleFornecedorAtivo}
        />
      )}
      {tab === 2 && (
        <SolicitacoesTab data={solicitacoes} loading={loading} isDiretor={isDiretor}
          filtroStatus={filtroSolStatus} setFiltroStatus={setFiltroSolStatus}
          onNew={() => setModalSol({ titulo: '', descricao: '', justificativa: '', valor_estimado: '', urgencia: 'normal', area: '' })}
          onEdit={(s) => setModalSol({ ...s })}
          onAprovar={(id) => atualizarStatusSolicitacao(id, 'aprovado')}
          onRejeitar={(id) => atualizarStatusSolicitacao(id, 'rejeitado')}
        />
      )}
      {tab === 3 && (
        <PedidosTab data={pedidos} loading={loading} isDiretor={isDiretor}
          filtroStatus={filtroPedStatus} setFiltroStatus={setFiltroPedStatus}
          onNew={() => setModalPed({ fornecedor_id: '', descricao: '', valor_total: '', data_prevista: '', status: 'aguardando', codigo_rastreio: '', transportadora: '' })}
          onEdit={(p) => setModalPed({ ...p })} onDelete={deletePedido}
          onReceber={(p) => setModalReceber({ id: p.id, observacoes: '', status: 'ok' })}
          onItens={(p) => setModalItens(p.id)}
          fornecedores={fornecedores}
        />
      )}
      {tab === 4 && (
        <NotasFiscaisTab data={notas} loading={loading}
          onNew={() => setModalNota({ pedido_id: '', fornecedor_id: '', numero: '', serie: '', chave_acesso: '', valor: '', data_emissao: '', storage_path: '' })}
          onDelete={deleteNota} fornecedores={fornecedores} pedidos={pedidos}
          onReload={fetchNotas}
        />
      )}

      {tab === 5 && <ComprasMLTab />}
      {tab === 6 && <RastreioMLTab />}

      {/* ── MODAIS ─────────────────────────────────────────── */}

      {/* Fornecedor */}
      <Modal open={modalForn !== null} onClose={() => setModalForn(null)} title={modalForn?.id ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        footer={<><Button variant="outline" onClick={() => setModalForn(null)}>Cancelar</Button><Button onClick={saveFornecedor} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></>}>
        {modalForn && (<>
          <Input label="Razão Social *" value={modalForn.razao_social || ''} onChange={e => upForn('razao_social', e.target.value)} />
          <Input label="Nome Fantasia" value={modalForn.nome_fantasia || ''} onChange={e => upForn('nome_fantasia', e.target.value)} />
          <div style={styles.formRow}>
            <Input label="CNPJ" value={modalForn.cnpj || ''} onChange={e => upForn('cnpj', e.target.value)} />
            <Input label="Telefone" value={modalForn.telefone || ''} onChange={e => upForn('telefone', e.target.value)} />
          </div>
          <div style={styles.formRow}>
            <Input label="E-mail" value={modalForn.email || ''} onChange={e => upForn('email', e.target.value)} />
            <Input label="Contato" value={modalForn.contato || ''} onChange={e => upForn('contato', e.target.value)} />
          </div>
          <Select label="Categoria" value={modalForn.categoria || ''} onChange={e => upForn('categoria', e.target.value)}>
            <option value="">Selecione...</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Textarea label="Observações" value={modalForn.observacoes || ''} onChange={e => upForn('observacoes', e.target.value)} />
        </>)}
      </Modal>

      {/* Solicitação */}
      <Modal open={modalSol !== null} onClose={() => setModalSol(null)} title={modalSol?.id ? 'Editar Solicitação' : 'Nova Solicitação de Compra'}
        footer={<><Button variant="outline" onClick={() => setModalSol(null)}>Cancelar</Button><Button onClick={saveSolicitacao} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></>}>
        {modalSol && (<>
          <Input label="Título *" value={modalSol.titulo || ''} onChange={e => upSol('titulo', e.target.value)} />
          <Textarea label="Descrição" value={modalSol.descricao || ''} onChange={e => upSol('descricao', e.target.value)} />
          <Textarea label="Justificativa" value={modalSol.justificativa || ''} onChange={e => upSol('justificativa', e.target.value)} />
          <div style={styles.formRow}>
            <Input label="Valor Estimado" type="number" step="0.01" value={modalSol.valor_estimado || ''} onChange={e => upSol('valor_estimado', e.target.value)} />
            <Select label="Urgência" value={modalSol.urgencia || 'normal'} onChange={e => upSol('urgencia', e.target.value)}>
              <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
            </Select>
          </div>
          <Input label="Área" value={modalSol.area || ''} onChange={e => upSol('area', e.target.value)} />
        </>)}
      </Modal>

      {/* Pedido */}
      <Modal open={modalPed !== null} onClose={() => setModalPed(null)} title={modalPed?.id ? 'Editar Pedido' : 'Novo Pedido'}
        footer={<><Button variant="outline" onClick={() => setModalPed(null)}>Cancelar</Button><Button onClick={savePedido} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></>}>
        {modalPed && (<>
          <Textarea label="Descrição *" value={modalPed.descricao || ''} onChange={e => upPed('descricao', e.target.value)} />
          <div style={styles.formRow}>
            <Input label="Valor Total" type="number" step="0.01" value={modalPed.valor_total || ''} onChange={e => upPed('valor_total', e.target.value)} />
            <Input label="Data Prevista" type="date" value={modalPed.data_prevista || ''} onChange={e => upPed('data_prevista', e.target.value)} />
          </div>
          <div style={styles.formRow}>
            <Select label="Fornecedor" value={modalPed.fornecedor_id || ''} onChange={e => upPed('fornecedor_id', e.target.value)}>
              <option value="">Selecione...</option>
              {fornecedores.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>)}
            </Select>
            <Select label="Status" value={modalPed.status || 'aguardando'} onChange={e => upPed('status', e.target.value)}>
              <option value="aguardando">Aguardando</option><option value="em_transito">Em Trânsito</option><option value="cancelado">Cancelado</option>
            </Select>
          </div>
          <div style={styles.formRow}>
            <Input label="Código Rastreio" value={modalPed.codigo_rastreio || ''} onChange={e => upPed('codigo_rastreio', e.target.value)} />
            <Input label="Transportadora" value={modalPed.transportadora || ''} onChange={e => upPed('transportadora', e.target.value)} />
          </div>
        </>)}
      </Modal>

      {/* Recebimento */}
      <Modal open={modalReceber !== null} onClose={() => setModalReceber(null)} title="Registrar Recebimento"
        footer={<><Button variant="outline" onClick={() => setModalReceber(null)}>Cancelar</Button><Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={receberPedido} disabled={saving}>{saving ? 'Registrando...' : 'Confirmar Recebimento'}</Button></>}>
        {modalReceber && (<>
          <Select label="Status do recebimento" value={modalReceber.status || 'ok'} onChange={e => upRec('status', e.target.value)}>
            <option value="ok">OK — Tudo certo</option><option value="com_avaria">Com avaria</option><option value="incompleto">Incompleto</option>
          </Select>
          <Textarea label="Observações" value={modalReceber.observacoes || ''} onChange={e => upRec('observacoes', e.target.value)} />
        </>)}
      </Modal>

      {/* Nota Fiscal */}
      <NotaFiscalModal open={modalNota !== null} data={modalNota} onClose={() => setModalNota(null)}
        onSave={saveNota} saving={saving} fornecedores={fornecedores} pedidos={pedidos} upNota={upNota} />

      {/* Itens do Pedido */}
      <ItensPedidoModal open={modalItens !== null} pedidoId={modalItens} onClose={() => setModalItens(null)} />

    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: Dashboard
// ═══════════════════════════════════════════════════════════
const STAT_SVGS = [
  <svg key="s0" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="100" r="90" fill="#fff" fillOpacity="0.08" /><circle cx="260" cy="60" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="s1" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="140" r="100" fill="#fff" fillOpacity="0.07" /><circle cx="270" cy="40" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="s2" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="240" cy="80" r="80" fill="#fff" fillOpacity="0.08" /><circle cx="280" cy="150" r="55" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="s3" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="210" cy="120" r="95" fill="#fff" fillOpacity="0.07" /><circle cx="265" cy="50" r="45" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="s4" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="230" cy="90" r="85" fill="#fff" fillOpacity="0.08" /><circle cx="270" cy="160" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="s5" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="100" r="90" fill="#fff" fillOpacity="0.07" /><circle cx="260" cy="40" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="s6" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="110" r="88" fill="#fff" fillOpacity="0.08" /><circle cx="275" cy="55" r="52" fill="#fff" fillOpacity="0.09" /></svg>,
];

function StatCard({ label, value, bg, svg }) {
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
    { label: 'Fornecedores Ativos', value: dash.fornecedoresAtivos ?? 0, bg: '#00B39D' },
    { label: 'Solic. Pendentes', value: dash.solicitacoesPendentes ?? 0, bg: '#f59e0b' },
    { label: 'Ped. Aguardando', value: dash.pedidosAguardando ?? 0, bg: '#3b82f6' },
    { label: 'Ped. Em Trânsito', value: dash.pedidosEmTransito ?? 0, bg: '#8b5cf6' },
    { label: 'Ped. Recebidos', value: dash.pedidosRecebidos ?? 0, bg: '#10b981' },
    { label: 'Solic. Aprovadas', value: dash.solicitacoesAprovadas ?? 0, bg: '#6b7280' },
    { label: 'Valor Total Pedidos', value: fmtMoney(dash.valorTotalPedidos), bg: '#00B39D' },
  ];
  return (
    <div className="cbrio-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
      {kpis.map((k, i) => <StatCard key={k.label} label={k.label} value={k.value} bg={k.bg} svg={STAT_SVGS[i % STAT_SVGS.length]} />)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: Fornecedores
// ═══════════════════════════════════════════════════════════
function FornecedoresTab({ data, loading, isDiretor, filtroAtivo, setFiltroAtivo, onNew, onEdit, onDelete, onToggle }) {
  return (<>
    <div style={styles.filterRow}>
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}>
        <option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option>
      </select>
      {isDiretor && <Button onClick={onNew}>+ Novo Fornecedor</Button>}
    </div>
    <div style={styles.card}><table style={styles.table}><thead><tr>
      <th style={styles.th}>Nome</th><th style={styles.th}>CNPJ</th><th style={styles.th}>Categoria</th><th style={styles.th}>Contato</th><th style={styles.th}>Status</th>
      {isDiretor && <th style={styles.th}>Ações</th>}
    </tr></thead><tbody>
      {loading ? <tr><td colSpan={6}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>
      : data.length === 0 ? <tr><td colSpan={6}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhum fornecedor</span></div></td></tr>
      : data.map(f => (
        <tr key={f.id}>
          <td style={styles.td}><div style={{ fontWeight: 600 }}>{f.nome_fantasia || f.razao_social}</div>{f.nome_fantasia && <div style={{ fontSize: 11, color: C.text3 }}>{f.razao_social}</div>}</td>
          <td style={styles.td}>{f.cnpj || '—'}</td>
          <td style={styles.td}>{f.categoria || '—'}</td>
          <td style={styles.td}><div>{f.contato || '—'}</div>{f.email && <div style={{ fontSize: 11, color: C.text3 }}>{f.email}</div>}{f.telefone && <div style={{ fontSize: 11, color: C.text3 }}>{f.telefone}</div>}</td>
          <td style={styles.td}><span style={styles.badge(f.ativo ? C.green : C.text3, f.ativo ? C.greenBg : '#73737318')}>{f.ativo ? 'Ativo' : 'Inativo'}</span></td>
          {isDiretor && <td style={styles.td}><div style={{ display: 'flex', gap: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => onToggle(f)}>{f.ativo ? '⏸' : '▶'}</Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(f)}>✏️</Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(f.id)}>🗑</Button>
          </div></td>}
        </tr>
      ))}
    </tbody></table></div>
  </>);
}

// ═══════════════════════════════════════════════════════════
// TAB: Solicitações
// ═══════════════════════════════════════════════════════════
function SolicitacoesTab({ data, loading, isDiretor, filtroStatus, setFiltroStatus, onNew, onEdit, onAprovar, onRejeitar }) {
  return (<>
    <div style={styles.filterRow}>
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
        <option value="">Todos</option>
        {Object.entries(SOLICITACAO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <Button onClick={onNew}>+ Nova Solicitação</Button>
    </div>
    <div style={styles.card}><table style={styles.table}><thead><tr>
      <th style={styles.th}>Título</th><th style={styles.th}>Solicitante</th><th style={styles.th}>Área</th><th style={styles.th}>Valor Est.</th><th style={styles.th}>Urgência</th><th style={styles.th}>Status</th>
      <th style={styles.th}>Ações</th>
    </tr></thead><tbody>
      {loading ? <tr><td colSpan={7}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>
      : data.length === 0 ? <tr><td colSpan={7}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma solicitação</span></div></td></tr>
      : data.map(s => (
        <tr key={s.id}>
          <td style={{ ...styles.td, fontWeight: 600 }}>{s.titulo}</td>
          <td style={styles.td}>{s.profiles?.name || '—'}</td>
          <td style={styles.td}>{s.area || '—'}</td>
          <td style={styles.td}>{fmtMoney(s.valor_estimado)}</td>
          <td style={styles.td}><Badge status={s.urgencia} map={URGENCIA_COLORS} /></td>
          <td style={styles.td}><Badge status={s.status} map={SOLICITACAO_STATUS} /></td>
          <td style={styles.td}>
            <div style={{ display: 'flex', gap: 4 }}>
              {s.status === 'pendente' && onEdit && <Button variant="ghost" size="xs" onClick={() => onEdit(s)}>Editar</Button>}
              {s.status === 'pendente' && isDiretor && <>
                <Button size="xs" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => onAprovar(s.id)}>✓</Button>
                <Button variant="destructive" size="xs" onClick={() => onRejeitar(s.id)}>✕</Button>
              </>}
            </div>
          </td>
        </tr>
      ))}
    </tbody></table></div>
  </>);
}

// ═══════════════════════════════════════════════════════════
// TAB: Pedidos
// ═══════════════════════════════════════════════════════════
function PedidosTab({ data, loading, isDiretor, filtroStatus, setFiltroStatus, onNew, onEdit, onDelete, onReceber, onItens, fornecedores }) {
  const [selected, setSelected] = useState([]);

  function toggleSelect(id) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }
  function toggleAll() { setSelected(s => s.length === data.length ? [] : data.map(p => p.id)); }

  async function bulkDelete() {
    if (!selected.length || !confirm(`Excluir ${selected.length} pedido(s)?`)) return;
    for (const id of selected) { try { await onDelete(id); } catch {} }
    setSelected([]);
  }

  function exportPedidosCSV() {
    const headers = ['Descrição','Fornecedor','Valor','Data Prevista','Rastreio','Transportadora','Status'];
    const rows = data.map(p => [p.descricao, p.log_fornecedores?.nome_fantasia||p.log_fornecedores?.razao_social||'', p.valor_total||0, p.data_prevista||'', p.codigo_rastreio||'', p.transportadora||'', p.status]);
    const csv = [headers,...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `pedidos_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  return (<>
    <div style={styles.filterRow}>
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
        <option value="">Todos</option>
        {Object.entries(PEDIDO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
        {selected.length > 0 && <Button variant="destructive" size="sm" onClick={bulkDelete}>{selected.length} selecionado(s) — Excluir</Button>}
        <Button variant="outline" size="sm" onClick={exportPedidosCSV}>Exportar CSV</Button>
        {isDiretor && <Button onClick={onNew}>+ Novo Pedido</Button>}
      </div>
    </div>
    <div style={styles.card}><table style={styles.table}><thead><tr>
      <th style={{ ...styles.th, width: 36 }}><input type="checkbox" checked={selected.length === data.length && data.length > 0} onChange={toggleAll} /></th>
      <th style={styles.th}>Descrição</th><th style={styles.th}>Fornecedor</th><th style={styles.th}>Valor</th><th style={styles.th}>Data Prev.</th><th style={styles.th}>Rastreio</th><th style={styles.th}>Status</th><th style={styles.th}>Ações</th>
    </tr></thead><tbody>
      {loading ? <tr><td colSpan={8}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>
      : data.length === 0 ? <tr><td colSpan={8}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhum pedido</span></div></td></tr>
      : data.map(p => (
        <tr key={p.id} style={{ background: selected.includes(p.id) ? '#00B39D08' : 'transparent' }}>
          <td style={{ ...styles.td, width: 36 }}><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>
          <td style={{ ...styles.td, fontWeight: 600, maxWidth: 200 }}>{p.descricao}</td>
          <td style={styles.td}>{p.log_fornecedores?.nome_fantasia || p.log_fornecedores?.razao_social || '—'}</td>
          <td style={styles.td}>{fmtMoney(p.valor_total)}</td>
          <td style={styles.td}>{fmtDate(p.data_prevista)}</td>
          <td style={styles.td}>{p.codigo_rastreio || '—'}</td>
          <td style={styles.td}><Badge status={p.status} map={PEDIDO_STATUS} /></td>
          <td style={styles.td}><div style={{ display: 'flex', gap: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => onItens(p)} title="Itens">📦</Button>
            {['aguardando', 'em_transito'].includes(p.status) && <>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => onReceber(p)} title="Receber">✓</Button>
              <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>✏️</Button>
            </>}
            {p.status !== 'recebido' && <Button variant="ghost" size="sm" onClick={() => onDelete(p.id)}>🗑</Button>}
          </div></td>
        </tr>
      ))}
    </tbody></table></div>
  </>);
}

// ═══════════════════════════════════════════════════════════
// TAB: Notas Fiscais
// ═══════════════════════════════════════════════════════════
const NF_ORIGEM = {
  manual: { c: C.text3, bg: '#73737318', label: 'Manual' },
  mercadolivre: { c: '#FFE600', bg: '#FFE60020', label: 'Mercado Livre' },
  arquivei: { c: C.blue, bg: C.blueBg, label: 'Arquivei' },
};

function NotasFiscaisTab({ data, loading, onNew, onDelete, onReload }) {
  const [syncing, setSyncing] = useState(false);
  const [arquiveiStatus, setArquiveiStatus] = useState(null);
  const [arquiveiForm, setArquiveiForm] = useState({ api_id: '', api_key: '', cnpj: '07023068000135' });
  const [configuring, setConfiguring] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { checkArquivei(); }, []);

  async function checkArquivei() {
    try { setArquiveiStatus(await arquivei.status()); } catch (e) { setArquiveiStatus({ connected: false }); }
  }

  async function syncML() {
    setSyncing(true); setLocalError(''); setSuccessMsg('');
    try {
      const result = await ml.syncNotas();
      setSuccessMsg(`${result.imported} nota(s) importada(s) do Mercado Livre`);
      onReload();
    } catch (e) { setLocalError(e.message); }
    setSyncing(false);
  }

  async function syncArquiveiNFs() {
    setSyncing(true); setLocalError(''); setSuccessMsg('');
    try {
      const result = await arquivei.sync();
      setSuccessMsg(`${result.imported} nota(s) importada(s) do Arquivei`);
      onReload();
    } catch (e) { setLocalError(e.message); }
    setSyncing(false);
  }

  async function connectArquivei() {
    setConfiguring(true); setLocalError(''); setSuccessMsg('');
    try {
      await arquivei.config(arquiveiForm);
      checkArquivei();
      setSuccessMsg('Arquivei conectado com sucesso!');
    } catch (e) { setLocalError(e.message); }
    setConfiguring(false);
  }

  return (<>
    {localError && (
      <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {localError}
        <Button variant="ghost" onClick={() => setLocalError('')}>&#x2715;</Button>
      </div>
    )}
    {successMsg && (
      <div style={{ background: C.greenBg, color: C.green, padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {successMsg}
        <Button variant="ghost" onClick={() => setSuccessMsg('')}>&#x2715;</Button>
      </div>
    )}
    {/* Barra de ações */}
    <div style={styles.filterRow}>
      <Button onClick={onNew}>+ Nova Nota Fiscal</Button>
      <Button variant="outline" onClick={syncML} disabled={syncing}>
        {syncing ? '⏳ Sincronizando...' : '🛒 Importar do Mercado Livre'}
      </Button>
      {arquiveiStatus?.connected ? (
        <Button variant="outline" onClick={syncArquiveiNFs} disabled={syncing}>
          {syncing ? '⏳ Sincronizando...' : '📋 Importar do Arquivei'}
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setConfiguring(c => !c)}>
          ⚙️ Configurar Arquivei
        </Button>
      )}
    </div>

    {/* Config Arquivei inline */}
    {configuring && !arquiveiStatus?.connected && (
      <div style={{ ...styles.card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Conectar Arquivei — Importar NFs por CNPJ</div>
        <div style={{ fontSize: 12, color: C.text2, marginBottom: 12 }}>
          O Arquivei captura automaticamente todas as NFs emitidas contra o CNPJ da igreja na Sefaz.
          Crie uma conta em <a href="https://app.arquivei.com.br" target="_blank" rel="noopener noreferrer" style={{ color: C.primary }}>app.arquivei.com.br</a> e gere as credenciais da API.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Input label="API ID" value={arquiveiForm.api_id} onChange={e => setArquiveiForm(f => ({ ...f, api_id: e.target.value }))} />
          <Input label="API Key" value={arquiveiForm.api_key} onChange={e => setArquiveiForm(f => ({ ...f, api_key: e.target.value }))} />
          <Input label="CNPJ" value={arquiveiForm.cnpj} onChange={e => setArquiveiForm(f => ({ ...f, cnpj: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button onClick={connectArquivei} disabled={!arquiveiForm.api_id || !arquiveiForm.api_key}>Conectar</Button>
          <Button variant="ghost" onClick={() => setConfiguring(false)}>Cancelar</Button>
        </div>
      </div>
    )}

    {/* Status das integrações */}
    {arquiveiStatus?.connected && (
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 12, color: C.text2 }}>
        <span>📋 Arquivei: <strong style={{ color: C.green }}>Conectado</strong> (CNPJ: {arquiveiStatus.cnpj})</span>
        {arquiveiStatus.last_sync && <span>• Último sync: {fmtDateTime(arquiveiStatus.last_sync)}</span>}
      </div>
    )}

    {/* Tabela */}
    <div style={styles.card}><table style={styles.table}><thead><tr>
      <th style={styles.th}>Número</th><th style={styles.th}>Emitente</th><th style={styles.th}>Valor</th><th style={styles.th}>Emissão</th><th style={styles.th}>Origem</th><th style={styles.th}>PDF</th><th style={styles.th}>Ações</th>
    </tr></thead><tbody>
      {loading ? <tr><td colSpan={7}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></td></tr>
      : data.length === 0 ? <tr><td colSpan={7}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma nota fiscal</span><span className="text-xs text-muted-foreground">Importe do ML ou Arquivei</span></div></td></tr>
      : data.map(n => (
        <tr key={n.id}>
          <td style={{ ...styles.td, fontWeight: 600 }}>
            {n.numero}
            {n.serie && n.origem !== 'mercadolivre' ? `/${n.serie}` : ''}
            {n.origem === 'mercadolivre' && n.serie && <div style={{ fontSize: 11, color: C.text3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.serie}</div>}
          </td>
          <td style={styles.td}>
            {n.emitente_nome || n.log_fornecedores?.nome_fantasia || n.log_fornecedores?.razao_social || '—'}
            {n.emitente_cnpj && <div style={{ fontSize: 11, color: C.text3 }}>{n.emitente_cnpj}</div>}
          </td>
          <td style={{ ...styles.td, fontWeight: 600 }}>{fmtMoney(n.valor)}</td>
          <td style={styles.td}>{fmtDate(n.data_emissao)}</td>
          <td style={styles.td}><Badge status={n.origem || 'manual'} map={NF_ORIGEM} /></td>
          <td style={styles.td}>
            {n.storage_path ? <a href={n.storage_path} target="_blank" rel="noopener noreferrer" style={{ color: C.primary }}>📄 Ver</a>
            : n.origem === 'mercadolivre' && n.ml_order_id ? <a href={`https://www.mercadolivre.com.br/purchases/${n.ml_order_id}`} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontSize: 12 }}>🛒 Ver no ML</a>
            : '—'}
          </td>
          <td style={styles.td}><Button variant="ghost" size="sm" onClick={() => onDelete(n.id)}>🗑</Button></td>
        </tr>
      ))}
    </tbody></table></div>
  </>);
}

// ═══════════════════════════════════════════════════════════
// MODAL: Nota Fiscal (com upload PDF)
// ═══════════════════════════════════════════════════════════
function NotaFiscalModal({ open, data, onClose, onSave, saving, fornecedores, pedidos, upNota }) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const fileRef = useRef(null);

  async function handleUploadNF(file) {
    if (!file) return;
    setUploading(true); setLocalError('');
    try {
      const filePath = `notas-fiscais/${crypto.randomUUID()}_${file.name}`;
      const { error } = await supabase.storage.from('log-arquivos').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('log-arquivos').getPublicUrl(filePath);
      upNota('storage_path', publicUrl);
    } catch (e) { setLocalError('Erro ao enviar arquivo: ' + e.message); }
    finally { setUploading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Nota Fiscal"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={onSave} disabled={saving || uploading}>{saving ? 'Salvando...' : 'Salvar'}</Button></>}>
      {data && (<>
        {localError && (
          <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {localError}
            <Button variant="ghost" onClick={() => setLocalError('')}>&#x2715;</Button>
          </div>
        )}
        <div style={styles.formRow}>
          <Input label="Número *" value={data.numero || ''} onChange={e => upNota('numero', e.target.value)} />
          <Input label="Série" value={data.serie || ''} onChange={e => upNota('serie', e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <Input label="Valor *" type="number" step="0.01" value={data.valor || ''} onChange={e => upNota('valor', e.target.value)} />
          <Input label="Data Emissão *" type="date" value={data.data_emissao || ''} onChange={e => upNota('data_emissao', e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <Select label="Fornecedor" value={data.fornecedor_id || ''} onChange={e => upNota('fornecedor_id', e.target.value)}>
            <option value="">Selecione...</option>
            {fornecedores.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>)}
          </Select>
          <Select label="Pedido" value={data.pedido_id || ''} onChange={e => upNota('pedido_id', e.target.value)}>
            <option value="">Selecione...</option>
            {pedidos.map(p => <option key={p.id} value={p.id}>{p.descricao?.slice(0, 40)}</option>)}
          </Select>
        </div>
        <Input label="Chave de Acesso" value={data.chave_acesso || ''} onChange={e => upNota('chave_acesso', e.target.value)} />
        {/* Upload PDF */}
        <div style={styles.formGroup}>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">PDF da Nota Fiscal</label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleUploadNF(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${C.border}`, borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer' }}
          >
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleUploadNF(e.target.files?.[0])} />
            {data.storage_path ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <a href={data.storage_path} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontSize: 13 }}>PDF enviado ↗</a>
                <Button type="button" variant="ghost" className="text-red-500 text-xs" onClick={e => { e.stopPropagation(); upNota('storage_path', ''); }}>Remover</Button>
              </div>
            ) : uploading ? (
              <div style={{ color: C.primary, fontSize: 13 }}>Enviando...</div>
            ) : (
              <><div style={{ fontSize: 20 }}>📄</div><div style={{ fontSize: 13, color: C.text2 }}>Arraste o PDF aqui ou clique para selecionar</div></>
            )}
          </div>
        </div>
      </>)}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL: Itens do Pedido
// ═══════════════════════════════════════════════════════════
function ItensPedidoModal({ open, pedidoId, onClose }) {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ descricao: '', quantidade: '', unidade: 'un', valor_unit: '' });
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (pedidoId) loadItens();
  }, [pedidoId]);

  async function loadItens() {
    setLoading(true);
    try { setItens(await logistica.pedidos.itens(pedidoId) || []); } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function addItem() {
    if (!form.descricao || !form.quantidade) { setLocalError('Descrição e quantidade são obrigatórios'); return; }
    setAdding(true); setLocalError('');
    try {
      await logistica.pedidos.addItem(pedidoId, form);
      setForm({ descricao: '', quantidade: '', unidade: 'un', valor_unit: '' });
      loadItens();
    } catch (e) { setLocalError(e.message); }
    setAdding(false);
  }

  async function removeItem(id) {
    setLocalError('');
    try { await logistica.pedidos.removeItem(id); loadItens(); } catch (e) { setLocalError(e.message); }
  }

  const total = itens.reduce((s, i) => s + Number(i.valor_total || 0), 0);

  return (
    <Modal open={open} onClose={onClose} title="Itens do Pedido" wide>
      {localError && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {localError}
          <Button variant="ghost" onClick={() => setLocalError('')}>&#x2715;</Button>
        </div>
      )}
      {loading ? <div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div> : (<>
        <table style={styles.table}><thead><tr>
          <th style={styles.th}>Descrição</th><th style={styles.th}>Qtd</th><th style={styles.th}>Un.</th><th style={styles.th}>V. Unit.</th><th style={styles.th}>V. Total</th><th style={styles.th}></th>
        </tr></thead><tbody>
          {itens.map(i => (
            <tr key={i.id}>
              <td style={styles.td}>{i.descricao}</td>
              <td style={styles.td}>{i.quantidade}</td>
              <td style={styles.td}>{i.unidade}</td>
              <td style={styles.td}>{fmtMoney(i.valor_unit)}</td>
              <td style={styles.td}>{fmtMoney(i.valor_total)}</td>
              <td style={styles.td}><Button variant="ghost" size="sm" onClick={() => removeItem(i.id)}>🗑</Button></td>
            </tr>
          ))}
          {itens.length > 0 && <tr><td colSpan={4} style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>Total:</td><td style={{ ...styles.td, fontWeight: 700 }}>{fmtMoney(total)}</td><td style={styles.td}></td></tr>}
        </tbody></table>
        {itens.length === 0 && <div style={{ ...styles.empty, padding: 16 }}>Nenhum item adicionado</div>}

        {/* Add item form */}
        <div style={{ marginTop: 16, padding: 16, background: 'var(--cbrio-input-bg)', borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Adicionar Item</div>
          <Input label="Descrição *" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Input label="Quantidade *" type="number" step="0.001" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} />
            <Input label="Unidade" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} />
            <Input label="Valor Unitário" type="number" step="0.01" value={form.valor_unit} onChange={e => setForm(f => ({ ...f, valor_unit: e.target.value }))} />
          </div>
          <Button onClick={addItem} disabled={adding}>{adding ? 'Adicionando...' : 'Adicionar Item'}</Button>
        </div>
      </>)}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// ML: Status de pedidos do Mercado Livre
// ═══════════════════════════════════════════════════════════
const ML_ORDER_STATUS = {
  paid: { c: C.green, bg: C.greenBg, label: 'Pago' },
  confirmed: { c: C.green, bg: C.greenBg, label: 'Confirmado' },
  payment_required: { c: C.amber, bg: C.amberBg, label: 'Aguard. Pgto' },
  payment_in_process: { c: C.amber, bg: C.amberBg, label: 'Pgto em Processo' },
  cancelled: { c: C.red, bg: C.redBg, label: 'Cancelado' },
};

const ML_SHIP_STATUS = {
  pending: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  handling: { c: C.blue, bg: C.blueBg, label: 'Preparando' },
  ready_to_ship: { c: C.blue, bg: C.blueBg, label: 'Pronto p/ Envio' },
  shipped: { c: C.purple, bg: C.purpleBg, label: 'Enviado' },
  in_transit: { c: C.purple, bg: C.purpleBg, label: 'Em Trânsito' },
  delivered: { c: C.green, bg: C.greenBg, label: 'Entregue' },
  not_delivered: { c: C.red, bg: C.redBg, label: 'Não Entregue' },
  cancelled: { c: C.red, bg: C.redBg, label: 'Cancelado' },
};

// ═══════════════════════════════════════════════════════════
// TAB: Compras Mercado Livre
// ═══════════════════════════════════════════════════════════
function ComprasMLTab() {
  const [mlStatus, setMlStatus] = useState(null);
  const [orders, setOrders] = useState([]);
  const [paging, setPaging] = useState({ total: 0, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [configForm, setConfigForm] = useState({ client_id: '', client_secret: '' });
  const [configuring, setConfiguring] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [shipDetail, setShipDetail] = useState(null);
  const [localError, setLocalError] = useState('');

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const isCallback = params.get('ml_callback');
    if (isCallback && code) {
      // Clean URL immediately
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(true);
      ml.authCallback(code)
        .then(() => checkStatus())
        .catch(e => { setLocalError('Erro ao autorizar ML: ' + e.message); setLoading(false); });
    } else {
      checkStatus();
    }
  }, []);

  async function checkStatus() {
    setLoading(true);
    try {
      const status = await ml.status();
      setMlStatus(status);
      if (status.connected) loadOrders();
      else setLoading(false);
    } catch (e) { setMlStatus({ connected: false }); setLoading(false); }
  }

  async function loadOrders(offset = 0) {
    setLoading(true);
    setLocalError('');
    try {
      const params = { offset, limit: 20 };
      if (filtroStatus) params.status = filtroStatus;
      if (busca) params.q = busca;
      const data = await ml.orders(params);
      setOrders(data.results || []);
      setPaging({ total: data.paging?.total || 0, offset });
    } catch (e) {
      console.error(e);
      setLocalError('Erro ao carregar pedidos: ' + e.message);
    }
    setLoading(false);
  }

  useEffect(() => { if (mlStatus?.connected) loadOrders(0); }, [filtroStatus]);

  function handleSearch(e) {
    if (e.key === 'Enter') loadOrders(0);
  }

  async function toggleExpand(order) {
    if (expanded === order.id) { setExpanded(null); setShipDetail(null); return; }
    setExpanded(order.id);
    setShipDetail(null);
    if (order.shipping?.id) {
      try { setShipDetail(await ml.shipment(order.shipping.id)); } catch (e) { console.error(e); }
    }
  }

  async function handleConfig() {
    setConfiguring(true); setLocalError('');
    try {
      const data = await ml.config(configForm);
      if (data.auth_url) window.location.href = data.auth_url;
    } catch (e) { setLocalError(e.message); }
    setConfiguring(false);
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar do Mercado Livre?')) return;
    setLocalError('');
    try { await ml.disconnect(); checkStatus(); } catch (e) { setLocalError(e.message); }
  }

  if (mlStatus && !mlStatus.connected) {
    return (<>
      {localError && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {localError}
          <Button variant="ghost" onClick={() => setLocalError('')}>&#x2715;</Button>
        </div>
      )}
      <div style={{ ...styles.card, padding: 32, textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>Conectar ao Mercado Livre</div>
        <div style={{ fontSize: 13, color: C.text2, marginBottom: 24 }}>Configure as credenciais do seu app do Mercado Livre para importar compras automaticamente.</div>
        <div style={{ textAlign: 'left' }}>
          <Input label="Client ID (App ID)" value={configForm.client_id} onChange={e => setConfigForm(f => ({ ...f, client_id: e.target.value }))} />
          <Input label="Client Secret" type="password" value={configForm.client_secret} onChange={e => setConfigForm(f => ({ ...f, client_secret: e.target.value }))} />
        </div>
        <Button className="w-full mt-2 py-3 px-6 text-[15px]"
          onClick={handleConfig} disabled={configuring || !configForm.client_id || !configForm.client_secret}>
          {configuring ? 'Configurando...' : '🔗 Conectar ao Mercado Livre'}
        </Button>
        <div style={{ fontSize: 11, color: C.text3, marginTop: 16 }}>
          Crie seu app em <a href="https://developers.mercadolivre.com.br" target="_blank" rel="noopener noreferrer" style={{ color: C.primary }}>developers.mercadolivre.com.br</a>
        </div>
      </div>
    </>);
  }

  return (<>
    {localError && (
      <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {localError}
        <Button variant="ghost" onClick={() => setLocalError('')}>&#x2715;</Button>
      </div>
    )}
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🛒</span>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Mercado Livre</span>
          {mlStatus?.nickname && <span style={{ fontSize: 12, color: C.text2, marginLeft: 8 }}>({mlStatus.nickname})</span>}
          <span style={{ ...styles.badge(C.green, C.greenBg), marginLeft: 8 }}>Conectado</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ width: 200 }} placeholder="Buscar por produto, ID..." value={busca}
          onChange={e => setBusca(e.target.value)} onKeyDown={handleSearch} />
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="paid">Pagos</option>
          <option value="confirmed">Confirmados</option>
          <option value="cancelled">Cancelados</option>
        </select>
        <Button variant="ghost" size="sm" onClick={() => loadOrders(0)}>🔄</Button>
        <Button variant="ghost" size="sm" className="text-red-500" onClick={handleDisconnect}>Desconectar</Button>
      </div>
    </div>

    {/* Cards de compras */}
    {loading ? <div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando compras...</span></div>
    : orders.length === 0 ? <div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma compra encontrada</span></div>
    : <div style={{ display: 'grid', gap: 12 }}>
      {orders.map(o => {
        const isExpanded = expanded === o.id;
        const statusInfo = ML_ORDER_STATUS[o.status] || { c: C.text3, bg: '#73737318', label: o.status };
        return (
          <div key={o.id} style={{ ...styles.card, borderLeft: `4px solid ${statusInfo.c}`, cursor: 'pointer' }}
            onClick={() => toggleExpand(o)}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                {/* Thumbnail do produto */}
                {(() => {
                  const thumb = o.order_items?.[0]?.item?.thumbnail || o.order_items?.[0]?.item?.picture;
                  return (
                    <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'var(--cbrio-input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {thumb ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>📦</span>}
                    </div>
                  );
                })()}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(o.order_items || []).map((item, i) => (
                    <div key={i} style={{ marginBottom: i < o.order_items.length - 1 ? 6 : 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.item?.title}</div>
                      <div style={{ fontSize: 12, color: C.text3 }}>Qtd: {item.quantity} • Unit: {fmtMoney(item.unit_price)}</div>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>
                    <span style={{ fontFamily: 'monospace' }}>#{o.id}</span>
                    <span style={{ marginLeft: 10 }}>Vendedor: <strong>{o.seller?.nickname || '—'}</strong></span>
                    <span style={{ marginLeft: 10 }}>{o.date_created ? new Date(o.date_created).toLocaleDateString('pt-BR') : ''}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmtMoney(o.total_amount)}</div>
                  <Badge status={o.status} map={ML_ORDER_STATUS} />
                  <div style={{ fontSize: 14, color: C.text3, marginTop: 4, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</div>
                </div>
              </div>
            </div>

            {/* Detalhes expandidos */}
            {isExpanded && (
              <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px 20px', paddingTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Pagamento</div>
                    <div style={{ fontSize: 14, color: C.text }}>{o.payments?.[0]?.payment_type === 'credit_card' ? '💳 Cartão' : o.payments?.[0]?.payment_type || '—'}</div>
                    {o.payments?.[0]?.installments > 1 && <div style={{ fontSize: 12, color: C.text2 }}>{o.payments[0].installments}x de {fmtMoney(o.payments[0].installment_amount)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Data da Compra</div>
                    <div style={{ fontSize: 14, color: C.text }}>{o.date_created ? fmtDateTime(o.date_created) : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Envio</div>
                    {o.shipping?.id ? (
                      <div style={{ fontSize: 14, color: C.text }}>#{o.shipping.id}</div>
                    ) : <div style={{ fontSize: 14, color: C.text3 }}>Sem envio</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Ver no ML</div>
                    <a href={`https://www.mercadolivre.com.br/purchases/${o.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 13, color: C.primary, textDecoration: 'none' }}>Abrir compra ↗</a>
                  </div>
                </div>

                {/* Info de envio/rastreio */}
                {shipDetail && (
                  <div style={{ marginTop: 16, padding: 16, background: 'var(--cbrio-input-bg)', borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>📦 Informações de Envio</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px 16px' }}>
                      <div>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>STATUS</div>
                        <Badge status={shipDetail.status} map={ML_SHIP_STATUS} />
                        {shipDetail.substatus && <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{shipDetail.substatus}</div>}
                      </div>
                      {shipDetail.tracking_number && <div>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>RASTREIO</div>
                        <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 600, color: C.text }}>{shipDetail.tracking_number}</div>
                      </div>}
                      {shipDetail.tracking_method && <div>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>TRANSPORTADORA</div>
                        <div style={{ fontSize: 14, color: C.text }}>{shipDetail.tracking_method}</div>
                      </div>}
                      {shipDetail.date_created && <div>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>CRIADO EM</div>
                        <div style={{ fontSize: 14, color: C.text }}>{fmtDateTime(shipDetail.date_created)}</div>
                      </div>}
                      {shipDetail.last_updated && <div>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>ATUALIZADO</div>
                        <div style={{ fontSize: 14, color: C.text }}>{fmtDateTime(shipDetail.last_updated)}</div>
                      </div>}
                      {shipDetail.receiver_address && <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 11, color: C.text3, fontWeight: 600 }}>ENDEREÇO DE ENTREGA</div>
                        <div style={{ fontSize: 13, color: C.text }}>
                          {[shipDetail.receiver_address.street_name, shipDetail.receiver_address.street_number].filter(Boolean).join(', ')}
                          {shipDetail.receiver_address.city?.name && ` — ${shipDetail.receiver_address.city.name}`}
                          {shipDetail.receiver_address.state?.name && ` / ${shipDetail.receiver_address.state.name}`}
                          {shipDetail.receiver_address.zip_code && ` — CEP: ${shipDetail.receiver_address.zip_code}`}
                        </div>
                      </div>}
                    </div>

                    {/* Barra de progresso */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                      {['pending', 'handling', 'ready_to_ship', 'shipped', 'delivered'].map((step, i) => {
                        const steps = ['pending', 'handling', 'ready_to_ship', 'shipped', 'delivered'];
                        const currentIdx = steps.indexOf(shipDetail.status);
                        const active = i <= currentIdx;
                        const shipColor = (ML_SHIP_STATUS[shipDetail.status] || {}).c || C.text3;
                        return <div key={step} style={{ flex: 1, height: 4, borderRadius: 2, background: active ? shipColor : C.border }} />;
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      {['Pendente', 'Preparando', 'Pronto', 'Enviado', 'Entregue'].map(l => <span key={l} style={{ fontSize: 9, color: C.text3 }}>{l}</span>)}
                    </div>
                  </div>
                )}
                {o.shipping?.id && !shipDetail && <div style={{ marginTop: 12, fontSize: 13, color: C.text3 }}>Carregando envio...</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>}

    {/* Paginação */}
    {paging.total > 20 && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <span style={{ fontSize: 12, color: C.text2 }}>Mostrando {paging.offset + 1}–{Math.min(paging.offset + 20, paging.total)} de {paging.total}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" disabled={paging.offset === 0} onClick={() => loadOrders(paging.offset - 20)}>← Anterior</Button>
          <Button variant="ghost" size="sm" disabled={paging.offset + 20 >= paging.total} onClick={() => loadOrders(paging.offset + 20)}>Próximo →</Button>
        </div>
      </div>
    )}
  </>);
}

// ═══════════════════════════════════════════════════════════
// TAB: Rastreio
// ═══════════════════════════════════════════════════════════
function RastreioMLTab() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { loadShipments(); }, []);

  // Auto-refresh a cada 60s quando há envios em trânsito
  useEffect(() => {
    const hasActive = shipments.some(s => !['delivered', 'cancelled'].includes(s.status));
    if (!hasActive) return;
    const interval = setInterval(loadShipments, 60000);
    return () => clearInterval(interval);
  }, [shipments]);

  const [shipError, setShipError] = useState('');

  async function loadShipments(forceRefresh = false) {
    setLoading(true);
    setShipError('');
    try {
      const params = forceRefresh ? { refresh: 1 } : undefined;
      const data = await ml.shipments(params);
      setShipments(data || []);
    } catch (e) {
      console.error(e);
      setShipError('Erro ao carregar rastreios: ' + e.message);
    }
    setLoading(false);
  }

  async function toggleDetail(shipId) {
    if (expanded === shipId) { setExpanded(null); setDetail(null); return; }
    setExpanded(shipId);
    try {
      const data = await ml.shipment(shipId);
      setDetail(data);
    } catch (e) { console.error(e); }
  }

  // Separar em "Em trânsito" e "Entregues/Outros"
  const emTransito = shipments.filter(s => ['shipped', 'in_transit', 'ready_to_ship', 'handling', 'pending'].includes(s.status));
  const concluidos = shipments.filter(s => ['delivered', 'not_delivered', 'cancelled'].includes(s.status));

  if (loading) return <div style={styles.empty}>Carregando rastreios...</div>;
  if (shipments.length === 0) return (
    <div style={{ ...styles.card, padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Nenhum envio encontrado</div>
      <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>Conecte ao Mercado Livre na aba "Compras ML" para ver os rastreios.</div>
      <Button variant="outline" size="sm" style={{ marginTop: 16 }} onClick={() => { setLoading(true); ml.shipments({ refresh: 1 }).then(d => { setShipments(d.shipments || []); }).catch(() => {}).finally(() => setLoading(false)); }}>🔄 Tentar novamente</Button>
    </div>
  );

  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>📦 {emTransito.length} envio(s) em andamento</div>
      <Button variant="ghost" size="sm" onClick={() => { setLoading(true); ml.shipments({ refresh: 1 }).then(d => { setShipments(d.shipments || []); }).catch(() => {}).finally(() => setLoading(false)); }}>🔄 Atualizar</Button>
    </div>

    {/* Em trânsito */}
    {emTransito.length > 0 && (
      <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {emTransito.map(s => (
          <ShipmentCard key={s.id} ship={s} expanded={expanded === s.id}
            detail={expanded === s.id ? detail : null}
            onToggle={() => toggleDetail(s.id)} />
        ))}
      </div>
    )}

    {/* Concluídos */}
    {concluidos.length > 0 && (<>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, textTransform: 'uppercase', marginBottom: 12, marginTop: 24 }}>
        Concluídos ({concluidos.length})
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {concluidos.map(s => (
          <ShipmentCard key={s.id} ship={s} expanded={expanded === s.id}
            detail={expanded === s.id ? detail : null}
            onToggle={() => toggleDetail(s.id)} />
        ))}
      </div>
    </>)}
  </>);
}

// Tracker steps definition
const TRACK_STEPS = [
  { key: 'pending', label: 'Pedido Realizado', desc: 'Aguardando processamento' },
  { key: 'handling', label: 'Preparando Envio', desc: 'Produto sendo separado' },
  { key: 'ready_to_ship', label: 'Pronto para Envio', desc: 'Aguardando coleta' },
  { key: 'shipped', label: 'Enviado', desc: 'Em trânsito' },
  { key: 'delivered', label: 'Entregue', desc: 'Pedido finalizado' },
];

function ShipmentCard({ ship, expanded, detail, onToggle }) {
  const items = ship.order_items || [];
  const statusInfo = ML_SHIP_STATUS[ship.status] || { c: C.text3, bg: '#73737318', label: ship.status };
  const currentStepIdx = TRACK_STEPS.findIndex(s => s.key === ship.status);
  const itemImg = items[0]?.item?.thumbnail || items[0]?.item?.picture || null;

  return (
    <div style={{ ...styles.card, overflow: 'hidden', borderRadius: 14 }}>
      {/* Compact header — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ width: 48, height: 48, borderRadius: 8, background: statusInfo.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {itemImg ? <img src={itemImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>📦</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {items[0]?.item?.title || 'Produto'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtMoney(ship.total_amount)}</span>
            <span style={{ fontSize: 11, color: C.text3 }}>#{ship.order_id}</span>
          </div>
        </div>
        <span style={styles.badge(statusInfo.c, statusInfo.bg)}>{statusInfo.label}</span>
        <span style={{ fontSize: 13, color: C.text3, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : '' }}>▼</span>
      </div>

      {/* Progress bar — always visible */}
      <div style={{ padding: '0 18px 12px' }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {TRACK_STEPS.map((step, i) => (
            <div key={step.key} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= currentStepIdx ? (i < currentStepIdx ? '#10b981' : statusInfo.c) : C.border }} />
          ))}
        </div>
      </div>

      {/* Expanded — timeline + details */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {/* Product full info */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 18px' }}>
            <div style={{ width: 72, height: 72, borderRadius: 10, background: statusInfo.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {itemImg ? <img src={itemImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28 }}>📦</span>}
            </div>
            <div style={{ flex: 1 }}>
              {items.map((item, i) => (
                <div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{item.item?.title || 'Produto'}</div>
              ))}
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 4 }}>{fmtMoney(ship.total_amount)}</div>
              {items[0]?.quantity > 1 && <div style={{ fontSize: 12, color: C.text2 }}>Qtd: {items[0].quantity}</div>}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ padding: '0 18px 16px' }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {TRACK_STEPS.map((step, i) => {
                const isCompleted = i < currentStepIdx;
                const isActive = i === currentStepIdx;
                const isPending = i > currentStepIdx;
                const isLast = i === TRACK_STEPS.length - 1;
                const dotColor = isCompleted ? '#10b981' : isActive ? statusInfo.c : C.border;

                return (
                  <li key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 24 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isCompleted ? '#10b98120' : isActive ? `${statusInfo.c}20` : 'var(--cbrio-input-bg)',
                        border: `2px solid ${dotColor}`,
                      }}>
                        {isCompleted ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : isActive ? (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusInfo.c }} />
                        ) : (
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.text3, opacity: 0.3 }} />
                        )}
                      </div>
                      {!isLast && <div style={{ width: 2, height: 24, background: isCompleted ? '#10b981' : C.border, marginTop: 1 }} />}
                    </div>
                    <div style={{ paddingBottom: isLast ? 0 : 10, paddingTop: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isPending ? C.text3 : C.text }}>{step.label}</div>
                      <div style={{ fontSize: 11, color: isPending ? C.text3 : C.text2 }}>{step.desc}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Shipping details */}
          {detail && (
            <div style={{ padding: '0 18px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px 16px', padding: '12px 14px', background: 'var(--cbrio-input-bg)', borderRadius: 10 }}>
                {detail.tracking_number && (
                  <div><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Rastreio</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: C.text }}>{detail.tracking_number}</div></div>
                )}
                {detail.tracking_method && (
                  <div><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Transportadora</div>
                    <div style={{ fontSize: 12, color: C.text }}>{detail.tracking_method}</div></div>
                )}
                {detail.date_created && (
                  <div><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Criação</div>
                    <div style={{ fontSize: 12, color: C.text }}>{fmtDateTime(detail.date_created)}</div></div>
                )}
                {detail.last_updated && (
                  <div><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Atualização</div>
                    <div style={{ fontSize: 12, color: C.text }}>{fmtDateTime(detail.last_updated)}</div></div>
                )}
                {detail.receiver_address && (
                  <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', fontWeight: 600 }}>Endereço</div>
                    <div style={{ fontSize: 12, color: C.text }}>
                      {[detail.receiver_address.street_name, detail.receiver_address.street_number].filter(Boolean).join(', ')}
                      {detail.receiver_address.city?.name && ` — ${detail.receiver_address.city.name}`}
                      {detail.receiver_address.state?.name && ` / ${detail.receiver_address.state.name}`}
                      {detail.receiver_address.zip_code && ` • CEP: ${detail.receiver_address.zip_code}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action button */}
          <div style={{ padding: '0 18px 16px' }}>
            <a href={`https://www.mercadolivre.com.br/purchases/${ship.order_id}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', textAlign: 'center', padding: '10px 0', background: C.primary, color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              Ver no Mercado Livre ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

