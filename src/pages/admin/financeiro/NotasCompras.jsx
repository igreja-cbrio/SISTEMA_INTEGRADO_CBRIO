import { useState, useEffect, useCallback } from 'react';
import { financeiroV2, financeiro } from '../../../api';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';

// Notas fiscais de compras escaneadas pela logística (Amaury/Pery) e enviadas
// pro financeiro lançar. Lançar cria fin_transacoes (despesa) e tenta conciliar
// com o débito correspondente do extrato OFX automaticamente.

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const ORIGEM_LABELS = {
  memoria: { label: 'Memória', cor: C.blue, bg: C.blueBg },
  regra: { label: 'Regra', cor: C.amber, bg: C.amberBg },
  ia: { label: 'IA', cor: '#8b5cf6', bg: '#8b5cf618' },
};

const STATUS_FILTROS = [
  { key: 'enviada_financeiro', label: 'Aguardando lançamento' },
  { key: 'lancada', label: 'Lançadas' },
  { key: 'rejeitada', label: 'Devolvidas' },
  { key: 'todas', label: 'Todas' },
];

function fmtDataBR(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const m = String(yyyymmdd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return yyyymmdd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const sel = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8,
  border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text,
};
const lbl = { fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };

export default function NotasCompras() {
  const [notas, setNotas] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [centros, setCentros] = useState([]);
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('enviada_financeiro');
  const [edits, setEdits] = useState({}); // id → { plano_contas_id, centro_custo_id, conta_id }
  const [processando, setProcessando] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotas(await financeiroV2.notasCompras.list({ status: filtro }) || []);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    financeiroV2.planoContas.list().then(ps => setPlanos((ps || []).filter(p => p.tipo === 'despesa' && p.ativo !== false))).catch(() => {});
    financeiroV2.centrosCusto.list().then(cs => setCentros(cs || [])).catch(() => {});
    financeiro.contas.list().then(cs => setContas((cs || []).filter(c => c.ativa !== false))).catch(() => {});
  }, []);

  const getEdit = (n) => edits[n.id] || {};
  const setEdit = (id, k, v) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [k]: v } }));

  const lancar = async (n) => {
    const e = getEdit(n);
    const plano = e.plano_contas_id !== undefined ? e.plano_contas_id : n.sugestao_plano_contas_id;
    if (!plano) { toast.error('Escolha a conta de despesa antes de lançar'); return; }
    setProcessando(n.id);
    try {
      const res = await financeiroV2.notasCompras.lancar(n.id, {
        plano_contas_id: plano,
        centro_custo_id: e.centro_custo_id !== undefined ? (e.centro_custo_id || null) : undefined,
        conta_id: e.conta_id || undefined,
      });
      toast.success(res.conciliada
        ? 'Nota lançada e conciliada com o débito do extrato.'
        : 'Nota lançada como pendente (sem débito correspondente no extrato ainda).');
      load();
    } catch (err) {
      if (String(err.message).includes('conta_id')) {
        toast.error('Sem débito correspondente no extrato — escolha a conta bancária pra lançar como pendente.');
      } else toast.error(err.message);
    }
    setProcessando(null);
  };

  const rejeitar = async (n) => {
    const motivo = prompt('Motivo da devolução pra equipe de compras:');
    if (motivo === null) return;
    setProcessando(n.id);
    try {
      await financeiroV2.notasCompras.rejeitar(n.id, motivo);
      toast.success('Nota devolvida pra equipe de compras.');
      load();
    } catch (err) { toast.error(err.message); }
    setProcessando(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Notas de compras</div>
          <div style={{ fontSize: 12, color: C.text2 }}>
            Notas fiscais escaneadas pela equipe de compras. Confira a categoria e lance — o sistema concilia com o extrato quando o débito já chegou.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${filtro === f.key ? C.primary : C.border}`,
                background: filtro === f.key ? C.primaryBg : 'transparent',
                color: filtro === f.key ? C.primary : C.text2,
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontSize: 13 }}>Carregando…</div>
      ) : notas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontSize: 13, background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)' }}>
          {filtro === 'enviada_financeiro' ? 'Nenhuma nota aguardando lançamento. 🎉' : 'Nenhuma nota neste filtro.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notas.map(n => {
            const e = getEdit(n);
            const origem = ORIGEM_LABELS[n.sugestao_origem];
            const planoSel = e.plano_contas_id !== undefined ? e.plano_contas_id : (n.sugestao_plano_contas_id || '');
            const centroSel = e.centro_custo_id !== undefined ? e.centro_custo_id : (n.sugestao_centro_custo_id || '');
            const pendente = n.status === 'enviada_financeiro';
            return (
              <div key={n.id} style={{ background: C.card, border: '1px solid var(--hairline)', borderRadius: 16, boxShadow: 'var(--shadow)', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                      {n.emitente_nome || n.log_fornecedores?.nome_fantasia || n.log_fornecedores?.razao_social || `NF ${n.numero}`}
                      <span style={{ fontWeight: 400, color: C.text3, fontSize: 12, marginLeft: 8 }}>NF {n.numero}{n.serie ? `/${n.serie}` : ''}</span>
                    </div>
                    {n.descricao && <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>{n.descricao}</div>}
                    <div style={{ fontSize: 12, color: C.text3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{fmtMoney(n.valor)}</span>
                      <span>Emissão: {fmtDataBR(n.data_emissao)}</span>
                      {n.emitente_cnpj && <span>CNPJ: {n.emitente_cnpj}</span>}
                      {n.storage_path && <a href={n.storage_path} target="_blank" rel="noopener noreferrer" style={{ color: C.primary }}>📄 Ver nota</a>}
                    </div>
                    {n.sugestao_explicacao && (
                      <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>
                        {origem && (
                          <span style={{ background: origem.bg, color: origem.cor, borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 11, marginRight: 6 }}>
                            {origem.label}
                          </span>
                        )}
                        {n.sugestao_explicacao}
                      </div>
                    )}
                    {n.status === 'lancada' && (
                      <div style={{ fontSize: 12, color: C.green, marginTop: 6, fontWeight: 600 }}>✓ Lançada em {fmtDataBR(n.lancada_em?.slice(0, 10))}</div>
                    )}
                    {n.status === 'rejeitada' && (
                      <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>Devolvida{n.rejeitada_motivo ? `: ${n.rejeitada_motivo}` : ''}</div>
                    )}
                  </div>

                  {pendente && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, flex: 2, minWidth: 300, alignContent: 'start' }}>
                      <div>
                        <label style={lbl}>Conta de despesa *</label>
                        <select style={sel} value={planoSel} onChange={ev => setEdit(n.id, 'plano_contas_id', ev.target.value)}>
                          <option value="">Selecione…</option>
                          {planos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Centro de custo</label>
                        <select style={sel} value={centroSel} onChange={ev => setEdit(n.id, 'centro_custo_id', ev.target.value)}>
                          <option value="">Sem centro de custo</option>
                          {centros.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Conta bancária (se não conciliar)</label>
                        <select style={sel} value={e.conta_id || ''} onChange={ev => setEdit(n.id, 'conta_id', ev.target.value)}>
                          <option value="">Automática (débito do extrato)</option>
                          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <Button onClick={() => lancar(n)} disabled={processando === n.id}>
                          {processando === n.id ? 'Lançando…' : 'Lançar'}
                        </Button>
                        <Button variant="outline" onClick={() => rejeitar(n)} disabled={processando === n.id}>Devolver</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
