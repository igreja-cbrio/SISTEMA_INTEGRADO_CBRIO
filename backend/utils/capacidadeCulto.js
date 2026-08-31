// ════════════════════════════════════════════════════════════════════════════
//  Capacidade do ESPAÇO onde o culto acontece — a fonte única
//
//  Pedido do Matheus (31/08/2026): *"o bridge acontece no espaço cbrio que tem
//  capacidade para 100 pessoas. preciso que o cálculo de taxa de ocupação dele
//  seja diferente dos outros."*
//
//  ⚠️⚠️ ISSO JÁ FUNCIONAVA — por REGEX (`/bridge/i`), duplicado no backend e no
//  front desde 01/07. O problema não era o número: era a FONTE. Renomear o tipo
//  de culto (coisa que a equipe faz pela tela, sem PR) faria a ocupação do
//  Bridge voltar SILENCIOSAMENTE para 1050 — 46 pessoas apareceriam como 4,4%
//  em vez de 46%, e o número só pareceria "baixo", sem nada denunciando.
//
//  Agora a capacidade é DADO (`vol_service_types.capacidade_lugares`), no mesmo
//  lugar onde o tipo de culto já é configurado. NULL = templo.
// ════════════════════════════════════════════════════════════════════════════

/** Térreo do templo. Decisão do Pr. Juninho (13/08) — não são os 1300 da
 *  `vw_culto_stats`, que é dormente. */
const CAPACIDADE_TEMPLO = 1050;

/** O que o Bridge sempre usou, mantido só como rede pra quem não carregou a coluna. */
const CAPACIDADE_BRIDGE = 100;

/**
 * @param {object} tipo  linha de `vol_service_types` (ou da view, com
 *                       `service_type_name`). Precisa trazer `capacidade_lugares`.
 * @param {number} padrao  usado quando o tipo não declara capacidade.
 */
function capacidadeDoCulto(tipo, padrao = CAPACIDADE_TEMPLO) {
  const bruto = tipo?.capacidade_lugares;

  // Capacidade declarada vence tudo.
  const n = Number(bruto);
  if (Number.isFinite(n) && n > 0) return n;

  // ⚠️⚠️ `undefined` (a coluna NÃO foi carregada) é diferente de `null` (o tipo
  // usa o padrão). Só no primeiro caso o regex antigo entra como rede — é o que
  // segura bundle velho e consulta que esqueceu a coluna, sem transformar uma
  // decisão explícita ("este culto é no templo") em exceção pelo nome.
  if (bruto === undefined) {
    const nome = tipo?.name || tipo?.service_type_name || '';
    if (/bridge/i.test(nome)) return CAPACIDADE_BRIDGE;
  }
  return padrao;
}

/** Soma da capacidade dos cultos escolhidos — o denominador de "lugares
 *  OFERECIDOS". ⚠️ Lista vazia devolve 0, e quem divide TEM que tratar: taxa
 *  sobre zero é `Infinity`, que na tela vira um número absurdo. */
function capacidadeSomada(tipos, padrao = CAPACIDADE_TEMPLO) {
  if (!Array.isArray(tipos)) return 0;
  return tipos.reduce((s, t) => s + capacidadeDoCulto(t, padrao), 0);
}

module.exports = { capacidadeDoCulto, capacidadeSomada, CAPACIDADE_TEMPLO, CAPACIDADE_BRIDGE };
