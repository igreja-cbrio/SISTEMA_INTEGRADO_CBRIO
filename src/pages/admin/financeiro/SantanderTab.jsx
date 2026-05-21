import { useEffect, useState, useCallback, useMemo } from 'react';
import { santander } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', santander: '#EC0000', santanderBg: '#EC000010',
};

const STATUS_LOCAL = {
  pendente: { c: C.text3, bg: '#73737318', label: 'Disponivel' },
  requested: { c: C.amber, bg: C.amberBg, label: 'Processando' },
  baixado: { c: C.green, bg: C.greenBg, label: 'Baixado' },
  erro: { c: C.red, bg: C.redBg, label: 'Erro' },
  expirado: { c: C.text3, bg: '#73737318', label: 'Expirado' },
};

const CATEGORIAS = ['', 'PIX', 'TED', 'DOC', 'BOLETOS', 'TRIBUTOS', 'DEBITO-AUTOMATICO', 'CONCESSIONARIAS', 'TRANSFERENCIAS-OUTRAS'];

function brl(v) {
  if (v === null || v === undefined || isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d) {
  if (!d) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
  }
  return d;
}

const styles = {
  section: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  kpi: { padding: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` },
  kpiLabel: { fontSize: 12, color: C.text3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.2 },
  kpiSub: { fontSize: 11, color: C.text3, marginTop: 4 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${C.border}` },
  td: { padding: '12px', borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.text, verticalAlign: 'top' },
  badge: (cfg) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: cfg.c, background: cfg.bg }),
  input: { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' },
  alertBox: (bg, c) => ({ background: bg, color: c, padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 500, lineHeight: 1.5, marginBottom: 16 }),
  filtros: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
};

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function hoje() { return new Date().toISOString().slice(0, 10); }

