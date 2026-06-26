import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Diagnóstico detalhado · em production e preview do Vercel, o frontend so
// recebe env vars que comecem com VITE_. Se o usuário configurou no Vercel
// sem prefixo (ex: SUPABASE_URL), elas existem para serverless mas NÃO para
// o browser. Esse log lista quais VITE_* o build tem para facilitar debug.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const viteKeys = Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_'));
  const hasUrl = !!SUPABASE_URL;
  const hasKey = !!SUPABASE_ANON_KEY;
  console.error(
    '[Supabase] Variaveis não configuradas:\n' +
    `  VITE_SUPABASE_URL: ${hasUrl ? 'OK' : 'AUSENTE'}\n` +
    `  VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY): ${hasKey ? 'OK' : 'AUSENTE'}\n` +
    `  VITE_* vars expostas no build: [${viteKeys.join(', ') || 'nenhuma'}]\n` +
    '  Verifique no Vercel:\n' +
    '    1. Nome com prefixo VITE_ (ex: VITE_SUPABASE_URL, não SUPABASE_URL).\n' +
    '    2. Checkbox "Preview" marcado em cada variavel.\n' +
    '    3. Redeploy do preview após editar as envs (envs novas não retroagem em builds antigos).'
  );
}

// Lock NO-OP para o auth · ⚠️ NÃO reativar o lock padrão sem resolver o deadlock.
// O lock padrão do supabase-js (Web Locks API · `lock:sb-<ref>-auth-token`) usa
// timeout INFINITO ao adquirir. Quando o lock fica órfão (aba travada, refresh
// abortado, reload no meio de um refresh), o `getSession()` que roda no carregamento
// (AuthContext) PENDURA PRA SEMPRE → "carregando infinito / não consigo acessar".
// Bug conhecido e ativo do supabase-js: issues #1594, #2111, #2013.
// O no-op desliga o Web Lock (o auth roda direto, sem travar) — corrige o deadlock
// E os warnings "lock ... was released because another request stole it".
// Trade-off: sem coordenação de refresh ENTRE ABAS (race raro e auto-recuperável —
// muito menos grave que pendurar o sistema). Incidente 2026-06-26.
const noOpLock = async (_name, _acquireTimeout, fn) => fn();

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { lock: noOpLock } })
  : null;

// Helper pra a tela de Login mostrar diagnóstico claro ao inves de "Supabase não configurado"
export const supabaseDiagnostico = {
  configurado: !!supabase,
  urlPresente: !!SUPABASE_URL,
  keyPresente: !!SUPABASE_ANON_KEY,
  viteKeysExpostas: Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_')),
};
