#!/usr/bin/env node
/**
 * Captura screenshots das telas reais do sistema para o vídeo (video/).
 *
 * Como rodar (LOCALMENTE, onde você tem acesso à app + Supabase):
 *
 *   # contra a app local (suba antes: npm run dev)
 *   E2E_TEST_EMAIL=qa@cbrio.com.br E2E_TEST_PASSWORD=... \
 *     node scripts/capture-screens.mjs
 *
 *   # ou contra produção / preview Vercel
 *   E2E_BASE_URL=https://cbrio.org \
 *   E2E_TEST_EMAIL=qa@cbrio.com.br E2E_TEST_PASSWORD=... \
 *     node scripts/capture-screens.mjs
 *
 * Saída:
 *   - video/public/screens/<key>.png   (uma por tela capturada)
 *   - video/src/screens-manifest.json  (marca captured:true nas que deram certo)
 *
 * Depois: `cd video && npm run render:telas` gera out/telas-do-sistema.mp4.
 *
 * Edite ROUTES abaixo pra escolher quais telas entram no vídeo.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'video', 'public', 'screens');
const MANIFEST = join(ROOT, 'video', 'src', 'screens-manifest.json');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

const VIEWPORT = { width: 1920, height: 1080 };

// Telas que entram no vídeo. key = nome do arquivo PNG. Ajuste à vontade.
const ROUTES = [
  { key: 'painel', label: 'Painel CBRio', sub: 'NSM, mandalas e matriz Valor x Área', path: '/painel' },
  { key: 'minha-area', label: 'Minha Área', sub: 'KPIs do líder agrupados por valor', path: '/minha-area' },
  { key: 'marketing', label: 'Marketing', sub: 'Kanban de demandas criativas', path: '/marketing' },
  { key: 'marketing-calendario', label: 'Capacidade do time', sub: 'Calendário semanal do Marketing', path: '/marketing/calendario' },
  { key: 'eventos', label: 'Eventos', sub: 'Ciclo criativo e score por área', path: '/eventos' },
  { key: 'integracao', label: 'Integração', sub: 'Cultos, decisões e batismos', path: '/integracao' },
  { key: 'solicitacoes', label: 'Solicitações', sub: 'Fluxo administrativo com SLA', path: '/solicitacoes' },
  { key: 'projetos', label: 'Projetos', sub: 'PMO · lista, kanban e gantt', path: '/projetos' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Defina E2E_TEST_EMAIL e E2E_TEST_PASSWORD (usuário admin de teste).');
  }
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 20000 });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")');
  await page.waitForURL(/(dashboard|kpis|painel|ministerial|minha-area)/, { timeout: 30000 });
  await sleep(1500);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await context.newPage();

  console.log(`> Login em ${BASE_URL} como ${EMAIL} ...`);
  await login(page);

  const screens = [];
  for (const r of ROUTES) {
    let captured = false;
    try {
      console.log(`> Capturando ${r.path} -> ${r.key}.png`);
      await page.goto(`${BASE_URL}${r.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      // dá tempo de gráficos/animações assentarem
      await sleep(2500);
      await page.screenshot({ path: join(OUT_DIR, `${r.key}.png`), animations: 'disabled' });
      captured = true;
    } catch (err) {
      console.warn(`  ! falhou em ${r.path}: ${err.message}`);
    }
    screens.push({ key: r.key, label: r.label, sub: r.sub, path: r.path, captured });
  }

  await browser.close();

  const manifest = {
    _comment: 'Gerado por scripts/capture-screens.mjs.',
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    screens,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  const ok = screens.filter((s) => s.captured).length;
  console.log(`\n✓ ${ok}/${screens.length} telas capturadas em video/public/screens/`);
  console.log('  Agora: cd video && npm install && npm run render:telas');
  if (ok < screens.length) process.exitCode = 0; // não falha o processo por telas individuais
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
