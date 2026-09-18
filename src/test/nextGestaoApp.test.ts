// ============================================================================
// Portão da gestão do Next no APP de membros (03/09/2026)
//
// O que este teste existe pra impedir de voltar: os 3 endpoints `/app/next/*`
// gateavam por POSSE (`next_turmas.responsavel_id = membro.id`) e as **turmas
// vivas têm `responsavel_id` NULO** (9 abertas, 0 com dono) — então
// `GET /app/next/papel` respondia `responsavel: false` pra todo mundo e a tela
// de gestão da turma, que já estava escrita, era inalcançável em produção.
//
// E guarda DUAS coisas que a união abre:
//
// 1 · o acidente de JS `null === null === true`: membro não resolvido + turma
//     sem dono liberaria TODAS as turmas de uma vez.
// 2 · ⚠️⚠️ a SEPARAÇÃO leitura × escrita. Medido em 03/09: 12 pessoas passam
//     por `max(leitura,escrita) >= 2` e 11 por `escrita >= 2` — a única
//     diferença é a conta **"Revisor App Store (Staff)"** (leitura 3 · escrita
//     0). Sem a separação, ela marcaria presença e cadastraria walk-in na base
//     VIVA do Next tendo escrita 0 na matriz do web.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import {
  podeGerenciarNext,
  podeEscreverNext,
  podeGerenciarTurmaApp,
  NIVEL_MINIMO_NEXT_APP,
} from '../../backend/utils/nextGestaoApp';

const RAIZ = join(__dirname, '..', '..');
const APP_JS = semComentariosJs(readFileSync(join(RAIZ, 'backend', 'routes', 'app.js'), 'utf8'));

const MEMBRO = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

describe('alcança a gestão do Next no app', () => {
  it('escrita 2 na matriz entra, mesmo sem turma própria', () => {
    expect(podeGerenciarNext({ leitura: 0, escrita: 2, turmasProprias: 0 })).toBe(true);
  });

  it('só LEITURA já alcança a área — ver não é agir', () => {
    // É o caso do revisor da App Store: ele precisa ver que o app funciona.
    expect(podeGerenciarNext({ leitura: 3, escrita: 0, turmasProprias: 0 })).toBe(true);
  });

  it('o responsável de turma entra MESMO sem nível — a união não substitui a posse', () => {
    expect(podeGerenciarNext({ leitura: 0, escrita: 0, turmasProprias: 1 })).toBe(true);
    expect(podeGerenciarNext({ leitura: 1, escrita: 1, turmasProprias: 3 })).toBe(true);
  });

  it('nível 1 sem turma própria NÃO entra (leitura no web não é gestão no app)', () => {
    expect(podeGerenciarNext({ leitura: 1, escrita: 1, turmasProprias: 0 })).toBe(false);
  });

  it('sem nada não entra', () => {
    expect(podeGerenciarNext({})).toBe(false);
    expect(podeGerenciarNext({ leitura: 0, escrita: 0, turmasProprias: 0 })).toBe(false);
  });

  it('nível ilegível vale ZERO (fail-closed), nunca "passa porque veio algo"', () => {
    expect(podeGerenciarNext({ escrita: 'cinco' as unknown as number })).toBe(false);
    expect(podeGerenciarNext({ escrita: NaN })).toBe(false);
    expect(podeGerenciarNext({ leitura: null as unknown as number })).toBe(false);
    expect(podeGerenciarNext({ escrita: -3 })).toBe(false);
    expect(podeGerenciarNext({ turmasProprias: 'duas' as unknown as number })).toBe(false);
  });

  it('o mínimo é 2 — o mesmo do batismo no app', () => {
    expect(NIVEL_MINIMO_NEXT_APP).toBe(2);
  });
});

describe('⚠️⚠️ AGIR exige ESCRITA — o caso do revisor da App Store', () => {
  it('leitura 3 / escrita 0 ALCANÇA a área e NÃO escreve nada', () => {
    const revisor = { leitura: 3, escrita: 0, turmasProprias: 0 };
    expect(podeGerenciarNext(revisor)).toBe(true);
    expect(podeEscreverNext(revisor)).toBe(false);
  });

  it('escrita 2 escreve', () => {
    expect(podeEscreverNext({ leitura: 0, escrita: 2 })).toBe(true);
    expect(podeEscreverNext({ leitura: 5, escrita: 5 })).toBe(true);
  });

  it('escrita 1 NÃO escreve (o mínimo é 2, como no web)', () => {
    expect(podeEscreverNext({ leitura: 5, escrita: 1 })).toBe(false);
  });

  it('a POSSE continua escrevendo sem nível nenhum na matriz', () => {
    expect(podeEscreverNext({ leitura: 0, escrita: 0, turmasProprias: 1 })).toBe(true);
  });

  it('sem nada não escreve', () => {
    expect(podeEscreverNext({})).toBe(false);
    expect(podeEscreverNext({ leitura: 0, escrita: 0, turmasProprias: 0 })).toBe(false);
  });

  it('escrita ilegível vale ZERO (fail-closed)', () => {
    expect(podeEscreverNext({ escrita: 'dois' as unknown as number })).toBe(false);
    expect(podeEscreverNext({ escrita: NaN })).toBe(false);
    expect(podeEscreverNext({ escrita: -5 })).toBe(false);
  });
});

