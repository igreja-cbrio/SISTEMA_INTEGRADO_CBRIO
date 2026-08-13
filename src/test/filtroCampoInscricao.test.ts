import { describe, it, expect } from 'vitest';
import {
  camposFiltraveis,
  aplicarFiltroCampos,
  valoresDaResposta,
  contarFiltrosAtivos,
  TIPOS_FILTRAVEIS,
  SEM_RESPOSTA,
  TODOS,
} from '../lib/filtroCampoInscricao';

// ─────────────────────────────────────────────────────────────────────────────
// Os casos vêm do Celebra 2026, medido em produção em 10/08/2026 (209 inscritos,
// campo `em_qual_ministerio_voce_serve`, tipo `escolha`, 19 opções no catálogo).
// ─────────────────────────────────────────────────────────────────────────────
const KEY = 'em_qual_ministerio_voce_serve';

const CAMPO_CELEBRA = {
  key: KEY,
  tipo: 'escolha',
  label: 'Em qual ministério você serve?',
  obrigatorio: true,
  // recorte real do catálogo, incluindo o valor com DOIS espaços
  opcoes: ['Kids', 'Recepção - Integração', 'Check-in  - Voluntariado', 'Cuidados', 'Next'],
};

const INSCRITOS = [
  { id: '1', nome_completo: 'Ana', dados: { [KEY]: 'Kids' } },
  { id: '2', nome_completo: 'Bruno', dados: { [KEY]: 'Kids' } },
  { id: '3', nome_completo: 'Carla', dados: { [KEY]: 'Recepção - Integração' } },
  { id: '4', nome_completo: 'Davi', dados: { [KEY]: 'Check-in  - Voluntariado' } },
  // valor RESPONDIDO que NÃO está no catálogo (caso real: 1 pessoa)
  { id: '5', nome_completo: 'Elis', dados: { [KEY]: 'Cuidados - Bazar' } },
  // sem resposta, apesar de o campo ser obrigatório (caso real: 1 pessoa)
  { id: '6', nome_completo: 'Fábio', dados: {} },
];

describe('camposFiltraveis · o que pode virar filtro', () => {
  it('só campos de conjunto fechado (select/escolha/multi)', () => {
    expect([...TIPOS_FILTRAVEIS].sort()).toEqual(['escolha', 'multi', 'select']);
    const campos = [
      CAMPO_CELEBRA,
      { key: 'c_obs', tipo: 'textarea', label: 'Observação' },
      { key: 'c_nasc', tipo: 'data', label: 'Data' },
      { key: 'c_foto', tipo: 'imagem', label: 'Foto' },
    ];
    const r = camposFiltraveis(campos, INSCRITOS);
    expect(r.map(c => c.key)).toEqual([KEY]);
  });

  it('⚠️ texto livre NÃO vira filtro: seria um dropdown com 1 opção por pessoa', () => {
    const inscritos = Array.from({ length: 50 }, (_, i) => ({ dados: { c_obs: `resposta ${i}` } }));
    expect(camposFiltraveis([{ key: 'c_obs', tipo: 'texto', label: 'Obs' }], inscritos)).toEqual([]);
  });

  it('evento sem campo extra não oferece filtro nenhum', () => {
    expect(camposFiltraveis([], INSCRITOS)).toEqual([]);
    expect(camposFiltraveis(null as any, INSCRITOS)).toEqual([]);
  });
});

describe('opções do filtro · catálogo ∪ respondido', () => {
  const [campo] = camposFiltraveis([CAMPO_CELEBRA], INSCRITOS);

  it('⚠️ MUTATION-TEST: valor respondido fora do catálogo APARECE', () => {
    // Se alguém "simplificar" pra usar só `campos[].opcoes`, a Elis fica
    // inalcançável por qualquer filtro e desaparece da tela em silêncio.
    const bazar = campo.opcoes.find(o => o.valor === 'Cuidados - Bazar');
    expect(bazar).toBeDefined();
    expect(bazar!.total).toBe(1);
    expect(bazar!.foraDoCatalogo).toBe(true);
  });

  it('o fora-do-catálogo vai pro FIM, não no meio do catálogo', () => {
    const idxBazar = campo.opcoes.findIndex(o => o.valor === 'Cuidados - Bazar');
    expect(idxBazar).toBe(campo.opcoes.length - 1);
  });

  it('mantém a ordem do formulário (é escolha de quem montou o evento)', () => {
    expect(campo.opcoes.slice(0, 5).map(o => o.valor)).toEqual(CAMPO_CELEBRA.opcoes);
  });

  it('opção do catálogo que ninguém escolheu aparece com total 0', () => {
    expect(campo.opcoes.find(o => o.valor === 'Next')!.total).toBe(0);
  });

  it('conta o "sem resposta" separado', () => {
    expect(campo.semResposta).toBe(1);
  });

  it('a soma das opções + sem resposta fecha o total de inscritos', () => {
    const soma = campo.opcoes.reduce((s, o) => s + o.total, 0) + campo.semResposta;
    expect(soma).toBe(INSCRITOS.length);
  });
});

