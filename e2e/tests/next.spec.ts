import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Modulo NEXT (autenticado)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('pagina admin carrega com 4 statistic cards', async ({ page }) => {
    await page.goto('/ministerial/next');
    await expect(page.locator('h1', { hasText: 'NEXT' }).first()).toBeVisible({ timeout: 15000 });
    // Cards: eventos, inscricoes, check-ins, indicacoes
    await expect(page.getByText(/Eventos do mes/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Inscricoes \(mes\)|Inscrições \(mes\)/i)).toBeVisible();
    await expect(page.getByText(/Check-ins \(mes\)/i)).toBeVisible();
    await expect(page.getByText(/Indicacoes pendentes|Indicações pendentes/i)).toBeVisible();
  });

  test('botao Compartilhar inscricao abre modal com QR e link', async ({ page }) => {
    await page.goto('/ministerial/next');
    await expect(page.locator('h1', { hasText: 'NEXT' }).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Compartilhar inscricao|Compartilhar inscrição/i }).click();

    // Modal aberto
    await expect(page.getByText(/Compartilhar inscricao no NEXT|Compartilhar inscrição no NEXT/i)).toBeVisible({
      timeout: 5000,
    });

    // Botao WhatsApp existe
    await expect(page.getByRole('link', { name: /WhatsApp/i })).toBeVisible();

    // QR code (img dentro do modal)
    await expect(page.locator('img[alt*="QR"]')).toBeVisible();
  });

  test('aba Eventos: botao "Gerar eventos" e link existem', async ({ page }) => {
    await page.goto('/ministerial/next');
    await expect(page.locator('h1', { hasText: 'NEXT' }).first()).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByRole('button', { name: /Gerar eventos do mes|3 domingos/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Copiar link de inscricao|Copiar link de inscrição/i }),
    ).toBeVisible();
  });

  test('navegacao entre abas funciona', async ({ page }) => {
    await page.goto('/ministerial/next');
    await expect(page.locator('h1', { hasText: 'NEXT' }).first()).toBeVisible({ timeout: 15000 });

    // Clica em Inscritos
    await page.getByRole('tab', { name: /Inscritos/i }).click();
    await page.waitForTimeout(500);

    // Clica em Indicacoes
    await page.getByRole('tab', { name: /Indicacoes|Indicações/i }).click();
    // Algum elemento da aba indicacoes deve aparecer (botoes de filtro de status)
    await expect(page.getByRole('button', { name: /pendente/i }).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
