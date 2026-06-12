import { test, expect } from '@playwright/test';
import { nomeUnico, emailUnico } from '../helpers/auth';

test.describe('Rotas publicas', () => {
  test('pagina de login carrega', async ({ page }) => {
    await page.goto('/login');
    // Espera ver algum input de email
    const email = page.locator('input[type="email"], input[name="email"]').first();
    await expect(email).toBeVisible({ timeout: 10000 });
  });

  test('formulario publico do NEXT carrega', async ({ page }) => {
    await page.goto('/next/inscrever');

    // Espera ver o titulo
    await expect(page.locator('h1', { hasText: /Inscricao no NEXT/i })).toBeVisible({
      timeout: 15000,
    });

    // Tem o campo nome
    await expect(page.locator('#nome')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#telefone')).toBeVisible();
  });

  test('pagina /next redireciona para o formulario', async ({ page }) => {
    await page.goto('/next');
    await expect(page.locator('h1', { hasText: /Inscricao no NEXT/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('inscricao no NEXT funciona (fluxo completo publico)', async ({ page }) => {
    await page.goto('/next/inscrever');
    await expect(page.locator('h1', { hasText: /Inscricao no NEXT/i })).toBeVisible({
      timeout: 15000,
    });

    const nome = nomeUnico('nome');
    const email = emailUnico('next');

    await page.fill('#nome', nome);
    await page.fill('#sobrenome', 'QA');
    await page.fill('#email', email);
    await page.fill('#telefone', '21999998888');

    await page.click('button[type="submit"]');

    // Tela de sucesso
    await expect(page.locator('h2', { hasText: /Inscricao confirmada/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('cadastro de membresia carrega', async ({ page }) => {
    await page.goto('/cadastro-membresia');
    await expect(page.locator('h1', { hasText: /Cadastro de Membresia/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
