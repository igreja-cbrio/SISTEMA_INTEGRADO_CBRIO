// ============================================================================
// MatrizGestaoArea · grid 5 grupos adm × 6 areas-cliente no /painel
//
// Cada celula = saude do servico daquela area adm para aquela area-cliente
// nos ultimos 30 dias (% concluidas no SLA + alerta de atrasados).
//
// Click numa celula abre modal com solicitacoes + KPIs especificos da area.
// Visual identico ao MatrizValorArea (mesmo card, mesmo cell style, legenda
// igual).
// Criativo removido daqui · matriz propria futura.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../../api';
import { X, Clock, CheckCircle2, AlertCircle, Zap, ExternalLink, Activity } from 'lucide-react';
import { formatErro } from '../../lib/formatErro';
import KpiDetalheModal from '../KpiDetalheModal';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  inputBg: 'var(--cbrio-input-bg)',
  primary: '#00B39D', primaryBg: '#00B39D18', primaryDark: '#008376',
};

const STATUS_COR = {
  verde:    '#10B981',
  amarelo:  '#F59E0B',
  vermelho: '#EF4444',
  sem_dado: '#9CA3AF',
  na:       '#E5E7EB',
};

const STATUS_LABEL_CURTO = {
  verde:    'OK',
  amarelo:  'Atencao',
  vermelho: 'Critico',
  sem_dado: 'Sem dado',
  na:       'N/A',
};

