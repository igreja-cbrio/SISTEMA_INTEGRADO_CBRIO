import { describe, it, expect } from 'vitest';
import { amostraNomes, plural, MAX_AMOSTRA } from '../../backend/utils/avisoAgregado.js';
// ⚠️ O extrator de `notificar({…})` e o strip de comentários VIVEM EM UM LUGAR SÓ
// (10/08/2026): o segundo guarda desta família precisou do mesmo parser, e dois
// parsers do mesmo texto divergem — aí um guarda protege uma gramática que o
// outro não reconhece. Ver src/test/utils/notificarEstatico.ts.
import { semComentarios, lerBackend, chamadasNotificar } from './utils/notificarEstatico';

// ─────────────────────────────────────────────────────────────────────────────
// Contexto (medido em 10/08/2026, com o cron de notificações JÁ rodando):
// 16.646 avisos não lidos · 90 pessoas · média de 185 por pessoa. O módulo
// `grupos` respondia por 9.782 (59%) porque os geradores periódicos avisavam
// 1 POR ITEM e, sem regra em `notificacao_regras`, cada aviso abre no fallback
// de TODOS os admin/diretor (16 pessoas).
// ─────────────────────────────────────────────────────────────────────────────

describe('amostraNomes · a mensagem leva contagem + amostra', () => {
  it('lista tudo quando cabe no limite', () => {
    expect(amostraNomes(['A', 'B', 'C'])).toBe('A, B, C');
  });

  it('corta no limite e declara quantos ficaram de fora', () => {
    const seis = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(amostraNomes(seis)).toBe('A, B, C, D, E e mais 1');
    expect(MAX_AMOSTRA).toBe(5);
  });

  it('nunca esconde o resto em silêncio: o total é sempre reconstituível', () => {
    const trinta = Array.from({ length: 30 }, (_, i) => `G${i + 1}`);
    const frase = amostraNomes(trinta);
    const resto = Number(frase.match(/e mais (\d+)$/)![1]);
    const mostrados = frase.replace(/ e mais \d+$/, '').split(', ').length;
    expect(mostrados + resto).toBe(30);
  });

  it('lista vazia devolve string vazia (o gerador nem chega a notificar)', () => {
    expect(amostraNomes([])).toBe('');
    expect(amostraNomes(null as unknown as string[])).toBe('');
  });

  it('ignora item nulo/vazio em vez de imprimir vírgula solta', () => {
    expect(amostraNomes(['A', '', null as unknown as string, 'B'])).toBe('A, B');
  });

  it('⚠️ NÃO reordena: a ordem "pior primeiro" é decisão de quem chama', () => {
    // Cada gerador ordena pelo seu critério (dias sem encontro, cultos
    // perdidos). Se este helper ordenasse, essa escolha ficaria escondida.
    expect(amostraNomes(['Zebra (90 dias)', 'Alfa (2 dias)']))
      .toBe('Zebra (90 dias), Alfa (2 dias)');
  });
});

