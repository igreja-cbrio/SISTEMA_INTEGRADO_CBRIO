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
const PAPEIS = Object.freeze(['leitor', 'lider', 'admin']);


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
  const gs = normalizarConcessoes(areasDoSupervisor);
  // Escopo por TIME (24/09/2026): casa pelo id da equipe, e SÓ por ele — a área
  // do time é irrelevante aqui, senão "líder da Banda" viraria "líder do Louvor".
  const id = equipe && equipe.id ? String(equipe.id) : null;
  if (id && gs.some((g) => g.team_id && String(g.team_id) === id)) return true;
  const alvo = chaveArea(equipe && equipe.area);
  if (!alvo) return false;
  // ⚠️ Nível de EQUIPE: ignora o recorte de subárea E de rodízio — quem cobre só
  // o Ofertório precisa VER a equipe pra chegar no Ofertório. O curinga `geral`
  // com recorte de culto (leitor/líder "de domingo") também vê toda equipe; o
  // recorte é aplicado depois, culto a culto, em `podeSupervisionar`.
  return gs.some((g) => !g.team_id && (chaveArea(g.area) === alvo || chaveArea(g.area) === CURINGA));
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
    typeof g === 'string'
      ? { area: g, papel: 'lider', team_id: null, position_id: null, culto_dia: null, culto_periodo: null, culto_semana: null }
      : {
        area: g && g.area,
        // ⚠️ Sem `papel` = 'lider': é o que as 37 concessões anteriores a 24/09
        // sempre foram (quem tinha concessão editava). Só 'leitor' tira a escrita.
        papel: (g && PAPEIS.includes(g.papel)) ? g.papel : 'lider',
        team_id: (g && g.team_id) || null,
        position_id: (g && g.position_id) || null,
        // Rodízio (25/08): semana × dia × período. NULL em cada eixo = curinga,
        // que é o que mantém string[] e as concessões antigas funcionando igual.
        culto_dia: (g && g.culto_dia) || null,
        culto_periodo: (g && g.culto_periodo) || null,
        culto_semana: (g && g.culto_semana) || null,
      }
  ));
}

/**
 * Supervisiona TUDO? Só quem tem `geral` SEM recorte de subárea.
 *
 * ⚠️ `geral` + uma subárea NÃO é curinga: seria "todas as áreas, mas só o
 * Ofertório", e tratar isso como tudo devolveria o bug de 18/08 (supervisor de
 * qualquer coisa montando escala de todas as áreas) pela porta dos fundos.
 */
function _semRecorte(g) {
  return !g.team_id && !g.position_id && !g.culto_dia && !g.culto_periodo && !g.culto_semana;
}

function supervisionaTudo(entrada) {
  return normalizarConcessoes(entrada).some((g) => chaveArea(g.area) === CURINGA && _semRecorte(g));
}

/** Uma concessão cobre este alvo `{ area, position_id, culto }`? */
function _cobre(g, alvo) {
  if (g.team_id) {
    // Escopo por TIME manda: o alvo precisa dizer de que time é. Alvo sem
    // `team_id` é NEGADO pela mesma lei da equipe sem área — liberar "porque não
    // dá pra saber" devolveria acesso amplo bastando omitir o id.
    if (!(alvo.team_id && String(g.team_id) === String(alvo.team_id))) return false;
  } else {
    const areaOk = chaveArea(g.area) === CURINGA || (!!chaveArea(alvo.area) && chaveArea(g.area) === chaveArea(alvo.area));
    if (!areaOk) return false;
  }
  // Subárea
  if (g.position_id && !(alvo.position_id && String(g.position_id) === String(alvo.position_id))) return false;
  // Rodízio · delegado à régua pura (`utils/rodizioCulto`), que é quem sabe
  // que a 5ª semana repete a 1ª e que quarta é culto único.
  const { cultoCoberto } = require('./rodizioCulto');
  return cultoCoberto(g, alvo.culto || null);
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
  if (gs.some((g) => chaveArea(g.area) === CURINGA && _semRecorte(g))) return true;
  return gs.some((g) => _cobre(g, alvo || {}));
}

