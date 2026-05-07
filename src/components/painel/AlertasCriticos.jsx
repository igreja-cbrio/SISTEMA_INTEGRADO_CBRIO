// ============================================================================
// AlertasCriticos — top 3 KPIs em alerta no /painel
//
// Mostra os 3 KPIs mais criticos da igreja (priorizando critico > atras,
// OKR > nao-OKR, menor % da meta primeiro). Click abre modal de drilldown.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../../api';
import { AlertCircle, TrendingDown, Clock, ChevronRight } from 'lucide-react';
import ModalCelula from './ModalCelula';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
};

const STATUS_VISUAL = {
  critico: { Icon: TrendingDown, cor: '#EF4444', bg: '#FEE2E2', label: 'Critico' },
  atras:   { Icon: Clock,        cor: '#F59E0B', bg: '#FEF3C7', label: 'Atras' },
};

export default function AlertasCriticos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [drilldown, setDrilldown] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.alertas({ limit: 3 });
      setData(r);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Carregando alertas...
        </div>
      </section>
    );
  }

  if (erro) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 24, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
          {erro}
        </div>
      </section>
    );
  }

  if (!data || !data.alertas?.length) {
    return (
      <section style={cardStyle}>
        <header style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} style={{ color: '#10B981' }} />
            Alertas criticos
          </h2>
        </header>
        <div style={{
          padding: 24, textAlign: 'center', color: C.t3, fontSize: 13,
          background: '#F0FDF4', borderRadius: 8, border: '1px dashed #BBF7D0',
        }}>
          Nenhum KPI em alerta no momento.
        </div>
      </section>
    );
  }

  return (
    <>
      <section style={cardStyle}>
        <header style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} style={{ color: '#EF4444' }} />
              Alertas criticos
            </h2>
            <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
              Top 3 KPIs · {data.total_criticos} criticos · {data.total_atrasados} atrasados · OKRs priorizados
            </p>
          </div>
          {data.total_em_alerta > 3 && (
            <span style={{
              fontSize: 10, padding: '4px 10px', borderRadius: 99,
              background: '#FEE2E2', color: '#B91C1C', fontWeight: 700,
            }}>
              + {data.total_em_alerta - 3} outros em alerta
            </span>
          )}
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.alertas.map((a, i) => (
            <AlertaItem
              key={a.kpi_id}
              alerta={a}
              ordem={i + 1}
              onClick={() => {
                // Abre modal da celula correspondente (area x primeiro valor)
                if (a.valores?.length > 0) {
                  setDrilldown({ area: String(a.area).toLowerCase(), valor: a.valores[0] });
                }
              }}
            />
          ))}
        </div>
      </section>

      {drilldown && (
        <ModalCelula
          area={drilldown.area}
          valor={drilldown.valor}
          cell={null}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}

function AlertaItem({ alerta, ordem, onClick }) {
  const sv = STATUS_VISUAL[alerta.status] || STATUS_VISUAL.atras;
  const Icon = sv.Icon;

  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${sv.cor}`,
        borderRadius: 8,
        padding: 12,
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--cbrio-input-bg)';
        e.currentTarget.style.borderColor = sv.cor;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.borderLeft = `3px solid ${sv.cor}`;
      }}
    >
      <div style={{
        background: sv.bg, color: sv.cor,
        width: 32, height: 32, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: 1 }}>
            #{ordem}
          </span>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 99,
            background: sv.bg, color: sv.cor, fontWeight: 700,
          }}>
            {sv.label}
          </span>
          {alerta.is_okr && (
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 99,
              background: '#FEF3C7', color: '#B45309', fontWeight: 700,
            }}>
              OKR
            </span>
          )}
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 99,
            background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600,
            textTransform: 'capitalize',
          }}>
            {alerta.area}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 4, lineHeight: 1.35 }}>
          {alerta.indicador}
        </div>
        <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
          {alerta.ultimo_valor != null ? (
            <>
              Ultimo: <strong style={{ color: C.t2 }}>{alerta.ultimo_valor}{alerta.unidade ? ' ' + alerta.unidade : ''}</strong>
              {alerta.ultimo_periodo && <> ({alerta.ultimo_periodo})</>}
              {alerta.meta_descricao && <> · meta {alerta.meta_descricao}</>}
              {alerta.percentual_meta != null && <> · <strong style={{ color: sv.cor }}>{alerta.percentual_meta}%</strong> da meta</>}
            </>
          ) : (
            <>Sem registro · {alerta.periodicidade}</>
          )}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: C.t3, flexShrink: 0 }} />
    </button>
  );
}

const cardStyle = {
  background: C.card,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
};
