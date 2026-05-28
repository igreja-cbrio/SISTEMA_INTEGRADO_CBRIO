import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

// Smoke tests do modulo Marketing (Spec 015).
// Cobertura minima: rota responde, 3 telas carregam, navegacao funciona.
//
// Fluxos completos (criar solicitacao -> aprovacao do diretor -> Pedro
// atribui -> entrega -> NPS) sao validados em smoke manual + producao
// (dependem de >=3 usuarios distintos e estado de banco controlado).

test.describe('Modulo Marketing (autenticado)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('/marketing carrega o Kanban com 4 colunas', async ({ page }) => {
    await page.goto('/marketing');

    // Header da pagina
    await expect(page.locator('h1', { hasText: /Marketing/i }).first()).toBeVisible({
      timeout: 15000,
    });

    // 4 colunas do Kanban
    for (const label of ['Fila', 'Em produção', 'Aguardando solicitante', 'Concluído']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible({
        timeout: 15000,
      });
    }
  });

  test('/marketing/calendario carrega', async ({ page }) => {
    await page.goto('/marketing/calendario');

    await expect(page.locator('h1', { hasText: /Marketing/i }).first()).toBeVisible({
      timeout: 15000,
    });

    // Botao "Hoje" pra voltar a semana corrente
    await expect(page.getByRole('button', { name: /Hoje/i }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('/marketing/analytics carrega 4 cards de KPI', async ({ page }) => {
    await page.goto('/marketing/analytics');

    // Header
    await expect(page.locator('h1', { hasText: /Analytics/i }).first()).toBeVisible({
      timeout: 15000,
    });

    // Os 4 KPIs MKT-* aparecem (snapshot · valor pode ser "—" se ainda sem dado)
    for (const kpi of [
      /no prazo/i,
      /Lead time/i,
      /Throughput|entregues/i,
      /Demanda.*Capacidade|Razao demanda/i,
    ]) {
      await expect(page.getByText(kpi).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('navega entre Kanban -> Calendario -> Analytics via botoes do header', async ({ page }) => {
    await page.goto('/marketing');

    // Vai pro Calendario
    await page.getByRole('button', { name: /Calend[áa]rio/i }).first().click();
    await page.waitForURL(/\/marketing\/calendario/, { timeout: 10000 });

    // Vai pro Analytics
    await page.getByRole('button', { name: /Analytics/i }).first().click();
    await page.waitForURL(/\/marketing\/analytics/, { timeout: 10000 });

    // Volta pro Kanban
    await page.getByRole('button', { name: /Kanban/i }).first().click();
    await page.waitForURL(/\/marketing$/, { timeout: 10000 });
  });
});
