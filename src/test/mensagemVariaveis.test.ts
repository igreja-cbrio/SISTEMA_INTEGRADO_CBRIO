// Contrato das variáveis das mensagens prontas do inbox ("/" + {{primeiro_nome}}).
// Roda no `npm test` (gate de deploy). Sem rede, sem relógio, sem DOM.
import { describe, it, expect } from 'vitest';
import {
  VARIAVEIS, preencherVariaveis, variaveisPendentes, comandoBarra, filtrarProntas, primeiroNome,
} from '../lib/mensagemVariaveis';

const CTX = {
  nome: 'Maria da Silva', telefone: '(21) 99999-9999', protocolo: 'CB-000123',
  area: 'Grupos', atendente: 'Marcos Paulo de Almeida', grupo: 'Barra Jovens',
};

describe('mensagemVariaveis · preencherVariaveis', () => {
  it('preenche todas as variáveis conhecidas com o contexto da conversa', () => {
    const r = preencherVariaveis(
      'Oi {{primeiro_nome}}! Aqui é {{atendente}}, de {{area}}. Seu protocolo é {{protocolo}}. Grupo: {{grupo}} · {{nome}} · {{telefone}}',
      CTX,
    );
    expect(r.texto).toBe('Oi Maria! Aqui é Marcos, de Grupos. Seu protocolo é CB-000123. Grupo: Barra Jovens · Maria da Silva · (21) 99999-9999');
    expect(r.faltando).toEqual([]);
    expect(r.desconhecidas).toEqual([]);
  });

  it('aceita espaço dentro das chaves ("{{ primeiro_nome }}")', () => {
    expect(preencherVariaveis('Oi {{ primeiro_nome }}', CTX).texto).toBe('Oi Maria');
  });

  // ⚠️ A guarda central: sem valor, a variável FICA ESCRITA (não vira vazio) e é
  // declarada — é o que permite bloquear o envio em vez de mandar "Oi, ".
  it('variável sem valor fica escrita no texto e volta em `faltando`', () => {
    const r = preencherVariaveis('Oi {{primeiro_nome}}, seu grupo é {{grupo}}.', { nome: 'Ana' });
    expect(r.texto).toBe('Oi Ana, seu grupo é {{grupo}}.');
    expect(r.faltando).toEqual(['grupo']);
  });

  it('variável desconhecida fica escrita e volta em `desconhecidas` (não em faltando)', () => {
    const r = preencherVariaveis('Olá {{primeiro_nome}} {{sobrenome}}', CTX);
    expect(r.texto).toBe('Olá Maria {{sobrenome}}');
    expect(r.desconhecidas).toEqual(['sobrenome']);
    expect(r.faltando).toEqual([]);
  });

  it('não repete a mesma chave nas listas', () => {
    const r = preencherVariaveis('{{grupo}} {{grupo}} {{x}} {{x}}', {});
    expect(r.faltando).toEqual(['grupo']);
    expect(r.desconhecidas).toEqual(['x']);
  });

  it('texto sem variável volta idêntico, e contexto vazio deixa tudo em faltando', () => {
    expect(preencherVariaveis('Boa noite!', CTX).texto).toBe('Boa noite!');
    const r = preencherVariaveis('{{primeiro_nome}} {{nome}} {{telefone}} {{protocolo}} {{area}} {{atendente}} {{grupo}}');
    expect(r.faltando).toEqual(['primeiro_nome', 'nome', 'telefone', 'protocolo', 'area', 'atendente', 'grupo']);
  });

  it('primeiro nome: espaços sobrando e nome de um token só', () => {
    expect(primeiroNome('  Ana   Paula ')).toBe('Ana');
    expect(primeiroNome('Ana')).toBe('Ana');
    expect(primeiroNome(null)).toBe('');
  });

  // Mutante: entrada nova no catálogo sem o `case` correspondente em valorDe
  // deixaria uma variável "oficial" que nunca preenche.
  it('TODA variável do catálogo é preenchível com um contexto completo', () => {
    for (const v of VARIAVEIS) {
      const r = preencherVariaveis(`{{${v.chave}}}`, CTX);
      expect(r.faltando, v.chave).toEqual([]);
      expect(r.texto, v.chave).not.toContain('{{');
    }
  });
});

describe('mensagemVariaveis · variaveisPendentes', () => {
  it('lista o que ainda está por preencher, na ordem e sem repetir', () => {
    expect(variaveisPendentes('Oi {{primeiro_nome}}, {{grupo}} e {{primeiro_nome}}')).toEqual(['primeiro_nome', 'grupo']);
    expect(variaveisPendentes('Oi Maria')).toEqual([]);
    expect(variaveisPendentes('')).toEqual([]);
  });
});

describe('mensagemVariaveis · comandoBarra', () => {
  it('"/" sozinho abre as prontas sem filtro', () => {
    expect(comandoBarra('/')).toEqual({ ativo: true, filtro: '' });
  });
  it('"/next" abre filtrando por "next" (espaço à esquerda é tolerado)', () => {
    expect(comandoBarra('/next')).toEqual({ ativo: true, filtro: 'next' });
    expect(comandoBarra('  /conv')).toEqual({ ativo: true, filtro: 'conv' });
  });
  it('barra com espaço depois, barra no meio ou texto comum NÃO é comando', () => {
    expect(comandoBarra('/ boa noite').ativo).toBe(false);
    expect(comandoBarra('/next ').ativo).toBe(false);
    expect(comandoBarra('preço/dia').ativo).toBe(false);
    expect(comandoBarra('Boa noite').ativo).toBe(false);
    expect(comandoBarra('').ativo).toBe(false);
  });
});

describe('mensagemVariaveis · filtrarProntas', () => {
  const prontas = [
    { id: '1', titulo: 'Convite do Next', texto: 'Oi {{primeiro_nome}}, vem pro Next!' },
    { id: '2', titulo: 'Boas-vindas', texto: 'Seja bem-vindo à CBRio 🙏' },
    { id: '3', titulo: 'Endereço', texto: 'Ficamos na Barra da Tijuca' },
  ];
  it('filtro vazio devolve todas', () => {
    expect(filtrarProntas(prontas, '')).toBe(prontas);
    expect(filtrarProntas(prontas, '   ')).toBe(prontas);
  });
  it('casa pelo título sem acento e sem caixa', () => {
    expect(filtrarProntas(prontas, 'endereco').map(p => p.id)).toEqual(['3']);
    expect(filtrarProntas(prontas, 'NEXT').map(p => p.id)).toEqual(['1']);
  });
  it('casa também pelo texto', () => {
    expect(filtrarProntas(prontas, 'tijuca').map(p => p.id)).toEqual(['3']);
    expect(filtrarProntas(prontas, 'cbrio').map(p => p.id)).toEqual(['2']);
  });
  it('sem casamento devolve lista vazia', () => {
    expect(filtrarProntas(prontas, 'xyz')).toEqual([]);
  });
});
