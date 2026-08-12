import { describe, it, expect } from 'vitest';
// @ts-expect-error módulo JS do backend sem tipos (padrão volCheckinResolver)
import {
  SUPOSICOES,
  CRITERIOS,
  somarDias,
  horariosSobrepoem,
  liquido,
  modeloCusteio,
  mesesOcupados,
  rateioMensal,
  decisaoVigente,
  noCalendario,
  estadoDerivado,
  podeTransicionar,
  validarEnvio,
  validarAvaliacao,
  validarRetificacao,
  diffRetificacao,
  montarRanking,
  detectarConflitos,
  aplicarAceites,
  validarTravas,
  caixaLivreMensal,
  orcamentoDoPastor,
  projetarProposta,
} from '../../backend/services/planejamentoAnualRegras.js';

// ── Fixtures ─────────────────────────────────────────────────────────────
const DIRETORIAS = ['ministerial', 'operacoes', 'financeiro', 'criativo'];
const QUORUM = 4;
const CHAVES = CRITERIOS.map((c: any) => c.chave);

let seq = 0;
function prop(o: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `p-${String(seq).padStart(3, '0')}`,
    ciclo_id: 'c1',
    nome: `Proposta ${seq}`,
    natureza: 'evento',
    area: 'kids',
    lider_id: 'u-lider',
    data_inicio: '2027-03-10',
    precisao_inicio: 'dia',
    multi_dia: false,
    data_fim: null,
    precisao_fim: null,
    recorrencia: 'unica',
    dia_semana: null,
    hora_inicio: null,
    hora_fim: null,
    local_id: 'templo',
    descricao: '',
    alcance_pct: 50,
    publico_considerado: 'igreja_inteira',
    valores: [],
    custo: 1000,
    tem_arrecadacao: false,
    arrecadacao_prevista: 0,
    estado: 'enviada',
    versao: 1,
    versao_anterior: null,
    deleted_at: null,
    ...o,
  };
}

let aseq = 0;
function aval(diretoria: string, notas: number | number[], extra: Record<string, unknown> = {}) {
  aseq += 1;
  const ns = Array.isArray(notas) ? notas : new Array(7).fill(notas);
  const o: Record<string, unknown> = {
    id: `a-${aseq}`, diretoria, avaliador_id: `u-${diretoria}`,
    coment_criterios: {}, comentario_geral: null, deleted_at: null, ...extra,
  };
  CHAVES.forEach((c: string, i: number) => { o['nota_' + c] = ns[i]; });
  return o;
}

function quatroAvaliacoes(notas: number | number[] = 4) {
  return DIRETORIAS.map((d) => aval(d, notas));
}

let dseq = 0;
function decisao(o: Record<string, unknown> = {}) {
  dseq += 1;
  return {
    id: `d-${dseq}`, rodada: 1, decisao: 'aprovada',
    ressalva_texto: null, ressalva_prazo: null, ressalva_cumprida_em: null,
    exigencia_texto: null, exigencia_prazo: null,
    revogada_em: null, decidido_por: 'u-pastor', ...o,
  };
}

const LOCAIS: Record<string, unknown> = {
  templo: { id: 'templo', nome: 'Templo', gera_conflito: true },
  sala1: { id: 'sala1', nome: 'Sala 1', gera_conflito: true },
  fora: { id: 'fora', nome: 'Fora da igreja', gera_conflito: false },
};

