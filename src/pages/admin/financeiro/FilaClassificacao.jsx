import { useState, useEffect, useCallback } from 'react';
import { financeiroV2, financeiro } from '../../../api';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';

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
  const [stats, setStats] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [confiancaMin, setConfiancaMin] = useState(0.8);
  const [selecionados, setSelecionados] = useState(new Set());
  // Filtro por click nos cards · 'todos' | 'auto' (alta confianca) | 'sem_sugestao' | 'memoria' | 'baixa_confianca'
  const [filtroCard, setFiltroCard] = useState('todos');

  const toggleSel = (id) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Confirmação inline via toast.warning + action (sem confirm() nativo)
  const aprovarSelecionados = () => {
    if (selecionados.size === 0) return;
    const n = selecionados.size;
    toast.warning(`Aprovar ${n} item${n === 1 ? '' : 's'} selecionado${n === 1 ? '' : 's'}?`, {
      action: {
        label: 'Aprovar',
        onClick: async () => {
          setBulkProcessing(true);
          try {
            let ok = 0, err = 0;
            for (const id of selecionados) {
              try { await financeiroV2.fila.aprovar(id, {}); ok++; }
              catch { err++; }
            }
            if (err > 0) toast.error(`${ok} aprovado${ok === 1 ? '' : 's'} · ${err} com erro`);
            else toast.success(`${ok} aprovado${ok === 1 ? '' : 's'} com sucesso`);
            setSelecionados(new Set());
            load();
          } finally { setBulkProcessing(false); }
        },
      },
      duration: 8000,
    });
  };

  const ignorarSelecionados = () => {
    if (selecionados.size === 0) return;
    const n = selecionados.size;
    toast.warning(`Ignorar ${n} item${n === 1 ? '' : 's'}? Não viram transação.`, {
      action: {
        label: 'Ignorar',
        onClick: async () => {
          setBulkProcessing(true);
          try {
            let ok = 0, err = 0;
            for (const id of selecionados) {
              try { await financeiroV2.fila.ignorar(id); ok++; }
              catch { err++; }
            }
            if (err > 0) toast.error(`${ok} ignorado${ok === 1 ? '' : 's'} · ${err} com erro`);
            else toast.success(`${ok} ignorado${ok === 1 ? '' : 's'}`);
            setSelecionados(new Set());
            load();
          } finally { setBulkProcessing(false); }
        },
      },
      duration: 8000,
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, p, c, s] = await Promise.all([
        financeiroV2.fila.list({ status: 'pendente', limit: 100 }),
        financeiroV2.planoContas.list({ aceita_lancamento: 'true', ativo: 'true' }),
        financeiroV2.centrosCusto.list({ aceita_lancamento: 'true', ativo: 'true' }),
        financeiro.filaClassificacao.stats().catch(() => null),
      ]);
      setFila(f); setPlanos(p); setCentros(c); setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  const aprovarMassa = async () => {
    if (!confirm(`Aprovar TODAS as ${stats?.pendentes || 0} sugestoes com confianca >= ${Math.round(confiancaMin * 100)}%?`)) return;
    setBulkProcessing(true);
    try {
      const r = await financeiro.filaClassificacao.aprovarMassa(confiancaMin);
      alert(`${r.aprovadas} classificacoes aprovadas em massa.`);
      load();
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally { setBulkProcessing(false); }
  };

  const reclassificar = async () => {
    setBulkProcessing(true);
    try {
      const r = await financeiro.filaClassificacao.reclassificar();
      alert(`${r.reclassificadas} itens re-analisados com regras/memoria atualizadas.`);
      load();
    } catch (e) { alert('Erro: ' + e.message); }
    finally { setBulkProcessing(false); }
  };

  useEffect(() => { load(); }, [load]);

  const aprovar = async (item, override = {}) => {
    try {
      await financeiroV2.fila.aprovar(item.id, override);
      toast.success('Lançamento aprovado');
      load();
    } catch (e) {
      console.error('[aprovar] erro:', e);
      toast.error('Erro ao aprovar: ' + (e?.message || 'desconhecido'));
    }
  };

  const ignorar = async (item) => {
    if (!confirm('Ignorar este lancamento? Ele nao virara transacao final.')) return;
    await financeiroV2.fila.ignorar(item.id);
    load();
  };

  const pctAuto = stats?.pct_automatico || 0;
  const memoriaTotal = stats?.memoria_total || 0;
  const confiancaMedia = stats?.confianca_media_ult30 ? Math.round(Number(stats.confianca_media_ult30) * 100) : 0;

  // Predicados de filtro · também usados pra contar items de cada categoria na fila ATUAL
  const matchAuto = it => {
    const o = it.sugestao_origem || ''; const c = Number(it.sugestao_confianca || 0);
    return ['regra', 'memoria', 'memoria_documento', 'memoria_nome', 'centavo', 'ia'].includes(o) && c >= 0.7;
  };
  const matchMemoria = it => ['memoria', 'memoria_documento', 'memoria_nome'].includes(it.sugestao_origem || '');
  const matchSemSugestao = it => (it.sugestao_origem || '') === 'sem_sugestao' || !it.sugestao_plano_contas_id;
  const matchBaixaConf = it => { const c = Number(it.sugestao_confianca || 0); return c > 0 && c < 0.7; };

  // Counts locais (na fila visível agora, max 100)
  const countAuto = fila.filter(matchAuto).length;
  const countMemoria = fila.filter(matchMemoria).length;
  const countSemSug = fila.filter(matchSemSugestao).length;
  const countBaixaConf = fila.filter(matchBaixaConf).length;

  const filaFiltrada = fila.filter(item => {
    if (filtroCard === 'todos') return true;
    if (filtroCard === 'auto') return matchAuto(item);
    if (filtroCard === 'sem_sugestao') return matchSemSugestao(item);
    if (filtroCard === 'memoria') return matchMemoria(item);
    if (filtroCard === 'baixa_confianca') return matchBaixaConf(item);
    return true;
  });

  // Selecao opera apenas sobre a lista filtrada (declarado DEPOIS de filaFiltrada
  // pra evitar TDZ "Cannot access 'ue' before initialization" no build minificado)
  const todosMarcados = filaFiltrada.length > 0 && filaFiltrada.every(i => selecionados.has(i.id));
  const algunsMarcados = selecionados.size > 0 && !todosMarcados;
  const toggleTodos = () => setSelecionados(todosMarcados ? new Set() : new Set(filaFiltrada.map(i => i.id)));

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

      {/* Stats inteligentes · click filtra a lista */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12, marginBottom: 16,
        }}>
          <StatCardClicavel
            ativo={filtroCard === 'auto'}
            onClick={() => countAuto > 0 && setFiltroCard(filtroCard === 'auto' ? 'todos' : 'auto')}
            corAtivo={C.green}
            label="Auto-classificados"
            valor={`${countAuto}`}
            valorCor={countAuto > 0 ? C.green : C.text3}
            sub={`na fila atual · ${pctAuto.toFixed(0)}% nos últimos 30d`}
          />
          <StatCardClicavel
            ativo={filtroCard === 'memoria'}
            onClick={() => countMemoria > 0 && setFiltroCard(filtroCard === 'memoria' ? 'todos' : 'memoria')}
            corAtivo={C.blue}
            label="Vieram da memória"
            valor={String(countMemoria)}
            valorCor={countMemoria > 0 ? C.blue : C.text3}
            sub={`na fila atual · ${memoriaTotal} pagadores aprendidos no total`}
          />
          <StatCardClicavel
            ativo={filtroCard === 'baixa_confianca'}
            onClick={() => countBaixaConf > 0 && setFiltroCard(filtroCard === 'baixa_confianca' ? 'todos' : 'baixa_confianca')}
            corAtivo={C.primary}
            label="Baixa confiança"
            valor={String(countBaixaConf)}
            valorCor={countBaixaConf > 0 ? C.amber : C.text3}
            sub={`< 70% · revisar manualmente`}
          />
          <StatCardClicavel
            ativo={filtroCard === 'sem_sugestao'}
            onClick={() => countSemSug > 0 && setFiltroCard(filtroCard === 'sem_sugestao' ? 'todos' : 'sem_sugestao')}
            corAtivo={C.amber}
            label="Sem sugestão"
            valor={String(countSemSug)}
            valorCor={countSemSug > 0 ? C.text : C.text3}
            sub="sistema não soube · classifique manual"
          />
        </div>
      )}

      {filtroCard !== 'todos' && (
        <div style={{
          padding: '8px 14px', marginBottom: 12,
          background: C.primaryBg, border: `1px solid ${C.primary}40`, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12,
        }}>
          <span style={{ color: C.text }}>
            Mostrando <strong>{filaFiltrada.length}</strong> de {fila.length} ·
            filtro: <strong>{filtroCard === 'auto' ? 'Auto-classificados (alta confiança)'
              : filtroCard === 'memoria' ? 'Vieram da memória'
              : filtroCard === 'baixa_confianca' ? 'Baixa confiança'
              : 'Sem sugestão'}</strong>
          </span>
          <button onClick={() => setFiltroCard('todos')}
            style={{ background: 'transparent', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Limpar filtro ×
          </button>
        </div>
      )}

      {/* Acoes em massa */}
      {fila.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12,
          background: C.primaryBg, border: `1px solid ${C.primary}40`, borderRadius: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>⚡ Ações em massa:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: C.text2 }}>Confiança ≥</span>
            <select
              value={confiancaMin}
              onChange={(e) => setConfiancaMin(Number(e.target.value))}
              style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: 'var(--cbrio-input-bg)' }}
            >
              <option value={0.95}>95%</option>
              <option value={0.9}>90%</option>
              <option value={0.85}>85%</option>
              <option value={0.8}>80%</option>
              <option value={0.7}>70%</option>
            </select>
          </div>
          <Button variant="default" size="sm" onClick={aprovarMassa} disabled={bulkProcessing}>
            ✓ Aprovar todas com confiança alta
          </Button>
          <Button variant="outline" size="sm" onClick={reclassificar} disabled={bulkProcessing}>
            🔄 Re-classificar pendentes
          </Button>
        </div>
      )}

      {/* Barra de selecao · marcar todos + acoes em selecionados */}
      {fila.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 14px',
          background: selecionados.size > 0 ? '#3b82f618' : 'var(--cbrio-input-bg)',
          border: `1px solid ${selecionados.size > 0 ? '#3b82f660' : C.border}`,
          borderRadius: 8, flexWrap: 'wrap',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={todosMarcados}
              ref={el => { if (el) el.indeterminate = algunsMarcados; }}
              onChange={toggleTodos}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            {selecionados.size === 0 ? `Marcar todos (${filaFiltrada.length})` :
              todosMarcados ? `Todos selecionados (${filaFiltrada.length})` :
              `${selecionados.size} de ${filaFiltrada.length} selecionado${selecionados.size === 1 ? '' : 's'}`}
          </label>
          {selecionados.size > 0 && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <Button variant="default" size="sm" onClick={aprovarSelecionados} disabled={bulkProcessing}>
                ✓ Aprovar selecionados
              </Button>
              <Button variant="outline" size="sm" onClick={ignorarSelecionados} disabled={bulkProcessing}>
                🚫 Ignorar selecionados
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
                Limpar
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {filaFiltrada.map(item => (
          <CardFila key={item.id}
            item={item}
            planos={planos}
            centros={centros}
            selecionado={selecionados.has(item.id)}
            onToggleSelecionar={() => toggleSel(item.id)}
            onAprovar={aprovar}
            onEditar={() => setEdit(item)}
            onIgnorar={() => ignorar(item)}
          />
        ))}
        {filaFiltrada.length === 0 && fila.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: 32, textAlign: 'center', borderRadius: 8, color: C.text3 }}>
            Nenhum lançamento bate com o filtro atual.
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setFiltroCard('todos')} style={{ background: 'transparent', border: 'none', color: C.primary, cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>
                Limpar filtro
              </button>
            </div>
          </div>
        )}
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

