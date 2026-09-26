'use strict';

// ============================================================================
// Régua PURA · as FLAGS que DEFINEM um tipo de culto (`vol_service_types`)
//
// Causa raiz que isto fecha (24/09/2026): o `POST /voluntariado/service-types`
// aceitava só name/description/recurrence_day/recurrence_time/color, e o `PUT`
// esses + is_active. Tudo o mais nascia no DEFAULT da coluna — e os defaults
// são OPOSTOS entre si:
//
//   presencial_label   NOT NULL DEFAULT 'Presencial'   (migration 20260514120000)
//   has_kids           NOT NULL DEFAULT false          (migration 20260514120000)
//   has_online         NOT NULL DEFAULT false          (migration 20260514120000)
//   has_online_stream  NOT NULL DEFAULT true           (migrations_manual/20260420)
//
// Resultado medido: tipo criado pela tela nasce MATERIALIZANDO cultos (o cron
// `/kpis/cultos/auto-create` filtra `has_online_stream=true`) e ao mesmo tempo
// SEM Kids, SEM online e com o rótulo genérico — ou seja, culto que existe no
// banco, dispara os 2 gatilhos pesados de KPI/NSM, e:
//   · nenhuma criança consegue fazer check-in (has_kids=false é portão duro no
//     totem, no resumo Kids e na coleta da Integração);
//   · o pipeline online o ignora em silêncio (has_online=false → o live-monitor
//     devolve `reason:'fora_de_janela'`, que aponta a CAUSA ERRADA);
//   · ele some do bloco de domingo e da ocupação, porque `dashboardSemanal.js`
//     usa `presencial_label='Sede'` como discriminador dos cultos do TEMPLO.
// Foi assim que nasceram os 3 tipos CBKIDS fantasmas que inflaram o denominador
// de cultos antes do corte de 24/08.
//
// ⚠️⚠️ O DEFAULT DE CRIAÇÃO É `has_online_stream: false`, E É DELIBERADO.
// A coluna foi criada para dizer "tem transmissão no YouTube" (o texto da
// própria migration manual: "Cultos sem online (ex.: Bridge) ficam de fora da
// coleta automática D+1/D+7"), e ALGUÉM a transformou no portão do cron que
// MATERIALIZA culto. Enquanto esse duplo sentido existir, o lado caro de errar
// é o `true`: um tipo criado sem pensar (ou de teste) vira fábrica semanal de
// cultos, cada linha custando ~1,3 s de gatilho e entrando em denominador de
// KPI. Errar para `false` deixa o tipo inerte até alguém ligá-lo de propósito —
// visível e reversível. Não inverta este default sem resolver antes o duplo
// sentido da coluna (ver a seção no CLAUDE.md).
//
// ⚠️ `false` NÃO é o mesmo que ausente. A coluna é NOT NULL, então o banco não
// distingue "ninguém decidiu" de "decidiram que não" — quem tem de preservar a
// distinção é esta função: no modo 'atualizar', campo AUSENTE não entra no
// patch (o PUT não pode zerar o que a tela não mandou), e `false` EXPLÍCITO
// entra (é a pessoa desligando).
//
// ⚠️ Valor não-booleano é RECUSADO, nunca coagido. `Boolean('false')` é `true`,
// e "valor default plausível numa coluna de registro é palpite gravado como
// fato" — aqui o palpite decidiria se criança faz check-in.
// ============================================================================

/** As 3 flags booleanas que o CRUD de tipo de culto passa a aceitar. */
const FLAGS_BOOLEANAS = Object.freeze(['has_kids', 'has_online', 'has_online_stream']);

/**
 * O que é preenchido na CRIAÇÃO quando quem chama não disse nada.
 * Só `has_online_stream` está aqui: as outras três já têm default seguro na
 * coluna (`false`/'Presencial'), e repeti-las aqui só criaria uma segunda
 * verdade sobre o default para manter em dia.
 */
const DEFAULT_AO_CRIAR = Object.freeze({ has_online_stream: false });

const ehBooleanoReal = (v) => v === true || v === false;

/**
 * Normaliza as flags de um payload de tipo de culto.
 *
 * @param {object} body        corpo da requisição (pode ser null/undefined)
 * @param {{modo: 'criar'|'atualizar'}} opcoes
 * @returns {{ok: true, patch: object} | {ok: false, campo: string, erro: string}}
 */
function normalizarFlagsTipoCulto(body, opcoes) {
  const modo = opcoes && opcoes.modo;
  if (modo !== 'criar' && modo !== 'atualizar') {
    // Erro de PROGRAMAÇÃO (não de payload): falha alto, não devolve {ok:false}.
    throw new Error("normalizarFlagsTipoCulto: modo tem que ser 'criar' ou 'atualizar'");
  }

  const origem = body && typeof body === 'object' ? body : {};
  const patch = {};

  for (const flag of FLAGS_BOOLEANAS) {
    const bruto = origem[flag];
    if (bruto === undefined) continue;
    if (!ehBooleanoReal(bruto)) {
      return {
        ok: false,
        campo: flag,
        erro: `${flag} tem que ser true ou false (recebi ${JSON.stringify(bruto)}).`,
      };
    }
    patch[flag] = bruto;
  }

  if (origem.presencial_label !== undefined) {
    const bruto = origem.presencial_label;
    if (typeof bruto !== 'string') {
      return {
        ok: false,
        campo: 'presencial_label',
        erro: `presencial_label tem que ser texto (recebi ${JSON.stringify(bruto)}).`,
      };
    }
    const limpo = bruto.trim();
    if (!limpo) {
      // A coluna é NOT NULL: string vazia viraria rótulo em branco no modal de
      // culto, que é pior que o default genérico.
      return {
        ok: false,
        campo: 'presencial_label',
        erro: 'presencial_label não pode ficar em branco.',
      };
    }
    patch.presencial_label = limpo;
  }

  if (modo === 'criar') {
    for (const chave of Object.keys(DEFAULT_AO_CRIAR)) {
      if (patch[chave] === undefined) patch[chave] = DEFAULT_AO_CRIAR[chave];
    }
  }

  return { ok: true, patch };
}

module.exports = { normalizarFlagsTipoCulto, FLAGS_BOOLEANAS, DEFAULT_AO_CRIAR };
