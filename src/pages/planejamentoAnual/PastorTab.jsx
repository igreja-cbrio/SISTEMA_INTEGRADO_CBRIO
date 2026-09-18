import { useState, useEffect, useCallback, Fragment } from 'react';
import { toast } from 'sonner';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { planejamentoAnual as api, users as usersApi } from '../../api';
import {
  C, cardStyle, btn, input, hint, Badge, EstadoBadge, fmtBRL, fmtData, fmtQuando,
  MESES, MESES_LONGOS, DIAS_SEMANA, RECORRENCIAS, thStyle, tdStyle, rotuloArea, rotuloDiretoria,
  evidenciaCriterio,
} from './comum';
import CalendarioAno from './CalendarioAno';

// Gráfico caixa livre × custo · reusado na visão do Pastor e na simulação de
// UMA proposta na tela de decisão ("se você aprovar"). Coluna sólida = o que
// já está no calendário (aprovado, em tempo real com apontamento); linha
// tracejada = "todas as propostas" (imutável, se todas fossem aprovadas);
// hachurada = o que a decisão em jogo acrescenta (só na simulação de UMA
// proposta). C.purple não existia em comum.jsx antes desta feature — foi
// acrescentado ali (2026-09-18) só pra esta 3ª série.
function GraficoOrcamento({ visao, alturaPx = 260, rotuloPendente = 'Aguardando decisão' }) {
  const dados = MESES.map((m, i) => ({
    mes: m,
    caixa: visao.caixa_livre?.[i] ?? null,
    aprovado: visao.comprometido?.[i] ?? 0,
    pendente: visao.propostos?.[i] ?? 0,
    todas: visao.todas_propostas?.[i] ?? null,
  }));
  const temTodas = Array.isArray(visao.todas_propostas);
  // Sem orçamento enviado pelo Financeiro não há caixa livre — a linha some
  // (em vez de aparecer zerada, o que mentiria "não há dinheiro nenhum").
  const temCaixa = Array.isArray(visao.caixa_livre);
  return (
    <div style={{ height: alturaPx }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados}>
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000) + 'k'} />
          <Tooltip formatter={(v) => fmtBRL(v)} />
          <Legend />
          <ReferenceLine y={0} stroke="var(--hairline)" />
          <Bar dataKey="aprovado" name="Aprovado (tempo real)" stackId="c" fill={C.primary} />
          <Bar dataKey="pendente" name={rotuloPendente} stackId="c" fill={C.amber} fillOpacity={0.55} />
          {temCaixa && (
            <Line dataKey="caixa" name="Orçamento livre" stroke={C.text} strokeWidth={2} dot={false} />
          )}
          {temTodas && (
            <Line dataKey="todas" name="Todas as propostas" stroke={C.purple} strokeWidth={2} strokeDasharray="6 4" dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Critério → campo apontável mais próximo (usado no botão "Apontar" da
// tabela de critérios). Quando não há mapeamento 1:1 (chaves diferentes),
// o texto do apontamento leva o nome do critério como prefixo.
const CRITERIO_PARA_CAMPO = {
  relevancia: 'alcance',
  pertencimento: 'pertencimento',
  transformacao: 'transformacao',
  visao: 'visao',
  impacto: 'impacto',
  custo: 'custo',
  sustentabilidade: 'descricao',
};

const SUBS = ['Decisões', 'Retificações', 'Ressalvas', 'Orçamento', 'Calendário', 'Ciclo e publicação'];

const subBtn = (ativo) => ({
  padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${ativo ? C.primary : C.border}`,
  background: ativo ? C.primaryBg : 'transparent', color: ativo ? C.primary : C.t2,
});

// ─── Decisões (ranking + lote + detalhe) ─────────────────────────────────
function Decisoes({ ciclo, constantes, recarregarCiclo, areas }) {
  const [ranking, setRanking] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [aberta, setAberta] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try { setRanking(await api.ciclos.ranking(ciclo.id)); }
    catch (e) { toast.error(e.message || 'Erro ao carregar o ranking'); }
  }, [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const alternar = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const lote = async (decisao) => {
    let exigencia;
    if (decisao === 'reprovada') {
      const texto = window.prompt('Exigência (será aplicada a todas as marcadas):');
      if (!texto?.trim()) return;
      exigencia = { texto: texto.trim() };
    }
    setSalvando(true);
    try {
      const r = await api.ciclos.decisoesLote(ciclo.id, { ids: [...sel], decisao, exigencia });
      const falhas = (r.resultados || []).filter((x) => !x.ok);
      if (falhas.length) toast.error(`${falhas.length} não decidida(s): ${falhas.map((f) => f.erro).join(' · ')}`);
      else toast.success('Decisões registradas');
      setSel(new Set());
      await carregar();
      recarregarCiclo?.();
    } catch (e) { toast.error(e.message || 'Erro no lote'); } finally { setSalvando(false); }
  };

  if (aberta) {
    return <DetalheProposta id={aberta} constantes={constantes} areas={areas} aoVoltar={async () => { setAberta(null); await carregar(); recarregarCiclo?.(); }} />;
  }
  if (!ranking) return <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 780 }}>
        A ordem segue a soma das sete médias, sobre 35. Quando duas propostas empatam, o sistema compara critério a
        critério na ordem do formulário e, se o empate persistir, usa a ordem alfabética. Marque as caixas para
        decidir em lote, ou abra uma proposta para apontar campo a campo.
      </p>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thStyle}></th><th style={thStyle}>#</th><th style={thStyle}>Proposta</th>
              <th style={thStyle}>Soma /35</th><th style={thStyle}>Líquido</th><th style={thStyle}>Situação</th><th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {ranking.ranqueadas.map((r, i) => (
                <tr key={r.proposta.id}>
                  <td style={tdStyle}>
                    {!r.situacao_decisao && <input type="checkbox" checked={sel.has(r.proposta.id)} onChange={() => alternar(r.proposta.id)} />}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: C.primary }}>{i + 1}º</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.proposta.nome}
                    <div style={{ fontSize: 11.5, color: C.t3 }}>{rotuloArea(r.proposta.area, areas)} · {fmtQuando(r.proposta)}</div>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{Number(r.soma).toFixed(2)}
                    <div style={{ fontSize: 11, color: C.t3 }}>{r.medias.map((m) => Number(m).toFixed(1)).join(' · ')}</div>
                  </td>
                  <td style={tdStyle}>{fmtBRL(Math.max(Number(r.proposta.custo) - (r.proposta.tem_arrecadacao ? Number(r.proposta.arrecadacao_prevista) : 0), 0))}</td>
                  <td style={tdStyle}>
                    {r.situacao_decisao
                      ? <EstadoBadge estado={r.situacao_decisao} />
                      : <Badge texto="aguardando" cor={C.purple} />}
                    {r.no_calendario && <> <Badge texto="no calendário" cor={C.green} /></>}
                  </td>
                  <td style={tdStyle}><button style={btn('ghost')} onClick={() => setAberta(r.proposta.id)}>Abrir</button></td>
                </tr>
              ))}
              {!ranking.ranqueadas.length && <tr><td style={tdStyle} colSpan={7}>Nenhuma proposta com quórum ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {ranking.foraDoRanking?.length > 0 && (
        <div style={{ fontSize: 12.5, color: C.amber }}>
          Fora do ranking por falta de quórum:{' '}
          {ranking.foraDoRanking.map((f) => `${f.proposta.nome} (falta ${f.faltam.join(', ')})`).join(' · ')}
        </div>
      )}

      {sel.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: C.t2 }}>{sel.size} marcada(s):</span>
          <button style={btn('primary')} disabled={salvando} onClick={() => lote('aprovada')}>Aprovar selecionadas</button>
          <button style={btn('danger')} disabled={salvando} onClick={() => lote('reprovada')}>Reprovar selecionadas</button>
          <span style={hint}>A reprovação em lote aplica a mesma exigência a todas as propostas marcadas.</span>
        </div>
      )}
    </div>
  );
}

// ─── Detalhe da proposta (critérios + apontamentos + decisão) ────────────
function DetalheProposta({ id, constantes, aoVoltar, areas }) {
  const [p, setP] = useState(null);
  const [pessoas, setPessoas] = useState([]);
  const [apAbertoCriterio, setApAbertoCriterio] = useState(null); // chave do critério com textarea aberta
  const [apTextoCriterio, setApTextoCriterio] = useState('');
  const [ressalva, setRessalva] = useState(null);   // {texto, responsavel_id, prazo}
  const [exigencia, setExigencia] = useState(null); // {texto}
  const [salvando, setSalvando] = useState(false);
  const [simulacao, setSimulacao] = useState(null); // efeito no orçamento se aprovar
  // Apontamento de custo/recorrência/data (2026-09-18): qual bloco está com
  // o campo editável aberto ('custo'|'recorrencia'|'data'|null) + o rascunho
  // de cada um.
  const [apontEditando, setApontEditando] = useState(null);
  const [apontRascunho, setApontRascunho] = useState({});

  const criterios = constantes?.criterios || [];
  const campos = constantes?.campos_apontaveis || [];

  const carregar = useCallback(async () => {
    try { setP(await api.propostas.get(id)); } catch { toast.error('Erro ao abrir a proposta'); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { usersApi.list().then((u) => setPessoas(Array.isArray(u) ? u : [])).catch(() => {}); }, []);

  // Simulação isolada: o endpoint tira TODAS as outras pendentes e deixa só esta
  // proposta na parte hachurada — é o "e se eu aprovar isto?" do spec.
  const recarregarOrcamento = useCallback(async () => {
    if (!p?.ciclo_id) return;
    try { setSimulacao(await api.ciclos.orcamentoPastor(p.ciclo_id, p.id)); }
    catch { setSimulacao(null); }
  }, [p?.ciclo_id, p?.id]);
  useEffect(() => { recarregarOrcamento(); }, [recarregarOrcamento]);

  if (!p) return <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>;
  const quorumCompleto = Array.isArray(p.avaliacoes) && p.avaliacoes.length >= p.quorum;
  const avaliacoesParciais = Array.isArray(p.avaliacoes) ? p.avaliacoes : [];

  const decidir = async (corpo) => {
    setSalvando(true);
    try {
      await api.propostas.decidir(p.id, corpo);
      toast.success('Decisão registrada');
      aoVoltar();
    } catch (e) { toast.error(e.message || 'Erro ao decidir'); } finally { setSalvando(false); }
  };

  // Apontar um critério específico: mapeia pro campo apontável mais próximo
  // e, quando a chave difere, prefixa o texto com o nome do critério.
  const apontarCriterio = async (criterio) => {
    if (!apTextoCriterio.trim()) { toast.error('Escreva o apontamento.'); return; }
    const campo = CRITERIO_PARA_CAMPO[criterio.chave] || 'descricao';
    const precisaPrefixo = campo !== criterio.chave;
    const texto = precisaPrefixo ? `[${criterio.titulo}] ${apTextoCriterio.trim()}` : apTextoCriterio.trim();
    try {
      await api.propostas.apontar(p.id, { campo, texto });
      setApTextoCriterio('');
      setApAbertoCriterio(null);
      toast.success('Apontamento enviado ao proponente');
      await carregar();
    } catch (e) { toast.error(e.message || 'Erro ao apontar'); }
  };

  // ── Apontamento de custo/recorrência/data (Pastor) ──────────────────────
  const salvarApontamentoPastor = async (campo, corpo) => {
    try {
      await api.propostas.apontarPastor(p.id, { campo, ...corpo });
      setApontEditando(null);
      toast.success('Apontamento salvo · atualiza o gráfico de orçamento abaixo');
      await carregar();
      await recarregarOrcamento();
    } catch (e) { toast.error(e.message || 'Erro ao apontar'); }
  };
  const removerApontamentoPastor = async (campo) => {
    try {
      await api.propostas.removerApontamentoPastor(p.id, campo);
      toast.success('Apontamento removido · voltou ao valor original');
      await carregar();
      await recarregarOrcamento();
    } catch (e) { toast.error(e.message || 'Erro ao remover apontamento'); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: C.text }}>{p.nome}</h3>
          <span style={{ fontSize: 12, color: C.t3 }}>{rotuloArea(p.area, areas)} · {p.custeio?.rotulo} · líquido {fmtBRL(p.liquido_exibicao)}</span>
        </div>
        <button style={btn('ghost')} onClick={aoVoltar}>Voltar ao ranking</button>
      </div>

      {/* ── B) Critérios (notas e argumentações por diretoria, lado a lado) ─
           Visão exclusiva do Pastor: cada diretoria vira uma coluna, com a
           nota e o comentário daquele critério — diretorias NUNCA veem a
           coluna umas das outras (isso só existe aqui, na tela do Pastor). */}
      <div style={{ ...cardStyle, padding: 14, overflowX: 'auto' }}>
        <strong style={{ fontSize: 13, color: C.text }}>Critérios</strong>
        <p style={{ ...hint, marginTop: 2 }}>
          Notas e argumentações aparecem conforme cada diretoria avalia — visível só a você.
          As diretorias continuam sem ver a nota ou o comentário umas das outras.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, minWidth: 760 }}>
          <thead><tr>
            <th style={{ ...thStyle, minWidth: 190 }}>Critério</th>
            <th style={{ ...thStyle, minWidth: 200 }}>Informado pelo proponente</th>
            {avaliacoesParciais.map((a) => (
              <th key={a.id} style={{ ...thStyle, textAlign: 'center', minWidth: 150 }}>{rotuloDiretoria(a.diretoria)}</th>
            ))}
            <th style={{ ...thStyle, textAlign: 'center' }}>Média</th>
            <th style={thStyle}></th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 600 }}>Recorrência e data</td>
              <td style={{ ...tdStyle, color: C.t2 }}>
                {RECORRENCIAS.find((r) => r.valor === (p.recorrencia_apontada ?? p.recorrencia))?.rotulo || (p.recorrencia_apontada ?? p.recorrencia)}
                {p.recorrencia_apontada != null && <Badge texto="apontado" cor={C.amber} />}
                {' · '}{fmtQuando(p)}
                {p.data_inicio_apontada != null && <>{' → '}{fmtData(p.data_inicio_apontada)} <Badge texto="apontado" cor={C.amber} /></>}
              </td>
              {avaliacoesParciais.map((a) => <td key={a.id} style={tdStyle} />)}
              <td style={tdStyle} />
              <td style={tdStyle} />
            </tr>
            {criterios.map((c, i) => {
              const notasDoCriterio = avaliacoesParciais.map((a) => a['nota_' + c.chave]).filter((n) => n != null);
              const mediaParcial = notasDoCriterio.length ? notasDoCriterio.reduce((s, n) => s + Number(n), 0) / notasDoCriterio.length : null;
              const media = quorumCompleto ? Number((p.medias || [])[i] ?? 0) : mediaParcial;
              return (
                <Fragment key={c.chave}>
                  <tr>
                    <td style={{ ...tdStyle, width: 190 }}>
                      <strong style={{ display: 'block', fontSize: 13 }}>{i + 1}. {c.titulo}</strong>
                      <span style={{ fontSize: 11.5, color: C.t3 }}>{c.descricao}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12.5, color: C.t2, maxWidth: 240 }}>{evidenciaCriterio(c.chave, p)}</td>
                    {avaliacoesParciais.map((a) => (
                      <td key={a.id} style={{ ...tdStyle, textAlign: 'center', fontSize: 12.5 }}>
                        <strong style={{ fontSize: 14, color: C.text }}>{a['nota_' + c.chave] ?? '—'}</strong>
                        {a.coment_criterios?.[c.chave] && (
                          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{a.coment_criterios[c.chave]}</div>
                        )}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: C.primary }}>
                      {media != null ? media.toFixed(2) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <button style={btn('ghost')} onClick={() => { setApAbertoCriterio(apAbertoCriterio === c.chave ? null : c.chave); setApTextoCriterio(''); }}>
                        {apAbertoCriterio === c.chave ? 'Cancelar' : 'Apontar'}
                      </button>
                    </td>
                  </tr>
                  {apAbertoCriterio === c.chave && (
                    <tr>
                      <td colSpan={4 + avaliacoesParciais.length} style={tdStyle}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <textarea style={{ ...input, flex: 1, minWidth: 220, minHeight: 44 }} placeholder={`Apontamento sobre "${c.titulo}"`} value={apTextoCriterio} onChange={(e) => setApTextoCriterio(e.target.value)} />
                          <button style={btn('soft')} onClick={() => apontarCriterio(c)}>Salvar apontamento</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!avaliacoesParciais.length && <p style={{ ...hint, marginTop: 8 }}>Nenhuma diretoria avaliou ainda.</p>}
        {!quorumCompleto && avaliacoesParciais.length > 0 && (
          <p style={{ ...hint, marginTop: 8 }}>Aguardando o quórum das diretorias ({p.avaliacoes_recebidas}/{p.quorum}) — a média acima já considera quem avaliou até agora.</p>
        )}

        {avaliacoesParciais.some((a) => a.comentario_geral) && (
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            <strong style={{ fontSize: 12.5, color: C.text }}>Comentário geral</strong>
            {avaliacoesParciais.filter((a) => a.comentario_geral).map((a) => (
              <div key={a.id} style={{ fontSize: 12.5, color: C.t2 }}>
                <Badge texto={rotuloDiretoria(a.diretoria)} cor={C.blue} /> {a.comentario_geral}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── C) Histórico de apontamentos ─────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13, color: C.text }}>Histórico de apontamentos</strong>
        {(p.apontamentos || []).length ? (p.apontamentos || []).map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.t2 }}>
            <Badge texto={campos.find((c) => c.chave === a.campo)?.rotulo || a.campo} cor={C.blue} />
            <span style={{ flex: 1 }}>{a.texto}</span>
            <button style={btn('ghost')} onClick={async () => { await api.propostas.removerApontamento(a.id); await carregar(); }}>remover</button>
          </div>
        )) : <span style={hint}>Nenhum apontamento ainda.</span>}
      </div>

      {/* ── D) Apontamento de custo, recorrência e data ──────────────── */}
      <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 12 }}>
        <div>
          <strong style={{ fontSize: 13, color: C.text }}>Apontamento de custo, recorrência e data</strong>
          <p style={{ ...hint, marginTop: 2 }}>
            Este apontamento já atualiza a linha de orçamento aprovado abaixo, considerando a nova recorrência.
            O valor original informado pelo proponente nunca é alterado — só o que entra no cálculo do orçamento em tempo real.
          </p>
        </div>

        {/* Custo */}
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Custo</span>
          <span style={{ ...hint, color: C.t3 }}>Original: {fmtBRL(p.custo)}</span>
          {p.custo_apontado != null ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>Apontado: {fmtBRL(p.custo_apontado)}</span>
              <button style={btn('ghost')} onClick={() => removerApontamentoPastor('custo')}>Remover apontamento</button>
            </div>
          ) : apontEditando === 'custo' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ ...input, width: 160 }} type="number" step="0.01" placeholder="Novo custo"
                value={apontRascunho.custo ?? ''} onChange={(e) => setApontRascunho({ ...apontRascunho, custo: e.target.value })} />
              <button style={btn('soft')} onClick={() => salvarApontamentoPastor('custo', { valor: Number(apontRascunho.custo || 0) })}>Salvar</button>
              <button style={btn('ghost')} onClick={() => setApontEditando(null)}>Cancelar</button>
            </div>
          ) : (
            <button style={{ ...btn('ghost'), width: 'fit-content' }} onClick={() => setApontEditando('custo')}>Apontar novo valor</button>
          )}
        </div>

        {/* Recorrência */}
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Recorrência</span>
          <span style={{ ...hint, color: C.t3 }}>
            Original: {RECORRENCIAS.find((r) => r.valor === p.recorrencia)?.rotulo || p.recorrencia}
            {p.dia_semana != null && ` · ${DIAS_SEMANA[p.dia_semana]}`}
          </span>
          {p.recorrencia_apontada != null ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>
                Apontado: {RECORRENCIAS.find((r) => r.valor === p.recorrencia_apontada)?.rotulo || p.recorrencia_apontada}
                {p.dia_semana_apontado != null && ` · ${DIAS_SEMANA[p.dia_semana_apontado]}`}
              </span>
              <button style={btn('ghost')} onClick={() => removerApontamentoPastor('recorrencia')}>Remover apontamento</button>
            </div>
          ) : apontEditando === 'recorrencia' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={{ ...input, width: 180 }} value={apontRascunho.recorrencia ?? ''} onChange={(e) => setApontRascunho({ ...apontRascunho, recorrencia: e.target.value })}>
                <option value="">Recorrência…</option>
                {RECORRENCIAS.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
              </select>
              <select style={{ ...input, width: 140 }} value={apontRascunho.dia_semana ?? ''} onChange={(e) => setApontRascunho({ ...apontRascunho, dia_semana: e.target.value })}>
                <option value="">Dia (opcional)</option>
                {DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <button style={btn('soft')} disabled={!apontRascunho.recorrencia} onClick={() => salvarApontamentoPastor('recorrencia', { valor: apontRascunho.recorrencia, dia_semana: apontRascunho.dia_semana === '' || apontRascunho.dia_semana == null ? null : Number(apontRascunho.dia_semana) })}>Salvar</button>
              <button style={btn('ghost')} onClick={() => setApontEditando(null)}>Cancelar</button>
            </div>
          ) : (
            <button style={{ ...btn('ghost'), width: 'fit-content' }} onClick={() => setApontEditando('recorrencia')}>Apontar novo valor</button>
          )}
        </div>

        {/* Data */}
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Data de início</span>
          <span style={{ ...hint, color: C.t3 }}>Original: {fmtQuando(p)}</span>
          {p.data_inicio_apontada != null ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>Apontado: {fmtData(p.data_inicio_apontada)}</span>
              <button style={btn('ghost')} onClick={() => removerApontamentoPastor('data')}>Remover apontamento</button>
            </div>
          ) : apontEditando === 'data' ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ ...input, width: 170 }} type="date" value={apontRascunho.data ?? ''} onChange={(e) => setApontRascunho({ ...apontRascunho, data: e.target.value })} />
              <button style={btn('soft')} disabled={!apontRascunho.data} onClick={() => salvarApontamentoPastor('data', { valor: apontRascunho.data, precisao: 'dia' })}>Salvar</button>
              <button style={btn('ghost')} onClick={() => setApontEditando(null)}>Cancelar</button>
            </div>
          ) : (
            <button style={{ ...btn('ghost'), width: 'fit-content' }} onClick={() => setApontEditando('data')}>Apontar novo valor</button>
          )}
        </div>
      </div>

      {/* ── E) Gráfico de orçamento ───────────────────────────────────── */}
      {simulacao && (
        <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 6 }}>
          <div>
            <strong style={{ fontSize: 13, color: C.text }}>
              {p.situacao_decisao ? 'Efeito desta proposta no orçamento' : 'Efeito no orçamento, se você aprovar'}
            </strong>
            <p style={{ ...hint, marginTop: 2 }}>
              A parte sólida é o que já está aprovado (em tempo real, com os apontamentos); a hachurada é o custo
              desta proposta. A linha tracejada é "todas as propostas", se todas fossem aprovadas — imutável, sempre
              com os valores originais. Demais propostas pendentes ficam de fora desta simulação.
            </p>
          </div>
          {simulacao.sem_orcamento && (
            <p style={{ ...hint, margin: 0, color: C.amber }}>{simulacao.mensagem}</p>
          )}
          <GraficoOrcamento visao={simulacao} alturaPx={230} rotuloPendente="Esta proposta" />
          {simulacao.meses_negativos > 0 && (
            <span style={{ fontSize: 12.5, color: C.red, fontWeight: 600 }}>
              {simulacao.meses_negativos} mês(es) ficariam com saldo negativo neste cenário.
            </span>
          )}
        </div>
      )}

      {!p.situacao_decisao && quorumCompleto && (
        <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 13, color: C.text }}>Decisão</strong>
          {!ressalva && !exigencia && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn('primary')} disabled={salvando} onClick={() => decidir({ decisao: 'aprovada' })}>Aprovar</button>
              <button style={btn('amber')} disabled={salvando} onClick={() => setRessalva({ texto: '', responsavel_id: '', prazo: '' })}>Aprovar com ressalvas</button>
              <button style={btn('danger')} disabled={salvando} onClick={() => setExigencia({ texto: '' })}>Reprovar</button>
            </div>
          )}
          {ressalva && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={hint}>A proposta entra no calendário depois que você verificar a ressalva.</span>
              <textarea style={{ ...input, minHeight: 54 }} placeholder="Ressalva" value={ressalva.texto} onChange={(e) => setRessalva({ ...ressalva, texto: e.target.value })} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select style={{ ...input, width: 240 }} value={ressalva.responsavel_id} onChange={(e) => setRessalva({ ...ressalva, responsavel_id: e.target.value })}>
                  <option value="">Responsável…</option>
                  {pessoas.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
                <input style={{ ...input, width: 170 }} type="date" value={ressalva.prazo} onChange={(e) => setRessalva({ ...ressalva, prazo: e.target.value })} />
                <button style={btn('amber')} disabled={salvando} onClick={() => decidir({ decisao: 'aprovada_ressalvas', ressalva })}>Confirmar</button>
                <button style={btn('ghost')} onClick={() => setRessalva(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {exigencia && (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={hint}>O proponente tem uma rodada e cinco dias para responder. Você reavalia sozinho, com as notas que os diretores deram à versão anterior.</span>
              <textarea style={{ ...input, minHeight: 54 }} placeholder="Exigência" value={exigencia.texto} onChange={(e) => setExigencia({ texto: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn('danger')} disabled={salvando} onClick={() => decidir({ decisao: 'reprovada', exigencia })}>Confirmar reprovação</button>
                <button style={btn('ghost')} onClick={() => setExigencia(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {p.situacao_decisao && ['aprovada', 'aprovada_ressalvas'].includes(p.estado) && (
        <button style={{ ...btn('ghost'), width: 'fit-content' }} disabled={salvando} onClick={async () => {
          await api.propostas.retirar(p.id);
          toast.success('Proposta retirada do calendário · voltou ao ranking');
          aoVoltar();
        }}>Retirar do calendário</button>
      )}
    </div>
  );
}

// ─── Retificações ─────────────────────────────────────────────────────────
function Retificacoes({ ciclo, recarregarCiclo }) {
  const [lista, setLista] = useState([]);
  const [detalhes, setDetalhes] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const todas = await api.ciclos.propostas(ciclo.id).catch(() => []);
    const fila = (todas || []).filter((p) => ['retificada', 'reprovada'].includes(p.estado));
    setLista(fila);
    const det = {};
    await Promise.all(fila.filter((p) => p.estado === 'retificada').map(async (p) => {
      det[p.id] = await api.propostas.get(p.id).catch(() => null);
    }));
    setDetalhes(det);
  }, [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const agir = async (p, decisao) => {
    setSalvando(true);
    try {
      if (decisao === 'reaberta_diretores') {
        if (!window.confirm('Isso apaga as quatro notas e devolve a proposta para nova avaliação. Confirmar?')) { setSalvando(false); return; }
        await api.propostas.decidirRetificacao(p.id, { decisao });
      } else if (decisao === 'aprovada_ressalvas') {
        const texto = window.prompt('Ressalva:');
        if (!texto?.trim()) { setSalvando(false); return; }
        await api.propostas.decidirRetificacao(p.id, { decisao, ressalva: { texto: texto.trim(), responsavel_id: p.lider_id } });
      } else {
        await api.propostas.decidirRetificacao(p.id, { decisao });
      }
      toast.success('Registrado');
      await carregar();
      recarregarCiclo?.();
    } catch (e) { toast.error(e.message || 'Erro'); } finally { setSalvando(false); }
  };

  const aguardando = lista.filter((p) => p.estado === 'reprovada');
  const naFila = lista.filter((p) => p.estado === 'retificada');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 780 }}>
        O proponente tem uma rodada e cinco dias para responder. Você reavalia sozinho, e as notas continuam sendo as
        que os diretores deram à versão reprovada. A tabela abaixo compara as duas versões.
      </p>
      {aguardando.map((p) => (
        <div key={p.id} style={{ fontSize: 12.5, color: C.amber }}>Aguardando o proponente: {p.nome}</div>
      ))}
      {!naFila.length && <p style={{ fontSize: 13, color: C.t3 }}>Não há proposta retificada na fila.</p>}
      {naFila.map((p) => {
        const det = detalhes[p.id];
        return (
          <div key={p.id} style={{ ...cardStyle, padding: 14, display: 'grid', gap: 10 }}>
            <strong style={{ fontSize: 14, color: C.text }}>{p.nome}</strong>
            {det?.diff_retificacao?.length ? (
              <table style={{ borderCollapse: 'collapse' }}>
                <thead><tr><th style={thStyle}>Campo</th><th style={thStyle}>Versão reprovada</th><th style={thStyle}>Retificada</th></tr></thead>
                <tbody>
                  {det.diff_retificacao.map((d) => (
                    <tr key={d.campo}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{d.campo}</td>
                      <td style={{ ...tdStyle, color: C.t3 }}>{String(d.antes ?? '—')}</td>
                      <td style={{ ...tdStyle, color: C.primary, fontWeight: 600 }}>{String(d.depois ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <span style={hint}>Sem mudanças nos campos comparáveis.</span>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn('primary')} disabled={salvando} onClick={() => agir(p, 'aprovada')}>Aprovar</button>
              <button style={btn('amber')} disabled={salvando} onClick={() => agir(p, 'aprovada_ressalvas')}>Aprovar com ressalvas</button>
              <button style={btn('danger')} disabled={salvando} onClick={() => agir(p, 'arquivada')}>Reprovar em definitivo</button>
              <button style={btn('ghost')} disabled={salvando} onClick={() => agir(p, 'reaberta_diretores')}>Reabrir para os diretores</button>
            </div>
            <span style={hint}>Reabrir devolve a proposta ao painel das diretorias e apaga as notas antigas.</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Ressalvas ────────────────────────────────────────────────────────────
function Ressalvas({ ciclo, recarregarCiclo }) {
  const [lista, setLista] = useState([]);
  const carregar = useCallback(async () => {
    const todas = await api.ciclos.propostas(ciclo.id).catch(() => []);
    const comRessalva = (todas || []).filter((p) => p.estado === 'aprovada_ressalvas');
    const det = await Promise.all(comRessalva.map((p) => api.propostas.get(p.id).catch(() => null)));
    setLista(det.filter(Boolean));
  }, [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>
        Uma proposta aprovada com ressalvas só entra no calendário depois que você verificar o cumprimento.
      </p>
      {!lista.length && <p style={{ fontSize: 13, color: C.t3 }}>Nenhuma ressalva no ciclo.</p>}
      {lista.map((p) => (
        <div key={p.id} style={{ ...cardStyle, padding: 14, display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 14, color: C.text }}>{p.nome}</strong>
          <span style={{ fontSize: 13, color: C.t2 }}>{p.ressalva?.texto}</span>
          <span style={hint}>Prazo {fmtData(p.ressalva?.prazo)} · {p.ressalva?.verificada ? 'verificada' : 'aguardando verificação'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {p.ressalva?.verificada ? (
              <button style={btn('ghost')} onClick={async () => { await api.propostas.reabrirRessalva(p.id); toast.success('Ressalva reaberta'); await carregar(); recarregarCiclo?.(); }}>Reabrir</button>
            ) : (
              <button style={btn('primary')} onClick={async () => { await api.propostas.verificarRessalva(p.id); toast.success('Ressalva verificada · proposta liberada pro calendário'); await carregar(); recarregarCiclo?.(); }}>Marcar cumprida</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Orçamento do Pastor ──────────────────────────────────────────────────
function OrcamentoPastor({ ciclo }) {
  const [visao, setVisao] = useState(null);
  const carregar = useCallback(async () => {
    try { setVisao(await api.ciclos.orcamentoPastor(ciclo.id)); }
    catch (e) { toast.error(e.message || 'Erro ao carregar'); }
  }, [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const remanejar = async (item, novoMes) => {
    const det = await api.propostas.get(item.id).catch(() => null);
    if (!det) return;
    const dia = det.precisao_inicio === 'dia' ? String(det.data_inicio).slice(8, 10) : '01';
    const ano = String(det.data_inicio).slice(0, 4);
    try {
      await api.propostas.remanejar(item.id, { data_inicio: `${ano}-${String(novoMes).padStart(2, '0')}-${dia}` });
      toast.success('Remanejada · calendário e saldo recalculados');
      await carregar();
    } catch (e) { toast.error(e.message || 'Erro ao remanejar'); }
  };

  if (!visao) return <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {visao.sem_orcamento ? (
        <p style={{ margin: 0, fontSize: 12.5, color: C.amber, maxWidth: 800 }}>{visao.mensagem}</p>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 800 }}>
          Caixa livre enviado pela diretoria Financeira em {fmtData(String(visao.enviado_em).slice(0, 10))}, contra o custo
          líquido rateado por mês. A linha de aprovados cobre o que já está no calendário; a de propostos cobre o que
          ainda aguarda sua decisão. Propostas de vários meses têm o líquido dividido igualmente entre os meses que ocupam.
        </p>
      )}
      {!visao.sem_orcamento && (
        <div style={{ fontSize: 13, fontWeight: 600, color: visao.meses_negativos ? C.red : C.green }}>
          {visao.meses_negativos
            ? `${visao.meses_negativos} mês(es) com saldo projetado negativo. Remaneje na tabela do fim da página ou pese isso nas decisões pendentes.`
            : 'Nenhum mês estoura o caixa livre no cenário atual.'}
        </div>
      )}

      <div style={{ ...cardStyle, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <strong style={{ fontSize: 13, color: C.text }}>Orçamento do ciclo</strong>
          <button style={btn('ghost')} onClick={carregar}>↻ Atualizar</button>
        </div>
        <GraficoOrcamento visao={visao} alturaPx={300} />
      </div>
      <span style={hint}>
        Linha: caixa livre do mês. Coluna: custo previsto, com a parte sólida já aprovada e a translúcida aguardando sua
        decisão. Quando a coluna passa da linha, o mês estoura. O rateio uniforme é uma simplificação: se um projeto
        concentra o gasto num mês só, o número real daquele mês será maior do que o mostrado.
      </span>

      {(visao.premissas || []).length > 0 && (
        <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 13, color: C.text }}>Informações-chave do Financeiro</strong>
          {visao.premissas.map((pr, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.t2 }}><strong>{pr.titulo}:</strong> {pr.texto}</div>
          ))}
          {visao.obs && <div style={{ fontSize: 12.5, color: C.t3 }}>{visao.obs}</div>}
        </div>
      )}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              <th style={thStyle}></th>
              {MESES.map((m) => <th key={m} style={{ ...thStyle, textAlign: 'right' }}>{m}</th>)}
            </tr></thead>
            <tbody>
              {[
                ...(Array.isArray(visao.caixa_livre) ? [['Caixa livre', visao.caixa_livre]] : []),
                ['Aprovados no calendário (tempo real)', visao.comprometido],
                ['Propostos sem decisão', visao.propostos],
                ...(Array.isArray(visao.todas_propostas) ? [['Todas as propostas (se todas fossem aprovadas)', visao.todas_propostas]] : []),
                ...(Array.isArray(visao.saldo) ? [['Saldo projetado', visao.saldo]] : []),
              ].map(([nome, serie]) => (
                <tr key={nome}>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>{nome}</td>
                  {serie.map((v, i) => (
                    <td key={i} style={{ ...tdStyle, textAlign: 'right', color: nome === 'Saldo projetado' && v < 0 ? C.red : undefined, fontWeight: nome === 'Saldo projetado' ? 700 : 400 }}>
                      {Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 13, color: C.text }}>Itens no calendário · remanejar mês de início</strong>
        <span style={hint}>Trocar o mês aqui é o mesmo remanejamento da aba Calendário: a mudança vale para as duas telas e recalcula conflitos e saldo na hora.</span>
        {(visao.itens || []).map((item) => {
          const mesAtual = item.rateio.findIndex((v) => v !== 0) + 1;
          return (
            <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span style={{ flex: 1 }}>{item.nome}</span>
              <select style={{ ...input, width: 140 }} value={mesAtual || 1} onChange={(e) => remanejar(item, Number(e.target.value))}>
                {MESES_LONGOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          );
        })}
        {!(visao.itens || []).length && <span style={hint}>Nenhuma proposta foi aprovada ainda. Aprove em Decisões.</span>}
      </div>
    </div>
  );
}

// ─── Calendário (planejamento + definitivo) ───────────────────────────────
function Calendario({ ciclo, recarregarCiclo }) {
  const [dados, setDados] = useState(null);
  const [visao, setVisao] = useState('ano');
  const carregar = useCallback(async () => {
    try { setDados(await api.ciclos.calendario(ciclo.id)); }
    catch { toast.error('Erro ao carregar o calendário'); }
  }, [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!dados) return <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>;

  const aceitar = async (c) => {
    const justificativa = window.prompt('Por que esta coincidência é tolerável?');
    if (!justificativa?.trim()) return;
    try {
      await api.ciclos.aceitarConflito(ciclo.id, { proposta_a: c.proposta_a.id, proposta_b: c.proposta_b.id, tipo: c.tipo, justificativa: justificativa.trim() });
      toast.success('Conflito aceito · sai dos bloqueios da publicação');
      await carregar();
    } catch (e) { toast.error(e.message || 'Erro ao aceitar'); }
  };

  const conflitosAbertos = (dados.planejamento?.conflitos || []).filter((c) => !c.aceito);
  const itens = dados.planejamento?.itens || [];
  const cargaPorMes = new Array(12).fill(0);
  itens.forEach((p) => { cargaPorMes[parseInt(String(p.data_inicio).slice(5, 7), 10) - 1] += 1; });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={subBtn(visao === 'ano')} onClick={() => setVisao('ano')}>Ano {ciclo.ano}</button>
        <button style={subBtn(visao === 'plan')} onClick={() => setVisao('plan')}>Planejamento</button>
        <button style={subBtn(visao === 'def')} onClick={() => setVisao('def')}>Definitivo</button>
      </div>

      {visao === 'ano' && <CalendarioAno ano={ciclo.ano} itens={dados.planejamento?.itens || []} />}

      {visao === 'plan' && (
        <>
          <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 800 }}>
            Esta é a versão de trabalho. Altere mês, dia, local e horário e o sistema recalcula os conflitos na hora.
            O conflito de agenda vale só entre naturezas iguais. O de espaço vale sempre que o local e o horário coincidem.
          </p>
          {conflitosAbertos.length > 0 ? (
            <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 8 }}>
              <strong style={{ fontSize: 13, color: C.amber }}>Conflitos para julgamento</strong>
              {conflitosAbertos.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, flexWrap: 'wrap' }}>
                  <Badge texto={c.tipo === 'espaco' ? 'espaço' : 'agenda'} cor={c.firme ? C.red : C.amber} />
                  <span style={{ flex: 1 }}>{c.proposta_a.nome} × {c.proposta_b.nome}
                    <span style={{ color: C.t3 }}> · {c.firme ? 'colisão confirmada' : 'só o mês foi informado, então é concentração e não colisão'}</span>
                  </span>
                  <button style={btn('soft')} onClick={() => aceitar(c)}>Aceitar</button>
                </div>
              ))}
              <span style={hint}>
                Aceitar significa que você julgou a coincidência tolerável. O conflito sai da lista de bloqueios da
                publicação e a justificativa fica registrada no calendário definitivo.
              </span>
            </div>
          ) : <p style={{ margin: 0, fontSize: 12.5, color: C.green }}>Nenhum conflito aberto.</p>}

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {MESES.map((m, i) => (
              <div key={m} style={{ padding: '6px 10px', borderRadius: 8, background: cargaPorMes[i] ? C.primaryBg : 'transparent', border: `1px solid ${C.border}`, fontSize: 12 }}>
                {m} <strong>{cargaPorMes[i]}</strong>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Item</th><th style={thStyle}>Natureza</th><th style={thStyle}>Quando</th>
                  <th style={thStyle}>Dia da semana</th><th style={thStyle}>Horário</th><th style={thStyle}>Local</th><th style={thStyle}></th>
                </tr></thead>
                <tbody>
                  {itens.map((p) => (
                    <tr key={p.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nome}</td>
                      <td style={tdStyle}>{p.natureza}</td>
                      <td style={tdStyle}>{fmtQuando(p)}</td>
                      <td style={tdStyle}>{p.dia_semana == null ? '—' : DIAS_SEMANA[p.dia_semana]}</td>
                      <td style={tdStyle}>{p.hora_inicio ? `${String(p.hora_inicio).slice(0, 5)}–${String(p.hora_fim || '').slice(0, 5)}` : '—'}</td>
                      <td style={tdStyle}>{p.local_nome}</td>
                      <td style={tdStyle}>
                        <button style={btn('ghost')} onClick={async () => {
                          await api.propostas.retirar(p.id);
                          toast.success('Retirada · voltou ao ranking');
                          await carregar();
                          recarregarCiclo?.();
                        }}>Retirar</button>
                      </td>
                    </tr>
                  ))}
                  {!itens.length && <tr><td style={tdStyle} colSpan={7}>Nenhuma proposta foi aprovada ainda. Aprove em Decisões.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {(dados.planejamento?.conflitos || []).filter((c) => c.aceito).length > 0 && (
            <div style={{ fontSize: 12.5, color: C.t3 }}>
              Conflitos aceitos: {(dados.planejamento.conflitos).filter((c) => c.aceito).map((c, i) => (
                <span key={i}>{c.proposta_a.nome} × {c.proposta_b.nome} ({c.tipo === 'espaco' ? 'espaço' : 'agenda'}) </span>
              ))}
              — reabra pelo aceite na lista da publicação.
            </div>
          )}
        </>
      )}

      {visao === 'def' && (
        !dados.definitivo ? (
          <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>
            O calendário definitivo aparece depois que você publicar em <strong>Ciclo e publicação</strong>. Até lá, só existe a versão de planejamento.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>
              Versão publicada em {fmtData(String(dados.definitivo.publicado_em).slice(0, 10))}, com {dados.definitivo.itens.length} itens.
              Esta aba é somente leitura: ela guarda o que foi publicado, mesmo que o planejamento mude depois.
            </p>
            {dados.definitivo.divergencias?.length > 0 && (
              <div style={{ padding: 12, borderRadius: 10, background: '#f59e0b14', fontSize: 12.5, color: C.amber, display: 'grid', gap: 3 }}>
                <strong>O planejamento mudou depois da publicação.</strong>
                {dados.definitivo.divergencias.map((d, i) => (
                  <span key={i}>
                    {d.nome}: {d.tipo === 'alterada' ? 'data, local ou horário alterados' : d.tipo === 'saiu_do_calendario' ? 'saiu do calendário' : 'aprovada depois da publicação e ainda fora do definitivo'}
                  </span>
                ))}
                <span>Republique em <strong>Ciclo e publicação</strong> para que o definitivo passe a refletir o planejamento.</span>
              </div>
            )}
            {!dados.definitivo.divergencias?.length && (
              <p style={{ margin: 0, fontSize: 12.5, color: C.green }}>O definitivo está igual ao planejamento.</p>
            )}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={thStyle}>Item</th><th style={thStyle}>Natureza</th><th style={thStyle}>Quando</th>
                    <th style={thStyle}>Local</th><th style={thStyle}>Custo</th><th style={thStyle}>Decisão</th>
                  </tr></thead>
                  <tbody>
                    {dados.definitivo.itens.map((p) => (
                      <tr key={p.id}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nome}</td>
                        <td style={tdStyle}>{p.natureza}</td>
                        <td style={tdStyle}>{fmtQuando(p)}</td>
                        <td style={tdStyle}>{p.local_nome}</td>
                        <td style={tdStyle}>{fmtBRL(p.custo)}</td>
                        <td style={tdStyle}><EstadoBadge estado={p.decisao} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Ciclo e publicação ───────────────────────────────────────────────────
function CicloPublicacao({ ciclo, recarregarCiclo }) {
  const [travas, setTravas] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(async () => {
    try { setTravas(await api.ciclos.travas(ciclo.id)); } catch { /* silencioso */ }
  }, [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const alternarJanela = async (campo) => {
    setSalvando(true);
    try {
      await api.ciclos.janelas(ciclo.id, { [campo]: !ciclo[campo] });
      toast.success('Janela atualizada');
      recarregarCiclo?.();
    } catch (e) { toast.error(e.message || 'Erro'); } finally { setSalvando(false); }
  };

  const publicar = async () => {
    setSalvando(true);
    try {
      const r = await api.ciclos.publicar(ciclo.id);
      toast.success(`Calendário publicado · versão ${r.versao} com ${r.itens} itens`);
      recarregarCiclo?.();
      await carregar();
    } catch (e) {
      toast.error(e.message || 'A publicação está bloqueada');
    } finally { setSalvando(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13, color: C.text }}>Janelas do ciclo {ciclo.ano}</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.t2 }}>
          <input type="checkbox" checked={Boolean(ciclo.submissao_aberta)} disabled={salvando} onChange={() => alternarJanela('submissao_aberta')} />
          Janela de submissão aberta
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.t2 }}>
          <input type="checkbox" checked={Boolean(ciclo.avaliacao_aberta)} disabled={salvando} onChange={() => alternarJanela('avaliacao_aberta')} />
          Janela de avaliação aberta
        </label>
      </div>

      <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13, color: C.text }}>Publicação</strong>
        {!travas && <span style={hint}>Verificando as travas…</span>}
        {travas && travas.bloqueada && (
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 13, color: C.red }}>A publicação está bloqueada por:</strong>
            {travas.motivos.map((m) => <span key={m} style={{ fontSize: 12.5, color: C.t2 }}>· {m}</span>)}
            <span style={hint}>
              Conflitos com precisão apenas mensal não bloqueiam a publicação, e os que você aceitou também não.
              Ambos aparecem no calendário.
            </span>
          </div>
        )}
        {travas && !travas.bloqueada && (
          <span style={{ fontSize: 13, color: C.green }}>
            <strong>O calendário está pronto para publicar.</strong> São {travas.itens_no_calendario} itens, sem bloqueio.
            {travas.conflitos_aceitos > 0 && ` Você aceitou ${travas.conflitos_aceitos} conflito(s), que por isso não bloqueiam a publicação.`}
          </span>
        )}
        <button style={{ ...btn('primary'), width: 'fit-content' }} disabled={salvando || !travas || travas.bloqueada} onClick={publicar}>
          {ciclo.publicacao_versao > 0 ? 'Republicar' : 'Publicar calendário do ciclo'}
        </button>
        {ciclo.publicado_em && (
          <span style={hint}>Última publicação em {fmtData(String(ciclo.publicado_em).slice(0, 10))} · versão {ciclo.publicacao_versao}.</span>
        )}
      </div>
    </div>
  );
}

// ─── Container das sub-abas do Pastor ─────────────────────────────────────
export default function PastorTab({ ciclo, constantes, areas, recarregarCiclo }) {
  const [sub, setSub] = useState(0);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SUBS.map((s, i) => <button key={s} style={subBtn(sub === i)} onClick={() => setSub(i)}>{s}</button>)}
      </div>
      {sub === 0 && <Decisoes ciclo={ciclo} constantes={constantes} recarregarCiclo={recarregarCiclo} areas={areas} />}
      {sub === 1 && <Retificacoes ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
      {sub === 2 && <Ressalvas ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
      {sub === 3 && <OrcamentoPastor ciclo={ciclo} />}
      {sub === 4 && <Calendario ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
      {sub === 5 && <CicloPublicacao ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
    </div>
  );
}
