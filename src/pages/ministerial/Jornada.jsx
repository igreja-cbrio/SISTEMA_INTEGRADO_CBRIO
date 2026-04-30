import { useState, useEffect, useCallback, useMemo } from 'react';
import { jornada as api } from '../../api';
import { useKpis } from '../../hooks/useKpis';
import { useAuth } from '../../contexts/AuthContext';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', amberBg: '#fef3c7', blue: '#3b82f6', blueBg: '#dbeafe',
  purple: '#8b5cf6', purpleBg: '#ede9fe', tableHeader: 'var(--cbrio-table-header)',
};
const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

// Metadados visuais dos 5 valores. Os KPIs vinculados a cada valor sao lidos
// do banco (kpi_indicadores_taticos.valores) via useKpis().byValor.
const VALOR_META = [
  { key: 'seguir', nome: 'Seguir a Jesus', desc: 'Fez decisao/conversao ou foi batizado', color: '#3b82f6', bg: '#dbeafe' },
  { key: 'conectar', nome: 'Conectar-se com Pessoas', desc: 'Participa de um grupo ativo', color: '#8b5cf6', bg: '#ede9fe' },
  { key: 'investir', nome: 'Investir Tempo com Deus', desc: 'Participa da Jornada 180 / Discipulado', color: '#f59e0b', bg: '#fef3c7' },
  { key: 'servir', nome: 'Servir em Comunidade', desc: 'Voluntario ativo com check-in recente', color: '#10b981', bg: '#d1fae5' },
  { key: 'generosidade', nome: 'Viver Generosamente', desc: 'Contribuiu nos ultimos 90 dias', color: '#ef4444', bg: '#fee2e2' },
];

export default function Jornada() {
  const { byValor, kpis: allKpis, update: updateKpi } = useKpis();
  const { isAdmin, isDiretor } = useAuth();
  const canEdit = isAdmin || isDiretor;
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [membros, setMembros] = useState([]);
  const [totalMembros, setTotalMembros] = useState(0);
  const [search, setSearch] = useState('');
  const [filtroValor, setFiltroValor] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [valorDrill, setValorDrill] = useState(null); // valor key para drill-down

  const loadDashboard = useCallback(async () => {
    try { setDashboard(await api.dashboard()); } catch (e) { console.error(e); }
  }, []);

  const loadMembros = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (search) params.search = search;
      if (filtroValor) params.valor = filtroValor;
      const res = await api.membros(params);
      setMembros(res.membros || []);
      setTotalMembros(res.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [search, filtroValor, page]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === 'membros' || tab === 'valor-drill') loadMembros(); }, [tab, loadMembros]);

  const openDetail = async (id) => {
    setDetailLoading(true); setTab('detalhe');
    try { setDetail(await api.membro(id)); } catch (e) { console.error(e); setDetail(null); }
    setDetailLoading(false);
  };

  const openValorDrill = (key) => {
    setValorDrill(key);
    setFiltroValor(key); // FIX: seta filtro pro backend retornar membros SEM esse valor
    setSearch('');
    setPage(1);
    setTab('valor-drill');
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Jornada</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: C.t3 }}>Progresso dos membros nos 5 valores da CBRio</p>
      </div>

      {/* Tabs */}
      {!['detalhe', 'valor-drill'].includes(tab) && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `2px solid ${C.border}` }}>
          {[['dashboard', 'Dashboard'], ['membros', 'Membros']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === k ? 700 : 400, color: tab === k ? C.primary : C.t3, borderBottom: tab === k ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2 }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === 'dashboard' && dashboard && <TabDashboard data={dashboard} onValorClick={openValorDrill} />}
      {tab === 'membros' && <TabMembros membros={membros} total={totalMembros} search={search} setSearch={setSearch} filtro={filtroValor} setFiltro={setFiltroValor} page={page} setPage={setPage} loading={loading} onDetail={openDetail} />}
      {tab === 'valor-drill' && <ValorDrillDown valorKey={valorDrill} membros={membros} total={totalMembros} search={search} setSearch={setSearch} page={page} setPage={setPage} loading={loading} onDetail={openDetail} onBack={() => setTab('dashboard')} loadMembros={loadMembros} kpisDoValor={byValor[valorDrill] || []} allKpis={allKpis} updateKpi={updateKpi} canEdit={canEdit} />}
      {tab === 'detalhe' && <TabDetalhe detail={detail} loading={detailLoading} onBack={() => { setTab(valorDrill ? 'valor-drill' : 'membros'); setDetail(null); }} />}
    </div>
  );
}

