/**
 * A FOTO do voluntário — régua única.
 *
 * ⚠️⚠️ `vol_profiles.avatar_url` NÃO é sinônimo de foto. O Planning Center
 * preenche esse campo com um PLACEHOLDER DE INICIAIS pra quem não subiu foto
 * (`/uploads/initials/MS.png`), então o campo está preenchido em praticamente
 * todo mundo e a maioria não é gente. Medido em 27/08/2026 nos escalados dos
 * próximos 30 dias: **226 têm `avatar_url` e só 105 são foto de verdade** — 121
 * são o placeholder. Mostrar o campo cru troca as iniciais desenhadas pelo tema
 * (que combinam com a tela) por um PNG cinza do PCO: mais bytes, resultado pior.
 *
 * Só `/uploads/person/` é foto de pessoa.
 *
 * ⚠️ A PREFERÊNCIA é a nossa foto (`mem_membros.foto_url`) — é a que a igreja
 * tirou ou a que a própria pessoa subiu pelo app (o `POST /app/membro/foto`
 * propaga pro cadastro desde 13/08). O PCO é o fallback.
 * ⚠️ Medido: no recorte acima a nossa foto acrescenta só **2 de 226**. Fica pela
 * PROCEDÊNCIA, não pelo volume — e o volume cresce conforme o app é usado.
 *
 * ⚠️ Esta régua nasceu inline em `backend/routes/app.js` (PR #2733, o check-in
 * do supervisor no app). Virou util em 27/08 porque a tela de MONTAR ESCALA
 * passou a mostrar foto também — duas cópias divergiriam, e o sintoma seria o
 * app e o ERP discordando sobre quem tem foto.
 */

/** `true` só pra URL de foto de PESSOA do Planning Center. */
function ehFotoDeVerdade(u) {
  return !!u && /\/uploads\/person\//.test(String(u));
}

/**
 * Escolhe a foto de um `vol_profiles` que veio com o embed
 * `membro:mem_membros(foto_url)`. Devolve `null` quando não há foto de verdade
 * — nunca o placeholder, e nunca string vazia (que o front trataria como URL).
 */
function fotoDoPerfil(vp) {
  if (!vp) return null;
  const m = Array.isArray(vp.membro) ? vp.membro[0] : vp.membro;
  const nossa = (m && m.foto_url) || null;
  if (nossa) return nossa;
  return ehFotoDeVerdade(vp.avatar_url) ? vp.avatar_url : null;
}

const LOTE_IDS = 200;

/**
 * `{ [vol_profile_id]: url|null }` pros ids pedidos.
 *
 * ⚠️ `db` vem por PARÂMETRO: `supabase` não é módulo-escopo em vários arquivos
 * do backend, e usá-lo livre aqui estouraria ReferenceError só na primeira
 * execução real (a armadilha que já mordeu em 25 e 26/08).
 * ⚠️ `.in()` em lotes de 200 — lista longa estoura a URL do PostgREST.
 * ⚠️ Falha de consulta devolve o que já deu, sem lançar: foto é enfeite, e
 * derrubar a montagem de escala por causa dela seria trocar um problema
 * cosmético por um operacional.
 */
async function mapaDeFotos(db, ids) {
  const alvo = [...new Set((ids || []).filter(Boolean))];
  const mapa = {};
  for (let i = 0; i < alvo.length; i += LOTE_IDS) {
    const { data, error } = await db.from('vol_profiles')
      .select('id, avatar_url, membresia_id, membro:mem_membros(foto_url)')
      .in('id', alvo.slice(i, i + LOTE_IDS));
    if (error) { console.error('[foto-voluntario]', error.message); continue; }
    for (const vp of data || []) mapa[vp.id] = fotoDoPerfil(vp);
  }
  return mapa;
}

module.exports = { ehFotoDeVerdade, fotoDoPerfil, mapaDeFotos };
