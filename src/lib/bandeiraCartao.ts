// Bandeira do cartão a partir do BIN (os 6-8 primeiros dígitos).
//
// ⚠️ POR QUE ISTO PODE EXISTIR, sendo que a lei nº 5 do núcleo de pagamentos
// proíbe o número do cartão de tocar o nosso código: o BIN **não é** o número do
// cartão. Ele identifica o EMISSOR, é o mesmo para milhões de cartões, e o
// próprio PCI DSS trata os 6 primeiros dígitos como parte da forma TRUNCADA que
// pode ser exibida e guardada. Quem nos entrega o BIN é o SDK do provedor
// (callback `onBinChange` do Card Payment Brick) — nós não lemos campo nenhum.
//
// ⚠️ NÃO estender este arquivo para receber o PAN inteiro, validar Luhn ou
// guardar dígito. No instante em que o número completo passar por aqui, a
// aplicação da igreja entra em escopo PCI SAQ-D.
//
// ⚠️ A ordem de teste é REGRA, não estilo: Elo e Hipercard ocupam faixas DENTRO
// das faixas da Visa (`4011…`) e da Mastercard (`5041…`, `5067…`). Testar Visa
// antes de Elo faz um cartão Elo aparecer como Visa na tela — está
// mutation-testado.

export type Bandeira =
  | 'elo' | 'hipercard' | 'visa' | 'mastercard' | 'amex'
  | 'diners' | 'discover' | 'jcb' | null;

/**
 * BINs que existem SÓ no sandbox do provedor.
 *
 * ⚠️ Não é gambiarra nem exceção de negócio: `503143…` (o Mastercard de teste do
 * Mercado Pago) não pertence a nenhuma faixa real da bandeira — a Mastercard é
 * 51-55 e 2221-2720. Sem esta lista, quem testa vê "CARTÃO" genérico e conclui
 * que a detecção não funciona; com ela, nenhum cartão REAL é afetado, porque
 * cartão real nunca nasce nesses prefixos.
 */
const BINS_SANDBOX: Record<string, Exclude<Bandeira, null>> = {
  503143: 'mastercard',   // Mercado Pago · Mastercard de teste
  423564: 'visa',         // Mercado Pago · Visa de teste
  501105: 'elo',          // Mercado Pago · Elo de teste
};

/** Faixas do Elo publicadas pela própria bandeira (prefixo de 6 dígitos). */
const ELO_PREFIXOS = [
  '401178', '401179', '431274', '438935', '451416', '457393', '457631', '457632',
  '504175', '627780', '636297', '636368', '651652', '651653', '651654', '651655',
  '651656', '651657', '651658', '651659', '651770', '651771', '651772', '651773',
  '651774', '651775', '651776', '651777', '651778', '651779',
];

/** Faixas contínuas do Elo, como [início, fim] de 6 dígitos. */
const ELO_FAIXAS: Array<[number, number]> = [
  [506699, 506778], [509000, 509999], [650031, 650033], [650035, 650051],
  [650405, 650439], [650485, 650538], [650541, 650598], [650700, 650718],
  [650720, 650727], [650901, 650978], [651652, 651679], [655000, 655019],
  [655021, 655058],
];

function noIntervalo(bin6: string, faixas: Array<[number, number]>) {
  if (bin6.length < 6) return false;
  const n = Number(bin6);
  return faixas.some(([ini, fim]) => n >= ini && n <= fim);
}

/**
 * @param bin dígitos que o SDK do provedor informou (6 ou 8). Aceita valor
 *   parcial — enquanto a pessoa digita, devolve `null` até dar pra decidir.
 */
export function bandeiraDoBin(bin: string | null | undefined): Bandeira {
  const d = String(bin || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  const b6 = d.slice(0, 6);

  // ── Bandeiras brasileiras PRIMEIRO (elas moram dentro das faixas globais) ──
  if (d.length >= 6 && BINS_SANDBOX[b6]) return BINS_SANDBOX[b6];
  if (d.length >= 6 && ELO_PREFIXOS.includes(b6)) return 'elo';
  if (noIntervalo(b6, ELO_FAIXAS)) return 'elo';
  if (b6.startsWith('606282') || d.startsWith('3841')) return 'hipercard';

  // ── Globais ──
  if (/^4/.test(d)) return 'visa';
  if (/^5[1-5]/.test(d)) return 'mastercard';
  // Faixa 2-series da Mastercard (2221-2720).
  if (d.length >= 4) {
    const n4 = Number(d.slice(0, 4));
    if (n4 >= 2221 && n4 <= 2720) return 'mastercard';
  }
  if (/^3[47]/.test(d)) return 'amex';
  if (/^3(0[0-5]|[68])/.test(d)) return 'diners';
  if (/^(6011|65|64[4-9])/.test(d)) return 'discover';
  if (/^35(2[89]|[3-8]\d)/.test(d)) return 'jcb';
  // ⚠️ Sobra consciente: `50xxxx` fora das faixas do Elo fica SEM bandeira. A
  // tentação é devolver 'aura' (que é 50), mas a faixa dela cobre justamente o
  // que o Elo usa — e chutar aqui trocaria a marca de um Elo legítimo. Genérico
  // é honesto; marca errada no meio de um pagamento é o que faz a pessoa
  // desconfiar da página.
  return null;
}

/** Nome pra leitura humana (a tela mostra a marca desenhada, isto é o alt/aria). */
export const NOME_BANDEIRA: Record<Exclude<Bandeira, null>, string> = {
  elo: 'Elo',
  hipercard: 'Hipercard',
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
};

/**
 * Quantos dígitos o cartão tem, pela bandeira — a máscara do desenho precisa
 * disso (Amex é 15, em grupos 4-6-5; Diners é 14).
 */
export function formatoDoCartao(bandeira: Bandeira): { grupos: number[]; total: number } {
  if (bandeira === 'amex') return { grupos: [4, 6, 5], total: 15 };
  if (bandeira === 'diners') return { grupos: [4, 6, 4], total: 14 };
  return { grupos: [4, 4, 4, 4], total: 16 };
}
