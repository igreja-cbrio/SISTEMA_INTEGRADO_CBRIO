import { describe, it, expect } from 'vitest';

import {
  slugificar,
  validarPerguntas,
  visivel,
  ehNeutra,
  resolverMultipla,
  montarItens,
  ordenarPorOpcoes,
  baseSemNeutras,
} from '../../backend/utils/censoPerguntas.js';

// O que está em teste aqui é a integridade do questionário e da resposta — os
// dois pontos onde um erro só aparece DEPOIS de centenas de pessoas terem
// respondido, quando já não há como voltar e perguntar de novo.
//
// Contexto: 78 perguntas obrigatórias em 13 blocos, respondidas no celular em
// pé no culto. Condicional, "Prefiro não dizer" e gatilho de cuidado são o que
// tornam isso viável — e são exatamente as três coisas que dão errado calado.

describe('slugificar', () => {
  it('tira acento, espaço e caixa (é a URL do QR impresso)', () => {
    expect(slugificar('Censo CBRio 2026')).toBe('censo-cbrio-2026');
    expect(slugificar('Perfil & Engajamento — São João')).toBe('perfil-engajamento-sao-joao');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(slugificar('  ...Censo!!!  ')).toBe('censo');
  });

  it('devolve vazio para entrada inútil (o chamador troca por um default)', () => {
    expect(slugificar(null as unknown as string)).toBe('');
    expect(slugificar('!!!')).toBe('');
  });
});

