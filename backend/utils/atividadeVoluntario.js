// ════════════════════════════════════════════════════════════════════════════
//  "Esse voluntário está ativo?" — a régua ÚNICA do termômetro
//
//  Pedido do Matheus (27/08/2026): filtro de inativos na lista de voluntários e
//  uma tag no nome de quem está inativo.
//
//  ⚠️⚠️ "ATIVO" JÁ TINHA DOIS SENTIDOS NA MESMA TELA, e criar um terceiro seria
//  o erro fácil aqui:
//    • o cabeçalho diz "674 ativos" → significa **não arquivado** (continua no
//      roster do Planning Center)
//    • a régua do KPI e do termômetro → **serviu nos últimos 90 dias**
//  São perguntas diferentes: dá pra estar no roster e não servir há meio ano.
//  Este arquivo responde SÓ a segunda, e a tag na tela diz "sem servir há 90+
//  dias" em vez de "inativo" solto — rótulo ambíguo em cima de duas réguas que
//  já convivem é como a tela passa a discordar de si mesma.
//
//  A régua não é nova: ela já existia dentro do endpoint de DETALHE
//  (`GET /voluntariado/volunteers/:id`), com os limiares 30/45/90. Ela saiu de
//  lá pra cá porque a LISTA passou a precisar da mesma resposta — e duas cópias
//  divergiriam no primeiro ajuste, com o sintoma sendo "a lista diz inativo e a
//  ficha diz pouco ativo sobre a mesma pessoa".
// ════════════════════════════════════════════════════════════════════════════

/** 90 dias sem servir = inativo. É a régua da casa, alinhada ao KPI. */
const LIMIAR_INATIVO_DIAS = 90;

/** Janela que a LISTA consulta. Maior que o limiar de propósito: com 120 dias
 *  dá pra distinguir 30/45/90; quem não aparece nela é "90+" com segurança. */
const JANELA_LISTA_DIAS = 120;

/** Dias inteiros desde uma data ISO. `null` quando não há data. */
function diasDesde(iso, agora = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((agora - t) / 86400000);
}

/**
 * O nível do termômetro.
 *
 * @param dias        dias desde a última atividade · `null` = nenhuma na janela
 * @param servicos4m  volume nos últimos 4 meses · omitir quando não se mediu
 *
 * ⚠️ `muito_ativo` exige o VOLUME. A lista não o calcula (seriam 674 contagens),
 * então lá o topo é `ativo` — e isso é honesto: não se afirma "muito ativo" sem
 * ter contado. Omitir o parâmetro NUNCA rebaixa alguém para inativo.
 *
 * ⚠️ `dias === null` devolve `inativo`, e o rótulo é **"90+ dias sem servir"**,
 * nunca "nunca serviu": a lista olha uma janela de 120 dias, então ausência ali
 * prova o primeiro e não prova o segundo. Afirmar que alguém nunca serviu com
 * base numa janela é o erro que este projeto já cometeu com telefone.
 */
function nivelPorDias(dias, servicos4m = null) {
  const d = Number.isFinite(dias) ? dias : Infinity;
  if (d <= 30 && Number.isFinite(servicos4m) && servicos4m >= 4) {
    return { nivel: 'muito_ativo', label: 'Muito ativo' };
  }
  if (d <= 45) return { nivel: 'ativo', label: 'Ativo' };
  if (d <= LIMIAR_INATIVO_DIAS) return { nivel: 'pouco_ativo', label: 'Pouco ativo' };
  return { nivel: 'inativo', label: 'Inativo' };
}

/** Atalho para o filtro da lista. */
function ehInativo(dias) {
  return nivelPorDias(dias).nivel === 'inativo';
}

module.exports = {
  nivelPorDias, ehInativo, diasDesde,
  LIMIAR_INATIVO_DIAS, JANELA_LISTA_DIAS,
};