describe('⚠️ espaço duplo · exibir normalizado, comparar CRU', () => {
  const [campo] = camposFiltraveis([CAMPO_CELEBRA], INSCRITOS);
  const opc = campo.opcoes.find(o => o.valor === 'Check-in  - Voluntariado')!;

  it('o rótulo colapsa o espaço duplo', () => {
    expect(opc.rotulo).toBe('Check-in - Voluntariado');
  });

  it('MUTATION-TEST: filtrar usa o valor CRU, não o rótulo', () => {
    // Filtrar pelo rótulo normalizado devolveria ZERO — o dado tem 2 espaços.
    expect(aplicarFiltroCampos(INSCRITOS, { [KEY]: opc.valor }).map(i => i.id)).toEqual(['4']);
    expect(aplicarFiltroCampos(INSCRITOS, { [KEY]: opc.rotulo })).toEqual([]);
  });
});

describe('aplicarFiltroCampos', () => {
  it('sem filtro devolve todo mundo', () => {
    expect(aplicarFiltroCampos(INSCRITOS, {})).toHaveLength(6);
    expect(aplicarFiltroCampos(INSCRITOS, { [KEY]: TODOS })).toHaveLength(6);
  });

  it('filtra pelo ministério escolhido', () => {
    expect(aplicarFiltroCampos(INSCRITOS, { [KEY]: 'Kids' }).map(i => i.id)).toEqual(['1', '2']);
  });

  it('"sem resposta" acha exatamente quem não respondeu', () => {
    expect(aplicarFiltroCampos(INSCRITOS, { [KEY]: SEM_RESPOSTA }).map(i => i.id)).toEqual(['6']);
  });

  it('não confunde resposta vazia com resposta ausente', () => {
    const lista = [{ id: 'a', dados: { [KEY]: '   ' } }, { id: 'b', dados: { [KEY]: 'Kids' } }];
    expect(aplicarFiltroCampos(lista, { [KEY]: SEM_RESPOSTA }).map(i => i.id)).toEqual(['a']);
  });

  it('campo `multi`: casa se a pessoa marcou a opção entre várias', () => {
    const lista = [
      { id: 'a', dados: { c_dias: ['Sábado', 'Domingo'] } },
      { id: 'b', dados: { c_dias: ['Domingo'] } },
      { id: 'c', dados: { c_dias: [] } },
    ];
    expect(aplicarFiltroCampos(lista, { c_dias: 'Sábado' }).map(i => i.id)).toEqual(['a']);
    expect(aplicarFiltroCampos(lista, { c_dias: 'Domingo' }).map(i => i.id)).toEqual(['a', 'b']);
    expect(aplicarFiltroCampos(lista, { c_dias: SEM_RESPOSTA }).map(i => i.id)).toEqual(['c']);
  });

  it('`multi`: a pessoa conta em CADA opção que marcou, e o total pode passar do nº de gente', () => {
    const lista = [{ dados: { c_dias: ['Sábado', 'Domingo'] } }];
    const [campo] = camposFiltraveis([{ key: 'c_dias', tipo: 'multi', label: 'Dias', opcoes: ['Sábado', 'Domingo'] }], lista);
    expect(campo.opcoes.map(o => o.total)).toEqual([1, 1]); // 2 marcações, 1 pessoa
  });

  it('dois campos combinam em E, não em OU', () => {
    const lista = [
      { id: 'a', dados: { m: 'Kids', t: 'Manhã' } },
      { id: 'b', dados: { m: 'Kids', t: 'Noite' } },
      { id: 'c', dados: { m: 'Next', t: 'Manhã' } },
    ];
    expect(aplicarFiltroCampos(lista, { m: 'Kids', t: 'Manhã' }).map(i => i.id)).toEqual(['a']);
  });

  it('valor que ninguém tem devolve lista vazia (a tela diz "nenhum bate")', () => {
    expect(aplicarFiltroCampos(INSCRITOS, { [KEY]: 'Louvor / Coral' })).toEqual([]);
  });
});

describe('valoresDaResposta · normalização de entrada', () => {
  it('trata escalar, array, nulo e vazio', () => {
    expect(valoresDaResposta({ k: 'A' }, 'k')).toEqual(['A']);
    expect(valoresDaResposta({ k: ['A', 'B'] }, 'k')).toEqual(['A', 'B']);
    expect(valoresDaResposta({ k: null }, 'k')).toEqual([]);
    expect(valoresDaResposta({ k: '' }, 'k')).toEqual([]);
    expect(valoresDaResposta({}, 'k')).toEqual([]);
    expect(valoresDaResposta(null, 'k')).toEqual([]);
  });

  it('número respondido não vira NaN nem some', () => {
    expect(valoresDaResposta({ k: 0 }, 'k')).toEqual(['0']);
  });

  it('objeto aninhado (upload de imagem) é ignorado em vez de virar "[object Object]"', () => {
    expect(valoresDaResposta({ k: { url: 'x' } }, 'k')).toEqual([]);
  });
});

describe('contarFiltrosAtivos', () => {
  it('conta só o que filtra de verdade', () => {
    expect(contarFiltrosAtivos({})).toBe(0);
    expect(contarFiltrosAtivos({ a: TODOS })).toBe(0);
    expect(contarFiltrosAtivos({ a: 'Kids', b: TODOS })).toBe(1);
    expect(contarFiltrosAtivos({ a: 'Kids', b: SEM_RESPOSTA })).toBe(2);
  });
});
