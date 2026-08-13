import { test, expect } from '@playwright/test';
import { nomeUnico, emailUnico } from '../helpers/auth';

// CPF de teste com dígitos verificadores VÁLIDOS (o form exige DV desde a
// F3.1 — Contrato de Inscrição). Aleatório pra não colidir com o dedup.
function cpfTeste(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base: number[], peso: number) => {
    const soma = base.reduce((s, d, i) => s + d * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n, 10);
  const d2 = dv([...n, d1], 11);
  return [...n, d1, d2].join('');
}

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
    await expect(page.locator('h1', { hasText: /Inscricao no NEXT|Inscrição no NEXT/i })).toBeVisible({
      timeout: 15000,
    });

    // Campos do Contrato de Inscrição (F3.1 · nome ÚNICO — #nome/#sobrenome
    // morreram na porta 5; era o seletor morto do sweep 28/07)
    await expect(page.locator('#nome_completo')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#telefone')).toBeVisible();
    await expect(page.locator('#cpf')).toBeVisible();
  });

  test('pagina /next redireciona para o formulario', async ({ page }) => {
    await page.goto('/next');
    await expect(page.locator('h1', { hasText: /Inscricao no NEXT|Inscrição no NEXT/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('inscricao no NEXT funciona (fluxo completo publico)', async ({ page }) => {
    await page.goto('/next/inscrever');
    await expect(page.locator('h1', { hasText: /Inscricao no NEXT|Inscrição no NEXT/i })).toBeVisible({
      timeout: 15000,
    });

    const nome = `${nomeUnico('nome')} Teste QA`; // nome completo sem abreviação
    const email = emailUnico('next');

    await page.fill('#nome_completo', nome);
    await page.fill('#email', email);
    await page.fill('#telefone', '21999998888');
    await page.fill('#cpf', cpfTeste());

    // Nascimento (BirthDatePicker · Popover + react-day-picker com dropdowns):
    // abre no gatilho, escolhe ano/mês nos selects e clica o dia 15.
    await page.getByRole('button', { name: /Selecione a data/i }).click();
    const pop = page.locator('[data-radix-popper-content-wrapper]');
    await pop.locator('.rdp-dropdown_year select').selectOption('1990');
    await pop.locator('.rdp-dropdown_month select').selectOption('0');
    await pop.locator('button.rdp-day:not(.rdp-day_outside)', { hasText: /^15$/ }).first().click();

    // Sexo (botões · contrato D8)
    await page.getByRole('button', { name: /^masculino$/i }).click();

    // Motivo (select nativo · slug de MOTIVOS_VALIDOS)
    await page.selectOption('#motivo', 'conhecer_cbrio');

    // Termos LGPD (primeiro checkbox · o segundo é o opt-in de WhatsApp)
    await page.locator('input[type="checkbox"]').first().check();

    await page.click('button[type="submit"]');

    // Tela de sucesso
    await expect(page.locator('h2', { hasText: /Inscricao confirmada|Inscrição confirmada/i })).toBeVisible({
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
