// ============================================================================
// /painel/kpi/:id — Camada 3 do drilldown (Sistema OKR/NSM 2026)
//
// Tela de detalhe de um KPI especifico:
//   - Cabecalho: nome, area, valores, badges
//   - Card de status atual (meta, ultimo valor, % da meta, status)
//   - Mini-grafico de historico (12 periodos)
//   - Trajetoria (lista de checkpoints)
//   - Ultima(s) revisao(oes) OKR (regra de ouro)
//   - Botao "Voltar" para o painel
// ============================================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { painel as painelApi } from '../api';
import { ArrowLeft, CheckCircle2, Clock, TrendingDown, MinusCircle, Activity, AlertCircle } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
};

const STATUS_VISUAL = {
  no_alvo:  { Icon: CheckCircle2, cor: '#10B981', bg: '#10B98118', label: 'No alvo' },
  atras:    { Icon: Clock,        cor: '#F59E0B', bg: '#F59E0B18', label: 'Atras' },
  critico:  { Icon: TrendingDown, cor: '#EF4444', bg: '#EF444418', label: 'Critico' },
  sem_dado: { Icon: MinusCircle,  cor: '#9CA3AF', bg: '#9CA3AF18', label: 'Sem dado' },
};

const VALOR_CORES = {
  seguir:       '#8B5CF6',
  conectar:     '#3B82F6',
  investir:     '#F59E0B',
  servir:       '#10B981',
  generosidade: '#EC4899',
};
const VALOR_LABELS = {
  seguir:       'Seguir',
  conectar:     'Conectar',
  investir:     'Investir',
  servir:       'Servir',
  generosidade: 'Generosidade',
};

