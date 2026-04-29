import { test, expect, Page } from '@playwright/test';
import { login } from '../helpers/auth';

/**
 * Smoke test de todas as rotas autenticadas do app.
 *
 * Para cada rota, valida:
 *  - Pagina carrega (sem 404 / sem erro de chunk)
 *  - Nao redireciona para /login (auth ok)
 *  - Tem conteudo relevante visivel (h1/h2 ou texto-chave)
 *  - Sem erros de console criticos
 *
 * Cobertura: 100% das rotas registradas em src/App.tsx (em produção,
 * algumas podem ser bloqueadas por permissão e o teste detecta isso
 * sem falhar — apenas marca como skipped).
 */

interface Rota {
  path: string;
  modulo: string;
  // Texto que deve aparecer na pagina (case-insensitive). Pode ser string ou regex.
  esperado?: string | RegExp;
  // Se true, requer permissao especifica (skip se nao tem)
  optional?: boolean;
}

const ROTAS: Rota[] = [
  // Rotas core (todo usuario logado deve ter)
  { path: '/dashboard',                       modulo: 'Dashboard',                  esperado: /(dashboard|bem.?vindo|boas.?vindas|cbrio)/i },
  { path: '/perfil',                          modulo: 'Perfil',                     esperado: /perfil/i },
  { path: '/planejamento',                    modulo: 'Planejamento',               esperado: /planejamento|estrategia|estratégia/i },
  { path: '/solicitacoes',                    modulo: 'Solicitacoes',               esperado: /solicita/i },
  { path: '/revisao',                         modulo: 'Revisao Estrategica',        esperado: /revisao|revisão|estratégica|estrategica/i },

  // Modulos com permissao
  { path: '/eventos',                         modulo: 'Eventos',                    esperado: /eventos/i, optional: true },
  { path: '/projetos',                        modulo: 'Projetos',                   esperado: /projetos/i, optional: true },
  { path: '/expansao',                        modulo: 'Expansao',                   esperado: /expansao|expansão/i, optional: true },
  { path: '/grupos',                          modulo: 'Grupos',                     esperado: /grupos/i, optional: true },

  // Admin
  { path: '/admin/rh',                        modulo: 'RH',                         esperado: /rh|recursos humanos|funcionar/i, optional: true },
  { path: '/admin/financeiro',                modulo: 'Financeiro',                 esperado: /financ/i, optional: true },
  { path: '/admin/logistica',                 modulo: 'Logistica',                  esperado: /logist/i, optional: true },
  { path: '/admin/patrimonio',                modulo: 'Patrimonio',                 esperado: /patrim/i, optional: true },
  { path: '/admin/notificacao-regras',        modulo: 'Notificacao Regras',         esperado: /notifica/i },
  { path: '/admin/cultura',                   modulo: 'Cultura Mensal',             esperado: /cultura/i },

  // Ministerial
  { path: '/ministerial/membresia',           modulo: 'Membresia',                  esperado: /membres/i, optional: true },
  { path: '/ministerial/voluntariado',        modulo: 'Voluntariado',               esperado: /volunt/i, optional: true },
  { path: '/ministerial/cuidados',            modulo: 'Cuidados',                   esperado: /cuidad/i, optional: true },
  { path: '/ministerial/integracao',          modulo: 'Integracao',                 esperado: /integra/i, optional: true },
  { path: '/ministerial/next',                modulo: 'NEXT',                       esperado: /next/i, optional: true },

  // KPIs e IA
  { path: '/kpis',                            modulo: 'KPIs',                       esperado: /kpi|indicador/i, optional: true },
  { path: '/kpis/guia',                       modulo: 'KPIs Guia',                  esperado: /guia|coleta/i, optional: true },
  { path: '/assistente-ia',                   modulo: 'Assistente IA',              esperado: /assistente|ia|inteligen/i, optional: true },
];

// Erros conhecidos / nao-criticos que podem aparecer no console mas nao quebram funcional
const CONSOLE_IGNORE = [
  /favicon/i,
  /\[HMR\]/,
  /websocket/i,
  /sockjs/i,
  /supabase\.com.*401/, // RLS pode dar 401 em consultas opcionais
  /mixpanel/i,
  /sentry/i,
];

async function paginaCarregou(page: Page, rota: Rota): Promise<{ ok: boolean; razao?: string; consoleErrors: string[] }> {
  const consoleErrors: string[] = [];
  const handler = (msg: any) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_IGNORE.some(re => re.test(text))) return;
    consoleErrors.push(text);
  };
  page.on('console', handler);

  try {
    const resp = await page.goto(rota.path, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const status = resp?.status() ?? 0;
    if (status >= 400) {
      return { ok: false, razao: `HTTP ${status}`, consoleErrors };
    }

    // Espera ate 5s pelo conteudo. Se redirecionou para /login = sem permissao.
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const url = page.url();
    if (url.includes('/login')) {
      return { ok: false, razao: 'redirecionou para /login (sessao expirou)', consoleErrors };
    }

    // Tela de "Modulo nao habilitado" / 403
    const bloqueadoText = page.locator('text=/sem permiss|nao habilit|não habilit|forbidden|access denied/i').first();
    if (await bloqueadoText.isVisible({ timeout: 1000 }).catch(() => false)) {
      return { ok: false, razao: 'sem permissao ao modulo', consoleErrors };
    }

    // Verifica conteudo esperado, se especificado
    if (rota.esperado) {
      const conteudo = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
      const re = typeof rota.esperado === 'string' ? new RegExp(rota.esperado, 'i') : rota.esperado;
      if (!re.test(conteudo || '')) {
        return { ok: false, razao: `texto esperado nao encontrado: ${re}`, consoleErrors };
      }
    }

    return { ok: true, consoleErrors };
  } catch (e: any) {
    return { ok: false, razao: `excecao: ${e?.message || String(e)}`, consoleErrors };
  } finally {
    page.off('console', handler);
  }
}

test.describe('Smoke test - todos os modulos', () => {
  test.beforeAll(async ({ browser }) => {
    // Pre-warm: faz login uma vez para validar credenciais
    const page = await browser.newPage();
    try {
      await login(page);
    } finally {
      await page.close();
    }
  });

  for (const rota of ROTAS) {
    test(`[${rota.modulo}] ${rota.path}`, async ({ page }) => {
      await login(page);
      const r = await paginaCarregou(page, rota);

      if (!r.ok) {
        if (rota.optional && /sem permissao|redirec/.test(r.razao || '')) {
          test.skip(true, `Modulo opcional sem permissao: ${r.razao}`);
        }
        throw new Error(
          `Modulo ${rota.modulo} (${rota.path}) falhou: ${r.razao}` +
          (r.consoleErrors.length ? `\nConsole errors:\n${r.consoleErrors.slice(0, 5).join('\n')}` : ''),
        );
      }

      // Soft-check: sem erros criticos de console
      expect.soft(r.consoleErrors, `Console errors em ${rota.path}`).toHaveLength(0);
    });
  }
});
