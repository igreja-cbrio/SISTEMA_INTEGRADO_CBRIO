import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { financeiro } from '../../../api';
import { Button } from '../../../components/ui/button';
import { exportPDF } from '../../../lib/export';

// ── Tema ────────────────────────────────────────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const TIPO_CONTA = { corrente: 'Corrente', poupanca: 'Poupanca', caixa: 'Caixa', investimento: 'Investimento' };
const TIPO_TRANSACAO = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferencia' };

const STATUS_TRANSACAO = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  conciliado: { c: C.green, bg: C.greenBg, label: 'Conciliado' },
  cancelado: { c: C.text3, bg: '#73737318', label: 'Cancelado' },
};

const STATUS_PAGAR = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  pago: { c: C.green, bg: C.greenBg, label: 'Pago' },
  cancelado: { c: C.text3, bg: '#73737318', label: 'Cancelado' },
  vencido: { c: C.red, bg: C.redBg, label: 'Vencido' },
};

const STATUS_REEMBOLSO = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Pendente' },
  aprovado: { c: C.green, bg: C.greenBg, label: 'Aprovado' },
  rejeitado: { c: C.red, bg: C.redBg, label: 'Rejeitado' },
  pago: { c: C.blue, bg: C.blueBg, label: 'Pago' },
};

// ── Estilos ─────────────────────────────────────────────────
const styles = {
  page: { maxWidth: 1600, margin: '0 auto', padding: '0 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.5, lineHeight: 1.25 },
  subtitle: { fontSize: 14, color: C.text2, marginTop: 2, lineHeight: 1.5 },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab: (active) => ({
    padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
    color: active ? C.primary : C.text2,
    borderBottom: active ? `2px solid ${C.primary}` : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  }),
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 },
  card: {
    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)', overflow: 'hidden',
  },
  cardHeader: { padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 14, color: C.text, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 },
  badge: (color, bg) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    color, background: bg,
  }),
  btn: (variant = 'primary') => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
    transition: 'all 0.15s',
    ...(variant === 'primary' ? { background: C.primary, color: '#fff' } : {}),
    ...(variant === 'secondary' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : {}),
    ...(variant === 'danger' ? { background: C.red, color: '#fff' } : {}),
    ...(variant === 'ghost' ? { background: 'transparent', color: C.text2, padding: '6px 12px' } : {}),
    ...(variant === 'success' ? { background: C.green, color: '#fff' } : {}),
  }),
  btnSm: { padding: '4px 10px', fontSize: 12 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: {
    padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14,
    outline: 'none', width: '100%', transition: 'border 0.15s', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)',
  },
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
};

// ── Helpers ─────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '\u2014';
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '\u2014';

// ── Componentes auxiliares ──────────────────────────────────
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <Button variant="ghost" size="sm" style={{ fontSize: 18 }} onClick={onClose}>{'\u2715'}</Button>
        </div>
        <div style={styles.modalBody}>{children}</div>
        {footer && <div style={styles.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <input className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div style={styles.formGroup}>
      {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>}
      <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...props}>{children}</select>
    </div>
  );
}

function Badge({ status, map }) {
  const s = map[status] || { c: C.text3, bg: '#73737318', label: status };
  return <span style={styles.badge(s.c, s.bg)}>{s.label}</span>;
}

// ── TABS ────────────────────────────────────────────────────
const TABS = ['Dashboard', 'Contas', 'Transacoes', 'Contas a Pagar', 'Reembolsos'];

