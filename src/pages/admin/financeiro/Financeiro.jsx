import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { financeiro, financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';
import { exportPDF } from '../../../lib/export';
import SantanderTab from './SantanderTab';
import EstruturaFiscal from './EstruturaFiscal';
import ImportarExtratos from './ImportarExtratos';
import FilaClassificacao from './FilaClassificacao';
import NotasCompras from './NotasCompras';
import DashboardOverview from './DashboardOverview';
import DreAuto from './DreAuto';
import Analises from './Analises';
import SolicitacoesFinanceiro from './SolicitacoesFinanceiro';
import Recorrentes from './Recorrentes';
import Generosidade from './Generosidade';
import Alertas from './Alertas';
import CalendarioFinanceiro from './CalendarioFinanceiro';
import DreCentroCusto from './DreCentroCusto';
import DreComparativo from './DreComparativo';
import ClosingMensal from './ClosingMensal';
import AuditLog from './AuditLog';
import Arrecadacoes from './Arrecadacoes';

// ── Tema ────────────────────────────────────────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const TIPO_CONTA = { corrente: 'Corrente', poupanca: 'Poupança', caixa: 'Caixa', investimento: 'Investimento' };
const TIPO_TRANSACAO = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' };

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
    background: C.card, borderRadius: 16, border: '1px solid var(--hairline)',
    boxShadow: 'var(--shadow)', overflow: 'hidden',
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
  modal: { background: 'var(--panel)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)', border: '1px solid var(--hairline)', borderRadius: 16, width: '95%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-hover), var(--hi)' },
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

// ── Detalhe completo da transação (Fase 1) ──────────────────
// Abre ao clicar na linha da lista. Carrega financeiroV2.transacoes.detalhe(id)
// (transação + nomes de plano/centro/conta + NF + conta a pagar vinculadas) e
// gerencia os comprovantes (anexar/remover). Componente de verdade no topo do
// módulo → hooks sem risco de violação (diferente dos renderModal* antigos).
function DetalheTransacao({ id, onClose, onEditar, onChanged, podeEditar }) {
  const [det, setDet] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDet(null); setErro('');
    financeiroV2.transacoes.detalhe(id)
      .then(d => { if (vivo) setDet(d); })
      .catch(e => { if (vivo) setErro(e.message || 'Erro ao carregar o detalhe'); });
    return () => { vivo = false; };
  }, [id]);

  const anexar = async (file) => {
    if (!file) return;
    setEnviando(true); setErro('');
    try {
      const anexos = await financeiroV2.transacoes.anexar(id, file);
      setDet(d => (d ? { ...d, anexos_url: anexos } : d));
      onChanged?.();
    } catch (e) { setErro(e.message || 'Erro ao anexar'); }
    finally { setEnviando(false); }
  };

  const removerAnexo = async (url) => {
    if (!window.confirm('Remover este comprovante?')) return;
    setErro('');
    try {
      const anexos = await financeiroV2.transacoes.removerAnexo(id, url);
      setDet(d => (d ? { ...d, anexos_url: anexos } : d));
      onChanged?.();
    } catch (e) { setErro(e.message || 'Erro ao remover'); }
  };

  const Linha = ({ label, children }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
      <span style={{ color: C.text2, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: C.text, fontWeight: 600, textAlign: 'right' }}>{children ?? '—'}</span>
    </div>
  );

  const Bloco = ({ titulo, children }) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  );

  const isReceita = det?.tipo === 'receita';
  const anexos = Array.isArray(det?.anexos_url) ? det.anexos_url : [];
  const formaPgto = det?.forma_pagamento
    ? det.forma_pagamento + (det.parcelas_total
      ? ` · ${det.parcela_num ? `parcela ${det.parcela_num}/${det.parcelas_total}` : `${det.parcelas_total}x`}`
      : (det.forma_pagamento === 'Cartão de Crédito' ? ' · à vista' : ''))
    : null;
  const nf = det?.nota_fiscal;
  const cp = det?.conta_pagar;

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalhe da transação"
      footer={
        <>
          {podeEditar && det && <Button variant="outline" onClick={() => onEditar(det)}>Editar</Button>}
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      {erro && (
        <div style={{ background: C.redBg, color: C.red, padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{erro}</div>
      )}
      {!det && !erro && (
        <div style={styles.empty}>Carregando...</div>
      )}
      {det && (
        <>
          {/* Cabeçalho: valor + tipo + status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: isReceita ? C.green : C.red }}>
                {isReceita ? '+ ' : '- '}{fmtMoney(det.valor)}
              </div>
              <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>{det.descricao}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={styles.badge(isReceita ? C.green : C.red, isReceita ? C.greenBg : C.redBg)}>
                {isReceita ? 'Entrada' : 'Saída'}
              </span>
              <Badge status={det.status} map={STATUS_TRANSACAO} />
            </div>
          </div>

          <Linha label="Data de competência">{fmtDate(det.data_competencia)}</Linha>
          <Linha label="Data de pagamento">{fmtDate(det.data_pagamento)}</Linha>
          <Linha label="Conta">{det.conta?.nome || '—'}</Linha>
          <Linha label="Plano de contas">{det.plano ? `${det.plano.codigo} · ${det.plano.nome}` : '—'}</Linha>
          <Linha label="Centro de custo">{det.centro ? `${det.centro.codigo ? `${det.centro.codigo} · ` : ''}${det.centro.nome}` : '—'}</Linha>
          <Linha label="Forma de pagamento">{formaPgto || '—'}</Linha>
          {det.classe_movimento && det.classe_movimento !== 'ordinaria' && (
            <Linha label="Classe do movimento">{det.classe_movimento}</Linha>
          )}
          {det.referencia && <Linha label="Referência">{det.referencia}</Linha>}
          {det.classificacao_origem && <Linha label="Origem da classificação">{det.classificacao_origem}</Linha>}
          {det.observacoes && (
            <div style={{ padding: '8px 0', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.text2 }}>Observações: </span>{det.observacoes}
            </div>
          )}

          {/* Comprovantes */}
          <Bloco titulo="Comprovantes">
            {anexos.length === 0 && (
              <div style={{ fontSize: 13, color: C.text3, marginBottom: 6 }}>Nenhum comprovante anexado.</div>
            )}
            {anexos.map((a) => (
              <div key={a.url} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13 }}>
                <span>{'📎'}</span>
                <a href={a.url} target="_blank" rel="noreferrer" style={{ color: C.primary, fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {a.nome || 'comprovante'}
                </a>
                <span style={{ color: C.text3, fontSize: 12 }}>{a.em ? fmtDate(a.em.slice(0, 10)) : ''}</span>
                {podeEditar && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removerAnexo(a.url)}>{'✕'}</Button>
                )}
              </div>
            ))}
            {podeEditar && (
              <>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  id={`anexo-transacao-${id}`}
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; anexar(f); }}
                />
                <Button variant="outline" size="sm" disabled={enviando} onClick={() => document.getElementById(`anexo-transacao-${id}`)?.click()}>
                  {enviando ? 'Enviando...' : 'Anexar comprovante'}
                </Button>
              </>
            )}
          </Bloco>

          {/* Nota fiscal vinculada */}
          {nf && (
            <Bloco titulo="Nota fiscal">
              <div style={{ fontSize: 13, color: C.text }}>
                <div style={{ fontWeight: 600 }}>{nf.numero ? `NF ${nf.numero}` : 'Nota fiscal'}{nf.emitente_nome ? ` · ${nf.emitente_nome}` : ''}</div>
                <div style={{ color: C.text2, marginTop: 2 }}>{fmtMoney(nf.valor)}</div>
                {nf.storage_path && (
                  <a href={nf.storage_path} target="_blank" rel="noreferrer" style={{ color: C.primary, fontWeight: 600, textDecoration: 'none' }}>
                    Ver arquivo da nota
                  </a>
                )}
              </div>
            </Bloco>
          )}

          {/* Conta a pagar vinculada */}
          {cp && (
            <Bloco titulo="Conta a pagar vinculada">
              <div style={{ fontSize: 13, color: C.text, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{cp.descricao}</div>
                  <div style={{ color: C.text2, marginTop: 2 }}>Vencimento {fmtDate(cp.data_vencimento)}</div>
                </div>
                <Badge status={cp.status} map={STATUS_PAGAR} />
              </div>
            </Bloco>
          )}
        </>
      )}
    </Modal>
  );
}

