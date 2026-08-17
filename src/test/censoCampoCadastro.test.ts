// Contrato de `backend/utils/censoCampoCadastro`.
//
// Por que este teste existe: em 17/08/2026 as 12 respostas do Censo CBRio 2026
// estavam há dias sem aplicar NADA no cadastro. A causa não era o vínculo (as 12
// estavam ligadas à pessoa por CPF) — era o rótulo "Solteiro(a)" batendo no
// CHECK de `mem_membros.estado_civil`, que só aceita
// ('solteiro','casado','divorciado','viuvo','uniao_estavel'). Como o
// reconciliador grava tudo num UPDATE só, o rótulo inválido levava embora bairro,
// cidade e telefone do mesmo passe.
//
// Os casos abaixo usam as OPÇÕES REAIS do questionário vivo e os VALORES REAIS
// da coluna (medidos: casado 99 · solteiro 20 · divorciado 18 · uniao_estavel 8 ·
// viuvo 2). Mutation-testado:
//   · devolver o rótulo cru quando não reconhece  → 3 vermelhos
//   · aceitar array de múltipla escolha           → 1 vermelho
//   · aceitar CEP com menos de 8 dígitos          → 2 vermelhos
import { describe, it, expect } from 'vitest';
import {
  traduzirParaCadastro, ehCampoDeCadastro, destinosParaUI, CAMPOS_CADASTRO,
} from '../../backend/utils/censoCampoCadastro.js';
import { DESTINO_CADASTRO_LABEL } from '../lib/censoDestinos';

const VOCAB_ESTADO_CIVIL = ['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel'];

describe('estado civil · rótulo do formulário → vocabulário do CHECK', () => {
  // As 5 opções exatas da pergunta viva `estado_civil`.
  const REAIS: Array<[string, string]> = [
    ['Solteiro(a)', 'solteiro'],
    ['Casado(a)', 'casado'],
    ['União estável', 'uniao_estavel'],
    ['Divorciado(a)', 'divorciado'],
    ['Viúvo(a)', 'viuvo'],
  ];

  it.each(REAIS)('%s → %s', (rotulo, esperado) => {
    expect(traduzirParaCadastro('estado_civil', rotulo)).toEqual({ ok: true, valor: esperado });
  });

  it('toda tradução cai no vocabulário que o CHECK do banco aceita', () => {
    for (const [rotulo] of REAIS) {
      const r = traduzirParaCadastro('estado_civil', rotulo);
      expect(r.ok).toBe(true);
      expect(VOCAB_ESTADO_CIVIL).toContain((r as { valor: string }).valor);
    }
  });

  it('valor que JÁ está canônico passa igual (idempotente)', () => {
    // O censo pode reenviar o que o cadastro já tem; isto é o que faz a
    // comparação dar "igual" em vez de conflito falso.
    for (const v of VOCAB_ESTADO_CIVIL) {
      expect(traduzirParaCadastro('estado_civil', v)).toEqual({ ok: true, valor: v });
    }
  });

  it('rótulo desconhecido NÃO é gravado cru', () => {
    // Se um dia alguém criar a opção "Noivo(a)", o certo é o campo ficar vazio e
    // declarado — nunca "Noivo(a)" na coluna (o UPDATE inteiro morreria com
    // 23514 e levaria os outros campos com ele).
    expect(traduzirParaCadastro('estado_civil', 'Noivo(a)')).toEqual({
      ok: false, motivo: 'nao_reconhecido',
    });
  });

  it('ignora caixa, acento e espaço', () => {
    expect(traduzirParaCadastro('estado_civil', '  UNIAO ESTAVEL ')).toEqual({ ok: true, valor: 'uniao_estavel' });
    expect(traduzirParaCadastro('estado_civil', 'viúvo')).toEqual({ ok: true, valor: 'viuvo' });
  });
});

describe('escolaridade · coluna nova, sem CHECK', () => {
  // As 4 opções exatas da pergunta viva `p13_escolaridade`.
  it.each([
    ['Ensino Fundamental', 'fundamental'],
    ['Ensino Médio', 'medio'],
    ['Superior', 'superior'],
    ['Pós graduação', 'pos_graduacao'],
  ])('%s → %s', (rotulo, esperado) => {
    expect(traduzirParaCadastro('escolaridade', rotulo)).toEqual({ ok: true, valor: esperado });
  });

  it('opção nova não se perde: cai no slug', () => {
    // Diferente do estado civil: aqui a coluna não tem CHECK, então guardar
    // `mestrado` é melhor que descartar. É o que permite o Matheus acrescentar
    // opção no construtor sem passar por mim.
    expect(traduzirParaCadastro('escolaridade', 'Mestrado')).toEqual({ ok: true, valor: 'mestrado' });
    expect(traduzirParaCadastro('escolaridade', 'Curso livre X')).toEqual({ ok: true, valor: 'curso_livre_x' });
  });
});

