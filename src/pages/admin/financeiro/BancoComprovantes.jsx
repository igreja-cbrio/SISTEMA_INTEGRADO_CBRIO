// Banco de comprovantes · lista num só lugar todos os comprovantes anexados às
// transações + as notas fiscais com arquivo. Abrir/baixar em PDF. Alimenta a
// conciliação dos tesoureiros. Fonte: GET /financeiro/comprovantes (RPC
// fn_banco_comprovantes). O casamento por IA (upload em massa) entra na 2ª fase.
import { useState, useEffect, useCallback } from 'react';
import { financeiro } from '../../../api';
import { DatePicker } from '../../../components/ui/date-picker';
import { FileText, Download, ExternalLink, Search, Receipt } from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)',
  text3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)', primary: '#00B39D',
  green: '#10b981', greenBg: '#10b98118', blue: '#3b82f6', blueBg: '#3b82f618',
  amber: '#f59e0b', amberBg: '#f59e0b18',
};
const fmtMoney = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export default function BancoComprovantes() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (inicio) params.inicio = inicio;
      if (fim) params.fim = fim;
      const r = await financeiro.comprovantes(params);
      setItens(r?.itens || []);
    } catch { setItens([]); }
    finally { setLoading(false); }
  }, [q, inicio, fim]);

  useEffect(() => { const t = setTimeout(carregar, 300); return () => clearTimeout(t); }, [carregar]);

  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` };
  const td = { padding: '10px 12px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Banco de comprovantes</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>
          Comprovantes anexados às transações + notas fiscais com arquivo. Abra ou baixe cada um em PDF.
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: 240, flex: 1 }}>
          <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: C.text3 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descrição, fornecedor ou nº da nota…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm" />
        </div>
        <span style={{ fontSize: 12, color: C.text3 }}>Vencimento/competência de</span>
        <div style={{ minWidth: 150 }}><DatePicker value={inicio} onChange={setInicio} placeholder="Início" className="h-9" /></div>
        <span style={{ fontSize: 12, color: C.text3 }}>até</span>
        <div style={{ minWidth: 150 }}><DatePicker value={fim} onChange={setFim} placeholder="Fim" className="h-9" /></div>
        {(q || inicio || fim) && (
          <button onClick={() => { setQ(''); setInicio(''); setFim(''); }}
            style={{ fontSize: 12, color: C.text3, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Limpar
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: C.text3 }}>{itens.length} comprovante(s)</div>
      </div>

      {/* Lista */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>Carregando…</div>
        ) : itens.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Receipt style={{ width: 40, height: 40, color: C.text3, opacity: 0.4, margin: '0 auto 10px' }} />
            <div style={{ color: C.text2, fontWeight: 600 }}>Nenhum comprovante ainda</div>
            <div style={{ color: C.text3, fontSize: 13, marginTop: 4 }}>
              Anexe comprovantes numa transação (aba Transações → abrir a transação) ou escaneie uma nota fiscal.
              O upload em massa com casamento por IA chega na próxima fase.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Data</th>
                  <th style={th}>Descrição</th>
                  <th style={th}>Origem</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Arquivo</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => {
                  const nota = it.origem === 'nota';
                  return (
                    <tr key={i}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(it.data)}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{it.descricao || '—'}</div>
                        {it.conta && <div style={{ fontSize: 11, color: C.text3 }}>{it.conta}</div>}
                        <div style={{ fontSize: 11, color: C.text3 }}>{it.arquivo}</div>
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                          color: nota ? C.amber : C.blue, background: nota ? C.amberBg : C.blueBg }}>
                          {nota ? 'Nota fiscal' : 'Comprovante'}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(it.valor)}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <a href={it.url} target="_blank" rel="noreferrer" title="Abrir"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.primary, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            <ExternalLink style={{ width: 14, height: 14 }} /> Abrir
                          </a>
                          <a href={it.url} download={it.arquivo || 'comprovante'} title="Baixar"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.text2, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            <Download style={{ width: 14, height: 14 }} /> Baixar
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText style={{ width: 13, height: 13 }} /> Os arquivos abrem direto do storage (bucket log-arquivos).
      </div>
    </div>
  );
}
