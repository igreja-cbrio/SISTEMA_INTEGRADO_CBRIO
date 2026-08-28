import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ClipboardCheck } from 'lucide-react';
import { planejamentoAnual as api, users as usersApi } from '../../api';
import {
  C, cardStyle, btn, input, label, hint, fmtBRL, fmtQuando, thStyle, tdStyle, Badge,
  NATUREZAS, RECORRENCIAS, DIAS_SEMANA, rotuloArea,
} from './comum';

// Evidência do proponente exibida ao lado de cada critério (protótipo · coluna 2)
function evidencia(chave, p) {
  if (!p) return '';
  switch (chave) {
    case 'relevancia': return `Alcance estimado ${p.alcance_pct ?? '—'}% de ${p.publico_considerado === 'recorte_geracional' ? 'recorte geracional' : 'igreja inteira'}`;
    case 'pertencimento': return p.pertencimento || '—';
    case 'transformacao': return (Array.isArray(p.valores) && p.valores.length)
      ? p.valores.map((v) => `${v.nome}: ${v.justificativa || '—'}`).join(' · ') : 'Nenhum valor marcado';
    case 'visao': return p.visao_explique || '—';
    case 'impacto': return p.impacto || '—';
    case 'custo': return `Custo ${fmtBRL(p.custo)} · arrecadação ${p.tem_arrecadacao ? fmtBRL(p.arrecadacao_prevista) : 'nenhuma'} · líquido ${fmtBRL(p.liquido_exibicao ?? p.liquido)}`;
    case 'sustentabilidade': return p.custeio?.rotulo || '—';
    default: return '';
  }
}

const ORDENS = [
  { valor: 'pendente', rotulo: 'Pendentes primeiro' },
  { valor: 'nome', rotulo: 'Nome (A-Z)' },
  { valor: 'area', rotulo: 'Área' },
  { valor: 'quando', rotulo: 'Quando' },
];

