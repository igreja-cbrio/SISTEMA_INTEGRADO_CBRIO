// ============================================================================
// /painel-kpis - Visao consolidada institucional dos KPIs
//
// 4 abas:
//   1. Visao Geral: contadores + saude por area
//   2. Por Area: drill-down clicando numa area
//   3. OKRs / Jornada: Mandala dos 5 valores + KPIs is_okr=true
//   4. Pendencias: lista de KPIs atrasados/pendentes agrupados por area
//
// Read-only para todos. Admin/diretor pode editar via botoes.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKpis } from '../hooks/useKpis';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import { kpis as kpisApi } from '../api';
import MandalaCultura from '../components/cultura/MandalaCultura';
import { Activity, BarChart3, Layers, AlertCircle, Heart, ChevronRight, CheckCircle2, Clock, ArrowLeft } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98120',
  amber: '#f59e0b', amberBg: '#f59e0b20',
  red: '#ef4444', redBg: '#ef444420',
};

const VALORES = [
  { key: 'seguir', label: 'Seguir Jesus', cor: '#8b5cf6' },
  { key: 'conectar', label: 'Conectar', cor: '#3b82f6' },
  { key: 'investir', label: 'Investir Tempo', cor: '#f59e0b' },
  { key: 'servir', label: 'Servir', cor: '#10b981' },
  { key: 'generosidade', label: 'Generosidade', cor: '#ec4899' },
];

const TABS = [
  { key: 'geral', label: 'Visão geral', Icon: BarChart3 },
  { key: 'por_area', label: 'Por área', Icon: Layers },
  { key: 'okrs', label: 'OKRs e Jornada', Icon: Heart },
  { key: 'pendencias', label: 'Pendências', Icon: AlertCircle },
];

function periodKey(periodicidade, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'mensal': return `${y}-${m}`;
    case 'trimestral': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'semestral': return `${y}-S${date.getUTCMonth() < 6 ? 1 : 2}`;
    case 'anual': return `${y}`;
    default: return `${y}-${m}`;
  }
}