describe('validarPerguntas · identidade', () => {
  it('PRESERVA o id de quem já tem — mudar o id órfã as respostas coletadas', () => {
    const { perguntas, ok } = validarPerguntas([
      { id: 'faixa_etaria', tipo: 'opcao_unica', texto: 'Sua faixa etária?', opcoes: ['18-24', '25-34'] },
    ]);
    expect(ok).toBe(true);
    expect(perguntas[0].id).toBe('faixa_etaria');
  });

  it('gera id só para quem chega sem', () => {
    const { perguntas } = validarPerguntas([{ tipo: 'texto_curto', texto: 'Qual seu bairro?' }]);
    expect(perguntas[0].id).toMatch(/^p1_qual-seu-bairro/);
  });

  it('acusa id duplicado (dois gráficos disputariam a mesma coluna)', () => {
    const { ok, erros } = validarPerguntas([
      { id: 'x', tipo: 'texto_curto', texto: 'A' },
      { id: 'x', tipo: 'texto_curto', texto: 'B' },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('duplicado');
  });
});

describe('validarPerguntas · vocabulário', () => {
  it('recusa tipo que o renderer não desenha', () => {
    const { ok, erros } = validarPerguntas([{ tipo: 'matriz', texto: 'x' }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('matriz');
  });

  it('recusa opcao_unica/multipla com menos de 2 opções', () => {
    const { ok, erros } = validarPerguntas([
      { tipo: 'opcao_unica', texto: 'Escolha', opcoes: ['só uma'] },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('pelo menos 2 opções');
  });

  it('recusa opções repetidas (viram duas fatias iguais no gráfico)', () => {
    const { ok, erros } = validarPerguntas([
      { tipo: 'opcao_unica', texto: 'Escolha', opcoes: ['Sim', 'Sim', 'Não'] },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('repetidas');
  });

  it('seção não conta como pergunta respondível', () => {
    const { ok, erros } = validarPerguntas([{ tipo: 'secao', texto: 'Sobre você' }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('pelo menos uma pergunta respondível');
  });

  it('limita o max do nps em 10', () => {
    const { perguntas } = validarPerguntas([{ tipo: 'nps', texto: 'Nota?', max: 99 }]);
    expect(perguntas[0].max).toBe(10);
  });

  it('guarda os rótulos do Likert (o bloco tem escalas com sentidos diferentes)', () => {
    const { perguntas } = validarPerguntas([
      { tipo: 'escala_5', texto: 'Satisfeito?', rotulos: { min: 'Insatisfeito', max: 'Satisfeito' } },
    ]);
    expect(perguntas[0].rotulos).toEqual({ min: 'Insatisfeito', max: 'Satisfeito' });
  });

  it('formato de máscara só vale em texto_curto', () => {
    expect(validarPerguntas([{ tipo: 'texto_curto', texto: 'Tel', formato: 'telefone' }]).ok).toBe(true);
    const ruim = validarPerguntas([{ tipo: 'texto_longo', texto: 'Tel', formato: 'telefone' }]);
    expect(ruim.ok).toBe(false);
    expect(ruim.erros.join(' ')).toContain('só vale em texto_curto');
  });
});

describe('validarPerguntas · opção neutra', () => {
  it('só aceita neutra que exista na lista de opções', () => {
    const { ok, erros } = validarPerguntas([{
      tipo: 'multipla', texto: 'Restauração', opcoes: ['Traumas', 'Culpa'],
      opcoes_neutras: ['Prefiro não dizer'],
    }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('fora da lista de opções');
  });

  it('aceita quando a neutra está entre as opções', () => {
    const { ok, perguntas } = validarPerguntas([{
      tipo: 'multipla', texto: 'Restauração',
      opcoes: ['Traumas', 'Culpa', 'Prefiro não dizer'],
      opcoes_neutras: ['Prefiro não dizer'],
    }]);
    expect(ok).toBe(true);
    expect(perguntas[0].opcoes_neutras).toEqual(['Prefiro não dizer']);
  });
});

describe('validarPerguntas · condicional', () => {
  const pai = { id: 'tem_filhos', tipo: 'sim_nao', texto: 'Tem filhos?' };

  it('aceita condicional que aponta para pergunta anterior', () => {
    const { ok, perguntas } = validarPerguntas([
      pai,
      { id: 'quantos', tipo: 'numero', texto: 'Quantos?', mostrar_se: { pergunta: 'tem_filhos', valores: ['Sim'] } },
    ]);
    expect(ok).toBe(true);
    expect(perguntas[1].mostrar_se).toEqual({ pergunta: 'tem_filhos', valores: ['Sim'] });
  });

  it('recusa referência para pergunta POSTERIOR — campo que nunca apareceria', () => {
    const { ok, erros } = validarPerguntas([
      { id: 'quantos', tipo: 'numero', texto: 'Quantos?', mostrar_se: { pergunta: 'tem_filhos', valores: ['Sim'] } },
      pai,
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('não é uma pergunta anterior');
  });

  it('recusa condicional que se refere a si mesma', () => {
    const { ok } = validarPerguntas([
      { id: 'x', tipo: 'sim_nao', texto: 'X', mostrar_se: { pergunta: 'x', valores: ['Sim'] } },
    ]);
    expect(ok).toBe(false);
  });

  it('recusa condicional sem valor que a ative', () => {
    const { ok, erros } = validarPerguntas([
      pai,
      { id: 'q', tipo: 'numero', texto: 'Q', mostrar_se: { pergunta: 'tem_filhos', valores: [] } },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('sem valores');
  });
});

describe('validarPerguntas · gatilho de cuidado', () => {
  it('aceita gatilho Sim/Não com tipo conhecido', () => {
    const { ok, perguntas } = validarPerguntas([{
      id: 'quer_oracao', tipo: 'sim_nao', texto: 'Quer ser contatado para oração?',
      acao: 'cuidado', cuidado_tipo: 'oracao',
    }]);
    expect(ok).toBe(true);
    expect(perguntas[0].acao).toBe('cuidado');
  });

  it('recusa gatilho que não é Sim/Não (não há "talvez" para pedido de ajuda)', () => {
    const { ok, erros } = validarPerguntas([{
      tipo: 'opcao_unica', texto: 'Quer ajuda?', opcoes: ['Sim', 'Não', 'Talvez'],
      acao: 'cuidado', cuidado_tipo: 'oracao',
    }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('precisa ser Sim/Não');
  });

  it('recusa cuidado_tipo desconhecido — pedido sem fila é pedido perdido', () => {
    const { ok, erros } = validarPerguntas([{
      tipo: 'sim_nao', texto: 'Quer ajuda?', acao: 'cuidado', cuidado_tipo: 'qualquer',
    }]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('cuidado_tipo');
  });
});

describe('tipo busca · lista longa com catálogo', () => {
  // As opções NÃO moram na pergunta: 1.911 igrejas em cada requisição do
  // questionário seria absurdo. Vêm por /catalogo/:nome?q=.
  it('aceita catálogo conhecido e liga o escape por padrão', () => {
    const { ok, perguntas } = validarPerguntas([
      { id: 'ig', tipo: 'busca', texto: 'Qual igreja?', catalogo: 'igrejas_rj' },
    ]);
    expect(ok).toBe(true);
    expect(perguntas[0].catalogo).toBe('igrejas_rj');
    // Lista incompleta SEM escape faz a pessoa responder qualquer coisa.
    expect(perguntas[0].permite_outro).toBe(true);
  });

  it('recusa catálogo inventado — senão vira endpoint que consulta o que pedirem', () => {
    const { ok, erros } = validarPerguntas([
      { id: 'x', tipo: 'busca', texto: 'X', catalogo: 'qualquer_coisa' },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('não existe');
  });

  it('recusa catálogo em tipo que não é busca', () => {
    const { ok, erros } = validarPerguntas([
      { id: 'y', tipo: 'texto_curto', texto: 'Y', catalogo: 'igrejas_rj' },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('só vale no tipo');
  });

  it('guarda o TEXTO escolhido — o catálogo pode mudar sem invalidar resposta', () => {
    const p = validarPerguntas([
      { id: 'ig', tipo: 'busca', texto: 'Qual igreja?', catalogo: 'igrejas_rj', obrigatoria: true },
    ]).perguntas;
    const { itens } = montarItens({ perguntas: p, respostas: { ig: 'Igreja Batista de Laranjal' } });
    expect(itens[0].valor_texto).toBe('Igreja Batista de Laranjal');
    expect(itens[0].valor_opcoes).toBeNull();
  });

  it('aceita valor FORA do catálogo (a pessoa digitou a igreja dela)', () => {
    const p = validarPerguntas([
      { id: 'ig', tipo: 'busca', texto: 'Qual igreja?', catalogo: 'igrejas_rj', obrigatoria: true },
    ]).perguntas;
    const { itens, faltando } = montarItens({
      perguntas: p, respostas: { ig: 'Igreja que não está em lista nenhuma' },
    });
    expect(faltando).toEqual([]);
    expect(itens[0].valor_texto).toContain('não está em lista');
  });
});

describe('visivel', () => {
  const cond = { id: 'q', tipo: 'numero', texto: 'Q', mostrar_se: { pergunta: 'pai', valores: ['Sim'] } };

  it('sem mostrar_se, sempre visível', () => {
    expect(visivel({ id: 'x', tipo: 'texto_curto', texto: 'X' }, {})).toBe(true);
  });

  it('invisível enquanto a pergunta-pai não foi respondida', () => {
    expect(visivel(cond, {})).toBe(false);
  });

  it('visível só no valor que ativa', () => {
    expect(visivel(cond, { pai: 'Sim' })).toBe(true);
    expect(visivel(cond, { pai: 'Não' })).toBe(false);
  });

  it('ativa por múltipla escolha: basta uma opção marcada estar na lista', () => {
    const c = { mostrar_se: { pergunta: 'areas', valores: ['Kids'] } };
    expect(visivel(c, { areas: ['Louvor', 'Kids'] })).toBe(true);
    expect(visivel(c, { areas: ['Louvor'] })).toBe(false);
  });
});

describe('resolverMultipla · a neutra é exclusiva', () => {
  const p = {
    tipo: 'multipla', opcoes: ['Traumas', 'Culpa', 'Prefiro não dizer'],
    opcoes_neutras: ['Prefiro não dizer'],
  };

  it('"Prefiro não dizer" apaga as outras marcações', () => {
    expect(resolverMultipla(p, ['Traumas', 'Prefiro não dizer'])).toEqual(['Prefiro não dizer']);
  });

  it('sem neutra, mantém tudo que é opção válida', () => {
    expect(resolverMultipla(p, ['Traumas', 'Culpa'])).toEqual(['Traumas', 'Culpa']);
  });

  it('descarta valor que não está entre as opções (cliente adulterado)', () => {
    expect(resolverMultipla(p, ['Traumas', 'Injetado'])).toEqual(['Traumas']);
  });

  it('ehNeutra reconhece a opção', () => {
    expect(ehNeutra(p, 'Prefiro não dizer')).toBe(true);
    expect(ehNeutra(p, 'Traumas')).toBe(false);
  });
});

describe('escala com "Não se aplica"', () => {
  // As perguntas de voluntariado ficam visíveis para TODOS (decisão do Matheus):
  // quem serve informalmente ou parou responderia "não sirvo" e a liderança
  // perderia o sinal. A saída existe para que quem nunca serviu não seja
  // obrigado a dar nota — e para que essa nota não entre na média.
  const p = {
    id: 'valorizado', tipo: 'escala_5', texto: 'Me sinto valorizado(a) como voluntário(a).',
    obrigatoria: true, permite_nao_se_aplica: true,
  };

  it('só vale em escala — em pergunta de opção é opção normal', () => {
    const ruim = validarPerguntas([
      { tipo: 'opcao_unica', texto: 'X', opcoes: ['A', 'B'], permite_nao_se_aplica: true },
    ]);
    expect(ruim.ok).toBe(false);
    expect(ruim.erros.join(' ')).toContain('só vale em escala');
  });

  it('guarda o texto e deixa o número NULO — é o que mantém a média limpa', () => {
    const { itens, faltando } = montarItens({ perguntas: [p], respostas: { valorizado: 'Não se aplica' } });
    expect(faltando).toEqual([]);
    expect(itens[0].valor_texto).toBe('Não se aplica');
    expect(itens[0].valor_num).toBeNull();
  });

  it('a nota normal continua indo para valor_num', () => {
    const { itens } = montarItens({ perguntas: [p], respostas: { valorizado: 4 } });
    expect(itens[0].valor_num).toBe(4);
  });

  it('conta como neutra, então sai da base do percentual', () => {
    expect(ehNeutra(p, 'Não se aplica')).toBe(true);
    expect(baseSemNeutras(p, [{ valor: '5', total: 30 }, { valor: 'Não se aplica', total: 70 }]))
      .toEqual({ base: 30, neutras: 70, total: 100 });
  });

  it('sem a permissão, "Não se aplica" não é resposta válida de escala', () => {
    const semSaida = { ...p, permite_nao_se_aplica: undefined, obrigatoria: true };
    const { itens, faltando } = montarItens({ perguntas: [semSaida], respostas: { valorizado: 'Não se aplica' } });
    expect(itens).toEqual([]);
    expect(faltando.map((f) => f.id)).toEqual(['valorizado']);
  });
});

describe('montarItens', () => {
  const perguntas = [
    { id: 'sec', tipo: 'secao', texto: 'Sobre você' },
    { id: 'bairro', tipo: 'texto_curto', texto: 'Bairro', obrigatoria: true },
    { id: 'nasc', tipo: 'data', texto: 'Nascimento', obrigatoria: true },
    { id: 'nota', tipo: 'nps', texto: 'Indicaria?', max: 10, obrigatoria: true },
    { id: 'estrelas', tipo: 'estrelas_5', texto: 'Louvor', obrigatoria: true },
    { id: 'tem_filhos', tipo: 'sim_nao', texto: 'Tem filhos?', obrigatoria: true },
    {
      id: 'quantos', tipo: 'numero', texto: 'Quantos?', obrigatoria: true,
      min_num: 1, max_num: 20, mostrar_se: { pergunta: 'tem_filhos', valores: ['Sim'] },
    },
    {
      id: 'restauracao', tipo: 'multipla', texto: 'Restauração', obrigatoria: true, sensivel: true,
      opcoes: ['Traumas', 'Culpa', 'Prefiro não dizer'], opcoes_neutras: ['Prefiro não dizer'],
    },
    {
      id: 'quer_oracao', tipo: 'sim_nao', texto: 'Quer contato para oração?',
      obrigatoria: true, acao: 'cuidado', cuidado_tipo: 'oracao',
    },
  ];

  const base = {
    bairro: 'Tijuca', nasc: '1990-05-12', nota: 9, estrelas: 5,
    tem_filhos: 'Não', restauracao: ['Traumas'], quer_oracao: 'Não',
  };

  it('ignora seção e não cobra pergunta invisível — o erro clássico do formulário travado', () => {
    const { itens, faltando } = montarItens({ perguntas, respostas: base });
    expect(faltando).toEqual([]);   // `quantos` é obrigatória mas invisível
    expect(itens.find((i) => i.pergunta_id === 'quantos')).toBeUndefined();
    expect(itens.find((i) => i.pergunta_id === 'sec')).toBeUndefined();
  });

  it('cobra a condicional quando ela aparece', () => {
    const { faltando } = montarItens({ perguntas, respostas: { ...base, tem_filhos: 'Sim' } });
    expect(faltando.map((f) => f.id)).toEqual(['quantos']);
  });

  it('descarta resposta de pergunta que ficou invisível (a pessoa voltou e mudou)', () => {
    const { itens, ignoradas } = montarItens({
      perguntas, respostas: { ...base, tem_filhos: 'Não', quantos: 3 },
    });
    expect(ignoradas).toContain('quantos');
    expect(itens.find((i) => i.pergunta_id === 'quantos')).toBeUndefined();
  });

  it('separa número de texto (o número é que o SQL agrega)', () => {
    const { itens } = montarItens({ perguntas, respostas: base });
    const nota = itens.find((i) => i.pergunta_id === 'nota');
    expect(nota?.valor_num).toBe(9);
    expect(nota?.valor_texto).toBe('9');
  });

  it('recusa nota fora da faixa — 99 estrelas puxaria a média do bloco', () => {
    const { itens, faltando } = montarItens({ perguntas, respostas: { ...base, estrelas: 99 } });
    expect(itens.find((i) => i.pergunta_id === 'estrelas')).toBeUndefined();
    expect(faltando.map((f) => f.id)).toContain('estrelas');
  });

  it('nps zero é resposta, não ausência', () => {
    const { itens } = montarItens({ perguntas, respostas: { ...base, nota: 0 } });
    expect(itens.find((i) => i.pergunta_id === 'nota')?.valor_num).toBe(0);
  });

  it('recusa data que não é ISO', () => {
    const { faltando } = montarItens({ perguntas, respostas: { ...base, nasc: '12/05/1990' } });
    expect(faltando.map((f) => f.id)).toContain('nasc');
  });

  it('múltipla vira array + espelho legível, com a neutra exclusiva aplicada no servidor', () => {
    const { itens } = montarItens({
      perguntas, respostas: { ...base, restauracao: ['Traumas', 'Prefiro não dizer'] },
    });
    const r = itens.find((i) => i.pergunta_id === 'restauracao');
    expect(r?.valor_opcoes).toEqual(['Prefiro não dizer']);
    expect(r?.valor_texto).toBe('Prefiro não dizer');
  });

  it('marca o item sensível — é o que trava a leitura nominal depois', () => {
    const { itens } = montarItens({ perguntas, respostas: base });
    expect(itens.find((i) => i.pergunta_id === 'restauracao')?.sensivel).toBe(true);
    expect(itens.find((i) => i.pergunta_id === 'bairro')?.sensivel).toBe(false);
  });

  it('gatilho de cuidado só dispara no "Sim"', () => {
    expect(montarItens({ perguntas, respostas: base }).cuidados).toEqual([]);
    expect(montarItens({ perguntas, respostas: { ...base, quer_oracao: 'Sim' } }).cuidados)
      .toEqual([{ tipo: 'oracao' }]);
  });

  it('recusa opção que não existe na pergunta fechada', () => {
    const { itens, faltando } = montarItens({ perguntas, respostas: { ...base, tem_filhos: 'Talvez' } });
    expect(itens.find((i) => i.pergunta_id === 'tem_filhos')).toBeUndefined();
    expect(faltando.map((f) => f.id)).toContain('tem_filhos');
  });

  it('acusa obrigatória vazia — inclusive string só de espaço', () => {
    expect(montarItens({ perguntas, respostas: { ...base, bairro: '   ' } }).faltando.map((f) => f.id))
      .toEqual(['bairro']);
  });
});

describe('ordenarPorOpcoes', () => {
  const p = { opcoes: ['Nunca', 'Raramente', 'Algumas vezes na semana', 'Diariamente'] };

  it('devolve na ordem do questionário, não alfabética', () => {
    const linhas = [
      { valor: 'Diariamente', total: 10 },
      { valor: 'Nunca', total: 2 },
      { valor: 'Algumas vezes na semana', total: 7 },
    ];
    expect(ordenarPorOpcoes(p, linhas).map((l) => l.valor))
      .toEqual(['Nunca', 'Algumas vezes na semana', 'Diariamente']);
  });

  it('valor fora da lista vai para o fim', () => {
    const linhas = [{ valor: 'Sei lá', total: 1 }, { valor: 'Nunca', total: 3 }];
    expect(ordenarPorOpcoes(p, linhas).map((l) => l.valor)).toEqual(['Nunca', 'Sei lá']);
  });
});

describe('baseSemNeutras', () => {
  const p = {
    opcoes: ['Bem', 'Ansioso', 'Prefiro não dizer'],
    opcoes_neutras: ['Prefiro não dizer'],
  };

  it('tira a neutra do denominador — senão todo percentual do bloco fica menor do que é', () => {
    const linhas = [
      { valor: 'Bem', total: 60 },
      { valor: 'Ansioso', total: 20 },
      { valor: 'Prefiro não dizer', total: 20 },
    ];
    expect(baseSemNeutras(p, linhas)).toEqual({ base: 80, neutras: 20, total: 100 });
  });

  it('sem neutra marcada, a base é o total', () => {
    expect(baseSemNeutras({ opcoes: ['A', 'B'] }, [{ valor: 'A', total: 3 }, { valor: 'B', total: 1 }]))
      .toEqual({ base: 4, neutras: 0, total: 4 });
  });
});
