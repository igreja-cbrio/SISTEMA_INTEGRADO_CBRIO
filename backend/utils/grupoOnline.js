// ════════════════════════════════════════════════════════════════════════════
//  "Este grupo é ONLINE?" — a régua, num lugar só
//
//  ⚠️⚠️ NÃO EXISTE COLUNA `modalidade` em `mem_grupos` (já registrado em
//  31/07/2026). Quem responde isso é `bairro = 'Online'` OU `local` contendo
//  "online" — e é essa régua que o geocodificador usa pra PULAR grupo online.
//  Rotina nova que invente outro critério vai "consertar" grupo que está certo
//  do jeito que está, ou mandar geocodificar um endereço que não existe.
//
//  Extraída de `routes/grupos.js` (geocode em massa) em 31/08/2026, quando a
//  sugestão de resposta do inbox passou a precisar da mesma pergunta — a 2ª
//  cópia é como as duas passariam a discordar sobre o mesmo grupo.
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ `bairro` é comparado EXATO (é valor de catálogo, escrito pela equipe) e
 * `local` por conteúdo (texto livre: "Online — Zoom", "Grupo online"). Trocar
 * um pelo outro muda quais grupos casam.
 */
function ehGrupoOnline(grupo) {
  if (!grupo) return false;
  if (grupo.bairro === 'Online') return true;
  return String(grupo.local || '').toLowerCase().includes('online');
}

module.exports = { ehGrupoOnline };
