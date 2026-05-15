// ============================================================================
// IndicadoresPrincipais · resumo visual dos indicadores que movem cada valor
//
// Marcos: "use o que move cada area e faca uma tela mais visual"
//   - Seguir:        Frequencia, Decisoes, Batismos
//   - Conectar:      Grupos ativos
//   - Investir:      Devocionais
//   - Servir:        Voluntarios ativos
//   - Generosidade:  Dizimistas, Ofertantes
//
// Grid de 5 cards (1 por valor) · cada card tem 1-3 indicadores com numero
// grande + delta % + sparkline mini dos ultimos 6 meses.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  Users, Heart, Droplet, BookOpen, Hand, Gift, Sparkles,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { painel as painelApi } from '../../api';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
  green: '#10b981', red: '#ef4444', gray: '#6b7280',
};

const ICONES = {
  users: Users, heart: Heart, droplet: Droplet,
  book: BookOpen, hand: Hand, gift: Gift, sparkles: Sparkles,
};

const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const labelMes = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MESES_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
};

function fmtInteiro(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('pt-BR');
}

export default function IndicadoresPrincipais() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.indicadoresPrincipais();
      setData(r);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar indicadores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <section style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} style={{ color: C.primary }} /> Indicadores principais
          </h2>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            O que move cada valor · número do mês atual + tendência dos últimos 6 meses
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

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
      ) : erro ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.red, fontSize: 13 }}>
          {erro}
          <div style={{ marginTop: 12 }}>
            <button onClick={carregar} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {data?.valores.map(v => <CardValor key={v.key} valor={v} />)}
        </div>
      )}
    </section>
  );
}

function CardValor({ valor }) {
  const { label, cor, indicadores } = valor;

  return (
    <div style={{
      background: 'var(--cbrio-input-bg)',
      border: `1px solid ${C.border}`,
      borderTop: `3px solid ${cor}`,
      borderRadius: 12,
      padding: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header do card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
      </div>

      {/* Indicadores · 1, 2 ou 3 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {indicadores.map(ind => <Indicador key={ind.id} ind={ind} cor={cor} />)}
      </div>
    </div>
  );
}

function Indicador({ ind, cor }) {
  const Icon = ICONES[ind.icon] || Sparkles;
  const TrendIcon = ind.delta_pct > 0 ? TrendingUp : ind.delta_pct < 0 ? TrendingDown : Minus;
  const trendColor = ind.delta_pct > 0 ? C.green : ind.delta_pct < 0 ? C.red : C.gray;
  const sparkData = (ind.sparkline || []).map(p => ({
    periodo: p.periodo,
    label: labelMes(p.periodo),
    valor: p.valor,
  }));

  return (
    <div>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={12} style={{ color: cor, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {ind.label}
        </span>
      </div>

      {/* Valor + delta */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1 }}>
          {fmtInteiro(ind.valor_atual)}
        </span>
        {ind.delta_pct !== null && ind.delta_pct !== undefined && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 11, fontWeight: 700, color: trendColor,
          }}>
            <TrendIcon size={12} />
            {ind.delta_pct > 0 ? '+' : ''}{ind.delta_pct.toFixed(1)}%
          </span>
        )}
        <span style={{ fontSize: 10, color: C.t3 }}>
          vs mês anterior
        </span>
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <div style={{ height: 36, marginLeft: -4, marginRight: -4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${ind.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={cor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={cor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: cor, strokeOpacity: 0.3 }}
                contentStyle={{ borderRadius: 6, fontSize: 11, border: `1px solid ${C.border}`, background: C.card, padding: '4px 8px' }}
                labelStyle={{ color: C.t2, fontWeight: 600, fontSize: 10 }}
                formatter={(v) => [fmtInteiro(v), ind.label]}
                labelFormatter={(l) => l}
              />
              <Area
                type="monotone"
                dataKey="valor"
                stroke={cor}
                strokeWidth={2}
                fill={`url(#grad-${ind.id})`}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Total dos 6 meses · menos destaque */}
      <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
        Total 6m: <strong style={{ color: C.t2 }}>{fmtInteiro(ind.total_6m)}</strong>
      </div>
    </div>
  );
}
