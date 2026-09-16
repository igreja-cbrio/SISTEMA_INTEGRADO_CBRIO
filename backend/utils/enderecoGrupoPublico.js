// ============================================================================
// Endereço do grupo NO FORMULÁRIO PÚBLICO — rua e NÚMERO, nunca o complemento.
//
// Pedido da Natasha (16/09/2026): o formulário público mostrava só o BAIRRO, e
// bairro não localiza ninguém nas vias longas do Rio — a Av. das Américas tem
// ~20 km e a Lúcio Costa ~8 km. Dois grupos "Barra da Tijuca" podem estar a
// meia hora de carro um do outro, e a pessoa se inscrevia no escuro.
//
// AS DUAS LEIS (as duas são da Natasha, e a segunda é de SEGURANÇA):
//
//  1. Rua + número aparecem. É o que dá noção de ONDE é o grupo.
//  2. Apartamento, bloco, casa, torre NUNCA aparecem. O grupo é na casa de
//     alguém: a rua e a altura da via bastam pra decidir; o resto é da porta
//     pra dentro e só o líder entrega, depois que a inscrição é aprovada.
//     O campo `complemento` do cadastro nunca sai daqui — e se alguém digitou
//     "apto 302" dentro do campo Endereço, este módulo TIRA.
//
// O número cadastrado é PRÓXIMO do real por decisão dela (o prédio ao lado
// serve): quem precisa de precisão de porta já é gente aprovada no grupo.
// Isso é instrução de preenchimento (está no rótulo do campo em /grupos),
// não tem como este módulo conferir — o que ele garante é o item 2.
//
// Módulo PURO (gate `npm run test:endereco-grupo`, roda sem node_modules).
// ============================================================================

// Endereço que não é endereço: some do público em vez de virar texto ruim no
// cartão ("(endereço não informado)" assusta mais do que a ausência da linha).
const SEM_ENDERECO = /^(\(?\s*endere[çc]o\s+n[ãa]o\s+informado\s*\)?|online|remoto|a\s+definir|a\s+confirmar|n[ãa]o\s+informado|sem\s+endere[çc]o|[-–—.\s]*)$/i;

// Vocabulário de COMPLEMENTO. Tudo que começa com um destes numa parte do
// endereço separada por vírgula é descartado.
const COMPLEMENTO = 'ap|apt|apto|apart|apartamento|bl|blc|bloco|casa|cs|torre|tr|cob|cobertura|fundos|sala|sl|andar|t[ée]rreo|unidade|un|lote|lt|qd|quadra|cond|condom[íi]nio|edif[íi]cio|ed|port[ãa]o';
const COMPLEMENTO_INICIO = new RegExp(`^(?:${COMPLEMENTO})\\b`, 'i');
// Complemento COLADO na mesma parte ("Rua X 427 apto 302"). Só corta quando
// vem DEPOIS de um número — senão "Rua Casa Forte 100" viraria "Rua".
const COMPLEMENTO_COLADO = new RegExp(`(\\d)\\s*[-–—/]?\\s*(?:${COMPLEMENTO})\\b.*$`, 'i');

// Conectores que ficam minúsculos ao destacaixar um endereço TODO EM CAIXA
// ALTA (metade do cadastro veio de importação assim).
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'a', 'na', 'no']);

function destacaixar(txt) {
  const palavras = txt.toLowerCase().split(' ');
  return palavras.map((palavra, i) => {
    // "2300 A": letra sozinha DEPOIS de número é sufixo do número, sobe
    // inteira — mas o "e" de "Lins e Silva" continua sendo conector.
    if (/^[a-zà-ÿ]$/.test(palavra) && /\d/.test(palavras[i - 1] || '')) return palavra.toUpperCase();
    if (i > 0 && CONECTORES.has(palavra)) return palavra;
    // O hífen separa nome ("Vice-Presidente José Alencar").
    return palavra.split('-').map(p => p.replace(/^([a-zà-ÿ])/, (c) => c.toUpperCase())).join('-');
  }).join(' ');
}

// Endereço de rua pronto pra tela pública. Devolve null quando não sobra nada
// que ajude a pessoa a se localizar.
function enderecoPublicoGrupo(grupo) {
  const cru = typeof grupo === 'string' ? grupo : grupo?.endereco;
  if (!cru) return null;
  const limpo = String(cru).replace(/\s+/g, ' ').trim();
  if (!limpo || SEM_ENDERECO.test(limpo)) return null;

  const partes = [];
  limpo.split(',').forEach((bruta, i) => {
    let parte = bruta.trim().replace(/^[-–—]\s*/, '');
    if (!parte) return;
    // A primeira parte é a RUA — nunca é descartada (rua pode se chamar
    // "Condomínio X" sem ser complemento de nada).
    if (i > 0 && COMPLEMENTO_INICIO.test(parte)) return;
    parte = parte.replace(COMPLEMENTO_COLADO, '$1').trim();
    if (!parte) return;
    // "RUA OTTO STUPAKOFF, 427, 427" — repetição de importação.
    if (partes.length && partes[partes.length - 1].toLowerCase() === parte.toLowerCase()) return;
    partes.push(parte);
  });

  let saida = partes.join(', ').replace(/[\s,;.]+$/, '').trim();
  if (!/[a-zà-ÿ]/i.test(saida)) return null; // sobrou só número solto
  if (!/[a-zà-ÿ]/.test(saida)) saida = destacaixar(saida); // veio TUDO EM CAIXA ALTA
  return saida || null;
}

// O endereço público leva número de rua? É o que a Natasha precisa cobrar dos
// líderes — sem número, o cartão mostra a via inteira e não resolve nada.
function temNumeroDeRua(grupo) {
  const publico = enderecoPublicoGrupo(grupo);
  return publico != null && /\d/.test(publico);
}

// O "onde" de UMA LINHA pra quem ainda NÃO foi aceito no grupo (página de
// sugestão de realocação). Mesma régua do formulário: rua + número, nunca
// apartamento/bloco.
// ⚠️⚠️ Existe porque o `formatarOnde` do WhatsApp — que junta
// `local · endereco · COMPLEMENTO · bairro` — estava sendo usado nas DUAS
// páginas de token. Na do LÍDER isso é certo (o token é a credencial dele e a
// casa é a dele). Na de SUGESTÃO, quem lê é um candidato que a triagem
// realocou e que o líder ainda não aceitou — ali o apartamento não pode ir.
// A régra é a de 16/09: rua e altura bastam pra pessoa decidir se dá pra ir.
function ondePublicoGrupo(grupo) {
  const partes = [grupo?.local, enderecoPublicoGrupo(grupo), grupo?.bairro]
    .map(p => (p == null ? '' : String(p).trim()))
    .filter(Boolean);
  // Sem repetir "Barra da Tijuca — Barra da Tijuca" quando local == bairro.
  const vistos = new Set();
  const unicas = partes.filter(p => {
    const k = p.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
  return unicas.length ? unicas.join(' — ') : 'a combinar';
}

module.exports = { enderecoPublicoGrupo, temNumeroDeRua, ondePublicoGrupo };
