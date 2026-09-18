// ============================================================================
// Guard de módulo do `/api/next` (03/09/2026)
//
// O buraco que este teste existe pra impedir de voltar: `backend/routes/next.js`
// ficou desde 28/04/2026 montado em `/api/next` com ~40 endpoints e SÓ
// `router.use(authenticate)` — nenhum `authorizeModule`. Qualquer usuário
// autenticado do ERP (medido em 03/09: 103 ativos, dos quais 56 sem `next` nem
// `integracao`) escrevia no Next. `POST /matriculas` chega a criar pessoa em
// `mem_membros` pelo matcher forte.
//
// Duas metades, porque uma sozinha não segura:
//   1. a RÉGUA (pura) — leitura pede 1, escrita pede 2;
//   2. a MONTAGEM (estática) — a rota realmente pendura o guard no router.
// Sem (2), alguém apaga o `router.use` e a régua continua verdinha sozinha.
//
// ⚠️ Checagem estática por TEXTO, igual `routeModuleMap.test.ts`: importar
// `routes/next.js` puxa `utils/supabase` e o gate roda sem as dependências de
// `backend/`. Comentário é removido antes de casar (armadilha de 06/08/2026 —
// este arquivo cita `router.use(authenticate)` na explicação acima).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import { nivelGuardNext, METODOS_ESCRITA, ROUTE_KEY } from '../../backend/utils/nextGuardNivel';

const RAIZ = join(__dirname, '..', '..');
const ROTA_NEXT = join(RAIZ, 'backend', 'routes', 'next.js');
const AUTH = join(RAIZ, 'backend', 'middleware', 'auth.js');

const fonteRota = semComentariosJs(readFileSync(ROTA_NEXT, 'utf8'));
const fonteAuth = semComentariosJs(readFileSync(AUTH, 'utf8'));

describe('régua de nível do guard do Next', () => {
  it('leitura (GET/HEAD) pede nível 1', () => {
    expect(nivelGuardNext('GET')).toBe(1);
    expect(nivelGuardNext('HEAD')).toBe(1);
  });

  it('toda escrita pede nível 2', () => {
    for (const m of METODOS_ESCRITA) expect(nivelGuardNext(m)).toBe(2);
  });

  it('DELETE fica em 2, não em 3', () => {
    // Os 4 DELETEs do arquivo são soft-delete (`app_soft_delete`) ou desfazer.
    // Subir pra 3 tiraria do operador de domingo o direito de corrigir o
    // próprio erro — o oposto do objetivo do guard.
    expect(nivelGuardNext('DELETE')).toBe(2);
  });

  it('método desconhecido/vazio cai na leitura (fail-closed no nível mais alto que existe)', () => {
    expect(nivelGuardNext('')).toBe(1);
    expect(nivelGuardNext(undefined as unknown as string)).toBe(1);
  });

  it('minúsculo é tratado igual (Express normaliza, mas a régua não confia)', () => {
    expect(nivelGuardNext('post')).toBe(2);
    expect(nivelGuardNext('get')).toBe(1);
  });
});

describe('montagem do guard em backend/routes/next.js', () => {
  it('o router pendura authenticate E o guard de módulo', () => {
    expect(fonteRota).toContain('router.use(authenticate)');
    expect(fonteRota).toMatch(/authorizeModule\(NEXT_ROUTE_KEY,\s*1\)/);
    expect(fonteRota).toMatch(/authorizeModule\(NEXT_ROUTE_KEY,\s*2\)/);
  });

  it('o guard usa a régua pura, não um if solto na rota', () => {
    expect(fonteRota).toContain('nivelGuardNext(req.method)');
  });
});

describe('ROUTE_MODULE_MAP', () => {
  it('o routeKey do Next aceita `next` E `integracao`', () => {
    // ⚠️ Só ['next'] daria 403 pra quem tem apenas `integracao` — medido em
    // 03/09: 2 pessoas ativas (nível 5 nas duas), numa aba que vive DENTRO da
    // página de Integração desde o #2856.
    expect(ROUTE_KEY).toBe('next-gestao');
    const linha = fonteAuth.split('\n').find(l => l.includes(`'${ROUTE_KEY}'`));
    expect(linha, `routeKey '${ROUTE_KEY}' ausente do ROUTE_MODULE_MAP`).toBeTruthy();
    expect(linha).toContain("'next'");
    expect(linha).toContain("'integracao'");
  });

  it('`batismo` NÃO entra — quem só tem batismo nem renderiza a aba Next', () => {
    const linha = fonteAuth.split('\n').find(l => l.includes(`'${ROUTE_KEY}'`))!;
    expect(linha).not.toContain("'batismo'");
  });
});
