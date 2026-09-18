// Cliente HTTP das PORTAS PÚBLICAS de pesquisa (censo e NPS).
//
// ⚠️⚠️ ELE VIVE FORA DO `src/api.js` DE PROPÓSITO (11/09/2026).
//
// `api.js` importa `./supabaseClient` e, NO CARREGAMENTO DO MÓDULO, chama
// `supabase.auth.getSession()` + `onAuthStateChange`. Quem só quer responder um
// questionário não tem sessão nenhuma — mas pagava o `@supabase/supabase-js`
// inteiro (mais o Sentry, por `lib/sentry`) só para poder fazer um `fetch`.
//
// Isso importa porque a página do censo é a única do sistema aberta por
// CENTENAS DE CELULARES NO MESMO MINUTO, no WiFi de um templo cheio. Medido em
// 11/09: o chunk de entrada do ERP tinha 1.051 KB (326 KB comprimido) e era
// baixado por toda pessoa que escaneava o QR. Este arquivo é o que permite a
// entrada própria (`censo.html`) não arrastar nada do ERP.
//
// ⚠️ NÃO IMPORTE NADA PESADO AQUI. A régua é: `fetch`, e só. Sem supabase, sem
// Sentry, sem cliente de query. Se precisar de token de usuário, o lugar é o
// `api.js` — esta porta é pública por definição.

import { resolveApiBaseUrl } from './api-base';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

/**
 * Retry com backoff para as chamadas públicas de pesquisa (evento com pico).
 *
 * Retenta em falha de rede e nos status de proteção de BORDA (403 challenge da
 * Vercel / 429 / 5xx) — que barram ANTES do servidor, então repetir é seguro.
 * NÃO retenta 400/404/409: dado inválido, pesquisa fechada e "já respondeu" não
 * melhoram com insistência.
 *
 * ⚠️ O STATUS VIAJA NO ERRO (`err.status`, `err.dados`). Sem ele quem chama não
 * distingue "a rede caiu, insista" de "o servidor recusou" — e era isso que
 * fazia a fila offline do censo retentar um 400 a cada 8 segundos para sempre,
 * com a tela já tendo dito "Obrigado!".
 */
export async function fetchPublicoComRetry(doFetch, { tentativas = 3, msg = 'Erro' } = {}) {
  const RETRIABLE = new Set([403, 429, 502, 503, 504]);
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await doFetch();
      if (r.ok) return await r.json().catch(() => ({}));
      if (!RETRIABLE.has(r.status) || i === tentativas - 1) {
        const data = await r.json().catch(() => ({}));
        const err = new Error(data.error || msg);
        err.status = r.status;
        err.dados = data;
        throw err;
      }
      ultimo = new Error(`http_${r.status}`);
    } catch (e) {
      ultimo = e;
      if (i === tentativas - 1) throw e;
    }
    // backoff: ~0.5s, 1.2s, 2.5s + jitter · espalha as re-tentativas do pico
    await new Promise((res) => setTimeout(res, (500 * Math.pow(2, i)) + Math.random() * 400));
  }
  throw ultimo || new Error(msg);
}

// Censo · porta PÚBLICA (QR no culto, link pessoal, app do membro).
export const censoPublico = {
  obter: (slug) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}`, { headers: { 'Content-Type': 'application/json' } }),
      { tentativas: 4, msg: 'Erro ao carregar o censo' },
    ),
  // Atalho opcional: quem já está na base não redigita nome/telefone/e-mail.
  // Resposta NEUTRA por definição — não dá para saber se um CPF existe.
  prefill: (slug, dados) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/prefill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      }),
      { tentativas: 2, msg: 'Não foi possível verificar' },
    ),
  // Listas longas com busca. As opções NÃO vêm no questionário: 1.911 igrejas em
  // cada abertura seria absurdo.
  catalogo: (nome, q) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/catalogo/${encodeURIComponent(nome)}?q=${encodeURIComponent(q)}`,
        { headers: { 'Content-Type': 'application/json' } }),
      { tentativas: 2, msg: 'Erro na busca' },
    ),
  parcial: (slug, dados) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/parcial`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      }),
      { tentativas: 2, msg: 'Não foi possível salvar' },
    ),
  retomar: (slug, dados) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/retomar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      }),
      { tentativas: 2, msg: 'Não foi possível retomar' },
    ),
  responder: (slug, payload) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }),
      { tentativas: 3, msg: 'Erro ao enviar resposta' },
    ),
  // Última tentativa enquanto a aba fecha. O `envio_id` no payload garante que
  // um beacon a mais não crie resposta duplicada.
  responderBeacon: (slug, payload) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
      const url = `${API}/public/censo/${encodeURIComponent(slug)}/responder`;
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    } catch { return false; }
  },
};

/**
 * Catálogo de bairros do seletor (porta pública de membresia).
 *
 * ⚠️ MORA AQUI, e não no `api.js`, por causa do censo (11/09/2026): o
 * `seletor-bairro` é usado pela pergunta de bairro do questionário, e por
 * importar de `api.js` ele arrastava o `@supabase/supabase-js` e o Sentry para
 * dentro da página pública — medido depois do deploy: o chunk compartilhado
 * ainda tinha os dois, 251 KB comprimidos que todo celular do culto baixava.
 *
 * ⚠️ Falha devolve lista VAZIA em vez de lançar — o seletor degrada para campo
 * de texto e a pessoa termina de responder. Catálogo indisponível não pode
 * travar porta pública.
 */
export async function bairrosPublicos() {
  try {
    const res = await fetch(`${API}/public/membresia/bairros`);
    if (!res.ok) return { bairros: [] };
    return res.json();
  } catch {
    return { bairros: [] };
  }
}
