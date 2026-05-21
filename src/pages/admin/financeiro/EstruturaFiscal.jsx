import { useState, useEffect, useCallback } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
};

const SUBTABS = ['Plano de Contas', 'Centros de Custo', 'Identificadores', 'Slots de Culto', 'Regras'];

export default function EstruturaFiscal() {
  const [sub, setSub] = useState(0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUBTABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setSub(i)}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
              cursor: 'pointer',
              border: `1px solid ${sub === i ? C.primary : C.border}`,
              background: sub === i ? C.primaryBg : 'transparent',
              color: sub === i ? C.primary : C.text2,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {sub === 0 && <PlanoContasPanel />}
      {sub === 1 && <CentrosCustoPanel />}
      {sub === 2 && <IdentificadoresPanel />}
      {sub === 3 && <CultoSlotsPanel />}
      {sub === 4 && <RegrasPanel />}
    </div>
  );
}

// ============================================================
// PLANO DE CONTAS
// ============================================================
function PlanoContasPanel() {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState({ tipo: '', search: '' });
  const [collapsed, setCollapsed] = useState(new Set());

  const load = useCallback(async () => {
    const list = await financeiroV2.planoContas.list({ ativo: 'true' });
    setData(list);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(d => {
    if (filter.tipo && d.tipo !== filter.tipo) return false;
    if (filter.search) {
      const s = filter.search.toLowerCase();
      return d.codigo.toLowerCase().includes(s) || d.nome.toLowerCase().includes(s);
    }
    return true;
  });

  const toggle = (codigo) => {
    const next = new Set(collapsed);
    if (next.has(codigo)) next.delete(codigo);
    else next.add(codigo);
    setCollapsed(next);
  };

  // Verifica se o pai esta colapsado pra esconder filhos
  const isHidden = (item) => {
    let pai = item.codigo_pai;
    while (pai) {
      if (collapsed.has(pai)) return true;
      const paiItem = data.find(d => d.codigo === pai);
      pai = paiItem?.codigo_pai || null;
    }
    return false;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filter.tipo} onChange={e => setFilter(f => ({ ...f, tipo: e.target.value }))}
          style={{ padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text }}>
          <option value="">Todos os tipos</option>
          <option value="ativo">Ativo</option>
          <option value="passivo">Passivo</option>
          <option value="receita">Receita</option>
          <option value="despesa">Despesa</option>
        </select>
        <input
          type="text"
          placeholder="Buscar por codigo ou nome..."
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, minWidth: 240, padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text }}
        />
        <div style={{ fontSize: 12, color: C.text3, alignSelf: 'center' }}>{filtered.length} contas</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {filtered.map((item, i) => {
          if (isHidden(item)) return null;
          const hasChildren = data.some(d => d.codigo_pai === item.codigo);
          const isCollapsed = collapsed.has(item.codigo);
          return (
            <div key={item.id}
              style={{
                display: 'flex', alignItems: 'center', padding: '8px 12px',
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                background: item.nivel <= 2 ? 'var(--cbrio-table-header)' : 'transparent',
                fontWeight: item.nivel <= 2 ? 700 : (item.nivel === 3 ? 600 : 400),
              }}>
              <div style={{ width: (item.nivel - 1) * 16 }} />
              {hasChildren ? (
                <button onClick={() => toggle(item.codigo)}
                  style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: C.text2, fontSize: 14 }}>
                  {isCollapsed ? '▶' : '▼'}
                </button>
              ) : <div style={{ width: 18 }} />}
              <code style={{ fontSize: 12, color: C.text2, fontFamily: 'monospace', marginRight: 12, minWidth: 110 }}>{item.codigo}</code>
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{item.nome}</span>
              <TipoBadge tipo={item.tipo} />
              {item.aceita_lancamento && (
                <span style={{ fontSize: 10, color: C.green, marginLeft: 8, padding: '2px 6px', background: C.greenBg, borderRadius: 4 }}>
                  lancamento
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TipoBadge({ tipo }) {
  const colors = {
    ativo:   { c: '#3b82f6', bg: '#3b82f618' },
    passivo: { c: '#f59e0b', bg: '#f59e0b18' },
    receita: { c: '#10b981', bg: '#10b98118' },
    despesa: { c: '#ef4444', bg: '#ef444418' },
  };
  const cor = colors[tipo] || { c: C.text3, bg: '#73737318' };
  return (
    <span style={{ fontSize: 10, color: cor.c, padding: '2px 6px', background: cor.bg, borderRadius: 4, fontWeight: 600, marginLeft: 8 }}>
      {tipo}
    </span>
  );
}

// ============================================================
// CENTROS DE CUSTO
// ============================================================
function CentrosCustoPanel() {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState({ campus: '', search: '' });
  const [collapsed, setCollapsed] = useState(new Set());

  useEffect(() => {
    financeiroV2.centrosCusto.list({ ativo: 'true' }).then(setData);
  }, []);

  const filtered = data.filter(d => {
    if (filter.campus && d.campus !== filter.campus) return false;
    if (filter.search) {
      const s = filter.search.toLowerCase();
      return d.codigo.toLowerCase().includes(s) || d.nome.toLowerCase().includes(s);
    }
    return true;
  });

  const toggle = (codigo) => {
    const next = new Set(collapsed);
    if (next.has(codigo)) next.delete(codigo);
    else next.add(codigo);
    setCollapsed(next);
  };

  const isHidden = (item) => {
    let pai = item.codigo_pai;
    while (pai) {
      if (collapsed.has(pai)) return true;
      const paiItem = data.find(d => d.codigo === pai);
      pai = paiItem?.codigo_pai || null;
    }
    return false;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filter.campus} onChange={e => setFilter(f => ({ ...f, campus: e.target.value }))}
          style={{ padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text }}>
          <option value="">Todos os campus</option>
          <option value="barra">Barra</option>
          <option value="recreio">Recreio</option>
        </select>
        <input type="text" placeholder="Buscar..." value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, minWidth: 240, padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text }}
        />
        <div style={{ fontSize: 12, color: C.text3, alignSelf: 'center' }}>{filtered.length} centros</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {filtered.map((item, i) => {
          if (isHidden(item)) return null;
          const hasChildren = data.some(d => d.codigo_pai === item.codigo);
          const isCollapsed = collapsed.has(item.codigo);
          return (
            <div key={item.id}
              style={{
                display: 'flex', alignItems: 'center', padding: '8px 12px',
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                background: item.nivel <= 2 ? 'var(--cbrio-table-header)' : 'transparent',
                fontWeight: item.nivel <= 2 ? 700 : (item.nivel === 3 ? 600 : 400),
              }}>
              <div style={{ width: (item.nivel - 1) * 14 }} />
              {hasChildren ? (
                <button onClick={() => toggle(item.codigo)}
                  style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: C.text2 }}>
                  {isCollapsed ? '▶' : '▼'}
                </button>
              ) : <div style={{ width: 18 }} />}
              <code style={{ fontSize: 12, color: C.text2, fontFamily: 'monospace', marginRight: 12, minWidth: 150 }}>{item.codigo}</code>
              <span style={{ flex: 1, fontSize: 13, color: C.text }}>{item.nome}</span>
              {item.area_slug && (
                <span style={{ fontSize: 10, color: C.primary, padding: '2px 6px', background: C.primaryBg, borderRadius: 4, fontWeight: 600 }}>
                  {item.area_slug}
                </span>
              )}
              {item.aceita_lancamento && (
                <span style={{ fontSize: 10, color: C.green, marginLeft: 8, padding: '2px 6px', background: C.greenBg, borderRadius: 4 }}>
                  lancamento
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// IDENTIFICADORES DE CENTAVO
// ============================================================
function IdentificadoresPanel() {
  const [data, setData] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [centros, setCentros] = useState([]);
  const [modal, setModal] = useState(null);

  const load = async () => {
    const [d, p, c] = await Promise.all([
      financeiroV2.identificadores.list(),
      financeiroV2.planoContas.list({ aceita_lancamento: 'true', ativo: 'true' }),
      financeiroV2.centrosCusto.list({ aceita_lancamento: 'true', ativo: 'true' }),
    ]);
    setData(d); setPlanos(p); setCentros(c);
  };
  useEffect(() => { load(); }, []);

  const salvar = async (form) => {
    if (form.id) {
      await financeiroV2.identificadores.update(form.id, form);
    } else {
      await financeiroV2.identificadores.create(form);
    }
    setModal(null);
    load();
  };

  const remover = async (id) => {
    if (!confirm('Remover este identificador?')) return;
    await financeiroV2.identificadores.remove(id);
    load();
  };

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--cbrio-bg)', borderRadius: 6, fontSize: 12, color: C.text2, border: `1px solid ${C.border}` }}>
        <strong style={{ color: C.text }}>Como funciona:</strong> doadores adicionam os centavos finais ao valor pra identificar o destino.
        Ex: <code>R$ 100,17</code> = Templo · <code>R$ 50,22</code> = Bazar/Missoes · <code>R$ 30,31</code> = Acao Social.
        Use apenas pra destinos especificos · culto eh classificado pela faixa horaria (slots de culto).
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.text3 }}>{data.length} identificadores ativos</div>
        <Button onClick={() => setModal({ centavo: '', descricao: '', plano_contas_id: '', centro_custo_id: '' })}>
          + Novo
        </Button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--cbrio-table-header)' }}>
            <tr>
              <th style={th}>Centavo</th>
              <th style={th}>Descricao</th>
              <th style={th}>Conta</th>
              <th style={th}>Centro de Custo</th>
              <th style={th}>Ativo</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={td}>
                  <code style={{ fontSize: 14, fontWeight: 700, color: C.primary, padding: '4px 8px', background: C.primaryBg, borderRadius: 4 }}>
                    ,{d.centavo}
                  </code>
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{d.descricao}</td>
                <td style={{ ...td, fontSize: 11, color: C.text2 }}>
                  {d.plano_contas?.codigo} <br />
                  <span style={{ color: C.text3 }}>{d.plano_contas?.nome}</span>
                </td>
                <td style={{ ...td, fontSize: 11, color: C.text2 }}>
                  {d.centro_custo?.codigo || '—'} <br />
                  <span style={{ color: C.text3 }}>{d.centro_custo?.nome}</span>
                </td>
                <td style={td}>{d.ativo ? '✓' : '—'}</td>
                <td style={td}>
                  <button onClick={() => setModal(d)} style={btnLink}>Editar</button>
                  <button onClick={() => remover(d.id)} style={{ ...btnLink, color: C.red }}>Excluir</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: C.text3 }}>Nenhum identificador cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <IdentificadorModal
          modal={modal} setModal={setModal} salvar={salvar}
          planos={planos} centros={centros}
        />
      )}
    </div>
  );
}

