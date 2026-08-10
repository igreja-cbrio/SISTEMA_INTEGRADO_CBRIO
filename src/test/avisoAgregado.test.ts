import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { amostraNomes, plural, MAX_AMOSTRA } from '../../backend/utils/avisoAgregado.js';

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

function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // preserva o // de https://
}

const GERADOR = semComentarios(
  readFileSync(resolve(__dirname, '../../backend/services/notificacaoGenerator.js'), 'utf-8'),
);

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

    it(`⚠️ MUTATION-TEST: ${tipo} não volta a deduplicar por item`, () => {
      // Voltar pra `chaveDedup: \`${chave}_${'${'}item.id}\`` deixa isto vermelho.
      const interpolaId = new RegExp('chaveDedup:\\s*`[^`]*' + chave, 'i');
      expect(GERADOR).not.toMatch(interpolaId);
    });

    it(`${tipo} é notificado UMA vez no arquivo`, () => {
      const ocorrencias = GERADOR.split(`tipo: '${tipo}'`).length - 1;
      expect(ocorrencias).toBe(1);
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
