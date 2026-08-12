// Régua ÚNICA de "esta compra é pequena o bastante pra dispensar o financeiro?"
// (decisão do Matheus · 2026-08-12).
//
// CONTEXTO. O fluxo de compras tem DOIS portões independentes:
//   1. ORIGEM     — diretor da área / pastor presidente (mérito).
//   2. FINANCEIRO — o coordenador financeiro aprova antes de o dinheiro sair.
// A decisão de 22/07 já dispensava o portão 1 para pedido ESTIMADO em até
// R$ 1.000 (`COMPRA_COTACAO_DIRETA_MOTIVO`, em routes/solicitacoes.js). O que
// faltava — e é o que este arquivo entrega — é dispensar o portão 2 quando a
// COTAÇÃO REAL fica dentro do mesmo teto: aí quem executa é a própria logística.
//
// ⚠️ O valor que manda é o COTADO, nunca o estimado. O estimado é palpite de
// quem pediu; o cotado é o preço que vai ser pago. Dispensar sobre a estimativa
// deixaria passar compra de R$ 3.000 que entrou como "uns R$ 800".
//
// ⚠️ POR QUE NÃO USAR `area_alcadas` (a tabela de limites que já existe):
// medido em produção em 2026-08-12, ela só tem linha para as 6 áreas de CULTO
// (ami, bridge, cba, kids, online, sede), enquanto `solicitacoes.area_cliente`
// das compras é a área ADMINISTRATIVA (marketing, ti, producao, financeiro...).
// Das 42 compras/serviços vivos, só 10 (kids) teriam teto configurado — a regra
// valeria para 24% dos casos e ficaria calada nos outros 76%. Regra que se
// aplica só a um quarto dos casos, sem avisar, é pior que regra nenhuma.
// `area_alcadas` continua governando o que sempre governou: o gate genérico das
// OUTRAS categorias, dentro do trigger de SLA.
//
// ⚠️ TUDO AQUI É FAIL-CLOSED: qualquer dúvida (valor ilegível, categoria fora da
// regra, teto ausente) manda para o financeiro. O caro é dispensar por engano;
// mandar para o financeiro por engano só custa um clique do Alberto.

'use strict';

// Teto único da "compra pequena". É a MESMA cifra que dispensa o portão de
// origem — de propósito: dois tetos diferentes para a mesma frase ("compra de
// até mil reais") é como a operação passa a discordar do sistema.
const COMPRA_DIRETA_LIMITE = 1000;

// Só compra e serviço. Reembolso e pagamento nunca entram: ali o dinheiro sai
// da conta da igreja pela mão do financeiro, não do cartão da logística.
const CATEGORIAS_COMPRA_DIRETA = new Set(['compras', 'servico']);

const DESTINO_FINANCEIRO = 'financeiro';
const DESTINO_COMPRA_DIRETA = 'compra_direta';

/**
 * Decide para onde vai a solicitação depois que a logística registra a cotação.
 *
 * @param {object} p
 * @param {string} p.categoria          categoria da solicitação
 * @param {number|string} p.valorCotado valor REAL cotado (não o estimado)
 * @param {number} [p.limite]           teto vigente (default: COMPRA_DIRETA_LIMITE)
 * @param {boolean} [p.forcarFinanceiro] a logística pediu explicitamente o financeiro
 * @returns {{destino: string, motivo: string, limite: number}}
 */
function decidirDestinoCotacao({ categoria, valorCotado, limite, forcarFinanceiro } = {}) {
  const teto = Number.isFinite(Number(limite)) && Number(limite) > 0
    ? Number(limite)
    : COMPRA_DIRETA_LIMITE;

  // A escolha humana vence a régua. O Amaury pode querer o aval do financeiro
  // mesmo numa compra pequena (não vai no cartão dele, quer segunda opinião).
  if (forcarFinanceiro === true) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'pedido_explicito', limite: teto };
  }

  if (!CATEGORIAS_COMPRA_DIRETA.has(categoria)) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'categoria_fora_da_regra', limite: teto };
  }

  // `Number('')` é 0 e `Number(null)` é 0 — os dois passariam como "compra de
  // R$ 0,00" e dispensariam o financeiro. Por isso a ausência é barrada ANTES
  // da conversão, e não pelo Number.isFinite depois.
  if (valorCotado === null || valorCotado === undefined || valorCotado === '') {
    return { destino: DESTINO_FINANCEIRO, motivo: 'sem_valor_cotado', limite: teto };
  }
  const valor = Number(valorCotado);
  if (!Number.isFinite(valor) || valor < 0) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'valor_invalido', limite: teto };
  }

  if (valor > teto) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'acima_do_limite', limite: teto };
  }

  return { destino: DESTINO_COMPRA_DIRETA, motivo: 'dentro_do_limite', limite: teto };
}

/** Atalho de leitura para as telas/handlers. */
function dispensaFinanceiro(p) {
  return decidirDestinoCotacao(p).destino === DESTINO_COMPRA_DIRETA;
}

/** Texto humano gravado na solicitação e na timeline (auditoria). */
function motivoDispensaTexto(limite) {
  const teto = Number.isFinite(Number(limite)) && Number(limite) > 0
    ? Number(limite)
    : COMPRA_DIRETA_LIMITE;
  return `Compra de até R$ ${teto.toLocaleString('pt-BR')} · a logística executa sem aprovação financeira`;
}

module.exports = {
  COMPRA_DIRETA_LIMITE,
  CATEGORIAS_COMPRA_DIRETA,
  DESTINO_FINANCEIRO,
  DESTINO_COMPRA_DIRETA,
  decidirDestinoCotacao,
  dispensaFinanceiro,
  motivoDispensaTexto,
};
