import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Send, Pencil, MessageSquareWarning } from 'lucide-react';
import { planejamentoAnual as api, users as usersApi } from '../../api';
import {
  C, cardStyle, btn, input, label, hint, Badge, EstadoBadge, fmtBRL, fmtData, fmtQuando,
  NATUREZAS, RECORRENCIAS, DIAS_SEMANA, thStyle, tdStyle,
} from './comum';

const FORM_VAZIO = {
  nome: '', natureza: 'evento', area: '', lider_id: '', mes_inicio: '', dia_inicio: '',
  multi_dia: false, mes_fim: '', dia_fim: '', recorrencia: 'unica', dia_semana: '',
  hora_inicio: '', hora_fim: '', local_id: '', publico_alvo: '', descricao: '',
  alcance_pct: '', publico_considerado: 'igreja_inteira', pertencimento: '',
  valores: [], visao_explique: '', impacto: '', custo: '', tem_arrecadacao: false, arrecadacao_prevista: '',
};

function paraCorpo(f, cicloId) {
  const dataInicio = f.dia_inicio || (f.mes_inicio ? `${f.mes_inicio}-01` : null);
  const dataFim = f.multi_dia ? (f.dia_fim || (f.mes_fim ? `${f.mes_fim}-01` : null)) : null;
  return {
    ciclo_id: cicloId,
    nome: f.nome, natureza: f.natureza, area: f.area, lider_id: f.lider_id || null,
    data_inicio: dataInicio,
    precisao_inicio: f.dia_inicio ? 'dia' : 'mes',
    multi_dia: f.multi_dia,
    data_fim: dataFim,
    precisao_fim: f.multi_dia ? (f.dia_fim ? 'dia' : 'mes') : null,
    recorrencia: f.recorrencia,
    dia_semana: f.dia_semana === '' ? null : Number(f.dia_semana),
    hora_inicio: f.hora_inicio || null, hora_fim: f.hora_fim || null,
    local_id: f.local_id || null, publico_alvo: f.publico_alvo || null, descricao: f.descricao || null,
    alcance_pct: f.alcance_pct === '' ? null : Number(f.alcance_pct),
    publico_considerado: f.publico_considerado,
    pertencimento: f.pertencimento || null,
    valores: f.valores,
    visao_explique: f.visao_explique || null, impacto: f.impacto || null,
    custo: Number(f.custo) || 0,
    tem_arrecadacao: f.tem_arrecadacao,
    arrecadacao_prevista: Number(f.arrecadacao_prevista) || 0,
  };
}

function deProposta(p) {
  return {
    ...FORM_VAZIO,
    nome: p.nome || '', natureza: p.natureza, area: p.area || '', lider_id: p.lider_id || '',
    mes_inicio: p.data_inicio ? String(p.data_inicio).slice(0, 7) : '',
    dia_inicio: p.precisao_inicio === 'dia' ? String(p.data_inicio).slice(0, 10) : '',
    multi_dia: Boolean(p.multi_dia),
    mes_fim: p.data_fim ? String(p.data_fim).slice(0, 7) : '',
    dia_fim: p.precisao_fim === 'dia' && p.data_fim ? String(p.data_fim).slice(0, 10) : '',
    recorrencia: p.recorrencia || 'unica',
    dia_semana: p.dia_semana == null ? '' : String(p.dia_semana),
    hora_inicio: p.hora_inicio ? String(p.hora_inicio).slice(0, 5) : '',
    hora_fim: p.hora_fim ? String(p.hora_fim).slice(0, 5) : '',
    local_id: p.local_id || '', publico_alvo: p.publico_alvo || '', descricao: p.descricao || '',
    alcance_pct: p.alcance_pct == null ? '' : String(p.alcance_pct),
    publico_considerado: p.publico_considerado || 'igreja_inteira',
    pertencimento: p.pertencimento || '',
    valores: Array.isArray(p.valores) ? p.valores : [],
    visao_explique: p.visao_explique || '', impacto: p.impacto || '',
    custo: String(p.custo ?? ''), tem_arrecadacao: Boolean(p.tem_arrecadacao),
    arrecadacao_prevista: String(p.arrecadacao_prevista ?? ''),
  };
}

