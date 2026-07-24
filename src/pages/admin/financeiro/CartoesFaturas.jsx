// Cartões de crédito + fatura (Fase 4 da reforma do Financeiro)
//   · CartoesConfig — cadastro dos cartões (Configuração): fechamento,
//     vencimento e conta que paga. É o que dirige a competência das faturas.
//   · FaturaModal — detalhe da fatura (rubricas + cada compra) + comparador
//     por IA: sobe o PDF da fatura do banco (aceita senha) e mostra o que está
//     na fatura e não foi lançado (e vice-versa).
import { useState, useEffect, useCallback } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataBR = (d) => {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
  background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13, boxSizing: 'border-box',
};
const labelStyle = { fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', display: 'block', marginBottom: 4 };

// ── Configuração · cartões ───────────────────────────────────────────────────
export function CartoesConfig() {
  const [cartoes, setCartoes] = useState([]);
  const [contas, setContas] = useState([]);
  const [form, setForm] = useState(null); // null = fechado · {} = novo · {id} = editar
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try { setCartoes(await financeiroV2.cartoes.list()); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => {
    carregar();
    import('../../../api').then(({ financeiro }) => financeiro.contas.list().then(setContas).catch(() => {}));
  }, [carregar]);

  async function salvar() {
    if (!form?.nome?.trim()) { toast.error('Informe o nome do cartão'); return; }
    if (!form.dia_fechamento || !form.dia_vencimento) { toast.error('Informe fechamento e vencimento'); return; }
    setSalvando(true);
    try {
      if (form.id) await financeiroV2.cartoes.atualizar(form.id, form);
      else await financeiroV2.cartoes.criar(form);
      toast.success('Cartão salvo');
      setForm(null);
      carregar();
    } catch (e) { toast.error(e.message || 'Erro ao salvar o cartão'); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>💳 Cartões de crédito</div>
          <div style={{ fontSize: 12, color: C.text3 }}>
            Fechamento e vencimento dirigem a fatura: compra depois do fechamento cai no mês seguinte.
          </div>
        </div>
        <Button size="sm" onClick={() => setForm({ nome: '', dia_fechamento: '', dia_vencimento: '' })}>+ Novo cartão</Button>
      </div>

      {cartoes.length === 0 ? (
        <div style={{ fontSize: 13, color: C.text3, padding: '14px 0' }}>
          Nenhum cartão cadastrado — cadastre pra fatura aparecer no Contas a Pagar.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: C.text3, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: 8, textAlign: 'left' }}>Cartão</th>
              <th style={{ padding: 8 }}>Fecha dia</th>
              <th style={{ padding: 8 }}>Vence dia</th>
              <th style={{ padding: 8, textAlign: 'left' }}>Conta que paga</th>
              <th style={{ padding: 8 }}>Ativo</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {cartoes.map((k) => (
              <tr key={k.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 8, fontWeight: 600, color: C.text }}>
                  {k.nome}{k.final ? ` · final ${k.final}` : ''}
                  {k.bandeira ? <span style={{ fontSize: 11, color: C.text3 }}> ({k.bandeira})</span> : null}
                </td>
                <td style={{ padding: 8, textAlign: 'center' }}>{k.dia_fechamento}</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{k.dia_vencimento}</td>
                <td style={{ padding: 8 }}>{k.conta?.nome || '—'}</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{k.ativo ? '✓' : '—'}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>
                  <Button variant="outline" size="sm" onClick={() => setForm({ ...k })}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form && (
        <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
            {form.id ? 'Editar cartão' : 'Novo cartão'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div><label style={labelStyle}>Nome *</label>
              <input style={inputStyle} value={form.nome || ''} placeholder="Ex.: Santander Mastercard" onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div><label style={labelStyle}>Bandeira</label>
              <input style={inputStyle} value={form.bandeira || ''} placeholder="mastercard" onChange={(e) => setForm(f => ({ ...f, bandeira: e.target.value }))} /></div>
            <div><label style={labelStyle}>Final (4 dígitos)</label>
              <input style={inputStyle} value={form.final || ''} placeholder="1170" maxLength={4} onChange={(e) => setForm(f => ({ ...f, final: e.target.value.replace(/\D/g, '') }))} /></div>
            <div><label style={labelStyle}>Fecha dia *</label>
              <input style={inputStyle} type="number" min={1} max={31} value={form.dia_fechamento || ''} onChange={(e) => setForm(f => ({ ...f, dia_fechamento: e.target.value }))} /></div>
            <div><label style={labelStyle}>Vence dia *</label>
              <input style={inputStyle} type="number" min={1} max={31} value={form.dia_vencimento || ''} onChange={(e) => setForm(f => ({ ...f, dia_vencimento: e.target.value }))} /></div>
            <div><label style={labelStyle}>Conta que paga</label>
              <select style={inputStyle} value={form.conta_id || ''} onChange={(e) => setForm(f => ({ ...f, conta_id: e.target.value || null }))}>
                <option value="">—</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></div>
            {form.id && (
              <div><label style={labelStyle}>Ativo</label>
                <select style={inputStyle} value={form.ativo === false ? 'nao' : 'sim'} onChange={(e) => setForm(f => ({ ...f, ativo: e.target.value === 'sim' }))}>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select></div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar cartão'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal · detalhe da fatura + comparador IA ────────────────────────────────
export function FaturaModal({ faturaId, onClose }) {
  const [fatura, setFatura] = useState(null);
  const [loading, setLoading] = useState(true);
  const [senha, setSenha] = useState('');
  const [comparando, setComparando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setFatura(await financeiroV2.faturas.get(faturaId)); }
    catch (e) { toast.error(e.message || 'Erro ao carregar a fatura'); }
    finally { setLoading(false); }
  }, [faturaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function comparar(file) {
    if (!file) return;
    setComparando(true);
    setResultado(null);
    try {
      const r = await financeiroV2.faturas.comparar(faturaId, file, senha.trim() || null);
      setResultado(r);
    } catch (e) { toast.error(e.message || 'Erro ao comparar a fatura'); }
    finally { setComparando(false); }
  }

  const statusCor = fatura?.status === 'paga' ? C.green : fatura?.status === 'fechada' ? C.amber : C.blue;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'var(--cbrio-overlay, rgba(0,0,0,0.55))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div style={{ background: 'var(--cbrio-modal-bg, var(--cbrio-card))', border: `1px solid ${C.border}`, borderRadius: 14, width: 'min(880px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              💳 {fatura ? `Fatura ${fatura.cartao?.nome || ''}${fatura.cartao?.final ? ` · final ${fatura.cartao.final}` : ''}` : 'Fatura'}
            </div>
            {fatura && (
              <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
                Fecha em {fmtDataBR(fatura.fechamento)} · vence em {fmtDataBR(fatura.vencimento)} ·{' '}
                <span style={{ color: statusCor, fontWeight: 700 }}>{fatura.status}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {fatura && <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fmtMoney(fatura.total)}</div>}
            <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
          </div>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: C.text3, padding: 30, fontSize: 13 }}>Carregando…</div>
          ) : !fatura ? null : (
            <>
              {/* Rubricas */}
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, textTransform: 'uppercase', marginBottom: 8 }}>Rubricas (por plano de contas)</div>
              {fatura.rubricas?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
                  {fatura.rubricas.map((r) => (
                    <div key={r.plano} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: C.primaryBg, borderRadius: 8 }}>
                      <span style={{ color: C.text2 }}>{r.plano}</span>
                      <strong style={{ color: C.text }}>{fmtMoney(r.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 12, color: C.text3, marginBottom: 18 }}>Sem itens ainda.</div>}

              {/* Itens */}
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, textTransform: 'uppercase', marginBottom: 8 }}>Compras ({fatura.itens?.length || 0})</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <tbody>
                    {(fatura.itens || []).map((i) => (
                      <tr key={`${i.origem}-${i.id}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: 8, color: C.text3, whiteSpace: 'nowrap' }}>{fmtDataBR(i.data)}</td>
                        <td style={{ padding: 8, color: C.text }}>
                          {i.descricao}
                          {i.parcelas ? <span style={{ color: C.text3 }}> · {i.parcelas}x</span> : null}
                          {i.plano ? <div style={{ fontSize: 10.5, color: C.text3 }}>{i.plano}</div> : null}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{fmtMoney(i.valor)}</td>
                      </tr>
                    ))}
                    {!(fatura.itens || []).length && (
                      <tr><td style={{ padding: 14, color: C.text3, fontSize: 12 }}>Nenhuma compra vinculada a esta fatura ainda.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Comparador IA */}
              <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 4 }}>✨ Conferir com o PDF do banco</div>
                <div style={{ fontSize: 12, color: C.text3, marginBottom: 10 }}>
                  Suba a fatura do mês (PDF · pode ter senha) — a IA compara com o que está lançado e mostra as diferenças.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input style={{ ...inputStyle, width: 180 }} type="password" placeholder="Senha do PDF (se tiver)" value={senha} onChange={(e) => setSenha(e.target.value)} />
                  <label style={{ display: 'inline-block' }}>
                    <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={comparando}
                      onChange={(e) => { comparar(e.target.files?.[0]); e.target.value = ''; }} />
                    <span style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, background: C.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: comparando ? 'wait' : 'pointer', opacity: comparando ? 0.6 : 1 }}>
                      {comparando ? 'Comparando… (a IA está lendo a fatura)' : '📄 Enviar PDF e comparar'}
                    </span>
                  </label>
                </div>

                {resultado && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 10 }}>
                      <div>Total na fatura: <strong style={{ color: C.text }}>{resultado.total_fatura != null ? fmtMoney(resultado.total_fatura) : '—'}</strong></div>
                      <div>Total lançado: <strong style={{ color: C.text }}>{fmtMoney(resultado.total_sistema)}</strong></div>
                      <div>Casados: <strong style={{ color: C.green }}>{resultado.casados}</strong></div>
                    </div>
                    {resultado.so_na_fatura?.length ? (
                      <div style={{ background: C.redBg, border: `1px solid ${C.red}40`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.red, marginBottom: 6 }}>
                          ⚠️ Na fatura e NÃO lançado ({resultado.so_na_fatura.length})
                        </div>
                        {resultado.so_na_fatura.map((l, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.text2, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>{l.data ? `${l.data} · ` : ''}{l.estabelecimento}{l.parcelas_total ? ` (${l.parcela_num}/${l.parcelas_total})` : ''}</span>
                            <strong>{fmtMoney(l.valor)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: C.greenBg, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 12.5, color: C.green, fontWeight: 700 }}>
                        ✓ Tudo que está na fatura foi lançado
                      </div>
                    )}
                    {resultado.so_no_sistema?.length ? (
                      <div style={{ background: C.amberBg, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 6 }}>
                          Lançado no sistema e não achado na fatura ({resultado.so_no_sistema.length})
                        </div>
                        {resultado.so_no_sistema.map((l, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.text2, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>{fmtDataBR(l.data)} · {l.descricao}</span>
                            <strong>{fmtMoney(l.valor)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
