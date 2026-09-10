// varredura 2026-09: PUB-01 — busca PAGINADA do auth user por e-mail.
//
// O bug que isto fecha: `supabase.auth.admin.listUsers()` SEM argumento devolve
// só a PRIMEIRA página (50 no supabase-js 2.x). Com 205 usuários medidos, ~155
// eram invisíveis — a pergunta "esse e-mail já tem conta?" respondia NÃO para 3
// de cada 4 contas que EXISTEM. Quem já tinha conta caía no ramo de CRIAR e
// levava "user already registered": no /devocional/login isso é a porta fechada
// na cara de quem tem direito de entrar.
//
// Régua única de propósito: as duas portas públicas (publicMembresia.js e
// publicDevocional.js) faziam a MESMA pergunta e a resposta tinha que ser a
// mesma. Cópia local em cada rota foi como uma delas ficou para trás.
//
// ⚠️ Comparação em minúsculas dos dois lados: o e-mail do auth vem como o
// usuário digitou e o chamador pode passar qualquer caixa.

const { supabase } = require('./supabase');

const PER_PAGE = 200;
// Teto de páginas pra não virar varredura infinita se a API mudar de forma
// (200 × 50 = 10.000 usuários; a base tem ~205).
const MAX_PAGINAS = 50;

// Retorna o auth user cujo e-mail bate, ou null. Propaga erro de infra —
// responder "não existe" por causa de uma falha de rede é o que criava conta
// duplicada / erro "already registered".
async function acharAuthUserPorEmail(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return null;

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const users = data?.users || [];
    const achado = users.find((u) => (u.email || '').toLowerCase() === alvo);
    if (achado) return achado;
    // Página incompleta = última página. Para aqui em vez de varrer o teto.
    if (users.length < PER_PAGE) return null;
  }
  return null;
}

module.exports = { acharAuthUserPorEmail };
