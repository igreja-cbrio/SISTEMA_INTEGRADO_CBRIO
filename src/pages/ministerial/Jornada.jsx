import { useState, useEffect, useCallback } from 'react';
import { jornada as api } from '../../api';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', greenBg: '#d1fae5', red: '#ef4444', redBg: '#fee2e2',
  amber: '#f59e0b', amberBg: '#fef3c7', blue: '#3b82f6', blueBg: '#dbeafe',
  purple: '#8b5cf6', purpleBg: '#ede9fe',
};
const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };

const VALORES = [
  { key: 'seguir', nome: 'Seguir a Jesus', desc: 'Fez decis\u00e3o/convers\u00e3o ou foi batizado', icon: '\u2720', color: '#3b82f6', bg: '#dbeafe' },
  { key: 'conectar', nome: 'Conectar-se com Pessoas', desc: 'Participa de um grupo ativo', icon: '\ud83e\udd1d', color: '#8b5cf6', bg: '#ede9fe' },
  { key: 'investir', nome: 'Investir Tempo com Deus', desc: 'Participa da Jornada 180 / Disc\u00edpulado', icon: '\ud83d\udcd6', color: '#f59e0b', bg: '#fef3c7' },
  { key: 'servir', nome: 'Servir em Comunidade', desc: 'Volunt\u00e1rio ativo com check-in recente', icon: '\ud83d\ude4f', color: '#10b981', bg: '#d1fae5' },
  { key: 'generosidade', nome: 'Viver Generosamente', desc: 'Contribuiu nos \u00faltimos 90 dias', icon: '\u2764', color: '#ef4444', bg: '#fee2e2' },
];

export default function Jornada() {
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
  useEffect(() => { if (tab === 'membros') loadMembros(); }, [tab, loadMembros]);

  const openDetail = async (id) => {
    setDetailLoading(true);
    setTab('detalhe');
    try { setDetail(await api.membro(id)); } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Jornada</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: C.t3 }}>Progresso dos membros nos 5 valores da CBRio</p>
      </div>

      {/* Tabs */}
      {tab !== 'detalhe' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `2px solid ${C.border}` }}>
          {[['dashboard', 'Dashboard'], ['membros', 'Membros']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: tab === k ? 700 : 400, color: tab === k ? C.primary : C.t3, borderBottom: tab === k ? `2px solid ${C.primary}` : '2px solid transparent', marginBottom: -2 }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === 'dashboard' && dashboard && <TabDashboard data={dashboard} />}
      {tab === 'membros' && <TabMembros membros={membros} total={totalMembros} search={search} setSearch={setSearch} filtro={filtroValor} setFiltro={setFiltroValor} page={page} setPage={setPage} loading={loading} onDetail={openDetail} />}
      {tab === 'detalhe' && <TabDetalhe detail={detail} loading={detailLoading} onBack={() => { setTab('membros'); setDetail(null); }} />}
    </div>
  );
}