export default function PainelKpi() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    painelApi.kpi(id)
      .then(setData)
      .catch(e => setErro(e?.message || 'Erro ao carregar KPI'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  }

  if (erro || !data) {
    return (
      <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
        <button onClick={() => navigate('/painel')} style={btnVoltar}>
          <ArrowLeft size={14} /> Voltar ao painel
        </button>
        <div style={{ marginTop: 24, padding: 30, textAlign: 'center', color: '#ef4444' }}>
          <AlertCircle size={24} style={{ marginBottom: 8 }} />
          <div>{erro || 'KPI nao encontrado'}</div>
        </div>
      </div>
    );
  }

  const { kpi, lider, trajetoria_atual, checkpoints, historico, revisoes } = data;
  const sKey = trajetoria_atual?.status_trajetoria || 'sem_dado';
  const sv = STATUS_VISUAL[sKey] || STATUS_VISUAL.sem_dado;
  const StatusIcon = sv.Icon;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate('/painel')} style={btnVoltar}>
        <ArrowLeft size={14} /> Voltar ao painel
      </button>

      {/* Header */}
      <div style={{
        marginTop: 16,
        background: C.card, borderRadius: 12,
        border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${sv.cor}`,
        padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 0.5 }}>
                {kpi.id}
              </span>
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 99,
                background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, textTransform: 'capitalize',
              }}>
                {kpi.area}
              </span>
              {kpi.is_okr && (
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 99,
                  background: '#FEF3C7', color: '#B45309', fontWeight: 700,
                }}>
                  OKR
                </span>
              )}
              {(kpi.valores || []).map(v => (
                <span key={v} style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 99,
                  background: VALOR_CORES[v] + '20', color: VALOR_CORES[v], fontWeight: 700,
                }}>
                  {VALOR_LABELS[v] || v}
                </span>
              ))}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>
              {kpi.indicador}
            </h1>
            {kpi.descricao && (
              <p style={{ fontSize: 12, color: C.t3, marginTop: 6, lineHeight: 1.5, maxWidth: 700 }}>
                {kpi.descricao}
              </p>
            )}
          </div>
          <div style={{
            padding: '8px 14px', borderRadius: 99,
            background: sv.bg, color: sv.cor, fontWeight: 700,
            fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <StatusIcon size={14} /> {sv.label}
          </div>
        </div>
      </div>

      {/* Grid 2 colunas: status + grafico */}
      <div style={{
        marginTop: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: 16,
      }}>
        {/* Card status atual */}
        <section style={cardStyle}>
          <h3 style={hh3}>Status atual</h3>
          {trajetoria_atual && trajetoria_atual.ultimo_valor != null ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: C.text }}>
                  {trajetoria_atual.ultimo_valor}
                </span>
                {kpi.unidade && <span style={{ fontSize: 14, color: C.t3 }}>{kpi.unidade}</span>}
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
                Ultimo periodo: <strong>{trajetoria_atual.ultimo_periodo}</strong>
              </div>
              {trajetoria_atual.checkpoint_meta != null && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: C.t3 }}>
                    Meta do periodo: <strong>{trajetoria_atual.checkpoint_meta}{kpi.unidade ? ' ' + kpi.unidade : ''}</strong>
                  </div>
                  {trajetoria_atual.percentual_meta != null && (
                    <div style={{ marginTop: 8, height: 8, background: 'var(--cbrio-input-bg)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(trajetoria_atual.percentual_meta, 150)}%`,
                        height: '100%', background: sv.cor, transition: 'width 0.4s',
                      }} />
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 11, color: sv.cor, fontWeight: 700 }}>
                    {trajetoria_atual.percentual_meta != null ? `${trajetoria_atual.percentual_meta}% da meta` : ''}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12 }}>
              Sem registros ainda. Status: <strong>{sv.label}</strong>
            </div>
          )}

          {kpi.meta_descricao && (
            <div style={{ marginTop: 12, fontSize: 11, color: C.t3 }}>
              <strong style={{ color: C.t2 }}>Meta original:</strong> {kpi.meta_descricao}{kpi.unidade ? ' ' + kpi.unidade : ''}
            </div>
          )}

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.t3 }}>
            <span><strong style={{ color: C.t2 }}>Periodicidade:</strong> {kpi.periodicidade}</span>
            {lider && (
              <div style={{ marginTop: 4 }}>
                <strong style={{ color: C.t2 }}>Lider:</strong> {lider.nome}{lider.cargo ? ` · ${lider.cargo}` : ''}
              </div>
            )}
          </div>
        </section>

        {/* Mini grafico de historico */}
        <section style={cardStyle}>
          <h3 style={hh3}>Historico ({historico?.length || 0} registros)</h3>
          {historico && historico.length > 0 ? (
            <MiniGrafico registros={historico} cor={sv.cor} unidade={kpi.unidade} />
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12 }}>
              Nenhum registro ainda. Quando comecarem a aparecer, o grafico aparece aqui.
            </div>
          )}
        </section>
      </div>

      {/* Trajetoria (checkpoints) */}
      {checkpoints && checkpoints.length > 0 && (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={hh3}>Trajetoria (checkpoints)</h3>
          <p style={{ fontSize: 11, color: C.t3, marginTop: -2, marginBottom: 10 }}>
            Metas intermediarias por periodo. Comparar contra checkpoint do periodo, nao so meta final.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={th}>Periodo</th>
                  <th style={th}>Meta do periodo</th>
                  <th style={th}>Observacao</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.map(c => (
                  <tr key={c.id}>
                    <td style={td}><strong>{c.periodo_referencia}</strong></td>
                    <td style={td}>{c.meta_valor != null ? `${c.meta_valor}${kpi.unidade ? ' ' + kpi.unidade : ''}` : (c.meta_texto || '—')}</td>
                    <td style={{ ...td, color: C.t3 }}>{c.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Revisoes OKR */}
      {kpi.is_okr && (
        <section style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={hh3}>Revisoes (regra de ouro)</h3>
          {!revisoes || revisoes.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12 }}>
              Nenhuma revisao registrada ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {revisoes.map(r => <RevisaoCard key={r.id} revisao={r} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MiniGrafico({ registros, cor, unidade }) {
  if (!registros || registros.length === 0) return null;
  const valores = registros.map(r => Number(r.valor_realizado) || 0);
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const range = max - min || 1;
  const W = 320, H = 100, P = 8;
  const stepX = (W - P * 2) / Math.max(registros.length - 1, 1);

  const points = registros.map((r, i) => {
    const v = Number(r.valor_realizado) || 0;
    const x = P + i * stepX;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    return [x, y, v, r.periodo_referencia];
  });

  const pathLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const pathArea = `${pathLine} L ${points[points.length - 1][0]} ${H - P} L ${points[0][0]} ${H - P} Z`;

  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <path d={pathArea} fill={cor} fillOpacity="0.12" />
        <path d={pathLine} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r="3" fill={cor} />
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--cbrio-text3)', marginTop: 4 }}>
        <span>{registros[0]?.periodo_referencia}</span>
        <span>{registros[registros.length - 1]?.periodo_referencia}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--cbrio-text3)' }}>
        Min: <strong>{min}{unidade ? ' ' + unidade : ''}</strong> · Max: <strong>{max}{unidade ? ' ' + unidade : ''}</strong> · Atual: <strong>{valores[valores.length - 1]}{unidade ? ' ' + unidade : ''}</strong>
      </div>
    </div>
  );
}

function RevisaoCard({ revisao }) {
  const statusCor = {
    aberta: '#F59E0B',
    executada: '#10B981',
    cancelada: '#9CA3AF',
  }[revisao.status_revisao] || '#9CA3AF';

  return (
    <div style={{
      background: 'var(--cbrio-input-bg)',
      borderRadius: 8,
      borderLeft: `3px solid ${statusCor}`,
      padding: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong style={{ fontSize: 12 }}>{revisao.periodo_referencia}</strong>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 99,
            background: statusCor + '20', color: statusCor, fontWeight: 700, textTransform: 'uppercase',
          }}>
            {revisao.status_revisao}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--cbrio-text3)' }}>
          {revisao.data_revisao}
          {revisao.responsavel?.nome && <> · resp.: <strong>{revisao.responsavel.nome}</strong></>}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--cbrio-text2)', lineHeight: 1.5 }}>
        <div><strong>Causa:</strong> {revisao.causa_desvio || '—'}</div>
        <div><strong>Decisao:</strong> {revisao.decisao || '—'}</div>
        {revisao.proximo_passo && (
          <div><strong>Proximo passo:</strong> {revisao.proximo_passo}{revisao.prazo_proximo_passo ? ` (ate ${revisao.prazo_proximo_passo})` : ''}</div>
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: C.card,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  padding: '16px 20px',
};

const hh3 = {
  fontSize: 12, fontWeight: 700, color: C.t3,
  textTransform: 'uppercase', letterSpacing: 0.5,
  margin: 0, marginBottom: 8,
};

const btnVoltar = {
  background: 'transparent', border: `1px solid ${C.border}`,
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  color: C.t2, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const th = {
  textAlign: 'left', padding: 8, fontSize: 10,
  color: 'var(--cbrio-text3)', fontWeight: 700, textTransform: 'uppercase',
  borderBottom: `1px solid ${C.border}`,
};
const td = { padding: 8, borderBottom: `1px solid ${C.border}` };