function custeioDerivado(f) {
  const custo = Number(f.custo) || 0;
  const arrec = f.tem_arrecadacao ? Number(f.arrecadacao_prevista) || 0 : 0;
  const liquido = Math.max(custo - arrec, 0);
  const modelo = !f.tem_arrecadacao || arrec === 0
    ? 'Custeio integral pela igreja'
    : arrec < custo ? `Parcial: igreja ${fmtBRL(custo - arrec)}, arrecadação ${fmtBRL(arrec)}` : 'Autossustentado pela arrecadação';
  return { modelo, liquido };
}

export default function PropostasTab({ ciclo, constantes, locais, areas, recarregarCiclo }) {
  const [propostas, setPropostas] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);          // { id?, retificacao?, ...campos }
  const [salvando, setSalvando] = useState(false);
  const [devolutiva, setDevolutiva] = useState(null); // proposta projetada aberta

  const carregar = useCallback(async () => {
    if (!ciclo?.id) return;
    setCarregando(true);
    try {
      const lista = await api.ciclos.propostas(ciclo.id);
      setPropostas(Array.isArray(lista) ? lista : []);
    } catch { toast.error('Erro ao carregar as propostas'); } finally { setCarregando(false); }
  }, [ciclo?.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { usersApi.list().then((u) => setPessoas(Array.isArray(u) ? u : [])).catch(() => {}); }, []);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const valores = constantes?.valores || [];

  const salvar = async (enviarDepois) => {
    // O backend é a autoridade das obrigatoriedades (validarEnvio no service
    // puro). A única checagem que SÓ o formulário consegue fazer é campo em
    // branco × zero: o custo é persistido como numeric NOT NULL, então "vazio"
    // vira 0 e o servidor não distingue mais.
    if (enviarDepois && !form.retificacao && String(form.custo).trim() === '') {
      toast.error('Informe o custo total (use 0 se não houver custo).');
      return;
    }
    setSalvando(true);
    try {
      const corpo = paraCorpo(form, ciclo.id);
      let id = form.id;
      if (form.retificacao) {
        await api.propostas.retificar(id, corpo);
        toast.success('Proposta retificada · agora é com o Pastor');
      } else if (id) {
        await api.propostas.update(id, corpo);
      } else {
        const criada = await api.propostas.create(corpo);
        id = criada.id;
      }
      if (enviarDepois && !form.retificacao) {
        await api.propostas.enviar(id);
        toast.success('Proposta enviada para as diretorias');
      } else if (!form.retificacao) {
        toast.success('Rascunho salvo');
      }
      setForm(null);
      await carregar();
      recarregarCiclo?.();
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar');
    } finally { setSalvando(false); }
  };

  const abrirDevolutiva = async (p) => {
    try { setDevolutiva(await api.propostas.get(p.id)); }
    catch { toast.error('Erro ao abrir a proposta'); }
  };

  const submissaoFechada = !ciclo?.submissao_aberta;

  if (form) {
    const { modelo, liquido } = custeioDerivado(form);
    const marcado = (nome) => form.valores.some((v) => v.nome === nome);
    const alternarValor = (nome) => set('valores', marcado(nome)
      ? form.valores.filter((v) => v.nome !== nome)
      : [...form.valores, { nome, justificativa: '' }]);
    const setJust = (nome, texto) => set('valores', form.valores.map((v) => (v.nome === nome ? { ...v, justificativa: texto } : v)));

    return (
      <div style={{ ...cardStyle, padding: 20, display: 'grid', gap: 18 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: C.text }}>
            {form.retificacao ? 'Retificar proposta (rodada única · 5 dias)' : form.id ? 'Editar rascunho' : 'Nova proposta'}
          </h3>
          <p style={{ ...hint, marginTop: 4 }}>
            Duas seções. A primeira apresenta a proposta. A segunda reúne as informações que os quatro diretores usam para pontuar.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <strong style={{ fontSize: 13, color: C.primary }}>Seção 1 · Apresentação</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div><span style={label}>Nome da proposta *</span><input style={input} value={form.nome} onChange={(e) => set('nome', e.target.value)} /></div>
            <div>
              <span style={label}>Natureza *</span>
              <select style={input} value={form.natureza} onChange={(e) => set('natureza', e.target.value)}>
                {NATUREZAS.map((n) => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Área *</span>
              <select style={input} value={form.area} onChange={(e) => set('area', e.target.value)}>
                <option value="">Selecione…</option>
                {areas.map((a) => <option key={a.area} value={a.area}>{a.area}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Líder responsável *</span>
              <select style={input} value={form.lider_id} onChange={(e) => set('lider_id', e.target.value)}>
                <option value="">Selecione…</option>
                {pessoas.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
              <div style={hint}>Em regra o líder da área ou seu assistente.</div>
            </div>
            <div>
              <span style={label}>Mês de início *</span>
              <input style={input} type="month" value={form.mes_inicio} onChange={(e) => { set('mes_inicio', e.target.value); if (form.dia_inicio && !e.target.value) set('dia_inicio', ''); }} />
            </div>
            <div>
              <span style={label}>Dia de início (opcional)</span>
              <input style={input} type="date" value={form.dia_inicio} onChange={(e) => { set('dia_inicio', e.target.value); if (e.target.value) set('mes_inicio', e.target.value.slice(0, 7)); }} />
              <div style={hint}>Sem o dia, o conflito só aparece no mês.</div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.t2 }}>
            <input type="checkbox" checked={form.multi_dia} onChange={(e) => set('multi_dia', e.target.checked)} />
            Passa de um dia
          </label>
          {form.multi_dia && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div><span style={label}>Mês de encerramento</span><input style={input} type="month" value={form.mes_fim} onChange={(e) => set('mes_fim', e.target.value)} /></div>
              <div><span style={label}>Dia de encerramento (opcional)</span><input style={input} type="date" value={form.dia_fim} onChange={(e) => { set('dia_fim', e.target.value); if (e.target.value) set('mes_fim', e.target.value.slice(0, 7)); }} /></div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <span style={label}>Recorrência</span>
              <select style={input} value={form.recorrencia} onChange={(e) => set('recorrencia', e.target.value)}>
                {RECORRENCIAS.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Dia da semana</span>
              <select style={input} value={form.dia_semana} onChange={(e) => set('dia_semana', e.target.value)}>
                <option value="">—</option>
                {DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <div style={hint}>Necessário para conflito entre rotinas.</div>
            </div>
            <div><span style={label}>Horário de início</span><input style={input} type="time" value={form.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} /></div>
            <div><span style={label}>Horário de término</span><input style={input} type="time" value={form.hora_fim} onChange={(e) => set('hora_fim', e.target.value)} /></div>
            <div>
              <span style={label}>Local *</span>
              <select style={input} value={form.local_id} onChange={(e) => set('local_id', e.target.value)}>
                <option value="">Selecione…</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <div style={hint}>Lista controlada. Em texto livre o conflito de espaço não roda.</div>
            </div>
            <div><span style={label}>Público-alvo</span><input style={input} value={form.publico_alvo} onChange={(e) => set('publico_alvo', e.target.value)} /></div>
          </div>

          <div>
            <span style={label}>Descrição</span>
            <textarea style={{ ...input, minHeight: 70 }} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} />
            <div style={hint}>Campo de detalhamento. Não recebe nota.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <strong style={{ fontSize: 13, color: C.primary }}>Seção 2 · Informações para avaliação</strong>
            <div style={hint}>
              Você informa e os quatro diretores pontuam cada critério de 1 a 5.
              <strong> Todos os campos desta seção são obrigatórios para enviar</strong> — sem eles a proposta
              não tem como ser pontuada. O rascunho pode ser salvo incompleto.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <span style={label}>Alcance estimado (%) *</span>
              <input style={input} type="number" min="0" max="100" value={form.alcance_pct} onChange={(e) => set('alcance_pct', e.target.value)} />
            </div>
            <div>
              <span style={label}>Público considerado *</span>
              <select style={input} value={form.publico_considerado} onChange={(e) => set('publico_considerado', e.target.value)}>
                <option value="igreja_inteira">Igreja inteira</option>
                <option value="recorte_geracional">Recorte geracional</option>
              </select>
            </div>
          </div>
          <div><span style={label}>Pertencimento *</span><textarea style={{ ...input, minHeight: 60 }} value={form.pertencimento} onChange={(e) => set('pertencimento', e.target.value)} /></div>

          <div>
            <span style={label}>Transformação · valores da igreja * (marque ao menos um · justificativa obrigatória por valor marcado)</span>
            <div style={{ display: 'grid', gap: 8 }}>
              {valores.map((nome) => (
                <div key={nome} style={{ display: 'grid', gap: 5 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                    <input type="checkbox" checked={marcado(nome)} onChange={() => alternarValor(nome)} />
                    {nome}
                  </label>
                  {marcado(nome) && (
                    <input
                      style={{ ...input, marginLeft: 24, width: 'calc(100% - 24px)' }}
                      placeholder="Justificativa: prática concreta ligada a este valor"
                      value={form.valores.find((v) => v.nome === nome)?.justificativa || ''}
                      onChange={(e) => setJust(nome, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div><span style={label}>Visão CBRio * (5 anos, 5 igrejas, 50 mil vidas)</span><textarea style={{ ...input, minHeight: 60 }} value={form.visao_explique} onChange={(e) => set('visao_explique', e.target.value)} /></div>
          <div><span style={label}>Impacto *</span><textarea style={{ ...input, minHeight: 60 }} value={form.impacto} onChange={(e) => set('impacto', e.target.value)} /></div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><span style={label}>Custo total (R$) *</span><input style={input} type="number" min="0" step="0.01" value={form.custo} onChange={(e) => set('custo', e.target.value)} /></div>
            <div>
              <span style={label}>Haverá arrecadação?</span>
              <select style={input} value={form.tem_arrecadacao ? 'sim' : 'nao'} onChange={(e) => set('tem_arrecadacao', e.target.value === 'sim')}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>
            {form.tem_arrecadacao && (
              <div><span style={label}>Valor previsto (R$)</span><input style={input} type="number" min="0" step="0.01" value={form.arrecadacao_prevista} onChange={(e) => set('arrecadacao_prevista', e.target.value)} /></div>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.t2 }}>
            Os dois últimos critérios são pontuados a partir destes números. <br />
            <strong>Modelo de custeio:</strong> {modelo} · líquido para a igreja {fmtBRL(liquido)}
          </div>
        </div>

        {submissaoFechada && !form.retificacao && (
          <div style={{ padding: 10, borderRadius: 10, background: '#f59e0b18', color: C.amber, fontSize: 12.5 }}>
            A janela de submissão está fechada, então o envio está desabilitado. O Pastor a reabre em <strong>Ciclo e publicação</strong>.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {form.retificacao ? (
            <button style={btn('primary')} disabled={salvando} onClick={() => salvar(false)}><Send size={14} /> Enviar retificação</button>
          ) : (
            <>
              <button style={btn('primary')} disabled={salvando || submissaoFechada} onClick={() => salvar(true)}><Send size={14} /> Enviar proposta</button>
              <button style={btn('soft')} disabled={salvando || submissaoFechada} onClick={() => salvar(false)}>Salvar rascunho</button>
            </>
          )}
          <button style={btn('ghost')} disabled={salvando} onClick={() => setForm(null)}>Cancelar</button>
        </div>
      </div>
    );
  }

  const minhas = propostas.filter((p) => p.meu_papel === 'proponente' || ['rascunho'].includes(p.estado));
  const comDevolutiva = propostas.filter((p) => ['reprovada', 'aprovada_ressalvas'].includes(p.estado));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: C.t3 }}>
          {submissaoFechada
            ? 'A janela de submissão está fechada. O Pastor a reabre em Ciclo e publicação.'
            : 'Janela de submissão aberta · proponha eventos, projetos e rotinas do ciclo.'}
        </p>
        <button style={btn('primary')} onClick={() => setForm({ ...FORM_VAZIO })}><Plus size={14} /> Nova proposta</button>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={thStyle}>Proposta</th><th style={thStyle}>Natureza</th><th style={thStyle}>Área</th>
              <th style={thStyle}>Quando</th><th style={thStyle}>Custo</th><th style={thStyle}>Avaliações</th>
              <th style={thStyle}>Situação</th><th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {carregando && <tr><td style={tdStyle} colSpan={8}>Carregando…</td></tr>}
              {!carregando && !propostas.length && <tr><td style={tdStyle} colSpan={8}>Nenhuma proposta neste ciclo ainda.</td></tr>}
              {propostas.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nome}</td>
                  <td style={tdStyle}>{NATUREZAS.find((n) => n.valor === p.natureza)?.rotulo || p.natureza}</td>
                  <td style={tdStyle}>{p.area}</td>
                  <td style={tdStyle}>{fmtQuando(p)}</td>
                  <td style={tdStyle}>{fmtBRL(p.custo)}</td>
                  <td style={tdStyle}>{p.avaliacoes_recebidas}/{p.quorum}</td>
                  <td style={tdStyle}><EstadoBadge estado={p.estado_derivado || p.estado} /></td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {p.estado === 'rascunho' && p.meu_papel === 'proponente' && (
                      <button style={btn('ghost')} onClick={async () => {
                        const cheia = await api.propostas.get(p.id);
                        setForm({ ...deProposta(cheia), id: p.id });
                      }}><Pencil size={13} /> Editar</button>
                    )}
                    {['reprovada', 'aprovada_ressalvas', 'retificada', 'aprovada'].includes(p.estado) && p.meu_papel === 'proponente' && (
                      <button style={btn('soft')} onClick={() => abrirDevolutiva(p)}><MessageSquareWarning size={13} /> Devolutiva</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {devolutiva && (
        <div style={{ ...cardStyle, padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, color: C.text }}>O que voltou para mim · {devolutiva.nome}</h3>
            <button style={btn('ghost')} onClick={() => setDevolutiva(null)}>Fechar</button>
          </div>
          {devolutiva.exigencia && (
            <div style={{ padding: 12, borderRadius: 10, background: '#ef444414', display: 'grid', gap: 4 }}>
              <strong style={{ fontSize: 13, color: C.red }}>Exigência do Pastor</strong>
              <span style={{ fontSize: 13, color: C.text }}>{devolutiva.exigencia.texto}</span>
              <span style={hint}>Rodada {devolutiva.exigencia.rodada} de 1 · prazo {fmtData(devolutiva.exigencia.prazo)}</span>
              {devolutiva.estado === 'reprovada' && devolutiva.versao < 2 && (
                <button style={{ ...btn('danger'), width: 'fit-content' }} onClick={async () => {
                  const cheia = await api.propostas.get(devolutiva.id);
                  setDevolutiva(null);
                  setForm({ ...deProposta(cheia), id: devolutiva.id, retificacao: true });
                }}>Retificar proposta</button>
              )}
            </div>
          )}
          {devolutiva.ressalva && (
            <div style={{ padding: 12, borderRadius: 10, background: '#f59e0b14', display: 'grid', gap: 4 }}>
              <strong style={{ fontSize: 13, color: C.amber }}>Ressalva</strong>
              <span style={{ fontSize: 13, color: C.text }}>{devolutiva.ressalva.texto}</span>
              <span style={hint}>Prazo {fmtData(devolutiva.ressalva.prazo)} · {devolutiva.ressalva.verificada ? 'verificada' : 'aguardando verificação'}</span>
            </div>
          )}
          {Array.isArray(devolutiva.apontamentos) && devolutiva.apontamentos.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 13, color: C.text }}>Apontamentos do Pastor</strong>
              {devolutiva.apontamentos.map((a) => (
                <div key={a.id} style={{ fontSize: 13, color: C.t2 }}>
                  <Badge texto={a.campo} cor={C.blue} /> {a.texto}
                </div>
              ))}
            </div>
          )}
          {!devolutiva.exigencia && !devolutiva.ressalva && !(devolutiva.apontamentos || []).length && (
            <p style={{ margin: 0, fontSize: 13, color: C.t3 }}>Você não recebeu nenhuma devolutiva até agora.</p>
          )}
          <p style={{ ...hint, margin: 0 }}>
            Nenhum diretor vê exigência, ressalva ou apontamento. Apenas o proponente tem acesso a esses campos.
            A fundamentação que os diretores escrevem também não chega até aqui.
          </p>
        </div>
      )}
      {!devolutiva && comDevolutiva.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>
          {comDevolutiva.length} proposta(s) com devolutiva aguardando sua leitura — clique em "Devolutiva" na linha.
        </p>
      )}
      {minhas.length === 0 && !carregando && (
        <p style={{ margin: 0, fontSize: 12, color: C.t3 }}>Você ainda não propôs nada neste ciclo.</p>
      )}
    </div>
  );
}