// ═══ DASHBOARD ═══
function TabDashboard({ data }) {
  const { total_membros, valores } = data;
  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><span style={{ fontSize: 14, color: C.t3 }}>Total de membros ativos</span><div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>{total_membros}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        {VALORES.map(v => {
          const d = valores[v.key] || { total: 0, pct: 0 };
          return (
            <div key={v.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, borderLeft: `4px solid ${v.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{v.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{v.nome}</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{v.desc}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: v.color }}>{d.pct}%</div>
                  <div style={{ fontSize: 12, color: C.t3 }}>{d.total} membros</div>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(d.pct, 100)}%`, background: v.color, borderRadius: 4, transition: 'width .3s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ MEMBROS ═══
function TabMembros({ membros, total, search, setSearch, filtro, setFiltro, page, setPage, loading, onDetail }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome..."
          style={{ ...inp, width: 250 }} />
        <select value={filtro} onChange={e => { setFiltro(e.target.value); setPage(1); }} style={{ ...inp, width: 'auto' }}>
          <option value="">Todos</option>
          {VALORES.map(v => <option key={v.key} value={v.key}>{'Sem: ' + v.nome}</option>)}
        </select>
        <span style={{ fontSize: 13, color: C.t3 }}>{total} membros</span>
      </div>

      {loading ? <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Carregando...</p> : membros.length === 0 ? (
        <p style={{ color: C.t3, textAlign: 'center', padding: 40 }}>Nenhum membro encontrado</p>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--cbrio-table-header)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: C.t2, fontWeight: 600, fontSize: 12 }}>Membro</th>
                {VALORES.map(v => <th key={v.key} style={{ padding: '10px 8px', textAlign: 'center', color: v.color, fontWeight: 600, fontSize: 11, minWidth: 40 }} title={v.nome}>{v.icon}</th>)}
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
                  {VALORES.map(v => (
                    <td key={v.key} style={{ textAlign: 'center', padding: '10px 8px' }}>
                      <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 6, lineHeight: '24px', fontSize: 14, background: m.valores?.[v.key] ? v.bg : C.bg, color: m.valores?.[v.key] ? v.color : C.t3 }}>
                        {m.valores?.[v.key] ? '\u2713' : '\u00b7'}
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

      {/* Paginacao */}
      {total > 50 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', cursor: page <= 1 ? 'default' : 'pointer', color: C.t2, opacity: page <= 1 ? 0.3 : 1 }}>Anterior</button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: C.t3 }}>{page} / {Math.ceil(total / 50)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', cursor: 'pointer', color: C.t2 }}>{`Pr\u00f3ximo`}</button>
        </div>
      )}
    </div>
  );
}

// ═══ DETALHE DO MEMBRO ═══
function TabDetalhe({ detail, loading, onBack }) {
  if (loading || !detail) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  const { membro: m, valores, trilha, grupos, jornada180, voluntariado, contribuicoes } = detail;

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 14, fontWeight: 600, marginBottom: 16, padding: 0 }}>{'\u2190 Voltar'}</button>

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
        <div>
          <span style={{ padding: '4px 14px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: Object.values(valores).filter(v => v.ativo).length >= 4 ? C.greenBg : C.amberBg, color: Object.values(valores).filter(v => v.ativo).length >= 4 ? C.green : C.amber }}>
            {Object.values(valores).filter(v => v.ativo).length}/5 valores
          </span>
        </div>
      </div>

      {/* 5 Valores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 20 }}>
        {VALORES.map(v => {
          const data = valores[v.key];
          const ativo = data?.ativo;
          return (
            <div key={v.key} style={{ background: C.card, border: `2px solid ${ativo ? v.color : C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{v.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v.nome}</span>
                </div>
                <span style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, background: ativo ? v.bg : C.bg, color: ativo ? v.color : C.t3 }}>
                  {ativo ? '\u2713' : '\u2717'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                {v.key === 'seguir' && (ativo ? 'Decis\u00e3o registrada' : 'Sem registro de convers\u00e3o')}
                {v.key === 'conectar' && (ativo ? `Grupo: ${data.dados?.mem_grupos?.nome || 'Ativo'}` : 'N\u00e3o est\u00e1 em nenhum grupo')}
                {v.key === 'investir' && (ativo ? 'Participando da Jornada 180' : 'Sem registro de discipulado')}
                {v.key === 'servir' && (ativo ? `Minist\u00e9rio: ${data.dados?.mem_ministerios?.nome || 'Ativo'}` : 'N\u00e3o est\u00e1 servindo')}
                {v.key === 'generosidade' && (ativo ? `\u00daltima contribui\u00e7\u00e3o: ${data.dados?.data || ''}` : 'Sem contribui\u00e7\u00e3o nos \u00faltimos 90 dias')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline de dados */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Trilha dos valores */}
        {trilha.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>Trilha dos Valores</h3>
            {trilha.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: t.concluida ? C.green : C.t3 }}>{t.concluida ? '\u2713' : '\u25cb'} {t.etapa}</span>
                {t.data_conclusao && <span style={{ color: C.t3 }}>{t.data_conclusao}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Grupos */}
        {grupos.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>Grupos</h3>
            {grupos.map(g => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: !g.saiu_em ? C.green : C.t3 }}>{g.mem_grupos?.nome || 'Grupo'}</span>
                <span style={{ color: C.t3 }}>{g.entrou_em}{g.saiu_em ? ` \u2192 ${g.saiu_em}` : ' (ativo)'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Voluntariado */}
        {voluntariado.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>{'Volunt\u00e1riado'}</h3>
            {voluntariado.map(v => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: !v.ate ? C.green : C.t3 }}>{v.mem_ministerios?.nome || v.papel || 'Ativo'}</span>
                <span style={{ color: C.t3 }}>{v.desde}{v.ate ? ` \u2192 ${v.ate}` : ' (ativo)'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Contribuicoes */}
        {contribuicoes.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: C.text }}>{'Contribui\u00e7\u00f5es recentes'}</h3>
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