// ── TABS ────────────────────────────────────────────────────
// 6 grupos top-level (em vez de 14 abas em sequencia)
// Cada grupo composto tem sub-abas dentro
// Reorganizacao 2026-05-22 · Marcos pediu clareza · destaque pras coisas
// que ele mais usa (Transacoes, Arrecadacoes, Contas a Pagar).
const TABS = [
  'Dashboard', 'Transações', 'Arrecadações', 'Contas a Pagar',
  'Análises', 'DRE', 'Generosidade', 'Banco',
  'Operacional', 'Gestão', 'Configuração',
];
const SUBS_OPERACIONAL = ['Contas', 'Recorrentes', 'Reembolsos', 'Importar extratos', 'Fila de classificação', 'Calendário', 'Notas de compras'];
const SUBS_GESTAO = ['Solicitações', 'Alertas', 'Fechamento', 'Auditoria'];
const SUBS_DRE = ['DRE Auto', 'Por Centro de Custo', 'Comparativo Temporal'];

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

// SubTabBar · usado dentro dos grupos Movimentação, DRE, Banco
function SubTabBar({ items, current, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
      {items.map((label, i) => {
        const active = i === current;
        return (
          <button
            key={label}
            onClick={() => onSelect(i)}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              cursor: 'pointer',
              border: `1px solid ${active ? '#00B39D' : 'var(--cbrio-border)'}`,
              background: active ? '#00B39D18' : 'transparent',
              color: active ? '#00B39D' : 'var(--cbrio-text2)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, bg, svg }) {
  return (
    <div
      className="cbrio-kpi"
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--panel)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)',
        borderRadius: 16, padding: '20px 24px', minHeight: 100,
      }}
    >
      {/* tint translúcido do acento + faixa no topo + ícone fantasma */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${bg}22, transparent 58%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: bg, opacity: 0.9 }} />
      <div style={{ position: 'absolute', right: -8, top: -4, opacity: 0.07 }}>{svg}</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text2, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, color: C.text }}>{value}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Financeiro() {
  const [searchParams] = useSearchParams();
  const { isDiretor, getAccessLevel } = useAuth();
  const nivelFin = getAccessLevel(['financeiro']);
  const podeEditarFin = isDiretor || nivelFin >= 3;   // editar/lançar conta a pagar (write)
  const podeImportarFin = isDiretor || nivelFin >= 4;  // importar planilha (mesmo nível do backend)
  const [tab, setTab] = useState(0);
  const [subOp, setSubOp] = useState(0);
  const [subGestao, setSubGestao] = useState(0);
  const [subDre, setSubDre] = useState(0);
  const abrirSolicitacoes = searchParams.get('aba') === 'solicitacoes';
  const solicitacaoId = searchParams.get('solicitacao') || null;

  useEffect(() => {
    if (abrirSolicitacoes) {
      setTab(9);
      setSubGestao(0);
    }
  }, [abrirSolicitacoes]);

  // Navegacao por string-id usada por DashboardOverview shortcuts
  const goTo = (id) => {
    switch (id) {
      // Nova estrutura · 11 abas topo
      case 'transacoes':       setTab(1); break;
      case 'arrecadacoes':     setTab(2); break;
      case 'contas_pagar':     setTab(3); break;
      case 'analises':         setTab(4); break;
      case 'dre_auto':         setTab(5); setSubDre(0); break;
      case 'dre_centro':       setTab(5); setSubDre(1); break;
      case 'dre_comparativo':  setTab(5); setSubDre(2); break;
      case 'generosidade':     setTab(6); break;
      case 'banco':            setTab(7); break;
      case 'contas':           setTab(8); setSubOp(0); break;
      case 'recorrentes':      setTab(8); setSubOp(1); break;
      case 'reembolsos':       setTab(8); setSubOp(2); break;
      case 'importar':         setTab(8); setSubOp(3); break;
      case 'fila':             setTab(8); setSubOp(4); break;
      case 'calendario':       setTab(8); setSubOp(5); break;
      case 'notas_compras':    setTab(8); setSubOp(6); break;
      case 'solicitacoes_fin': setTab(9); setSubGestao(0); break;
      case 'alertas':          setTab(9); setSubGestao(1); break;
      case 'closing':          setTab(9); setSubGestao(2); break;
      case 'audit':            setTab(9); setSubGestao(3); break;
      case 'config':           setTab(10); break;
      default:             setTab(0);
    }
  };
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
  // Período: 'mês' (mes/ano) · 'ano' (ano inteiro) · 'custom' (range com calendário)
  const [filtroPeriodoModo, setFiltroPeriodoModo] = useState('mes');
  const [filtroAno, setFiltroAno] = useState(new Date().getFullYear());
  const [filtroMesNum, setFiltroMesNum] = useState(new Date().getMonth());
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');

  // Filtro contas a pagar
  const [filtroPagarStatus, setFiltroPagarStatus] = useState('');
  const [filtroPagarAno, setFiltroPagarAno] = useState('');
  const [filtroPagarBusca, setFiltroPagarBusca] = useState('');
  const [cpResumo, setCpResumo] = useState(null);
  const [cpTotal, setCpTotal] = useState(0);
  const [cpPage, setCpPage] = useState(1);
  const [importingCp, setImportingCp] = useState(false);
  const [cpMsg, setCpMsg] = useState('');
  const CP_PAGE_SIZE = 100;

  // Filtro reembolsos
  const [filtroReembolsoStatus, setFiltroReembolsoStatus] = useState('');

  // Modais
  const [modalConta, setModalConta] = useState(null);
  const [modalTransacao, setModalTransacao] = useState(null);
  const [modalPagar, setModalPagar] = useState(null);
  // Form do modal de Conta a Pagar · estado NO TOPO (antes ficava num useState
  // dentro de renderModalPagar(), que é chamado condicionalmente → violava a
  // regra dos hooks e quebrava com "Rendered more hooks" (React #310) ao editar).
  const [formPagar, setFormPagar] = useState({});
  useEffect(() => { setFormPagar(modalPagar || {}); }, [modalPagar]);
  // Mesmo padrão pros modais de Transação e de Conta bancária (tinham a MESMA
  // violação de hooks: useState dentro do render condicional).
  const [formTransacao, setFormTransacao] = useState({});
  useEffect(() => { setFormTransacao(modalTransacao || {}); }, [modalTransacao]);
  const [formConta, setFormConta] = useState({});
  useEffect(() => { setFormConta(modalConta || {}); }, [modalConta]);
  // Detalhe completo da transação (Fase 1) · guarda o id da linha clicada
  const [detalheTransacaoId, setDetalheTransacaoId] = useState(null);
  // Plano de contas (folhas) e centros de custo pro modal novo (v2)
  const [planosContas, setPlanosContas] = useState([]);
  const [centrosCusto, setCentrosCusto] = useState([]);
  // F2 · colaboradores do RH pro toggle "É salário" do modal de Conta a Pagar.
  // null = ainda não tentou carregar · [] = carregou vazio ou sem permissão
  // (o aux exige nível 4 do financeiro — salário é dado sensível).
  const [funcionariosRh, setFuncionariosRh] = useState(null);

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
      const params = { limit: 2000 };
      if (filtroContaId) params.conta_id = filtroContaId;
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroStatus) params.status = filtroStatus;
      if (filtroBusca) params.busca = filtroBusca;

      // Período · monta inicio/fim conforme modo
      if (filtroPeriodoModo === 'mes') {
        const ini = new Date(filtroAno, filtroMesNum, 1).toISOString().slice(0, 10);
        const fim = new Date(filtroAno, filtroMesNum + 1, 0).toISOString().slice(0, 10);
        params.inicio = ini; params.fim = fim;
      } else if (filtroPeriodoModo === 'ano') {
        params.inicio = `${filtroAno}-01-01`;
        params.fim    = `${filtroAno}-12-31`;
      } else if (filtroPeriodoModo === 'custom') {
        if (filtroInicio) params.inicio = filtroInicio;
        if (filtroFim) params.fim = filtroFim;
      }

      setTransacoes(await financeiro.transacoes.list(params));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroContaId, filtroTipo, filtroStatus, filtroBusca, filtroPeriodoModo, filtroAno, filtroMesNum, filtroInicio, filtroFim]);

  const loadContasPagar = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: cpPage, pageSize: CP_PAGE_SIZE };
      if (filtroPagarStatus === 'vencido') params.vencido = 'true';
      else if (filtroPagarStatus) params.status = filtroPagarStatus;
      if (filtroPagarAno) params.ano = filtroPagarAno;
      if (filtroPagarBusca) params.q = filtroPagarBusca;
      // O resumo (KPIs) segue o recorte ano/busca, mas ignora o filtro de status
      // → os 4 cards sempre mostram total / baixado / aberto / vencido do escopo.
      const resumoParams = {};
      if (filtroPagarAno) resumoParams.ano = filtroPagarAno;
      if (filtroPagarBusca) resumoParams.q = filtroPagarBusca;
      const [lista, resumo] = await Promise.all([
        financeiroV2.contasPagar.list(params),
        financeiroV2.contasPagar.resumo(resumoParams),
      ]);
      setContasPagar(lista.items || []);
      setCpTotal(lista.total || 0);
      setCpResumo(resumo || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filtroPagarStatus, filtroPagarAno, filtroPagarBusca, cpPage]);

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
  // Nova estrutura · tab 1 = Transações, tab 3 = Contas a Pagar,
  // tab 8 + subOp 2 = Reembolsos, tab 8 + subOp 0 = Contas
  useEffect(() => { if (tab === 1) loadTransacoes(); }, [tab, loadTransacoes]);
  // Plano de contas (folhas que aceitam lançamento) + centros de custo pros
  // modais de transação (v2) e de conta a pagar (F2) · carrega uma vez ao
  // entrar na aba
  useEffect(() => {
    if ((tab !== 1 && tab !== 3) || planosContas.length) return;
    financeiroV2.planoContas.list({ aceita_lancamento: 'true', ativo: 'true' })
      .then(p => setPlanosContas(p || [])).catch(() => {});
    financeiroV2.centrosCusto.list({ aceita_lancamento: 'true', ativo: 'true' })
      .then(c => setCentrosCusto(c || [])).catch(() => {});
  }, [tab, planosContas.length]);
  useEffect(() => { if (tab === 3) loadContasPagar(); }, [tab, loadContasPagar]);
  // F2 · colaboradores do RH pro select de salário — tenta UMA vez, quando o
  // modal de conta a pagar abre (sem permissão → lista vazia, sem erro na tela)
  useEffect(() => {
    if (!modalPagar || funcionariosRh !== null) return;
    financeiroV2.auxFuncionarios()
      .then(f => setFuncionariosRh(f || []))
      .catch(() => setFuncionariosRh([]));
  }, [modalPagar, funcionariosRh]);
  useEffect(() => { if (tab === 8 && subOp === 2) loadReembolsos(); }, [tab, subOp, loadReembolsos]);

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

  // Fase 1 · criação/edição vai pra financeiro-v2 (conciliação com o extrato,
  // plano de contas, forma de pagamento, parcelas). A v1 segue existindo pra
  // outros consumidores — só o modal migrou.
  const saveTransacao = async (form) => {
    try {
      const cartao = form.forma_pagamento === 'Cartão de Crédito';
      const payload = {
        tipo: form.tipo,
        descricao: form.descricao,
        valor: form.valor,
        data_competencia: form.data_competencia,
        data_pagamento: form.data_pagamento || null,
        conta_id: form.conta_id,
        plano_contas_id: form.plano_contas_id || null,
        centro_custo_id: form.centro_custo_id || null,
        forma_pagamento: form.forma_pagamento || null,
        parcelas_total: cartao && form.parcelas_total ? Number(form.parcelas_total) : null,
        parcela_num: cartao && form.parcela_num ? Number(form.parcela_num) : null,
        observacoes: form.observacoes || null,
      };
      if (form.id) await financeiroV2.transacoes.atualizar(form.id, payload);
      else await financeiroV2.transacoes.criar({ ...payload, tentar_conciliar: form.tipo === 'despesa' && !!form.tentar_conciliar });
      setModalTransacao(null);
      loadTransacoes();
      loadDash();
      loadContas();
    } catch (e) { handleError(e); }
  };

  const deleteTransacao = async (id) => {
    if (!window.confirm('Deseja excluir esta transação?')) return;
    try { await financeiro.transacoes.remove(id); loadTransacoes(); loadDash(); } catch (e) { handleError(e); }
  };

  // F2 · salvar via financeiro-v2 (plano de contas, salário do RH, recorrência).
  // Quando é salário, o backend IGNORA o valor e puxa rh_funcionarios.salario.
  const savePagar = async (form) => {
    try {
      if (form.eh_salario && !form.funcionario_id) {
        handleError(new Error('Selecione o colaborador do salário'));
        return;
      }
      const payload = {
        descricao: form.descricao,
        fornecedor: form.fornecedor || null,
        valor: form.valor,
        data_vencimento: form.data_vencimento,
        data_pagamento: form.data_pagamento || null,
        status: form.status || 'pendente',
        conta_id: form.conta_id || null,
        plano_contas_id: form.plano_contas_id || null,
        centro_custo_id: form.centro_custo_id || null,
        forma_pagamento: form.forma_pagamento || null,
        eh_salario: !!form.eh_salario,
        funcionario_id: form.eh_salario ? form.funcionario_id : null,
        observacao: form.historico || null,
      };
      if (form.id) await financeiroV2.contasPagar.atualizar(form.id, payload);
      else await financeiroV2.contasPagar.criar(payload);
      setModalPagar(null);
      loadContasPagar();
      loadDash();
    } catch (e) { handleError(e); }
  };

  const deletePagar = async (id) => {
    if (!window.confirm('Deseja excluir esta conta a pagar?')) return;
    try { await financeiroV2.contasPagar.remover(id); loadContasPagar(); loadDash(); } catch (e) { handleError(e); }
  };

  const pagarConta = async (item) => {
    try {
      await financeiroV2.contasPagar.atualizar(item.id, { status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) });
      loadContasPagar();
      loadDash();
    } catch (e) { handleError(e); }
  };

  // F2 · recorrência a partir da conta (idempotente no backend)
  const tornarRecorrente = async () => {
    try {
      const r = await financeiroV2.contasPagar.tornarRecorrente(formPagar.id);
      setFormPagar(f => ({ ...f, recorrente_id: r?.recorrencia?.id || f.recorrente_id }));
      loadContasPagar();
    } catch (e) { handleError(e); }
  };

  const desfazerRecorrente = async () => {
    if (!window.confirm('Desfazer a recorrência desta conta? A recorrência será desativada.')) return;
    try {
      await financeiroV2.contasPagar.desfazerRecorrente(formPagar.id);
      setFormPagar(f => ({ ...f, recorrente_id: null }));
      loadContasPagar();
    } catch (e) { handleError(e); }
  };

  const importarPlanilhaPagar = async (file) => {
    if (!file) return;
    setImportingCp(true);
    setCpMsg('');
    try {
      const r = await financeiroV2.contasPagar.importar(file);
      setCpMsg(
        `Importado: ${r.gravadas} título(s) · ${r.baixadas} baixado(s), ${r.abertas} em aberto · total ${fmtMoney(r.valor_total)}`
        + ((r.sem_plano || r.sem_centro) ? ` · ${r.sem_plano} sem plano de contas / ${r.sem_centro} sem centro de custo` : '')
      );
      setFiltroPagarStatus(''); setFiltroPagarAno(''); setFiltroPagarBusca(''); setCpPage(1);
      loadContasPagar();
      loadDash();
    } catch (e) { handleError(e); }
    finally { setImportingCp(false); }
  };

  const aprovarReembolso = async (id, status) => {
    try { await financeiro.reembolsos.aprovar(id, status); loadReembolsos(); loadDash(); } catch (e) { handleError(e); }
  };

  // ═══════════════════════════════════════════════════════════
  // TAB: DASHBOARD
  // ═══════════════════════════════════════════════════════════
  const renderDashboard = () => <DashboardOverview onNavigate={setTab} />;

  // ═══════════════════════════════════════════════════════════
  // TAB: CONTAS
  // ═══════════════════════════════════════════════════════════
  const renderContas = () => (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>Contas Bancárias</div>
        {isDiretor && (
          <Button onClick={() => setModalConta({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo: 0, ativa: true })}>
            + Nova Conta
          </Button>
        )}
      </div>
      {contas.length === 0 ? (
        <div style={styles.empty}>Nenhuma conta cadastrada.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nome</th>
              <th style={styles.th}>Banco</th>
              <th style={styles.th}>Agência</th>
              <th style={styles.th}>Conta</th>
              <th style={styles.th}>Tipo</th>
              <th style={styles.th}>Saldo</th>
              <th style={styles.th}>Status</th>
              {isDiretor && <th style={styles.th}>Ações</th>}
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
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // TAB: TRANSACOES
  // ═══════════════════════════════════════════════════════════
  const renderTransacoes = () => {
    const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const anosDisponiveis = [];
    for (let y = new Date().getFullYear() + 1; y >= 2022; y--) anosDisponiveis.push(y);
    const periodoModos = [
      { v: 'mes', label: 'Mês' },
      { v: 'ano', label: 'Ano' },
      { v: 'custom', label: 'Personalizado' },
    ];
    const tituloPeriodo = filtroPeriodoModo === 'mes' ? `${MES_NOMES[filtroMesNum]} de ${filtroAno}`
      : filtroPeriodoModo === 'ano' ? `Ano ${filtroAno}`
      : (filtroInicio && filtroFim) ? `${filtroInicio.split('-').reverse().join('/')} a ${filtroFim.split('-').reverse().join('/')}`
      : 'Selecione período';
    const totalReceitas = transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor || 0), 0);
    const totalDespesas = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor || 0), 0);

    return (
    <>
      {/* Card de filtros · layout limpo */}
      <div style={{ ...styles.card, marginBottom: 16, padding: 16 }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Período</div>
            <div className="text-base font-semibold text-foreground">{tituloPeriodo}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{transacoes.length} lançamentos · Receitas R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · Despesas R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          {isDiretor && (
            <Button onClick={() => setModalTransacao({
              conta_id: '', tipo: 'despesa', descricao: '', valor: '', data_competencia: '', data_pagamento: '',
              plano_contas_id: '', centro_custo_id: '', forma_pagamento: '', parcelas_total: '', observacoes: '', tentar_conciliar: false,
            })}>
              + Nova transação
            </Button>
          )}
        </div>

        {/* Linha 1: período */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-16">Período</span>
          <div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5">
            {periodoModos.map(m => (
              <button key={m.v} onClick={() => setFiltroPeriodoModo(m.v)}
                className={`px-3 py-1.5 text-xs rounded transition ${
                  filtroPeriodoModo === m.v ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {m.label}
              </button>
            ))}
          </div>

          {filtroPeriodoModo === 'mes' && (
            <>
              <select value={filtroMesNum} onChange={e => setFiltroMesNum(Number(e.target.value))}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background min-w-[140px]">
                {MES_NOMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
              <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background min-w-[90px]">
                {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </>
          )}
          {filtroPeriodoModo === 'ano' && (
            <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))}
              className="h-9 px-3 text-sm rounded-md border border-input bg-background min-w-[100px]">
              {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {filtroPeriodoModo === 'custom' && (
            <>
              <input type="date" value={filtroInicio} onChange={e => setFiltroInicio(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background" />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" value={filtroFim} onChange={e => setFiltroFim(e.target.value)}
                className="h-9 px-3 text-sm rounded-md border border-input bg-background" />
            </>
          )}

          {/* Atalhos rápidos */}
          <div className="ml-auto flex gap-1">
            {[
              { label: '30d', dias: 30 },
              { label: '90d', dias: 90 },
              { label: '6m', dias: 180 },
              { label: '12m', dias: 365 },
            ].map(q => (
              <button key={q.label}
                onClick={() => {
                  setFiltroPeriodoModo('custom');
                  const f = new Date(); const i = new Date(); i.setDate(i.getDate() - q.dias);
                  setFiltroInicio(i.toISOString().slice(0, 10));
                  setFiltroFim(f.toISOString().slice(0, 10));
                }}
                className="h-9 px-2.5 text-[11px] rounded bg-muted/40 hover:bg-muted/60 text-muted-foreground">
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: filtros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Conta</label>
            <select value={filtroContaId} onChange={e => setFiltroContaId(e.target.value)}
              className="h-9 w-full px-3 text-sm rounded-md border border-input bg-background">
              <option value="">Todas as contas</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="h-9 w-full px-3 text-sm rounded-md border border-input bg-background">
              <option value="">Todos os tipos</option>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              className="h-9 w-full px-3 text-sm rounded-md border border-input bg-background">
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="conciliado">Conciliado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Buscar descrição</label>
            <input type="text" value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)}
              placeholder="Ex: dízimo, pix, fornecedor..."
              className="h-9 w-full px-3 text-sm rounded-md border border-input bg-background" />
          </div>
        </div>

        {/* Limpar */}
        {(filtroContaId || filtroTipo || filtroStatus || filtroBusca || filtroPeriodoModo !== 'mes' ||
          filtroAno !== new Date().getFullYear() || filtroMesNum !== new Date().getMonth()) && (
          <button onClick={() => {
            setFiltroContaId(''); setFiltroTipo(''); setFiltroStatus(''); setFiltroBusca('');
            setFiltroPeriodoModo('mes');
            setFiltroAno(new Date().getFullYear());
            setFiltroMesNum(new Date().getMonth());
            setFiltroInicio(''); setFiltroFim('');
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground underline">
            Limpar filtros
          </button>
        )}
      </div>
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>
        ) : transacoes.length === 0 ? (
          <div style={styles.empty}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhuma transacao encontrada.</span></div></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Data</th>
                <th style={styles.th}>Descrição</th>
                <th style={styles.th}>Conta</th>
                <th style={styles.th}>Categoria</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Status</th>
                {isDiretor && <th style={styles.th}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {transacoes.map(t => {
                const isReceita = t.tipo === 'receita';
                const isDespesa = t.tipo === 'despesa';
                const noCartao = t.forma_pagamento === 'Cartão de Crédito';
                return (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetalheTransacaoId(t.id)}>
                    <td style={styles.td}>{fmtDate(t.data_competencia)}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      {t.descricao}
                      {noCartao && (
                        <span style={{ ...styles.badge(C.blue, C.blueBg), marginLeft: 6, whiteSpace: 'nowrap' }}>
                          {'💳 Cartão · '}{t.parcelas_total ? `${t.parcelas_total}x` : 'à vista'}
                        </span>
                      )}
                      {(t.anexos_url?.length > 0) && (
                        <span style={{ marginLeft: 6 }} title={`${t.anexos_url.length} comprovante(s) anexado(s)`}>{'📎'}</span>
                      )}
                    </td>
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
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setModalTransacao(t)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTransacao(t.id)}>Excluir</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // TAB: CONTAS A PAGAR
  // ═══════════════════════════════════════════════════════════
  const hojeISO = new Date().toISOString().slice(0, 10);
  const cpTotalPaginas = Math.max(1, Math.ceil(cpTotal / CP_PAGE_SIZE));
  const renderContasPagar = () => {
    const cards = cpResumo ? [
      { label: 'Total de títulos', valor: fmtMoney(cpResumo.total_valor), sub: `${cpResumo.total_n || 0} título(s)`, cor: C.text },
      { label: 'Baixado (pago)', valor: fmtMoney(cpResumo.baixadas_valor), sub: `${cpResumo.baixadas_n || 0} título(s)`, cor: C.green },
      { label: 'Em aberto', valor: fmtMoney(cpResumo.abertas_valor), sub: `${cpResumo.abertas_n || 0} título(s)`, cor: C.amber },
      { label: 'Vencido (em aberto)', valor: fmtMoney(cpResumo.vencidas_valor), sub: `${cpResumo.vencidas_n || 0} título(s)`, cor: C.red },
    ] : [];
    return (
    <>
      {cards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
          {cards.map((c) => (
            <div key={c.label} style={{ ...styles.card, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c.cor, marginTop: 4 }}>{c.valor}</div>
              <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...styles.filterRow, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroPagarStatus} onChange={e => { setFiltroPagarStatus(e.target.value); setCpPage(1); }}>
          <option value="">Todos os status</option>
          <option value="pendente">Em aberto</option>
          <option value="pago">Baixado (pago)</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={filtroPagarAno} onChange={e => { setFiltroPagarAno(e.target.value); setCpPage(1); }}>
          <option value="">Todos os anos</option>
          {(cpResumo?.anos || []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ minWidth: 220 }}
          placeholder="Buscar fornecedor / histórico..."
          value={filtroPagarBusca}
          onChange={e => { setFiltroPagarBusca(e.target.value); setCpPage(1); }}
        />
        <div style={{ flex: 1 }} />
        {podeImportarFin && (
          <>
            <input type="file" accept=".xlsx,.xls" id="cp-import-file" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; importarPlanilhaPagar(f); }} />
            <Button variant="outline" disabled={importingCp} onClick={() => document.getElementById('cp-import-file')?.click()}>
              {importingCp ? 'Importando...' : 'Importar planilha'}
            </Button>
          </>
        )}
        {podeEditarFin && (
          <Button onClick={() => setModalPagar({
            descricao: '', fornecedor: '', valor: '', data_vencimento: '', data_pagamento: '', conta_id: '',
            plano_contas_id: '', centro_custo_id: '', forma_pagamento: '', status: 'pendente',
            eh_salario: false, funcionario_id: '', historico: '',
          })}>
            + Nova Conta a Pagar
          </Button>
        )}
      </div>
      {cpMsg && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: C.greenBg, color: C.green, fontSize: 13, fontWeight: 600 }}>{cpMsg}</div>
      )}

      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>
        ) : contasPagar.length === 0 ? (
          <div style={styles.empty}><div className="flex flex-col items-center py-10 gap-2"><span className="text-sm font-medium text-foreground">Nenhuma conta a pagar encontrada. Use "Importar planilha" pra trazer do sistema externo.</span></div></div>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Descrição</th>
                <th style={styles.th}>Fornecedor</th>
                <th style={styles.th}>Plano de Contas</th>
                <th style={styles.th}>Centro de Custo</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Vencimento</th>
                <th style={styles.th}>Baixa</th>
                <th style={styles.th}>Status</th>
                {podeEditarFin && <th style={styles.th}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {contasPagar.map(cp => {
                const vencido = cp.status !== 'pago' && cp.status !== 'cancelado' && cp.data_vencimento && cp.data_vencimento < hojeISO;
                const stExib = vencido ? 'vencido' : cp.status;
                return (
                <tr key={cp.id} style={vencido ? { background: C.redBg } : {}}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>
                    {cp.descricao}
                    {(cp.recorrente_id || cp.eh_salario) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        {cp.recorrente_id && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.blue, background: C.blueBg, borderRadius: 6, padding: '1px 6px' }}>
                            🔁 Recorrente
                          </span>
                        )}
                        {cp.eh_salario && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: C.primaryBg, borderRadius: 6, padding: '1px 6px' }}>
                            💼 Salário{cp.funcionario_nome ? ` · ${cp.funcionario_nome}` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>{cp.fornecedor || '—'}</td>
                  <td style={styles.td}>{cp.plano?.nome || cp.plano_contas_nome || '—'}</td>
                  <td style={styles.td}>{cp.centro?.nome || cp.centro_custo_nome || '—'}</td>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{fmtMoney(cp.valor)}</td>
                  <td style={styles.td}>{fmtDate(cp.data_vencimento)}</td>
                  <td style={styles.td}>{fmtDate(cp.data_pagamento)}</td>
                  <td style={styles.td}><Badge status={stExib} map={STATUS_PAGAR} /></td>
                  {podeEditarFin && (
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      {cp.status !== 'pago' && cp.status !== 'cancelado' && (
                        <Button variant="success" size="sm" className="mr-1" onClick={() => pagarConta(cp)}>Pagar</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setModalPagar(cp)}>Editar</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deletePagar(cp.id)}>Excluir</Button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', fontSize: 13, color: C.text2 }}>
            <span>{cpTotal} título(s) · página {cpPage} de {cpTotalPaginas}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" size="sm" disabled={cpPage <= 1} onClick={() => setCpPage(p => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={cpPage >= cpTotalPaginas} onClick={() => setCpPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
          </>
        )}
      </div>
    </>
    );
  };

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
        <span className="text-sm text-muted-foreground self-center">
          Novos reembolsos entram pelo módulo Solicitações (categoria Reembolso).
        </span>
      </div>
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}><div className="flex items-center justify-center py-6 gap-2"><div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" /><span className="text-xs text-muted-foreground">Carregando...</span></div></div>
        ) : reembolsos.length === 0 ? (
          <div style={styles.empty}><div className="flex flex-col items-center py-10 gap-2"><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1"><svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg></div><span className="text-sm font-medium text-foreground">Nenhum reembolso encontrado</span></div></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Descrição</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Data Despesa</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Observações</th>
                {isDiretor && <th style={styles.th}>Ações</th>}
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
          </div>
        )}
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // MODAIS
  // ═══════════════════════════════════════════════════════════
  // Estado do form no TOPO do componente (formConta) — o useState que ficava
  // aqui dentro era chamado condicionalmente → mesma violação da regra dos
  // hooks (React #310) já corrigida no renderModalPagar.
  const renderModalConta = () => {
    const form = formConta;
    const upd = (k, v) => setFormConta(f => ({ ...f, [k]: v }));
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
          <Input label="Agência" value={form.agencia || ''} onChange={e => upd('agencia', e.target.value)} />
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

  // Modal Nova/Editar transação (Fase 1) · estado no TOPO (formTransacao) —
  // o useState que ficava aqui dentro violava a regra dos hooks (React #310).
  // Salva via financeiro-v2 (plano de contas, forma de pagamento, parcelas,
  // conciliação opcional com o extrato).
  const renderModalTransacao = () => {
    const form = formTransacao;
    const upd = (k, v) => setFormTransacao(f => ({ ...f, [k]: v }));
    const tipo = form.tipo === 'receita' ? 'receita' : 'despesa';
    const planosFiltrados = planosContas.filter(p => p.tipo === tipo);
    const noCartao = form.forma_pagamento === 'Cartão de Crédito';
    return (
      <Modal
        open={!!modalTransacao}
        onClose={() => setModalTransacao(null)}
        title={form.id ? 'Editar transação' : 'Nova transação'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalTransacao(null)}>Cancelar</Button>
            <Button onClick={() => saveTransacao({ ...form, tipo })}>Salvar</Button>
          </>
        }
      >
        <div style={styles.formRow}>
          <Select label="Tipo" value={tipo} onChange={e => upd('tipo', e.target.value)}>
            <option value="receita">Entrada</option>
            <option value="despesa">Saída</option>
          </Select>
          <Input label="Valor (R$) *" type="number" step="0.01" min="0" value={form.valor ?? ''} onChange={e => upd('valor', e.target.value)} />
        </div>
        <Input label="Descrição *" value={form.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
        <div style={styles.formRow}>
          <Input label="Data competência *" type="date" value={form.data_competencia || ''} onChange={e => upd('data_competencia', e.target.value)} />
          <Input label="Data pagamento" type="date" value={form.data_pagamento || ''} onChange={e => upd('data_pagamento', e.target.value)} />
        </div>
        <Select label="Conta *" value={form.conta_id || ''} onChange={e => upd('conta_id', e.target.value)}>
          <option value="">Selecione...</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <div style={styles.formRow}>
          <Select label="Plano de contas" value={form.plano_contas_id || ''} onChange={e => upd('plano_contas_id', e.target.value)}>
            <option value="">Selecione...</option>
            {planosFiltrados.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
          </Select>
          <Select label="Centro de custo" value={form.centro_custo_id || ''} onChange={e => upd('centro_custo_id', e.target.value)}>
            <option value="">Selecione...</option>
            {centrosCusto.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.nome}</option>)}
          </Select>
        </div>
        <div style={styles.formRow}>
          <Select label="Forma de pagamento" value={form.forma_pagamento || ''} onChange={e => upd('forma_pagamento', e.target.value)}>
            <option value="">Selecione...</option>
            {['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Boleto', 'Outro'].map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </Select>
          {noCartao && (
            <Select label="Parcelas" value={form.parcelas_total || ''} onChange={e => upd('parcelas_total', e.target.value)}>
              <option value="">À vista</option>
              {Array.from({ length: 11 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}x</option>)}
            </Select>
          )}
        </div>
        <Input label="Observações" value={form.observacoes || ''} onChange={e => upd('observacoes', e.target.value)} />
        {tipo === 'despesa' && !form.id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text2, cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={!!form.tentar_conciliar} onChange={e => upd('tentar_conciliar', e.target.checked)} />
            Tentar conciliar com o extrato (débito de mesmo valor em até 15 dias)
          </label>
        )}
      </Modal>
    );
  };

  // F2 · modal moderno: plano de contas (folhas despesa) + centro de custo +
  // forma de pagamento no lugar da categoria legada; toggle "É salário" trava
  // o valor no salário do RH; recorrência liga/desliga direto daqui.
  const renderModalPagar = () => {
    const form = formPagar;
    const upd = (k, v) => setFormPagar(f => ({ ...f, [k]: v }));
    const planosDespesa = planosContas.filter(p => p.tipo === 'despesa');
    const funcs = funcionariosRh || [];
    const setFuncionario = (id) => {
      const f = funcs.find(x => x.id === id);
      setFormPagar(prev => ({ ...prev, funcionario_id: id, valor: f?.salario ?? prev.valor }));
    };
    const toggleSalario = (on) => {
      setFormPagar(prev => {
        const f = on ? funcs.find(x => x.id === prev.funcionario_id) : null;
        return { ...prev, eh_salario: on, valor: on && f?.salario != null ? f.salario : prev.valor };
      });
    };
    return (
      <Modal
        open={!!modalPagar}
        onClose={() => setModalPagar(null)}
        title={form.id ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
        footer={
          <>
            {form.id && (form.recorrente_id ? (
              <Button variant="outline" onClick={desfazerRecorrente}>Recorrente ✓ · desfazer</Button>
            ) : (
              <Button variant="outline" onClick={tornarRecorrente}>🔁 Tornar recorrente</Button>
            ))}
            <Button variant="outline" onClick={() => setModalPagar(null)}>Cancelar</Button>
            <Button onClick={() => savePagar(form)}>Salvar</Button>
          </>
        }
      >
        <Input label="Descrição" value={form.descricao || ''} onChange={e => upd('descricao', e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text2, cursor: 'pointer', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={!!form.eh_salario} onChange={e => toggleSalario(e.target.checked)} />
          💼 É salário (valor puxado do RH)
        </label>
        {form.eh_salario && (
          funcs.length ? (
            <Select label="Colaborador" value={form.funcionario_id || ''} onChange={e => setFuncionario(e.target.value)}>
              <option value="">Selecione...</option>
              {funcs.map(f => (
                <option key={f.id} value={f.id}>{f.nome}{f.cargo ? ` · ${f.cargo}` : ''}</option>
              ))}
            </Select>
          ) : (
            <div style={{ fontSize: 12, color: C.amber, marginBottom: 8 }}>
              {funcionariosRh === null
                ? 'Carregando colaboradores do RH...'
                : 'Sem acesso à lista de colaboradores do RH (exige nível 4 do financeiro).'}
            </div>
          )
        )}
        <div style={styles.formRow}>
          <Input label="Fornecedor" value={form.fornecedor || ''} onChange={e => upd('fornecedor', e.target.value)} />
          <div>
            <Input label="Valor (R$)" type="number" step="0.01" value={form.valor ?? ''} readOnly={!!form.eh_salario} onChange={e => upd('valor', e.target.value)} />
            {form.eh_salario && (
              <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>Puxado do RH (salário do colaborador)</div>
            )}
          </div>
        </div>
        <div style={styles.formRow}>
          <Select label="Plano de contas" value={form.plano_contas_id || ''} onChange={e => upd('plano_contas_id', e.target.value)}>
            <option value="">Selecione...</option>
            {planosDespesa.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
          </Select>
          <Select label="Centro de custo" value={form.centro_custo_id || ''} onChange={e => upd('centro_custo_id', e.target.value)}>
            <option value="">Selecione...</option>
            {centrosCusto.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.nome}</option>)}
          </Select>
        </div>
        <div style={styles.formRow}>
          <Select label="Forma de pagamento" value={form.forma_pagamento || ''} onChange={e => upd('forma_pagamento', e.target.value)}>
            <option value="">Selecione...</option>
            {['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Boleto', 'Outro'].map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
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
        <Input label="Observações" value={form.historico || ''} onChange={e => upd('historico', e.target.value)} />
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
          <div style={styles.subtitle}>Gestão financeira da igreja</div>
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

      {/* 0 · Dashboard */}
      {tab === 0 && <DashboardOverview onNavigate={goTo} />}

      {/* 1 · Transações · todas as transacoes classificadas */}
      {tab === 1 && renderTransacoes()}

      {/* 2 · Arrecadações · apenas contribuições (3.01.*) */}
      {tab === 2 && <Arrecadacoes />}

      {/* 3 · Contas a Pagar */}
      {tab === 3 && renderContasPagar()}

      {/* 4 · Análises */}
      {tab === 4 && <Analises />}

      {/* 5 · DRE · sub-abas */}
      {tab === 5 && (
        <div>
          <SubTabBar items={SUBS_DRE} current={subDre} onSelect={setSubDre} />
          {subDre === 0 && <DreAuto />}
          {subDre === 1 && <DreCentroCusto />}
          {subDre === 2 && <DreComparativo />}
        </div>
      )}

      {/* 6 · Generosidade */}
      {tab === 6 && <Generosidade />}

      {/* 7 · Banco · só a visão do Santander (Culto ao Vivo, PIX Cobrança,
          Pagamentos e Boletos removidos a pedido do Matheus · 2026-07-23) */}
      {tab === 7 && <SantanderTab />}

      {/* 8 · Operacional · sub-abas (contas, recorrentes, reembolsos, importar, fila, calendário) */}
      {tab === 8 && (
        <div>
          <SubTabBar items={SUBS_OPERACIONAL} current={subOp} onSelect={setSubOp} />
          {subOp === 0 && renderContas()}
          {subOp === 1 && <Recorrentes />}
          {subOp === 2 && renderReembolsos()}
          {subOp === 3 && <ImportarExtratos />}
          {subOp === 4 && <FilaClassificacao />}
          {subOp === 5 && <CalendarioFinanceiro />}
          {subOp === 6 && <NotasCompras />}
        </div>
      )}

      {/* 9 · Gestão · sub-abas (solicitações, alertas, fechamento, auditoria) */}
      {tab === 9 && (
        <div>
          <SubTabBar items={SUBS_GESTAO} current={subGestao} onSelect={setSubGestao} />
          {subGestao === 0 && <SolicitacoesFinanceiro solicitacaoId={solicitacaoId} />}
          {subGestao === 1 && <Alertas />}
          {subGestao === 2 && <ClosingMensal />}
          {subGestao === 3 && <AuditLog />}
        </div>
      )}

      {/* 10 · Configuração */}
      {tab === 10 && <EstruturaFiscal />}

      {modalConta && renderModalConta()}
      {modalTransacao && renderModalTransacao()}
      {modalPagar && renderModalPagar()}
      {detalheTransacaoId && (
        <DetalheTransacao
          id={detalheTransacaoId}
          onClose={() => setDetalheTransacaoId(null)}
          podeEditar={isDiretor}
          onChanged={loadTransacoes}
          onEditar={(det) => { setDetalheTransacaoId(null); setModalTransacao(det); }}
        />
      )}
    </div>
  );
}
