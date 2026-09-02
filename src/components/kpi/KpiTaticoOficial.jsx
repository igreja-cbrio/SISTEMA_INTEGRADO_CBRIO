import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
// ⚠️ A unidade do KPI já vem do banco ('R$', '%', 'nota', 'pessoas'…). A régua
// escreve o valor conforme ela — antes só '%' era tratado, e R$ 871.406
// aparecia como "871406". Ver src/lib/formatoKpi.ts.
import { formatarValorKpi, formatarMetaKpi } from '@/lib/formatoKpi';

// Bloco reusável "KPI tático oficial" — mostra kpi_indicadores_taticos +
// vw_kpi_trajetoria_atual de UMA área, no mesmo padrão de backend/routes/painelArea.js.
// Rotulado explicitamente diferente de qualquer número operacional da tela onde
// for montado: os dois medem coisas conceitualmente distintas (meta gerencial ×
// número do dia a dia) e podem legitimamente divergir. Ver CLAUDE.md — decisão
// de 2026-08-18 de fechar a lacuna de módulos cujo único lugar de exibição
// desse dado era "Minha Área".
//
// Uso: <KpiTaticoOficial fetchFn={api.kpisTaticos} />
export default function KpiTaticoOficial({ fetchFn, titulo = 'KPI tático oficial' }) {
  const [state, setState] = useState({ loading: true, kpis: [] });

  useEffect(() => {
    if (!fetchFn) return;
    let alive = true;
    fetchFn()
      .then(d => { if (alive) setState({ loading: false, kpis: Array.isArray(d?.kpis) ? d.kpis : [] }); })
      .catch(() => { if (alive) setState({ loading: false, kpis: [], erro: true }); });
    return () => { alive = false; };
  }, [fetchFn]);

  if (state.loading) return null;
  if (state.erro) {
    return (
      <div style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>
        Não foi possível carregar os indicadores táticos.
      </div>
    );
  }
  if (!state.kpis.length) return null;

  const corStatus = (status) => ({
    no_alvo: '#10B981', atrasado: '#F59E0B', critico: '#EF4444',
  }[status] || 'var(--cbrio-text3)');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: 'var(--cbrio-text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarChart3 size={12} />
        <strong style={{ color: 'var(--cbrio-text)' }}>{titulo}</strong> — meta gerencial acompanhada no /gestao e no /painel. Pode divergir do número operacional acima (definições diferentes de propósito).
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {state.kpis.map(k => {
          const t = k.trajetoria;
          const semDado = !t || t.ultimo_valor == null;
          return (
            <div key={k.id} style={{
              flex: '1 1 220px', minWidth: 220, padding: '12px 14px', borderRadius: 12,
              border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-card)',
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{k.indicador}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: semDado ? 'var(--cbrio-text3)' : corStatus(t?.status_trajetoria) }}>
                  {semDado ? '—' : formatarValorKpi(t.ultimo_valor, k.unidade)}
                </span>
                {formatarMetaKpi(k.meta_valor, k.unidade) && (
                  <span style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>{formatarMetaKpi(k.meta_valor, k.unidade)}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--cbrio-text3)', marginTop: 2 }}>
                {semDado ? 'sem dado registrado' : `período ${t.ultimo_periodo || ''}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
