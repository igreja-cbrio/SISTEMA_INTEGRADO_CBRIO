// ============================================================================
// KpiDetalheModal — modal de detalhe completo de 1 KPI
//
// Substitui a rota /painel/kpi/:id (mais leve, abre como overlay).
// Exibe: status atual, mini-grafico historico, trajetoria (checkpoints),
// revisoes OKR. Botao "Editar" abre KpiEditorModal aninhado.
// Botao "Registrar revisao" se KPI em alerta.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../api';
import { X, CheckCircle2, Clock, TrendingDown, MinusCircle, AlertCircle, Pencil, ClipboardCheck } from 'lucide-react';
import KpiEditorModal from './KpiEditorModal';
import OkrRevisaoModal from './OkrRevisaoModal';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D',
};

const STATUS_VISUAL = {
  no_alvo:  { Icon: CheckCircle2, cor: '#10B981', bg: '#10B98118', label: 'No alvo' },
  atras:    { Icon: Clock,        cor: '#F59E0B', bg: '#F59E0B18', label: 'Atras' },
  critico:  { Icon: TrendingDown, cor: '#EF4444', bg: '#EF444418', label: 'Critico' },
  sem_dado: { Icon: MinusCircle,  cor: '#9CA3AF', bg: '#9CA3AF18', label: 'Sem dado' },
};

const VALOR_CORES = {
  seguir: '#8B5CF6', conectar: '#3B82F6', investir: '#F59E0B',
  servir: '#10B981', generosidade: '#EC4899',
};
const VALOR_LABELS = {
  seguir: 'Seguir', conectar: 'Conectar', investir: 'Investir',
  servir: 'Servir', generosidade: 'Generosidade',
};

/**
 * Props:
 *   open: boolean
 *   kpiId: string | null
 *   onClose: () => void
 *   onUpdated?: () => void  (chamado ao salvar editor ou revisao)
 */
