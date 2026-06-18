import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { logistica } from '../../../api';
import { Button } from '../../../components/ui/button';

// ── Tema (vidro · tokens glass do index.css) ────────────────
const C = {
  primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  green: '#10b981', greenBg: '#10b98118', red: '#ef4444', redBg: '#ef444418',
  amber: '#f59e0b', amberBg: '#f59e0b18', blue: '#3b82f6', blueBg: '#3b82f618',
};
const glass = {
  background: 'var(--panel)',
  WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)',
  border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)', borderRadius: 16,
};
const S = {
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 },
  kpi: (accent) => ({ ...glass, padding: 18, position: 'relative', overflow: 'hidden', borderTop: `2px solid ${accent}` }),
  kpiValue: { fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.15, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 11.5, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  kpiHint: { fontSize: 11, color: C.text3, marginTop: 4 },
  card: { ...glass },
  // dado denso (tabela) = nítido (regra de ouro do tema vidro)
  tableCard: { background: 'var(--cbrio-card)', border: '1px solid var(--hairline)', borderRadius: 16, boxShadow: 'var(--shadow)', overflow: 'hidden' },
  toolbar: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hairline)', fontSize: 14, outline: 'none', background: 'var(--surface)', color: C.text },
  select: { padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hairline)', fontSize: 14, background: 'var(--surface)', color: C.text, outline: 'none' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '11px 14px', fontSize: 11.5, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'left', borderBottom: '1px solid var(--hairline)', background: 'var(--cbrio-table-header)' },
  td: { padding: '11px 14px', fontSize: 13.5, color: C.text, borderBottom: '1px solid var(--hairline)', lineHeight: 1.45 },
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, color: c, background: bg, whiteSpace: 'nowrap' }),
  overlay: { position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 56, zIndex: 1000 },
  modal: { ...glass, width: '95%', maxWidth: 620, maxHeight: '86vh', overflowY: 'auto' },
  modalHeader: { padding: '18px 22px 12px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: 700, color: C.text },
  modalBody: { padding: '16px 22px 22px' },
  modalFooter: { padding: '12px 22px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  formGroup: { marginBottom: 12 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { fontSize: 11.5, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: { textAlign: 'center', padding: 36, color: C.text3, fontSize: 14, lineHeight: 1.5 },
};

const APROVACAO = {
  pendente: { c: C.amber, bg: C.amberBg, label: 'Aguardando Pery' },
  aprovada: { c: C.green, bg: C.greenBg, label: 'Aprovada' },
  rejeitada: { c: C.red, bg: C.redBg, label: 'Rejeitada' },
};
const VINCULO = {
  nao_vinculada: { c: C.text3, bg: '#73737318', label: 'Sem vínculo fiscal' },
  sugerida: { c: C.blue, bg: C.blueBg, label: 'Sugerida' },
  confirmada: { c: C.primary, bg: C.primaryBg, label: 'Vinculada' },
};
const FORMAS = ['Cartão', 'Cartão Itaú', 'Cartão Santander', 'Dinheiro', 'Pix', 'Boleto', 'Caju', 'Mercado Livre'];

const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

function Badge({ status, map }) {
  const s = map[status] || { c: C.text3, bg: '#73737318', label: status || '—' };
  return <span style={S.badge(s.c, s.bg)}>{s.label}</span>;
}

function Field({ label, children }) {
  return <div style={S.formGroup}><label style={S.label}>{label}</label>{children}</div>;
}

// ── Componente principal ────────────────────────────────────
export default function LogisticaCompras() {
  const [kpis, setKpis] = useState(null);
  const [compras, setCompras] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [filtros, setFiltros] = useState({ busca: '', comprador: '', centro_custo: '', forma_pgto: '', status_aprovacao: '', vinculo_status: '', mes: '' });
  const [modal, setModal] = useState(null);        // { compra, review } edição/revisão/nova
  const [vinculoModal, setVinculoModal] = useState(null); // { compra, candidatos, loading }
  const [centrosFin, setCentrosFin] = useState([]);       // fin_centros_custo (financeiro)
  const [colaboradores, setColaboradores] = useState([]); // rh_funcionarios ativos
  const [camera, setCamera] = useState(false);      // modal de câmera

  const scanRef = useRef(null);
  const importRef = useRef(null);

  useEffect(() => {
    logistica.compras.centrosCusto().then(setCentrosFin).catch(() => {});
    logistica.compras.compradores().then(setColaboradores).catch(() => {});
  }, []);

  const fetchKpis = useCallback(async () => {
    try { setKpis(await logistica.compras.kpis()); } catch (e) { /* silencioso */ }
  }, []);

  const fetchCompras = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
      const [lista, pend] = await Promise.all([
        logistica.compras.list(params),
        logistica.compras.list({ status_aprovacao: 'pendente' }),
      ]);
      setCompras(lista || []);
      setPendentes(pend || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [filtros]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  useEffect(() => { fetchCompras(); }, [fetchCompras]);

  const recarregar = () => { fetchKpis(); fetchCompras(); };
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  // opções de filtro derivadas
  const compradores = useMemo(() => [...new Set(compras.map((c) => c.comprador).filter(Boolean))].sort(), [compras]);
  const centros = useMemo(() => [...new Set(compras.map((c) => c.centro_custo).filter(Boolean))].sort(), [compras]);

  // ── Ações ──
  const scanFile = async (file) => {
    if (!file) return;
    setCamera(false);
    setBusy(true); setError('');
    try {
      const { compra, extracao_ok } = await logistica.compras.escanear(file);
      recarregar();
      setModal({ compra, review: true });
      if (!extracao_ok) setError('Não consegui ler a nota — confira a imagem e preencha os campos antes de aprovar.');
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const onScanFile = (e) => { const f = e.target.files?.[0]; e.target.value = ''; scanFile(f); };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const r = await logistica.compras.importar(file);
      recarregar();
      flash(`Planilha importada: ${r.inseridas} compras novas (${r.duplicadas || 0} já existiam) · total lido ${r.lidas}.`);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const aprovar = async (compra, correcoes) => {
    setBusy(true); setError('');
    try { await logistica.compras.aprovar(compra.id, correcoes); setModal(null); recarregar(); flash('Compra aprovada.'); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const rejeitar = async (compra) => {
    const motivo = window.prompt('Motivo da rejeição (opcional):', '');
    if (motivo === null) return;
    setBusy(true);
    try { await logistica.compras.rejeitar(compra.id, motivo); setModal(null); recarregar(); flash('Compra rejeitada.'); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const excluir = async (compra) => {
    if (!window.confirm('Excluir esta compra?')) return;
    setBusy(true);
    try { await logistica.compras.remove(compra.id); recarregar(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const salvar = async (compra) => {
    setBusy(true); setError('');
    try {
      if (compra.id) await logistica.compras.update(compra.id, compra);
      else await logistica.compras.create(compra);
      setModal(null); recarregar(); flash('Compra salva.');
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const abrirVinculo = async (compra) => {
    setVinculoModal({ compra, candidatos: [], loading: true });
    try {
      const candidatos = await logistica.compras.sugestoesVinculo(compra.id);
      setVinculoModal({ compra, candidatos, loading: false });
    } catch (e) { setVinculoModal({ compra, candidatos: [], loading: false, erro: e.message }); }
  };
  const confirmarVinculo = async (compra, cand) => {
    setBusy(true);
    try { await logistica.compras.vincular(compra.id, cand.id, cand.score); setVinculoModal(null); recarregar(); flash('Compra vinculada à saída do balanço.'); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };
  const desvincular = async (compra) => {
    setBusy(true);
    try { await logistica.compras.desvincular(compra.id); recarregar(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  const novaCompra = () => setModal({
    compra: { tipo: 'variavel', data_compra: new Date().toISOString().slice(0, 10), comprador: '', fornecedor: '', materiais: '', centro_custo: '', valor: '', forma_pgto: '', status_entrega: 'entregue' },
    review: false,
  });

  return (
    <div>
      <input ref={scanRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={onScanFile} />
      <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onImportFile} />

      {/* KPIs */}
      <div style={S.kpiGrid}>
        <div style={S.kpi(C.primary)}>
          <div style={S.kpiLabel}>Compras do mês</div>
          <div style={S.kpiValue}>{fmtMoney(kpis?.valor_mes ?? 0)}</div>
          <div style={S.kpiHint}>{kpis?.compras_mes ?? 0} compras neste mês</div>
        </div>
        <div style={S.kpi(C.amber)}>
          <div style={S.kpiLabel}>Aguardando aprovação</div>
          <div style={{ ...S.kpiValue, color: (kpis?.pendentes ? C.amber : C.text) }}>{kpis?.pendentes ?? 0}</div>
          <div style={S.kpiHint}>scans pra o Pery conferir</div>
        </div>
        <div style={S.kpi(C.blue)}>
          <div style={S.kpiLabel}>Sem vínculo fiscal</div>
          <div style={S.kpiValue}>{kpis?.nao_vinculadas ?? 0}</div>
          <div style={S.kpiHint}>aprovadas sem saída do balanço</div>
        </div>
        <div style={S.kpi(C.green)}>
          <div style={S.kpiLabel}>Total de compras</div>
          <div style={S.kpiValue}>{kpis?.total ?? 0}</div>
          <div style={S.kpiHint}>{kpis?.vinculadas ?? 0} cruzadas com o balanço</div>
        </div>
      </div>

      {(error || msg) && (
        <div style={{ ...(error ? { background: C.redBg, color: C.red } : { background: C.greenBg, color: C.green }), padding: '10px 16px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error || msg}
          <Button variant="ghost" onClick={() => { setError(''); setMsg(''); }}>&#x2715;</Button>
        </div>
      )}

      {/* Toolbar */}
      <div style={S.toolbar}>
        <button style={{ ...btn(C.primary), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => setCamera(true)}>
          📷 Escanear nota
        </button>
        <button style={btnOutline()} disabled={busy} onClick={() => importRef.current?.click()}>
          ⬆️ Importar planilha
        </button>
        <button style={btnOutline()} disabled={busy} onClick={novaCompra}>+ Nova compra</button>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={recarregar}>🔄 Atualizar</Button>
      </div>

      {/* Fila de aprovação do Pery */}
      {pendentes.length > 0 && (
        <div style={{ ...S.card, padding: 16, marginBottom: 18, borderTop: `2px solid ${C.amber}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
            🕓 {pendentes.length} {pendentes.length === 1 ? 'compra escaneada aguardando' : 'compras escaneadas aguardando'} sua conferência
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendentes.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface)', borderRadius: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, color: C.text }}>{c.fornecedor || 'Fornecedor a confirmar'}</div>
                  <div style={{ fontSize: 12, color: C.text2 }}>{c.materiais || '—'} · {fmtDate(c.data_compra)}</div>
                </div>
                <div style={{ fontWeight: 700, color: C.text }}>{fmtMoney(c.valor)}</div>
                <button style={btn(C.green)} onClick={() => setModal({ compra: c, review: true })}>Conferir e aprovar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={S.filterRow}>
        <input style={{ ...S.input, minWidth: 200, flex: 1 }} placeholder="Buscar fornecedor, material ou pedido…"
          value={filtros.busca} onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))} />
        <select style={S.select} value={filtros.comprador} onChange={(e) => setFiltros((f) => ({ ...f, comprador: e.target.value }))}>
          <option value="">Comprador</option>{compradores.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select style={S.select} value={filtros.centro_custo} onChange={(e) => setFiltros((f) => ({ ...f, centro_custo: e.target.value }))}>
          <option value="">Centro de custo</option>{centros.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select style={S.select} value={filtros.forma_pgto} onChange={(e) => setFiltros((f) => ({ ...f, forma_pgto: e.target.value }))}>
          <option value="">Pagamento</option>{FORMAS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select style={S.select} value={filtros.status_aprovacao} onChange={(e) => setFiltros((f) => ({ ...f, status_aprovacao: e.target.value }))}>
          <option value="">Aprovação</option><option value="pendente">Aguardando</option><option value="aprovada">Aprovada</option><option value="rejeitada">Rejeitada</option>
        </select>
        <select style={S.select} value={filtros.vinculo_status} onChange={(e) => setFiltros((f) => ({ ...f, vinculo_status: e.target.value }))}>
          <option value="">Vínculo fiscal</option><option value="nao_vinculada">Sem vínculo</option><option value="confirmada">Vinculada</option>
        </select>
        <input type="month" style={S.select} value={filtros.mes} onChange={(e) => setFiltros((f) => ({ ...f, mes: e.target.value }))} />
      </div>

      {/* Tabela */}
      <div style={S.tableCard}>
        {loading ? (
          <div style={S.empty}>Carregando…</div>
        ) : compras.length === 0 ? (
          <div style={S.empty}>Nenhuma compra encontrada. Importe a planilha ou escaneie uma nota pra começar.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Data</th>
                  <th style={S.th}>Fornecedor / Material</th>
                  <th style={S.th}>Centro de custo</th>
                  <th style={S.th}>Comprador</th>
                  <th style={S.th}>Pagamento</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Valor</th>
                  <th style={S.th}>Aprovação</th>
                  <th style={S.th}>Vínculo fiscal</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id}>
                    <td style={S.td}>{fmtDate(c.data_compra)}</td>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{c.fornecedor || '—'}</div>
                      <div style={{ fontSize: 12, color: C.text2 }}>{c.materiais || ''}{c.origem_registro === 'scan' ? ' · 📷 escaneada' : c.origem_registro === 'whatsapp' ? ' · 📱 WhatsApp' : ''}</div>
                    </td>
                    <td style={S.td}>
                      {c.centro_fin?.nome
                        ? <span title={`${c.centro_fin.codigo} · financeiro`}>{c.centro_fin.nome}</span>
                        : <span style={{ color: C.text2 }}>{c.centro_custo || '—'}</span>}
                    </td>
                    <td style={S.td}>{c.comprador_fn?.nome || c.comprador || '—'}</td>
                    <td style={S.td}>{c.forma_pgto || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(c.valor)}</td>
                    <td style={S.td}><Badge status={c.status_aprovacao} map={APROVACAO} /></td>
                    <td style={S.td}>
                      <Badge status={c.vinculo_status} map={VINCULO} />
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {c.status_aprovacao === 'pendente'
                        ? <button style={btnSm(C.green)} onClick={() => setModal({ compra: c, review: true })}>Conferir</button>
                        : c.vinculo_status === 'confirmada'
                          ? <button style={btnSm(C.text3)} onClick={() => desvincular(c)}>Desvincular</button>
                          : <button style={btnSm(C.primary)} onClick={() => abrirVinculo(c)}>Vincular saída</button>}
                      <button style={btnSm(C.text2)} onClick={() => setModal({ compra: c, review: false })}>Editar</button>
                      <button style={btnSm(C.red)} onClick={() => excluir(c)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <CompraModal entry={modal} onClose={() => setModal(null)} onSalvar={salvar} onAprovar={aprovar} onRejeitar={rejeitar} busy={busy} centros={centrosFin} colaboradores={colaboradores} />
      )}
      {vinculoModal && (
        <VinculoModal data={vinculoModal} onClose={() => setVinculoModal(null)} onConfirmar={confirmarVinculo} busy={busy} />
      )}
      {camera && (
        <CameraModal onClose={() => setCamera(false)} onCapture={scanFile} onPickFile={() => scanRef.current?.click()} busy={busy} />
      )}
    </div>
  );
}

// ── Botões inline ──
function btn(color) { return { padding: '8px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: color, color: '#fff', transition: 'all .15s' }; }
function btnOutline() { return { padding: '8px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: 'var(--surface)', color: C.text, border: '1px solid var(--hairline)' }; }
function btnSm(color) { return { padding: '4px 9px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color, marginLeft: 4 }; }

// ── Modal de compra (nova / editar / revisar scan) ──
function CompraModal({ entry, onClose, onSalvar, onAprovar, onRejeitar, busy, centros = [], colaboradores = [] }) {
  const [c, setC] = useState(entry.compra);
  useEffect(() => { setC(entry.compra); }, [entry]);
  const review = entry.review;
  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>{review ? '📷 Conferir compra escaneada' : (c.id ? 'Editar compra' : 'Nova compra')}</div>
          <Button variant="ghost" className="text-lg" onClick={onClose}>&#x2715;</Button>
        </div>
        <div style={S.modalBody}>
          {review && (
            <div style={{ background: C.amberBg, color: C.amber, fontSize: 12.5, padding: '8px 12px', borderRadius: 8, marginBottom: 14 }}>
              A IA preencheu os campos a partir da foto. Confira tudo antes de aprovar — o sistema não lança nada sozinho.
            </div>
          )}
          {c.storage_path && (
            <a href={c.storage_path} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.primary, display: 'inline-block', marginBottom: 12 }}>Ver foto da nota ↗</a>
          )}
          <div style={S.formRow}>
            <Field label="Data da compra"><input type="date" style={S.input} value={c.data_compra || ''} onChange={(e) => set('data_compra', e.target.value)} /></Field>
            <Field label="Valor (R$)"><input type="number" step="0.01" style={S.input} value={c.valor ?? ''} onChange={(e) => set('valor', e.target.value)} /></Field>
          </div>
          <Field label="Fornecedor"><input style={S.input} value={c.fornecedor || ''} onChange={(e) => set('fornecedor', e.target.value)} /></Field>
          <Field label="Materiais / descrição"><input style={S.input} value={c.materiais || ''} onChange={(e) => set('materiais', e.target.value)} /></Field>
          <div style={S.formRow}>
            <Field label="Centro de custo (financeiro)">
              <select style={S.select} value={c.centro_custo_id || ''} onChange={(e) => set('centro_custo_id', e.target.value || null)}>
                <option value="">— escolher do financeiro —</option>
                {centros.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              {c.centro_custo && !c.centro_custo_id && <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>planilha: “{c.centro_custo}” — escolha o centro do financeiro</div>}
            </Field>
            <Field label="Comprador (colaborador)">
              <select style={S.select} value={c.comprador_id || ''} onChange={(e) => set('comprador_id', e.target.value || null)}>
                <option value="">— escolher colaborador —</option>
                {colaboradores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              {c.comprador && !c.comprador_id && <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>planilha: “{c.comprador}”</div>}
            </Field>
          </div>
          <div style={S.formRow}>
            <Field label="Forma de pagamento">
              <select style={S.select} value={c.forma_pgto || ''} onChange={(e) => set('forma_pgto', e.target.value)}>
                <option value="">—</option>{FORMAS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Nº pedido"><input style={S.input} value={c.n_pedido || ''} onChange={(e) => set('n_pedido', e.target.value)} /></Field>
          </div>
          <Field label="Observações"><input style={S.input} value={c.observacoes || ''} onChange={(e) => set('observacoes', e.target.value)} /></Field>
        </div>
        <div style={S.modalFooter}>
          {review ? (
            <>
              <button style={{ ...btn(C.red), background: 'transparent', color: C.red, border: `1px solid ${C.red}` }} disabled={busy} onClick={() => onRejeitar(c)}>Rejeitar</button>
              <button style={btnOutline()} disabled={busy} onClick={() => onSalvar(c)}>Salvar sem aprovar</button>
              <button style={btn(C.green)} disabled={busy} onClick={() => onAprovar(c, c)}>Aprovar compra</button>
            </>
          ) : (
            <>
              <button style={btnOutline()} disabled={busy} onClick={onClose}>Cancelar</button>
              <button style={btn(C.primary)} disabled={busy} onClick={() => onSalvar(c)}>Salvar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal de vínculo com a saída do balanço ──
function VinculoModal({ data, onClose, onConfirmar, busy }) {
  const { compra, candidatos, loading, erro } = data;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>Vincular à saída do balanço</div>
          <Button variant="ghost" className="text-lg" onClick={onClose}>&#x2715;</Button>
        </div>
        <div style={S.modalBody}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, color: C.text }}>{compra.fornecedor || '—'} · {fmtMoney(compra.valor)}</div>
            <div style={{ fontSize: 12.5, color: C.text2 }}>{compra.materiais || ''} · {fmtDate(compra.data_compra)}</div>
          </div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 10 }}>
            Saídas do balanço (despesas importadas) que casam por valor e data. Escolha a correspondente pra cruzar a info fiscal:
          </div>
          {loading ? <div style={S.empty}>Buscando saídas correspondentes…</div>
            : erro ? <div style={{ ...S.empty, color: C.red }}>{erro}</div>
            : candidatos.length === 0 ? <div style={S.empty}>Nenhuma saída do balanço bate com esta compra (valor/data). Importe o balanço no financeiro ou ajuste o valor.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {candidatos.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--hairline)', borderRadius: 10, opacity: t.ja_vinculada_outra ? 0.55 : 1 }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{fmtMoney(t.valor)} {t.valor_exato && <span style={S.badge(C.green, C.greenBg)}>valor exato</span>}</div>
                      <div style={{ fontSize: 12.5, color: C.text2 }}>{t.descricao || 'sem descrição'} · {fmtDate(t.data_competencia)}</div>
                      {t.ja_vinculada_outra && <div style={{ fontSize: 11.5, color: C.amber }}>já vinculada a outra compra</div>}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.text3 }}>{Math.round((t.score || 0) * 100)}%</div>
                    <button style={btn(C.primary)} disabled={busy} onClick={() => onConfirmar(compra, t)}>Vincular</button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ── Modal de câmera (captura a foto da nota direto do dispositivo) ──
function CameraModal({ onClose, onCapture, onPickFile, busy }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem suporte');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancel) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        setPronto(true);
      } catch (e) {
        setErro('Não consegui abrir a câmera (permissão negada ou indisponível). Você pode enviar uma foto/arquivo abaixo.');
      }
    })();
    return () => { cancel = true; if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, []);

  const capturar = () => {
    const v = videoRef.current; if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 1280; canvas.height = v.videoHeight || 720;
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `nota-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div style={S.modalTitle}>📷 Escanear nota</div>
          <Button variant="ghost" className="text-lg" onClick={onClose}>&#x2715;</Button>
        </div>
        <div style={S.modalBody}>
          {erro ? (
            <div style={{ ...S.empty, color: C.amber }}>{erro}</div>
          ) : (
            <div style={{ position: 'relative', background: '#000', borderRadius: 12, overflow: 'hidden', maxHeight: 420, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', maxHeight: 420, objectFit: 'cover' }} />
              {!pronto && <div style={{ position: 'absolute', color: '#fff', fontSize: 13 }}>abrindo câmera…</div>}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.text2, marginTop: 10 }}>
            Aponte pra nota fiscal e capture — a IA extrai os dados e a compra fica aguardando aprovação. Também dá pra enviar uma foto da galeria ou um PDF.
          </div>
        </div>
        <div style={S.modalFooter}>
          <button style={btnOutline()} disabled={busy} onClick={onPickFile}>Enviar foto/arquivo</button>
          {!erro && <button style={btn(C.primary)} disabled={busy || !pronto} onClick={capturar}>{busy ? 'Enviando…' : 'Capturar'}</button>}
        </div>
      </div>
    </div>
  );
}