/** Só as subáreas concedidas nesta área (vazio = a área inteira). */
function subareasNaArea(entrada, area, teamId) {
  const gs = normalizarConcessoes(entrada).filter((g) => (
    g.team_id
      ? (!!teamId && String(g.team_id) === String(teamId))
      : (chaveArea(g.area) === chaveArea(area) || chaveArea(g.area) === CURINGA)
  ));
  if (gs.some((g) => !g.position_id)) return [];   // curinga: sem recorte
  return [...new Set(gs.map((g) => String(g.position_id)))];
}

/**
 * PAPÉIS (24/09/2026 · pedido do Marcos): leitor abre a Montar escala e só lê;
 * lider (= editor) altera; admin é o `geral` sem recorte de quem gerencia
 * pessoas e estruturas (Marcos e Matheus). "Nenhuma" é não ter linha.
 * A lista mora no topo do arquivo (`PAPEIS`) porque `normalizarConcessoes` a usa.
 */

/** Só as concessões que ESCREVEM. É o que as rotas de POST/PATCH/DELETE usam. */
function soEditores(entrada) {
  return normalizarConcessoes(entrada).filter((g) => g.papel !== 'leitor');
}

/** Tem concessão, mas nenhuma escreve — a tela mostra e esconde os botões. */
function somenteLeitura(entrada) {
  const gs = normalizarConcessoes(entrada);
  return gs.length > 0 && gs.every((g) => g.papel === 'leitor');
}

/** O maior papel entre as concessões (pra tela dizer "Leitor" / "Líder" / "Admin"). */
function papelMaior(entrada) {
  const gs = normalizarConcessoes(entrada);
  if (!gs.length) return null;
  if (gs.some((g) => g.papel === 'admin' || (chaveArea(g.area) === CURINGA && _semRecorte(g)))) return 'admin';
  if (gs.some((g) => g.papel === 'lider')) return 'lider';
  return 'leitor';
}

/**
 * Este CULTO está no escopo de alguma concessão? Só olha o eixo do rodízio
 * (dia × período × semana) — é o filtro da LISTA de cultos: quem só lê o
 * domingo não precisa ver a quarta na lista pra descobrir que ela vem vazia.
 */
function cultoNoEscopo(entrada, culto) {
  const { cultoCoberto } = require('./rodizioCulto');
  return normalizarConcessoes(entrada).some((g) => cultoCoberto(g, culto || null));
}

/**
 * Esta pessoa GERENCIA A ESTRUTURA deste time — vincular gente, dizer em quais
 * cultos serve, tirar do time (24/09/2026 · decisão do Marcos: "abrir a tela
 * Pessoas do Servir pra quem é Líder, recortada aos times que a pessoa lidera").
 *
 * É mais estreito que `equipeSupervisionada`, de propósito: estrutura não tem
 * culto nem subárea. Supervisora só do Ofertório do 2º domingo monta a escala
 * dela, mas não vincula gente à Integração inteira. Vale a concessão que:
 *   · escreve (papel ≠ leitor) e
 *   · não tem recorte de subárea nem de rodízio, e
 *   · é do TIME (team_id) ou da ÁREA inteira (legado) ou geral.
 * Admin (geral sem recorte) gerencia todos.
 */
function gerenciaEstruturaDoTime(entrada, equipe) {
  const gs = normalizarConcessoes(entrada).filter((g) => (
    g.papel !== 'leitor' && !g.position_id && !g.culto_dia && !g.culto_periodo && !g.culto_semana
  ));
  if (gs.some((g) => chaveArea(g.area) === CURINGA && !g.team_id)) return true;
  if (!equipe) return false;
  const id = equipe.id ? String(equipe.id) : null;
  const area = chaveArea(equipe.area);
  return gs.some((g) => (
    g.team_id ? (!!id && String(g.team_id) === id) : (!!area && chaveArea(g.area) === area)
  ));
}

/** Gerencia a estrutura de ALGUM time? (é o que acende o card "Pessoas do Servir"). */
function gerenciaAlgumaEstrutura(entrada) {
  return normalizarConcessoes(entrada).some((g) => (
    g.papel !== 'leitor' && !g.position_id && !g.culto_dia && !g.culto_periodo && !g.culto_semana
  ));
}

module.exports = {
  chaveArea, supervisionaTudo, equipeSupervisionada, filtrarPorSupervisao, CURINGA, PAPEIS,
  normalizarConcessoes, podeSupervisionar, subareasNaArea,
  soEditores, somenteLeitura, papelMaior, cultoNoEscopo,
  gerenciaEstruturaDoTime, gerenciaAlgumaEstrutura,
};
