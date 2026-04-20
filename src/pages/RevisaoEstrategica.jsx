import { useState, useEffect, useCallback } from 'react';
import { revisoes } from '../api';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
};

function fmtDate(d) { if (!d) return '-'; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } }

const STATUS_BADGE = {
  rascunho: { color: '#9ca3af', label: 'Rascunho' },
  pendente_aprovacao: { color: '#f59e0b', label: 'Pendente aprovacao' },
  aprovado: { color: '#10b981', label: 'Aprovado' },
  aplicado: { color: '#3b82f6', label: 'Aplicado' },
  rejeitado: { color: '#ef4444', label: 'Rejeitado' },
};

export default function RevisaoEstrategica() {
  const [tab, setTab] = useState('diagnostico');
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pacotes, setPacotes] = useState([]);
  const [selectedPacote, setSelectedPacote] = useState(null);
  const [simulacao, setSimulacao] = useState(null);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [filterArea, setFilterArea] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState('all');
  const [pacoteAreas, setPacoteAreas] = useState([]);

  // Item form
  const [itemForm, setItemForm] = useState({ tipo: 'expansao', item_id: '', item_nome: '', campo: 'date_end', valor_atual: '', valor_proposto: '', motivo: '', lider: '' });

  const loadDiag = useCallback(async () => {
    setLoading(true);
    try { const d = await revisoes.diagnostico(); setDiag(d); } catch {}
    finally { setLoading(false); }
  }, []);

  const loadPacotes = async () => {
    try { const d = await revisoes.pacotes(); setPacotes(Array.isArray(d) ? d : []); } catch {}
  };

  useEffect(() => { loadDiag(); loadPacotes(); }, [loadDiag]);

  const simular = async (tipo, id) => {
    try { const d = await revisoes.simular(tipo, id); setSimulacao(d); } catch {}
  };

  // ── DIAGNOSTICO ──
  function renderDiagnostico() {
    if (loading || !diag) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando diagnostico...</div>;
    const { projetos: p, expansao: e, dependencias: dep } = diag;
    const hoje = new Date();

    // Extrair opcoes unicas
    const allItems = [...(p.lista || []).map(x => ({ ...x, _tipo: 'projeto' })), ...(e.lista || []).map(x => ({ ...x, _tipo: 'expansao' }))];
    const todasAreas = [...new Set(allItems.map(x => x.area).filter(Boolean))].sort();
    const todosStatus = [...new Set(allItems.map(x => x.status).filter(Boolean))].sort();
    const todosResp = [...new Set(allItems.map(x => x.responsible).filter(Boolean))].sort();

    // Filtrar
    const applyFilters = (list) => list.filter(x => {
      if (filterArea !== 'all' && x.area !== filterArea) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'atrasado') { if (!(x.date_end && x.date_end < hoje.toISOString().split('T')[0] && x.status !== 'concluido')) return false; }
        else if (x.status !== filterStatus) return false;
      }
      if (filterResp !== 'all' && x.responsible !== filterResp) return false;
      return true;
    });
    const projFiltrados = applyFilters(p.lista || []);
    const expFiltrados = applyFilters(e.lista || []);
    const projAtrasados = projFiltrados.filter(x => x.date_end && x.date_end < hoje.toISOString().split('T')[0] && x.status !== 'concluido');
    const expAtrasados = expFiltrados.filter(x => x.date_end && x.date_end < hoje.toISOString().split('T')[0] && x.status !== 'concluido');
    const hasFilters = filterArea !== 'all' || filterTipo !== 'all' || filterStatus !== 'all' || filterResp !== 'all';

    return (
      <div>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Area:</span>
          <select value={filterArea} onChange={e => setFilterArea(e.target.value)} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, minWidth: 180 }}>
            <option value="all">Todas as areas</option>
            {todasAreas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginLeft: 8 }}>Tipo:</span>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }}>
            <option value="all">Todos</option>
            <option value="projeto">Projetos</option>
            <option value="expansao">Expansao</option>
          </select>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginLeft: 8 }}>Status:</span>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }}>
            <option value="all">Todos</option>
            <option value="atrasado">Atrasados</option>
            {todosStatus.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginLeft: 8 }}>Responsavel:</span>
          <select value={filterResp} onChange={e => setFilterResp(e.target.value)} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, maxWidth: 200 }}>
            <option value="all">Todos</option>
            {todosResp.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {hasFilters && <button onClick={() => { setFilterArea('all'); setFilterTipo('all'); setFilterStatus('all'); setFilterResp('all'); }} style={{ fontSize: 11, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Limpar filtros</button>}
          <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>{projFiltrados.length} proj + {expFiltrados.length} marcos</span>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Projetos', value: projFiltrados.length, color: C.primary },
            { label: 'Proj. atrasados', value: projAtrasados.length, color: C.red },
            { label: 'Marcos', value: expFiltrados.length, color: C.blue },
            { label: 'Marcos atrasados', value: expAtrasados.length, color: C.red },
            { label: 'Deps. impactadas', value: dep.impactados, color: '#8b5cf6' },
          ].map(k => (
            <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: C.t3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Lista completa filtrada */}
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>
          Todos os itens {filterArea !== 'all' && `— ${filterArea}`} ({projFiltrados.length + expFiltrados.length})
        </div>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 24, maxHeight: 500, overflowY: 'auto' }}>
          {[...(filterTipo !== 'expansao' ? projFiltrados : []).map(x => ({ ...x, _tipo: 'projeto', _dias: x.date_end ? Math.ceil((hoje - new Date(x.date_end)) / 86400000) : 0 })),
            ...(filterTipo !== 'projeto' ? expFiltrados : []).map(x => ({ ...x, _tipo: 'expansao', _dias: x.date_end ? Math.ceil((hoje - new Date(x.date_end)) / 86400000) : 0 }))
          ].sort((a, b) => b._dias - a._dias).map(item => (
            <div key={item.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => simular(item._tipo, item.id)}
              onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: item._tipo === 'projeto' ? '#3b82f620' : '#8b5cf620', color: item._tipo === 'projeto' ? C.blue : '#8b5cf6', fontWeight: 600, flexShrink: 0 }}>{item._tipo === 'projeto' ? 'Proj' : 'Exp'}</span>
              {item.area && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: C.primaryBg, color: C.primary, fontWeight: 500, flexShrink: 0 }}>{item.area}</span>}
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: C.t3, flexShrink: 0 }}>{item.responsible || '-'}</span>
              <span style={{ fontSize: 11, color: C.t3, flexShrink: 0 }}>{fmtDate(item.date_end)}</span>
              {item._dias > 0 ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.red, flexShrink: 0 }}>{item._dias}d atraso</span>
              ) : item.status === 'concluido' ? (
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#10b98120', color: C.green, fontWeight: 600, flexShrink: 0 }}>Concluido</span>
              ) : (
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#9ca3af20', color: '#9ca3af', fontWeight: 500, flexShrink: 0 }}>{item.status || 'pendente'}</span>
              )}
            </div>
          ))}
          {p.atrasados.length + e.atrasados.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Nenhum item atrasado</div>}
        </div>

        {/* Simulacao */}
        {simulacao && (
          <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Impacto: {simulacao.marco?.name || simulacao.projeto?.name}</span>
              <button onClick={() => setSimulacao(null)} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 16 }}>{'\u2715'}</button>
            </div>
            <div style={{ fontSize: 13, color: C.t2, marginBottom: 8 }}>
              Total de marcos impactados: <strong style={{ color: C.red }}>{simulacao.total_impactados}</strong>
            </div>
            {simulacao.dependentes_diretos?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Dependentes diretos ({simulacao.dependentes_diretos.length}):</div>
                {simulacao.dependentes_diretos.map(d => (
                  <div key={d.id} style={{ fontSize: 12, color: C.t2, padding: '2px 0' }}>{'\u2022'} {d.name} (prazo: {fmtDate(d.date_end)})</div>
                ))}
              </div>
            )}
            {simulacao.cascata?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 4 }}>Cascata indireta ({simulacao.cascata.length}):</div>
                {simulacao.cascata.map(d => (
                  <div key={d.id} style={{ fontSize: 12, color: C.t3, padding: '2px 0' }}>{'\u2022'} {d.name}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── PACOTES ──
  function renderPacotes() {
    if (selectedPacote) return renderPacoteDetalhe();

    return (
      <div>
        {/* Criar pacote por area */}
        <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Novo pacote de revisao</div>
          <input placeholder="Titulo (ex: Revisao Infraestrutura Q2 2026)" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, marginBottom: 10 }} />
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>Selecione as areas para este pacote (projetos e marcos dessas areas serao incluidos):</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[...new Set([...(diag?.projetos?.lista || []).map(x => x.area), ...(diag?.expansao?.lista || []).map(x => x.area)].filter(Boolean))].sort().map(area => {
              const active = pacoteAreas.includes(area);
              return (
                <button key={area} onClick={() => setPacoteAreas(prev => active ? prev.filter(a => a !== area) : [...prev, area])} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: active ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                  background: active ? C.primaryBg : 'transparent', color: active ? C.primary : C.t3, fontWeight: active ? 600 : 400,
                }}>{area}</button>
              );
            })}
          </div>
          {pacoteAreas.length > 0 && (
            <div style={{ fontSize: 11, color: C.t2, marginBottom: 8 }}>
              {(diag?.projetos?.lista || []).filter(x => pacoteAreas.includes(x.area)).length} projetos + {(diag?.expansao?.lista || []).filter(x => pacoteAreas.includes(x.area)).length} marcos selecionados
            </div>
          )}
          <button onClick={async () => {
            if (!novoTitulo.trim() || pacoteAreas.length === 0) { toast.error('Preencha titulo e selecione ao menos 1 area'); return; }
            const pkg = await revisoes.criarPacote({ titulo: novoTitulo.trim(), descricao: `Areas: ${pacoteAreas.join(', ')}` });
            setNovoTitulo(''); setPacoteAreas([]);
            await loadPacotes();
            // Abrir pacote direto
            const d = await revisoes.pacotes();
            const created = (d || []).find(p => p.id === pkg.id);
            if (created) {
              // Pre-popular com os itens das areas selecionadas
              created._areas = pacoteAreas;
              created._projetos = (diag?.projetos?.lista || []).filter(x => pacoteAreas.includes(x.area));
              created._marcos = (diag?.expansao?.lista || []).filter(x => pacoteAreas.includes(x.area));
              setSelectedPacote(created);
            }
            toast.success('Pacote criado');
          }} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Criar pacote</button>
        </div>

        {/* Lista */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {(pacotes || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum pacote de revisao. Crie um acima.</div>
          ) : (pacotes || []).map(pkg => {
            const st = STATUS_BADGE[pkg.status] || STATUS_BADGE.rascunho;
            const itens = pkg.revision_items || [];
            return (
              <div key={pkg.id} onClick={() => setSelectedPacote(pkg)} style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{pkg.titulo}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{itens.length} alteracoes | {fmtDate(pkg.created_at?.split('T')[0])}</div>
                </div>
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: st.color + '20', color: st.color, fontWeight: 600 }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── DETALHE DO PACOTE ──
  function renderPacoteDetalhe() {
    const pkg = selectedPacote;
    const st = STATUS_BADGE[pkg.status] || STATUS_BADGE.rascunho;
    const itens = pkg.revision_items || [];
    const isRascunho = pkg.status === 'rascunho';
    const isAprovado = pkg.status === 'aprovado';

    // Lista de itens filtrada pelas areas do pacote
    const pkgAreas = pkg._areas || (pkg.descricao?.startsWith('Areas:') ? pkg.descricao.replace('Areas: ', '').split(', ') : []);
    const allItems = [
      ...(diag?.projetos?.lista || []).filter(p => pkgAreas.length === 0 || pkgAreas.includes(p.area)).map(p => ({ id: p.id, name: p.name, tipo: 'projeto', date_end: p.date_end, status: p.status, area: p.area, responsible: p.responsible })),
      ...(diag?.expansao?.lista || []).filter(m => pkgAreas.length === 0 || pkgAreas.includes(m.area)).map(m => ({ id: m.id, name: m.name, tipo: 'expansao', date_end: m.date_end, status: m.status, area: m.area, responsible: m.responsible })),
    ];

    return (
      <div>
        <button onClick={() => { setSelectedPacote(null); loadPacotes(); }} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{'\u2190'} Voltar</button>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{pkg.titulo}</div>
            <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 99, background: st.color + '20', color: st.color, fontWeight: 600 }}>{st.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isRascunho && <button onClick={async () => { await revisoes.mudarStatus(pkg.id, 'pendente_aprovacao'); setSelectedPacote({ ...pkg, status: 'pendente_aprovacao' }); toast.success('Enviado para aprovacao'); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Enviar p/ aprovacao</button>}
            {pkg.status === 'pendente_aprovacao' && <button onClick={async () => { await revisoes.mudarStatus(pkg.id, 'aprovado'); setSelectedPacote({ ...pkg, status: 'aprovado' }); toast.success('Aprovado!'); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.green, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Aprovar</button>}
            {isAprovado && <button onClick={async () => { const r = await revisoes.aplicar(pkg.id); toast.success(`${r.aplicados} alteracoes aplicadas!`); setSelectedPacote({ ...pkg, status: 'aplicado' }); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Aplicar alteracoes</button>}
            {isRascunho && <button onClick={async () => { if (window.confirm('Excluir pacote?')) { await revisoes.deletePacote(pkg.id); setSelectedPacote(null); await loadPacotes(); } }} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, fontSize: 12, cursor: 'pointer' }}>Excluir</button>}
          </div>
        </div>

        {/* Adicionar item */}
        {isRascunho && (
          <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Adicionar alteracao</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <select value={itemForm.item_id} onChange={e => { const item = allItems.find(x => x.id === e.target.value); setItemForm(f => ({ ...f, item_id: e.target.value, item_nome: item?.name || '', tipo: item?.tipo || 'expansao', valor_atual: item?.date_end || item?.status || '' })); }} style={{ flex: '1 1 250px', padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }}>
                <option value="">Selecione o item</option>
                <optgroup label="Projetos">{allItems.filter(x => x.tipo === 'projeto').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                <optgroup label="Expansao">{allItems.filter(x => x.tipo === 'expansao').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
              </select>
              <select value={itemForm.campo} onChange={e => setItemForm(f => ({ ...f, campo: e.target.value }))} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }}>
                <option value="date_end">Mover data</option>
                <option value="status">Mudar status</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {itemForm.campo === 'date_end' ? (
                <input type="date" value={itemForm.valor_proposto} onChange={e => setItemForm(f => ({ ...f, valor_proposto: e.target.value }))} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }} />
              ) : (
                <select value={itemForm.valor_proposto} onChange={e => setItemForm(f => ({ ...f, valor_proposto: e.target.value }))} style={{ padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }}>
                  <option value="">Novo status</option>
                  <option value="pausado">Pausado</option>
                  <option value="cancelado">Cancelado</option>
                  <option value="no-prazo">No prazo</option>
                  <option value="concluido">Concluido</option>
                </select>
              )}
              <input placeholder="Lider responsavel" value={itemForm.lider} onChange={e => setItemForm(f => ({ ...f, lider: e.target.value }))} style={{ flex: 1, padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12 }} />
            </div>
            <input placeholder="Motivo da alteracao (ex: sem verba, lider pediu adiamento)" value={itemForm.motivo} onChange={e => setItemForm(f => ({ ...f, motivo: e.target.value }))} style={{ width: '100%', padding: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, marginBottom: 8 }} />
            <button onClick={async () => {
              if (!itemForm.item_id || !itemForm.valor_proposto) { toast.error('Selecione item e valor'); return; }
              await revisoes.addItem(pkg.id, itemForm);
              const d = await revisoes.pacotes();
              const updated = (d || []).find(p => p.id === pkg.id);
              if (updated) setSelectedPacote(updated);
              setItemForm(f => ({ ...f, item_id: '', item_nome: '', valor_atual: '', valor_proposto: '', motivo: '', lider: '' }));
              toast.success('Alteracao adicionada');
            }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Adicionar ao pacote</button>
          </div>
        )}

        {/* Itens da area para referencia */}
        {isRascunho && allItems.length > 0 && (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Itens das areas selecionadas ({allItems.length}) — clique para adicionar ao pacote</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {allItems.map(item => {
                const hoje2 = new Date().toISOString().split('T')[0];
                const atrasado = item.date_end && item.date_end < hoje2 && item.status !== 'concluido';
                const jaNoPacke = itens.some(i => i.item_id === item.id);
                return (
                  <div key={item.id} style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, opacity: jaNoPacke ? 0.4 : 1, cursor: jaNoPacke ? 'default' : 'pointer' }}
                    onClick={() => { if (!jaNoPacke) setItemForm(f => ({ ...f, item_id: item.id, item_nome: item.name, tipo: item.tipo, valor_atual: item.date_end || item.status || '' })); }}
                    onMouseEnter={e => { if (!jaNoPacke) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: item.tipo === 'projeto' ? '#3b82f620' : '#8b5cf620', color: item.tipo === 'projeto' ? C.blue : '#8b5cf6', fontWeight: 600 }}>{item.tipo === 'projeto' ? 'Proj' : 'Exp'}</span>
                    <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{item.name}</span>
                    <span style={{ fontSize: 10, color: C.t3 }}>{item.area}</span>
                    <span style={{ fontSize: 10, color: C.t3 }}>{fmtDate(item.date_end)}</span>
                    {atrasado && <span style={{ fontSize: 9, color: C.red, fontWeight: 600 }}>atrasado</span>}
                    {jaNoPacke && <span style={{ fontSize: 9, color: C.green, fontWeight: 600 }}>no pacote</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Itens do pacote */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Alteracoes ({itens.length})</span>
          </div>
          {itens.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 12 }}>Nenhuma alteracao. Adicione acima.</div>
          ) : itens.map(item => (
            <div key={item.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: item.tipo === 'projeto' ? '#3b82f620' : '#8b5cf620', color: item.tipo === 'projeto' ? C.blue : '#8b5cf6', fontWeight: 600 }}>{item.tipo}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{item.item_nome}</span>
                {item.dependentes_afetados > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: '#ef444420', color: C.red, fontWeight: 600 }}>{item.dependentes_afetados} dependentes</span>}
                {isRascunho && <button onClick={async () => { await revisoes.removeItem(item.id); const d = await revisoes.pacotes(); const updated = (d || []).find(p => p.id === pkg.id); if (updated) setSelectedPacote(updated); }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 11 }}>{'\u2715'}</button>}
              </div>
              <div style={{ fontSize: 12, color: C.t2 }}>
                <strong>{item.campo === 'date_end' ? 'Data' : 'Status'}:</strong> {item.campo === 'date_end' ? `${fmtDate(item.valor_atual)} → ${fmtDate(item.valor_proposto)}` : `${item.valor_atual} → ${item.valor_proposto}`}
              </div>
              {item.lider && <div style={{ fontSize: 11, color: C.t3 }}>Lider: {item.lider}</div>}
              {item.motivo && <div style={{ fontSize: 11, color: C.t3 }}>Motivo: {item.motivo}</div>}
              {item.impacto_descricao && <div style={{ fontSize: 11, color: C.amber, marginTop: 2 }}>{item.impacto_descricao}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── RENDER ──
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>Revisao Estrategica</h1>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {[
          { key: 'diagnostico', label: 'Diagnostico' },
          { key: 'pacotes', label: 'Pacotes de revisao' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 24px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? C.primary : C.t3,
            borderBottom: tab === t.key ? `2px solid ${C.primary}` : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'diagnostico' && renderDiagnostico()}
      {tab === 'pacotes' && renderPacotes()}
    </div>
  );
}
