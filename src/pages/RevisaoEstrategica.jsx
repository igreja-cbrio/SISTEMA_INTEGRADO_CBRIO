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

    return (
      <div>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Projetos ativos', value: p.total, color: C.primary },
            { label: 'Proj. atrasados', value: p.atrasados.length, color: C.red },
            { label: 'Marcos expansao', value: e.total, color: C.blue },
            { label: 'Marcos atrasados', value: e.atrasados.length, color: C.red },
            { label: 'Marcos pendentes', value: e.pendentes.length, color: C.amber },
            { label: 'Deps. impactadas', value: dep.impactados, color: '#8b5cf6' },
          ].map(k => (
            <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: C.t3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Atrasados */}
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>Itens atrasados</div>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 24 }}>
          {[...p.atrasados.map(x => ({ ...x, _tipo: 'projeto', _dias: Math.ceil((hoje - new Date(x.date_end)) / 86400000) })),
            ...e.atrasados.map(x => ({ ...x, _tipo: 'expansao', _dias: Math.ceil((hoje - new Date(x.date_end)) / 86400000) }))
          ].sort((a, b) => b._dias - a._dias).map(item => (
            <div key={item.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => simular(item._tipo, item.id)}
              onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: item._tipo === 'projeto' ? '#3b82f620' : '#8b5cf620', color: item._tipo === 'projeto' ? C.blue : '#8b5cf6', fontWeight: 600 }}>{item._tipo === 'projeto' ? 'Projeto' : 'Expansao'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: C.t3 }}>{item.responsible || '-'}</span>
              <span style={{ fontSize: 11, color: C.t3 }}>{fmtDate(item.date_end)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>{item._dias}d atraso</span>
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
        {/* Criar pacote */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input placeholder="Titulo do pacote (ex: Revisao Q2 2026)" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13 }} onKeyDown={async e => {
            if (e.key === 'Enter' && novoTitulo.trim()) { await revisoes.criarPacote({ titulo: novoTitulo.trim() }); setNovoTitulo(''); await loadPacotes(); toast.success('Pacote criado'); }
          }} />
          <button onClick={async () => { if (novoTitulo.trim()) { await revisoes.criarPacote({ titulo: novoTitulo.trim() }); setNovoTitulo(''); await loadPacotes(); toast.success('Pacote criado'); } }} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Criar pacote</button>
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

    // Lista de itens para selecionar (diagnostico)
    const allItems = [...(diag?.projetos?.lista || []).map(p => ({ id: p.id, name: p.name, tipo: 'projeto', date_end: p.date_end, status: p.status })), ...(diag?.expansao?.lista || []).map(m => ({ id: m.id, name: m.name, tipo: 'expansao', date_end: m.date_end, status: m.status }))];

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
