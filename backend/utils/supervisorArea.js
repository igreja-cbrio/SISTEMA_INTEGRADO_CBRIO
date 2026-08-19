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

function supervisionaTudo(areasDoSupervisor) {
  return (areasDoSupervisor || []).some((a) => chaveArea(a) === CURINGA);
}

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
  return (areasDoSupervisor || []).some((a) => chaveArea(a) === alvo);
}

/** Filtra itens (de composição, de equipe…) pelo que a pessoa supervisiona. */
function filtrarPorSupervisao(itens, areasDoSupervisor, lerArea) {
  const ler = lerArea || ((i) => i && i.area);
  if (supervisionaTudo(areasDoSupervisor)) return itens || [];
  const permitidas = new Set((areasDoSupervisor || []).map(chaveArea).filter(Boolean));
  return (itens || []).filter((i) => {
    const a = chaveArea(ler(i));
    return !!a && permitidas.has(a);
  });
}

module.exports = { chaveArea, supervisionaTudo, equipeSupervisionada, filtrarPorSupervisao, CURINGA };
