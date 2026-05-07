// ============================================================================
// /painel — Painel central da CBRio (substitui /painel-kpis e /admin/cultura)
//
// Estrutura final (em construcao por sub-PRs):
//   1. NSM no topo (este sub-PR)
//   2. Carrossel de 6 mandalas (proximo sub-PR)
//   3. Matriz colorida 6×5 + modal drilldown (proximo sub-PR)
//   4. 3 alertas criticos (proximo sub-PR)
//
// Diretoria + todos os autenticados leem. Admin/diretor pode forcar
// recalculo da NSM via botao no header.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { nsm as nsmApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Activity, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import CarrosselMandalas from '../components/painel/CarrosselMandalas';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#00897B',
  green: '#10b981', greenBg: '#10b98120',
  amber: '#f59e0b', amberBg: '#f59e0b20',
  red: '#ef4444', redBg: '#ef444420',
  gray: '#6b7280', grayBg: '#6b728020',
};

const STATUS_COLORS = {
  verde:    { cor: C.green, bg: C.greenBg, label: 'No alvo' },
  amarelo:  { cor: C.amber, bg: C.amberBg, label: 'Atencao' },
  vermelho: { cor: C.red,   bg: C.redBg,   label: 'Critico' },
  sem_dado: { cor: C.gray,  bg: C.grayBg,  label: 'Sem dado' },
};

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(1)}%`;
}

function fmtDelta(n) {
  if (n === null || n === undefined || n === 0) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(1)}pp`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `ha ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `ha ${diffH}h`;
  return d.toLocaleDateString('pt-BR');
}

export default function Painel() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);
  const [segmentos, setSegmentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculando, setRecalculando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await nsmApi.painel();
      setSegmentos(data || []);
    } catch (e) {
      console.error('[painel]', e);
      toast.error('Erro ao carregar NSM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleRecalcular = async () => {
    setRecalculando(true);
    try {
      await nsmApi.recalcular();
      await carregar();
      toast.success('NSM recalculada');
    } catch (e) {
      toast.error(e?.message || 'Erro ao recalcular');
    } finally {
      setRecalculando(false);
    }
  };

  const central = segmentos.find(s => s.segmento === 'central');
  const segmentados = segmentos.filter(s => s.segmento !== 'central');
  const ultimaAtualizacao = segmentos[0]?.atualizado_em;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={24} style={{ color: C.primary }} /> Painel CBRio
          </h1>
          <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
            North Star Metric · 5 valores · 6 areas · cascata automatica
            {ultimaAtualizacao && (
              <span style={{ marginLeft: 8, color: C.t3 }}>· atualizado {timeAgo(ultimaAtualizacao)}</span>
            )}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleRecalcular}
            disabled={recalculando}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: recalculando ? 'not-allowed' : 'pointer',
              background: 'transparent', color: C.t2, border: `1px solid ${C.border}`,
              display: 'inline-flex', alignItems: 'center', gap: 6, opacity: recalculando ? 0.5 : 1,
            }}
            title="Forcar recalculo da NSM"
          >
            <RefreshCw size={14} style={{ animation: recalculando ? 'spin 1s linear infinite' : 'none' }} />
            {recalculando ? 'Recalculando...' : 'Recalcular NSM'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando painel...</div>
      ) : (
        <>
          {/* NSM CENTRAL — destaque */}
          {central && <NsmCentralCard data={central} />}

          {/* NSM SEGMENTADAS */}
          {segmentados.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Segmentos
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {segmentados.map(s => <NsmSegmentoCard key={s.segmento} data={s} />)}
              </div>
            </div>
          )}

          {/* Carrossel de Mandalas (Fase 2B) */}
          <div style={{ marginTop: 24 }}>
            <CarrosselMandalas />
          </div>

          {/* Placeholder pros proximos sub-PRs */}
          <div style={{ marginTop: 24, padding: 20, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}`, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
              Matriz colorida e alertas criticos serao adicionados nos proximos sub-PRs (2C, 2D).
            </p>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ----------------------------------------------------------------------------
