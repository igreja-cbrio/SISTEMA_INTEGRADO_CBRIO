// ============================================================================
// MeusKpisResumo - card pequeno na home redirecionando para /meus-kpis
//
// Substitui MinhaSemanaPendente. A nova arquitetura concentra todo o
// preenchimento em /meus-kpis — Dashboard so mostra o resumo e linka.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKpis } from '../hooks/useKpis';
import { useMyKpiAreas } from '../hooks/useMyKpiAreas';
import { kpis as kpisApi } from '../api';
import { Activity, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b',
};

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

export default function MeusKpisResumo() {
  const navigate = useNavigate();
  const { kpis } = useKpis();
  const { kpiAreas, isAdmin } = useMyKpiAreas();
  const [registros, setRegistros] = useState([]);

  const meus = useMemo(() => {
    if (isAdmin) return kpis.filter(k => k.ativo);
    if (kpiAreas.length === 0) return [];
    return kpis.filter(k => k.ativo && kpiAreas.includes(String(k.area_db || '').toLowerCase()));
  }, [kpis, kpiAreas, isAdmin]);

  useEffect(() => {
    if (!meus.length) { setRegistros([]); return; }
    const areas = Array.from(new Set(meus.map(k => k.area_db).filter(Boolean)));
    Promise.all(areas.map(a => kpisApi.v2.registros.list({ area: a })))
      .then(arrs => setRegistros(arrs.flat()))
      .catch(() => setRegistros([]));
  }, [meus]);

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

  const stats = useMemo(() => {
    let em_dia = 0, atrasado = 0, pendente = 0;
    meus.forEach(k => {
      const reg = ultimoPorIndicador[k.id];
      const periodoEsperado = periodKey(k.periodicidade);
      if (!reg) pendente++;
      else if (reg.periodo_referencia === periodoEsperado) em_dia++;
      else atrasado++;
    });
    return { total: meus.length, em_dia, atrasado, pendente, faltam: atrasado + pendente };
  }, [meus, ultimoPorIndicador]);

  // Sem area atribuida e nao admin: nao mostra o card
  if (!isAdmin && kpiAreas.length === 0) return null;

  const tudoEmDia = stats.faltam === 0 && stats.total > 0;

  return (
    <div
      onClick={() => navigate('/minha-area')}
      style={{
        background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${tudoEmDia ? C.green : (stats.faltam > 0 ? C.amber : C.border)}`,
        cursor: 'pointer', transition: 'transform 0.1s, border-color 0.15s',
        display: 'flex', alignItems: 'center', gap: 14,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.primary}
      onMouseLeave={e => e.currentTarget.style.borderColor = tudoEmDia ? C.green : (stats.faltam > 0 ? C.amber : C.border)}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {tudoEmDia ? <CheckCircle2 size={22} style={{ color: C.green }} /> : <Activity size={22} style={{ color: C.primary }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          {isAdmin ? 'Indicadores institucionais' : 'KPIs da minha área'}
        </div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
          {stats.total === 0
            ? 'Nenhum KPI ativo nas suas áreas.'
            : tudoEmDia
              ? `Tudo em dia (${stats.total} indicador${stats.total === 1 ? '' : 'es'}).`
              : (
                <>
                  <strong style={{ color: C.red }}>{stats.faltam}</strong> precisa{stats.faltam === 1 ? '' : 'm'} de atualização
                  {stats.atrasado > 0 && <> · <span style={{ color: C.amber }}>{stats.atrasado} atrasado{stats.atrasado === 1 ? '' : 's'}</span></>}
                  {stats.pendente > 0 && <> · <span style={{ color: C.red }}>{stats.pendente} sem registro</span></>}
                </>
              )
          }
        </div>
      </div>

      {!tudoEmDia && stats.faltam > 0 && (
        <span style={{
          padding: '4px 10px', borderRadius: 99, background: C.amber + '20', color: C.amber,
          fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <AlertCircle size={12} /> {stats.faltam}
        </span>
      )}

      <ChevronRight size={18} style={{ color: C.t3, flexShrink: 0 }} />
    </div>
  );
}
