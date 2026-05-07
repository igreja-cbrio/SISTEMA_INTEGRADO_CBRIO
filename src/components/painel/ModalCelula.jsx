// ============================================================================
// ModalCelula — modal de drilldown ao clicar uma celula da matriz
//
// Mostra os KPIs da intersecao Area × Valor com:
//   - Indicador, descricao
//   - Status atual da trajetoria
//   - Ultimo valor + periodo
//   - Meta atual (checkpoint)
//   - Lider responsavel (rh_funcionarios)
//   - Badge OKR quando aplicavel
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { painel as painelApi } from '../../api';
import { X, AlertCircle, CheckCircle2, Clock, TrendingDown, MinusCircle, ExternalLink } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const STATUS_VISUAL = {
  no_alvo:  { Icon: CheckCircle2,  cor: '#10B981', bg: '#10B98118', label: 'No alvo' },
  atras:    { Icon: Clock,         cor: '#F59E0B', bg: '#F59E0B18', label: 'Atras' },
  critico:  { Icon: TrendingDown,  cor: '#EF4444', bg: '#EF444418', label: 'Critico' },
  sem_dado: { Icon: MinusCircle,   cor: '#9CA3AF', bg: '#9CA3AF18', label: 'Sem dado' },
};

export default function ModalCelula({ area, valor, cell, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    painelApi.celula(area, valor)
      .then(setData)
      .catch(e => setErro(e?.message || 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [area, valor]);

  const irParaKpi = (kpiId) => {
    onClose?.();
    navigate(`/painel/kpi/${encodeURIComponent(kpiId)}`);
  };

  // Fechar com ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: C.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.modalBg,
          borderRadius: 16,
          maxWidth: 720,
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '20px 24px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              color: C.t3, textTransform: 'uppercase',
            }}>
              Intersecao da matriz
            </div>
            <h3 style={{
              fontSize: 18, fontWeight: 700, color: C.text,
              margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                background: cell?.valor_cor || C.primary, color: '#fff',
                fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 700,
              }}>
                {cell?.valor_label}
              </span>
              <span style={{ color: C.t3, fontWeight: 400, fontSize: 14 }}>×</span>
              <span style={{ color: C.text, textTransform: 'capitalize' }}>
                {cell?.area_nome}
              </span>
            </h3>
            <p style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
              {cell?.total_kpis || 0} indicadores · {cell?.em_dia || 0} em dia · {cell?.atras || 0} atras · {cell?.critico || 0} criticos · {cell?.sem_dado || 0} sem dado
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: 'transparent', border: 'none', color: C.t3,
              cursor: 'pointer', padding: 6, borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </header>

        {/* Conteudo */}
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>
              Carregando KPIs...
            </div>
          ) : erro ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
              <AlertCircle size={20} style={{ marginBottom: 8 }} />
              <div>{erro}</div>
            </div>
          ) : !data?.kpis?.length ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>
              Nenhum KPI nesta intersecao.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.kpis.map(k => <KpiRow key={k.id} kpi={k} onAbrir={() => irParaKpi(k.id)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiRow({ kpi, onAbrir }) {
  const traj = kpi.trajetoria;
  const sKey = traj?.status_trajetoria || 'sem_dado';
  const sv = STATUS_VISUAL[sKey] || STATUS_VISUAL.sem_dado;
  const Icon = sv.Icon;

  return (
    <div
      onClick={onAbrir}
      style={{
        background: 'var(--cbrio-card)',
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${sv.cor}`,
        borderRadius: 8,
        padding: 14,
        cursor: onAbrir ? 'pointer' : 'default',
        transition: 'border-color 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => { if (onAbrir) { e.currentTarget.style.borderColor = sv.cor; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeft = `3px solid ${sv.cor}`; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          background: sv.bg, color: sv.cor,
          width: 32, height: 32, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: C.text }}>{kpi.indicador}</strong>
            {kpi.is_okr && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 99,
                background: '#F59E0B20', color: '#B45309', fontWeight: 700,
              }}>
                OKR
              </span>
            )}
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 99,
              background: sv.bg, color: sv.cor, fontWeight: 700,
              marginLeft: 'auto',
            }}>
              {sv.label}
            </span>
            <ExternalLink size={12} style={{ color: C.t3 }} />
          </div>

          {kpi.descricao && (
            <p style={{ fontSize: 11, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>
              {kpi.descricao}
            </p>
          )}

          <div style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 8,
            fontSize: 11,
            color: C.t2,
          }}>
            {kpi.meta_descricao && (
              <Info label="Meta" value={`${kpi.meta_descricao}${kpi.unidade ? ' ' + kpi.unidade : ''}`} />
            )}
            {traj?.ultimo_valor !== null && traj?.ultimo_valor !== undefined && (
              <Info
                label="Ultimo valor"
                value={`${traj.ultimo_valor}${kpi.unidade ? ' ' + kpi.unidade : ''} (${traj.ultimo_periodo})`}
              />
            )}
            {traj?.percentual_meta != null && (
              <Info label="% da meta" value={`${traj.percentual_meta}%`} />
            )}
            <Info label="Periodicidade" value={kpi.periodicidade || '—'} />
            {kpi.lider && (
              <Info label="Lider" value={kpi.lider.nome + (kpi.lider.cargo ? ` (${kpi.lider.cargo})` : '')} />
            )}
            <Info label="ID" value={kpi.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: C.t2, marginTop: 2, lineHeight: 1.3 }}>
        {value}
      </div>
    </div>
  );
}