export default function MatrizGestaoArea() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [celulaAberta, setCelulaAberta] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.matrizAdm();
      setData(r);
    } catch (e) {
      setErro(formatErro(e, 'matriz administrativa'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Carregando matriz administrativa...
        </div>
      </section>
    );
  }
  if (erro) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
      </section>
    );
  }
  if (!data) return null;

  const { grupos_adm, areas_cliente, cells, desde } = data;

  // Contagem por status pra legenda
  const totalCells = grupos_adm.length * areas_cliente.length;
  let countByStatus = { verde: 0, amarelo: 0, vermelho: 0, sem_dado: 0 };
  Object.values(cells).forEach(c => { countByStatus[c.status] = (countByStatus[c.status] || 0) + 1; });

  return (
    <>
      <section style={cardStyle}>
        <header style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>
            Matriz Gestão × Área
          </h2>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4, margin: 0 }}>
            Clique numa celula para ver solicitacoes e KPIs daquela area da gestao.
            Hospitalidade = Reserva + Cozinha + Manutencao · Logistica = Estoque + Compras.
          </p>
        </header>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{
            width: '100%', borderCollapse: 'separate', borderSpacing: 4,
            tableLayout: 'fixed', minWidth: 600,
          }}>
            <thead>
              <tr>
                <th style={thArea}></th>
                {areas_cliente.map(c => (
                  <th key={c.id} style={{
                    ...thCol,
                    color: C.text,
                  }}>
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos_adm.map(grupo => (
                <tr key={grupo.key}>
                  <td style={{
                    ...thRow,
                    background: 'var(--cbrio-input-bg)',
                    color: C.text,
                    borderLeft: `3px solid ${grupo.cor}`,
                  }}>
                    <strong style={{ fontSize: 12 }}>{grupo.label}</strong>
                    {grupo.subareas && grupo.subareas.length > 1 && (
                      <div style={{ fontSize: 9, color: C.t3, fontWeight: 500, marginTop: 2 }}>
                        {grupo.sub_labels.join(' · ')}
                      </div>
                    )}
                  </td>
                  {areas_cliente.map(cli => {
                    const cell = cells[`${grupo.key}:${cli.id}`];
                    const cor = STATUS_COR[cell?.status] || STATUS_COR.sem_dado;
                    const semDado = cell?.status === 'sem_dado';
                    // Todas as celulas sao clicaveis · sempre mostra os KPIs do grupo
                    // mesmo quando nao tem solicitacao no periodo
                    return (
                      <td
                        key={cli.id}
                        onClick={() => setCelulaAberta(cell)}
                        style={{
                          background: cor,
                          color: '#fff',
                          textAlign: 'center',
                          padding: 10,
                          borderRadius: 8,
                          cursor: 'pointer',
                          minHeight: 56,
                          height: 56,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          transition: 'transform 0.1s, box-shadow 0.1s',
                          userSelect: 'none',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'scale(1.04)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        title={semDado
                          ? 'Sem solicitacao no periodo · clique pra ver os KPIs desta area'
                          : `${cell.no_prazo}/${cell.concluidos} no SLA · ${cell.atrasados} atrasados · ${cell.em_andamento} em andamento`}
                      >
                        {semDado ? (
                          <>
                            <div style={{ fontSize: 14, lineHeight: 1, marginBottom: 2, fontWeight: 500 }}>
                              —
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.92, lineHeight: 1.1 }}>
                              0 sol.
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, lineHeight: 1, marginBottom: 2 }}>
                              {cell.percentual != null ? `${cell.percentual}%` : '—'}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.92, lineHeight: 1.1 }}>
                              {cell.total} sol.
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legenda · mesmo padrao do MatrizValorArea */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
          fontSize: 10, color: C.t3,
        }}>
          <Legenda cor={STATUS_COR.verde}    label={`>=90% no SLA · ${countByStatus.verde}`} />
          <Legenda cor={STATUS_COR.amarelo}  label={`70-89% · ${countByStatus.amarelo}`} />
          <Legenda cor={STATUS_COR.vermelho} label={`<70% ou com atraso · ${countByStatus.vermelho}`} />
          <Legenda cor={STATUS_COR.sem_dado} label={`Sem dado · ${countByStatus.sem_dado}`} />
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            desde {desde} · {totalCells} celulas
          </span>
        </div>
      </section>

      {celulaAberta && (
        <ModalCelulaAdm
          cell={celulaAberta}
          onClose={() => setCelulaAberta(null)}
        />
      )}
    </>
  );
}

function Legenda({ cor, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function ModalCelulaAdm({ cell, onClose }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalheKpiId, setDetalheKpiId] = useState(null);

  useEffect(() => {
    setLoading(true);
    painelApi.celulaAdm(cell.grupo_adm, cell.area_cliente)
      .then(setPayload)
      .catch(() => setPayload({ solicitacoes: [], kpis: [] }))
      .finally(() => setLoading(false));
  }, [cell.grupo_adm, cell.area_cliente]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const solicitacoes = payload?.solicitacoes || [];
  const kpis = payload?.kpis || [];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.modalBg, borderRadius: 16,
        maxWidth: 760, width: '100%', maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <header style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Intersecao da matriz
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: C.text }}>{cell.grupo_label}</span>
              <span style={{ color: C.t3, fontWeight: 400, fontSize: 14 }}>×</span>
              <span style={{ color: C.text, textTransform: 'capitalize' }}>{cell.area_cliente_nome}</span>
            </h3>
            <p style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
              {cell.percentual != null ? `${cell.percentual}% no SLA · ` : ''}
              {cell.total} solicitacoes · {cell.no_prazo} no prazo · {cell.atrasados} atrasadas · {cell.em_andamento} em andamento
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{
            background: 'transparent', border: 'none', color: C.t3,
            cursor: 'pointer', padding: 6, borderRadius: 6,
          }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPIs especificos da area · clicaveis */}
          {!loading && kpis.length > 0 && (
            <section>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: C.t3, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <Activity size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                KPIs desta area · {kpis.length}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kpis.map(k => (
                  <KpiCard key={k.id} kpi={k} onAbrir={() => setDetalheKpiId(k.id)} />
                ))}
              </div>
            </section>
          )}

          {/* Solicitacoes */}
          <section>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: C.t3, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Solicitacoes recentes · {solicitacoes.length}
            </h4>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 12 }}>Carregando...</div>
            ) : solicitacoes.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 12, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                Sem solicitacoes no periodo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {solicitacoes.map(s => <LinhaSolicitacao key={s.id} sol={s} />)}
              </div>
            )}
          </section>
        </div>
      </div>

      <KpiDetalheModal
        open={!!detalheKpiId}
        kpiId={detalheKpiId}
        onClose={() => setDetalheKpiId(null)}
        openInEdit
      />
    </div>
  );
}