function IdentificadorModal({ modal, setModal, salvar, planos, centros }) {
  const [form, setForm] = useState(modal);
  return (
    <div style={modalOverlay} onClick={() => setModal(null)}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: C.text }}>
          {form.id ? 'Editar' : 'Novo'} identificador de centavo
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <label style={labelSt}>Centavo</label>
          <input value={form.centavo || ''} onChange={e => setForm({ ...form, centavo: e.target.value.replace(/\D/g, '').slice(0, 2) })}
            placeholder="17" maxLength={2} disabled={!!form.id} style={inputSt} />
          <label style={labelSt}>Descricao</label>
          <input value={form.descricao || ''} onChange={e => setForm({ ...form, descricao: e.target.value })}
            placeholder="Templo · campanha do templo" style={inputSt} />
          <label style={labelSt}>Conta</label>
          <select value={form.plano_contas_id || ''} onChange={e => setForm({ ...form, plano_contas_id: e.target.value })} style={inputSt}>
            <option value="">Selecione...</option>
            {planos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
          </select>
          <label style={labelSt}>Centro de Custo</label>
          <select value={form.centro_custo_id || ''} onChange={e => setForm({ ...form, centro_custo_id: e.target.value || null })} style={inputSt}>
            <option value="">(opcional)</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
          </select>
          <label style={labelSt}>Observacao</label>
          <input value={form.observacao || ''} onChange={e => setForm({ ...form, observacao: e.target.value })} style={inputSt} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
          <Button onClick={() => salvar(form)}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CULTO SLOTS
// ============================================================
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

function CultoSlotsPanel() {
  const [data, setData] = useState([]);

  useEffect(() => {
    financeiroV2.cultoSlots.list().then(setData);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--cbrio-bg)', borderRadius: 6, fontSize: 12, color: C.text2, border: `1px solid ${C.border}` }}>
        Slots definem as faixas horarias usadas pra classificar receitas por culto.
        A engine pega a hora do PIX (do End-to-End ID) e identifica em qual janela cai.
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--cbrio-table-header)' }}>
            <tr>
              <th style={th}>Culto</th>
              <th style={th}>Dia</th>
              <th style={th}>Inicio</th>
              <th style={th}>Fim</th>
              <th style={th}>Conta dizimo</th>
              <th style={th}>Conta oferta</th>
              <th style={th}>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 600 }}>{d.nome}</td>
                <td style={td}>{DIAS_SEMANA[d.dia_semana]}</td>
                <td style={td}>{d.hora_inicio?.slice(0, 5)}</td>
                <td style={td}>
                  {d.hora_fim?.slice(0, 5)}
                  {d.hora_fim_proximo_dia && <span style={{ color: C.amber, fontSize: 10, marginLeft: 4 }}>(+1d)</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: C.text2 }}>{d.plano_dizimo?.codigo}</td>
                <td style={{ ...td, fontSize: 11, color: C.text2 }}>{d.plano_oferta?.codigo}</td>
                <td style={td}>{d.ativo ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// REGRAS DE CLASSIFICACAO
// ============================================================
function RegrasPanel() {
  const [data, setData] = useState([]);

  useEffect(() => {
    financeiroV2.regras.list().then(setData);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--cbrio-bg)', borderRadius: 6, fontSize: 12, color: C.text2, border: `1px solid ${C.border}` }}>
        Regras explicitas pra classificacao automatica. Ex: <code>RENDIMENTO LIQUIDO DE CONTAMAX</code> sempre vai pra "Rendimentos Aplicacoes Financeiras".
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--cbrio-table-header)' }}>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Tipo</th>
              <th style={th}>Padrao</th>
              <th style={th}>Aplica a</th>
              <th style={th}>Conta destino</th>
              <th style={th}>Prio</th>
              <th style={th}>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ ...td, fontWeight: 600 }}>{d.nome}</td>
                <td style={{ ...td, fontSize: 11, color: C.text3 }}>{d.tipo_regra}</td>
                <td style={td}><code style={{ fontSize: 11 }}>{d.pattern}</code></td>
                <td style={td}>{d.aplica_a}</td>
                <td style={{ ...td, fontSize: 11, color: C.text2 }}>
                  {d.plano_contas?.codigo} · {d.plano_contas?.nome}
                </td>
                <td style={td}>{d.prioridade}</td>
                <td style={td}>{d.ativo ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Estilos compartilhados
// ============================================================
const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '10px 12px', color: C.text };
const btnLink = { background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '0 6px' };
const labelSt = { fontSize: 12, fontWeight: 600, color: C.text2 };
const inputSt = { padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: 'var(--cbrio-modal-bg)', padding: 24, borderRadius: 10, width: '90%', maxWidth: 560, border: `1px solid ${C.border}` };