// ── Teste de aceitação 1 · notas cegas até o quórum (na projeção) ───────
describe('cegueira até o quórum (teste 1 e 9 do spec)', () => {
  const p = prop();
  const tres = DIRETORIAS.slice(0, 3).map((d) => aval(d, 4));
  const quatro = quatroAvaliacoes(4);

  it('avaliador com 3/4 NÃO vê notas alheias nem médias · vê a própria + contagem', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes: tres, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
    expect(proj.soma).toBeNull();
    expect(proj.minha_avaliacao).toBeTruthy();
    expect(proj.minha_avaliacao.diretoria).toBe('ministerial');
    expect(proj.avaliacoes_recebidas).toBe(3);
  });

  it('com 4/4 as notas e médias aparecem', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes: quatro, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(proj.avaliacoes).toHaveLength(4);
    expect(proj.medias).toHaveLength(7);
    expect(proj.soma).toBeCloseTo(28, 5); // 7 critérios × média 4
  });

  it('o Pastor também fica cego antes do quórum (sem exceção no spec)', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes: tres, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'pastor' });
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
  });

  it('avaliação soft-deletada (reaberta pros diretores) não conta pro quórum', () => {
    const comDeletada = [...tres, aval('criativo', 5, { deleted_at: '2027-01-01T00:00:00Z' })];
    const proj = projetarProposta({ proposta: p, avaliacoes: comDeletada, decisoes: [], apontamentos: [], quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'ministerial' });
    expect(proj.avaliacoes_recebidas).toBe(3);
    expect(proj.avaliacoes).toBeNull();
  });
});

