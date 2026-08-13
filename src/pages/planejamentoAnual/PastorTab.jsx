import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { planejamentoAnual as api, users as usersApi } from '../../api';
import {
  C, cardStyle, btn, input, hint, Badge, EstadoBadge, fmtBRL, fmtData, fmtQuando,
  MESES, MESES_LONGOS, DIAS_SEMANA, thStyle, tdStyle,
} from './comum';

const SUBS = ['Decisões', 'Retificações', 'Ressalvas', 'Orçamento', 'Calendário', 'Ciclo e publicação'];

const subBtn = (ativo) => ({
  padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${ativo ? C.primary : C.border}`,
  background: ativo ? C.primaryBg : 'transparent', color: ativo ? C.primary : C.t2,
});

// ─── Decisões (ranking + lote + detalhe) ─────────────────────────────────
function Decisoes({ ciclo, constantes, recarregarCiclo }) {
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
    return <DetalheProposta id={aberta} constantes={constantes} aoVoltar={async () => { setAberta(null); await carregar(); recarregarCiclo?.(); }} />;
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
                    <div style={{ fontSize: 11.5, color: C.t3 }}>{r.proposta.area} · {fmtQuando(r.proposta)}</div>
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

// ─── Detalhe da proposta (consolidado + apontamentos + decisão) ──────────
function DetalheProposta({ id, constantes, aoVoltar }) {
  const [p, setP] = useState(null);
  const [pessoas, setPessoas] = useState([]);
  const [apCampo, setApCampo] = useState('custo');
  const [apTexto, setApTexto] = useState('');
  const [ressalva, setRessalva] = useState(null);   // {texto, responsavel_id, prazo}
  const [exigencia, setExigencia] = useState(null); // {texto}
  const [salvando, setSalvando] = useState(false);

  const criterios = constantes?.criterios || [];
  const campos = constantes?.campos_apontaveis || [];

  const carregar = useCallback(async () => {
    try { setP(await api.propostas.get(id)); } catch { toast.error('Erro ao abrir a proposta'); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { usersApi.list().then((u) => setPessoas(Array.isArray(u) ? u : [])).catch(() => {}); }, []);

  if (!p) return <p style={{ fontSize: 13, color: C.t3 }}>Carregando…</p>;
  const quorumCompleto = Array.isArray(p.avaliacoes);

  const decidir = async (corpo) => {
    setSalvando(true);
    try {
      await api.propostas.decidir(p.id, corpo);
      toast.success('Decisão registrada');
      aoVoltar();
    } catch (e) { toast.error(e.message || 'Erro ao decidir'); } finally { setSalvando(false); }
  };

  const apontar = async () => {
    if (!apTexto.trim()) { toast.error('Escreva o apontamento.'); return; }
    try {
      await api.propostas.apontar(p.id, { campo: apCampo, texto: apTexto.trim() });
      setApTexto('');
      toast.success('Apontamento enviado ao proponente');
      await carregar();
    } catch (e) { toast.error(e.message || 'Erro ao apontar'); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: C.text }}>{p.nome}</h3>
          <span style={{ fontSize: 12, color: C.t3 }}>{p.area} · {fmtQuando(p)} · {p.custeio?.rotulo} · líquido {fmtBRL(p.liquido_exibicao)}</span>
        </div>
        <button style={btn('ghost')} onClick={aoVoltar}>Voltar ao ranking</button>
      </div>

      <div style={{ ...cardStyle, padding: 14, overflowX: 'auto' }}>
        <strong style={{ fontSize: 13, color: C.text }}>Pontuação consolidada</strong>
        {quorumCompleto ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, minWidth: 640 }}>
            <thead><tr>
              <th style={thStyle}>Diretoria</th>
              {criterios.map((c) => <th key={c.chave} style={{ ...thStyle, textAlign: 'center' }}>{c.titulo}</th>)}
            </tr></thead>
            <tbody>
              {p.avaliacoes.map((a) => (
                <tr key={a.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{a.diretoria}</td>
                  {criterios.map((c) => <td key={c.chave} style={{ ...tdStyle, textAlign: 'center' }}>{a['nota_' + c.chave]}</td>)}
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700, color: C.primary }}>Média</td>
                {(p.medias || []).map((m, i) => <td key={i} style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: C.primary }}>{Number(m).toFixed(2)}</td>)}
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ ...hint, marginTop: 6 }}>Aguardando o quórum das quatro diretorias ({p.avaliacoes_recebidas}/{p.quorum}).</p>
        )}
        {quorumCompleto && p.soma != null && (
          <div style={{ marginTop: 6, fontSize: 13 }}>Soma das médias: <strong style={{ color: C.primary }}>{Number(p.soma).toFixed(2)} / 35</strong></div>
        )}
        {quorumCompleto && (
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            {p.avaliacoes.some((a) => a.comentario_geral || Object.values(a.coment_criterios || {}).some(Boolean)) ? (
              p.avaliacoes.map((a) => (
                <div key={a.id} style={{ fontSize: 12.5, color: C.t2 }}>
                  <Badge texto={a.diretoria} cor={C.blue} />{' '}
                  {[...Object.entries(a.coment_criterios || {}).filter(([, t]) => t).map(([k, t]) => `${k}: ${t}`), a.comentario_geral].filter(Boolean).join(' · ') || '—'}
                </div>
              ))
            ) : (
              <span style={hint}>Nenhum diretor escreveu fundamentação nesta proposta.</span>
            )}
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, padding: 14, display: 'grid', gap: 8 }}>
        <div>
          <strong style={{ fontSize: 13, color: C.text }}>Apontar nas respostas</strong>
          <p style={{ ...hint, marginTop: 2 }}>Apontar respostas é prerrogativa sua. O apontamento chega apenas ao proponente.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...input, width: 220 }} value={apCampo} onChange={(e) => setApCampo(e.target.value)}>
            {campos.map((c) => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
          </select>
          <input style={{ ...input, flex: 1, minWidth: 220 }} placeholder="Apontamento" value={apTexto} onChange={(e) => setApTexto(e.target.value)} />
          <button style={btn('soft')} onClick={apontar}>Apontar</button>
        </div>
        {(p.apontamentos || []).map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.t2 }}>
            <Badge texto={campos.find((c) => c.chave === a.campo)?.rotulo || a.campo} cor={C.blue} />
            <span style={{ flex: 1 }}>{a.texto}</span>
            <button style={btn('ghost')} onClick={async () => { await api.propostas.removerApontamento(a.id); await carregar(); }}>remover</button>
          </div>
        ))}
      </div>

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
            <span style={hint}>Reabrir devolve a proposta ao painel das quatro diretorias e apaga as notas antigas.</span>
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
  if (visao.sem_orcamento) return <p style={{ fontSize: 13, color: C.t3 }}>{visao.mensagem}</p>;

  const dados = MESES.map((m, i) => ({
    mes: m,
    caixa: visao.caixa_livre[i],
    aprovado: visao.comprometido[i],
    pendente: visao.propostos[i],
  }));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 800 }}>
        Caixa livre enviado pela diretoria Financeira em {fmtData(String(visao.enviado_em).slice(0, 10))}, contra o custo
        líquido rateado por mês. A linha de aprovados cobre o que já está no calendário; a de propostos cobre o que
        ainda aguarda sua decisão. Propostas de vários meses têm o líquido dividido igualmente entre os meses que ocupam.
      </p>
      <div style={{ fontSize: 13, fontWeight: 600, color: visao.meses_negativos ? C.red : C.green }}>
        {visao.meses_negativos
          ? `${visao.meses_negativos} mês(es) com saldo projetado negativo. Remaneje na tabela do fim da página ou pese isso nas decisões pendentes.`
          : 'Nenhum mês estoura o caixa livre no cenário atual.'}
      </div>

      <div style={{ ...cardStyle, padding: 14, height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados}>
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000) + 'k'} />
            <Tooltip formatter={(v) => fmtBRL(v)} />
            <Legend />
            <ReferenceLine y={0} stroke="var(--hairline)" />
            <Bar dataKey="aprovado" name="Aprovado" stackId="c" fill={C.primary} />
            <Bar dataKey="pendente" name="Aguardando decisão" stackId="c" fill={C.amber} fillOpacity={0.55} />
            <Line dataKey="caixa" name="Caixa livre" stroke={C.text} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
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
              {[['Caixa livre', visao.caixa_livre], ['Aprovados no calendário', visao.comprometido], ['Propostos sem decisão', visao.propostos], ['Saldo projetado', visao.saldo]].map(([nome, serie]) => (
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
  const [visao, setVisao] = useState('plan');
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
        <button style={subBtn(visao === 'plan')} onClick={() => setVisao('plan')}>Planejamento</button>
        <button style={subBtn(visao === 'def')} onClick={() => setVisao('def')}>Definitivo</button>
      </div>

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
export default function PastorTab({ ciclo, constantes, recarregarCiclo }) {
  const [sub, setSub] = useState(0);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SUBS.map((s, i) => <button key={s} style={subBtn(sub === i)} onClick={() => setSub(i)}>{s}</button>)}
      </div>
      {sub === 0 && <Decisoes ciclo={ciclo} constantes={constantes} recarregarCiclo={recarregarCiclo} />}
      {sub === 1 && <Retificacoes ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
      {sub === 2 && <Ressalvas ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
      {sub === 3 && <OrcamentoPastor ciclo={ciclo} />}
      {sub === 4 && <Calendario ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
      {sub === 5 && <CicloPublicacao ciclo={ciclo} recarregarCiclo={recarregarCiclo} />}
    </div>
  );
}