export default function AvaliacaoTab({ ciclo, constantes, minhaDiretoria, locais, areas }) {
  const [propostas, setPropostas] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState(null);   // proposta projetada (avaliador)
  const [notas, setNotas] = useState({});
  const [coments, setComents] = useState({});
  const [geral, setGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ordenarPor, setOrdenarPor] = useState('pendente');

  const criterios = constantes?.criterios || [];

  const carregar = useCallback(async () => {
    if (!ciclo?.id) return;
    setCarregando(true);
    try {
      const lista = await api.ciclos.propostas(ciclo.id);
      setPropostas((Array.isArray(lista) ? lista : []).filter((p) => !['rascunho', 'retificada', 'arquivada'].includes(p.estado)));
    } catch { toast.error('Erro ao carregar o painel'); } finally { setCarregando(false); }
  }, [ciclo?.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { usersApi.list().then((u) => setPessoas(Array.isArray(u) ? u : [])).catch(() => {}); }, []);

  const propostasOrdenadas = useMemo(() => {
    const lista = [...propostas];
    const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    if (ordenarPor === 'nome') return lista.sort(porNome);
    if (ordenarPor === 'area') return lista.sort((a, b) => (a.area || '').localeCompare(b.area || '', 'pt-BR') || porNome(a, b));
    if (ordenarPor === 'quando') return lista.sort((a, b) => String(a.data_inicio || '').localeCompare(String(b.data_inicio || '')));
    // pendente primeiro
    return lista.sort((a, b) => {
      const pa = a.minha_avaliacao_enviada ? 1 : 0;
      const pb = b.minha_avaliacao_enviada ? 1 : 0;
      return pa - pb || porNome(a, b);
    });
  }, [propostas, ordenarPor]);

  const nomeLider = (id) => pessoas.find((u) => u.id === id)?.name || pessoas.find((u) => u.id === id)?.email || '—';
  const nomeLocal = (id) => (locais || []).find((l) => l.id === id)?.nome || '—';

  const abrir = async (p) => {
    try {
      const cheia = await api.propostas.get(p.id);
      setAberta(cheia);
      const minha = cheia.minha_avaliacao;
      const n = {}; const cm = {};
      criterios.forEach((c) => {
        n[c.chave] = minha ? minha['nota_' + c.chave] : null;
        cm[c.chave] = minha?.coment_criterios?.[c.chave] || '';
      });
      setNotas(n); setComents(cm); setGeral(minha?.comentario_geral || '');
    } catch { toast.error('Erro ao abrir a proposta'); }
  };

  const enviar = async () => {
    if (criterios.some((c) => !notas[c.chave])) {
      toast.error('Os sete critérios são obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      const corpo = { coment_criterios: coments, comentario_geral: geral || null };
      criterios.forEach((c) => { corpo['nota_' + c.chave] = notas[c.chave]; });
      const r = await api.propostas.avaliar(aberta.id, corpo);
      toast.success(`Pontuação enviada (${r.avaliacoes_recebidas}/${r.quorum})`);
      setAberta(null);
      await carregar();
    } catch (e) { toast.error(e.message || 'Erro ao enviar a pontuação'); } finally { setSalvando(false); }
  };

  if (aberta) {
    const quorumCompleto = Array.isArray(aberta.avaliacoes);
    const minhaSoma = criterios.reduce((s, c) => s + (notas[c.chave] || 0), 0);
    return (
      <div style={{ ...cardStyle, padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: C.text }}>Pontuar · {aberta.nome}</h3>
            <p style={{ ...hint, marginTop: 4, maxWidth: 640 }}>
              A nota é obrigatória nos sete critérios. A fundamentação é opcional: escreva quando quiser registrar
              o motivo da nota. O Pastor e os outros diretores leem; o proponente não.
            </p>
          </div>
          <button style={btn('ghost')} onClick={() => setAberta(null)}>Voltar</button>
        </div>

        <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: `1px solid ${C.border}`, background: 'var(--panel, var(--cbrio-card))' }}>
          <strong style={{ fontSize: 13, color: C.primary }}>Resumo da proposta</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><span style={label}>Natureza</span><div style={{ fontSize: 13, color: C.text }}>{NATUREZAS.find((n) => n.valor === aberta.natureza)?.rotulo || aberta.natureza || '—'}</div></div>
            <div><span style={label}>Área</span><div style={{ fontSize: 13, color: C.text }}>{rotuloArea(aberta.area, areas)}</div></div>
            <div><span style={label}>Líder responsável</span><div style={{ fontSize: 13, color: C.text }}>{nomeLider(aberta.lider_id)}</div></div>
            <div><span style={label}>Quando</span><div style={{ fontSize: 13, color: C.text }}>{fmtQuando(aberta)}</div></div>
            <div>
              <span style={label}>Recorrência</span>
              <div style={{ fontSize: 13, color: C.text }}>
                {RECORRENCIAS.find((r) => r.valor === aberta.recorrencia)?.rotulo || aberta.recorrencia || '—'}
                {aberta.dia_semana != null && ` · ${DIAS_SEMANA[aberta.dia_semana] || ''}`}
              </div>
            </div>
            <div>
              <span style={label}>Horário</span>
              <div style={{ fontSize: 13, color: C.text }}>
                {aberta.hora_inicio ? String(aberta.hora_inicio).slice(0, 5) : '—'}
                {aberta.hora_fim ? ` – ${String(aberta.hora_fim).slice(0, 5)}` : ''}
              </div>
            </div>
            <div><span style={label}>Local</span><div style={{ fontSize: 13, color: C.text }}>{nomeLocal(aberta.local_id)}</div></div>
            <div><span style={label}>Público-alvo</span><div style={{ fontSize: 13, color: C.text }}>{aberta.publico_alvo || '—'}</div></div>
          </div>
          {aberta.descricao && (
            <div>
              <span style={label}>Descrição</span>
              <div style={{ fontSize: 13, color: C.text, whiteSpace: 'pre-wrap' }}>{aberta.descricao}</div>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>
              <th style={thStyle}>Critério</th>
              <th style={thStyle}>Informado pelo proponente</th>
              <th style={thStyle}>Sua nota</th>
              <th style={thStyle}>Outras diretorias</th>
            </tr></thead>
            <tbody>
              {criterios.map((c, i) => (
                <tr key={c.chave}>
                  <td style={{ ...tdStyle, width: 190 }}>
                    <strong style={{ display: 'block', fontSize: 13 }}>{i + 1}. {c.titulo}</strong>
                    <span style={{ fontSize: 11.5, color: C.t3 }}>{c.descricao}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12.5, color: C.t2, maxWidth: 280 }}>{evidencia(c.chave, aberta)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setNotas((x) => ({ ...x, [c.chave]: n }))} style={{
                          width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, cursor: 'pointer', fontWeight: 700,
                          background: notas[c.chave] === n ? C.primary : 'transparent',
                          color: notas[c.chave] === n ? '#fff' : C.t2,
                        }}>{n}</button>
                      ))}
                    </div>
                    <input style={{ ...input, width: 180 }} placeholder="Fundamentação (opcional)"
                      value={coments[c.chave] || ''} onChange={(e) => setComents((x) => ({ ...x, [c.chave]: e.target.value }))} />
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12.5, minWidth: 170 }}>
                    {quorumCompleto ? (
                      <div style={{ display: 'grid', gap: 3 }}>
                        <strong style={{ color: C.primary }}>média {Number(aberta.medias?.[i] ?? 0).toFixed(2)}</strong>
                        {aberta.avaliacoes.filter((a) => a.diretoria !== minhaDiretoria).map((a) => (
                          <span key={a.id} style={{ color: C.t2 }}>
                            {a.diretoria}: {a['nota_' + c.chave]}{a.coment_criterios?.[c.chave] ? ` — ${a.coment_criterios[c.chave]}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: C.t3, fontStyle: 'italic' }}>notas e comentários ocultos</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Comentário geral (opcional)</span>
          <textarea style={{ ...input, minHeight: 60, marginTop: 4 }} value={geral} onChange={(e) => setGeral(e.target.value)} />
        </div>

        {quorumCompleto && Array.isArray(aberta.avaliacoes) && (
          <div style={{ display: 'grid', gap: 4 }}>
            {aberta.avaliacoes.filter((a) => a.comentario_geral).map((a) => (
              <div key={a.id} style={{ fontSize: 12.5, color: C.t2 }}>
                <Badge texto={a.diretoria} cor={C.blue} /> {a.comentario_geral}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.t2 }}>
            Sua soma: <strong style={{ color: C.text }}>{minhaSoma} / 35</strong>
            {quorumCompleto && aberta.soma != null && <> · soma das médias <strong style={{ color: C.primary }}>{Number(aberta.soma).toFixed(2)} / 35</strong></>}
            {!quorumCompleto && <> · a soma das médias aparece quando as quatro diretorias enviarem</>}
          </span>
          <button style={btn('primary')} disabled={salvando} onClick={enviar}>
            <ClipboardCheck size={14} /> {aberta.minha_avaliacao ? 'Atualizar pontuação' : 'Enviar pontuação'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3, maxWidth: 640 }}>
          Você não vê a nota das outras diretorias até que as quatro tenham enviado. A proposta só entra no ranking depois disso.
          {!ciclo?.avaliacao_aberta && ' · A janela de avaliação está fechada.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: C.t2 }}>Ordenar por</span>
          <select style={{ ...input, width: 'auto' }} value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}>
            {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </div>
      </div>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thStyle}>Proposta</th><th style={thStyle}>Área</th><th style={thStyle}>Quando</th>
              <th style={thStyle}>Quórum</th><th style={thStyle}>Minha diretoria</th><th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {carregando && <tr><td style={tdStyle} colSpan={6}>Carregando…</td></tr>}
              {!carregando && !propostas.length && <tr><td style={tdStyle} colSpan={6}>Nenhuma proposta para avaliar.</td></tr>}
              {propostasOrdenadas.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nome}</td>
                  <td style={tdStyle}>{rotuloArea(p.area, areas)}</td>
                  <td style={tdStyle}>{fmtQuando(p)}</td>
                  <td style={tdStyle}>{p.avaliacoes_recebidas}/{p.quorum}</td>
                  <td style={tdStyle}>
                    {p.minha_avaliacao_enviada
                      ? <Badge texto="enviada" cor={C.green} />
                      : <Badge texto="pendente" cor={C.amber} />}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {p.estado === 'enviada' && ciclo?.avaliacao_aberta && (
                      <button style={btn(p.minha_avaliacao_enviada ? 'ghost' : 'primary')} onClick={() => abrir(p)}>
                        {p.minha_avaliacao_enviada ? 'Revisar' : 'Pontuar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
