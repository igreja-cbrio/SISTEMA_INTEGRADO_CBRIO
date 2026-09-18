// ============================================================================
// O NPS resolve o nome da turma SOZINHO — não pergunta ao módulo Next
//
// O que este teste existe pra impedir de voltar (03/09/2026): a tela do NPS
// resolvia `turma_id → nome` com um 2º request pra `next.turmas.list()`
// (`GET /api/next/turmas`). Quando o `/api/next` ganhou guard de módulo (#2859
// — até então rodava só com `authenticate`), esse request passou a exigir
// `next` ou `integracao`, e quem cuida do NPS sem ser do Next caía no fallback
// "Turma (sem nome)" no seletor de turma.
//
// A falha era SILENCIOSA: o `.catch()` daquele request era vazio de propósito,
// então nada aparecia no console e a tela só ficava com o rótulo genérico.
// Alargar o guard do Next pra acomodar o NPS seria o conserto errado — o NPS
// já é dono da linha (é ele que grava `turma_id`), então resolve no backend
// dele, com o service role, e ninguém precisa de permissão em módulo alheio.
//
// ⚠️ Checagem ESTÁTICA por texto, igual `routeModuleMap.test.ts`: importar
// `routes/nps.js` puxa `utils/supabase` e o gate roda sem as dependências de
// `backend/`. Comentário é removido antes de casar (armadilha de 06/08/2026 —
// este arquivo cita `next.turmas.list()` na explicação acima).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const RAIZ = join(__dirname, '..', '..');
const TELA = semComentariosJs(readFileSync(join(RAIZ, 'src', 'pages', 'Nps.jsx'), 'utf8'));
const ROTA = semComentariosJs(readFileSync(join(RAIZ, 'backend', 'routes', 'nps.js'), 'utf8'));

describe('a tela do NPS não depende do módulo Next', () => {
  it('não importa a api do Next', () => {
    expect(TELA).not.toMatch(/next as nextApi/);
    expect(TELA).not.toMatch(/\bnextApi\./);
  });

  it('lê o nome da turma da própria resposta (`turma_nome`)', () => {
    expect(TELA).toContain('turma_nome');
  });

  it('mantém o fallback pra turma sem nome (turma apagada não deixa a opção vazia)', () => {
    expect(TELA).toContain('Turma (sem nome)');
  });
});

describe('o backend do NPS anexa o nome da turma', () => {
  it('o endpoint de respostas passa pelo anexo', () => {
    expect(ROTA).toMatch(/res\.json\(await anexarNomeDaTurma\(data\)\)/);
  });

  it('o anexo lê next_turmas com o service role e ignora turma apagada', () => {
    expect(ROTA).toMatch(/from\('next_turmas'\)/);
    expect(ROTA).toMatch(/anexarNomeDaTurma[\s\S]{0,900}deleted_at/);
  });

  it('⚠️ o anexo NUNCA derruba a lista de respostas — erro só omite o nome', () => {
    // A régua: o try/catch devolve `respostas` cru. Perder o rótulo da turma é
    // aceitável; perder a lista de respostas de uma pesquisa não é.
    expect(ROTA).toMatch(/anexarNomeDaTurma[\s\S]{0,1200}catch[\s\S]{0,200}return respostas;/);
  });
});