// NSM Central — card grande no topo
// ----------------------------------------------------------------------------
function NsmCentralCard({ data }) {
  const status = STATUS_COLORS[data.status] || STATUS_COLORS.sem_dado;
  const semDado = data.status === 'sem_dado';
  const pct = data.percentual || 0;
  const meta = data.meta_percentual || 50;
  const barraPct = Math.min((pct / meta) * 100, 100);
  const delta = fmtDelta(data.delta_vs_mes_anterior);
  const DeltaIcon = data.delta_vs_mes_anterior > 0 ? TrendingUp
                  : data.delta_vs_mes_anterior < 0 ? TrendingDown : Minus;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.primary}10 0%, ${C.primary}05 100%)`,
      border: `1px solid ${C.primary}30`,
      borderRadius: 16,
      padding: 28,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.primaryDark, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
            North Star Metric · {data.segmento_label}
          </div>
          <div style={{ fontSize: 14, color: C.t2, marginBottom: 12, lineHeight: 1.5, maxWidth: 600 }}>
            Novos convertidos engajados em pelo menos um dos 5 valores em ate 60 dias da decisao
          </div>
          {semDado ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.gray, lineHeight: 1 }}>—</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
                Aguardando integracao das fontes de dados (triggers da Fase 1.5)
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 52, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                  {fmtPct(data.percentual)}
                </span>
                <span style={{ fontSize: 14, color: C.t3 }}>
                  <strong style={{ color: C.text }}>{data.engajados_em_60d}</strong> de {data.total_convertidos_periodo} convertidos engajados
                </span>
                {delta && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 99,
                    background: data.delta_vs_mes_anterior > 0 ? C.greenBg : data.delta_vs_mes_anterior < 0 ? C.redBg : C.grayBg,
                    color: data.delta_vs_mes_anterior > 0 ? C.green : data.delta_vs_mes_anterior < 0 ? C.red : C.gray,
                    fontSize: 11, fontWeight: 700,
                  }}>
                    <DeltaIcon size={12} /> {delta} vs periodo anterior
                  </span>
                )}
              </div>
              <div style={{ marginTop: 16, height: 8, background: '#fff', borderRadius: 99, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                <div style={{ width: `${barraPct}%`, height: '100%', background: status.cor, transition: 'width 0.4s' }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: C.t3 }}>Meta: {fmtPct(meta)}</div>
            </>
          )}
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: 99,
          background: status.bg, color: status.cor,
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {status.label}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// NSM Segmento — cards menores (CBRio Sede / Online / CBA)
// ----------------------------------------------------------------------------
function NsmSegmentoCard({ data }) {
  const status = STATUS_COLORS[data.status] || STATUS_COLORS.sem_dado;
  const semDado = data.status === 'sem_dado';
  const delta = fmtDelta(data.delta_vs_mes_anterior);
  const DeltaIcon = data.delta_vs_mes_anterior > 0 ? TrendingUp
                  : data.delta_vs_mes_anterior < 0 ? TrendingDown : Minus;

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: 16,
      border: `1px solid ${C.border}`,
      borderTop: `3px solid ${status.cor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{data.segmento_label}</span>
        <span style={{
          fontSize: 9, padding: '2px 8px', borderRadius: 99,
          background: status.bg, color: status.cor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {status.label}
        </span>
      </div>
      {semDado ? (
        <div style={{ fontSize: 24, fontWeight: 700, color: C.gray }}>—</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{fmtPct(data.percentual)}</span>
            {delta && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                fontSize: 10, fontWeight: 600,
                color: data.delta_vs_mes_anterior > 0 ? C.green : data.delta_vs_mes_anterior < 0 ? C.red : C.gray,
              }}>
                <DeltaIcon size={10} /> {delta}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            <strong style={{ color: C.t2 }}>{data.engajados_em_60d}</strong> de {data.total_convertidos_periodo} engajados
          </div>
          <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
            Meta: {fmtPct(data.meta_percentual)}
          </div>
        </>
      )}
    </div>
  );
}