// ── Teste 2 · sem quórum: fora do ranking e fora do orçamento ────────────
describe('proposta sem quórum (teste 2 do spec)', () => {
  it('não aparece no ranking e o painel diz quem falta', () => {
    const completa = prop({ nome: 'Completa' });
    const incompleta = prop({ nome: 'Incompleta' });
    const r = montarRanking({
      propostas: [completa, incompleta],
      avaliacoesPorProposta: {
        [completa.id]: quatroAvaliacoes(3),
        [incompleta.id]: [aval('ministerial', 5), aval('criativo', 5)],
      },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas).toHaveLength(1);
    expect(r.ranqueadas[0].proposta.nome).toBe('Completa');
    expect(r.foraDoRanking).toHaveLength(1);
    expect(r.foraDoRanking[0].faltam.sort()).toEqual(['financeiro', 'operacoes']);
  });

  it('não conta como pendente no orçamento do Pastor', () => {
    const semQuorum = prop({ custo: 999 });
    const orc = orcamentoDoPastor({
      propostas: [semQuorum],
      avaliacoesPorProposta: { [semQuorum.id]: [aval('ministerial', 4)] },
      decisoesPorProposta: {},
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(1000),
    });
    expect(orc.propostos.every((v: number) => v === 0)).toBe(true);
    expect(orc.pendentes).toHaveLength(0);
  });
});

// ── Teste 3 · desempate em cascata ───────────────────────────────────────
describe('ranking e desempate (teste 3 do spec)', () => {
  it('soma igual → decide o primeiro critério divergente na ordem do formulário', () => {
    // A: relevancia 5, pertencimento 3 · B: relevancia 4, pertencimento 4 (somas iguais)
    const a = prop({ nome: 'Alfa' });
    const b = prop({ nome: 'Beta' });
    const notasA = [5, 3, 4, 4, 4, 4, 4];
    const notasB = [4, 4, 4, 4, 4, 4, 4];
    const r = montarRanking({
      propostas: [b, a],
      avaliacoesPorProposta: {
        [a.id]: DIRETORIAS.map((d) => aval(d, notasA)),
        [b.id]: DIRETORIAS.map((d) => aval(d, notasB)),
      },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas[0].proposta.nome).toBe('Alfa'); // relevância maior vence
    expect(r.ranqueadas[0].soma).toBeCloseTo(r.ranqueadas[1].soma, 9);
  });

  it('empate total → ordem alfabética pt-BR (acento não joga pro fim)', () => {
    const zebra = prop({ nome: 'Zebra' });
    const agape = prop({ nome: 'Ágape' });
    const r = montarRanking({
      propostas: [zebra, agape],
      avaliacoesPorProposta: {
        [zebra.id]: quatroAvaliacoes(4),
        [agape.id]: quatroAvaliacoes(4),
      },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas.map((x: any) => x.proposta.nome)).toEqual(['Ágape', 'Zebra']);
  });

  it('proposta retificada fica fora do painel de ranking (fila do Pastor)', () => {
    const ret = prop({ estado: 'retificada' });
    const r = montarRanking({
      propostas: [ret],
      avaliacoesPorProposta: { [ret.id]: quatroAvaliacoes(4) },
      quorum: QUORUM,
      diretorias: DIRETORIAS,
    });
    expect(r.ranqueadas).toHaveLength(0);
    expect(r.foraDoRanking).toHaveLength(0);
  });
});

// ── Teste 4 · ressalva não verificada segura o calendário e o custo ─────
describe('aprovada com ressalvas (teste 4 do spec)', () => {
  const p = prop({ estado: 'aprovada_ressalvas', custo: 600, data_inicio: '2027-05-01', precisao_inicio: 'mes' });
  const naoVerificada = [decisao({ decisao: 'aprovada_ressalvas', ressalva_texto: 'Reduzir custo' })];
  const verificada = [decisao({ decisao: 'aprovada_ressalvas', ressalva_texto: 'Reduzir custo', ressalva_cumprida_em: '2027-01-10T12:00:00Z' })];

  it('não verificada: fora do calendário, fora do custo comprometido e trava ativa', () => {
    expect(noCalendario(p, naoVerificada)).toBe(false);
    const orc = orcamentoDoPastor({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: naoVerificada },
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orc.comprometido[4]).toBe(0); // maio
    const travas = validarTravas({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: naoVerificada },
      quorum: QUORUM,
      locaisById: LOCAIS,
      aceites: [],
    });
    expect(travas.bloqueada).toBe(true);
    expect(travas.motivos).toContain('1 ressalva(s) não verificada(s)');
  });

  it('verificada: entra no calendário E no custo comprometido', () => {
    expect(noCalendario(p, verificada)).toBe(true);
    const orc = orcamentoDoPastor({
      propostas: [p],
      avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [p.id]: verificada },
      quorum: QUORUM,
      caixaLivre: new Array(12).fill(0),
    });
    expect(orc.comprometido[4]).toBe(600);
  });
});

// ── Testes 5 e 6 · conflitos de agenda × espaço ──────────────────────────
describe('conflitos (testes 5 e 6 do spec)', () => {
  it('agenda NÃO dispara entre naturezas diferentes; espaço SIM (mesmo local + horário)', () => {
    const evento = prop({ natureza: 'evento', data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: '22:00', local_id: 'templo' });
    const projeto = prop({ natureza: 'projeto', data_inicio: '2027-06-12', hora_inicio: '20:00', hora_fim: '23:00', local_id: 'templo' });
    const conflitos = detectarConflitos([evento, projeto], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo)).toEqual(['espaco']);
    expect(conflitos[0].firme).toBe(true); // ambos com precisão de dia
  });

  it('mesma data e local mas SEM horário → nenhum conflito de espaço (bug do protótipo corrigido)', () => {
    const a = prop({ data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: null, local_id: 'templo' });
    const b = prop({ data_inicio: '2027-06-12', hora_inicio: '19:30', hora_fim: '21:00', local_id: 'templo', natureza: 'projeto' });
    expect(detectarConflitos([a, b], LOCAIS)).toHaveLength(0);
  });

  it("'Fora da igreja' nunca gera conflito de espaço", () => {
    const a = prop({ natureza: 'evento', data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: '22:00', local_id: 'fora' });
    const b = prop({ natureza: 'projeto', data_inicio: '2027-06-12', hora_inicio: '19:00', hora_fim: '22:00', local_id: 'fora' });
    expect(detectarConflitos([a, b], LOCAIS)).toHaveLength(0);
  });

  it('precisão mensal → concentração (não firme), que NÃO bloqueia publicação', () => {
    const a = prop({ natureza: 'evento', data_inicio: '2027-06-01', precisao_inicio: 'mes' });
    const b = prop({ natureza: 'evento', data_inicio: '2027-06-15', precisao_inicio: 'dia' });
    const conflitos = detectarConflitos([a, b], LOCAIS);
    expect(conflitos).toHaveLength(1); // agenda · coincidência assumida no mês
    expect(conflitos[0].firme).toBe(false);
  });

  it('duas rotinas: mesmo local + dia da semana + horário sobreposto → espaço E agenda; aceitar um remove só ele', () => {
    const r1 = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-02-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-11-30', precisao_fim: 'mes', hora_inicio: '19:30', hora_fim: '21:00', local_id: 'sala1', estado: 'aprovada' });
    const r2 = prop({ natureza: 'rotina', dia_semana: 3, recorrencia: 'semanal', data_inicio: '2027-03-01', precisao_inicio: 'mes', multi_dia: true, data_fim: '2027-12-01', precisao_fim: 'mes', hora_inicio: '20:00', hora_fim: '21:30', local_id: 'sala1', estado: 'aprovada' });
    const conflitos = detectarConflitos([r1, r2], LOCAIS);
    expect(conflitos.map((c: any) => c.tipo).sort()).toEqual(['agenda', 'espaco']);
    expect(conflitos.every((c: any) => c.firme)).toBe(true);

    const [pa, pb] = [r1.id, r2.id].sort();
    const aceites = [{ proposta_a: pa, proposta_b: pb, tipo: 'agenda', justificativa: 'Coincidência desejada' }];
    const marcados = aplicarAceites(conflitos, aceites);
    expect(marcados.find((c: any) => c.tipo === 'agenda').aceite).toBeTruthy();
    expect(marcados.find((c: any) => c.tipo === 'espaco').aceite).toBeNull();

    const travas = validarTravas({
      propostas: [r1, r2],
      avaliacoesPorProposta: { [r1.id]: quatroAvaliacoes(4), [r2.id]: quatroAvaliacoes(4) },
      decisoesPorProposta: { [r1.id]: [decisao()], [r2.id]: [decisao()] },
      quorum: QUORUM,
      locaisById: LOCAIS,
      aceites,
    });
    expect(travas.motivos).toContain('1 conflito(s) confirmado(s) e não aceito(s) no calendário');
  });
});