export default function KpiDetalheModal({ open, kpiId, onClose, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [revisarOpen, setRevisarOpen] = useState(false);

  const carregar = useCallback(() => {
    if (!kpiId) return;
    setLoading(true);
    setErro(null);
    painelApi.kpi(kpiId)
      .then(setData)
      .catch(e => setErro(e?.message || 'Erro ao carregar KPI'))
      .finally(() => setLoading(false));
  }, [kpiId]);

  useEffect(() => { if (open && kpiId) carregar(); }, [open, kpiId, carregar]);

  // Fechar com ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !editOpen && !revisarOpen) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, editOpen, revisarOpen]);

  if (!open) return null;

  const kpi = data?.kpi;
  const sKey = data?.trajetoria_atual?.status_trajetoria || 'sem_dado';
  const sv = STATUS_VISUAL[sKey] || STATUS_VISUAL.sem_dado;
  const StatusIcon = sv.Icon;
  const podeRevisar = sKey === 'critico' || sKey === 'atras';

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: C.overlay,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <div onClick={e => e.stopPropagation()}
          style={{
            background: C.modalBg, borderRadius: 12,
            maxWidth: 880, width: '100%', maxHeight: '92vh', overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}
        >
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>
          ) : erro || !data ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
              <AlertCircle size={24} style={{ marginBottom: 8 }} />
              <div style={{ marginBottom: 12 }}>{erro || 'KPI nao encontrado'}</div>
              <button onClick={onClose} style={btnGhost}>Fechar</button>
            </div>
          ) : (
            <>
              {/* Header */}
              <header style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${C.border}`,
                borderLeft: `4px solid ${sv.cor}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.5 }}>{kpi.id}</span>
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: 'var(--cbrio-input-bg)', color: C.t2, fontWeight: 600, textTransform: 'capitalize' }}>{kpi.area}</span>
                    {kpi.is_okr && <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 99, background: '#FEF3C7', color: '#B45309', fontWeight: 700 }}>OKR</span>}
                    {(kpi.valores || []).map(v => (
                      <span key={v} style={{
                        fontSize: 9, padding: '2px 8px', borderRadius: 99,
                        background: VALOR_CORES[v] + '20', color: VALOR_CORES[v], fontWeight: 700,
                      }}>{VALOR_LABELS[v] || v}</span>
                    ))}
                    <span style={{
                      marginLeft: 'auto',
                      padding: '4px 10px', borderRadius: 99,
                      background: sv.bg, color: sv.cor, fontWeight: 700,
                      fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <StatusIcon size={12} /> {sv.label}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.3 }}>
                    {kpi.indicador}
                  </h2>
                  {kpi.descricao && (
                    <p style={{ fontSize: 12, color: C.t3, marginTop: 6, lineHeight: 1.4 }}>{kpi.descricao}</p>
                  )}
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', padding: 4 }}>
                  <X size={20} />
                </button>
              </header>

              {/* Body */}
              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                  {/* Status atual */}
                  <Section title="Status atual">
                    {data.trajetoria_atual?.ultimo_valor != null ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 30, fontWeight: 800, color: C.text }}>
                            {data.trajetoria_atual.ultimo_valor}
                          </span>
                          {kpi.unidade && <span style={{ fontSize: 13, color: C.t3 }}>{kpi.unidade}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
                          Periodo: <strong>{data.trajetoria_atual.ultimo_periodo}</strong>
                        </div>
                        {data.trajetoria_atual.checkpoint_meta != null && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, color: C.t3 }}>
                              Meta do periodo: <strong>{data.trajetoria_atual.checkpoint_meta}{kpi.unidade ? ' ' + kpi.unidade : ''}</strong>
                            </div>
                            {data.trajetoria_atual.percentual_meta != null && (
                              <>
                                <div style={{ marginTop: 6, height: 8, background: 'var(--cbrio-input-bg)', borderRadius: 99, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(data.trajetoria_atual.percentual_meta, 150)}%`, height: '100%', background: sv.cor, transition: 'width 0.4s' }} />
                                </div>
                                <div style={{ fontSize: 10, color: sv.cor, fontWeight: 700, marginTop: 3 }}>
                                  {data.trajetoria_atual.percentual_meta}% da meta
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ padding: 16, textAlign: 'center', color: C.t3, fontSize: 12 }}>
                        Sem registros ainda · {sv.label}
                      </div>
                    )}
                    {kpi.meta_descricao && (
                      <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.t3 }}>
                        <strong style={{ color: C.t2 }}>Meta original:</strong> {kpi.meta_descricao}{kpi.unidade ? ' ' + kpi.unidade : ''}
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 10, color: C.t3 }}>
                      <strong style={{ color: C.t2 }}>Periodicidade:</strong> {kpi.periodicidade || '—'}
                    </div>
                    {data.lider && (
                      <div style={{ marginTop: 4, fontSize: 10, color: C.t3 }}>
                        <strong style={{ color: C.t2 }}>Lider:</strong> {data.lider.nome}{data.lider.cargo ? ` · ${data.lider.cargo}` : ''}
                      </div>
                    )}
                  </Section>

                  {/* Mini grafico */}
                  <Section title={`Historico (${data.historico?.length || 0} registros)`}>
                    {data.historico && data.historico.length > 0 ? (
                      <MiniGrafico registros={data.historico} cor={sv.cor} unidade={kpi.unidade} />
                    ) : (
                      <div style={{ padding: 12, textAlign: 'center', color: C.t3, fontSize: 11 }}>
                        Sem registros para gerar grafico.
                      </div>
                    )}
                  </Section>

                  {/* Memoria de calculo */}
                  {kpi.memoria_calculo && (
                    <Section title="Memoria de calculo" full>
                      <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, margin: 0 }}>{kpi.memoria_calculo}</p>
                    </Section>
                  )}

                  {/* Trajetoria checkpoints */}
                  {data.checkpoints && data.checkpoints.length > 0 && (
                    <Section title="Trajetoria (checkpoints)" full>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              <th style={th}>Periodo</th>
                              <th style={th}>Meta</th>
                              <th style={th}>Observacao</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.checkpoints.map(c => (
                              <tr key={c.id}>
                                <td style={td}><strong>{c.periodo_referencia}</strong></td>
                                <td style={td}>{c.meta_valor != null ? `${c.meta_valor}${kpi.unidade ? ' ' + kpi.unidade : ''}` : (c.meta_texto || '—')}</td>
                                <td style={{ ...td, color: C.t3 }}>{c.observacao || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Section>
                  )}

                  {/* Revisoes */}
                  {kpi.is_okr && (
                    <Section title="Revisoes (regra de ouro)" full>
                      {!data.revisoes || data.revisoes.length === 0 ? (
                        <div style={{ padding: 12, textAlign: 'center', color: C.t3, fontSize: 11, fontStyle: 'italic' }}>
                          Nenhuma revisao registrada.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {data.revisoes.map(r => <RevisaoMini key={r.id} revisao={r} />)}
                        </div>
                      )}
                    </Section>
                  )}
                </div>
              </div>

              {/* Footer */}
              <footer style={{ padding: '14px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={onClose} style={btnGhost}>Fechar</button>
                <button onClick={() => setEditOpen(true)} style={btnSecondary}>
                  <Pencil size={13} /> Editar KPI
                </button>
                {podeRevisar && (
                  <button onClick={() => setRevisarOpen(true)} style={{ ...btnPrimary, background: sv.cor }}>
                    <ClipboardCheck size={13} /> Registrar revisao
                  </button>
                )}
              </footer>
            </>
          )}
        </div>
      </div>

      {/* Editor (sub-modal, z-index maior) */}
      {editOpen && kpi && (
        <KpiEditorModal
          open={editOpen}
          kpi={kpi}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); carregar(); onUpdated?.(); }}
        />
      )}

      {/* Revisao (sub-modal, z-index maior) */}
      {revisarOpen && kpi && (
        <OkrRevisaoModal
          open={revisarOpen}
          kpi={{ ...kpi, trajetoria: data.trajetoria_atual }}
          onClose={() => setRevisarOpen(false)}
          onSaved={() => { setRevisarOpen(false); carregar(); onUpdated?.(); }}
        />
      )}
    </>
  );
}

function Section({ title, full, children }) {
  return (
    <section style={{ background: 'var(--cbrio-input-bg)', padding: 14, borderRadius: 8, gridColumn: full ? '1/-1' : 'auto' }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, marginBottom: 8 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function MiniGrafico({ registros, cor, unidade }) {
  if (!registros || registros.length === 0) return null;
  const valores = registros.map(r => Number(r.valor_realizado) || 0);
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const range = max - min || 1;
  const W = 320, H = 90, P = 8;
  const stepX = (W - P * 2) / Math.max(registros.length - 1, 1);

  const points = registros.map((r, i) => {
    const v = Number(r.valor_realizado) || 0;
    const x = P + i * stepX;
    const y = H - P - ((v - min) / range) * (H - P * 2);
    return [x, y];
  });
  const pathLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const pathArea = `${pathLine} L ${points[points.length - 1][0]} ${H - P} L ${points[0][0]} ${H - P} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <path d={pathArea} fill={cor} fillOpacity="0.12" />
        <path d={pathLine} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={cor} />)}
      </svg>
      <div style={{ fontSize: 10, color: C.t3, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>min: <strong>{min}{unidade ? ' ' + unidade : ''}</strong></span>
        <span>max: <strong>{max}{unidade ? ' ' + unidade : ''}</strong></span>
        <span>atual: <strong>{valores[valores.length - 1]}{unidade ? ' ' + unidade : ''}</strong></span>
      </div>
    </div>
  );
}

function RevisaoMini({ revisao }) {
  const cor = revisao.status_revisao === 'executada' ? '#10B981'
    : revisao.status_revisao === 'cancelada' ? '#9CA3AF' : '#F59E0B';
  return (
    <div style={{ background: C.card, padding: 10, borderRadius: 6, borderLeft: `3px solid ${cor}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <strong style={{ fontSize: 11 }}>{revisao.periodo_referencia}</strong>
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: cor + '20', color: cor, fontWeight: 700, textTransform: 'uppercase' }}>{revisao.status_revisao}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.t3 }}>{revisao.data_revisao}</span>
      </div>
      <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
        <div><strong>Causa:</strong> {revisao.causa_desvio}</div>
        <div><strong>Decisao:</strong> {revisao.decisao}</div>
        {revisao.proximo_passo && <div><strong>Proximo passo:</strong> {revisao.proximo_passo}</div>}
      </div>
    </div>
  );
}

const th = { textAlign: 'left', padding: 6, fontSize: 9, color: 'var(--cbrio-text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--cbrio-border)' };
const td = { padding: 6, borderBottom: '1px solid var(--cbrio-border)', fontSize: 11 };
const btnGhost = { padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--cbrio-text2)', border: '1px solid var(--cbrio-border)', cursor: 'pointer' };
const btnSecondary = { padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text2)', border: '1px solid var(--cbrio-border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnPrimary = { padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