function StatCardClicavel({ ativo, onClick, corAtivo, label, valor, valorCor, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: ativo ? `${corAtivo}18` : C.card,
        border: `2px solid ${ativo ? corAtivo : C.border}`,
        borderRadius: 10, padding: 14,
        cursor: 'pointer', textAlign: 'left',
        boxShadow: ativo ? `0 0 0 3px ${corAtivo}25` : 'none',
        transition: 'all 0.15s',
        width: '100%',
      }}
      onMouseEnter={e => { if (!ativo) e.currentTarget.style.borderColor = corAtivo + '60'; }}
      onMouseLeave={e => { if (!ativo) e.currentTarget.style.borderColor = C.border; }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: C.text3, letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {label}
        {ativo && <span style={{ fontSize: 10, color: corAtivo, fontWeight: 700 }}>● ATIVO</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valorCor, marginTop: 4 }}>{valor}</div>
      <div style={{ fontSize: 10, color: C.text3 }}>{sub}</div>
    </button>
  );
}

function CardFila({ item, selecionado, onToggleSelecionar, onAprovar, onEditar, onIgnorar }) {
  const lanc = item.lancamento;
  const sug = item.sugestao_plano;
  const origem = ORIGEM_LABELS[item.sugestao_origem] || ORIGEM_LABELS.manual;
  const ehCredito = lanc?.tipo_trn === 'CREDIT';

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${selecionado ? '#3b82f6' : C.border}`,
      boxShadow: selecionado ? '0 0 0 1px #3b82f640' : 'none',
      borderRadius: 10, padding: 16,
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
      transition: 'border-color 0.15s',
    }}>
      <input
        type="checkbox"
        checked={!!selecionado}
        onChange={onToggleSelecionar}
        style={{ width: 18, height: 18, cursor: 'pointer', alignSelf: 'flex-start', marginTop: 4 }}
        onClick={e => e.stopPropagation()}
      />
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
        {item.pix_detalhe?.pagador_nome && (
          <div style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: C.greenBg, color: C.green, fontWeight: 700 }}>
              👤 {item.sugestao_membro ? 'MEMBRO' : 'PAGADOR'}
            </span>
            <span>{item.pix_detalhe.pagador_nome}</span>
            {item.pix_detalhe.pagador_documento && (
              <code style={{ fontSize: 10, color: C.text3 }}>· {item.pix_detalhe.pagador_documento}</code>
            )}
            {item.pix_detalhe.banco_origem && (
              <span style={{ fontSize: 10, color: C.text3 }}>· {item.pix_detalhe.banco_origem}</span>
            )}
          </div>
        )}
        {!item.pix_detalhe?.pagador_nome && (lanc.nome_contraparte || lanc.documento_contraparte) && (
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
  // Auto-cadastro como contribuinte avulso · default true se pagador identificado e sem membro
  const temPagador = !!item.pix_detalhe?.pagador_nome;
  const semMembro = !item.sugestao_membro;
  const [criarContrib, setCriarContrib] = useState(temPagador && semMembro);

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
            <ComboboxBusca
              items={planos}
              value={planoId}
              onChange={setPlanoId}
              placeholder="Buscar plano de contas (código ou nome)..."
              emptyLabel="Selecione..."
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelSt}>Centro de Custo (opcional)</label>
            <ComboboxBusca
              items={centros}
              value={centroId}
              onChange={setCentroId}
              placeholder="Buscar centro de custo..."
              emptyLabel="— Nenhum —"
              permiteVazio
            />
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

          {temPagador && (
            <div style={{
              padding: 10, borderRadius: 6,
              background: criarContrib ? C.greenBg : 'var(--cbrio-bg)',
              border: `1px solid ${criarContrib ? C.green + '40' : C.border}`,
            }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={criarContrib}
                  onChange={e => setCriarContrib(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {semMembro
                      ? `Cadastrar ${item.pix_detalhe.pagador_nome} como contribuinte avulso`
                      : `Já cadastrado · ${item.sugestao_membro?.nome}`}
                  </div>
                  <div style={{ fontSize: 10, color: C.text2, marginTop: 2 }}>
                    {semMembro
                      ? 'Cria automaticamente em Membros (status: contribuinte_avulso). Vincula esta e futuras transações deste pagador ao membro criado.'
                      : 'A transação será vinculada ao membro existente.'}
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSalvar({
            plano_contas_id: planoId,
            centro_custo_id: centroId || null,
            identificador_centavo: centavo || null,
            observacoes: obs || null,
            criar_contribuinte: criarContrib,
            origem: 'manual',
          })}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

// Combobox com busca · digita pra filtrar codigo+nome, click pra selecionar
function ComboboxBusca({ items, value, onChange, placeholder, emptyLabel, permiteVazio }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const selecionado = items.find(i => i.id === value);
  const filtrados = busca.trim()
    ? items.filter(i => {
        const q = busca.toLowerCase();
        return (i.codigo || '').toLowerCase().includes(q) || (i.nome || '').toLowerCase().includes(q);
      }).slice(0, 100)
    : items.slice(0, 100);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={aberto ? busca : (selecionado ? `${selecionado.codigo} · ${selecionado.nome}` : '')}
        onChange={e => { setBusca(e.target.value); setAberto(true); }}
        onFocus={e => { setAberto(true); setBusca(''); e.target.select(); }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder}
        style={{ ...inputSt, paddingRight: 30 }}
      />
      {value && permiteVazio && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange(''); setBusca(''); }}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 'none', color: C.text3, fontSize: 16, cursor: 'pointer', padding: 4,
          }}
          title="Limpar"
        >×</button>
      )}
      {aberto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, zIndex: 100,
          background: 'var(--cbrio-card)', border: `1px solid ${C.border}`, borderRadius: 6,
          maxHeight: 280, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {permiteVazio && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(''); setBusca(''); setAberto(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: !value ? C.primaryBg : 'transparent', border: 'none',
                borderBottom: `1px solid ${C.border}`, color: C.text2, fontSize: 12, cursor: 'pointer', fontStyle: 'italic',
              }}
            >{emptyLabel}</button>
          )}
          {filtrados.length === 0 ? (
            <div style={{ padding: '12px', color: C.text3, fontSize: 12, textAlign: 'center' }}>
              Nenhum resultado pra "{busca}"
            </div>
          ) : filtrados.map(i => (
            <button
              type="button"
              key={i.id}
              onMouseDown={e => { e.preventDefault(); onChange(i.id); setBusca(''); setAberto(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: i.id === value ? C.primaryBg : 'transparent', border: 'none',
                borderBottom: `1px solid ${C.border}40`, color: C.text, fontSize: 13, cursor: 'pointer',
              }}
              onMouseEnter={e => { if (i.id !== value) e.target.style.background = 'var(--cbrio-bg)'; }}
              onMouseLeave={e => { if (i.id !== value) e.target.style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: 'monospace', color: C.text2, marginRight: 8 }}>{i.codigo}</span>
              <span>{i.nome}</span>
            </button>
          ))}
          {items.length > 100 && !busca && (
            <div style={{ padding: '8px 12px', color: C.text3, fontSize: 11, fontStyle: 'italic', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
              Mostrando 100 de {items.length} · digite pra buscar
            </div>
          )}
        </div>
      )}
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
