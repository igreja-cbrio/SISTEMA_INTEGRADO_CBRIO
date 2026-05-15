// ============================================================================
// KpisPorKR · seção do painel · OKRs > KRs > KPIs com status agregado
//
// Marcos: "uma seção de KPIs por KR · cada KR expande pros KPIs táticos que
//          o alimentam · resolve 'o KR ta 65% porque KPI X ta 80% e Y ta 50%'"
//
// Estrutura:
//   - Cards de OKR (colapsados por default)
//   - Click no card expande pros KRs daquele OKR
//   - Cada KR expande pros KPIs filhos com status
//
// Filtros:
//   - Por valor (Seguir/Conectar/Investir/Servir/Generosidade)
//   - Por status (todos / em alerta / no alvo)
//   - Por tipo (estratégico / operacional)
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, RefreshCw, Target, TrendingUp,
  AlertTriangle, CircleDot, CheckCircle2,
} from 'lucide-react';
import { painel as painelApi } from '../../api';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98120',
  amber: '#f59e0b', amberBg: '#f59e0b20',
  red:   '#ef4444', redBg:   '#ef444420',
  gray:  '#6b7280', grayBg:  '#6b728020',
};

const STATUS_META = {
  verde:    { cor: C.green, bg: C.greenBg, label: 'No alvo',  Icon: CheckCircle2 },
  amarelo:  { cor: C.amber, bg: C.amberBg, label: 'Atenção',  Icon: CircleDot },
  vermelho: { cor: C.red,   bg: C.redBg,   label: 'Crítico',  Icon: AlertTriangle },
  sem_dado: { cor: C.gray,  bg: C.grayBg,  label: 'Sem dado', Icon: CircleDot },
};

const VALOR_LABELS = {
  seguir: 'Seguir', conectar: 'Conectar', investir: 'Investir',
  servir: 'Servir', generosidade: 'Generosidade',
};
const VALOR_CORES = {
  seguir: '#8B5CF6', conectar: '#3B82F6', investir: '#F59E0B',
  servir: '#10B981', generosidade: '#EC4899',
};

const FILTRO_STATUS = [
  { v: 'todos',     l: 'Todos' },
  { v: 'em_alerta', l: 'Em alerta' },
  { v: 'no_alvo',   l: 'No alvo' },
];

