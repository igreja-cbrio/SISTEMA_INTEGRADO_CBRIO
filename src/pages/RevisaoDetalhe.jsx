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

function DependencyGraph({ item, dependentes, deltaDias, fullscreen, onToggleFullscreen }) {
  const navigate = useNavigate();

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
  const numCols = 1 + (diretos.length > 0 ? 1 : 0) + (cascata.length > 0 ? 1 : 0);

  const COL_W = 230;
  const NODE_H = 58;
  const GAP_Y = 14;
  const LABEL_H = 22;
  const COL_GAP = 90;
  const PAD = 24;

  // Calcular largura total e posicionar colunas centradas
  const totalW = numCols * COL_W + (numCols - 1) * COL_GAP;
  const svgW = totalW + PAD * 2;

  // Posicoes X das colunas
  const colXs = [];
  let curX = PAD;
  colXs.push(curX); // col item principal
  if (diretos.length > 0) { curX += COL_W + COL_GAP; colXs.push(curX); }
  if (cascata.length > 0) { curX += COL_W + COL_GAP; colXs.push(curX); }
  const col1X = colXs[0];
  const col2X = diretos.length > 0 ? colXs[1] : null;
  const col3X = cascata.length > 0 ? colXs[colXs.length - 1] : null;

  // Altura: a coluna mais alta define
  const maxNodes = Math.max(diretos.length, cascata.length, 1);
  const contentH = maxNodes * (NODE_H + GAP_Y) - GAP_Y;
  const svgH = contentH + PAD * 2 + LABEL_H;

  // Centrar cada coluna verticalmente
  const centerY = PAD + LABEL_H + contentH / 2;
  const centerCol = (count) => {
    const totalColH = count * NODE_H + (count - 1) * GAP_Y;
    const startY = centerY - totalColH / 2;
    return Array.from({ length: count }, (_, i) => startY + i * (NODE_H + GAP_Y) + NODE_H / 2);
  };

  const mainY = centerY;
  const directYs = centerCol(diretos.length);
  const cascataYs = centerCol(cascata.length);

  const nodeStyle = (color, isAffected) => ({
    fill: isAffected ? color + '15' : 'var(--cbrio-card)',
    stroke: isAffected ? color : 'var(--cbrio-border)',
    strokeWidth: isAffected ? 2 : 1,
  });

  // Nó clicavel — navega para a pagina do marco
  const ClickableNode = ({ d, x, y, color, isAffected }) => (
    <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigate(`/revisao/expansao/${d.id}`); }}>
      <rect x={x} y={y - NODE_H / 2} width={COL_W} height={NODE_H} rx={9} {...nodeStyle(color, isAffected)} />
      {/* Hover overlay */}
      <rect x={x} y={y - NODE_H / 2} width={COL_W} height={NODE_H} rx={9} fill="transparent" className="dep-node-hover" />
      <text x={x + 11} y={y - 10} fontSize={11} fontWeight={600} fill={C.text} style={{ pointerEvents: 'none' }}>
        {d.name?.slice(0, 28)}{(d.name || '').length > 28 ? '...' : ''}
      </text>
      <text x={x + 11} y={y + 5} fontSize={10} fill={C.t3} style={{ pointerEvents: 'none' }}>
        Prazo: {fmtDate(d.date_end)} {d.responsible ? `| ${d.responsible}` : ''}
      </text>
      {isAffected && d.data_projetada && d.data_projetada !== d.date_end ? (
        <text x={x + 11} y={y + 20} fontSize={10} fontWeight={700} fill={color} style={{ pointerEvents: 'none' }}>
          {'\u2192'} {fmtDate(d.data_projetada)} ({deltaDias > 0 ? '+' : ''}{deltaDias}d)
        </text>
      ) : d.budget_planned > 0 ? (
        <text x={x + 11} y={y + 20} fontSize={9} fill={C.t3} style={{ pointerEvents: 'none' }}>{fmtMoney(d.budget_planned)}</text>
      ) : null}
    </g>
  );

  const wrapperStyle = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--cbrio-bg)', overflow: 'auto', padding: 24 }
    : { overflowX: 'auto', overflowY: 'auto', maxHeight: 380 };

  return (
    <div style={wrapperStyle}>
      {fullscreen && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Mapa de dependencias — {item?.name}</span>
          <button onClick={onToggleFullscreen} style={{ padding: '6px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Fechar tela cheia</button>
        </div>
      )}
      <style>{`.dep-node-hover:hover { fill: var(--cbrio-bg); opacity: 0.5; }`}</style>
      <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: svgW }}>
        {/* Linhas: item principal → diretos */}
        {col2X && diretos.map((_, i) => (
          <path key={'l1-' + i}
            d={`M${col1X + COL_W},${mainY} C${col1X + COL_W + COL_GAP / 2},${mainY} ${col2X - COL_GAP / 2},${directYs[i]} ${col2X},${directYs[i]}`}
            stroke={affected ? C.red : C.border} strokeWidth={affected ? 3 : 2} fill="none" strokeDasharray={affected ? '' : '6'} opacity={0.6} />
        ))}
        {/* Linhas: diretos → cascata */}
        {col2X && col3X && cascata.map((_, ci) => {
          const closestDY = directYs.reduce((best, y) => Math.abs(y - cascataYs[ci]) < Math.abs(best - cascataYs[ci]) ? y : best, directYs[0] || mainY);
          return (
            <path key={'l2-' + ci}
              d={`M${col2X + COL_W},${closestDY} C${col2X + COL_W + COL_GAP / 2},${closestDY} ${col3X - COL_GAP / 2},${cascataYs[ci]} ${col3X},${cascataYs[ci]}`}
              stroke={affected ? C.amber : C.border} strokeWidth={affected ? 2.5 : 2} fill="none" strokeDasharray="6" opacity={0.55} />
          );
        })}

        {/* Item principal */}
        <g>
          <rect x={col1X} y={mainY - NODE_H / 2} width={COL_W} height={NODE_H} rx={10}
            fill={C.primaryBg} stroke={C.primary} strokeWidth={2.5} />
          <text x={col1X + 12} y={mainY - 8} fontSize={12} fontWeight={700} fill={C.primary}>
            {(item?.name || '').slice(0, 28)}{(item?.name || '').length > 28 ? '...' : ''}
          </text>
          <text x={col1X + 12} y={mainY + 10} fontSize={10} fill={C.t2}>
            {fmtDate(item?.date_end)} {item?.responsible ? `| ${item.responsible}` : ''}
          </text>
        </g>

        {/* Label diretos */}
        {col2X && (
          <text x={col2X + COL_W / 2} y={PAD + 12} fontSize={10} fontWeight={700} fill={affected ? C.red : C.t3} textAnchor="middle">
            Dependentes diretos ({diretos.length})
          </text>
        )}
        {/* Dependentes diretos */}
        {col2X && diretos.map((d, i) => (
          <ClickableNode key={d.id} d={d} x={col2X} y={directYs[i]} color={C.red} isAffected={affected} />
        ))}

        {/* Label cascata */}
        {col3X && (
          <text x={col3X + COL_W / 2} y={PAD + 12} fontSize={10} fontWeight={700} fill={affected ? C.amber : C.t3} textAnchor="middle">
            Cascata ({cascata.length})
          </text>
        )}
        {/* Cascata */}
        {col3X && cascata.map((d, i) => (
          <ClickableNode key={d.id} d={d} x={col3X} y={cascataYs[i]} color={C.amber} isAffected={affected} />
        ))}
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
  const [graphFullscreen, setGraphFullscreen] = useState(false);

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
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, background: impacto.delta_dias > 0 ? C.red + '20' : C.green + '20', color: impacto.delta_dias > 0 ? C.red : C.green, fontWeight: 700 }}>
              {impacto.delta_dias > 0 ? '+' : ''}{impacto.delta_dias} dias
            </span>
          )}
          {impacto?.dependentes?.length > 0 && (
            <button onClick={() => setGraphFullscreen(f => !f)} style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {graphFullscreen ? 'Sair tela cheia' : 'Expandir'}
            </button>
          )}
        </div>
        <DependencyGraph item={{ ...item, date_end: form.date_end }} dependentes={impacto?.dependentes || []} deltaDias={dateChanged ? (impacto?.delta_dias || 0) : 0} fullscreen={graphFullscreen} onToggleFullscreen={() => setGraphFullscreen(f => !f)} />
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