describe('sexo · o CHECK do banco manda', () => {
  it('traduz o que a porta de pessoa oferece', () => {
    expect(traduzirParaCadastro('genero', 'Masculino')).toEqual({ ok: true, valor: 'masculino' });
    expect(traduzirParaCadastro('genero', 'feminino')).toEqual({ ok: true, valor: 'feminino' });
  });

  it('"Outro" NÃO entra', () => {
    // Passa no CHECK do banco, mas o Contrato de Inscrição proíbe em porta de
    // pessoa. Melhor vazio e declarado que sexo que nenhuma régua do sistema lê.
    expect(traduzirParaCadastro('genero', 'Outro').ok).toBe(false);
  });
});

describe('CEP', () => {
  it('grava só dígitos', () => {
    expect(traduzirParaCadastro('cep', '22640-100')).toEqual({ ok: true, valor: '22640100' });
  });

  it('recusa CEP incompleto', () => {
    // CEP pela metade quebra o autopreenchimento de endereço em silêncio.
    expect(traduzirParaCadastro('cep', '2264')).toEqual({ ok: false, motivo: 'cep_invalido' });
    expect(traduzirParaCadastro('cep', '226401000')).toEqual({ ok: false, motivo: 'cep_invalido' });
  });
});

describe('guardas gerais', () => {
  it('campo fora do catálogo é recusado', () => {
    // `preenche_de` é texto livre no questionário: um destino inventado não pode
    // virar coluna inventada no UPDATE (42703 derrubaria o passe inteiro).
    expect(traduzirParaCadastro('grupo', 'Grupo Barra')).toEqual({ ok: false, motivo: 'campo_desconhecido' });
    expect(traduzirParaCadastro('status', 'membro_ativo')).toEqual({ ok: false, motivo: 'campo_desconhecido' });
    expect(ehCampoDeCadastro('escolaridade')).toBe(true);
    expect(ehCampoDeCadastro('ministerio')).toBe(false);
  });

  it('múltipla escolha (array) nunca vira valor de coluna', () => {
    expect(traduzirParaCadastro('escolaridade', ['Superior', 'Mestrado']).ok).toBe(false);
    expect(traduzirParaCadastro('bairro', ['Barra', 'Recreio']).ok).toBe(false);
  });

  it('vazio é "não informou", não erro', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(traduzirParaCadastro('bairro', v as unknown as string)).toEqual({ ok: false, motivo: 'vazio' });
    }
  });

  it('campo de texto guarda o que a pessoa escreveu, só sem as pontas', () => {
    expect(traduzirParaCadastro('bairro', '  Barra Olímpica ')).toEqual({ ok: true, valor: 'Barra Olímpica' });
    expect(traduzirParaCadastro('profissao', 'Sommelier')).toEqual({ ok: true, valor: 'Sommelier' });
  });

  it('todo destino do catálogo aparece na UI do construtor', () => {
    // Destino que existe no backend e não aparece na tela é destino que ninguém
    // configura — foi o que deixou CEP e Escolaridade fora do cadastro.
    const naUI = destinosParaUI().map((d) => d.campo).sort();
    expect(naUI).toEqual(Object.keys(CAMPOS_CADASTRO).sort());
    for (const d of destinosParaUI()) expect(d.label.length).toBeGreaterThan(1);
  });

  it('o espelho do front bate com o catálogo do backend', () => {
    // O construtor lê a lista de `src/lib/censoDestinos.ts`; o servidor valida
    // contra este catálogo. Se divergirem, a tela oferece destino que o POST
    // recusa (ou esconde um que funciona).
    expect(Object.keys(DESTINO_CADASTRO_LABEL).sort()).toEqual(Object.keys(CAMPOS_CADASTRO).sort());
    for (const [campo, label] of Object.entries(DESTINO_CADASTRO_LABEL)) {
      expect(label).toBe((CAMPOS_CADASTRO as Record<string, { label: string }>)[campo].label);
    }
  });
});
