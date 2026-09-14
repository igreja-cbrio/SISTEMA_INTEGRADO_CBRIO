// O material do relatório do censo — o que o modelo recebe e o que ele não
// consegue inventar.
//
// ⚠️⚠️ O que este arquivo protege, em ordem de dano:
//   1. ⚠️⚠️ recomendação sem âncora numérica passar. Sem a guarda, o modelo
//      devolve conselho genérico de igreja ("façam uma série sobre família")
//      que soa plausível, parece ter vindo do censo e não veio de lugar
//      nenhum — e vira decisão de liderança;
//   2. ⚠️⚠️ célula pequena virar corte. "n=7" no corpo de um relatório vira
//      número citado; o piso é 25;
//   3. ⚠️⚠️ o cruzamento do Next perder o CONTROLE por tempo de casa. Sem ele,
//      o efeito medido é só "quem está há mais tempo já fez mais coisas";
//   4. a faixa de tempo sair em ordem alfabética — "De 1 a 3 anos" antes de
//      "Menos de 6 meses" conta a jornada ao contrário;
//   5. a lista de cruzamentos virar varredura. Com 34 perguntas, testar tudo
//      garante achar coincidência bem formatada.
import { describe, it, expect } from 'vitest';
import {
  MINIMO_POR_CELULA, CRUZAMENTOS, ORDEM_TEMPO,
  montarPerfil, montarCruzamentos, citaNumeroReal, numerosDisponiveis, filtrarRecomendacoes,
} from '../../backend/utils/censoRelatorioDados.js';

const TEMPO = 'Há quanto tempo frequenta?';
const GRUPO = 'Você participa de um Grupo?';
const SERVE = 'Você serve na CBRio?';
const NEXT = 'Você já fez o Next?';

/** Gera n pessoas iguais. */
const gente = (n: number, p: Record<string, string>) => Array.from({ length: n }, () => ({ ...p }));

describe('perfil · contagem e percentual', () => {
  const agregado = [
    { pergunta_texto: 'Estado civil', tipo: 'opcao_unica', valor: 'Casado(a)', total: 463 },
    { pergunta_texto: 'Estado civil', tipo: 'opcao_unica', valor: 'Solteiro(a)', total: 179 },
  ];

  it('calcula a base e o % de cada opção', () => {
    const p = montarPerfil(agregado as never);
    expect(p[0].base).toBe(642);
    expect(p[0].opcoes[0]).toEqual({ valor: 'Casado(a)', n: 463, pct: 72.1 });
  });

  it('ordena da opção mais frequente para a menos', () => {
    const p = montarPerfil([...agregado].reverse() as never);
    expect(p[0].opcoes.map((o) => o.valor)).toEqual(['Casado(a)', 'Solteiro(a)']);
  });

  it('entrada vazia ou nula não quebra', () => {
    for (const v of [null, undefined, []]) expect(montarPerfil(v as never)).toEqual([]);
  });
});

describe('⚠️⚠️ célula pequena não vira corte', () => {
  it(`descarta grupo abaixo de ${MINIMO_POR_CELULA}`, () => {
    const pessoas = [
      ...gente(40, { [TEMPO]: 'De 1 a 3 anos', [GRUPO]: 'Sim', [SERVE]: 'Sim', [NEXT]: 'Sim' }),
      ...gente(7, { [TEMPO]: 'Mais de 5 anos', [GRUPO]: 'Sim', [SERVE]: 'Sim', [NEXT]: 'Sim' }),
    ];
    const c = montarCruzamentos(pessoas).find((x) => x.id === 'engajamento_por_tempo')!;
    expect(c.faixas.map((f) => f.valor)).toEqual(['De 1 a 3 anos']);
  });

  it('o piso é declarado e não é 1', () => {
    expect(MINIMO_POR_CELULA).toBeGreaterThanOrEqual(20);
  });
});

describe('⚠️ a jornada sai na ordem certa, não alfabética', () => {
  it('faixas de tempo em ordem de jornada', () => {
    const pessoas = ORDEM_TEMPO.flatMap((t) => gente(30, { [TEMPO]: t, [GRUPO]: 'Sim' }));
    const c = montarCruzamentos(pessoas).find((x) => x.id === 'engajamento_por_tempo')!;
    expect(c.faixas.map((f) => f.valor)).toEqual([...ORDEM_TEMPO]);
    // Alfabético começaria por "De 1 a 3 anos".
    expect(c.faixas[0].valor).toBe('Menos de 6 meses');
  });
});

