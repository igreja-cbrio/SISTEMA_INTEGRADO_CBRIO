import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { revisoes } from '../api';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', purple: '#8b5cf6',
};

const fmtDate = (d) => { if (!d) return '-'; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '-';
const INPUT = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 13, width: '100%' };
const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text2)', marginBottom: 3, display: 'block' };

const STATUS_PROJ = ['pendente', 'em_andamento', 'pausado', 'cancelado', 'concluido'];
const STATUS_EXP = ['pendente', 'em_andamento', 'bloqueado', 'cancelado', 'concluido'];

// ══════════════════════════════════════════════
// GRAFO SVG DE DEPENDENCIAS
// ══════════════════════════════════════════════

function DependencyGraph({ item, dependentes, deltaDias }) {
  if (!dependentes || dependentes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
        Este {item?._tipo === 'projeto' ? 'projeto' : 'marco'} nao possui dependentes.
        <br />Alteracoes nao impactam outros itens.
      </div>
    );
  }

  const diretos = dependentes.filter(d => d.is_direct);
  const cascata = dependentes.filter(d => !d.is_direct);
  const affected = deltaDias !== 0;

  // Layout: item central à esquerda, dependentes diretos no meio, cascata à direita
  const COL_W = 220;
  const NODE_H = 56;
  const GAP_Y = 16;
  const PAD = 20;

  const col1X = PAD;
  const col2X = PAD + COL_W + 80;
  const col3X = cascata.length > 0 ? col2X + COL_W + 80 : col2X;

  const svgW = (cascata.length > 0 ? col3X + COL_W + PAD : col2X + COL_W + PAD);
  const maxRows = Math.max(diretos.length, cascata.length, 1);
  const svgH = Math.max(maxRows * (NODE_H + GAP_Y) + PAD * 2, 200);

  // Y center do item principal
  const centerY = svgH / 2;
  // Y dos dependentes diretos — distribuir verticalmente centrado
  const directYs = diretos.map((_, i) => PAD + i * (NODE_H + GAP_Y) + NODE_H / 2);
  const cascataYs = cascata.map((_, i) => PAD + i * (NODE_H + GAP_Y) + NODE_H / 2);

  const nodeStyle = (color, isAffected) => ({
    fill: isAffected ? color + '20' : 'var(--cbrio-card)',
    stroke: isAffected ? color : 'var(--cbrio-border)',
    strokeWidth: isAffected ? 2 : 1,
  });

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 420 }}>
      <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: svgW }}>
        {/* Linhas: item central → diretos */}
        {diretos.map((_, i) => (
          <line key={'l1-' + i} x1={col1X + COL_W} y1={centerY} x2={col2X} y2={directYs[i]}
            stroke={affected ? C.red : C.border} strokeWidth={affected ? 2 : 1} strokeDasharray={affected ? '' : '4'} opacity={0.6} />
        ))}
        {/* Linhas: diretos → cascata */}
        {cascata.map((c, ci) => {
          // Encontrar qual direto leva a este cascata (simplificado: conecta ao mais proximo)
          const closestDY = directYs.reduce((best, y) => Math.abs(y - cascataYs[ci]) < Math.abs(best - cascataYs[ci]) ? y : best, directYs[0] || centerY);
          return (
            <line key={'l2-' + ci} x1={col2X + COL_W} y1={closestDY} x2={col3X} y2={cascataYs[ci]}
              stroke={affected ? C.amber : C.border} strokeWidth={affected ? 1.5 : 1} strokeDasharray="4" opacity={0.5} />
          );
        })}

        {/* Item principal */}
        <g>
          <rect x={col1X} y={centerY - NODE_H / 2} width={COL_W} height={NODE_H} rx={10}
            fill={C.primaryBg} stroke={C.primary} strokeWidth={2.5} />
          <text x={col1X + 12} y={centerY - 8} fontSize={12} fontWeight={700} fill={C.primary}>
            {(item?.name || '').slice(0, 28)}{(item?.name || '').length > 28 ? '...' : ''}
          </text>
          <text x={col1X + 12} y={centerY + 10} fontSize={10} fill={C.t2}>
            {fmtDate(item?.date_end)} {item?.responsible ? `| ${item.responsible}` : ''}
          </text>
        </g>

        {/* Label coluna diretos */}
        {diretos.length > 0 && (
          <text x={col2X + COL_W / 2} y={10} fontSize={10} fontWeight={700} fill={affected ? C.red : C.t3} textAnchor="middle">
            Dependentes diretos ({diretos.length})
          </text>
        )}

        {/* Dependentes diretos */}
        {diretos.map((d, i) => {
          const y = directYs[i] - NODE_H / 2;
          const ns = nodeStyle(C.red, affected);
          return (
            <g key={d.id}>
              <rect x={col2X} y={y} width={COL_W} height={NODE_H} rx={8} {...ns} />
              <text x={col2X + 10} y={y + 18} fontSize={11} fontWeight={600} fill={C.text}>
                {d.name?.slice(0, 26)}{(d.name || '').length > 26 ? '...' : ''}
              </text>
              <text x={col2X + 10} y={y + 33} fontSize={10} fill={C.t3}>
                Prazo: {fmtDate(d.date_end)}
              </text>
              {affected && d.data_projetada && d.data_projetada !== d.date_end && (
                <text x={col2X + 10} y={y + 47} fontSize={10} fontWeight={700} fill={C.red}>
                  {'\u2192'} {fmtDate(d.data_projetada)} ({deltaDias > 0 ? '+' : ''}{deltaDias}d)
                </text>
              )}
              {!affected && d.budget_planned > 0 && (
                <text x={col2X + 10} y={y + 47} fontSize={9} fill={C.t3}>{fmtMoney(d.budget_planned)}</text>
              )}
            </g>
          );
        })}

        {/* Label coluna cascata */}
        {cascata.length > 0 && (
          <text x={col3X + COL_W / 2} y={10} fontSize={10} fontWeight={700} fill={affected ? C.amber : C.t3} textAnchor="middle">
            Cascata ({cascata.length})
          </text>
        )}

        {/* Cascata */}
        {cascata.map((d, i) => {
          const y = cascataYs[i] - NODE_H / 2;
          const ns = nodeStyle(C.amber, affected);
          return (
            <g key={d.id}>
              <rect x={col3X} y={y} width={COL_W} height={NODE_H} rx={8} {...ns} />
              <text x={col3X + 10} y={y + 18} fontSize={11} fontWeight={600} fill={C.text}>
                {d.name?.slice(0, 26)}{(d.name || '').length > 26 ? '...' : ''}
              </text>
              <text x={col3X + 10} y={y + 33} fontSize={10} fill={C.t3}>
                Prazo: {fmtDate(d.date_end)}
              </text>
              {affected && d.data_projetada && d.data_projetada !== d.date_end && (
                <text x={col3X + 10} y={y + 47} fontSize={10} fontWeight={700} fill={C.amber}>
                  {'\u2192'} {fmtDate(d.data_projetada)} ({deltaDias > 0 ? '+' : ''}{deltaDias}d)
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════
// PAGINA DE DETALHE
// ══════════════════════════════════════════════

export default function RevisaoDetalhe() {
  const { tipo, id } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [form, setForm] = useState({});
  const [motivo, setMotivo] = useState('');
  const [impacto, setImpacto] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Carregar item + impacto + historico em paralelo
      const [simRes, histRes] = await Promise.all([
        revisoes.simular(tipo, id),
        revisoes.historico({ tipo, item_id: id }),
      ]);
      setItem({ ...simRes.item, _tipo: tipo });
      setForm({ ...simRes.item });
      setImpacto(simRes);
      setHistorico(Array.isArray(histRes) ? histRes : []);
    } catch { toast.error('Erro ao carregar item'); }
    finally { setLoading(false); }
  }, [tipo, id]);

  useEffect(() => { load(); }, [load]);

  // Recalcular impacto ao mudar data
  const recalcImpacto = async (novaData) => {
    if (tipo !== 'expansao') return;
    try {
      const sim = await revisoes.simular('expansao', id, { nova_data: novaData });
      setImpacto(sim);
    } catch {}
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const payload = { ...form, motivo: motivo || undefined };
      delete payload._tipo; delete payload.id; delete payload.created_by; delete payload.created_at; delete payload.updated_at;
      const fn = tipo === 'projeto' ? revisoes.updateProjeto : revisoes.updateExpansao;
      const result = await fn(id, payload);
      toast.success(`${result.alteracoes} campo(s) atualizado(s)`);
      load(); // Recarregar dados
      setMotivo('');
    } catch (err) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  if (!item) return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Item nao encontrado.</div>;

  const statusOpts = tipo === 'projeto' ? STATUS_PROJ : STATUS_EXP;
  const dateChanged = form.date_end !== item.date_end;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/revisao')} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>{'\u2190'} Voltar</button>
        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: tipo === 'projeto' ? '#3b82f620' : '#8b5cf620', color: tipo === 'projeto' ? C.blue : C.purple, fontWeight: 700 }}>{tipo === 'projeto' ? 'Projeto' : 'Marco de Expansao'}</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0, flex: 1 }}>{item.name}</h1>
        {item.area && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 600 }}>{item.area}</span>}
      </div>

      {/* ═══ GRAFO DE DEPENDENCIAS ═══ */}
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cbrio-table-header)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Mapa de dependencias</span>
          {impacto?.total_impactados > 0 && (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: dateChanged ? C.red + '20' : C.amber + '20', color: dateChanged ? C.red : C.amber, fontWeight: 700 }}>
              {impacto.total_impactados} marcos impactados
            </span>
          )}
          {impacto?.custo_impactado > 0 && (
            <span style={{ fontSize: 11, color: C.t3 }}>Orcamento afetado: <strong style={{ color: C.red }}>{fmtMoney(impacto.custo_impactado)}</strong></span>
          )}
          {dateChanged && impacto?.delta_dias !== 0 && (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: impacto.delta_dias > 0 ? C.red + '20' : C.green + '20', color: impacto.delta_dias > 0 ? C.red : C.green, fontWeight: 700, marginLeft: 'auto' }}>
              {impacto.delta_dias > 0 ? '+' : ''}{impacto.delta_dias} dias
            </span>
          )}
        </div>
        <DependencyGraph item={{ ...item, date_end: form.date_end }} dependentes={impacto?.dependentes || []} deltaDias={dateChanged ? (impacto?.delta_dias || 0) : 0} />
      </div>

      {/* ═══ FORMULARIO DE EDICAO ═══ */}
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Editar {tipo === 'projeto' ? 'Projeto' : 'Marco'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px 18px' }}>
          <div>
            <label style={LABEL}>Nome</label>
            <input value={form.name || ''} onChange={ev => setForm(f => ({ ...f, name: ev.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Status</label>
            <select value={form.status || ''} onChange={ev => setForm(f => ({ ...f, status: ev.target.value }))} style={INPUT}>
              {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Responsavel</label>
            <input value={form.responsible || ''} onChange={ev => setForm(f => ({ ...f, responsible: ev.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Data inicio</label>
            <input type="date" value={form.date_start || ''} onChange={ev => setForm(f => ({ ...f, date_start: ev.target.value }))} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Data fim</label>
            <input type="date" value={form.date_end || ''} onChange={ev => {
              setForm(f => ({ ...f, date_end: ev.target.value }));
              recalcImpacto(ev.target.value);
            }} style={{ ...INPUT, borderColor: dateChanged ? C.primary : undefined, borderWidth: dateChanged ? 2 : 1 }} />
          </div>
          <div>
            <label style={LABEL}>Orcamento planejado</label>
            <input type="number" value={form.budget_planned ?? ''} onChange={ev => setForm(f => ({ ...f, budget_planned: Number(ev.target.value) || 0 }))} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Area</label>
            <input value={form.area || ''} onChange={ev => setForm(f => ({ ...f, area: ev.target.value }))} style={INPUT} />
          </div>
          {tipo === 'projeto' ? (
            <>
              <div>
                <label style={LABEL}>Prioridade</label>
                <select value={form.priority || 'media'} onChange={ev => setForm(f => ({ ...f, priority: ev.target.value }))} style={INPUT}>
                  {['baixa', 'media', 'alta', 'urgente'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Ano</label>
                <input type="number" value={form.year || ''} onChange={ev => setForm(f => ({ ...f, year: Number(ev.target.value) || null }))} style={INPUT} />
              </div>
            </>
          ) : (
            <div>
              <label style={LABEL}>Fase</label>
              <input value={form.phase || ''} onChange={ev => setForm(f => ({ ...f, phase: ev.target.value }))} style={INPUT} />
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={LABEL}>Descricao / Objetivo</label>
          <textarea value={form.description || ''} onChange={ev => setForm(f => ({ ...f, description: ev.target.value }))} rows={3} style={{ ...INPUT, resize: 'vertical' }} />
        </div>

        {tipo === 'projeto' && (
          <div style={{ marginTop: 12 }}>
            <label style={LABEL}>Notas / Entrega esperada</label>
            <textarea value={form.notes || ''} onChange={ev => setForm(f => ({ ...f, notes: ev.target.value }))} rows={2} style={{ ...INPUT, resize: 'vertical' }} />
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={LABEL}>Motivo da revisao</label>
          <input value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Ex: Reuniao com Pedro 24/04 — decidido postergar para Q3" style={INPUT} />
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button onClick={salvar} disabled={saving} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Salvar alteracoes'}</button>
          <button onClick={() => navigate('/revisao')} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>

      {/* ═══ HISTORICO ═══ */}
      {historico.length > 0 && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Historico de revisoes ({historico.length})</span>
          </div>
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {historico.map(h => (
              <div key={h.id} style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, fontSize: 12, alignItems: 'baseline' }}>
                <span style={{ color: C.t3, flexShrink: 0, minWidth: 80 }}>{fmtDate(h.created_at?.split('T')[0])}</span>
                <span style={{ color: C.text }}>
                  <strong>{h.campo}</strong>: <span style={{ color: C.red, textDecoration: 'line-through' }}>{h.valor_anterior || '(vazio)'}</span> {'\u2192'} <span style={{ color: C.green, fontWeight: 600 }}>{h.valor_novo}</span>
                </span>
                {h.changed_by_name && <span style={{ color: C.t3, flexShrink: 0 }}>por {h.changed_by_name}</span>}
                {h.motivo && <span style={{ color: C.amber, fontStyle: 'italic', flex: 1 }}>"{h.motivo}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
