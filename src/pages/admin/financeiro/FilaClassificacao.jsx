import { useState, useEffect, useCallback } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const ORIGEM_LABELS = {
  centavo: { label: 'Centavo', cor: C.primary, bg: C.primaryBg },
  memoria: { label: 'Memoria', cor: C.blue, bg: C.blueBg },
  regra:   { label: 'Regra', cor: C.amber, bg: C.amberBg },
  ia:      { label: 'IA', cor: '#8b5cf6', bg: '#8b5cf618' },
  manual:  { label: 'Manual', cor: C.text3, bg: '#73737318' },
};

export default function FilaClassificacao() {
  const [fila, setFila] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [centros, setCentros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, p, c] = await Promise.all([
        financeiroV2.fila.list({ status: 'pendente', limit: 100 }),
        financeiroV2.planoContas.list({ aceita_lancamento: 'true', ativo: 'true' }),
        financeiroV2.centrosCusto.list({ aceita_lancamento: 'true', ativo: 'true' }),
      ]);
      setFila(f); setPlanos(p); setCentros(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const aprovar = async (item, override = {}) => {
    await financeiroV2.fila.aprovar(item.id, override);
    load();
  };

  const ignorar = async (item) => {
    if (!confirm('Ignorar este lancamento? Ele nao virara transacao final.')) return;
    await financeiroV2.fila.ignorar(item.id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Fila de classificacao</h2>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
            {fila.length} lancamento{fila.length === 1 ? '' : 's'} aguardando revisao
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {fila.map(item => (
          <CardFila key={item.id}
            item={item}
            planos={planos}
            centros={centros}
            onAprovar={aprovar}
            onEditar={() => setEdit(item)}
            onIgnorar={() => ignorar(item)}
          />
        ))}
        {fila.length === 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: 32, textAlign: 'center', borderRadius: 8, color: C.text3 }}>
            Nenhum lancamento pendente · todos foram classificados ✓
          </div>
        )}
      </div>

      {edit && (
        <ModalEditarClassificacao
          item={edit} onClose={() => setEdit(null)}
          planos={planos} centros={centros}
          onSalvar={async (override) => {
            await aprovar(edit, override);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function CardFila({ item, onAprovar, onEditar, onIgnorar }) {
  const lanc = item.lancamento;
  const sug = item.sugestao_plano;
  const origem = ORIGEM_LABELS[item.sugestao_origem] || ORIGEM_LABELS.manual;
  const ehCredito = lanc?.tipo_trn === 'CREDIT';

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: ehCredito ? C.green : C.red }}>
            {ehCredito ? '+' : '-'} R$ {Math.abs(lanc.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: 11, color: C.text3 }}>
            {new Date(lanc.data_lancamento).toLocaleDateString('pt-BR')}
            {lanc.hora_lancamento && <> · {lanc.hora_lancamento.slice(0, 5)}</>}
            {lanc.hora_origem && <span style={{ marginLeft: 4, color: lanc.hora_origem === 'pix_match' ? C.primary : C.text3 }}>
              ({lanc.hora_origem === 'pix_match' ? '✓ matched PIX' : lanc.hora_origem})
            </span>}
          </span>
        </div>
        <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>{lanc.memo}</div>
        {(lanc.nome_contraparte || lanc.documento_contraparte) && (
          <div style={{ fontSize: 11, color: C.text2 }}>
            {lanc.nome_contraparte} {lanc.documento_contraparte && <code>· {lanc.documento_contraparte}</code>}
          </div>
        )}

        {sug && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--cbrio-bg)', borderRadius: 6, border: `1px dashed ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: origem.bg, color: origem.cor, fontWeight: 600 }}>
                Sugestao · {origem.label}
              </span>
              {item.sugestao_confianca && (
                <span style={{ fontSize: 10, color: C.text3 }}>
                  {Math.round(item.sugestao_confianca * 100)}% confianca
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
              {sug.codigo} · {sug.nome}
            </div>
            {item.sugestao_centro && (
              <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
                Centro: {item.sugestao_centro.codigo} · {item.sugestao_centro.nome}
              </div>
            )}
            {item.sugestao_membro && (
              <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>
                Membro: {item.sugestao_membro.nome}
              </div>
            )}
            {item.sugestao_explicacao && (
              <div style={{ fontSize: 11, color: C.text3, marginTop: 4, fontStyle: 'italic' }}>
                {item.sugestao_explicacao}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sug && <Button onClick={() => onAprovar(item)} style={{ width: 100 }}>✓ Aprovar</Button>}
        <Button variant="outline" onClick={onEditar} style={{ width: 100 }}>Editar</Button>
        <button onClick={onIgnorar} style={{ width: 100, padding: '6px 8px', fontSize: 11, color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}>
          Ignorar
        </button>
      </div>
    </div>
  );
}

function ModalEditarClassificacao({ item, onClose, planos, centros, onSalvar }) {
  const [planoId, setPlanoId] = useState(item.sugestao_plano_contas_id || '');
  const [centroId, setCentroId] = useState(item.sugestao_centro_custo_id || '');
  const [centavo, setCentavo] = useState('');
  const [obs, setObs] = useState('');

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: C.text }}>
          Classificar lancamento
        </h3>

        <div style={{ background: 'var(--cbrio-bg)', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: C.text }}>{item.lancamento.memo}</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>
            R$ {Math.abs(item.lancamento.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            {' · '}
            {new Date(item.lancamento.data_lancamento).toLocaleDateString('pt-BR')}
            {item.lancamento.hora_lancamento && <> · {item.lancamento.hora_lancamento.slice(0, 5)}</>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelSt}>Conta do plano</label>
            <select value={planoId} onChange={e => setPlanoId(e.target.value)} style={inputSt}>
              <option value="">Selecione...</option>
              {planos.map(p => (
                <option key={p.id} value={p.id} title={`${p.codigo} · ${p.nome}`}>
                  {p.codigo} · {truncateOpt(p.nome, 60)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelSt}>Centro de Custo (opcional)</label>
            <select value={centroId} onChange={e => setCentroId(e.target.value)} style={inputSt}>
              <option value="">— Nenhum —</option>
              {centros.map(c => (
                <option key={c.id} value={c.id} title={`${c.codigo} · ${c.nome}`}>
                  {c.codigo} · {truncateOpt(c.nome, 60)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelSt}>Centavo identificador (opcional)</label>
            <input value={centavo} onChange={e => setCentavo(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="ex: 17" maxLength={2} style={inputSt} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelSt}>Observacoes</label>
            <input value={obs} onChange={e => setObs(e.target.value)} style={inputSt} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSalvar({
            plano_contas_id: planoId,
            centro_custo_id: centroId || null,
            identificador_centavo: centavo || null,
            observacoes: obs || null,
            origem: 'manual',
          })}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

const labelSt = { fontSize: 12, fontWeight: 600, color: C.text2 };

function truncateOpt(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
const inputSt = {
  width: '100%', boxSizing: 'border-box', maxWidth: '100%',
  padding: 8, borderRadius: 6, border: `1px solid ${C.border}`,
  background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13,
};
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16, overflowY: 'auto',
};
const modalBox = {
  background: 'var(--cbrio-modal-bg)', padding: 24, borderRadius: 10,
  width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 48px)',
  overflowY: 'auto', border: `1px solid ${C.border}`, boxSizing: 'border-box',
};
