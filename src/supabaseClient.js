import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Diagnostico detalhado · em production e preview do Vercel, o frontend so
// recebe env vars que comecem com VITE_. Se o usuario configurou no Vercel
// sem prefixo (ex: SUPABASE_URL), elas existem para serverless mas NAO para
// o browser. Esse log lista quais VITE_* o build tem para facilitar debug.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const viteKeys = Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_'));
  const hasUrl = !!SUPABASE_URL;
  const hasKey = !!SUPABASE_ANON_KEY;
  console.error(
    '[Supabase] Variaveis nao configuradas:\n' +
    `  VITE_SUPABASE_URL: ${hasUrl ? 'OK' : 'AUSENTE'}\n` +
    `  VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY): ${hasKey ? 'OK' : 'AUSENTE'}\n` +
    `  VITE_* vars expostas no build: [${viteKeys.join(', ') || 'nenhuma'}]\n` +
    '  Verifique no Vercel:\n' +
    '    1. Nome com prefixo VITE_ (ex: VITE_SUPABASE_URL, nao SUPABASE_URL).\n' +
    '    2. Checkbox "Preview" marcado em cada variavel.\n' +
    '    3. Redeploy do preview apos editar as envs (envs novas nao retroagem em builds antigos).'
  );
}

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Helper pra a tela de Login mostrar diagnostico claro ao inves de "Supabase nao configurado"
export const supabaseDiagnostico = {
  configurado: !!supabase,
  urlPresente: !!SUPABASE_URL,
  keyPresente: !!SUPABASE_ANON_KEY,
  viteKeysExpostas: Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_')),
};