// ── KPI Cards (estilo unificado) ─────────────────────────────
const FIN_STAT_SVGS = [
  <svg key="f0" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="100" r="90" fill="#fff" fillOpacity="0.08" /><circle cx="260" cy="60" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="f1" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="140" r="100" fill="#fff" fillOpacity="0.07" /><circle cx="270" cy="40" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="f2" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="240" cy="80" r="80" fill="#fff" fillOpacity="0.08" /><circle cx="280" cy="150" r="55" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="f3" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="210" cy="120" r="95" fill="#fff" fillOpacity="0.07" /><circle cx="265" cy="50" r="45" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="f4" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="230" cy="90" r="85" fill="#fff" fillOpacity="0.08" /><circle cx="270" cy="160" r="50" fill="#fff" fillOpacity="0.09" /></svg>,
  <svg key="f5" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="200" cy="100" r="90" fill="#fff" fillOpacity="0.07" /><circle cx="260" cy="40" r="60" fill="#fff" fillOpacity="0.10" /></svg>,
  <svg key="f6" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '67%', pointerEvents: 'none', zIndex: 0 }} viewBox="0 0 300 200" fill="none"><circle cx="220" cy="110" r="88" fill="#fff" fillOpacity="0.08" /><circle cx="275" cy="55" r="52" fill="#fff" fillOpacity="0.09" /></svg>,
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

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Financeiro() {
  const { isDiretor } = useAuth();
  const [tab, setTab] = useState(0);
  const [dash, setDash] = useState(null);
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [transacoes, setTransacoes] = useState([]);
  const [contasPagar, setContasPagar] = useState([]);
  const [reembolsos, setReembolsos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filtros transacoes
  const [filtroContaId, setFiltroContaId] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroMes, setFiltroMes] = useState('');

  // Filtro contas a pagar
  const [filtroPagarStatus, setFiltroPagarStatus] = useState('');

  // Filtro reembolsos
  const [filtroReembolsoStatus, setFiltroReembolsoStatus] = useState('');

  // Modais
  const [modalConta, setModalConta] = useState(null);
  const [modalTransacao, setModalTransacao] = useState(null);
  const [modalPagar, setModalPagar] = useState(null);
  const [modalReembolso, setModalReembolso] = useState(null);

  // ── Loaders ──
  const loadDash = useCallback(async () => {
    try { setDash(await financeiro.dashboard()); } catch (e) { console.error(e); }
  }, []);

  const loadContas = useCallback(async () => {
    try { setContas(await financeiro.contas.list()); } catch (e) { console.error(e); }
  }, []);

  const loadCategorias = useCallback(async () => {
    try { setCategorias(await financeiro.categorias.list()); } catch (e) { console.error(e); }
  }, []);

  const loadTransacoes = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroContaId) params.conta_id = filtroContaId;
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroStatus) params.status = filtroStatus;
      if (filtroMes) params.mes = filtroMes;
      setTransacoes(await financeiro.transacoes.list(params));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroContaId, filtroTipo, filtroStatus, filtroMes]);

  const loadContasPagar = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroPagarStatus) params.status = filtroPagarStatus;
      setContasPagar(await financeiro.contasPagar.list(params));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroPagarStatus]);

  const loadReembolsos = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroReembolsoStatus) params.status = filtroReembolsoStatus;
      setReembolsos(await financeiro.reembolsos.list(params));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroReembolsoStatus]);

  useEffect(() => { loadDash(); loadContas(); loadCategorias(); }, [loadDash, loadContas, loadCategorias]);
  useEffect(() => { if (tab === 2) loadTransacoes(); }, [tab, loadTransacoes]);
  useEffect(() => { if (tab === 3) loadContasPagar(); }, [tab, loadContasPagar]);
  useEffect(() => { if (tab === 4) loadReembolsos(); }, [tab, loadReembolsos]);

  // ── Ações ──
  const handleError = (e) => { setError(e.message); setTimeout(() => setError(''), 4000); };

  const saveConta = async (form) => {
    try {
      if (form.id) await financeiro.contas.update(form.id, form);
      else await financeiro.contas.create(form);
      setModalConta(null);
      loadContas();
      loadDash();
    } catch (e) { handleError(e); }
  };

  const deleteConta = async (id) => {
    if (!window.confirm('Deseja excluir esta conta?')) return;
    try { await financeiro.contas.remove(id); loadContas(); loadDash(); } catch (e) { handleError(e); }
  };

  const saveTransacao = async (form) => {
    try {
      if (form.id) await financeiro.transacoes.update(form.id, form);
      else await financeiro.transacoes.create(form);
      setModalTransacao(null);
      loadTransacoes();
      loadDash();
      loadContas();
    } catch (e) { handleError(e); }
  };

  const deleteTransacao = async (id) => {
    if (!window.confirm('Deseja excluir esta transacao?')) return;
    try { await financeiro.transacoes.remove(id); loadTransacoes(); loadDash(); } catch (e) { handleError(e); }
  };

  const savePagar = async (form) => {
    try {
      if (form.id) await financeiro.contasPagar.update(form.id, form);
      else await financeiro.contasPagar.create(form);
      setModalPagar(null);
      loadContasPagar();
      loadDash();
    } catch (e) { handleError(e); }
  };

  const deletePagar = async (id) => {
    if (!window.confirm('Deseja excluir esta conta a pagar?')) return;
    try { await financeiro.contasPagar.remove(id); loadContasPagar(); loadDash(); } catch (e) { handleError(e); }
  };

  const pagarConta = async (item) => {
    try {
      await financeiro.contasPagar.update(item.id, { ...item, status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) });
      loadContasPagar();
      loadDash();
    } catch (e) { handleError(e); }
  };

  const saveReembolso = async (form) => {
    try {
      await financeiro.reembolsos.create(form);
      setModalReembolso(null);
      loadReembolsos();
      loadDash();
    } catch (e) { handleError(e); }
  };

  const aprovarReembolso = async (id, status) => {
    try { await financeiro.reembolsos.aprovar(id, status); loadReembolsos(); loadDash(); } catch (e) { handleError(e); }
  };

  // ═══════════════════════════════════════════════════════════
  // TAB: DASHBOARD
  // ═══════════════════════════════════════════════════════════
  const renderDashboard = () => {
    if (!dash) return <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>;
    const kpis = [
      { label: 'Saldo Total', value: fmtMoney(dash.saldoTotal), bg: '#00B39D' },
      { label: 'Contas Ativas', value: dash.contasAtivas ?? 0, bg: '#3b82f6' },
      { label: 'Receitas do Mês', value: fmtMoney(dash.receitasMes), bg: '#10b981' },
      { label: 'Despesas do Mês', value: fmtMoney(dash.despesasMes), bg: '#ef4444' },
      { label: 'A Pagar Pendentes', value: dash.contasPagarPendentes ?? 0, bg: '#f59e0b' },
      { label: 'A Pagar Vencidas', value: dash.contasPagarVencidas ?? 0, bg: '#dc2626' },
      { label: 'Valor a Pagar', value: fmtMoney(dash.valorPagarPendente), bg: '#f59e0b' },
      { label: 'Reembolsos Pend.', value: dash.reembolsosPendentes ?? 0, bg: '#3b82f6' },
      { label: 'Valor Reembolsos', value: fmtMoney(dash.valorReembolsosPendentes), bg: 'var(--cbrio-card)' },
    ];
    return (
      <div className="cbrio-stagger" style={styles.kpiGrid}>
        {kpis.map((k, i) => <StatCard key={k.label} label={k.label} value={k.value} bg={k.bg} svg={FIN_STAT_SVGS[i % FIN_STAT_SVGS.length]} />)}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // TAB: CONTAS
  // ═══════════════════════════════════════════════════════════
  const renderContas = () => (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>Contas Bancarias</div>
        {isDiretor && (
          <Button onClick={() => setModalConta({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo: 0, ativa: true })}>
            + Nova Conta
          </Button>
        )}
      </div>
      {contas.length === 0 ? (
        <div style={styles.empty}>Nenhuma conta cadastrada.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nome</th>
              <th style={styles.th}>Banco</th>
              <th style={styles.th}>Agencia</th>
              <th style={styles.th}>Conta</th>
              <th style={styles.th}>Tipo</th>
              <th style={styles.th}>Saldo</th>
              <th style={styles.th}>Status</th>
              {isDiretor && <th style={styles.th}>Acoes</th>}
            </tr>
          </thead>
          <tbody>
            {contas.map(c => (
              <tr key={c.id}>
                <td style={{ ...styles.td, fontWeight: 600 }}>{c.nome}</td>
                <td style={styles.td}>{c.banco || '\u2014'}</td>
                <td style={styles.td}>{c.agencia || '\u2014'}</td>
                <td style={styles.td}>{c.conta || '\u2014'}</td>
                <td style={styles.td}>{TIPO_CONTA[c.tipo] || c.tipo}</td>
                <td style={{ ...styles.td, fontWeight: 700, color: Number(c.saldo) >= 0 ? C.green : C.red }}>{fmtMoney(c.saldo)}</td>
                <td style={styles.td}>
                  <span style={styles.badge(c.ativa ? C.green : C.text3, c.ativa ? C.greenBg : '#73737318')}>
                    {c.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                {isDiretor && (
                  <td style={styles.td}>
                    <Button variant="ghost" size="sm" onClick={() => setModalConta(c)}>Editar</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteConta(c.id)}>Excluir</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB: TRANSACOES
  // ═══════════════════════════════════════════════════════════
  const renderTransacoes = () => (
    <>
      <div style={styles.filterRow}>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroContaId} onChange={e => setFiltroContaId(e.target.value)}>
          <option value="">Todas as contas</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="receita">Receita</option>
          <option value="despesa">Despesa</option>
          <option value="transferencia">Transferencia</option>
        </select>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="conciliado">Conciliado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <input className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ width: 160 }} type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} />
        {isDiretor && (
          <Button onClick={() => setModalTransacao({
            conta_id: '', categoria_id: '', tipo: 'despesa', descricao: '', valor: '', data_competencia: '', data_pagamento: '', status: 'pendente', referencia: '', observacoes: '',
          })}>
            + Nova Transacao
          </Button>
        )}
      </div>
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>
        ) : transacoes.length === 0 ? (
          <div style={styles.empty}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma transacao encontrada.</span></div></div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Data</th>
                <th style={styles.th}>Descricao</th>
                <th style={styles.th}>Conta</th>
                <th style={styles.th}>Categoria</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Status</th>
                {isDiretor && <th style={styles.th}>Acoes</th>}
              </tr>
            </thead>
            <tbody>
              {transacoes.map(t => {
                const isReceita = t.tipo === 'receita';
                const isDespesa = t.tipo === 'despesa';
                return (
                  <tr key={t.id}>
                    <td style={styles.td}>{fmtDate(t.data_competencia)}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{t.descricao}</td>
                    <td style={styles.td}>{t.fin_contas?.nome || '\u2014'}</td>
                    <td style={styles.td}>{t.fin_categorias?.nome || '\u2014'}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(
                        isReceita ? C.green : isDespesa ? C.red : C.blue,
                        isReceita ? C.greenBg : isDespesa ? C.redBg : C.blueBg,
                      )}>
                        {TIPO_TRANSACAO[t.tipo] || t.tipo}
                      </span>
                    </td>
                    <td style={{ ...styles.td, fontWeight: 700, color: isReceita ? C.green : isDespesa ? C.red : C.text }}>
                      {isReceita ? '+ ' : isDespesa ? '- ' : ''}{fmtMoney(t.valor)}
                    </td>
                    <td style={styles.td}><Badge status={t.status} map={STATUS_TRANSACAO} /></td>
                    {isDiretor && (
                      <td style={styles.td}>
                        <Button variant="ghost" size="sm" onClick={() => setModalTransacao(t)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTransacao(t.id)}>Excluir</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB: CONTAS A PAGAR
  // ═══════════════════════════════════════════════════════════
  const renderContasPagar = () => (
    <>
      <div style={styles.filterRow}>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroPagarStatus} onChange={e => setFiltroPagarStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
          <option value="vencido">Vencido</option>
        </select>
        {isDiretor && (
          <Button onClick={() => setModalPagar({
            descricao: '', fornecedor: '', categoria_id: '', valor: '', data_vencimento: '', data_pagamento: '', conta_id: '', status: 'pendente',
          })}>
            + Nova Conta a Pagar
          </Button>
        )}
      </div>
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>
        ) : contasPagar.length === 0 ? (
          <div style={styles.empty}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma conta a pagar encontrada.</span></div></div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Descricao</th>
                <th style={styles.th}>Fornecedor</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Vencimento</th>
                <th style={styles.th}>Pagamento</th>
                <th style={styles.th}>Status</th>
                {isDiretor && <th style={styles.th}>Acoes</th>}
              </tr>
            </thead>
            <tbody>
              {contasPagar.map(cp => (
                <tr key={cp.id} style={cp.status === 'vencido' ? { background: C.redBg } : {}}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{cp.descricao}</td>
                  <td style={styles.td}>{cp.fornecedor || '\u2014'}</td>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{fmtMoney(cp.valor)}</td>
                  <td style={styles.td}>{fmtDate(cp.data_vencimento)}</td>
                  <td style={styles.td}>{fmtDate(cp.data_pagamento)}</td>
                  <td style={styles.td}><Badge status={cp.status} map={STATUS_PAGAR} /></td>
                  {isDiretor && (
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      {(cp.status === 'pendente' || cp.status === 'vencido') && (
                        <Button variant="success" size="sm" className="mr-1" onClick={() => pagarConta(cp)}>Pagar</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setModalPagar(cp)}>Editar</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deletePagar(cp.id)}>Excluir</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB: REEMBOLSOS
  // ═══════════════════════════════════════════════════════════
  const renderReembolsos = () => (
    <>
      <div style={styles.filterRow}>
        <select className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroReembolsoStatus} onChange={e => setFiltroReembolsoStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="aprovado">Aprovado</option>
          <option value="rejeitado">Rejeitado</option>
          <option value="pago">Pago</option>
        </select>
        <Button onClick={() => setModalReembolso({
          descricao: '', valor: '', data_despesa: '', categoria_id: '', observacoes: '',
        })}>
          + Novo Reembolso
        </Button>
      </div>
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>
        ) : reembolsos.length === 0 ? (
          <div style={styles.empty}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhum reembolso encontrado</span></div></div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Descricao</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Data Despesa</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Observacoes</th>
                {isDiretor && <th style={styles.th}>Acoes</th>}
              </tr>
            </thead>
            <tbody>
              {reembolsos.map(r => (
                <tr key={r.id}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{r.descricao}</td>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{fmtMoney(r.valor)}</td>
                  <td style={styles.td}>{fmtDate(r.data_despesa)}</td>
                  <td style={styles.td}><Badge status={r.status} map={STATUS_REEMBOLSO} /></td>
                  <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.observacoes || '\u2014'}</td>
                  {isDiretor && (
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      {r.status === 'pendente' && (
                        <>
                          <Button variant="success" size="sm" className="mr-1" onClick={() => aprovarReembolso(r.id, 'aprovado')}>Aprovar</Button>
                          <Button variant="destructive" size="sm" onClick={() => aprovarReembolso(r.id, 'rejeitado')}>Rejeitar</Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // MODAIS
  // ═══════════════════════════════════════════════════════════
  const renderModalConta = () => {
    const [form, setForm] = useState(modalConta || {});
    const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
    return (
      <Modal
        open={!!modalConta}
        onClose={() => setModalConta(null)}
        title={form.id ? 'Editar Conta' : 'Nova Conta'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalConta(null)}>Cancelar</Button>
            <Button onClick={() => saveConta(form)}>Salvar</Button>
          </>
        }
      >
        <Input label="Nome" value={form.nome || ''} onChange={e => upd('nome', e.target.value)} />
        <div style={styles.formRow}>
          <Input label="Banco" value={form.banco || ''} onChange={e => upd('banco', e.target.value)} />
          <Input label="Agencia" value={form.agencia || ''} onChange={e => upd('agencia', e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <Input label="Conta" value={form.conta || ''} onChange={e => upd('conta', e.target.value)} />
          <Select label="Tipo" value={form.tipo || 'corrente'} onChange={e => upd('tipo', e.target.value)}>
            {Object.entries(TIPO_CONTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <Input label="Saldo Inicial" type="number" step="0.01" value={form.saldo ?? ''} onChange={e => upd('saldo', e.target.value)} />
        <Select label="Status" value={form.ativa === false ? 'false' : 'true'} onChange={e => upd('ativa', e.target.value === 'true')}>
          <option value="true">Ativa</option>
          <option value="false">Inativa</option>
        </Select>
      </Modal>
    );
  };

  const renderModalTransacao = () => {
    const [form, setForm] = useState(modalTransacao || {});
    const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const catsFiltradas = categorias.filter(c => !form.tipo || form.tipo === 'transferencia' || c.tipo === form.tipo);
    return (
      <Modal
        open={!!modalTransacao}
        onClose={() => setModalTransacao(null)}
        title={form.id ? 'Editar Transacao' : 'Nova Transacao'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalTransacao(null)}>Cancelar</Button>
            <Button onClick={() => saveTransacao(form)}>Salvar</Button>
          </>
        }
      >
        <Input label="Descricao" value={form.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
        <div style={styles.formRow}>
          <Select label="Conta" value={form.conta_id || ''} onChange={e => upd('conta_id', e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Select label="Tipo" value={form.tipo || 'despesa'} onChange={e => upd('tipo', e.target.value)}>
            {Object.entries(TIPO_TRANSACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div style={styles.formRow}>
          <Select label="Categoria" value={form.categoria_id || ''} onChange={e => upd('categoria_id', e.target.value)}>
            <option value="">Selecione...</option>
            {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Input label="Valor (R$)" type="number" step="0.01" value={form.valor ?? ''} onChange={e => upd('valor', e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <Input label="Data Competencia" type="date" value={form.data_competencia || ''} onChange={e => upd('data_competencia', e.target.value)} />
          <Input label="Data Pagamento" type="date" value={form.data_pagamento || ''} onChange={e => upd('data_pagamento', e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <Select label="Status" value={form.status || 'pendente'} onChange={e => upd('status', e.target.value)}>
            <option value="pendente">Pendente</option>
            <option value="conciliado">Conciliado</option>
            <option value="cancelado">Cancelado</option>
          </Select>
          <Input label="Referencia" value={form.referencia || ''} onChange={e => upd('referencia', e.target.value)} />
        </div>
        <Input label="Observacoes" value={form.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </Modal>
    );
  };

  const renderModalPagar = () => {
    const [form, setForm] = useState(modalPagar || {});
    const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
    return (
      <Modal
        open={!!modalPagar}
        onClose={() => setModalPagar(null)}
        title={form.id ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalPagar(null)}>Cancelar</Button>
            <Button onClick={() => savePagar(form)}>Salvar</Button>
          </>
        }
      >
        <Input label="Descricao" value={form.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
        <div style={styles.formRow}>
          <Input label="Fornecedor" value={form.fornecedor || ''} onChange={e => upd('fornecedor', e.target.value)} />
          <Input label="Valor (R$)" type="number" step="0.01" value={form.valor ?? ''} onChange={e => upd('valor', e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <Select label="Categoria" value={form.categoria_id || ''} onChange={e => upd('categoria_id', e.target.value)}>
            <option value="">Selecione...</option>
            {categorias.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Select label="Conta Pagamento" value={form.conta_id || ''} onChange={e => upd('conta_id', e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </div>
        <div style={styles.formRow}>
          <Input label="Data Vencimento" type="date" value={form.data_vencimento || ''} onChange={e => upd('data_vencimento', e.target.value)} />
          <Input label="Data Pagamento" type="date" value={form.data_pagamento || ''} onChange={e => upd('data_pagamento', e.target.value)} />
        </div>
        <Select label="Status" value={form.status || 'pendente'} onChange={e => upd('status', e.target.value)}>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
          <option value="vencido">Vencido</option>
        </Select>
      </Modal>
    );
  };

  const renderModalReembolso = () => {
    const [form, setForm] = useState(modalReembolso || {});
    const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
    return (
      <Modal
        open={!!modalReembolso}
        onClose={() => setModalReembolso(null)}
        title="Novo Reembolso"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalReembolso(null)}>Cancelar</Button>
            <Button onClick={() => saveReembolso(form)}>Solicitar</Button>
          </>
        }
      >
        <Input label="Descricao" value={form.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
        <div style={styles.formRow}>
          <Input label="Valor (R$)" type="number" step="0.01" value={form.valor ?? ''} onChange={e => upd('valor', e.target.value)} />
          <Input label="Data da Despesa" type="date" value={form.data_despesa || ''} onChange={e => upd('data_despesa', e.target.value)} />
        </div>
        <Select label="Categoria" value={form.categoria_id || ''} onChange={e => upd('categoria_id', e.target.value)}>
          <option value="">Selecione...</option>
          {categorias.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Input label="Observacoes" value={form.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
      </Modal>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Financeiro</div>
          <div style={styles.subtitle}>Gestao financeira da igreja</div>
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={styles.tabs}>
        {TABS.map((t, i) => (
          <button key={t} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && renderDashboard()}
      {tab === 1 && renderContas()}
      {tab === 2 && renderTransacoes()}
      {tab === 3 && renderContasPagar()}
      {tab === 4 && renderReembolsos()}

      {modalConta && renderModalConta()}
      {modalTransacao && renderModalTransacao()}
      {modalPagar && renderModalPagar()}
      {modalReembolso && renderModalReembolso()}
    </div>
  );
}
