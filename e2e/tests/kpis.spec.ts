import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Modulo KPIs (autenticado)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('aba Estrategico carrega NSM e direcionadores', async ({ page }) => {
    await page.goto('/kpis');
    // Aba Estrategico e a default
    await expect(page.locator('h2', { hasText: /Norte Star Metric|NSM/i }).first()).toBeVisible({
      timeout: 15000,
    });
    // Pelo menos 1 direcionador aparece
    await expect(
      page.getByText(/Ministerial - Move|Geracionais|Criativo|Operacoes|CBA/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('aba Lancamento mostra cards das areas', async ({ page }) => {
    await page.goto('/kpis');

    // Clica na tab Lancamento
    await page.getByRole('button', { name: /Lancamento|Lançamento/i }).first().click();

    // Espera ver pelo menos uma area (AMI, NEXT, etc)
    await expect(
      page.getByText(/AMI & Bridge|NEXT|Generosidade|CBKids|Voluntariado/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('drill-down de area abre tabela de indicadores', async ({ page }) => {
    await page.goto('/kpis');
    await page.getByRole('button', { name: /Lancamento|Lançamento/i }).first().click();

    // Clica em qualquer area visivel
    const cardArea = page.locator('button', { hasText: /AMI|NEXT|Voluntariado/i }).first();
    await cardArea.click();

    // Tabela com botao Lancar
    await expect(page.getByRole('button', { name: /Lancar|Lançar/i }).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
