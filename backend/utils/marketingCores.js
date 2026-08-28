// ============================================================================
// Paleta CATEGÓRICA dos eventos no calendário do ciclo criativo.
// (pedido do Marcos · 14/08/2026: "coloque cores diferentes os eventos lá no
//  calendário para facilitar a visualização")
//
// ⚠️⚠️ ESTES 6 HEX FORAM BUSCADOS E VALIDADOS, NÃO ESCOLHIDOS A OLHO.
// `scripts/validate_palette.js "<hex,…>" --mode <tema> --surface <fundo>
//  --pairs all` passa as 6 checagens nos DOIS temas com as MESMAS cores:
//
//   claro (#ffffff) · banda ok · croma ok · CVD todos-os-pares ΔE 8,1
//                     visão normal 16,3 · contraste ≥3:1
//   escuro (#161616) · banda ok · croma ok · CVD 8,1 · visão normal 16,3
//                     contraste: 2 cores em "relief" (<3:1)
//
// ⚠️ `--pairs all`, não "adjacent": no calendário as faixas de eventos
// diferentes se empilham na MESMA linha de semana, então QUALQUER par pode
// acabar lado a lado.
//
// ⚠️ O "relief" de contraste é satisfeito porque a faixa SEMPRE traz o nome do
// evento escrito — identidade nunca é só cor. Por isso também o texto usa
// tokens de texto, nunca a cor da série.
//
// ⚠️⚠️ SEIS é o MÁXIMO, medido por busca exaustiva sobre 75 candidatos: a banda
// de luminosidade do tema ESCURO (L 0,48–0,67) é estreita, e dentro dela não
// cabem 7 matizes que um dicromata ainda distinga. Do 7º evento em diante a
// faixa fica CINZA NEUTRO e o nome carrega a identidade — a régua da casa manda
// dobrar em "Outro" em vez de gerar matiz nova.
//
// ⚠️ O teal da marca (#00897B) ficou FORA de propósito: é o acento do sistema
// (o "hoje" do calendário, botões primários). Usá-lo num evento faria aquele
// evento parecer destaque do sistema.
//
// Trocar qualquer hex daqui exige RODAR o validador de novo nos dois temas.
// ============================================================================

const CORES_EVENTO = [
  '#16a34a', // verde
  '#b91c1c', // vermelho escuro
  '#0891b2', // ciano
  '#2563eb', // azul
  '#a21caf', // roxo
  '#ec4899', // rosa
];

// Faixa do 7º evento em diante · cinza dos tokens (slate-500).
const COR_EXCEDENTE = '#64748b';

// Cor do evento pela POSIÇÃO na lista já ordenada.
//
// ⚠️ A ordem de entrada é a do Dia D (o evento que acontece primeiro vem
// primeiro), então a cor de um evento é ESTÁVEL de mês para mês. Excluir um
// evento desloca as cores dos seguintes — aceito de propósito: distinguir dois
// eventos na mesma semana importa mais que a cor ser eterna, e derivar de hash
// do id não garante que dois eventos vizinhos recebam cores diferentes.
function corDoEvento(indice) {
  // ⚠️ `typeof` ANTES de converter: `Number(null)` é 0 e `Number('')` é 0, então
  // um índice ausente pegaria a PRIMEIRA cor da paleta como se fosse legítimo —
  // e dois eventos ficariam com a mesma cor sem ninguém notar. É a mesma
  // armadilha do "valor nulo virando R$ 0,00" da alçada de compra.
  if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 0) {
    return COR_EXCEDENTE;
  }
  return indice < CORES_EVENTO.length ? CORES_EVENTO[indice] : COR_EXCEDENTE;
}

// `true` quando a cor é a genérica de excedente (a tela declara isso).
function ehExcedente(indice) {
  return corDoEvento(indice) === COR_EXCEDENTE;
}

module.exports = { CORES_EVENTO, COR_EXCEDENTE, corDoEvento, ehExcedente };
