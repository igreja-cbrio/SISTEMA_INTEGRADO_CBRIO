import { Page, expect } from '@playwright/test';

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

/**
 * Faz login com o usuario de teste configurado em E2E_TEST_EMAIL/PASSWORD.
 * Usa o fluxo padrao de email + senha do app.
 */
export async function login(page: Page) {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Defina E2E_TEST_EMAIL e E2E_TEST_PASSWORD para rodar testes autenticados',
    );
  }

  await page.goto('/login');

  // Aguarda o form de login aparecer (qualquer um dos seletores comuns)
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 15000 });

  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);

  // Clica no botao de login
  await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")');

  // Espera redirect pra dashboard ou rota autenticada
  await page.waitForURL(/(dashboard|kpis|ministerial|voluntariado\/checkin)/, { timeout: 20000 });
}

/**
 * Garante que estamos logados (faz login se for necessario).
 */
export async function ensureLogin(page: Page) {
  const url = page.url();
  if (url.includes('/login') || url === 'about:blank' || url.endsWith('/')) {
    await login(page);
  }
}

export const PREFIXO_QA = '_qa_';

/**
 * Gera nome unico com prefixo _qa_ + timestamp para facilitar cleanup.
 */
export function nomeUnico(base = 'teste') {
  return `${PREFIXO_QA}${base}_${Date.now()}`;
}

export function emailUnico(base = 'teste') {
  return `${PREFIXO_QA}${base}_${Date.now()}@qa.cbrio.local`;
}
