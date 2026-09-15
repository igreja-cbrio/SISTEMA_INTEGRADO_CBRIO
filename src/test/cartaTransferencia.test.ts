import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda das DUAS listas em que esquecer a coluna nova custa caro — e custa em
 * SILÊNCIO, que é o critério da casa para uma guarda existir.
 *
 * O contexto: o formulário público "Seja membro" passou a perguntar, no fim,
 * se a pessoa vem de outra igreja e se traz carta de transferência
 * (Pr. Nélio · 15/09/2026 · migration `20260915120000`).
 *
 * ⚠️⚠️ LISTA 1 · `COLUNAS_OPCIONAIS` em `routes/publicMembresia.js`
 * O PostgREST recusa a query INTEIRA quando uma coluna não existe (42703), e
 * por isso o INSERT do cadastro tem um fallback que repete SEM as colunas que
 * dependem de migration. Coluna nova fora dessa lista faz a primeira tentativa
 * falhar e a RETENTATIVA falhar de novo, pelo mesmo motivo — e aí a pessoa
 * recebe "Não foi possível registrar seu cadastro". Perde-se a submissão
 * inteira por causa de um campo opcional, que é exatamente o desastre que o
 * fallback existe para impedir (lição do `parcelas_max`).
 *
 * ⚠️⚠️ LISTA 2 · `cadFields` em `routes/membresia.js`
 * É a lista que a aprovação propaga do cadastro pendente para `mem_membros`.
 * Fora dela, a resposta fica presa na fila e **some da ficha da pessoa** no
 * instante em que o cadastro é aprovado — sem erro nenhum, porque ninguém
 * pediu aquela coluna. A igreja teria perguntado de onde a pessoa vem para
 * descartar a resposta na aprovação.
 *
 * Nenhuma das duas falhas quebra build, aparece em log ou levanta exceção.
 */

const ARQ_PUBLICO = resolve(__dirname, '../../backend/routes/publicMembresia.js');
const ARQ_MEMBRESIA = resolve(__dirname, '../../backend/routes/membresia.js');

/**
 * ⚠️ COMENTÁRIO SAI ANTES DE CASAR. Os dois arquivos EXPLICAM as colunas novas
 * em comentário, e sem remover o texto a explicação vira a evidência: o teste
 * passaria com a coluna ausente das listas (armadilha de 06/08/2026).
 *
 * ⚠️ Bloco `/* *\/` só é removido quando abre e fecha na MESMA linha — o regex
 * multilinha come trecho de código quando encontra um `/*` literal dentro de
 * uma string (armadilha de 02/09/2026).
 *
 * ⚠️ `[^\n]*` em vez de `.*$`: em checkout Windows o arquivo vem com CRLF, e o
 * `\r` é LINE TERMINATOR para o `.` do JS — a limpeza não removeria nada
 * (armadilha de 17/08 e 03/09/2026).
 */
function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}

/** Recorta o array literal de uma const, já sem comentário. */
function listaDe(js: string, nome: string): string {
  const i = js.indexOf(`${nome} = [`);
  expect(i, `const ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = js.indexOf('];', i);
  expect(fim, `fim de ${nome} não encontrado`).toBeGreaterThan(i);
  return js.slice(i, fim);
}

const COLUNAS_NOVAS = ['carta_transferencia', 'igreja_anterior'];

describe('Seja membro · carta de transferência e igreja de origem', () => {
  const publico = semComentarios(readFileSync(ARQ_PUBLICO, 'utf8'));
  const membresia = semComentarios(readFileSync(ARQ_MEMBRESIA, 'utf8'));

  it('o limpador de comentários não destrói os arquivos', () => {
    expect(publico).toContain("router.post('/cadastro'");
    expect(membresia).toContain('async function aprovarCadastroCore');
  });

  for (const col of COLUNAS_NOVAS) {
    it(`'${col}' está em COLUNAS_OPCIONAIS — senão o fallback do 42703 não a remove e a submissão se perde`, () => {
      expect(listaDe(publico, 'COLUNAS_OPCIONAIS')).toContain(`'${col}'`);
    });

    it(`'${col}' está em cadFields — senão a resposta some da ficha ao aprovar`, () => {
      expect(listaDe(membresia, 'cadFields')).toContain(`'${col}'`);
    });
  }

  it('o INSERT usa o fallback GERAL, não o antigo específico do censo', () => {
    // `semColunasDoCenso` só tirava as 3 colunas do censo. Se ele voltar, a
    // coluna nova fica no payload da retentativa e o 42703 se repete.
    expect(publico).toContain('semColunasOpcionais(payload)');
    expect(publico).not.toContain('semColunasDoCenso');
  });

  it('COLUNAS_OPCIONAIS continua contendo as do censo (não trocar uma lista pela outra)', () => {
    const lista = listaDe(publico, 'COLUNAS_OPCIONAIS');
    // A lista nova SOMA às do censo; perdê-las devolveria o bug original,
    // agora no cadastro feito pelo QR do culto.
    expect(lista).toContain('COLUNAS_CENSO');
  });

  it('a carta só é gravada com `=== true` — string "false" do JSON é truthy', () => {
    // O corpo vem de JSON de porta pública: aceitar truthy registraria carta de
    // transferência que ninguém declarou, e ela é o documento que a equipe vai
    // procurar.
    expect(publico).toContain('carta_transferencia === true');
  });

  it('a igreja de origem é trimada e tem teto (texto livre de porta pública)', () => {
    const i = publico.indexOf('igreja_anterior.trim()');
    expect(i, 'o trim da igreja_anterior sumiu').toBeGreaterThan(-1);
    expect(publico.slice(i, i + 200)).toContain('.slice(0, 160)');
  });

  /**
   * ⚠️⚠️ A confusão que esta guarda impede é de SIGNIFICADO, não de sintaxe.
   * `igreja_batismo_anterior` é ONDE A PESSOA FOI BATIZADA (fato que alimenta
   * trilha e NSM); `igreja_anterior` é DE ONDE ELA ESTÁ VINDO. Quem foi
   * batizada em X, passou por Y e chega aqui vindo da Y tem respostas
   * diferentes — e escrever uma na coluna da outra grava um fato falso sobre o
   * batismo de uma pessoa real.
   */
  it('a porta NÃO escreve em igreja_batismo_anterior (é outro fato)', () => {
    expect(publico).not.toContain('igreja_batismo_anterior');
  });
});
