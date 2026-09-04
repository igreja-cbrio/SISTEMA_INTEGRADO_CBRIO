// Régua PURA da elegibilidade por TIPO DE CULTO
// (backend/utils/elegibilidadeVol.js · 04/09/2026).
//
// O pedido do Marcos: "pessoas podem querer apenas servir no time da banda
// quarta-feira, mas não quererem ou poderem ser escalados no domingo".
//
// ⚠️⚠️ FAIL-OPEN é a invariante, e o motivo é o modo de falha: um falso negativo
// faz a pessoa DESAPARECER da lista de quem pode ser escalado, sem erro e sem
// aviso. O supervisor não procura quem ele não sabe que faltou — escala outra ou
// deixa a vaga aberta.
//
// Mutantes travados:
// 1. NULL deixando de significar "todos" → os 1.050 vínculos atuais somem de
//    toda escala de uma vez.
// 2. Array VAZIO virando "nenhum" → esvaziar na tela apaga a pessoa em silêncio.
// 3. `pessoaServeNoTipo` com `every` em vez de `some` → quem toca baixo só na
//    quarta e canta no domingo (2 vínculos, listas diferentes) é excluída do
//    domingo, justamente a pessoa mais versátil da equipe.
// 4. `normalizarEscolha` gravando a lista inteira quando tudo está marcado →
//    a pessoa fica congelada nos tipos de hoje e sai de fora do próximo culto
//    que a igreja criar.
import { describe, it, expect } from 'vitest';
import { podeServirNoTipo, pessoaServeNoTipo, normalizarEscolha } from '../../backend/utils/elegibilidadeVol';

const QUARTA = 'tipo-quarta';
const DOMINGO = 'tipo-domingo-0930';

describe('podeServirNoTipo · fail-open', () => {
  it('NULL = serve todos (o estado dos 1.050 vínculos atuais)', () => {
    expect(podeServirNoTipo({ service_type_ids: null }, DOMINGO)).toBe(true);
    expect(podeServirNoTipo({}, DOMINGO)).toBe(true);
  });

  it('⚠️ array VAZIO também serve — esvaziar não apaga a pessoa', () => {
    expect(podeServirNoTipo({ service_type_ids: [] }, DOMINGO)).toBe(true);
  });

  it('vínculo ausente serve', () => {
    expect(podeServirNoTipo(null, DOMINGO)).toBe(true);
  });

  it('culto sem tipo resolvível serve (não há como decidir)', () => {
    expect(podeServirNoTipo({ service_type_ids: [QUARTA] }, null)).toBe(true);
    expect(podeServirNoTipo({ service_type_ids: [QUARTA] }, undefined)).toBe(true);
  });

  it('valor que não é array serve', () => {
    // Dado torto vindo do banco (string em vez de array) não pode apagar ninguém.
    expect(podeServirNoTipo({ service_type_ids: 'quarta' as any }, DOMINGO)).toBe(true);
  });
});

describe('podeServirNoTipo · a restrição de verdade', () => {
  it('só a quarta: serve na quarta, NÃO serve no domingo', () => {
    const so = { service_type_ids: [QUARTA] };
    expect(podeServirNoTipo(so, QUARTA)).toBe(true);
    expect(podeServirNoTipo(so, DOMINGO)).toBe(false);
  });

  it('lista com vários casa qualquer um deles', () => {
    const dois = { service_type_ids: [QUARTA, DOMINGO] };
    expect(podeServirNoTipo(dois, QUARTA)).toBe(true);
    expect(podeServirNoTipo(dois, DOMINGO)).toBe(true);
    expect(podeServirNoTipo(dois, 'tipo-ami')).toBe(false);
  });

  it('id órfão na lista não casa nada, e não explode', () => {
    expect(podeServirNoTipo({ service_type_ids: ['tipo-que-nao-existe'] }, DOMINGO)).toBe(false);
  });

  it('null dentro da lista é ignorado', () => {
    expect(podeServirNoTipo({ service_type_ids: [null, QUARTA] as any }, QUARTA)).toBe(true);
    expect(podeServirNoTipo({ service_type_ids: [null] as any }, QUARTA)).toBe(false);
  });
});

describe('pessoaServeNoTipo · `some`, não `every`', () => {
  it('⚠️ baixo só na quarta + vocal no domingo ⇒ serve no domingo', () => {
    const vinculos = [
      { service_type_ids: [QUARTA] },      // baixo, só quarta
      { service_type_ids: [DOMINGO] },     // vocal, só domingo
    ];
    expect(pessoaServeNoTipo(vinculos, DOMINGO)).toBe(true);
    expect(pessoaServeNoTipo(vinculos, QUARTA)).toBe(true);
  });

  it('todos os vínculos restritos a outro tipo ⇒ NÃO serve', () => {
    expect(pessoaServeNoTipo([{ service_type_ids: [QUARTA] }], DOMINGO)).toBe(false);
  });

  it('um vínculo sem restrição basta', () => {
    expect(pessoaServeNoTipo([{ service_type_ids: [QUARTA] }, { service_type_ids: null }], DOMINGO)).toBe(true);
  });

  it('sem vínculo nenhum ⇒ serve (é assunto de outra régua)', () => {
    expect(pessoaServeNoTipo([], DOMINGO)).toBe(true);
    expect(pessoaServeNoTipo(null as any, DOMINGO)).toBe(true);
  });
});

describe('normalizarEscolha · o que GRAVAR', () => {
  const catalogo = [QUARTA, DOMINGO, 'tipo-ami'];

  it('⚠️ tudo marcado grava NULL, não a lista — senão a pessoa fica de fora do próximo culto criado', () => {
    expect(normalizarEscolha([QUARTA, DOMINGO, 'tipo-ami'], catalogo)).toBeNull();
  });

  it('nada marcado grava NULL (= todos), nunca vazio', () => {
    expect(normalizarEscolha([], catalogo)).toBeNull();
  });

  it('escolha parcial grava a lista, sem duplicata', () => {
    expect(normalizarEscolha([QUARTA, QUARTA], catalogo)).toEqual([QUARTA]);
  });

  it('catálogo vazio não transforma escolha parcial em NULL', () => {
    expect(normalizarEscolha([QUARTA], [])).toEqual([QUARTA]);
  });

  it('tolera entradas nulas', () => {
    expect(normalizarEscolha(null as any, catalogo)).toBeNull();
    expect(normalizarEscolha([QUARTA], null as any)).toEqual([QUARTA]);
  });
});
