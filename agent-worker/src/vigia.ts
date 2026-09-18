/**
 * O laço do vigia: duas sondas cruzadas, a cada minuto.
 *
 * ⚠️⚠️ Mora AQUI, no worker do Railway, e não na Vercel, porque o vigia não
 * pode compartilhar destino com o vigiado — em 02/09/2026 a Vercel devolvia
 * 522 e o cron de saúde do ERP gravava o resultado no banco que tinha caído.
 * E não custa cron novo: o `vercel.json` está com 47, no teto do plano.
 */
import cron from 'node-cron';
import { Client } from 'pg';
import { avaliarCiclo, estadoInicial, textoAlerta, type Estado } from './utils/vigiaBanco.js';
import { alertar, canalConfigurado, destinatarios } from './utils/alertaOps.js';

const TIMEOUT_BANCO_MS = 5_000;
const TIMEOUT_HTTP_MS = 8_000;

let estado: Estado = { ...estadoInicial };

/**
 * Sonda A — `select 1` DIRETO no Postgres. É a que responde a pergunta real,
 * ignorando Vercel e Cloudflare.
 * ⚠️ Conexão nova a cada ciclo, fechada no fim: pool persistente esconderia
 * justamente a falha que interessa (não conseguir CONECTAR).
 */
async function sondarBanco(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const c = new Client({ connectionString: url, connectionTimeoutMillis: TIMEOUT_BANCO_MS, statement_timeout: TIMEOUT_BANCO_MS });
  try {
    await c.connect();
    await c.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    try { await c.end(); } catch { /* já morto */ }
  }
}

/** Sonda B — o caminho do USUÁRIO: Cloudflare → Vercel → banco. */
async function sondarApp(): Promise<boolean> {
  const base = process.env.APP_BASE_URL || 'https://www.cbrio.org';
  try {
    const r = await fetch(`${base}/api/health/db`, { signal: AbortSignal.timeout(TIMEOUT_HTTP_MS) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function cicloVigia(): Promise<void> {
  const [bancoOk, appOk] = await Promise.all([sondarBanco(), sondarApp()]);
  const d = avaliarCiclo(estado, { bancoOk, appOk, agoraMs: Date.now() });
  estado = d.estado;

  if (d.alertar) {
    const ref = process.env.SUPABASE_PROJECT_REF || '';
    const painel = ref ? `https://supabase.com/dashboard/project/${ref}` : 'https://supabase.com/dashboard';
    const t = textoAlerta(d, painel);
    console.error('[VIGIA] 🔴', t.assunto);
    await alertar(t.assunto, `${t.corpo}\n\nDetectado às ${new Date().toISOString()} · sonda do worker (Railway).\nbanco=${bancoOk ? 'ok' : 'FORA'} · app=${appOk ? 'ok' : 'FORA'}`);
  }

  if (d.recuperou) {
    const min = d.duracaoMs ? Math.round(d.duracaoMs / 60_000) : 0;
    console.log('[VIGIA] ✅ voltou · fora por ~%d min', min);
    await alertar('[CBRio] ✅ O sistema VOLTOU', `O sistema voltou a responder.\nFicou fora por aproximadamente ${min} minuto(s).`);
  }
}

export function iniciarVigia(): void {
  if (process.env.VIGIA_ENABLED !== '1') {
    console.log('[VIGIA] desligado (VIGIA_ENABLED != 1)');
    return;
  }
  // ⚠️ Kill switch por env var: derruba o vigia sem deploy, sem PR e sem
  // precisar de um computador — o requisito de quem opera sozinho.
  if (!canalConfigurado()) {
    console.error('[VIGIA] ⚠️ LIGADO MAS SEM CANAL: vai detectar e NAO vai avisar ninguem.');
    console.error('[VIGIA] configure ALERTA_OPS_EMAIL, ALERTA_OPS_REMETENTE e MICROSOFT_* no Railway.');
  } else {
    console.log('[VIGIA] ativo · 1 min · avisa:', destinatarios().join(', '));
  }
  cron.schedule('* * * * *', () => {
    cicloVigia().catch((e) => console.error('[VIGIA] ciclo falhou:', e?.message));
  });
}