describe('agir NESTA turma', () => {
  it('escrita 2 age em turma de qualquer dono, e em turma sem dono', () => {
    expect(podeGerenciarTurmaApp({
      leitura: 0, escrita: 2, escrever: true, turma: { responsavel_id: OUTRO }, membroId: MEMBRO,
    })).toBe(true);
    expect(podeGerenciarTurmaApp({
      leitura: 0, escrita: 5, escrever: true, turma: { responsavel_id: null }, membroId: MEMBRO,
    })).toBe(true);
  });

  it('⚠️⚠️ leitura 3 / escrita 0 VÊ a turma e NÃO age nela', () => {
    const turma = { responsavel_id: OUTRO };
    expect(podeGerenciarTurmaApp({ leitura: 3, escrita: 0, turma, membroId: MEMBRO })).toBe(true);
    expect(podeGerenciarTurmaApp({
      leitura: 3, escrita: 0, escrever: true, turma, membroId: MEMBRO,
    })).toBe(false);
  });

  it('o default de `escrever` é LEITURA — quem esquecer o parâmetro não escala poder', () => {
    // Se o default fosse `true`, um call site distraído passaria a EXIGIR
    // escrita numa leitura e trancaria o revisor fora da tela; se a régua
    // fizesse o contrário (default agir), leitura alta escreveria.
    expect(podeGerenciarTurmaApp({ leitura: 3, escrita: 0, turma: { responsavel_id: OUTRO } })).toBe(true);
  });

  it('sem nível, só o próprio responsável age', () => {
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: MEMBRO }, membroId: MEMBRO,
    })).toBe(true);
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: OUTRO }, membroId: MEMBRO,
    })).toBe(false);
  });

  it('⚠️⚠️ turma SEM DONO + membro não resolvido NÃO libera (null === null é true em JS)', () => {
    // É o estado da base hoje: as turmas abertas têm `responsavel_id` NULO. Sem
    // esta guarda, quem o `resolveMembroApp` não conseguiu resolver gerenciaria
    // TODAS.
    expect(podeGerenciarTurmaApp({ escrita: 0, turma: { responsavel_id: null }, membroId: null })).toBe(false);
    expect(podeGerenciarTurmaApp({ escrita: 0, turma: { responsavel_id: null } })).toBe(false);
    expect(podeGerenciarTurmaApp({ leitura: 1, turma: {}, membroId: undefined })).toBe(false);
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: null }, membroId: null,
    })).toBe(false);
  });

  it('turma ausente é fail-closed', () => {
    expect(podeGerenciarTurmaApp({ leitura: 5, escrita: 5, turma: null, membroId: MEMBRO })).toBe(false);
    expect(podeGerenciarTurmaApp({ leitura: 5, escrita: 5, membroId: MEMBRO })).toBe(false);
  });

  it('compara como TEXTO (uuid vindo do banco × do corpo)', () => {
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: MEMBRO }, membroId: String(MEMBRO),
    })).toBe(true);
  });
});

describe('montagem em backend/routes/app.js', () => {
  it('os endpoints do Next usam a régua, não a comparação de posse solta', () => {
    expect(APP_JS).toContain("require('../utils/nextGestaoApp')");
    expect(APP_JS).toMatch(/podeGerenciarTurmaApp\(/);
  });

  it('⚠️ nenhuma comparação crua de `responsavel_id` sobrou nos endpoints do app', () => {
    // Era ela, repetida em 3 sítios, que trancava a tela em produção.
    expect(APP_JS).not.toMatch(/turma\.responsavel_id\s*!==\s*membro\.id/);
  });

  it('o nível sai da matriz pelo caminho canônico', () => {
    expect(APP_JS).toMatch(/permissaoModuloApp\(req,\s*'next'\)/);
  });

  it('⚠️⚠️ os 4 endpoints de ESCRITA carregam o gate de escrita', () => {
    // alocar · direcionar · walk-in · presença. Sem isto, a conta do revisor da
    // App Store (leitura 3 · escrita 0) escreveria na base viva do Next.
    const usos = APP_JS.match(/autorizarEscritaNextApp/g) || [];
    expect(usos.length).toBeGreaterThanOrEqual(5); // a definição + os 4 usos
  });

  it('⚠️ e os 4 pedem a turma com `escrever: true`', () => {
    const usos = APP_JS.match(/escrever:\s*true/g) || [];
    expect(usos.length).toBeGreaterThanOrEqual(4);
  });

  it('o contexto separa leitura de escrita, nunca um `nivel` só', () => {
    expect(APP_JS).toMatch(/podeEscreverNext\(/);
    expect(APP_JS).not.toMatch(/podeGerenciarNext\(\s*\{\s*nivel\b/);
  });

  it('⚠️⚠️ ninguém lê um `ctx.nivel` — o campo NÃO existe e daria `undefined >= 2`', () => {
    // O bug que isto mata: `por_permissao: ctx.nivel >= 2` responde SEMPRE
    // false, e a tela concluiria que todo mundo entrou por posse (com as 44
    // turmas sem dono, ninguém entra por posse).
    expect(APP_JS).not.toMatch(/\bctx\.nivel\b/);
    expect(APP_JS).not.toMatch(/nextCtx\.nivel\b/);
    expect(APP_JS).toMatch(/Math\.max\(ctx\.leitura,\s*ctx\.escrita\)\s*>=\s*NIVEL_MINIMO_NEXT_APP/);
  });

  it('⚠️ `escreve` viaja pra tela, senão o botão aparece pra quem só lê', () => {
    expect(APP_JS).toMatch(/escreve:\s*ctx\.escreve/);
  });
});
