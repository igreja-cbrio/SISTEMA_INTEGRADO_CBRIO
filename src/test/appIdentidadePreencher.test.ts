import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// ⚠️⚠️ ESTE TESTE EXISTE POR UM LOOP INFINITO REAL (10/08/2026), o TERCEIRO
// relato do mesmo sintoma por causa diferente: "preencho o cadastro e volta pra
// mesma tela; não consigo entrar no app".
//
// A causa: `acharOuCriarGuardado` resolve IDENTIDADE, não preenche cadastro.
// Quando ele ACHA a pessoa, tudo que ela digitou serve só para casar e é
// DESCARTADO. Só o `genero` tinha um UPDATE de resgate — e o portão do app
// cobra CINCO campos. Medido em produção: uma pessoa viu a tela 9 vezes e
// confirmou 3, com `data_nascimento` NULL o tempo todo. A cada envio: campo
// validado, endpoint respondendo ok, e o portão dizendo `falta: ['nascimento']`.
//
// O que este teste vigia é a CLASSE, não a instância: todo campo que o portão
// cobra e que o formulário coleta tem de ser GRAVADO quando está vazio. Foi
// exatamente por tratar só a instância (o `genero`, em 06/08) que o loop voltou.

const req = createRequire(import.meta.url);

type Linha = Record<string, unknown>;
let cadastro: Linha;
let patchesAplicados: Linha[] = [];

req('../../backend/utils/supabase.js').supabase = {
  from(tabela: string) {
    const q: Record<string, unknown> = {};
    let patch: Linha | null = null;
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) q[m] = () => q;
    q.update = (p: Linha) => { patch = p; return q; };
    q.maybeSingle = () => Promise.resolve({ data: cadastro, error: null });
    // O update do supabase-js resolve como thenable quando não há .select().
    q.then = (ok: (r: unknown) => unknown) => {
      if (patch && tabela === 'mem_membros') {
        patchesAplicados.push(patch);
        Object.assign(cadastro, patch);
      }
      return Promise.resolve(ok({ data: null, error: null }));
    };
    return q;
  },
};

const { preencherOQuePortaoExige } = req('../../backend/services/appIdentidade.js');

/** Os campos que `/identidade/status` cobra (a lista do `falta`). */
const COBRADOS = ['telefone', 'data_nascimento', 'genero'] as const;

const digitado = {
  nomeCompleto: 'Milton Toscano',
  telefone: '21981135265',
  dataNascimento: '1958-03-14',
  sexo: 'masculino',
  cpf: '02504029713',
};

describe('preencher o que o portão exige', () => {
  beforeEach(() => { patchesAplicados = []; });

  // ⚠️ Um caso por campo, gerado da LISTA: campo novo no portão sem resgate aqui
  // reprova sozinho, em vez de esperar alguém lembrar de escrever o teste.
  for (const campo of COBRADOS) {
    it(`grava ${campo} quando está vazio — senão o portão rebate para sempre`, async () => {
      cadastro = {
        nome: 'Milton Toscano', telefone: '21981135265',
        cpf: '02504029713', data_nascimento: '1958-03-14', genero: 'masculino',
      };
      cadastro[campo] = null;   // o único campo faltando

      await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');

      expect(cadastro[campo], `${campo} continuou vazio`).toBeTruthy();
    });
  }

  it('⚠️ o caso REAL medido: só o nascimento faltando', async () => {
    cadastro = {
      nome: 'Milton Toscano', telefone: '21981135265',
      cpf: '02504029713', data_nascimento: null, genero: 'masculino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');
    expect(cadastro.data_nascimento).toBe('1958-03-14');
    // Um patch só, com um campo só: não reescreve o que já estava certo.
    expect(patchesAplicados).toEqual([{ data_nascimento: '1958-03-14' }]);
  });

  it('NÃO sobrescreve o que a equipe já corrigiu à mão', async () => {
    cadastro = {
      nome: 'Milton Toscano Filho', telefone: '2199999999',
      cpf: '02504029713', data_nascimento: '1958-03-14', genero: 'feminino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');
    expect(patchesAplicados).toEqual([]);          // nada a fazer
    expect(cadastro.genero).toBe('feminino');      // a correção da equipe fica
    expect(cadastro.telefone).toBe('2199999999');
  });

  it('troca nome derivado de e-mail por nome de gente', async () => {
    // Nome fraco não é AUSÊNCIA — é qualidade, e o portão o reprova. Sem esta
    // troca, quem entrou com login social ficaria no mesmo loco por outro campo.
    cadastro = {
      nome: 'milton.toscano', telefone: '21981135265',
      cpf: '02504029713', data_nascimento: '1958-03-14', genero: 'masculino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton.toscano@exemplo.com');
    expect(cadastro.nome).toBe('Milton Toscano');
  });

  it('⚠️ NUNCA grava CPF — é a chave forte e tem serviço próprio', async () => {
    // Gravar CPF aqui poderia colidir com outro cadastro (UNIQUE) ou grudar dois
    // documentos na mesma pessoa, sem passar pela fila de conflito.
    cadastro = {
      nome: 'Milton Toscano', telefone: '21981135265',
      cpf: null, data_nascimento: '1958-03-14', genero: 'masculino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');
    expect(cadastro.cpf).toBeNull();
    expect(patchesAplicados).toEqual([]);
  });

  it('cadastro ilegível não derruba o fluxo', async () => {
    cadastro = null as unknown as Linha;
    await expect(preencherOQuePortaoExige('m1', digitado, 'x@y.com')).resolves.toBeUndefined();
  });
});
