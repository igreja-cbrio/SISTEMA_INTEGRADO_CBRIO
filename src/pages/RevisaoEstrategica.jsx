import { useState, useEffect, useCallback, useRef } from 'react';
import { revisoes } from '../api';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', purple: '#8b5cf6',
};

const fmtDate = (d) => { if (!d) return '-'; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '-';
const diasAtraso = (dateEnd) => {
  if (!dateEnd) return 0;
  return Math.ceil((new Date() - new Date(dateEnd + 'T23:59:59')) / 86400000);
};

const STATUS_OPTIONS_PROJ = ['pendente', 'em_andamento', 'pausado', 'cancelado', 'concluido'];
const STATUS_OPTIONS_EXP = ['pendente', 'em_andamento', 'bloqueado', 'cancelado', 'concluido'];

const INPUT = { padding: '7px 10px', borderRadius: 8, border: `1px solid var(--cbrio-border)`, background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 13, width: '100%' };
const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text2)', marginBottom: 3, display: 'block' };

export default function RevisaoEstrategica() {
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterArea, setFilterArea] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState('all');

  // Item selecionado + formulario de edicao
  const [selected, setSelected] = useState(null); // { ...item, _tipo }
  const [form, setForm] = useState({});
  const [motivo, setMotivo] = useState('');
  const [impacto, setImpacto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historico, setHistorico] = useState([]);
  const panelRef = useRef(null);

  const loadDiag = useCallback(async () => {
    setLoading(true);
    try { setDiag(await revisoes.diagnostico()); } catch { toast.error('Erro ao carregar diagnostico'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDiag(); }, [loadDiag]);

  // Ao selecionar item: carrega simulacao + historico
  const selectItem = async (item) => {
    setSelected(item);
    setForm({ ...item });
    setMotivo('');
    // Carregar impacto
    try {
      const sim = await revisoes.simular(item._tipo, item.id, item._tipo === 'expansao' ? {} : null);
      setImpacto(sim);
    } catch { setImpacto(null); }
    // Carregar historico
    try {
      const h = await revisoes.historico({ tipo: item._tipo, item_id: item.id });
      setHistorico(Array.isArray(h) ? h : []);
    } catch { setHistorico([]); }
    // Scroll to panel
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // Recalcular impacto quando data muda
  const recalcImpacto = async (novaData) => {
    if (!selected || selected._tipo !== 'expansao') return;
    try {
      const sim = await revisoes.simular('expansao', selected.id, { nova_data: novaData });
      setImpacto(sim);
    } catch {}
  };

  // Salvar
  const salvar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = { ...form, motivo: motivo || undefined };
      // Remover campos internos
      delete payload._tipo; delete payload._dias; delete payload.id;
      const fn = selected._tipo === 'projeto' ? revisoes.updateProjeto : revisoes.updateExpansao;
      const result = await fn(selected.id, payload);
      toast.success(`${result.alteracoes} campo(s) atualizado(s)`);
      setSelected(null);
      setImpacto(null);
      loadDiag();
    } catch (err) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  if (loading || !diag) return <div style={{ padding: 60, textAlign: 'center', color: C.t3, fontSize: 14 }}>Carregando diagnostico...</div>;

  const hoje = new Date().toISOString().split('T')[0];
  const { projetos: p, expansao: e, dependencias: dep } = diag;

  // Unificar itens
  const allItems = [
    ...(p.lista || []).map(x => ({ ...x, _tipo: 'projeto' })),
    ...(e.lista || []).filter(x => x.status !== 'concluido' && x.status !== 'cancelado').map(x => ({ ...x, _tipo: 'expansao' })),
  ].map(x => ({ ...x, _dias: diasAtraso(x.date_end) }));

  // Opcoes de filtro
  const areas = [...new Set(allItems.map(x => x.area).filter(Boolean))].sort();
  const responsaveis = [...new Set(allItems.map(x => x.responsible).filter(Boolean))].sort();

  // Aplicar filtros
  const filtered = allItems.filter(x => {
    if (filterArea !== 'all' && x.area !== filterArea) return false;
    if (filterTipo !== 'all' && x._tipo !== filterTipo) return false;
    if (filterStatus === 'atrasado') return x._dias > 0 && x.status !== 'concluido';
    if (filterStatus !== 'all' && x.status !== filterStatus) return false;
    if (filterResp !== 'all' && x.responsible !== filterResp) return false;
    return true;
  }).sort((a, b) => b._dias - a._dias);

  const projAtrasados = (p.lista || []).filter(x => x.date_end && x.date_end < hoje && x.status !== 'concluido');
  const expAtrasados = (e.lista || []).filter(x => x.date_end && x.date_end < hoje && x.status !== 'concluido' && x.status !== 'cancelado');
  const hasFilters = filterArea !== 'all' || filterTipo !== 'all' || filterStatus !== 'all' || filterResp !== 'all';

  const statusOpts = selected?._tipo === 'projeto' ? STATUS_OPTIONS_PROJ : STATUS_OPTIONS_EXP;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 20px' }}>Revisao Estrategica</h1>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Projetos ativos', value: p.total, color: C.blue },
          { label: 'Proj. atrasados', value: projAtrasados.length, color: projAtrasados.length > 0 ? C.red : C.green },
          { label: 'Marcos expansao', value: e.lista.filter(x => x.status !== 'concluido' && x.status !== 'cancelado').length, color: C.purple },
          { label: 'Marcos atrasados', value: expAtrasados.length, color: expAtrasados.length > 0 ? C.red : C.green },
          { label: 'Deps. impactadas', value: dep.impactados, color: dep.impactados > 0 ? C.amber : C.green },
          { label: 'Orcamento em risco', value: fmtMoney(diag.orcamento_risco), color: diag.orcamento_risco > 0 ? C.red : C.green, small: true },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: '14px 16px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: k.small ? 18 : 28, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.t3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: 'Area', value: filterArea, set: setFilterArea, opts: areas },
          { label: 'Tipo', value: filterTipo, set: setFilterTipo, opts: [{ v: 'projeto', l: 'Projetos' }, { v: 'expansao', l: 'Expansao' }] },
          { label: 'Status', value: filterStatus, set: setFilterStatus, opts: [{ v: 'atrasado', l: 'Atrasados' }, ...['pendente', 'em_andamento', 'bloqueado', 'pausado'].map(s => ({ v: s, l: s }))] },
          { label: 'Responsavel', value: filterResp, set: setFilterResp, opts: responsaveis },
        ].map(f => (
          <span key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t2 }}>{f.label}:</span>
            <select value={f.value} onChange={ev => f.set(ev.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, maxWidth: 180 }}>
              <option value="all">Todos</option>
              {f.opts.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </span>
        ))}
        {hasFilters && <button onClick={() => { setFilterArea('all'); setFilterTipo('all'); setFilterStatus('all'); setFilterResp('all'); }} style={{ fontSize: 11, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Limpar</button>}
        <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>{filtered.length} itens</span>
      </div>

      {/* Lista de itens */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ maxHeight: selected ? 280 : 500, overflowY: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum item encontrado com esses filtros.</div>}
          {filtered.map(item => {
            const isActive = selected?.id === item.id;
            const atrasado = item._dias > 0 && item.status !== 'concluido';
            return (
              <div key={item.id + item._tipo} onClick={() => selectItem(item)} style={{
                padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                background: isActive ? C.primaryBg : 'transparent', borderLeft: isActive ? `3px solid ${C.primary}` : '3px solid transparent',
              }}
                onMouseEnter={ev => { if (!isActive) ev.currentTarget.style.background = C.bg; }}
                onMouseLeave={ev => { if (!isActive) ev.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: item._tipo === 'projeto' ? '#3b82f618' : '#8b5cf618', color: item._tipo === 'projeto' ? C.blue : C.purple, fontWeight: 700, flexShrink: 0 }}>{item._tipo === 'projeto' ? 'Proj' : 'Exp'}</span>
                {item.area && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 500, flexShrink: 0 }}>{item.area}</span>}
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, minWidth: 80 }}>{item.responsible || '-'}</span>
                <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, minWidth: 80 }}>{fmtDate(item.date_end)}</span>
                {atrasado ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.red, flexShrink: 0, minWidth: 65, textAlign: 'right' }}>{item._dias}d atraso</span>
                ) : item.status === 'concluido' ? (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#10b98118', color: C.green, fontWeight: 600, flexShrink: 0 }}>Concluido</span>
                ) : item.date_end && item._dias <= 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.green, flexShrink: 0, minWidth: 65, textAlign: 'right' }}>{Math.abs(item._dias)}d restantes</span>
                ) : (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#9ca3af18', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{item.status || 'pendente'}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════ PAINEL DE EDICAO + IMPACTO ═══════ */}
      {selected && (
        <div ref={panelRef} style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 24 }}>
          {/* Header do painel */}
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--cbrio-table-header)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: selected._tipo === 'projeto' ? '#3b82f620' : '#8b5cf620', color: selected._tipo === 'projeto' ? C.blue : C.purple, fontWeight: 700 }}>{selected._tipo === 'projeto' ? 'Projeto' : 'Expansao'}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{selected.name}</span>
            </div>
            <button onClick={() => { setSelected(null); setImpacto(null); }} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>{'\u2715'}</button>
          </div>

          {/* Corpo: split edicao + impacto */}
          <div style={{ display: 'grid', gridTemplateColumns: impacto?.dependentes?.length > 0 ? '1fr 1fr' : '1fr', minHeight: 300 }}>

            {/* LADO ESQUERDO: formulario de edicao */}
            <div style={{ padding: 20, borderRight: impacto?.dependentes?.length > 0 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Editar</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
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
                  }} style={{ ...INPUT, borderColor: form.date_end !== selected.date_end ? C.primary : undefined }} />
                </div>
                <div>
                  <label style={LABEL}>Orcamento planejado</label>
                  <input type="number" value={form.budget_planned ?? ''} onChange={ev => setForm(f => ({ ...f, budget_planned: Number(ev.target.value) || 0 }))} style={INPUT} />
                </div>
                {selected._tipo === 'projeto' ? (
                  <div>
                    <label style={LABEL}>Prioridade</label>
                    <select value={form.priority || 'media'} onChange={ev => setForm(f => ({ ...f, priority: ev.target.value }))} style={INPUT}>
                      {['baixa', 'media', 'alta', 'urgente'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={LABEL}>Fase</label>
                    <input value={form.phase || ''} onChange={ev => setForm(f => ({ ...f, phase: ev.target.value }))} style={INPUT} />
                  </div>
                )}
                <div>
                  <label style={LABEL}>Area</label>
                  <input value={form.area || ''} onChange={ev => setForm(f => ({ ...f, area: ev.target.value }))} style={INPUT} />
                </div>
                {selected._tipo === 'projeto' && (
                  <div>
                    <label style={LABEL}>Ano</label>
                    <input type="number" value={form.year || ''} onChange={ev => setForm(f => ({ ...f, year: Number(ev.target.value) || null }))} style={INPUT} />
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={LABEL}>Descricao / Objetivo</label>
                <textarea value={form.description || ''} onChange={ev => setForm(f => ({ ...f, description: ev.target.value }))} rows={2} style={{ ...INPUT, resize: 'vertical' }} />
              </div>

              {selected._tipo === 'projeto' && (
                <div style={{ marginTop: 10 }}>
                  <label style={LABEL}>Notas / Entrega esperada</label>
                  <textarea value={form.notes || ''} onChange={ev => setForm(f => ({ ...f, notes: ev.target.value }))} rows={2} style={{ ...INPUT, resize: 'vertical' }} />
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <label style={LABEL}>Motivo da revisao</label>
                <input value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Ex: Reuniao com Pedro 24/04 — decidido postergar para Q3" style={INPUT} />
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button onClick={salvar} disabled={saving} style={{ padding: '9px 28px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Salvar alteracoes'}</button>
                <button onClick={() => { setSelected(null); setImpacto(null); }} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>

            {/* LADO DIREITO: impacto + historico */}
            {impacto?.dependentes?.length > 0 && (
              <div style={{ padding: 20, overflowY: 'auto', maxHeight: 550 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Impacto da alteracao</div>

                {/* Resumo do impacto */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: C.red + '10', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.red }}>{impacto.total_impactados}</div>
                    <div style={{ fontSize: 10, color: C.t3 }}>marcos afetados</div>
                  </div>
                  <div style={{ background: C.amber + '10', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.amber }}>{fmtMoney(impacto.custo_impactado)}</div>
                    <div style={{ fontSize: 10, color: C.t3 }}>orcamento afetado</div>
                  </div>
                </div>

                {impacto.delta_dias !== 0 && (
                  <div style={{ background: C.amber + '10', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: C.amber, fontWeight: 600 }}>
                    Deslocamento: {impacto.delta_dias > 0 ? '+' : ''}{impacto.delta_dias} dias {impacto.delta_dias > 0 ? '(adiamento)' : '(antecipacao)'}
                  </div>
                )}

                {/* Lista de dependentes */}
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>Marcos dependentes</div>
                {impacto.dependentes.map(d => (
                  <div key={d.id} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 6, border: `1px solid ${C.border}`, background: d.is_direct ? C.red + '08' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: d.is_direct ? C.red + '20' : C.amber + '20', color: d.is_direct ? C.red : C.amber, fontWeight: 700 }}>{d.is_direct ? 'direto' : 'cascata'}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{d.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, display: 'flex', gap: 12 }}>
                      <span>Prazo atual: {fmtDate(d.date_end)}</span>
                      {d.data_projetada && d.data_projetada !== d.date_end && (
                        <span style={{ color: C.red, fontWeight: 600 }}>Projetado: {fmtDate(d.data_projetada)}</span>
                      )}
                      {d.budget_planned > 0 && <span>Orcamento: {fmtMoney(d.budget_planned)}</span>}
                    </div>
                    {d.responsible && <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>Resp: {d.responsible}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historico de alteracoes */}
          {historico.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 8 }}>Historico de revisoes ({historico.length})</div>
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {historico.map(h => (
                  <div key={h.id} style={{ fontSize: 11, color: C.t3, padding: '3px 0', display: 'flex', gap: 8 }}>
                    <span style={{ color: C.t2, fontWeight: 500, flexShrink: 0, minWidth: 75 }}>{fmtDate(h.created_at?.split('T')[0])}</span>
                    <span><strong style={{ color: C.text }}>{h.campo}</strong>: {h.valor_anterior || '(vazio)'} {'\u2192'} {h.valor_novo}</span>
                    {h.changed_by_name && <span style={{ flexShrink: 0 }}>por {h.changed_by_name}</span>}
                    {h.motivo && <span style={{ color: C.amber, fontStyle: 'italic' }}>"{h.motivo}"</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