export default function SantanderTab() {
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [saldo, setSaldo] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);
  const [extrato, setExtrato] = useState(null);
  const [loadingExtrato, setLoadingExtrato] = useState(false);
  const [extratoErr, setExtratoErr] = useState(null);
  const [extratoInicio, setExtratoInicio] = useState(diasAtras(30));
  const [extratoFim, setExtratoFim] = useState(hoje());

  const [comprovantes, setComprovantes] = useState(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [compErr, setCompErr] = useState(null);
  const [compInicio, setCompInicio] = useState(diasAtras(30));
  const [compFim, setCompFim] = useState(hoje());
  const [compCategoria, setCompCategoria] = useState('');
  const [baixandoId, setBaixandoId] = useState(null);

  // Health check
  useEffect(() => {
    santander.health()
      .then(setHealth)
      .catch((e) => setHealth({ ok: false, error: e.message }))
      .finally(() => setLoadingHealth(false));
  }, []);

  // Carrega saldo ao montar (se configurado)
  const loadSaldo = useCallback(async () => {
    setLoadingSaldo(true);
    try {
      const data = await santander.saldo();
      setSaldo(data);
    } catch (e) {
      setSaldo({ erro: e.message });
    } finally {
      setLoadingSaldo(false);
    }
  }, []);

  useEffect(() => {
    if (health?.ok) loadSaldo();
  }, [health?.ok, loadSaldo]);

  const loadExtrato = useCallback(async (refresh = false) => {
    setLoadingExtrato(true);
    setExtratoErr(null);
    try {
      const data = await santander.extrato(extratoInicio, extratoFim, refresh);
      setExtrato(data);
    } catch (e) {
      setExtratoErr(e.message);
    } finally {
      setLoadingExtrato(false);
    }
  }, [extratoInicio, extratoFim]);

  const loadComprovantes = useCallback(async () => {
    setLoadingComp(true);
    setCompErr(null);
    try {
      const params = { inicio: compInicio, fim: compFim };
      if (compCategoria) params.categoria = compCategoria;
      const data = await santander.comprovantes.list(params);
      setComprovantes(data);
    } catch (e) {
      setCompErr(e.message);
    } finally {
      setLoadingComp(false);
    }
  }, [compInicio, compFim, compCategoria]);

  async function baixar(payment) {
    const paymentId = payment?.payment?.paymentId;
    if (!paymentId) return;
    setBaixandoId(paymentId);
    try {
      await santander.comprovantes.baixar(paymentId, {
        payment_date: payment?.payment?.requestValueDateTime?.slice(0, 10),
        category: payment?.category?.code,
        channel: payment?.channel?.code,
        amount: payment?.payment?.paymentAmountInfo?.direct?.amount,
        payee_name: payment?.payment?.payee?.name,
      });
      await loadComprovantes();
    } catch (e) {
      alert(`Falha ao baixar comprovante: ${e.message}`);
    } finally {
      setBaixandoId(null);
    }
  }

  async function abrirPdf(paymentId) {
    try {
      const { url } = await santander.comprovantes.pdfUrl(paymentId);
      if (url) window.open(url, '_blank');
    } catch (e) {
      alert(`Falha ao abrir PDF: ${e.message}`);
    }
  }

  // Health visual
  if (loadingHealth) {
    return <div style={{ padding: 24, color: C.text2 }}>Verificando configuracao...</div>;
  }

  if (!health?.configured) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Integracao Santander</div>
        <div style={styles.alertBox(C.amberBg, C.amber)}>
          <strong>Configuracao pendente.</strong> Para usar essa integracao,
          configure no Vercel as variaveis de ambiente:
          <ul style={{ margin: '8px 0 0 18px' }}>
            {(health?.missing_env || []).map((v) => (
              <li key={v} style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (!health?.ok) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Integracao Santander</div>
        <div style={styles.alertBox(C.redBg, C.red)}>
          <strong>Falha na autenticacao com Santander.</strong>
          <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>{health.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header · ambiente */}
      <div style={styles.alertBox(health.ambiente === 'producao' ? C.greenBg : C.blueBg, health.ambiente === 'producao' ? C.green : C.blue)}>
        Ambiente <strong>{health.ambiente.toUpperCase()}</strong> · Conta {health.agencia} / {health.conta} · CNPJ {health.cnpj_titular}
      </div>

      {/* Saldo */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <span>Saldo da conta</span>
          <Button size="sm" variant="outline" onClick={loadSaldo} disabled={loadingSaldo}>
            {loadingSaldo ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>
        {saldo?.erro && <div style={styles.alertBox(C.redBg, C.red)}>{saldo.erro}</div>}
        {saldo && !saldo.erro && (
          <div style={styles.grid3}>
            <div style={styles.kpi}>
              <div style={styles.kpiLabel}>Disponivel</div>
              <div style={{ ...styles.kpiValue, color: C.green }}>{brl(saldo.available)}</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiLabel}>Bloqueado</div>
              <div style={styles.kpiValue}>{brl(saldo.blocked)}</div>
            </div>
            <div style={styles.kpi}>
              <div style={styles.kpiLabel}>Investido automatico</div>
              <div style={styles.kpiValue}>{brl(saldo.invested)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Extrato */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}><span>Extrato</span></div>
        <div style={styles.filtros}>
          <input type="date" value={extratoInicio} onChange={(e) => setExtratoInicio(e.target.value)} style={styles.input} />
          <span style={{ color: C.text3 }}>ate</span>
          <input type="date" value={extratoFim} onChange={(e) => setExtratoFim(e.target.value)} style={styles.input} />
          <Button onClick={() => loadExtrato(false)} disabled={loadingExtrato}>
            {loadingExtrato ? 'Carregando...' : 'Buscar'}
          </Button>
          {extrato && (
            <Button variant="outline" onClick={() => loadExtrato(true)} disabled={loadingExtrato}>
              Forcar refresh
            </Button>
          )}
        </div>
        {extratoErr && <div style={styles.alertBox(C.redBg, C.red)}>{extratoErr}</div>}
        {extrato && (
          <ExtratoTabela conteudo={extrato._content || []} />
        )}
      </div>

      {/* Comprovantes */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}><span>Comprovantes de pagamento</span></div>
        <div style={styles.filtros}>
          <input type="date" value={compInicio} onChange={(e) => setCompInicio(e.target.value)} style={styles.input} />
          <span style={{ color: C.text3 }}>ate</span>
          <input type="date" value={compFim} onChange={(e) => setCompFim(e.target.value)} style={styles.input} />
          <select value={compCategoria} onChange={(e) => setCompCategoria(e.target.value)} style={styles.input}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c || 'Todas categorias'}</option>)}
          </select>
          <Button onClick={loadComprovantes} disabled={loadingComp}>
            {loadingComp ? 'Carregando...' : 'Buscar'}
          </Button>
        </div>
        {compErr && <div style={styles.alertBox(C.redBg, C.red)}>{compErr}</div>}
        {comprovantes && (
          <ComprovantesTabela
            data={comprovantes}
            baixandoId={baixandoId}
            onBaixar={baixar}
            onAbrirPdf={abrirPdf}
          />
        )}
      </div>
    </div>
  );
}

function ExtratoTabela({ conteudo }) {
  if (!conteudo.length) return <div style={{ color: C.text3, padding: 12 }}>Sem movimentacoes no periodo</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Data</th>
            <th style={styles.th}>Tipo</th>
            <th style={styles.th}>Descricao</th>
            <th style={styles.th}>Contraparte</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {conteudo.map((t, i) => {
            const isDebito = t.creditDebitType === 'DEBITO';
            const valor = Number(t.amount || 0);
            return (
              <tr key={t.transactionId || i}>
                <td style={styles.td}>{fmtData(t.transactionDate)}</td>
                <td style={styles.td}>{t.type || '—'}</td>
                <td style={styles.td}>{t.transactionName || '—'}</td>
                <td style={styles.td}>
                  {t.partieNumber ? `${t.partieBranchCode || ''}/${t.partieNumber}` : '—'}
                </td>
                <td style={{ ...styles.td, textAlign: 'right', color: isDebito ? C.red : C.green, fontWeight: 600 }}>
                  {brl(valor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComprovantesTabela({ data, baixandoId, onBaixar, onAbrirPdf }) {
  const lista = data?.paymentsReceipts || [];
  const locais = data?.localStatus || {};
  if (!lista.length) return <div style={{ color: C.text3, padding: 12 }}>Sem comprovantes no periodo</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Data</th>
            <th style={styles.th}>Categoria</th>
            <th style={styles.th}>Beneficiario</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Valor</th>
            <th style={styles.th}>Status</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => {
            const id = p?.payment?.paymentId;
            const local = locais[id];
            const statusKey = local?.status || 'pendente';
            const cfg = STATUS_LOCAL[statusKey] || STATUS_LOCAL.pendente;
            const valor = p?.payment?.paymentAmountInfo?.direct?.amount;
            return (
              <tr key={id}>
                <td style={styles.td}>{fmtData(p?.payment?.requestValueDateTime)}</td>
                <td style={styles.td}>{p?.category?.code || '—'}</td>
                <td style={styles.td}>{p?.payment?.payee?.name || '—'}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{brl(valor)}</td>
                <td style={styles.td}>
                  <span style={styles.badge(cfg)}>{cfg.label}</span>
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  {statusKey === 'baixado' ? (
                    <Button size="sm" variant="outline" onClick={() => onAbrirPdf(id)}>
                      Ver PDF
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onBaixar(p)} disabled={baixandoId === id}>
                      {baixandoId === id ? 'Baixando...' : 'Baixar'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
