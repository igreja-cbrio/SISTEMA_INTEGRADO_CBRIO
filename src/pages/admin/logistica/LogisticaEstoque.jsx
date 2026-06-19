import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { logistica } from '../../../api';
import { toast } from 'sonner';

// ── Tema (mesma paleta do módulo Logística · CSS vars do CBRio) ──────────────
const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', text: 'var(--cbrio-text)',
  text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  green: '#10b981', greenBg: '#10b98118', red: '#ef4444', redBg: '#ef444418',
  amber: '#f59e0b', amberBg: '#f59e0b18', blue: '#3b82f6', blueBg: '#3b82f618',
};
const st = {
  subtabs: { display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' },
  subtab: (a) => ({ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: a ? C.primary : 'transparent', color: a ? '#fff' : C.text2 }),
  card: { background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '10px 14px', fontSize: 14, color: C.text, borderBottom: `1px solid ${C.border}` },
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: c, background: bg }),
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)' },
  label: { fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  btn: (v = 'primary') => ({ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', ...(v === 'primary' ? { background: C.primary, color: '#fff' } : v === 'sec' ? { background: 'transparent', color: C.primary, border: `1px solid ${C.primary}` } : { background: 'transparent', color: C.text2 }) }),
  empty: { textAlign: 'center', padding: 36, color: C.text3, fontSize: 14 },
  kpi: (color) => ({ position: 'relative', overflow: 'hidden', background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', borderRadius: 16, padding: 14, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)' }),
  kpiTint: (color) => ({ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${color}22, transparent 58%)`, pointerEvents: 'none' }),
  kpiBar: (color) => ({ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.9 }),
};
const CATEGORIAS = ['Limpeza', 'Descartáveis', 'Alimentos', 'Bebidas', 'Papelaria', 'Infra', 'Ministerial', 'Livraria'];
const SUBTIPOS_INFRA = ['Elétrico', 'Hidráulico', 'Pintura', 'Refrigeração', 'Mat. Const.', 'Ferramenta'];
const AREAS = ['Recepção', 'Kids', 'Culto', 'Manutenção', 'Cozinha', 'Limpeza', 'Escritório', 'Eventos', 'Outro'];
const TIPO_META = {
  entrada: { c: C.green, bg: C.greenBg, label: 'Entrada' },
  saida: { c: C.red, bg: C.redBg, label: 'Saída' },
  ajuste: { c: C.amber, bg: C.amberBg, label: 'Ajuste' },
};
const fmtMoney = (v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
const fmtDate = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const diasAte = (d) => Math.round((new Date(String(d).slice(0, 10) + 'T12:00:00') - Date.now()) / 86400000);

export default function LogisticaEstoque() {
  const [sub, setSub] = useState('produtos');
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState({ busca: '', categoria: '', repor: false });

  const loadProdutos = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtro.categoria) params.categoria = filtro.categoria;
      if (filtro.busca) params.busca = filtro.busca;
      if (filtro.repor) params.repor = 'true';
      setProdutos(await logistica.estoque.produtos(params) || []);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [filtro]);
  useEffect(() => { loadProdutos(); }, [loadProdutos]);

  // produtos completos (sem filtro) p/ os selects de lançamento
  const [todos, setTodos] = useState([]);
  const recarregarTodos = useCallback(async () => {
    try { setTodos(await logistica.estoque.produtos() || []); } catch (_) {}
  }, []);
  useEffect(() => { recarregarTodos(); }, [recarregarTodos]);

  const totais = useMemo(() => {
    const ativos = produtos.length;
    const repor = produtos.filter(p => p.precisa_repor).length;
    const valor = produtos.reduce((s, p) => s + (Number(p.valor_total) || 0), 0);
    return { ativos, repor, valor };
  }, [produtos]);

  return (
    <div>
      <div style={st.subtabs}>
        {[['produtos', 'Produtos'], ['lancar', 'Lançar'], ['movs', 'Movimentações'], ['validade', 'Validade'], ['consumo', 'Consumo por área'], ['relatorios', 'Relatórios']].map(([k, lbl]) => (
          <button key={k} style={st.subtab(sub === k)} onClick={() => setSub(k)}>{lbl}</button>
        ))}
      </div>

      {sub === 'produtos' && (
        <ProdutosView produtos={produtos} loading={loading} filtro={filtro} setFiltro={setFiltro} totais={totais}
          onChanged={() => { loadProdutos(); recarregarTodos(); }} />
      )}
      {sub === 'lancar' && <LancarView produtos={todos} onLancado={() => { loadProdutos(); recarregarTodos(); }} />}
      {sub === 'movs' && <MovsView />}
      {sub === 'validade' && <ValidadeView />}
      {sub === 'consumo' && <ConsumoView />}
      {sub === 'relatorios' && <RelatorioView />}
    </div>
  );
}

// ── Produtos ─────────────────────────────────────────────────────────────────
function ProdutosView({ produtos, loading, filtro, setFiltro, totais, onChanged }) {
  const [edit, setEdit] = useState(null); // produto em edição/criação
  const [sel, setSel] = useState(() => new Set()); // ids marcados p/ gerar compra
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function gerarCompra() {
    if (!sel.size) return;
    try {
      await logistica.estoque.gerarCompra([...sel]);
      toast.success('Solicitação de compra criada · está na fila da Logística (/solicitações).');
      setSel(new Set());
    } catch (e) { toast.error(e.message); }
  }

  async function remover(p) {
    if (!window.confirm(`Desativar "${p.nome}"? O histórico é preservado.`)) return;
    try { await logistica.estoque.removerProduto(p.id); toast.success('Produto desativado.'); onChanged(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        <div style={st.kpi(C.primary)}><div style={st.kpiTint(C.primary)} /><div style={st.kpiBar(C.primary)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{totais.ativos}</div><div style={{ fontSize: 12, color: C.text2 }}>Produtos ativos</div></div></div>
        <div style={st.kpi(C.red)}><div style={st.kpiTint(C.red)} /><div style={st.kpiBar(C.red)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 22, fontWeight: 700, color: totais.repor ? C.red : C.text }}>{totais.repor}</div><div style={{ fontSize: 12, color: C.text2 }}>A repor (≤ mínimo)</div></div></div>
        <div style={st.kpi(C.green)}><div style={st.kpiTint(C.green)} /><div style={st.kpiBar(C.green)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{fmtMoney(totais.valor)}</div><div style={{ fontSize: 12, color: C.text2 }}>Valor em estoque</div></div></div>
      </div>

      <div style={st.filterRow}>
        <input style={{ ...st.input, flex: 1, minWidth: 180 }} placeholder="Buscar produto..." value={filtro.busca}
          onChange={e => setFiltro(f => ({ ...f, busca: e.target.value }))} />
        <select style={st.input} value={filtro.categoria} onChange={e => setFiltro(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button style={st.btn(filtro.repor ? 'primary' : 'sec')} onClick={() => setFiltro(f => ({ ...f, repor: !f.repor }))}>A repor</button>
        {sel.size > 0 && <button style={st.btn('primary')} onClick={gerarCompra}>Gerar compra ({sel.size})</button>}
        <button style={{ ...st.btn('primary'), marginLeft: 'auto' }} onClick={() => setEdit({})}>+ Novo produto</button>
      </div>

      <div style={st.card}>
        <table style={st.table}>
          <thead><tr>
            <th style={{ ...st.th, width: 32 }}></th>
            <th style={st.th}>Produto</th><th style={st.th}>Categoria</th>
            <th style={{ ...st.th, textAlign: 'right' }}>Saldo</th><th style={{ ...st.th, textAlign: 'right' }}>Mínimo</th>
            <th style={{ ...st.th, textAlign: 'right' }}>Valor un.</th><th style={{ ...st.th, textAlign: 'right' }}>Total</th>
            <th style={st.th}></th><th style={st.th}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td style={st.td} colSpan={9}>Carregando...</td></tr>
              : produtos.length === 0 ? <tr><td colSpan={9} style={st.empty}>Nenhum produto.</td></tr>
                : produtos.map(p => (
                  <tr key={p.id} style={sel.has(p.id) ? { background: C.primary + '10' } : undefined}>
                    <td style={st.td}><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></td>
                    <td style={st.td}>
                      {p.nome}
                      {p.controla_validade && <span style={{ ...st.badge(C.blue, C.blueBg), marginLeft: 6 }}>validade</span>}
                    </td>
                    <td style={st.td}>{p.categoria || '—'}{p.subtipo_infra ? ` · ${p.subtipo_infra}` : ''}</td>
                    <td style={{ ...st.td, textAlign: 'right', fontWeight: 700, color: p.precisa_repor ? C.red : C.text }}>{p.saldo}</td>
                    <td style={{ ...st.td, textAlign: 'right', color: C.text2 }}>{p.quantidade_minima || '—'}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{fmtMoney(p.valor_unitario)}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{fmtMoney(p.valor_total)}</td>
                    <td style={st.td}>{p.precisa_repor && <span style={st.badge(C.red, C.redBg)}>Repor</span>}</td>
                    <td style={{ ...st.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={st.btn('ghost')} onClick={() => setEdit(p)}>Editar</button>
                      <button style={{ ...st.btn('ghost'), color: C.red }} onClick={() => remover(p)}>Remover</button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {edit && <ProdutoModal produto={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />}
    </div>
  );
}

function ProdutoModal({ produto, onClose, onSaved }) {
  const novo = !produto.id;
  const [f, setF] = useState({
    nome: produto.nome || '', categoria: produto.categoria || '', subtipo_infra: produto.subtipo_infra || '',
    unidade: produto.unidade || '', valor_unitario: produto.valor_unitario ?? '', quantidade_minima: produto.quantidade_minima ?? '',
    controla_validade: !!produto.controla_validade, observacoes: produto.observacoes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function salvar() {
    if (!f.nome.trim()) { toast.error('Informe o nome.'); return; }
    setSaving(true);
    try {
      const payload = { ...f, subtipo_infra: f.categoria === 'Infra' ? f.subtipo_infra || null : null };
      if (novo) await logistica.estoque.criarProduto(payload);
      else await logistica.estoque.atualizarProduto(produto.id, payload);
      toast.success(novo ? 'Produto criado.' : 'Produto atualizado.');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: 60, zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--panel)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)', border: '1px solid var(--hairline)', borderRadius: 16, width: '95%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: 24, boxShadow: 'var(--shadow-hover), var(--hi)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 16 }}>{novo ? 'Novo produto' : 'Editar produto'}</h3>
        <div style={{ marginBottom: 12 }}><label style={st.label}>Nome *</label><input style={{ ...st.input, width: '100%' }} value={f.nome} onChange={e => set('nome', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={st.label}>Categoria</label>
            <select style={{ ...st.input, width: '100%' }} value={f.categoria} onChange={e => set('categoria', e.target.value)}>
              <option value="">—</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {f.categoria === 'Infra' && (
            <div><label style={st.label}>Subtipo (Infra)</label>
              <select style={{ ...st.input, width: '100%' }} value={f.subtipo_infra} onChange={e => set('subtipo_infra', e.target.value)}>
                <option value="">—</option>{SUBTIPOS_INFRA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div><label style={st.label}>Valor unitário (R$)</label><input style={{ ...st.input, width: '100%' }} type="number" step="0.01" value={f.valor_unitario} onChange={e => set('valor_unitario', e.target.value)} /></div>
          <div><label style={st.label}>Quantidade mínima</label><input style={{ ...st.input, width: '100%' }} type="number" value={f.quantidade_minima} onChange={e => set('quantidade_minima', e.target.value)} /></div>
          <div><label style={st.label}>Unidade</label><input style={{ ...st.input, width: '100%' }} placeholder="un, caixa, litro..." value={f.unidade} onChange={e => set('unidade', e.target.value)} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 14, color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.controla_validade} onChange={e => set('controla_validade', e.target.checked)} />
          Controla validade (perecível · entradas pedem a validade do lote)
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button style={st.btn('ghost')} onClick={onClose}>Cancelar</button>
          <button style={st.btn('primary')} onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Lançar (entrada/saída/ajuste · multi-linha p/ inventário/recebimento) ──────
function LancarView({ produtos, onLancado }) {
  const [linha, setLinha] = useState({ produto_id: '', tipo: 'entrada', quantidade: '', validade: '', area_destino: '', data_movimentacao: new Date().toISOString().slice(0, 10), motivo: '' });
  const [fila, setFila] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setLinha(s => ({ ...s, [k]: v }));
  const prodMap = useMemo(() => Object.fromEntries(produtos.map(p => [p.id, p])), [produtos]);
  const prod = prodMap[linha.produto_id];
  const pedeValidade = prod?.controla_validade && linha.tipo !== 'saida';

  function adicionar() {
    if (!linha.produto_id) { toast.error('Escolha o produto.'); return; }
    const qtd = Number(linha.quantidade);
    if (!qtd) { toast.error('Quantidade inválida.'); return; }
    setFila(f => [...f, { ...linha, _nome: prod?.nome }]);
    setLinha(s => ({ ...s, produto_id: '', quantidade: '', validade: '', motivo: '' })); // mantém tipo/data/área
  }
  async function lancar() {
    if (!fila.length) { toast.error('Adicione ao menos um movimento.'); return; }
    setSaving(true);
    try {
      await logistica.estoque.lancar(fila.map(l => ({
        produto_id: l.produto_id, tipo: l.tipo, quantidade: Number(l.quantidade),
        validade: l.validade || null, area_destino: l.area_destino || null,
        data_movimentacao: l.data_movimentacao, motivo: l.motivo || null,
      })));
      toast.success(`${fila.length} movimento(s) lançado(s).`);
      setFila([]); onLancado();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  const grupos = useMemo(() => {
    const g = {}; produtos.forEach(p => { (g[p.categoria || 'Outros'] = g[p.categoria || 'Outros'] || []).push(p); });
    return g;
  }, [produtos]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,360px) 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ ...st.card, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Adicionar movimento</div>
        <div style={{ marginBottom: 10 }}><label style={st.label}>Tipo</label>
          <select style={{ ...st.input, width: '100%' }} value={linha.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="entrada">Entrada (recebimento)</option>
            <option value="saida">Saída (consumo)</option>
            <option value="ajuste">Ajuste / inventário</option>
          </select>
        </div>
        <div style={{ marginBottom: 10 }}><label style={st.label}>Produto</label>
          <select style={{ ...st.input, width: '100%' }} value={linha.produto_id} onChange={e => set('produto_id', e.target.value)}>
            <option value="">Selecione...</option>
            {Object.keys(grupos).sort().map(cat => (
              <optgroup key={cat} label={cat}>
                {grupos[cat].map(p => <option key={p.id} value={p.id}>{p.nome} (saldo {p.saldo})</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}><label style={st.label}>{linha.tipo === 'ajuste' ? 'Quantidade (use − para baixar)' : 'Quantidade'}</label>
          <input style={{ ...st.input, width: '100%' }} type="number" step="any" value={linha.quantidade} onChange={e => set('quantidade', e.target.value)} /></div>
        {pedeValidade && (
          <div style={{ marginBottom: 10 }}><label style={st.label}>Validade do lote</label>
            <input style={{ ...st.input, width: '100%' }} type="date" value={linha.validade} onChange={e => set('validade', e.target.value)} />
            <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>Validades diferentes? Adicione uma linha por lote.</div>
          </div>
        )}
        {linha.tipo === 'saida' && (
          <div style={{ marginBottom: 10 }}><label style={st.label}>Área / destino</label>
            <select style={{ ...st.input, width: '100%' }} value={linha.area_destino} onChange={e => set('area_destino', e.target.value)}>
              <option value="">—</option>{AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 10 }}><label style={st.label}>Data</label>
          <input style={{ ...st.input, width: '100%' }} type="date" value={linha.data_movimentacao} onChange={e => set('data_movimentacao', e.target.value)} /></div>
        <div style={{ marginBottom: 12 }}><label style={st.label}>Motivo / obs (opcional)</label>
          <input style={{ ...st.input, width: '100%' }} value={linha.motivo} onChange={e => set('motivo', e.target.value)} /></div>
        <button style={{ ...st.btn('sec'), width: '100%' }} onClick={adicionar}>+ Adicionar à lista</button>
      </div>

      <div style={st.card}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>A lançar ({fila.length})</div>
          <button style={st.btn('primary')} onClick={lancar} disabled={saving || !fila.length}>{saving ? 'Lançando...' : `Lançar ${fila.length || ''}`}</button>
        </div>
        {fila.length === 0 ? <div style={st.empty}>Monte a lista à esquerda. Serve pra inventário (lançar tudo de uma vez), recebimento de compra e baixas.</div>
          : (
            <table style={st.table}>
              <thead><tr><th style={st.th}>Tipo</th><th style={st.th}>Produto</th><th style={{ ...st.th, textAlign: 'right' }}>Qtd</th><th style={st.th}>Validade</th><th style={st.th}>Área</th><th style={st.th}></th></tr></thead>
              <tbody>
                {fila.map((l, i) => (
                  <tr key={i}>
                    <td style={st.td}><span style={st.badge(TIPO_META[l.tipo].c, TIPO_META[l.tipo].bg)}>{TIPO_META[l.tipo].label}</span></td>
                    <td style={st.td}>{l._nome}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{l.quantidade}</td>
                    <td style={st.td}>{l.validade ? fmtDate(l.validade) : '—'}</td>
                    <td style={st.td}>{l.area_destino || '—'}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}><button style={{ ...st.btn('ghost'), color: C.red }} onClick={() => setFila(f => f.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ── Movimentações (razão) ──────────────────────────────────────────────────────
function MovsView() {
  const [movs, setMovs] = useState([]);
  const [tipo, setTipo] = useState('');
  const [dias, setDias] = useState('90');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const p = {}; if (tipo) p.tipo = tipo; if (dias) p.dias = dias;
    logistica.estoque.movimentacoes(p).then(d => setMovs(d || [])).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [tipo, dias]);
  return (
    <div>
      <div style={st.filterRow}>
        <select style={st.input} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option><option value="ajuste">Ajustes</option>
        </select>
        <select style={st.input} value={dias} onChange={e => setDias(e.target.value)}>
          <option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option><option value="">Tudo</option>
        </select>
      </div>
      <div style={st.card}>
        <table style={st.table}>
          <thead><tr><th style={st.th}>Data</th><th style={st.th}>Tipo</th><th style={st.th}>Produto</th><th style={{ ...st.th, textAlign: 'right' }}>Qtd</th><th style={st.th}>Validade</th><th style={st.th}>Área</th><th style={st.th}>Por</th><th style={st.th}>Motivo</th></tr></thead>
          <tbody>
            {loading ? <tr><td style={st.td} colSpan={9}>Carregando...</td></tr>
              : movs.length === 0 ? <tr><td colSpan={9} style={st.empty}>Sem movimentações no período.</td></tr>
                : movs.map(m => (
                  <tr key={m.id}>
                    <td style={st.td}>{fmtDate(m.data_movimentacao)}</td>
                    <td style={st.td}><span style={st.badge(TIPO_META[m.tipo]?.c, TIPO_META[m.tipo]?.bg)}>{TIPO_META[m.tipo]?.label || m.tipo}</span></td>
                    <td style={st.td}>{m.produto?.nome || '—'}</td>
                    <td style={{ ...st.td, textAlign: 'right', fontWeight: 600, color: m.tipo === 'saida' ? C.red : C.green }}>{m.tipo === 'saida' ? '−' : (m.tipo === 'ajuste' && m.quantidade < 0 ? '' : '+')}{m.quantidade}</td>
                    <td style={st.td}>{m.validade ? fmtDate(m.validade) : '—'}</td>
                    <td style={st.td}>{m.area_destino || '—'}</td>
                    <td style={st.td}>{m.autor?.name || '—'}</td>
                    <td style={{ ...st.td, color: C.text2 }}>{m.motivo || '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Validade (lotes vencendo · FEFO) ───────────────────────────────────────────
function ValidadeView() {
  const [lotes, setLotes] = useState([]);
  const [dias, setDias] = useState('30');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    logistica.estoque.lotes(dias === '' ? undefined : dias).then(d => setLotes(d || [])).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [dias]);
  return (
    <div>
      <div style={st.filterRow}>
        <label style={{ fontSize: 13, color: C.text2 }}>Vencendo em:</label>
        <select style={st.input} value={dias} onChange={e => setDias(e.target.value)}>
          <option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option><option value="60">60 dias</option><option value="">Todos os lotes</option>
        </select>
      </div>
      <div style={st.card}>
        <table style={st.table}>
          <thead><tr><th style={st.th}>Produto</th><th style={st.th}>Validade</th><th style={{ ...st.th, textAlign: 'right' }}>Restante</th><th style={st.th}>Situação</th></tr></thead>
          <tbody>
            {loading ? <tr><td style={st.td} colSpan={4}>Carregando...</td></tr>
              : lotes.length === 0 ? <tr><td colSpan={4} style={st.empty}>Nenhum lote {dias ? `vencendo nesse prazo` : 'cadastrado'}. 🎉</td></tr>
                : lotes.map((l, i) => {
                  const dd = diasAte(l.validade);
                  const cor = dd < 0 ? C.red : dd <= 7 ? C.amber : C.green;
                  return (
                    <tr key={i}>
                      <td style={st.td}>{l.produto}</td>
                      <td style={st.td}>{fmtDate(l.validade)}</td>
                      <td style={{ ...st.td, textAlign: 'right', fontWeight: 600 }}>{l.restante}{l.unidade ? ` ${l.unidade}` : ''}</td>
                      <td style={st.td}><span style={st.badge(cor, cor + '18')}>{dd < 0 ? `vencido há ${-dd}d` : dd === 0 ? 'vence hoje' : `vence em ${dd}d`}</span></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Consumo por área ───────────────────────────────────────────────────────────
function ConsumoView() {
  const [data, setData] = useState({ itens: [] });
  const [dias, setDias] = useState(90);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    logistica.estoque.consumo(dias).then(d => setData(d || { itens: [] })).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [dias]);
  const totalCusto = (data.itens || []).reduce((s, i) => s + (i.custo || 0), 0);
  return (
    <div>
      <div style={st.filterRow}>
        <label style={{ fontSize: 13, color: C.text2 }}>Período:</label>
        <select style={st.input} value={dias} onChange={e => setDias(Number(e.target.value))}>
          <option value={30}>30 dias</option><option value={90}>90 dias</option><option value={180}>6 meses</option><option value={365}>1 ano</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: C.text2 }}>Total consumido: <b style={{ color: C.text }}>{fmtMoney(totalCusto)}</b></span>
      </div>
      <div style={st.card}>
        <table style={st.table}>
          <thead><tr><th style={st.th}>Área / destino</th><th style={{ ...st.th, textAlign: 'right' }}>Saídas</th><th style={{ ...st.th, textAlign: 'right' }}>Qtd</th><th style={{ ...st.th, textAlign: 'right' }}>Custo</th></tr></thead>
          <tbody>
            {loading ? <tr><td style={st.td} colSpan={4}>Carregando...</td></tr>
              : (data.itens || []).length === 0 ? <tr><td colSpan={4} style={st.empty}>Sem saídas no período.</td></tr>
                : data.itens.map((i, idx) => (
                  <tr key={idx}>
                    <td style={st.td}>{i.area}</td>
                    <td style={{ ...st.td, textAlign: 'right', color: C.text2 }}>{i.saidas}</td>
                    <td style={{ ...st.td, textAlign: 'right' }}>{i.qtd}</td>
                    <td style={{ ...st.td, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(i.custo)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Relatórios (visão geral do estoque) ────────────────────────────────────────
function RelatorioView() {
  const [dias, setDias] = useState(90);
  const [rel, setRel] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Promise.all([logistica.estoque.relatorio(dias), logistica.estoque.lotes(30)])
      .then(([r, l]) => { setRel(r); setLotes(Array.isArray(l) ? l : []); })
      .catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [dias]);

  if (loading || !rel) return <div style={st.empty}>Carregando relatório...</div>;
  const r = rel.resumo;
  const maxCat = Math.max(1, ...rel.por_categoria.map(c => c.valor));
  const serie = rel.serie_mensal.map(s => ({ ...s, lbl: `${s.mes.slice(5)}/${s.mes.slice(2, 4)}` }));
  const Painel = ({ title, children }) => (
    <div style={{ ...st.card, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
  const tdc = { ...st.td, padding: '6px 4px' };

  return (
    <div>
      <div style={st.filterRow}>
        <label style={{ fontSize: 13, color: C.text2 }}>Período:</label>
        <select style={st.input} value={dias} onChange={e => setDias(Number(e.target.value))}>
          <option value={30}>30 dias</option><option value={90}>90 dias</option><option value={180}>6 meses</option><option value={365}>1 ano</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        <div style={st.kpi(C.green)}><div style={st.kpiTint(C.green)} /><div style={st.kpiBar(C.green)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{fmtMoney(r.valor_total)}</div><div style={{ fontSize: 12, color: C.text2 }}>Valor em estoque</div></div></div>
        <div style={st.kpi(C.primary)}><div style={st.kpiTint(C.primary)} /><div style={st.kpiBar(C.primary)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{r.produtos}</div><div style={{ fontSize: 12, color: C.text2 }}>Produtos ativos</div></div></div>
        <div style={st.kpi(C.red)}><div style={st.kpiTint(C.red)} /><div style={st.kpiBar(C.red)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, color: r.a_repor ? C.red : C.text }}>{r.a_repor}</div><div style={{ fontSize: 12, color: C.text2 }}>A repor</div></div></div>
        <div style={st.kpi(C.amber)}><div style={st.kpiTint(C.amber)} /><div style={st.kpiBar(C.amber)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, color: lotes.length ? C.amber : C.text }}>{lotes.length}</div><div style={{ fontSize: 12, color: C.text2 }}>Vencendo (30d)</div></div></div>
        <div style={st.kpi(C.green)}><div style={st.kpiTint(C.green)} /><div style={st.kpiBar(C.green)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{fmtMoney(r.entradas_valor)}</div><div style={{ fontSize: 12, color: C.text2 }}>Entradas no período</div></div></div>
        <div style={st.kpi(C.red)}><div style={st.kpiTint(C.red)} /><div style={st.kpiBar(C.red)} /><div style={{ position: 'relative', zIndex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{fmtMoney(r.saidas_valor)}</div><div style={{ fontSize: 12, color: C.text2 }}>Saídas no período</div></div></div>
      </div>

      <div style={{ ...st.card, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Entradas × Saídas por mês (R$)</div>
        {serie.length === 0 ? <div style={st.empty}>Sem movimentações no período.</div> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={serie} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
              <XAxis dataKey="lbl" tick={{ fontSize: 12, fill: C.text2 }} />
              <YAxis tick={{ fontSize: 11, fill: C.text2 }} width={52} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="entradas" name="Entradas" fill={C.green} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={C.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 5 painéis em 3 colunas fixas → 3 + 2 (Vencendo nunca sobra esticado numa linha) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        <Painel title="Valor em estoque por categoria">
          {rel.por_categoria.length === 0 ? <div style={st.empty}>—</div> : rel.por_categoria.map(c => (
            <div key={c.categoria} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.text, marginBottom: 3 }}>
                <span>{c.categoria} <span style={{ color: C.text3 }}>({c.produtos})</span></span><span style={{ fontWeight: 600 }}>{fmtMoney(c.valor)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--cbrio-border)', borderRadius: 4 }}><div style={{ height: 6, width: `${(c.valor / maxCat) * 100}%`, background: C.primary, borderRadius: 4 }} /></div>
            </div>
          ))}
        </Painel>
        <Painel title="Mais consumidos (saídas no período)">
          {rel.top_consumo.length === 0 ? <div style={st.empty}>Sem saídas.</div> : (
            <table style={st.table}><tbody>{rel.top_consumo.map((t, i) => (
              <tr key={i}><td style={tdc}>{t.nome}</td><td style={{ ...tdc, textAlign: 'right', color: C.text2 }}>{t.qtd}</td><td style={{ ...tdc, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(t.valor)}</td></tr>
            ))}</tbody></table>
          )}
        </Painel>
        <Painel title="Mais recebidos (entradas no período)">
          {!rel.top_entradas || rel.top_entradas.length === 0 ? <div style={st.empty}>Sem entradas.</div> : (
            <table style={st.table}><tbody>{rel.top_entradas.map((t, i) => (
              <tr key={i}><td style={tdc}>{t.nome}</td><td style={{ ...tdc, textAlign: 'right', color: C.text2 }}>{t.qtd}</td><td style={{ ...tdc, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(t.valor)}</td></tr>
            ))}</tbody></table>
          )}
        </Painel>
        <Painel title="Capital parado (sem saída no período)">
          {rel.parados.length === 0 ? <div style={st.empty}>Tudo girando 🎉</div> : (
            <table style={st.table}><tbody>{rel.parados.map((p, i) => (
              <tr key={i}><td style={tdc}>{p.nome}</td><td style={{ ...tdc, textAlign: 'right', color: C.text2 }}>{p.saldo}</td><td style={{ ...tdc, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(p.valor)}</td></tr>
            ))}</tbody></table>
          )}
        </Painel>
        <Painel title="Consumo por área">
          {rel.consumo_area.length === 0 ? <div style={st.empty}>Sem saídas.</div> : (
            <table style={st.table}><tbody>{rel.consumo_area.map((a, i) => (
              <tr key={i}><td style={tdc}>{a.area}</td><td style={{ ...tdc, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(a.valor)}</td></tr>
            ))}</tbody></table>
          )}
        </Painel>
        <Painel title="Vencendo em 30 dias">
          {lotes.length === 0 ? <div style={st.empty}>Nenhum lote vencendo 🎉</div> : (
            <table style={st.table}><tbody>{lotes.slice(0, 12).map((l, i) => {
              const dd = diasAte(l.validade);
              return <tr key={i}><td style={tdc}>{l.produto}</td><td style={{ ...tdc, textAlign: 'right', color: C.text2 }}>{l.restante}</td><td style={{ ...tdc, textAlign: 'right', color: dd < 0 ? C.red : C.amber }}>{dd < 0 ? `−${-dd}d` : `${dd}d`}</td></tr>;
            })}</tbody></table>
          )}
        </Painel>
      </div>
    </div>
  );
}
