// Conciliação em lote · extrato (débitos OFX soltos) × contas a pagar em
// aberto. Fase 3 da reforma do Financeiro: o sistema sugere os pares (com
// score) e o financeiro aplica em massa — cada par vira transação conciliada
// + baixa automática na conta a pagar.
import { useState, useEffect, useCallback } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  amber: '#f59e0b', amberBg: '#f59e0b18', blue: '#3b82f6', blueBg: '#3b82f618',
};

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtDataBR(yyyymmdd) {
  const m = String(yyyymmdd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function scoreBadge(score) {
  const cor = score >= 100 ? C.green : score >= 85 ? C.primary : C.amber;
  const bg = score >= 100 ? C.greenBg : score >= 85 ? C.primaryBg : C.amberBg;
  const label = score >= 100 ? 'Perfeito' : score >= 85 ? 'Seguro' : 'Conferir';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: bg, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      {label} · {score}
    </span>
  );
}

export default function Conciliacao() {
  const [dados, setDados] = useState(null); // { pares, resumo }
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [sel, setSel] = useState(new Set()); // chave `${conta_id}|${bruto_id}`

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setDados(await financeiroV2.conciliacao.sugestoes()); setSel(new Set()); }
    catch (e) { toast.error(e.message || 'Erro ao carregar as sugestões'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const pares = dados?.pares || [];
  const resumo = dados?.resumo || {};
  const chave = (p) => `${p.conta.id}|${p.bruto.id}`;

  const toggle = (p) => setSel((prev) => {
    const n = new Set(prev);
    n.has(chave(p)) ? n.delete(chave(p)) : n.add(chave(p));
    return n;
  });

  async function aplicarSeguras() {
    setAplicando(true);
    try {
      const r = await financeiroV2.conciliacao.aplicarSeguros();
      toast.success(`${r.aplicados} conta(s) baixada(s) e conciliada(s)`);
      if (r.erros?.length) toast.warning(`${r.erros.length} par(es) não aplicados — recarregue e confira`);
      carregar();
    } catch (e) { toast.error(e.message || 'Erro ao aplicar'); }
    finally { setAplicando(false); }
  }

  async function aplicarSelecionadas() {
    const escolhidos = pares.filter((p) => sel.has(chave(p)))
      .map((p) => ({ conta_id: p.conta.id, bruto_id: p.bruto.id }));
    if (!escolhidos.length) return;
    setAplicando(true);
    try {
      const r = await financeiroV2.conciliacao.aplicar(escolhidos);
      toast.success(`${r.aplicados} conta(s) baixada(s) e conciliada(s)`);
      if (r.erros?.length) toast.warning(`${r.erros.length} par(es) falharam: ${r.erros[0]?.erro || ''}`);
      carregar();
    } catch (e) { toast.error(e.message || 'Erro ao aplicar'); }
    finally { setAplicando(false); }
  }

  const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 180 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Conciliação · extrato × contas a pagar</div>
          <div style={{ fontSize: 12, color: C.text3 }}>
            Pares sugeridos por valor + janela do vencimento. Aplicar = transação conciliada + baixa na conta.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>Atualizar</Button>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase' }}>Contas pendentes</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>{resumo.contas_pendentes ?? '—'}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase' }}>Débitos soltos no extrato</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>{resumo.debitos_soltos ?? '—'}</div>
        </div>
        <div style={{ ...cardStyle, borderColor: C.green }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase' }}>Sugestões seguras</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.green }}>{resumo.seguras ?? '—'}</div>
        </div>
      </div>

      {/* Ações em massa */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={aplicarSeguras} disabled={aplicando || loading || !(resumo.seguras > 0)}>
          {aplicando ? 'Aplicando…' : `✓ Aplicar seguras (${resumo.seguras || 0})`}
        </Button>
        <Button size="sm" variant="outline" onClick={aplicarSelecionadas} disabled={aplicando || sel.size === 0}>
          Aplicar selecionadas ({sel.size})
        </Button>
      </div>

      {/* Lista */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: C.text3, fontSize: 13 }}>Carregando sugestões…</div>
        ) : pares.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.text3, fontSize: 13 }}>
            Nenhum par sugerido — ou não há débitos soltos no extrato, ou nenhuma conta pendente casa por valor/data.
            <div style={{ fontSize: 11, marginTop: 6 }}>Importe o OFX mais recente em Operacional → Importar extratos.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.text3, fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: 10 }}></th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Conta a pagar</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Débito no extrato</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Valor</th>
                  <th style={{ padding: 10, textAlign: 'center' }}>Match</th>
                </tr>
              </thead>
              <tbody>
                {pares.map((p) => (
                  <tr key={chave(p)} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: 10 }}>
                      <input type="checkbox" checked={sel.has(chave(p))} onChange={() => toggle(p)} style={{ accentColor: C.primary, width: 15, height: 15, cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{p.conta.descricao}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>
                        {p.conta.fornecedor ? `${p.conta.fornecedor} · ` : ''}vence {fmtDataBR(p.conta.data_vencimento)}
                        {p.conta.eh_salario ? ' · 💼 salário' : ''}
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ color: C.text2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.bruto.memo || p.bruto.nome_contraparte || '—'}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>
                        {fmtDataBR(p.bruto.data_lancamento)}
                        {p.candidatos_total > 1 ? ` · ${p.candidatos_total} débitos possíveis` : ''}
                      </div>
                    </td>
                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: C.text }}>{fmtMoney(p.conta.valor)}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <div>{scoreBadge(p.score)}</div>
                      <div style={{ fontSize: 10, color: C.text3, marginTop: 3, maxWidth: 220 }}>{p.motivo}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
