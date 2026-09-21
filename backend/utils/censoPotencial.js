// Quem o censo revela que PODE ser convidado — as listas acionáveis.
//
// Pedido do Matheus (21/09/2026): *"queria analises potenciais, por exemplo:
// Potencial KIDS, e aí vai mostrar quantas criancas temos potencial de convidar
// para ir pro kids, isso vem a partir das respostas de responsaveis que disseram
// que tem filhos e que os filhos nao frequentam o kids... tem pessoas que sao
// convertidas mas que nao sao batizadas, e aí queria uma lista dessas pessoas
// para que [a coordenadora] entre em contato com cada uma."*
//
// ⚠️⚠️ A UNIDADE É FAMÍLIA, NUNCA CRIANÇA — e isso não é preciosismo de
// linguagem. O censo pergunta FAIXAS (`filhos_faixas`, múltipla), não filhos:
// quem tem 4 filhos e marca "3 a 6 anos" + "10 a 12 anos" não diz quantos em
// cada uma. Medido em 21/09: 956 responderam faixas. Dizer "161 crianças" seria
// inventar um número com cara de medição — o erro que o relatório do censo já
// evita ao declarar base de cada pergunta.
//
// ⚠️ "Não frequenta o CBKids" tem DOIS estados que não podem virar um só:
// `Não` (92) e `Parcialmente` (69). Parcialmente é família que JÁ está lá com
// algum filho — ligar para ela como se nunca tivesse ido queima a credibilidade
// de quem liga. Decisão do Matheus: seções separadas.
//
// ⚠️⚠️ NÃO EXISTE pergunta equivalente para AMI e Bridge — o censo só pergunta
// do CBKids. Logo, "potencial AMI" é literalmente "tem filho na faixa", e inclui
// quem JÁ frequenta. A tela DECLARA isso; a régua não finge saber.
//
// ⚠️ Régua PURA de propósito (zero require, zero SDK): é o que o gate consegue
// testar. Guarda que decide algo e vive no serviço que lê banco é guarda que
// nenhum mutante alcança — a lição que custou 623 escalas religadas errado.

// As faixas são STRINGS LITERAIS do questionário. Um caractere diferente devolve
// zero em silêncio, então o teste ancora nos números medidos em produção.
const FAIXAS_KIDS = Object.freeze(['6 meses a 2 anos', '3 a 6 anos', '7 a 9 anos', '10 a 12 anos']);
// ⚠️⚠️ BRIDGE É 13-17 E AMI É 18-25. Eu tinha invertido, por DEDUZIR da régua
// de faixa etária da casa (adolescente 13-17 → "deve ser o AMI") em vez de
// perguntar. O Matheus corrigiu em 21/09/2026 olhando a tela: *"vc inverteu kids
// e bridge. bridge e de 13 a 17 e AMI e de 18 a 25 anos."* Faixa etária de
// ministério é NOME DA CASA, não dedução — a régua de `fn_faixa_etaria` descreve
// idade, não a quem cada ministério atende.
const FAIXA_BRIDGE = '13 a 17 anos';
const FAIXA_AMI = '18 a 25 anos';

// ⚠️ Espelha a régua da casa (decisão do Matheus 19/08/2026, em `fn_faixa_etaria`
// e `src/lib/faixaEtaria.ts`): criança <13 · adolescente 13-17 · jovem 18-25.
// As opções do censo batem exatamente com ela — se a régua mudar lá, muda aqui.

const OPTIN_SIM = 'Sim, autorizo';
const OPTIN_NAO = 'Não autorizo';

/** Normaliza `filhos_faixas`, que é array no payload e some quando não há filhos. */
function faixasDe(payload) {
  // ⚠️ `Array.isArray` e não truthy: em 398 payloads (quem respondeu "não tem
  // filhos") a chave NÃO EXISTE, e `undefined.includes` derruba a rota inteira.
  const v = payload?.filhos_faixas;
  return Array.isArray(v) ? v : [];
}

function temAlguma(faixas, alvos) {
  return faixas.some((f) => alvos.includes(f));
}

/**
 * Em que listas esta resposta entra.
 * @returns {{kids: 'nao'|'parcial'|null, ami: boolean, bridge: boolean, convertido: boolean}}
 */
function classificar(payload) {
  const faixas = faixasDe(payload);
  const temFilhos = String(payload?.tem_filhos || '') === 'Sim';
  const freq = String(payload?.filhos_frequentam || '');

  let kids = null;
  if (temFilhos && temAlguma(faixas, FAIXAS_KIDS)) {
    if (freq === 'Não') kids = 'nao';
    else if (freq === 'Parcialmente') kids = 'parcial';
  }

  return {
    kids,
    ami: temFilhos && faixas.includes(FAIXA_AMI),
    bridge: temFilhos && faixas.includes(FAIXA_BRIDGE),
    // ⚠️ `=== 'Não'` e não `!== 'Sim'`: quem não respondeu (pergunta que entrou
    // depois, ou rascunho) NÃO entra numa lista de contato. Ausência de resposta
    // não é "não fez" — é "não sabemos", e ligar para quem já fez queima quem liga.
    nao_fez_next: String(payload?.fez_next || '') === 'Não',
    nao_serve: String(payload?.serve_ministerio || '') === 'Não',
    // ⚠️ "Ainda em decisão" NÃO entra: a pessoa não declarou conversão, e
    // abordá-la como quem já decidiu é afirmar por ela o que ela não disse.
    convertido: String(payload?.entregou_vida || '') === 'Sim'
      && String(payload?.batizado || '') === 'Não',
  };
}

