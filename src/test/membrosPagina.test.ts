import { describe, it, expect } from 'vitest';
import {
  planoDaPagina, montarResposta, janelaDaFaixa, LIMITE_MAX, COLUNAS_LISTA,
} from '../../backend/utils/membrosPagina.js';

// A régua da lista paginada que o app do staff usa. O que está aqui é o que
// quebra EM SILÊNCIO: ordem invertida sem avisar, rolagem infinita que nunca
// acaba (ou que para no meio da base) e CPF vazando numa listagem.
//
// ⚠️ A régua vive fora da rota porque `routes/membresia.js` requer `multer`,
// que só é instalado no Vercel — carregar aquele arquivo aqui é impossível, e
// era por isso que ele não tinha nenhum teste.

describe('plano da página', () => {
  it('A→Z por padrão, Z→A quando pedido — é o pedido do Matheus', () => {
    expect(planoDaPagina({}).ascending).toBe(true);
    expect(planoDaPagina({ ordem: 'nome_desc' }).ascending).toBe(false);
    // Valor desconhecido não vira ordem aleatória: cai no padrão.
    expect(planoDaPagina({ ordem: 'sei_la' }).ascending).toBe(true);
  });

  it('o range é do BANCO, não recorte em memória', () => {
    expect(planoDaPagina({ limite: '30', offset: '60' }).range).toEqual([60, 89]);
    expect(planoDaPagina({}).range).toEqual([0, 29]);
  });

  it('limite tem TETO — sem ele, limite=5000 traz a base inteira de novo', () => {
    // É o problema que a paginação existe para resolver: 4.056 pessoas, >2 MB
    // de JSON por abertura de tela.
    expect(planoDaPagina({ limite: '9999' }).limite).toBe(LIMITE_MAX);
    expect(planoDaPagina({ limite: '0' }).limite).toBe(1);
    expect(planoDaPagina({ limite: '-5' }).limite).toBe(1);
    expect(planoDaPagina({ limite: 'abc' }).limite).toBe(30);
  });

  it('offset negativo não vira range invertido', () => {
    expect(planoDaPagina({ offset: '-10' }).offset).toBe(0);
  });

  it('busca por tokens acha nome do meio, em qualquer ordem', () => {
    expect(planoDaPagina({ busca: 'matheus toscano' }).tokens).toEqual(['matheus', 'toscano']);
    expect(planoDaPagina({ busca: '  ana   maria  ' }).tokens).toEqual(['ana', 'maria']);
    expect(planoDaPagina({ busca: '' }).tokens).toEqual([]);
    // Teto: cada palavra é um ILIKE no banco.
    expect(planoDaPagina({ busca: 'a b c d e f g h' }).tokens).toHaveLength(6);
  });

  it('sem_cpf aceita as formas que a tela manda', () => {
    for (const v of ['1', 'true', true]) {
      expect(planoDaPagina({ sem_cpf: v }).semCpf, String(v)).toBe(true);
    }
    expect(planoDaPagina({ sem_cpf: '0' }).semCpf).toBe(false);
    expect(planoDaPagina({}).semCpf).toBe(false);
  });
});

describe('faixa etária', () => {
  // ⚠️ `hoje` INJETADO: teste que lê o relógio da máquina apodrece — foi
  // exatamente o que deixou o CI do app do staff vermelho em 10/08.
  const HOJE = new Date(2026, 7, 10); // 10/08/2026

  it('criança é quem nasceu DEPOIS do corte de 13 anos', () => {
    expect(janelaDaFaixa('crianca', HOJE)).toEqual({ gt: '2013-08-10' });
  });

  it('as faixas se encaixam sem buraco nem sobreposição', () => {
    const ado = janelaDaFaixa('adolescente', HOJE);
    const jov = janelaDaFaixa('jovem', HOJE);
    const adu = janelaDaFaixa('adulto', HOJE);
    // O topo de uma é o piso da seguinte: ninguém fica fora de todas.
    expect(ado.lte).toBe(janelaDaFaixa('crianca', HOJE).gt);
    expect(jov.lte).toBe(ado.gt);
    expect(adu.lte).toBe(jov.gt);
  });

  it('faixa desconhecida não filtra nada (em vez de filtrar errado)', () => {
    expect(janelaDaFaixa('sei_la', HOJE)).toBeNull();
    expect(janelaDaFaixa(undefined, HOJE)).toBeNull();
  });
});

describe('resposta da lista', () => {
  it('⚠️ NÃO devolve CPF — só se ele FALTA', () => {
    // Mandar o documento de 30 pessoas para desenhar uma etiqueta é expor dado
    // sem precisar dele. O filtro de qualidade só precisa do booleano.
    const r = montarResposta(
      [{ id: '1', nome: 'Ana', cpf: '12345678901' }, { id: '2', nome: 'Bia', cpf: null }],
      { total: 2, offset: 0, limite: 30 },
    );
    expect(r.itens[0]).not.toHaveProperty('cpf');
    expect(r.itens[0].sem_cpf).toBe(false);
    expect(r.itens[1].sem_cpf).toBe(true);
    expect(r.itens[0].nome).toBe('Ana');
  });

  it('a consulta não pede a ficha inteira', () => {
    expect(COLUNAS_LISTA).not.toContain('*');
    expect(COLUNAS_LISTA).toContain('nome');
    expect(COLUNAS_LISTA).toContain('telefone');   // a tela abre o WhatsApp com ele
  });

  it('tem_mais usa o TOTAL, não o tamanho da página', () => {
    const pagina = Array.from({ length: 30 }, (_, i) => ({ id: String(i), nome: `P${i}` }));
    // Rolagem que nunca acaba (sempre true) e que para cedo (sempre false) são
    // as duas falhas, e nenhuma delas aparece em teste de tela.
    expect(montarResposta(pagina, { total: 100, offset: 0, limite: 30 }).tem_mais).toBe(true);
    expect(montarResposta(pagina, { total: 100, offset: 70, limite: 30 }).tem_mais).toBe(false);
    expect(montarResposta([], { total: 0, offset: 0, limite: 30 }).tem_mais).toBe(false);
  });

  it('total ilegível não vira rolagem infinita', () => {
    expect(montarResposta([{ id: '1', nome: 'A' }], { total: null, offset: 0, limite: 30 }).tem_mais)
      .toBe(false);
  });
});
