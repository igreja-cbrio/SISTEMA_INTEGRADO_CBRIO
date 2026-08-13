import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Send, Plus, Trash2 } from 'lucide-react';
import { planejamentoAnual as api } from '../../api';
import { C, cardStyle, btn, input, label, hint, MESES, fmtData, thStyle, tdStyle } from './comum';

const LINHAS = [
  { chave: 'dizimos_ofertas', rotulo: 'Dízimos e ofertas' },
  { chave: 'outras_receitas', rotulo: 'Outras receitas' },
  { chave: 'folha', rotulo: 'Folha' },
  { chave: 'despesas_operacionais', rotulo: 'Despesas operacionais' },
  { chave: 'provisoes', rotulo: 'Provisões' },
];

export default function OrcamentoTab({ ciclo, souFinanceiro }) {
  const [grade, setGrade] = useState({});        // {linha: number[12]}
  const [premissas, setPremissas] = useState([]);
  const [obs, setObs] = useState('');
  const [header, setHeader] = useState(null);
  const [caixa, setCaixa] = useState(new Array(12).fill(0));
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!ciclo?.id) return;
    setCarregando(true);
    try {
      const r = await api.ciclos.orcamento(ciclo.id);
      const g = {};
      LINHAS.forEach((l) => { g[l.chave] = new Array(12).fill(0); });
      (r.valores || []).forEach((v) => { if (g[v.linha]) g[v.linha][v.mes - 1] = Number(v.valor) || 0; });
      setGrade(g);
      setCaixa(r.caixa_livre || new Array(12).fill(0));
      setHeader(r.header);
      setPremissas(Array.isArray(r.header?.premissas) ? r.header.premissas : []);
      setObs(r.header?.obs || '');
    } catch (e) {
      toast.error(e.message || 'Sem acesso ao orçamento do ciclo');
    } finally { setCarregando(false); }
  }, [ciclo?.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const caixaLocal = new Array(12).fill(0).map((_, i) =>
    ((grade.dizimos_ofertas?.[i] || 0) + (grade.outras_receitas?.[i] || 0))
    - ((grade.folha?.[i] || 0) + (grade.despesas_operacionais?.[i] || 0) + (grade.provisoes?.[i] || 0)));

  const setValor = (linha, mes, valor) => {
    setGrade((g) => {
      const nova = { ...g, [linha]: [...(g[linha] || new Array(12).fill(0))] };
      nova[linha][mes] = valor === '' ? 0 : Number(valor);
      return nova;
    });
  };

  const salvar = async (enviarDepois) => {
    setSalvando(true);
    try {
      const valores = [];
      LINHAS.forEach((l) => (grade[l.chave] || []).forEach((v, i) => valores.push({ linha: l.chave, mes: i + 1, valor: v })));
      const premissasLimpa = premissas.filter((p) => p.titulo?.trim() || p.texto?.trim());
      if (premissas.some((p) => (p.titulo?.trim() && !p.texto?.trim()) || (!p.titulo?.trim() && p.texto?.trim()))) {
        toast.error('Preencha título e texto.');
        setSalvando(false);
        return;
      }
      await api.ciclos.salvarOrcamento(ciclo.id, { valores, premissas: premissasLimpa, obs });
      if (enviarDepois) {
        await api.ciclos.enviarOrcamento(ciclo.id);
        toast.success('Orçamento enviado ao Pastor');
      } else {
        toast.success('Orçamento salvo');
      }
      await carregar();
    } catch (e) { toast.error(e.message || 'Erro ao salvar'); } finally { setSalvando(false); }
  };

  if (carregando) return <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 760 }}>
        Monte a composição mês a mês. O caixa livre é calculado: receitas menos despesas. É esse caixa que o
        Pastor usa como referência na decisão e no remanejamento. Totais em reais.
        {header?.enviado_em && <> · <strong style={{ color: C.green }}>Enviado ao Pastor em {fmtData(String(header.enviado_em).slice(0, 10))}</strong></>}
      </p>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead><tr>
              <th style={thStyle}>Linha</th>
              {MESES.map((m) => <th key={m} style={{ ...thStyle, textAlign: 'right' }}>{m}</th>)}
              <th style={{ ...thStyle, textAlign: 'right' }}>Ano</th>
            </tr></thead>
            <tbody>
              {LINHAS.map((l) => (
                <tr key={l.chave}>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.rotulo}</td>
                  {MESES.map((_, i) => (
                    <td key={i} style={{ ...tdStyle, padding: 4 }}>
                      <input
                        style={{ ...input, width: 86, textAlign: 'right', padding: '5px 6px', fontSize: 12 }}
                        type="number" disabled={!souFinanceiro}
                        value={grade[l.chave]?.[i] ?? 0}
                        onChange={(e) => setValor(l.chave, i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                    {(grade[l.chave] || []).reduce((s, v) => s + v, 0).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700, color: C.primary }}>Caixa livre (derivado)</td>
                {caixaLocal.map((v, i) => (
                  <td key={i} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: v < 0 ? C.red : C.primary }}>
                    {v.toLocaleString('pt-BR')}
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.primary }}>
                  {caixaLocal.reduce((s, v) => s + v, 0).toLocaleString('pt-BR')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 16, display: 'grid', gap: 10 }}>
        <div>
          <strong style={{ fontSize: 14, color: C.text }}>Informações-chave do orçamento</strong>
          <p style={{ ...hint, marginTop: 3 }}>
            Premissas, alertas e regras que precisam ser consultadas junto com os números. O Pastor lê estas informações na tela dele.
          </p>
        </div>
        {premissas.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: 8, alignItems: 'start' }}>
            <input style={input} placeholder="Título" disabled={!souFinanceiro} value={p.titulo || ''}
              onChange={(e) => setPremissas((xs) => xs.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
            <input style={input} placeholder="Texto" disabled={!souFinanceiro} value={p.texto || ''}
              onChange={(e) => setPremissas((xs) => xs.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
            {souFinanceiro && (
              <button style={btn('ghost')} onClick={() => setPremissas((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
            )}
          </div>
        ))}
        {souFinanceiro && (
          <button style={{ ...btn('soft'), width: 'fit-content' }} onClick={() => setPremissas((xs) => [...xs, { titulo: '', texto: '' }])}>
            <Plus size={13} /> Adicionar informação
          </button>
        )}
        <div>
          <span style={label}>Observação geral</span>
          <textarea style={{ ...input, minHeight: 54 }} disabled={!souFinanceiro} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>

      {souFinanceiro ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn('soft')} disabled={salvando} onClick={() => salvar(false)}>Salvar</button>
          <button style={btn('primary')} disabled={salvando} onClick={() => salvar(true)}>
            <Send size={14} /> {header?.enviado_em ? 'Reenviar ao Pastor' : 'Enviar ao Pastor'}
          </button>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>
          O orçamento do ciclo é preenchido pela diretoria Financeira e avaliado pelo Pastor presidente.
          Sua visão de decisão fica na aba <strong>Pastor</strong>, em Orçamento.
        </p>
      )}
    </div>
  );
}