// ═══ DASHBOARD ═══
function TabDashboard({ data, onValorClick }) {
  const { total_membros, valores } = data;
  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 14, color: C.t3 }}>Total de membros ativos</span>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>{total_membros}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {VALOR_META.map(v => {
          const d = valores[v.key] || { total: 0, pct: 0 };
          return (
            <div key={v.key} onClick={() => onValorClick(v.key)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, borderLeft: `4px solid ${v.color}`, cursor: 'pointer', transition: 'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = v.color} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{v.nome}</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{v.desc}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: v.color }}>{d.pct}%</div>
                  <div style={{ fontSize: 12, color: C.t3 }}>{d.total} membros</div>
                </div>
              </div>
              <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(d.pct, 100)}%`, background: v.color, borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Clique para ver detalhes e KPIs vinculados</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ VALOR DRILL-DOWN ═══
function ValorDrillDown({ valorKey, membros, total, search, setSearch, page, setPage, loading, onDetail, onBack, loadMembros, kpisDoValor, allKpis = [], updateKpi, canEdit = false }) {
  const valor = VALOR_META.find(v => v.key === valorKey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(null); // id do KPI sendo mutado
  if (!valor) return null;

  // KPIs vinculados a esse valor (vindos do banco via prop kpisDoValor)
  // KPIs disponiveis pra promover (todos ativos que NAO tem esse valor)
  const linkedIds = new Set((kpisDoValor || []).map(k => k.id));
  const candidatosPromover = (allKpis || []).filter(k => k.ativo !== false && !linkedIds.has(k.id));

  // Membros que TEM esse valor ativo
  const comValor = membros.filter(m => m.valores?.[valorKey]);
  const semValor = membros.filter(m => !m.valores?.[valorKey]);

  const promoverKpi = async (kpi) => {
    if (!updateKpi || busy) return;
    setBusy(kpi.id);
    try {
      const novosValores = Array.from(new Set([...(kpi.valores || []), valorKey]));
      await updateKpi(kpi.id, { valores: novosValores });
      setPickerOpen(false);
    } catch (e) {
      alert(e?.message || 'Erro ao promover KPI');
    } finally {
      setBusy(null);
    }
  };

  const retirarKpi = async (kpi) => {
    if (!updateKpi || busy) return;
    if (!window.confirm(`Tirar "${kpi.id} — ${kpi.indicador || kpi.nome}" deste valor?`)) return;
    setBusy(kpi.id);
    try {
      const novosValores = (kpi.valores || []).filter(v => v !== valorKey);
      if (novosValores.length === 0) {
        // Backend exige pelo menos 1 valor — se fica sem nenhum, avisa
        if (!window.confirm('Esse KPI ficaria sem nenhum valor vinculado. Tirar mesmo assim? (vai virar erro do servidor)')) {
          setBusy(null);
          return;
        }
      }
      if (kpi.is_okr && novosValores.length === 0) {
        alert('Nao da: KPI esta marcado como OKR e precisa de pelo menos 1 valor. Edite o KPI e desmarque OKR primeiro.');
        setBusy(null);
        return;
      }
      await updateKpi(kpi.id, { valores: novosValores });
    } catch (e) {
      alert(e?.message || 'Erro ao retirar KPI');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 14, fontWeight: 600, marginBottom: 16, padding: 0 }}>{'<- Voltar ao Dashboard'}</button>

      {/* Header do valor */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20, borderLeft: `4px solid ${valor.color}` }}>
        <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>{valor.nome}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: C.t3 }}>{valor.desc}</p>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <div style={{ padding: '8px 16px', borderRadius: 8, background: valor.bg }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: valor.color }}>{comValor.length}</div>
            <div style={{ fontSize: 11, color: valor.color }}>Com este valor</div>
          </div>
          <div style={{ padding: '8px 16px', borderRadius: 8, background: C.redBg }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.red }}>{semValor.length}</div>
            <div style={{ fontSize: 11, color: C.red }}>Sem este valor</div>
          </div>
        </div>
      </div>

      {/* KPIs vinculados */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0 }}>KPIs que medem este valor ({(kpisDoValor || []).length})</h3>
        {canEdit && (
          <button onClick={() => setPickerOpen(true)}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${valor.color}`, background: valor.bg, color: valor.color, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Promover KPI a este valor
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 8, marginBottom: 24 }}>
        {(kpisDoValor || []).length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: 20, textAlign: 'center', background: C.card, border: `1px dashed ${C.border}`, borderRadius: 8, color: C.t3, fontSize: 13 }}>
            Nenhum KPI vinculado a este valor ainda. {canEdit && 'Use "+ Promover KPI" pra adicionar.'}
          </div>
        )}
        {(kpisDoValor || []).map(kpi => (
          <div key={kpi.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: valor.color, fontSize: 13 }}>{kpi.id}</span>
                {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>OKR</span>}
                <span style={{ color: C.t2, fontSize: 13 }}>{kpi.indicador || kpi.nome}</span>
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{kpi.area} | {kpi.periodicidade} | Meta: {kpi.meta_descricao || kpi.meta_2026 || '-'}</div>
            </div>
            {canEdit && (
              <button onClick={() => retirarKpi(kpi)} disabled={busy === kpi.id}
                title="Retirar deste valor"
                style={{ background: 'none', border: `1px solid ${C.border}`, color: C.red, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: busy === kpi.id ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                {busy === kpi.id ? '...' : '× Retirar'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Picker de KPIs disponiveis pra promover */}
      {pickerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cbrio-overlay)' }} onClick={() => setPickerOpen(false)}>
          <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 12, width: 600, maxHeight: '80vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: C.text }}>Promover KPI ao valor: {valor.nome}</h2>
              <button onClick={() => setPickerOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.t3 }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: C.t3, marginTop: 0, marginBottom: 16 }}>{candidatosPromover.length} KPIs disponíveis. Clique em um pra adicioná-lo a "{valor.nome}".</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '55vh', overflow: 'auto' }}>
              {candidatosPromover.length === 0 && (
                <p style={{ color: C.t3, fontSize: 13, textAlign: 'center', padding: 20 }}>Todos os KPIs já estão neste valor.</p>
              )}
              {candidatosPromover.map(kpi => (
                <button key={kpi.id} onClick={() => promoverKpi(kpi)} disabled={!!busy}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', cursor: busy ? 'wait' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = valor.color; }}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{kpi.id}</span>
                      {kpi.is_okr && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>OKR</span>}
                      <span style={{ color: C.t2, fontSize: 13 }}>{kpi.indicador || kpi.nome}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                      {kpi.area} | {kpi.periodicidade}
                      {kpi.valores?.length > 0 && ` | já em: ${kpi.valores.join(', ')}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: valor.color }}>{busy === kpi.id ? '...' : '+ Adicionar'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Membros */}
      <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12 }}>Membros</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome..." style={{ ...inp, width: 250 }} />
      </div>

      {loading ? <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Carregando...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* COM o valor */}
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: valor.color, marginBottom: 8 }}>Com este valor ({comValor.length})</h4>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: 400, overflow: 'auto' }}>
              {comValor.length === 0 ? <p style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum membro</p> :
                comValor.map(m => (
                  <div key={m.id} onClick={() => onDetail(m.id)} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{m.status}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: valor.bg, color: valor.color }}>{m.total_valores}/5</span>
                  </div>
                ))}
            </div>
          </div>

          {/* SEM o valor */}
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 8 }}>Sem este valor ({semValor.length})</h4>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: 400, overflow: 'auto' }}>
              {semValor.length === 0 ? <p style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 13 }}>Todos os membros possuem</p> :
                semValor.map(m => (
                  <div key={m.id} onClick={() => onDetail(m.id)} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nome}</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{m.status}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: C.redBg, color: C.red }}>{m.total_valores}/5</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ MEMBROS ═══
function TabMembros({ membros, total, search, setSearch, filtro, setFiltro, page, setPage, loading, onDetail }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome..." style={{ ...inp, width: 250 }} />
        <select value={filtro} onChange={e => { setFiltro(e.target.value); setPage(1); }} style={{ ...inp, width: 'auto' }}>
          <option value="">Todos</option>
          {VALOR_META.map(v => <option key={v.key} value={v.key}>{'Sem: ' + v.nome}</option>)}
        </select>
        <span style={{ fontSize: 13, color: C.t3 }}>{total} membros</span>
      </div>

      {loading ? <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Carregando...</p> : membros.length === 0 ? (
        <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Nenhum membro encontrado</p>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.tableHeader }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Membro</th>
                {VALOR_META.map(v => <th key={v.key} style={{ padding: '10px 8px', textAlign: 'center', color: v.color, fontWeight: 600, fontSize: 11, minWidth: 40 }} title={v.nome}>{v.nome.split(' ')[0]}</th>)}
                <th style={{ padding: '10px 8px', textAlign: 'center', color: C.t2, fontWeight: 600, fontSize: 12 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {membros.map(m => (
                <tr key={m.id} onClick={() => onDetail(m.id)} style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{m.nome}</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>{m.status}</div>
                  </td>
                  {VALOR_META.map(v => (
                    <td key={v.key} style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 6, lineHeight: '24px', fontSize: 14, background: m.valores?.[v.key] ? v.bg : C.bg, color: m.valores?.[v.key] ? v.color : C.t3 }}>
                        {m.valores?.[v.key] ? '\u2713' : '-'}
                      </span>
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: m.total_valores >= 4 ? C.greenBg : m.total_valores >= 2 ? C.amberBg : C.redBg, color: m.total_valores >= 4 ? C.green : m.total_valores >= 2 ? C.amber : C.red }}>
                      {m.total_valores}/5
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', cursor: page <= 1 ? 'default' : 'pointer', color: C.t2, opacity: page <= 1 ? 0.3 : 1 }}>Anterior</button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: C.t3 }}>{page} / {Math.ceil(total / 50)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', cursor: 'pointer', color: C.t2 }}>Proximo</button>
        </div>
      )}
    </div>
  );
}

// ═══ DETALHE DO MEMBRO ═══
function TabDetalhe({ detail, loading, onBack }) {
  if (loading || !detail?.membro) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  const { membro: m, valores = {}, trilha = [], grupos = [], jornada180 = [], voluntariado = [], contribuicoes = [] } = detail;

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 14, fontWeight: 600, marginBottom: 16, padding: 0 }}>{'<- Voltar'}</button>

      {/* Header */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: C.primary }}>
          {(m.nome || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>{m.nome}</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 13, color: C.t3 }}>
            <span>{m.status}</span>
            {m.telefone && <span>{m.telefone}</span>}
            {m.email && <span>{m.email}</span>}
          </div>
        </div>
        <span style={{ padding: '4px 14px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: Object.values(valores).filter(v => v.ativo).length >= 4 ? C.greenBg : C.amberBg, color: Object.values(valores).filter(v => v.ativo).length >= 4 ? C.green : C.amber }}>
          {Object.values(valores).filter(v => v.ativo).length}/5 valores
        </span>
      </div>

      {/* 5 Valores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 20 }}>
        {VALOR_META.map(v => {
          const data = valores[v.key];
          const ativo = data?.ativo;
          return (
            <div key={v.key} style={{ background: C.card, border: `2px solid ${ativo ? v.color : C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v.nome}</span>
                <span style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, background: ativo ? v.bg : C.bg, color: ativo ? v.color : C.t3 }}>
                  {ativo ? '\u2713' : '\u2717'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                {v.key === 'seguir' && (ativo ? 'Decisao registrada' : 'Sem registro de conversao')}
                {v.key === 'conectar' && (ativo ? `Grupo: ${data.dados?.mem_grupos?.nome || 'Ativo'}` : 'Nao esta em nenhum grupo')}
                {v.key === 'investir' && (ativo ? 'Participando da Jornada 180' : 'Sem registro de discipulado')}
                {v.key === 'servir' && (ativo ? `Ministerio: ${data.dados?.mem_ministerios?.nome || 'Ativo'}` : 'Nao esta servindo')}
                {v.key === 'generosidade' && (ativo ? `Ultima contribuicao: ${data.dados?.data || ''}` : 'Sem contribuicao nos ultimos 90 dias')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {trilha.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>Trilha dos Valores</h3>
            {trilha.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: t.concluida ? C.green : C.t3 }}>{t.concluida ? '\u2713' : 'o'} {t.etapa}</span>
                {t.data_conclusao && <span style={{ color: C.t3 }}>{t.data_conclusao}</span>}
              </div>
            ))}
          </div>
        )}

        {grupos.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>Grupos</h3>
            {grupos.map(g => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: !g.saiu_em ? C.green : C.t3 }}>{g.mem_grupos?.nome || 'Grupo'}</span>
                <span style={{ color: C.t3 }}>{g.entrou_em}{g.saiu_em ? ` -> ${g.saiu_em}` : ' (ativo)'}</span>
              </div>
            ))}
          </div>
        )}

        {voluntariado.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>Voluntariado</h3>
            {voluntariado.map(v => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: !v.ate ? C.green : C.t3 }}>{v.mem_ministerios?.nome || v.papel || 'Ativo'}</span>
                <span style={{ color: C.t3 }}>{v.desde}{v.ate ? ` -> ${v.ate}` : ' (ativo)'}</span>
              </div>
            ))}
          </div>
        )}

        {contribuicoes.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>Contribuicoes recentes</h3>
            {contribuicoes.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.text }}>{c.tipo} - R$ {Number(c.valor).toFixed(2)}</span>
                <span style={{ color: C.t3 }}>{c.data}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
