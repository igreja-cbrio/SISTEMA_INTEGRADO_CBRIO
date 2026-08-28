import { describe, it, expect } from 'vitest';
import { PERGUNTAS_SAUDE, normalizarSaude, precisaPagerPorInclusao } from '../../backend/utils/saudeCrianca.js';
import { sexoPara, patchDoCadastro, faltaDoContrato } from '../../backend/utils/dadosDoCadastro.js';

// ─────────────────────────────────────────────────────────────────────────────
// Contexto medido em 11/08/2026, na base viva:
//
//   · `kids_criancas` criadas DESDE 28/07 (quando o formulário do Kids ganhou os
//     campos de saúde): **34 pela porta do Kids · 100% respondidas** contra
//     **2 pela apresentação · 0% respondidas**. É a divergência que o Marcos
//     apontou ("em um lugar pede uma coisa e no outro pede outra").
//   · `mem_membros.genero`: **4.045 vivos, 579 com sexo, ZERO com 'M'/'F'** —
//     a base inteira usa `masculino`/`feminino`, e o código comparava com 'M'.
// ─────────────────────────────────────────────────────────────────────────────

describe('saúde da criança · a régua ÚNICA das duas portas', () => {
  it('são as 3 que movem a operação de domingo, com o par sim/detalhe', () => {
    expect(PERGUNTAS_SAUDE.map((p) => p.campo)).toEqual([
      'tem_alergia', 'tem_espectro', 'tem_limitacao_fisica',
    ]);
    for (const p of PERGUNTAS_SAUDE) expect(p.detalhe).toBe(`${p.campo.replace('tem_', '')}_qual`);
  });

  // ⚠️⚠️ MUTATION TEST · trocar `undefined` por `false` aqui transforma
  // "ninguém perguntou" em "respondeu que não" — e a régua do PAGER passaria a
  // EXCLUIR ativamente criança sobre a qual não se sabe nada.
  it('pergunta não respondida NÃO vira "não"', () => {
    expect(normalizarSaude({})).toEqual({});
    expect(normalizarSaude({ tem_alergia: null })).toEqual({});
    expect(normalizarSaude({ tem_alergia: 'sim' })).toEqual({});   // só boolean vale
    expect(normalizarSaude(undefined)).toEqual({});
  });

  it('"sim" guarda o detalhe e "não" o LIMPA', () => {
    expect(normalizarSaude({ tem_alergia: true, alergia_qual: '  amendoim ' }))
      .toEqual({ tem_alergia: true, alergia_qual: 'amendoim' });
    // ⚠️ detalhe preenchido com resposta "não" é contradição que alguém lê no
    // domingo sem saber de que lado ficar.
    expect(normalizarSaude({ tem_alergia: false, alergia_qual: 'amendoim' }))
      .toEqual({ tem_alergia: false, alergia_qual: null });
    // "sim" sem texto não inventa detalhe
    expect(normalizarSaude({ tem_espectro: true })).toEqual({ tem_espectro: true });
  });

  it('o pager de inclusão segue TEA ou limitação física — e nunca o desconhecido', () => {
    expect(precisaPagerPorInclusao({ tem_espectro: true })).toBe(true);
    expect(precisaPagerPorInclusao({ tem_limitacao_fisica: true })).toBe(true);
    expect(precisaPagerPorInclusao({ tem_alergia: true })).toBe(false);
    // ⚠️ `null` = não perguntado. Não inventamos inclusão.
    expect(precisaPagerPorInclusao({ tem_espectro: null })).toBe(false);
    expect(precisaPagerPorInclusao({})).toBe(false);
    expect(precisaPagerPorInclusao(null)).toBe(false);
  });
});

describe('sexoPara · os dois vocabulários do sistema', () => {
  // ⚠️⚠️ MUTATION TEST · a base NÃO tem 'M'/'F' em `mem_membros.genero`. Se
  // alguém "simplificar" aceitando só o formato curto na entrada, a derivação de
  // pai/mãe da apresentação volta a ser condição sempre falsa (era esse o bug).
  it('aceita canônico na entrada — que é o que a base guarda', () => {
    expect(sexoPara('curto', 'masculino')).toBe('M');
    expect(sexoPara('curto', 'feminino')).toBe('F');
    expect(sexoPara('canonico', 'masculino')).toBe('masculino');
  });

  it('aceita o curto também, e normaliza caixa e espaço', () => {
    expect(sexoPara('curto', 'm')).toBe('M');
    expect(sexoPara('canonico', ' F ')).toBe('feminino');
  });

  it('o que não é sexo vira null, nunca um chute', () => {
    for (const v of [null, undefined, '', 'outro', 'X', 'nao informado']) {
      expect(sexoPara('canonico', v)).toBeNull();
      expect(sexoPara('curto', v)).toBeNull();
    }
  });
});

describe('patchDoCadastro · preenche, nunca sobrescreve', () => {
  const membro = {
    cpf: '390.533.447-05', data_nascimento: '1990-05-02', genero: 'masculino',
    email: '  Fulano@CBRio.com.br ', telefone: '(21) 99999-8888',
  };
  const MAPA = { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' };

  it('preenche só o que está vazio e normaliza o valor', () => {
    const linha = { cpf: null, data_nascimento: '', sexo: null };
    expect(patchDoCadastro(linha, membro, MAPA)).toEqual({
      cpf: '39053344705', data_nascimento: '1990-05-02', sexo: 'masculino',
    });
  });

  // ⚠️⚠️ MUTATION TEST · sobrescrever apaga em silêncio a correção que a equipe
  // fez na tela — é a política só-onde-vazio do censo e do CPF tardio.
  it('NÃO toca no que a pessoa (ou a equipe) já preencheu', () => {
    const linha = { cpf: '11144477735', data_nascimento: '1985-01-01', sexo: 'feminino' };
    expect(patchDoCadastro(linha, membro, MAPA)).toEqual({});
  });

  it('cada destino recebe o vocabulário DELE', () => {
    const vazia = { cpf: null, data_nascimento: null, sexo: null };
    expect(patchDoCadastro(vazia, membro, MAPA, { sexo: 'curto' }).sexo).toBe('M');
    expect(patchDoCadastro(vazia, membro, MAPA, { sexo: 'canonico' }).sexo).toBe('masculino');
  });

  // ⚠️⚠️ MUTATION TEST · mandar coluna que a tabela não tem faz o PostgREST
  // recusar o UPDATE INTEIRO (42703) — perderíamos também o que dava pra gravar.
  // É a armadilha do `parcelas_max`, e é por isso que a régua olha a LINHA lida.
  it('ignora campo cuja coluna não veio na linha', () => {
    const semSexo = { cpf: null, data_nascimento: null };   // tabela sem coluna de sexo
    expect(patchDoCadastro(semSexo, membro, MAPA)).toEqual({
      cpf: '39053344705', data_nascimento: '1990-05-02',
    });
  });

  it('cadastro sem o dado não inventa valor', () => {
    const linha = { cpf: null, data_nascimento: null, sexo: null };
    expect(patchDoCadastro(linha, { cpf: null, data_nascimento: null, genero: null }, MAPA)).toEqual({});
  });

  it('faltaDoContrato aponta só o que a linha realmente tem vazio', () => {
    expect(faltaDoContrato({ cpf: null, data_nascimento: '1990-05-02' }, MAPA)).toEqual(['cpf']);
    expect(faltaDoContrato({ cpf: '39053344705', data_nascimento: '1990-05-02' }, MAPA)).toEqual([]);
  });
});