export default function PainelKpis() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('geral');
  const { kpis, isLoading } = useKpis();
  const { kpiAreas, isAdmin } = useMyKpiAreas();
  const [areasSaude, setAreasSaude] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [areaSelecionada, setAreaSelecionada] = useState(null);

  useEffect(() => {
    kpisApi.v2.areas().then(setAreasSaude).catch(() => setAreasSaude([]));
  }, []);

  // Carrega ultimos registros (filtrando ativos) — para calcular pendencias
  useEffect(() => {
    if (!kpis.length) return;
    kpisApi.v2.registros.list().then(setRegistros).catch(() => setRegistros([]));
  }, [kpis.length]);

  const ultimoPorIndicador = useMemo(() => {
    const m = {};
    for (const r of registros) {
      const cur = m[r.indicador_id];
      if (!cur || (r.data_preenchimento || '') > (cur.data_preenchimento || '')) {
        m[r.indicador_id] = r;
      }
    }
    return m;
  }, [registros]);

  function statusKpi(kpi) {
    const reg = ultimoPorIndicador[kpi.id];
    const periodoEsperado = periodKey(kpi.periodicidade);
    if (!reg) return 'pendente';
    if (reg.periodo_referencia === periodoEsperado) return 'em_dia';
    return 'atrasado';
  }

  const stats = useMemo(() => {
    const ativos = kpis.filter(k => k.ativo);
    let em_dia = 0, atrasado = 0, pendente = 0;
    ativos.forEach(k => {
      const s = statusKpi(k);
      if (s === 'em_dia') em_dia++;
      else if (s === 'atrasado') atrasado++;
      else pendente++;
    });
    return { total: ativos.length, em_dia, atrasado, pendente };
  }, [kpis, ultimoPorIndicador]);

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando painel...</div>;
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={22} style={{ color: C.primary }} /> Painel de KPIs
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Visão consolidada de toda a igreja — cross-área, OKRs e Jornada.
          Para preencher os KPIs da sua área, vá em <a onClick={() => navigate('/meus-kpis')} style={{ color: C.primary, fontWeight: 600, cursor: 'pointer' }}>Meus KPIs</a>.
        </p>
      </div>

      {/* KPI cards do topo (sempre visiveis) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total ativos" value={stats.total} cor={C.primary} />
        <StatCard label="Em dia" value={stats.em_dia} cor={C.green} />
        <StatCard label="Atrasados" value={stats.atrasado} cor={C.amber} />
        <StatCard label="Pendentes" value={stats.pendente} cor={C.red} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const ativo = tab === t.key;
          const Icon = t.Icon;
          return (
            <button key={t.key} onClick={() => { setTab(t.key); setAreaSelecionada(null); }} style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: ativo ? 700 : 500,
              color: ativo ? C.primary : C.t3,
              borderBottom: ativo ? `2px solid ${C.primary}` : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'geral' && (
        <AbaGeral kpis={kpis} areasSaude={areasSaude} onAbrirArea={(a) => { setAreaSelecionada(a); setTab('por_area'); }} />
      )}
      {tab === 'por_area' && (
        <AbaPorArea
          kpis={kpis}
          areasSaude={areasSaude}
          areaSelecionada={areaSelecionada}
          onSelecionar={setAreaSelecionada}
          ultimoPorIndicador={ultimoPorIndicador}
          statusKpi={statusKpi}
        />
      )}
      {tab === 'okrs' && (
        <AbaOkrsJornada kpis={kpis} statusKpi={statusKpi} />
      )}
      {tab === 'pendencias' && (
        <AbaPendencias kpis={kpis} statusKpi={statusKpi} ultimoPorIndicador={ultimoPorIndicador} kpiAreas={kpiAreas} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function StatCard({ label, value, cor }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: cor }}>{value}</div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── ABA 1: VISÃO GERAL ──
function AbaGeral({ kpis, areasSaude, onAbrirArea }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 0, marginBottom: 12 }}>
        Saúde por área ({areasSaude.length})
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {areasSaude.map(a => {
          const verde = a.verde || 0;
          const vermelho = a.vermelho || 0;
          const pendente = a.pendente || 0;
          const pct = a.total > 0 ? Math.round((verde / a.total) * 100) : 0;
          const corBarra = pct >= 70 ? C.green : pct >= 40 ? C.amber : C.red;
          return (
            <button
              key={a.area}
              onClick={() => onAbrirArea(a.area)}
              style={{
                background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`,
                textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{a.area}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: corBarra }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: corBarra, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.t3 }}>
                <span><strong style={{ color: C.green }}>{verde}</strong> em dia</span>
                <span><strong style={{ color: C.amber }}>{vermelho}</strong> atrasado</span>
                <span><strong style={{ color: C.red }}>{pendente}</strong> pendente</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── ABA 2: POR ÁREA ──
function AbaPorArea({ kpis, areasSaude, areaSelecionada, onSelecionar, ultimoPorIndicador, statusKpi }) {
  if (!areaSelecionada) {
    return (
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 0, marginBottom: 12 }}>
          Selecione uma área para ver detalhes
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {areasSaude.map(a => (
            <button key={a.area} onClick={() => onSelecionar(a.area)} style={{
              background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}`,
              textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{a.area}</div>
                <div style={{ fontSize: 11, color: C.t3 }}>{a.total} indicadores</div>
              </div>
              <ChevronRight size={16} style={{ color: C.t3 }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const kpisDaArea = kpis.filter(k => k.ativo && String(k.area_db || k.area).toLowerCase() === String(areaSelecionada).toLowerCase());

  return (
    <div>
      <button onClick={() => onSelecionar(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
        <ArrowLeft size={14} /> Voltar para áreas
      </button>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, marginBottom: 12, textTransform: 'capitalize' }}>{areaSelecionada} ({kpisDaArea.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {kpisDaArea.map(k => {
          const reg = ultimoPorIndicador[k.id];
          const s = statusKpi(k);
          const cor = s === 'em_dia' ? C.green : s === 'atrasado' ? C.amber : C.red;
          const Icon = s === 'em_dia' ? CheckCircle2 : s === 'atrasado' ? Clock : AlertCircle;
          return (
            <div key={k.id} style={{ background: C.card, borderRadius: 10, padding: 12, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon size={18} style={{ color: cor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  <span style={{ fontSize: 10, color: C.t3, fontWeight: 600, marginRight: 6 }}>{k.id}</span>{k.indicador}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                  {k.meta_descricao && <>Meta: <strong>{k.meta_descricao}{k.unidade ? ` ${k.unidade}` : ''}</strong></>}
                  {reg && <> · Último: <strong>{reg.valor_realizado ?? reg.valor_texto ?? '—'}</strong> ({reg.periodo_referencia})</>}
                </div>
              </div>
              <span style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', fontWeight: 600 }}>{k.periodicidade}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ABA 3: OKRs / JORNADA ──
function AbaOkrsJornada({ kpis, statusKpi }) {
  const okrs = useMemo(() => kpis.filter(k => k.ativo && k.is_okr), [kpis]);
  const okrsPorValor = useMemo(() => {
    const m = { seguir: [], conectar: [], investir: [], servir: [], generosidade: [] };
    okrs.forEach(k => (k.valores || []).forEach(v => {
      if (m[v]) m[v].push(k);
    }));
    return m;
  }, [okrs]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <MandalaCultura />
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 0, marginBottom: 12 }}>
        OKRs por valor da Jornada
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {VALORES.map(v => {
          const lista = okrsPorValor[v.key] || [];
          return (
            <div key={v.key} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: v.cor }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{v.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3 }}>{lista.length} OKR{lista.length === 1 ? '' : 's'}</span>
              </div>
              {lista.length === 0 ? (
                <div style={{ fontSize: 11, color: C.t3, fontStyle: 'italic' }}>Nenhum OKR vinculado a este valor.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lista.map(k => {
                    const s = statusKpi(k);
                    const cor = s === 'em_dia' ? C.green : s === 'atrasado' ? C.amber : C.red;
                    return (
                      <div key={k.id} style={{ fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: C.t3, fontWeight: 600 }}>{k.id}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.indicador}</span>
                        <span style={{ fontSize: 10, color: C.t3, textTransform: 'capitalize' }}>{k.area}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ABA 4: PENDÊNCIAS ──
function AbaPendencias({ kpis, statusKpi, ultimoPorIndicador, kpiAreas, isAdmin }) {
  const navigate = useNavigate();
  const pendentes = useMemo(() => {
    return kpis
      .filter(k => k.ativo && statusKpi(k) !== 'em_dia')
      .map(k => ({ ...k, _status: statusKpi(k), _ultimo: ultimoPorIndicador[k.id] }));
  }, [kpis, ultimoPorIndicador]);

  const porArea = useMemo(() => {
    const m = {};
    pendentes.forEach(k => {
      const a = String(k.area_db || k.area || 'Sem área').toLowerCase();
      if (!m[a]) m[a] = [];
      m[a].push(k);
    });
    return m;
  }, [pendentes]);

  if (pendentes.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: C.t3, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
        <CheckCircle2 size={28} style={{ color: C.green, marginBottom: 10 }} />
        <div>Todos os KPIs ativos estão em dia. Tudo certo!</div>
      </div>
    );
  }

  const ordemArea = Object.keys(porArea).sort((a, b) => porArea[b].length - porArea[a].length);

  return (
    <div>
      <p style={{ fontSize: 12, color: C.t3, marginTop: 0, marginBottom: 14 }}>
        {pendentes.length} indicador(es) precisam de atualização — agrupados pela área responsável.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ordemArea.map(area => {
          const lista = porArea[area];
          const minha = isAdmin || kpiAreas.includes(area);
          return (
            <div key={area} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${minha ? C.primary : C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{area}</span>
                <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: C.redBg, color: C.red, fontWeight: 600 }}>{lista.length} pendente{lista.length === 1 ? '' : 's'}</span>
                {minha && (
                  <button onClick={() => navigate('/meus-kpis')} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.primary}`, background: 'transparent', color: C.primary, fontWeight: 600, cursor: 'pointer' }}>
                    Preencher em "Meus KPIs"
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {lista.map(k => (
                  <div key={k.id} style={{ fontSize: 12, color: C.t2, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: k._status === 'atrasado' ? C.amberBg : C.redBg, color: k._status === 'atrasado' ? C.amber : C.red, fontWeight: 600 }}>
                      {k._status === 'atrasado' ? 'Atrasado' : 'Pendente'}
                    </span>
                    <span style={{ fontSize: 10, color: C.t3, fontWeight: 600 }}>{k.id}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{k.indicador}</span>
                    <span style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase' }}>{k.periodicidade}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
