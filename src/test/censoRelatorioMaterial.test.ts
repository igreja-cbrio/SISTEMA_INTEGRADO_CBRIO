// O material que vai para o modelo — e o que ele NÃO pode conter.
//
// ⚠️⚠️ Estes casos existem porque o relatório é gerado sobre um censo onde
// `texto_curto` guarda CPF, nome, telefone, e-mail e CEP (794 de cada, todos
// com `sensivel = false`). A proteção é o material ser construído só de
// contagem e porcentagem — nunca linha de pessoa.
import { describe, it, expect } from 'vitest';
import { materialDoPerfil, materialDosCruzamentos } from '../../backend/utils/censoRelatorioDados.js';

const perfil = [
  { pergunta: 'Tem filhos?', base: 100, opcoes: [
    { valor: 'Sim', n: 68, pct: 68 }, { valor: 'Não', n: 32, pct: 32 }] },
];

const cruzamentos = [{
  id: 'x', eixo: 'Você já fez o Next?', controle: 'Há quanto tempo frequenta?',
  motivo: 'Medir se quem passa pelo Next se conecta mais.',
  faixas: [
    { controle: 'De 1 a 3 anos', valor: 'Sim', pessoas: 110,
      metricas: { 'Você participa de um Grupo?': { n: 110, sim: 77, pct_sim: 70 } } },
    { controle: 'De 1 a 3 anos', valor: 'Não', pessoas: 146,
      metricas: { 'Você participa de um Grupo?': { n: 146, sim: 37, pct_sim: 25 } } },
  ],
}];

describe('material do perfil', () => {
  it('leva pergunta, base, contagem e porcentagem', () => {
    const t = materialDoPerfil(perfil);
    expect(t).toContain('Tem filhos?');
    expect(t).toContain('base: 100');
    expect(t).toContain('Sim: 68 (68%)');
  });

  it('lista vazia não quebra', () => {
    expect(materialDoPerfil([])).toBe('');
    expect(materialDoPerfil(undefined as never)).toBe('');
  });
});

describe('material dos cruzamentos', () => {
  it('⚠️ leva o MOTIVO junto', () => {
    // Sem o motivo, o modelo não sabe o que a igreja queria saber e interpreta
    // a tabela como curiosidade — foi por isso que a lista é fechada e cada
    // par tem um porquê declarado.
    expect(materialDosCruzamentos(cruzamentos)).toContain('Por que a igreja quis saber');
  });

  it('declara o CONTROLE, senão o efeito lido é só antiguidade', () => {
    const t = materialDosCruzamentos(cruzamentos);
    expect(t).toContain('controlando por Há quanto tempo frequenta?');
    expect(t).toContain('Há quanto tempo frequenta?=De 1 a 3 anos');
  });

  it('leva n e proporção de cada célula, para o modelo não ter de calcular', () => {
    const t = materialDosCruzamentos(cruzamentos);
    expect(t).toContain('70% sim (77/110)');
    expect(t).toContain('[110 pessoas]');
  });
});

describe('⚠️ o material é só agregado', () => {
  it('não há caminho para linha de pessoa entrar', () => {
    // As duas funções recebem SÓ as estruturas agregadas e emitem texto a
    // partir delas. Se alguém acrescentar um campo de pessoa ao perfil ou às
    // faixas, este caso não pega — mas o formato abaixo é o contrato: o que
    // sai é `valor: n (pct%)`, nunca um registro.
    const t = materialDoPerfil(perfil) + materialDosCruzamentos(cruzamentos);
    expect(t).not.toMatch(/\d{11}/);          // CPF
    expect(t).not.toMatch(/@/);                // e-mail
    expect(t).not.toMatch(/\(\d{2}\)\s?\d{4,5}-\d{4}/); // telefone
  });
});