describe('⚠️⚠️ o cruzamento do Next é CONTROLADO por tempo de casa', () => {
  it('declara o controle', () => {
    const c = CRUZAMENTOS.find((x) => x.id === 'engajamento_por_next')!;
    expect(c.controle).toBe(TEMPO);
  });

  it('separa as faixas dentro de cada tempo — não mistura', () => {
    // Números reais medidos em 13/09/2026 (faixa 1–3 anos).
    const pessoas = [
      ...gente(77, { [TEMPO]: 'De 1 a 3 anos', [NEXT]: 'Sim', [GRUPO]: 'Sim', [SERVE]: 'Sim' }),
      ...gente(33, { [TEMPO]: 'De 1 a 3 anos', [NEXT]: 'Sim', [GRUPO]: 'Não', [SERVE]: 'Não' }),
      ...gente(37, { [TEMPO]: 'De 1 a 3 anos', [NEXT]: 'Não', [GRUPO]: 'Sim', [SERVE]: 'Não' }),
      ...gente(109, { [TEMPO]: 'De 1 a 3 anos', [NEXT]: 'Não', [GRUPO]: 'Não', [SERVE]: 'Não' }),
    ];
    const c = montarCruzamentos(pessoas).find((x) => x.id === 'engajamento_por_next')!;
    const sim = c.faixas.find((f) => f.valor === 'Sim')!;
    const nao = c.faixas.find((f) => f.valor === 'Não')!;
    expect(sim.controle).toBe('De 1 a 3 anos');
    expect(sim.metricas[GRUPO].pct_sim).toBe(70);
    expect(nao.metricas[GRUPO].pct_sim).toBe(25.3);
    // O achado: quem fez o Next participa ~2,8× mais de grupo, no MESMO tempo.
    expect(sim.metricas[GRUPO].pct_sim).toBeGreaterThan(nao.metricas[GRUPO].pct_sim * 2);
  });
});

describe('⚠️ a lista de cruzamentos é fechada e justificada', () => {
  it('todo cruzamento declara um motivo', () => {
    for (const c of CRUZAMENTOS) {
      expect(c.motivo, `${c.id} sem motivo`).toBeTruthy();
      expect(c.motivo.length).toBeGreaterThan(20);
    }
  });

  it('⚠️ é lista curta — varredura é garimpo', () => {
    expect(CRUZAMENTOS.length).toBeLessThanOrEqual(8);
  });

  it('inclui o teste da explicação sobre pais e grupo', () => {
    const c = CRUZAMENTOS.find((x) => x.id === 'engajamento_por_filhos')!;
    expect(c.controle).toBe(TEMPO);
    expect(c.motivo).toMatch(/pais não têm tempo/i);
  });
});

describe('⚠️⚠️ recomendação sem número real é DESCARTADA', () => {
  const perfil = montarPerfil([
    { pergunta_texto: 'Tem filhos?', tipo: 'sim_nao', valor: 'Sim', total: 540 },
    { pergunta_texto: 'Tem filhos?', tipo: 'sim_nao', valor: 'Não', total: 258 },
  ] as never);
  const cruz = montarCruzamentos(gente(300, { [TEMPO]: 'De 1 a 3 anos', [GRUPO]: 'Sim', [NEXT]: 'Sim' }));

  it('mantém a que cita número calculado', () => {
    const r = filtrarRecomendacoes(
      [{ titulo: 'Série sobre criar filhos na fé', base_numerica: 540 }], perfil, cruz,
    );
    expect(r.mantidas).toHaveLength(1);
    expect(r.descartadas).toHaveLength(0);
  });

  it('⚠️⚠️ descarta o conselho genérico sem âncora', () => {
    const r = filtrarRecomendacoes(
      [{ titulo: 'Façam uma série sobre família', base_numerica: null }], perfil, cruz,
    );
    expect(r.mantidas).toHaveLength(0);
    expect(r.descartadas[0].titulo).toBe('Façam uma série sobre família');
  });

  it('⚠️ descarta número INVENTADO que não existe no material', () => {
    const r = filtrarRecomendacoes(
      [{ titulo: 'Série para os 900 jovens', base_numerica: 900 }], perfil, cruz,
    );
    expect(r.mantidas).toHaveLength(0);
  });

  it('tolera arredondamento de ±1 (67,5 citado como 68)', () => {
    const nums = numerosDisponiveis(perfil, cruz);
    expect(citaNumeroReal(541, nums)).toBe(true);
    expect(citaNumeroReal(539, nums)).toBe(true);
    expect(citaNumeroReal(530, nums)).toBe(false);
  });

  it('⚠️ os descartados voltam nomeados — some item, não some explicação', () => {
    const r = filtrarRecomendacoes(
      [{ titulo: 'A', base_numerica: 540 }, { titulo: 'B', base_numerica: 12345 }], perfil, cruz,
    );
    expect(r.mantidas.map((x) => x.titulo)).toEqual(['A']);
    expect(r.descartadas.map((x) => x.titulo)).toEqual(['B']);
  });
});
