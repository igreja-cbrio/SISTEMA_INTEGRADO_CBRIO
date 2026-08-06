import { describe, it, expect } from 'vitest';

import { validarPerguntas, montarItens, visivel } from '../../backend/utils/censoPerguntas.js';
import questionario from '../../backend/data/censoQuestionario2026.json';

// Este teste é o guarda-corpo do questionário real do Censo CBRio 2026.
// `backend/data/censoQuestionario2026.json` é a FONTE DE VERDADE: o script de
// semeadura lê esse arquivo. Se alguém editar o JSON e quebrar uma condicional,
// duplicar um id ou pôr "Prefiro não dizer" numa pergunta que não tem essa
// opção, é aqui que estoura — não no culto de domingo com 300 pessoas.

const perguntas = questionario.perguntas as Parameters<typeof montarItens>[0]['perguntas'];
const respondiveis = perguntas.filter((p) => p.tipo !== 'secao');

describe('questionário 2026 · integridade', () => {
  it('passa na validação do motor, sem um único erro', () => {
    const { ok, erros } = validarPerguntas(perguntas);
    expect(erros).toEqual([]);
    expect(ok).toBe(true);
  });

  it('a validação não mexe em nada — os ids e a ordem são exatamente os do arquivo', () => {
    const { perguntas: normalizadas } = validarPerguntas(perguntas);
    expect(normalizadas.map((p) => p.id)).toEqual(perguntas.map((p) => p.id));
  });

  it('tem os 13 blocos da especificação', () => {
    expect(perguntas.filter((p) => p.tipo === 'secao')).toHaveLength(13);
  });

  it('o slug é o que vai no QR impresso', () => {
    expect(questionario.slug).toBe('censo-cbrio-2026');
  });
});

describe('questionário 2026 · o que a especificação exige explicitamente', () => {
  const byId = (id: string) => respondiveis.find((p) => p.id === id);

  it('os 4 gatilhos de cuidado existem e são Sim/Não', () => {
    const gatilhos = respondiveis.filter((p) => p.acao === 'cuidado');
    expect(gatilhos.map((p) => p.cuidado_tipo).sort())
      .toEqual(['aconselhamento', 'conversa', 'familiar', 'oracao']);
    expect(gatilhos.every((p) => p.tipo === 'sim_nao')).toBe(true);
  });

  it('toda pergunta sensível tem saída "Prefiro não dizer" — é o que sustenta a obrigatoriedade', () => {
    const semSaida = respondiveis
      .filter((p) => p.sensivel && p.opcoes)          // as escalas sensíveis não têm opção
      .filter((p) => !(p.opcoes_neutras || []).length);
    expect(semSaida.map((p) => p.id)).toEqual([]);
  });

  it('"algo que nunca teve coragem" NÃO pede o conteúdo — só abre a porta da conversa', () => {
    const p = byId('algo_nunca_compartilhou');
    expect(p?.tipo).toBe('opcao_unica');
    expect(byId('quer_conversar')?.mostrar_se?.pergunta).toBe('algo_nunca_compartilhou');
  });

  it('"indicaria" é NPS 0–10, não Sim/Não (é o que permite acompanhar a evolução)', () => {
    expect(byId('indicaria')?.tipo).toBe('nps');
    expect(byId('indicaria')?.max).toBe(10);
  });

  it('a idade DA PESSOA não é perguntada — vem da data de nascimento', () => {
    expect(byId('nascimento')?.tipo).toBe('data');
    // "Em quais faixas de idade?" (dos filhos) é outra coisa e pode existir.
    expect(respondiveis.some((p) => /sua idade|qual.*sua.*idade|faixa etária/i.test(p.texto))).toBe(false);
  });

  it('o bloco do culto usa estrelas (CSAT), não Likert', () => {
    for (const id of ['nota_recepcao', 'nota_estrutura', 'nota_palavra', 'nota_louvor']) {
      expect(byId(id)?.tipo).toBe('estrelas_5');
    }
  });

  it('o comentário final é opcional (a especificação se contradizia; decisão: opcional)', () => {
    expect(byId('comentario_livre')?.obrigatoria).toBe(false);
  });

  it('faixas de idade dos filhos é MÚLTIPLA — uma família tem filhos em várias faixas', () => {
    expect(byId('filhos_faixas')?.tipo).toBe('multipla');
  });

  it('Instagram tem saída para quem não usa a rede', () => {
    expect(byId('tem_instagram')?.tipo).toBe('sim_nao');
    expect(byId('instagram')?.mostrar_se).toEqual({ pergunta: 'tem_instagram', valores: ['Sim'] });
  });
});

