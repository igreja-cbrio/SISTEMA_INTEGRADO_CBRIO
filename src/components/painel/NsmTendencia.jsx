// ============================================================================
// NsmTendencia · gráfico de tendência mensal do NSM (acima das mandalas).
// Cada barra = dos convertidos que decidiram naquele mês, % que engajaram em
// ≥1 valor da jornada (janela de 60 dias). Coorte por mês de conversão.
// Latente de propósito: meses recentes ainda em formação aparecem baixos, sem
// aviso — é o número honesto que incentiva a adesão ao sistema.
// ============================================================================
import { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { painel as painelApi } from '../../api';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesLabel = (m) => {
  if (!m || !m.includes('-')) return m || '';
  const [y, mo] = m.split('-');
  return `${MESES[Number(mo) - 1] || mo}/${String(y).slice(2)}`;
};

function NsmTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: C.text }}>{mesLabel(d.mes)}</div>
      <div style={{ color: C.t2 }}>{d.engajados}/{d.convertidos} engajados</div>
      <div style={{ color: C.primary, fontWeight: 700 }}>{d.pct}%</div>
    </div>
  );
}

export default function NsmTendencia() {
  const [serie, setSerie] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    painelApi.nsmSerie(12)
      .then((r) => { if (vivo) setSerie(Array.isArray(r?.serie) ? r.serie : []); })
      .catch(() => { if (vivo) setSerie([]); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  if (loading || !serie || !serie.length) return null;

  return (
    <div style={{ background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', border: '1px solid var(--hairline)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow), var(--hi)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TrendingUp size={16} style={{ color: C.primary }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>
          NSM · engajamento dos novos convertidos por mês
        </h3>
      </div>
      <p style={{ fontSize: 11.5, color: C.t3, margin: '0 0 12px' }}>
        % dos convertidos de cada mês que engajaram em ≥1 valor da jornada (janela de 60 dias).
      </p>
      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <BarChart data={serie} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="mes" tickFormatter={mesLabel} tick={{ fontSize: 11, fill: C.t3 }} axisLine={false} tickLine={false} />
            <YAxis unit="%" tick={{ fontSize: 11, fill: C.t3 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<NsmTooltip />} cursor={{ fill: 'var(--cbrio-overlay)', opacity: 0.3 }} />
            <Bar dataKey="pct" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