// ── Teste 7 · as 5 travas de publicação, cada uma isolada ────────────────
describe('travas de publicação (teste 7 do spec)', () => {
  const base = () => ({
    avaliacoesPorProposta: {} as Record<string, unknown[]>,
    decisoesPorProposta: {} as Record<string, unknown[]>,
    quorum: QUORUM,
    locaisById: LOCAIS,
    aceites: [] as unknown[],
  });

  it('trava 1 · proposta sem quórum', () => {
    const p = prop();
    const t = validarTravas({ ...base(), propostas: [p], avaliacoesPorProposta: { [p.id]: [aval('criativo', 4)] } });
    expect(t.bloqueada).toBe(true);
    expect(t.motivos).toEqual(['1 proposta(s) sem quórum de avaliação']);
  });

  it('trava 2 · proposta sem decisão', () => {
    const p = prop();
    const t = validarTravas({ ...base(), propostas: [p], avaliacoesPorProposta: { [p.id]: quatroAvaliacoes(4) } });
    expect(t.motivos).toEqual(['1 proposta(s) sem decisão']);
  });

  it('trava 3 · retificação em andamento (reprovada aguardando OU retificada aguardando o Pastor)', () => {
    const rep = prop({ estado: 'reprovada' });
    const ret = prop({ estado: 'retificada' });
    const t = validarTravas({ ...base(), propostas: [rep, ret] });
    expect(t.motivos).toEqual(['2 retificação(ões) em andamento']);
  });

  it('trava 4 · ressalva não verificada', () => {
    const p = prop({ estado: 'aprovada_ressalvas' });
    const t = validarTravas({
      ...base(),
      propostas: [p],
      decisoesPorProposta: { [p.id]: [decisao({ decisao: 'aprovada_ressalvas', ressalva_texto: 'x' })] },
    });
    expect(t.motivos).toEqual(['1 ressalva(s) não verificada(s)']);
  });

  it('trava 5 · conflito firme não aceito', () => {
    const a = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-12' });
    const b = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-12' });
    const t = validarTravas({
      ...base(),
      propostas: [a, b],
      decisoesPorProposta: { [a.id]: [decisao()], [b.id]: [decisao()] },
    });
    expect(t.motivos).toEqual(['1 conflito(s) confirmado(s) e não aceito(s) no calendário']);
  });

  it('nenhuma trava → publicação liberada (concentração mensal não bloqueia)', () => {
    const a = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-01', precisao_inicio: 'mes' });
    const b = prop({ estado: 'aprovada', natureza: 'evento', data_inicio: '2027-06-15', precisao_inicio: 'dia' });
    const t = validarTravas({
      ...base(),
      propostas: [a, b],
      decisoesPorProposta: { [a.id]: [decisao()], [b.id]: [decisao()] },
    });
    expect(t.bloqueada).toBe(false);
    expect(t.motivos).toEqual([]);
  });
});