function KpiCard({ kpi, onAbrir }) {
  const unidade = kpi.unidade || '';
  const valor = kpi.ultimo_valor;
  const corValor = valor == null ? '#9CA3AF'
                 : unidade === 'nota'
                   ? (valor >= 9 ? '#10B981' : valor >= 7 ? '#F59E0B' : '#EF4444')
                   : (valor >= 90 ? '#10B981' : valor >= 70 ? '#F59E0B' : '#EF4444');

  return (
    <div
      onClick={onAbrir}
      style={{
        background: 'var(--cbrio-card)',
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${corValor}`,
        borderRadius: 8, padding: 12,
        cursor: 'pointer', transition: 'border-color 0.15s',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = corValor; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeft = `3px solid ${corValor}`; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12, color: C.text }}>{kpi.indicador}</strong>
          {kpi.is_okr && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#F59E0B20', color: '#B45309', fontWeight: 700 }}>OKR</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
          {kpi.id} · meta {kpi.meta_descricao || (kpi.meta_valor != null ? `${kpi.meta_valor}${unidade ? ' ' + unidade : ''}` : '—')}
          {kpi.area_responsavel && ` · area: ${kpi.area_responsavel.replace('_', ' ')}`}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: corValor, lineHeight: 1 }}>
          {valor != null ? `${Number(valor).toFixed(unidade === '%' ? 0 : 1)}${unidade === 'nota' ? '' : unidade}` : '—'}
        </div>
        <div style={{ fontSize: 9, color: C.t3, marginTop: 2 }}>
          {kpi.ultimo_periodo || 'sem dados'}
        </div>
      </div>
      <ExternalLink size={14} style={{ color: C.t3, flexShrink: 0 }} />
    </div>
  );
}

function LinhaSolicitacao({ sol }) {
  const status = sol.sla_resolucao_status;
  const Icon = status === 'concluiu_no_prazo' ? CheckCircle2
             : status === 'atrasado' ? AlertCircle
             : status === 'concluiu_atrasado' ? Clock
             : Clock;
  const cor = status === 'concluiu_no_prazo' ? '#10B981'
            : status === 'atrasado' || status === 'concluiu_atrasado' ? '#EF4444'
            : '#9CA3AF';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', background: C.inputBg, borderRadius: 6, fontSize: 12,
    }}>
      <Icon size={14} style={{ color: cor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 500 }}>{sol.titulo}</div>
        <div style={{ fontSize: 10, color: C.t3 }}>
          {sol.area_responsavel && <strong style={{ textTransform: 'capitalize' }}>{sol.area_responsavel.replace('_', ' ')}</strong>}
          {sol.area_responsavel && ' · '}
          {new Date(sol.created_at).toLocaleDateString('pt-BR')}
          {sol.concluido_em && ` · concluido em ${new Date(sol.concluido_em).toLocaleDateString('pt-BR')}`}
          {sol.horas_total != null && ` · ${Math.round(sol.horas_total)}h`}
        </div>
      </div>
      {sol.eh_urgente && (
        <span title="Urgente" style={{ color: '#F59E0B' }}><Zap size={12} /></span>
      )}
      <span style={{
        fontSize: 9, padding: '2px 6px', borderRadius: 99,
        background: cor + '20', color: cor, fontWeight: 700, textTransform: 'uppercase',
      }}>
        {sol.status}
      </span>
    </div>
  );
}

const cardStyle = {
  background: C.card,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
};

const thArea = {
  padding: 8,
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--cbrio-text3)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  width: '15%',
  minWidth: 90,
};
const thCol = {
  padding: 8,
  textAlign: 'center',
  fontSize: 10.5,
  fontWeight: 600,
  background: 'var(--cbrio-input-bg)',
  borderRadius: 6,
  letterSpacing: 0.2,
};
const thRow = {
  padding: '8px 12px',
  textAlign: 'left',
  borderRadius: 8,
  fontSize: 12,
  whiteSpace: 'nowrap',
};
