// Modo demonstracao · ativado SOMENTE quando VITE_DEMO_MODE === 'true'.
// Sem essa env (producao), tudo aqui vira no-op: a rota /demo redireciona
// pro login normal e o root nao muda de comportamento. Nunca liga sozinho.
//
// As credenciais ficam em envs do build (VITE_*) de proposito · o ambiente
// demo aponta pra um projeto Supabase SEPARADO, com dados 100% ficticios,
// entao expor o login do usuario demo no bundle nao expoe nada real.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || 'demo@cbrio.dev';
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '';