// ── Teste 8 · retificação ────────────────────────────────────────────────
describe('retificação (teste 8 do spec)', () => {
  it('diff campo a campo entre versão anterior e atual', () => {
    const anterior = { data_inicio: '2027-07-10', precisao_inicio: 'dia', data_fim: '2027-07-12', precisao_fim: 'dia', custo: 96000, arrecadacao_prevista: 52000, local_id: 'fora', descricao: 'Acampamento' };
    const atual = prop({ data_inicio: '2027-07-17', precisao_inicio: 'dia', data_fim: '2027-07-19', precisao_fim: 'dia', custo: 78000, arrecadacao_prevista: 52000, local_id: 'fora', descricao: 'Acampamento', versao: 2, versao_anterior: anterior });
    const diff = diffRetificacao(anterior, atual);
    expect(diff.map((d: any) => d.campo).sort()).toEqual(['custo', 'data_fim', 'data_inicio']);
    expect(diff.find((d: any) => d.campo === 'custo')).toEqual({ campo: 'custo', antes: 96000, depois: 78000 });
  });

  it('segunda rodada de retificação é impossível (versão 2 já usada)', () => {
    const p = prop({ estado: 'reprovada', versao: 2 });
    expect(validarRetificacao(p, '2027-01-10')).toContain('A rodada única de retificação já foi usada.');
  });

  it('retificação dentro do prazo em proposta reprovada versão 1 passa', () => {
    const p = prop({ estado: 'reprovada', versao: 1, retificacao_prazo: '2027-01-15' });
    expect(validarRetificacao(p, '2027-01-14')).toEqual([]);
  });

  it('prazo expirado bloqueia', () => {
    const p = prop({ estado: 'reprovada', versao: 1, retificacao_prazo: '2027-01-15' });
    expect(validarRetificacao(p, '2027-01-16')).toContain('O prazo de retificação expirou.');
  });

  it('reabrir pros diretores é transição legal a partir de retificada (apaga notas = soft-delete nas rotas)', () => {
    expect(podeTransicionar('retificada', 'enviada')).toBe(true);
    expect(podeTransicionar('arquivada', 'enviada')).toBe(false);
  });
});