describe('plural · concordância sem inventar sufixo', () => {
  it('⚠️ MUTATION-TEST: plural não sai de `+ "s"`', () => {
    // "reunião" + "s" = "reuniãos"; e o `${n === 1 ? 'reunião' : 'reuniões'}`
    // escrito errado já produziu o título "1 reuniãoões".
    expect(plural(1, 'reunião', 'reuniões')).toBe('reunião');
    expect(plural(2, 'reunião', 'reuniões')).toBe('reuniões');
    expect(plural(2, 'reunião', 'reuniões')).not.toBe('reuniãos');
    expect(plural(0, 'grupo', 'grupos')).toBe('grupos');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARDA DE REGRESSÃO · o que este arquivo existe pra impedir
//
// `notificacaoGenerator.js` importa o Supabase, então não dá pra chamá-lo aqui
// sem banco. O guarda é ESTÁTICO sobre o texto do arquivo, e a invariante é a
// chave de dedup: aviso agregado tem chave ESTÁVEL (string literal); aviso por
// item precisa interpolar o id (`${g.id}`), então basta proibir a interpolação
// nesses 4 tipos pra impedir a volta do padrão antigo.
//
// ⚠️ Os comentários são REMOVIDOS antes de casar. É a armadilha já registrada
// duas vezes no repo (06/08 no `appRateLimit.test.ts`, e a conferência da
// migration `20260806140000`): a própria documentação do conserto cita o padrão
// errado como exemplo, e a checagem acusava a explicação como se fosse código.
// ─────────────────────────────────────────────────────────────────────────────

const GERADOR = lerBackend('backend/services/notificacaoGenerator.js');
const CHAMADAS = chamadasNotificar(GERADOR);

const AGREGADOS = [
  { tipo: 'grupo_sem_encontro', chave: 'grupo_sem_encontro' },
  { tipo: 'membro_sem_grupo', chave: 'membro_sem_grupo' },
  { tipo: 'ata_pendente', chave: 'gov_ata_pendente' },
  { tipo: 'kids_crianca_ausente', chave: 'kids_crianca_ausente' },
];

describe('geradores periódicos · 1 aviso agregado, não 1 por item', () => {
  it('o strip de comentários não come o // de uma URL', () => {
    expect(semComentarios('const u = "https://cbrio.org"; // nota'))
      .toContain('https://cbrio.org');
  });

  for (const { tipo, chave } of AGREGADOS) {
    it(`${tipo} · chave de dedup é literal estável ('${chave}')`, () => {
      expect(GERADOR).toContain(`chaveDedup: '${chave}'`);
    });

    it(`⚠️ MUTATION-TEST: o aviso amplo de ${tipo} não volta a deduplicar por item`, () => {
      // Trocar a chave estável do agregado por `\`${chave}_${'${'}item.id}\``
      // deixa isto vermelho. A checagem é no bloco AMPLO (sem `targetIds`),
      // porque no aviso dirigido a chave por item é o comportamento correto.
      const interpolaId = new RegExp('chaveDedup:\\s*`[^`]*' + chave, 'i');
      const amplos = CHAMADAS.filter(c => (
        c.includes(`tipo: '${tipo}'`) && !/targetIds:/.test(c)
      ));
      for (const bloco of amplos) expect(bloco).not.toMatch(interpolaId);
    });

    // ⚠️⚠️ A INVARIANTE FOI REFINADA EM 10/08/2026, não afrouxada — leia antes
    // de "consertar" isto.
    //
    // A versão anterior exigia UMA ocorrência de cada tipo no arquivo. O alvo
    // dela era certo (volume), mas a régua pegava junto uma coisa legítima: o
    // aviso POR ITEM mandado ao DONO do item. O que produziu 9.782 avisos não
    // lidos não foi "um por item" — foi "um por item × as ~16 pessoas do
    // fallback do módulo". Um por grupo indo pro líder daquele grupo é bounded
    // pelo número de líderes e é justamente o que o Matheus pediu ("as pessoas
    // só recebem notificação de grupos se for do seu grupo").
    //
    // Então a regra que vale é: **por item só com `targetIds`**. Quem cai no
    // público do módulo TEM que ser agregado. Isto é mais forte que a régua
    // antiga em uma dimensão — vale pros quatro tipos, e não só pela forma da
    // chave.
    it(`${tipo} · aviso por item existe só com destinatário nomeado`, () => {
      const doTipo = CHAMADAS.filter(c => c.includes(`tipo: '${tipo}'`));
      expect(doTipo.length).toBeGreaterThan(0);
      for (const bloco of doTipo) {
        const porItem = /chaveDedup:\s*`/.test(bloco);
        if (porItem) {
          expect(bloco, `${tipo}: aviso por item sem targetIds volta a explodir no fallback do módulo`)
            .toMatch(/targetIds:/);
        }
      }
    });

    it(`${tipo} · o aviso agregado (sem targetIds) é único`, () => {
      const amplos = CHAMADAS.filter(c => (
        c.includes(`tipo: '${tipo}'`) && !/targetIds:/.test(c)
      ));
      expect(amplos.length).toBe(1);
    });
  }

  // ⚠️ NÃO existe aqui um teste de "o notificar está fora do laço", e é
  // deliberado: eu escrevi um contando `{` × `}` entre o `for` e o `notificar`,
  // e ele deu FALSO POSITIVO — no ponto do `tipo:` sempre há chaves abertas (o
  // `if`, o `notificar({`, o objeto), então a contagem não distingue "dentro do
  // laço" de "dentro do objeto". Teste incorreto no gate bloqueia produção, que
  // é pior que a ausência dele.
  //
  // E ele não é necessário: com chave de dedup ESTÁVEL, um `notificar` dentro
  // do laço também não empilharia — a dedup do `notificar` barra do 2º item em
  // diante, porque a chave é a mesma. Ou seja, os guardas de chave literal
  // acima já cobrem o dano real (o volume), que é o que este arquivo protege.
});
