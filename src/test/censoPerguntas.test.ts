import { describe, it, expect } from 'vitest';

import {
  slugificar,
  validarPerguntas,
  montarItens,
} from '../../backend/utils/censoPerguntas.js';

// O que está em teste aqui é a integridade do questionário e da resposta — os
// dois pontos onde um erro só aparece DEPOIS de centenas de pessoas terem
// respondido, quando já não há como voltar e perguntar de novo.

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

describe('validarPerguntas', () => {
  it('PRESERVA o id de quem já tem — mudar o id órfã as respostas coletadas', () => {
    const { perguntas, ok } = validarPerguntas([
      { id: 'faixa_etaria', tipo: 'opcao_unica', texto: 'Sua faixa etária?', opcoes: ['18-24', '25-34'] },
    ]);
    expect(ok).toBe(true);
    expect(perguntas[0].id).toBe('faixa_etaria');
  });

  it('gera id só para quem chega sem', () => {
    const { perguntas } = validarPerguntas([
      { tipo: 'texto_curto', texto: 'Qual seu bairro?' },
    ]);
    expect(perguntas[0].id).toMatch(/^p1_qual-seu-bairro/);
  });

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

  it('acusa id duplicado (dois gráficos disputariam a mesma coluna)', () => {
    const { ok, erros } = validarPerguntas([
      { id: 'x', tipo: 'texto_curto', texto: 'A' },
      { id: 'x', tipo: 'texto_curto', texto: 'B' },
    ]);
    expect(ok).toBe(false);
    expect(erros.join(' ')).toContain('duplicado');
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
});

describe('montarItens', () => {
  const perguntas = [
    { id: 'sec', tipo: 'secao', texto: 'Sobre você' },
    { id: 'bairro', tipo: 'texto_curto', texto: 'Bairro', obrigatoria: true },
    { id: 'nota', tipo: 'nps', texto: 'Nota', max: 10 },
    { id: 'areas', tipo: 'multipla', texto: 'Onde serve', opcoes: ['Kids', 'Louvor'] },
    { id: 'livre', tipo: 'texto_longo', texto: 'Comentário' },
  ];

  it('ignora seção e pergunta não respondida', () => {
    const { itens, faltando } = montarItens({ perguntas, respostas: { bairro: 'Tijuca' } });
    expect(itens.map((i) => i.pergunta_id)).toEqual(['bairro']);
    expect(faltando).toEqual([]);
  });

  it('separa número de texto (o número é que o SQL agrega)', () => {
    const { itens } = montarItens({ perguntas, respostas: { bairro: 'Tijuca', nota: 9 } });
    const nota = itens.find((i) => i.pergunta_id === 'nota');
    expect(nota?.valor_num).toBe(9);
    expect(nota?.valor_texto).toBe('9');
  });

  it('múltipla vira array + espelho legível para a planilha', () => {
    const { itens } = montarItens({
      perguntas,
      respostas: { bairro: 'Tijuca', areas: ['Kids', 'Louvor'] },
    });
    const areas = itens.find((i) => i.pergunta_id === 'areas');
    expect(areas?.valor_opcoes).toEqual(['Kids', 'Louvor']);
    expect(areas?.valor_texto).toBe('Kids | Louvor');
  });

  it('acusa obrigatória vazia — inclusive string só de espaço', () => {
    expect(montarItens({ perguntas, respostas: {} }).faltando.map((f) => f.id)).toEqual(['bairro']);
    expect(montarItens({ perguntas, respostas: { bairro: '   ' } }).faltando.map((f) => f.id)).toEqual(['bairro']);
  });

  it('nps zero é resposta, não ausência', () => {
    const { itens } = montarItens({ perguntas, respostas: { bairro: 'X', nota: 0 } });
    expect(itens.find((i) => i.pergunta_id === 'nota')?.valor_num).toBe(0);
  });

  it('array vazio em múltipla não gera item', () => {
    const { itens } = montarItens({ perguntas, respostas: { bairro: 'X', areas: [] } });
    expect(itens.find((i) => i.pergunta_id === 'areas')).toBeUndefined();
  });
});