// ── Teste 9 · visibilidade por papel ─────────────────────────────────────
describe('visibilidade por papel (teste 9 do spec)', () => {
  const p = prop({ estado: 'reprovada' });
  const decisoes = [decisao({ decisao: 'reprovada', exigencia_texto: 'Refazer o orçamento', exigencia_prazo: '2027-02-01' })];
  const apontamentos = [{ id: 'ap1', campo: 'custo', texto: 'Separar alimentação de estrutura', deleted_at: null }];
  const avaliacoes = quatroAvaliacoes([4, 4, 4, 4, 4, 2, 3]);

  it('proponente vê exigência e apontamentos · NUNCA notas nem fundamentação', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'proponente' });
    expect(proj.exigencia?.texto).toBe('Refazer o orçamento');
    expect(proj.apontamentos).toHaveLength(1);
    expect(proj.avaliacoes).toBeNull();
    expect(proj.medias).toBeNull();
  });

  it('avaliador NÃO vê exigência/ressalva/apontamentos (só do proponente e do Pastor)', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'avaliador', minhaDiretoria: 'criativo' });
    expect(proj.exigencia).toBeNull();
    expect(proj.ressalva).toBeNull();
    expect(proj.apontamentos).toBeNull();
    expect(proj.avaliacoes).toHaveLength(4); // pós-quórum, fundamentação circula entre diretores
  });

  it('pastor vê tudo (é o autor das devolutivas)', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'pastor' });
    expect(proj.exigencia?.texto).toBe('Refazer o orçamento');
    expect(proj.apontamentos).toHaveLength(1);
    expect(proj.avaliacoes).toHaveLength(4);
  });

  it('observador não recebe devolutivas nem notas', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos, quorum: QUORUM, papel: 'observador' });
    expect(proj.exigencia).toBeNull();
    expect(proj.apontamentos).toBeNull();
    expect(proj.avaliacoes).toBeNull();
  });

  it('apontamento removido pelo Pastor (soft-delete) some da devolutiva', () => {
    const proj = projetarProposta({ proposta: p, avaliacoes, decisoes, apontamentos: [{ ...apontamentos[0], deleted_at: '2027-01-01T00:00:00Z' }], quorum: QUORUM, papel: 'proponente' });
    expect(proj.apontamentos).toHaveLength(0);
  });
});

// ── Teste 10 · caixa livre e rateio exato ────────────────────────────────
describe('orçamento derivado (teste 10 do spec)', () => {
  it('caixa livre = (dízimos + outras) − (folha + operacionais + provisões), mês a mês', () => {
    const valores = [
      { linha: 'dizimos_ofertas', mes: 1, valor: 345000 },
      { linha: 'outras_receitas', mes: 1, valor: 20000 },
      { linha: 'folha', mes: 1, valor: 95000 },
      { linha: 'despesas_operacionais', mes: 1, valor: 55000 },
      { linha: 'provisoes', mes: 1, valor: 15000 },
      { linha: 'dizimos_ofertas', mes: 12, valor: 360000 },
      { linha: 'folha', mes: 12, valor: 190000 },
    ];
    const caixa = caixaLivreMensal(valores);
    expect(caixa[0]).toBe(200000);
    expect(caixa[11]).toBe(170000);
    expect(caixa[5]).toBe(0);
  });

  it('rateio uniforme soma EXATAMENTE o líquido (dízima periódica não vaza centavo)', () => {
    const p = prop({ custo: 1000, multi_dia: true, data_inicio: '2027-03-01', precisao_inicio: 'mes', data_fim: '2027-05-31', precisao_fim: 'mes' });
    const rateio = rateioMensal(p);
    expect(rateio[2] + rateio[3] + rateio[4]).toBeCloseTo(1000, 10);
    expect(rateio.reduce((s: number, v: number) => s + v, 0)).toBeCloseTo(1000, 10);
    expect(rateio[0]).toBe(0);
  });

  it('líquido desconta arrecadação; custeio derivado classifica certo', () => {
    const parcial = prop({ custo: 1000, tem_arrecadacao: true, arrecadacao_prevista: 400 });
    expect(liquido(parcial)).toBe(600);
    expect(modeloCusteio(parcial).tipo).toBe('parcial');
    expect(modeloCusteio(prop({ custo: 500, tem_arrecadacao: false })).tipo).toBe('integral');
    expect(modeloCusteio(prop({ custo: 500, tem_arrecadacao: true, arrecadacao_prevista: 500 })).tipo).toBe('autossustentado');
    expect(modeloCusteio(prop({ custo: 500, tem_arrecadacao: true, arrecadacao_prevista: 900 })).tipo).toBe('autossustentado');
  });

  it('dado inconsistente (fim antes do início) degrada pra zero · sem NaN (bug do protótipo)', () => {
    const p = prop({ multi_dia: true, data_inicio: '2027-11-01', data_fim: '2027-03-01' });
    expect(mesesOcupados(p)).toEqual([]);
    expect(rateioMensal(p).every((v: number) => v === 0)).toBe(true);
  });
});