describe('questionário 2026 · o formulário é respondível de ponta a ponta', () => {
  // Responde tudo que estiver visível, em cascata, como uma pessoa faria.
  function responder(escolha: (p: Record<string, unknown>) => unknown) {
    const respostas: Record<string, unknown> = {};
    for (const p of perguntas) {
      if (p.tipo === 'secao') continue;
      if (!visivel(p, respostas)) continue;
      const v = escolha(p as Record<string, unknown>);
      if (v !== undefined) respostas[p.id] = v;
    }
    return respostas;
  }

  const primeiraOpcao = (p: Record<string, unknown>) => {
    const opcoes = p.opcoes as string[] | undefined;
    switch (p.tipo) {
      case 'sim_nao': return 'Sim';
      case 'opcao_unica': return opcoes?.[0];
      case 'multipla': return [opcoes?.[0]];
      case 'nps': return 10;
      case 'escala_5': case 'estrelas_5': return 5;
      case 'numero': return p.min_num;
      case 'data': return '1990-05-12';
      default: return 'resposta';
    }
  };

  it('quem responde "Sim" em tudo não fica preso em nenhuma pergunta', () => {
    const respostas = responder(primeiraOpcao);
    const { faltando, ignoradas } = montarItens({ perguntas, respostas });
    expect(faltando).toEqual([]);
    expect(ignoradas).toEqual([]);
  });

  it('quem responde "Não" em tudo também passa — e vê MENOS perguntas', () => {
    const naoEmTudo = (p: Record<string, unknown>) => {
      const opcoes = p.opcoes as string[] | undefined;
      if (p.tipo === 'sim_nao') return 'Não';
      if (p.tipo === 'opcao_unica') return opcoes?.[opcoes.length - 1];
      return primeiraOpcao(p);
    };
    const respostas = responder(naoEmTudo);
    const { faltando, itens } = montarItens({ perguntas, respostas });
    expect(faltando).toEqual([]);

    const comSim = montarItens({ perguntas, respostas: responder(primeiraOpcao) }).itens;
    // É isto que torna 93 campos viável no culto: a maioria não vê tudo.
    expect(itens.length).toBeLessThan(comSim.length);
  });

  it('solteiro não é perguntado sobre cônjuge nem sobre o casamento', () => {
    const respostas = responder((p) => (p.id === 'estado_civil' ? 'Solteiro(a)' : primeiraOpcao(p)));
    expect(respostas.conjuge_nome).toBeUndefined();
    expect(respostas.casamento_esta).toBeUndefined();
    expect(montarItens({ perguntas, respostas }).faltando).toEqual([]);
  });

  // Decisão do Matheus (06/08): as perguntas de voluntariado aparecem para
  // TODOS. Quem serve informalmente, quem parou ou quem está começando
  // responderia "não sirvo" e a liderança perderia justamente esse sinal. A
  // especificação original também as tinha soltas.
  it('quem não serve AINDA VÊ as perguntas de voluntariado', () => {
    const respostas = responder((p) => (p.id === 'serve_ministerio' ? 'Não' : primeiraOpcao(p)));
    expect(respostas.valorizado_voluntario).toBeDefined();
    expect(respostas.preparado_servir).toBeDefined();
    expect(respostas.acompanhamento_lideranca).toBeDefined();
    // Mas a lista de QUAIS ministérios segue condicional — a própria
    // especificação marca esse desdobramento como "Se Sim →".
    expect(respostas.quais_ministerios).toBeUndefined();
  });

  it('e pode responder "Não se aplica" sem que isso entre na média dos voluntários', () => {
    const respostas = responder((p) => {
      if (p.id === 'serve_ministerio') return 'Não';
      if (p.permite_nao_se_aplica || (p.opcoes_neutras as string[] | undefined)?.includes('Não se aplica')) {
        return 'Não se aplica';
      }
      return primeiraOpcao(p);
    });
    const { itens, faltando } = montarItens({ perguntas, respostas });
    expect(faltando).toEqual([]);
    const valorizado = itens.find((i) => i.pergunta_id === 'valorizado_voluntario');
    expect(valorizado?.valor_texto).toBe('Não se aplica');
    expect(valorizado?.valor_num).toBeNull();   // fora da média
  });

  it('as três perguntas soltas têm saída — obrigatória sem saída viraria nota inventada', () => {
    for (const id of ['valorizado_voluntario', 'preparado_servir']) {
      expect(respondiveis.find((p) => p.id === id)?.permite_nao_se_aplica).toBe(true);
    }
    const acomp = respondiveis.find((p) => p.id === 'acompanhamento_lideranca');
    expect(acomp?.opcoes).toContain('Não se aplica');
    expect(acomp?.opcoes_neutras).toContain('Não se aplica');
  });

  it('formulário em branco acusa só as obrigatórias VISÍVEIS de saída', () => {
    const { faltando } = montarItens({ perguntas, respostas: {} });
    const visiveisNoInicio = respondiveis
      .filter((p) => p.obrigatoria && !p.mostrar_se)
      .map((p) => p.id);
    expect(faltando.map((f) => f.id)).toEqual(visiveisNoInicio);
  });
});
