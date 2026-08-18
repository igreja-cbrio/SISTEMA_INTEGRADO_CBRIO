/**
 * Chave de casamento de nome de "team" do Planning Center Services.
 *
 * ⚠️ Esta régua tem uma GÊMEA EM SQL — `fn_vol_pco_chave` (migration
 * 20260816120000). As duas precisam produzir exatamente a mesma string: a
 * migration semeia `vol_pco_mapa.pco_chave` com a versão SQL e o sync consulta
 * o mapa com a versão JS. Se divergirem, o sync simplesmente não acha o nome,
 * trata como não mapeado e o voluntário fica SEM EQUIPE — sem erro nenhum na
 * tela. É por isso que a régua é pura e testada.
 *
 * As três normalizações, e o que cada uma resolve no dado real do PCO:
 *  - acento fora  → "Cameras" e "Câmeras" são a mesma função (2 equipes no banco)
 *  - minúsculas   → "Preletor"/"preletor", "Check-in"/"Check-In", "LIDERANÇA"
 *  - espaço colapsado → "Broadcast ( Supervisão )" digitado com espaço duplo
 */
function chavePco(nome) {
  return String(nome == null ? '' : nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { chavePco };