// ── Teste 11 · janela de submissão fechada rejeita no backend ────────────
describe('janela de submissão (teste 11 do spec)', () => {
  it('envio com janela fechada é rejeitado na regra (não só na tela)', () => {
    const erros = validarEnvio(prop(), { submissao_aberta: false });
    expect(erros.join(' ')).toContain('janela de submissão está fechada');
  });

  it('janela aberta + proposta completa passa; valor marcado sem justificativa reprova', () => {
    const ok = prop({ valores: [{ nome: 'Servir em comunidade', justificativa: 'Escala de voluntários da comunidade.' }] });
    expect(validarEnvio(ok, { submissao_aberta: true })).toEqual([]);
    const semJust = prop({ valores: [{ nome: 'Servir em comunidade', justificativa: '' }] });
    expect(validarEnvio(semJust, { submissao_aberta: true }).join(' ')).toContain('Justificativa é obrigatória');
  });

  it('as 7 notas são obrigatórias, inteiras, de 1 a 5', () => {
    const completas: Record<string, number> = {};
    CHAVES.forEach((c: string) => { completas['nota_' + c] = 3; });
    expect(validarAvaliacao(completas)).toEqual([]);
    expect(validarAvaliacao({ ...completas, nota_custo: 6 }).join(' ')).toContain('Custo');
    const { nota_visao, ...faltando } = completas;
    expect(validarAvaliacao(faltando).join(' ')).toContain('Visão CBRio');
  });
});

// ── Teste 12 · prazos (aritmética pura de calendário) ────────────────────
describe('prazos de 5 dias (teste 12 do spec)', () => {
  it('soma dias corridos atravessando mês e ano sem shift de fuso', () => {
    expect(somarDias('2026-08-12', 5)).toBe('2026-08-17');
    expect(somarDias('2026-08-29', 5)).toBe('2026-09-03');
    expect(somarDias('2026-12-30', 5)).toBe('2027-01-04');
    expect(somarDias('2028-02-27', 5)).toBe('2028-03-03'); // bissexto
  });
});

// ── Estados e decisões (fundações) ───────────────────────────────────────
describe('estados derivados e decisão vigente', () => {
  it('enviada deriva em_avaliacao/ranqueada pela contagem × quórum', () => {
    const p = prop();
    expect(estadoDerivado(p, 2, QUORUM)).toBe('em_avaliacao');
    expect(estadoDerivado(p, 4, QUORUM)).toBe('ranqueada');
    expect(estadoDerivado(prop({ estado: 'aprovada' }), 4, QUORUM)).toBe('aprovada');
  });

  it('decisão vigente = maior rodada não-revogada', () => {
    const d1 = decisao({ rodada: 1, decisao: 'reprovada', exigencia_texto: 'x' });
    const d2 = decisao({ rodada: 2, decisao: 'aprovada' });
    expect(decisaoVigente([d1, d2]).rodada).toBe(2);
    expect(decisaoVigente([d1, { ...d2, revogada_em: '2027-01-01T00:00:00Z' }]).rodada).toBe(1);
    expect(decisaoVigente([])).toBeNull();
  });

  it('horários sem os 4 campos nunca sobrepõem (proteção contra o bug do protótipo)', () => {
    expect(horariosSobrepoem({ hora_inicio: '19:00', hora_fim: null }, { hora_inicio: '19:30', hora_fim: '21:00' })).toBe(false);
    expect(horariosSobrepoem({ hora_inicio: '19:00', hora_fim: '20:00' }, { hora_inicio: '20:00', hora_fim: '21:00' })).toBe(false); // encosta, não sobrepõe
    expect(horariosSobrepoem({ hora_inicio: '19:00', hora_fim: '20:30' }, { hora_inicio: '20:00', hora_fim: '21:00' })).toBe(true);
  });
});
