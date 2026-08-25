/**
 * O que um supervisor de área pode escalar.
 *
 * ⚠️⚠️ ISTO É PERMISSÃO, não preferência de tela. Até 18/08/2026 as dez rotas
 * de escala do app usavam `vol_area_supervisores` só como PORTA — `if
 * (!areas.length) return 403` — e depois IGNORAVAM a lista. Quem fosse
 * supervisor de qualquer coisa montava escala de TODAS as áreas, enquanto o
 * card no app do membro já prometia "monte e veja as escalas da sua área".
 *
 * ⚠️ E os dois campos chamados "área" nunca se cruzaram: a supervisão guardava
 * dimensão de CULTO (kids, sede, quarta, ami, bridge, online, geral — lista
 * fixa no código da tela) e a equipe guarda área de VOLUNTARIADO em
 * `vol_teams.area` (Louvor, Produção, Integração, Cuidados…). Comparar um com o
 * outro casaria só 'kids' e 'online', por coincidência.
 */

/** Normaliza pra comparar: sem acento, minúsculas, espaço colapsado. */
function chaveArea(v) {
  return String(v == null ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'geral' é o curinga: supervisiona tudo. É o que preserva quem já tinha acesso. */
const CURINGA = 'geral';


/**
 * A equipe está sob a supervisão desta pessoa?
 *
 * ⚠️ Equipe SEM área não pertence a ninguém, e isso é de propósito. Mostrá-la
 * "porque não dá pra saber de quem é" devolveria o comportamento antigo — todo
 * supervisor vendo tudo — pela porta dos fundos, bastando uma equipe ficar sem
 * área preenchida. Quem precisa dela cadastra a área, que é correção de 5
 * segundos na tela de Equipes.
 */
function equipeSupervisionada(equipe, areasDoSupervisor) {
  if (supervisionaTudo(areasDoSupervisor)) return true;
  const alvo = chaveArea(equipe && equipe.area);
  if (!alvo) return false;
  // ⚠️ Nível de EQUIPE: ignora o recorte de subárea de propósito. A equipe é o
  // container da área; quem supervisiona só o Ofertório ainda precisa VER a
  // equipe Integração pra chegar na vaga dele. O corte fino é no item.
  return normalizarConcessoes(areasDoSupervisor).some((g) => chaveArea(g.area) === alvo);
}

/** Filtra itens (de composição, de equipe…) pelo que a pessoa supervisiona. */
function filtrarPorSupervisao(itens, areasDoSupervisor, lerArea) {
  const ler = lerArea || ((i) => i && i.area);
  if (supervisionaTudo(areasDoSupervisor)) return itens || [];
  const permitidas = new Set(normalizarConcessoes(areasDoSupervisor).map((g) => chaveArea(g.area)).filter(Boolean));
  return (itens || []).filter((i) => {
    const a = chaveArea(ler(i));
    return !!a && permitidas.has(a);
  });
}


// ══════════════════════════════════════════════════════════════════════════
// SUBÁREA (2026-08-25) · a concessão passou a ter dois níveis
// ══════════════════════════════════════════════════════════════════════════
//
// Uma CONCESSÃO é `{ area, position_id }`. `position_id` NULL = curinga ("toda
// a área"), que é o que preserva quem já tinha acesso antes desta mudança.
//
// ⚠️ A comparação de subárea é por ID, nunca por nome. Nome de posição REPETE
// entre áreas ("Recepção" em Integração e KIDS, "Cuidados" em AMI/Bridge/
// Voluntariado). Comparar texto faria a concessão vazar pra outra área.
//
// ⚠️ Regra de escopo: a pessoa passa se QUALQUER concessão dela cobrir o alvo.
// Uma concessão cobre quando (a) a área bate — ou é `geral` — E (b) ou ela é
// curinga de subárea, ou a subárea bate exatamente.

/** Normaliza a entrada em lista de concessões. Aceita string[] (contrato antigo). */
function normalizarConcessoes(entrada) {
  return (entrada || []).map((g) => (
    typeof g === 'string' ? { area: g, position_id: null } : { area: g && g.area, position_id: (g && g.position_id) || null }
  ));
}

/**
 * Supervisiona TUDO? Só quem tem `geral` SEM recorte de subárea.
 *
 * ⚠️ `geral` + uma subárea NÃO é curinga: seria "todas as áreas, mas só o
 * Ofertório", e tratar isso como tudo devolveria o bug de 18/08 (supervisor de
 * qualquer coisa montando escala de todas as áreas) pela porta dos fundos.
 */
function supervisionaTudo(entrada) {
  return normalizarConcessoes(entrada).some((g) => chaveArea(g.area) === CURINGA && !g.position_id);
}

/** Uma concessão cobre este alvo `{ area, position_id }`? */
function _cobre(g, alvo) {
  const areaOk = chaveArea(g.area) === CURINGA || (!!chaveArea(alvo.area) && chaveArea(g.area) === chaveArea(alvo.area));
  if (!areaOk) return false;
  if (!g.position_id) return true;             // curinga de subárea
  return !!alvo.position_id && String(g.position_id) === String(alvo.position_id);
}

/**
 * A pessoa pode mexer neste alvo?
 *
 * ⚠️ Alvo SEM subárea resolvível é NEGADO para quem tem concessão de subárea —
 * mesma lei da equipe sem área: liberar "porque não dá pra saber" devolve o
 * acesso amplo bastando um `position_id` vazio na linha. Quem precisa cadastra
 * a posição, que é correção de segundos na tela de Equipes.
 */
function podeSupervisionar(entrada, alvo) {
  const gs = normalizarConcessoes(entrada);
  if (gs.some((g) => chaveArea(g.area) === CURINGA && !g.position_id)) return true;
  return gs.some((g) => _cobre(g, alvo || {}));
}

/** Só as subáreas concedidas nesta área (vazio = a área inteira). */
function subareasNaArea(entrada, area) {
  const gs = normalizarConcessoes(entrada).filter((g) => chaveArea(g.area) === chaveArea(area) || chaveArea(g.area) === CURINGA);
  if (gs.some((g) => !g.position_id)) return [];   // curinga: sem recorte
  return [...new Set(gs.map((g) => String(g.position_id)))];
}

module.exports = {
  chaveArea, supervisionaTudo, equipeSupervisionada, filtrarPorSupervisao, CURINGA,
  normalizarConcessoes, podeSupervisionar, subareasNaArea,
};