export default function KpisPorKR() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [valorFiltro, setValorFiltro] = useState('todos'); // 'todos' | seguir/...
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [tipoFiltro, setTipoFiltro] = useState('todos'); // 'todos' | 'estrategico' | 'operacional'
  const [expandidos, setExpandidos] = useState({}); // okrId -> bool

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.okrsCascata();
      setData(r);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar cascata');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const okrsFiltrados = useMemo(() => {
    if (!data?.okrs) return [];
    return data.okrs.filter(o => {
      if (valorFiltro !== 'todos' && !o.valores.includes(valorFiltro)) return false;
      if (tipoFiltro !== 'todos' && o.tipo_okr !== tipoFiltro) return false;
      if (statusFiltro === 'em_alerta' && !['amarelo', 'vermelho'].includes(o.status)) return false;
      if (statusFiltro === 'no_alvo' && o.status !== 'verde') return false;
      return true;
    });
  }, [data, valorFiltro, statusFiltro, tipoFiltro]);

  const toggle = (id) => setExpandidos(s => ({ ...s, [id]: !s[id] }));

  return (
    <section style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={16} style={{ color: C.primary }} />
            KPIs por KR
          </h2>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            Cada OKR Geral · KRs que o compõem · KPIs táticos que alimentam cada KR
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          style={{
            padding: '6px 10px', borderRadius: 6, fontSize: 11,
            background: 'transparent', color: C.t3, border: `1px solid ${C.border}`,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Resumo global */}
      {data?.resumo && !loading && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 8, marginBottom: 16,
        }}>
          <MiniStat label="OKRs" valor={data.resumo.total_okrs} cor={C.text} />
          <MiniStat label="KRs"  valor={data.resumo.total_krs}  cor={C.text} />
          <MiniStat label="KPIs no alvo" valor={data.resumo.em_dia}   cor={C.green} />
          <MiniStat label="Em atenção"   valor={data.resumo.atras}    cor={C.amber} />
          <MiniStat label="Críticos"     valor={data.resumo.critico}  cor={C.red} />
          <MiniStat label="Sem dado"     valor={data.resumo.sem_dado} cor={C.gray} />
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {/* Valor */}
        <div style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', padding: 2 }}>
          <FiltroBtn ativo={valorFiltro === 'todos'} onClick={() => setValorFiltro('todos')} cor={C.primary}>Todos</FiltroBtn>
          {Object.keys(VALOR_LABELS).map(v => (
            <FiltroBtn
              key={v}
              ativo={valorFiltro === v}
              onClick={() => setValorFiltro(v)}
              cor={VALOR_CORES[v]}
            >
              {VALOR_LABELS[v]}
            </FiltroBtn>
          ))}
        </div>
        {/* Status */}
        <div style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', padding: 2 }}>
          {FILTRO_STATUS.map(s => (
            <FiltroBtn key={s.v} ativo={statusFiltro === s.v} onClick={() => setStatusFiltro(s.v)} cor={C.primary}>
              {s.l}
            </FiltroBtn>
          ))}
        </div>
        {/* Tipo */}
        <div style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', padding: 2 }}>
          <FiltroBtn ativo={tipoFiltro === 'todos'} onClick={() => setTipoFiltro('todos')} cor={C.primary}>Todos tipos</FiltroBtn>
          <FiltroBtn ativo={tipoFiltro === 'estrategico'} onClick={() => setTipoFiltro('estrategico')} cor={C.primary}>Estratégico</FiltroBtn>
          <FiltroBtn ativo={tipoFiltro === 'operacional'} onClick={() => setTipoFiltro('operacional')} cor={C.primary}>Operacional</FiltroBtn>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Carregando OKRs e KRs...
        </div>
      ) : erro ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
          {erro}
          <div style={{ marginTop: 12 }}>
            <button onClick={carregar} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : okrsFiltrados.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Nenhum OKR bate com esses filtros.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {okrsFiltrados.map(okr => (
            <CardOkr
              key={okr.id}
              okr={okr}
              expandido={!!expandidos[okr.id]}
              onToggle={() => toggle(okr.id)}
              onKpiClick={(kpiId) => navigate(`/painel/kpi/${encodeURIComponent(kpiId)}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Card de OKR (colapsavel)
// ----------------------------------------------------------------------------
function CardOkr({ okr, expandido, onToggle, onKpiClick }) {
  const status = STATUS_META[okr.status] || STATUS_META.sem_dado;
  const StatusIcon = status.Icon;
  const semKpi = okr.total_kpis === 0;
  const pct = okr.total_kpis > 0 ? Math.round((okr.em_dia / okr.total_kpis) * 100) : 0;
  const ChevIcon = expandido ? ChevronDown : ChevronRight;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: 'var(--cbrio-input-bg)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        }}
      >
        <ChevIcon size={16} style={{ color: C.t3, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{okr.nome}</span>
            {okr.tipo_okr === 'operacional' && (
              <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: C.grayBg, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                operacional
              </span>
            )}
            {okr.valores.map(v => (
              <span key={v} style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: `${VALOR_CORES[v]}20`, color: VALOR_CORES[v], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {VALOR_LABELS[v] || v}
              </span>
            ))}
          </div>
          {!semKpi && (
            <div style={{ display: 'flex', gap: 14, marginTop: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: C.t3 }}>
              <span><strong style={{ color: C.text }}>{okr.total_krs}</strong> KRs</span>
              <span><strong style={{ color: C.text }}>{okr.total_kpis}</strong> KPIs</span>
              <span style={{ color: C.green }}><strong>{okr.em_dia}</strong> no alvo</span>
              {okr.atras > 0   && <span style={{ color: C.amber }}><strong>{okr.atras}</strong> atenção</span>}
              {okr.critico > 0 && <span style={{ color: C.red   }}><strong>{okr.critico}</strong> críticos</span>}
              {okr.sem_dado > 0 && <span style={{ color: C.gray  }}><strong>{okr.sem_dado}</strong> sem dado</span>}
            </div>
          )}
        </div>
        {!semKpi && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: status.cor, minWidth: 48, textAlign: 'right' }}>
              {pct}%
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
              background: status.bg, color: status.cor, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              <StatusIcon size={11} /> {status.label}
            </span>
          </div>
        )}
        {semKpi && (
          <span style={{ fontSize: 10, color: C.t3, fontStyle: 'italic' }}>sem KPIs vinculados</span>
        )}
      </button>

      {expandido && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: C.card, padding: '8px 10px 12px 10px' }}>
          {okr.descricao && (
            <p style={{ fontSize: 12, color: C.t2, margin: '4px 4px 12px 4px', fontStyle: 'italic', lineHeight: 1.5 }}>
              {okr.descricao}
            </p>
          )}
          {okr.krs.length === 0 && okr.kpis_orfaos.length === 0 ? (
            <p style={{ fontSize: 12, color: C.t3, padding: 8 }}>Nenhum KR cadastrado · vincule KRs e KPIs no /gestao</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {okr.krs.map(kr => <RowKR key={kr.id} kr={kr} onKpiClick={onKpiClick} />)}
              {okr.kpis_orfaos.length > 0 && (
                <RowKR
                  kr={{
                    id: '_orfaos',
                    titulo: 'KPIs ligados direto ao OKR (sem KR)',
                    kpis: okr.kpis_orfaos,
                    total_kpis: okr.kpis_orfaos.length,
                    em_dia: okr.kpis_orfaos.filter(k => k.status === 'verde').length,
                    atras: okr.kpis_orfaos.filter(k => k.status === 'amarelo').length,
                    critico: okr.kpis_orfaos.filter(k => k.status === 'vermelho').length,
                    status: 'sem_dado',
                  }}
                  onKpiClick={onKpiClick}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Row de KR (expansivel · mostra KPIs filhos)
// ----------------------------------------------------------------------------
function RowKR({ kr, onKpiClick }) {
  const [aberto, setAberto] = useState(false);
  const status = STATUS_META[kr.status] || STATUS_META.sem_dado;
  const ChevIcon = aberto ? ChevronDown : ChevronRight;
  const pct = kr.total_kpis > 0 ? Math.round((kr.em_dia / kr.total_kpis) * 100) : 0;

  return (
    <div style={{ borderLeft: `3px solid ${status.cor}`, paddingLeft: 8 }}>
      <button
        onClick={() => setAberto(s => !s)}
        style={{
          width: '100%', padding: '6px 4px', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
        }}
      >
        <ChevIcon size={12} style={{ color: C.t3, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{kr.titulo}</span>
        {kr.meta_valor !== null && kr.meta_valor !== undefined && (
          <span style={{ fontSize: 10, color: C.t3, whiteSpace: 'nowrap' }}>
            Meta: <strong style={{ color: C.t2 }}>{kr.meta_valor}{kr.unidade ? ' ' + kr.unidade : ''}</strong>
          </span>
        )}
        {kr.total_kpis > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
            background: status.bg, color: status.cor, whiteSpace: 'nowrap',
          }}>
            {kr.em_dia}/{kr.total_kpis} · {pct}%
          </span>
        )}
      </button>

      {aberto && kr.kpis.length > 0 && (
        <div style={{ marginLeft: 16, marginTop: 4, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {kr.kpis.map(kpi => <RowKpi key={kpi.id} kpi={kpi} onClick={() => onKpiClick(kpi.id)} />)}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Row de KPI · final da cascata
// ----------------------------------------------------------------------------
function RowKpi({ kpi, onClick }) {
  const status = STATUS_META[kpi.status] || STATUS_META.sem_dado;

  return (
    <button
      onClick={onClick}
      title="Abrir detalhe do KPI"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '5px 8px', border: 'none', background: 'transparent', cursor: 'pointer',
        borderRadius: 6, textAlign: 'left',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--cbrio-input-bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.cor, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, minWidth: 56 }}>
        {String(kpi.id).toUpperCase()}
      </span>
      <span style={{ flex: 1, fontSize: 11, color: C.t2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {kpi.indicador}
      </span>
      {kpi.area_kr && (
        <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: C.grayBg, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {kpi.area_kr}
        </span>
      )}
      <span style={{ fontSize: 10, color: C.t3, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>
        {kpi.valor_atual !== null && kpi.valor_atual !== undefined
          ? <><strong style={{ color: C.text }}>{fmtNumber(kpi.valor_atual)}</strong>{kpi.meta_valor ? ` / ${fmtNumber(kpi.meta_valor)}` : ''}</>
          : <span style={{ fontStyle: 'italic' }}>sem dado</span>
        }
      </span>
      <TrendingUp size={12} style={{ color: C.t3, flexShrink: 0 }} />
    </button>
  );
}

function MiniStat({ label, valor, cor }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
      background: 'var(--cbrio-input-bg)',
    }}>
      <div style={{ fontSize: 9, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

function FiltroBtn({ ativo, onClick, cor, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px', fontSize: 11, fontWeight: ativo ? 700 : 500,
        borderRadius: 6, border: 'none', cursor: 'pointer',
        background: ativo ? cor : 'transparent',
        color: ativo ? '#fff' : C.t2,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function fmtNumber(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (Number.isInteger(num)) return num.toLocaleString('pt-BR');
  return num.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