/** Como a pessoa pode ser contatada — e o que ela AUTORIZOU. */
function contatoDe(payload) {
  const optin = String(payload?.whatsapp_optin || '');
  return {
    nome: payload?.nome || null,
    telefone: payload?.telefone || null,
    email: payload?.email || null,
    // ⚠️⚠️ TRÊS estados, não dois. `recusou` é quem escreveu "Não autorizo" no
    // MESMO formulário — a tela não oferece WhatsApp a essas pessoas (decisão do
    // Matheus, 21/09). `nao_perguntado` é quem respondeu ANTES de a pergunta
    // existir (ela entrou em 13/09): ausência de resposta não é recusa, e tratar
    // como tal apagaria centenas de pessoas sem que ninguém tenha dito não.
    whatsapp: optin === OPTIN_SIM ? 'autorizou'
      : optin === OPTIN_NAO ? 'recusou'
      : 'nao_perguntado',
  };
}

/**
 * Monta as listas a partir das respostas concluídas.
 *
 * @param {Array<{id: string, membro_id: string|null, payload: object}>} linhas
 * @returns {{kids_nao, kids_parcial, ami, bridge, convertidos, totais, familias_distintas}}
 */
function montarPotencial(linhas, formados) {
  const listas = { kids_nao: [], kids_parcial: [], ami: [], bridge: [], convertidos: [], nao_fez_next: [], nao_serve: [] };
  const vistos = new Set();

  for (const l of Array.isArray(linhas) ? linhas : []) {
    const p = l?.payload;
    if (!p || typeof p !== 'object') continue;
    const c = classificar(p);
    const pessoa = {
      resposta_id: l.id,
      membro_id: l.membro_id || null,
      ...contatoDe(p),
      filhos_quantos: Number.isFinite(Number(p.filhos_quantos)) ? Number(p.filhos_quantos) : null,
      faixas: faixasDe(p),
      // ⚠️⚠️ SELO, NUNCA FILTRO. Medido em 21/09: 22 pessoas responderam "não fiz
      // o Next" e CONSTAM como formadas em `vw_next_formado_pessoa` — mas 250
      // responderam "sim" SEM constar. Ou seja, "consta" prova que fez; "não
      // consta" NÃO prova que não fez. Usar como filtro produziria uma lista
      // errada com cara de validada; como selo, avisa quem vai ligar.
      consta_formado_next: formados instanceof Set && l.membro_id
        ? formados.has(l.membro_id) : false,
    };

    if (c.kids === 'nao') listas.kids_nao.push(pessoa);
    if (c.kids === 'parcial') listas.kids_parcial.push(pessoa);
    if (c.ami) listas.ami.push(pessoa);
    if (c.bridge) listas.bridge.push(pessoa);
    if (c.convertido) listas.convertidos.push(pessoa);
    if (c.nao_fez_next) listas.nao_fez_next.push(pessoa);
    if (c.nao_serve) listas.nao_serve.push(pessoa);

    if (c.kids || c.ami || c.bridge || c.convertido || c.nao_fez_next || c.nao_serve) vistos.add(l.id);
  }

  return {
    ...listas,
    totais: {
      kids_nao: listas.kids_nao.length,
      kids_parcial: listas.kids_parcial.length,
      ami: listas.ami.length,
      bridge: listas.bridge.length,
      convertidos: listas.convertidos.length,
      nao_fez_next: listas.nao_fez_next.length,
      nao_serve: listas.nao_serve.length,
    },
    // ⚠️ A soma das listas NÃO é o número de gente: 21% está em mais de uma
    // (medido: 790 de soma para 624 pessoas). Sem isto, a mesma família recebe
    // três ligações de três pessoas diferentes.
    familias_distintas: vistos.size,
  };
}

/** Só as contagens — é o que o nível 2 pode ver, sem nome nem telefone. */
function resumoPotencial(linhas) {
  const { totais, familias_distintas } = montarPotencial(linhas);
  return { totais, familias_distintas };
}

module.exports = {
  FAIXAS_KIDS,
  FAIXA_AMI,
  FAIXA_BRIDGE,
  OPTIN_SIM,
  OPTIN_NAO,
  classificar,
  contatoDe,
  montarPotencial,
  resumoPotencial,
};
