// ════════════════════════════════════════════════════════════════════════════
//  "Quero trocar de grupo" pelo WhatsApp — régua PURA (26/09/2026)
//
//  Pedido do Matheus (item 3): *"a pessoa pode trocar sozinha [de grupo] e o
//  sistema já deve atualizar no cadastro dela automaticamente e deve avisar a
//  coordenação. Cuidado para homem não ir para grupo só de mulheres e vice
//  versa."*
//
//  ⚠️⚠️ A METADE "ATUALIZAR AUTOMATICAMENTE" NÃO É IMPLEMENTADA — decisão do
//  conselho (4 conselheiros + 4 revisores, unanimidade, 26/09). A identidade da
//  conversa de WhatsApp é FRACA: `wa_conversas.membro_id` nasce em
//  `waInbox.acharContato` por sufixo de 8 dígitos, `limit 8`, com fallback para
//  o PRIMEIRO resultado — numa base com 744 telefones compartilhados por
//  família. Escrever em `mem_grupo_membros` a partir disso tiraria do grupo a
//  mãe porque o filho escreveu do celular dela.
//  ⇒ O bot NUNCA escreve em `mem_grupo_membros`. A troca vira um PEDIDO DE
//  TRANSFERÊNCIA PENDENTE em `mem_grupo_transferencias` (a tabela de 25/08 que a
//  Caixa de entrada já lista), e quem move a pessoa é a coordenação, com a ação
//  `transferir` que já existe.
//
//  Em `utils/` porque é aqui que se decide se a mensagem É um pedido de troca e
//  PARA ONDE — as duas coisas no gate. Quem lê o banco é
//  `services/trocaGrupoWhatsapp.js`.
// ════════════════════════════════════════════════════════════════════════════

const { normalizar } = require('./assuntoGrupoConversa');
const { avaliarEntradaNoGrupo, sexoNormalizado, CATEGORIAS_POR_SEXO } = require('./entradaGrupoApp');
const { paraParametro, telefoneLegivel } = require('./suporteApp');
const { primeiroNomeDe } = require('./respostaGrupoAgenda');

// ── é pedido de troca? ────────────────────────────────────────────────────────

/** ⚠️ Já resolveu — é aviso, não pedido (a mesma armadilha do "consegui o link"). */
const JA_RESOLVEU = /\bja (troquei|mudei|fui transferid[oa]|me transferiram|estou no (novo|outro) grupo|entrei no (novo|outro))\b|\bconsegu(i|iram) (trocar|mudar|me transferir)\b/;

/** ⚠️ Negação: "não quero trocar de grupo, só saber o horário" não é pedido. */
const NEGACAO = /\bnao (quero|vou|preciso|pretendo|desejo|gostaria de|queria|posso)( mais)?( me)? (trocar|mudar|sair|ir|passar|ser transferid)/;

/**
 * ⚠️ "Grupo do WhatsApp" é OUTRA coisa — muita gente chama o grupo de mensagens
 * de "grupo". "Me adiciona no grupo do whats" não é troca de grupo de conexão.
 */
const GRUPO_DO_WHATSAPP = /\bgrupo d[oe] (whats|whatsapp|zap|wpp|whats app)\b/;

/**
 * Pedido EXPLÍCITO de troca — vale mesmo sem destino citado (a coordenação
 * pergunta pra onde).
 *
 * ⚠️⚠️ Todo padrão exige a palavra "grupo". Sem ela, "me transfere" é quase
 * sempre "me transfere pra um atendente", e "me troca" é quase sempre escala.
 * ⚠️ "Sair do grupo" SOZINHO não é troca (é saída, outro fluxo) — por isso o
 * único padrão com "sair" exige "outro" depois.
 * ⚠️ NÃO há "trocar/mudar o meu grupo": "posso mudar meu grupo de horário?" é a
 * pergunta de um líder sobre agenda, e casaria.
 */
const FORTE = [
  /\b(trocar|mudar|transferir|trocando|mudando) de grupo\b/,
  /\b(troca|mudanca|transferencia) de grupo\b/,
  /\b(trocar|mudar|ir|passar|transferir|colocar|botar)( me)? (pro|pra|para o|para|no|em) outro grupo\b/,
  /\bme (transfere|transfira|transferir|transferem|muda|mude|mudar|troca|troque|trocar) (de|pro|pra|para o|para a|para|em|no|na) (outro )?grupo\b/,
  /\bsair do (meu )?grupo\b.{0,40}\b(entrar|ir|participar|mudar)\b.{0,40}\boutro\b/,
];

/**
 * "Quero ir pro grupo X" — só é troca SE a pessoa citou um grupo que existe e
 * não é o dela. Sem destino claro, é quase sempre "posso ir pro grupo hoje?"
 * (ir ao encontro), e aí quem responde é gente.
 * ⚠️ Exige verbo de VONTADE antes ("quero/queria/gostaria de/preciso"): "posso
 * ir pro grupo" é pergunta de permissão pra comparecer, não pedido de troca.
 */
const DEPENDE_DESTINO = [
  /\b(quero|queria|gostaria de|preciso|desejo|pretendo)( muito)? (ir|mudar|trocar|passar|ser transferid[oa])( me)? (pro|pra|para o|para a|para) (o )?grupo\b/,
];

/**
 * A mensagem é pedido de troca de grupo?
 *
 * @returns `false` (o caso comum) · `'forte'` (pedido explícito — vale sem
 *   destino) · `'destino'` (só vale se `grupoCitado` achar UM grupo).
 */
function pedeTroca(texto) {
  const t = normalizar(texto);
  if (!t) return false;
  if (JA_RESOLVEU.test(t) || NEGACAO.test(t) || GRUPO_DO_WHATSAPP.test(t)) return false;
  if (FORTE.some((re) => re.test(t))) return 'forte';
  if (DEPENDE_DESTINO.some((re) => re.test(t))) return 'destino';
  return false;
}

// ── para qual grupo? ──────────────────────────────────────────────────────────

/** Palavras que não distinguem um grupo de outro (lista da decisão de 26/09). */
const GENERICAS = new Set(['grupo', 'online', 'de', 'da', 'do', 'e', 'com', 'para', 'curso', 'estudo']);

/** Normaliza para casar NOME: sem acento, minúsculo, sem pontuação. */
function paraCasar(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Tokens do nome com ≥4 letras, fora das genéricas. */
function tokensSignificativos(nome) {
  return [...new Set(paraCasar(nome).split(' ')
    .filter((w) => w.length >= 4 && /[a-z]/.test(w) && !GENERICAS.has(w)))];
}

/**
 * Qual grupo o texto CITA.
 *
 * Regra conservadora, em duas camadas:
 *   1. NOME INTEIRO (normalizado, com fronteira de palavra) aparece no texto —
 *      vence. Entre os que casam assim, cai quem é pedaço de outro que também
 *      casou ("mulher unica" dentro de "online mulher unica"). ⚠️ Só vale para
 *      nome de 2+ PALAVRAS: nome de uma palavra só ("Teste", "Transformados")
 *      aparece dentro de frase comum — "é só um teste" viraria pedido de ir pro
 *      grupo Teste. Esse grupo fica sem destino citado e a coordenação pergunta.
 *   2. Senão, TODOS os tokens significativos do nome aparecem no texto — e o
 *      nome precisa ter PELO MENOS 2 ("GRUPO DE CUIDADOS" tem 1: só "cuidados").
 *
 * ⚠️⚠️ 1 token não basta (mutante do gate): "grupo de finanças" não é
 * "ONLINE - Finanças na Ótica de Cristo".
 * ⚠️ A base tem nome REPETIDO de verdade (medido 26/09: "ONLINE - GRUPO DE
 * CONEXÃO" ×3, "JOVENS - ESTUDO DA MENSAGEM DO CULTO AMI" ×5) — aí o resultado
 * é `varios`, e a coordenação confirma qual.
 *
 * @param grupos  candidatos (já SEM o grupo de origem)
 * @returns `{ tipo:'unico', grupo }` · `{ tipo:'varios', grupos }` · `{ tipo:'nenhum' }`
 */
function grupoCitado(texto, grupos) {
  const t = ` ${paraCasar(texto)} `;
  const palavras = new Set(t.trim().split(' '));
  const lista = (Array.isArray(grupos) ? grupos : []).filter((g) => g && g.id && String(g.nome || '').trim());
  if (!t.trim() || !lista.length) return { tipo: 'nenhum' };

  const inteiros = lista.filter((g) => {
    const n = paraCasar(g.nome);
    return n && n.split(' ').length >= 2 && t.includes(` ${n} `);
  });
  if (inteiros.length) {
    const nomes = inteiros.map((g) => paraCasar(g.nome));
    const maximos = inteiros.filter((g, i) => !nomes.some((outro, j) => j !== i
      && outro !== nomes[i] && ` ${outro} `.includes(` ${nomes[i]} `)));
    return maximos.length === 1 ? { tipo: 'unico', grupo: maximos[0] } : { tipo: 'varios', grupos: maximos };
  }

  const porToken = lista.filter((g) => {
    const toks = tokensSignificativos(g.nome);
    return toks.length >= 2 && toks.every((w) => palavras.has(w));
  });
  if (porToken.length === 1) return { tipo: 'unico', grupo: porToken[0] };
  if (porToken.length > 1) return { tipo: 'varios', grupos: porToken };
  return { tipo: 'nenhum' };
}

// ── pode ir pra lá? ───────────────────────────────────────────────────────────

/**
 * O destino é compatível com a pessoa?
 *
 * ⚠️⚠️ NÃO duplica a régua de gênero: chama `avaliarEntradaNoGrupo` (a MESMA do
 * formulário público e do app) e só TRADUZ o resultado para este fluxo, que
 * cria um PEDIDO para a coordenação — não uma inscrição:
 *   · sexo conhecido e diferente do exigido → BLOQUEIA (não cria o pedido);
 *   · sexo desconhecido no cadastro → NÃO bloqueia, vira nota no motivo (a
 *     coordenação confere; recusar aqui seria afirmar algo sobre alguém que o
 *     cadastro não diz);
 *   · destino fechado/inativo → NÃO bloqueia, vira nota (a coordenação decide).
 * `temporadaAberta: true` de propósito: temporada não é assunto de troca
 * pedida à coordenação.
 */
function compatibilidadeTroca({ destino, genero } = {}) {
  if (!destino) return { bloqueia: false, notas: [] };
  const r = avaliarEntradaNoGrupo({ grupo: destino, genero, temporadaAberta: true });
  if (r.ok) return { bloqueia: false, notas: [] };
  if (r.codigo === 'grupo_incompativel') {
    const exigido = CATEGORIAS_POR_SEXO[String(destino.categoria || '').trim().toLowerCase()] || null;
    if (!sexoNormalizado(genero)) {
      return { bloqueia: false, notas: ['o sexo não está no cadastro — conferir antes de transferir'] };
    }
    return { bloqueia: true, motivo: 'sexo', exigido };
  }
  if (r.codigo === 'inscricoes_fechadas') {
    return { bloqueia: false, notas: ['o grupo citado não está recebendo inscrições'] };
  }
  return { bloqueia: false, notas: [] };
}

// ── quem pode pedir por aqui? ────────────────────────────────────────────────

/** Funções de roster que são LIDERANÇA (a troca delas é conversa com a coordenação). */
const FUNCOES_LIDERANCA = new Set(['lider', 'lider_treinamento']);

/**
 * A pessoa é da LIDERANÇA do grupo de origem?
 *
 * ⚠️ Duas fontes, as duas valem: `mem_grupos.lider_id` (a líder PRINCIPAL, que
 * recebe os avisos do grupo) e a função no roster (`lider`/`lider_treinamento` —
 * quem está em treinamento GERENCIA o grupo desde 25/08). Tirar qualquer uma
 * por WhatsApp deixaria o grupo sem quem responde por ele.
 */
function ehLiderancaDoGrupo({ membroId, grupo, roster } = {}) {
  if (!membroId) return false;
  if (grupo?.lider_id && grupo.lider_id === membroId) return true;
  return (Array.isArray(roster) ? roster : []).some((v) => FUNCOES_LIDERANCA.has(String(v?.funcao || '')));
}

/**
 * O que fazer com o pedido — a ORDEM das guardas é a régua:
 *   1. liderança → não cria pedido, responde que é com a coordenação;
 *   2. sexo incompatível com o destino citado → não cria pedido;
 *   3. senão → cria o pedido PENDENTE (quem move é a coordenação).
 *
 * @returns `'lideranca' | 'sexo_incompativel' | 'criar'`
 */
function casoDaTroca({ lideranca, compat } = {}) {
  if (lideranca === true) return 'lideranca';
  if (compat?.bloqueia === true) return 'sexo_incompativel';
  return 'criar';
}

// ── o que fica registrado e o que a pessoa lê ────────────────────────────────

/** "Nome (bairro)" distintos — pra citar candidatos sem repetir o mesmo nome 5×. */
function rotulosCandidatos(grupos, max = 3) {
  const vistos = new Set();
  const out = [];
  for (const g of grupos || []) {
    const nome = String(g?.nome || '').trim();
    if (!nome) continue;
    const bairro = String(g?.bairro || '').trim();
    const r = bairro ? `${nome} (${bairro})` : nome;
    if (vistos.has(r)) continue;
    vistos.add(r);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

/** O destino como TEXTO, para o motivo e para o aviso à coordenação. */
function destinoComoTexto(destino) {
  if (destino?.tipo === 'unico') return String(destino.grupo?.nome || '').trim() || 'não informado';
  if (destino?.tipo === 'varios') return `ambíguo: ${rotulosCandidatos(destino.grupos).join(' / ')}`;
  return 'não informado';
}

/**
 * O `motivo` gravado em `mem_grupo_transferencias` — é o que a coordenação lê
 * na Caixa de entrada para falar com a pessoa.
 *
 * ⚠️ O telefone é o DA CONVERSA (quem escreveu), não o do cadastro — é por ele
 * que a coordenação confirma se era mesmo aquela pessoa.
 * ⚠️ O texto cru vai truncado em 300: é a evidência do pedido, e o motivo não é
 * lugar de colar a conversa inteira.
 */
function montarMotivoTroca({ telefone, destino, texto, notas = [] } = {}) {
  const tel = telefoneLegivel(telefone) || 'sem telefone';
  const bruto = paraParametro(texto, 300);
  const partes = [
    `Pediu pelo WhatsApp da CBRio (telefone da conversa: ${tel})`,
    `destino citado: ${destinoComoTexto(destino)}`,
    `texto: "${bruto}"`,
    ...(Array.isArray(notas) ? notas.filter(Boolean) : []),
  ];
  return partes.join(' · ').slice(0, 900);
}

/**
 * O texto que a PESSOA recebe.
 *
 * ⚠️⚠️ Nunca promete que a troca acontece sozinha nem dá prazo: o que existe é
 * um PEDIDO para a coordenação, que confirma com ela e decide. E diz que ela
 * CONTINUA no grupo atual — tirar alguém do grupo por mensagem de WhatsApp é
 * exatamente o que este fluxo se recusa a fazer.
 *
 * @param caso 'anotado' | 'ja_pedido' | 'lideranca' | 'sexo_incompativel'
 */
function textoRespostaTroca({ caso = 'anotado', nome = '', grupoAtualNome = '', destino = null, exigido = null } = {}) {
  const oi = primeiroNomeDe(nome) ? `Oi, ${primeiroNomeDe(nome)}!` : 'Oi!';
  const atual = String(grupoAtualNome || '').trim();
  const l = [oi, ''];

  if (caso === 'lideranca') {
    l.push(atual
      ? `Como você faz parte da liderança do grupo *${atual}*, a troca de grupo é combinada direto com a coordenação de Grupos.`
      : 'Como você faz parte da liderança do seu grupo, a troca de grupo é combinada direto com a coordenação de Grupos.');
    l.push('Sua mensagem ficou registrada aqui para a equipe.');
    return l.join('\n');
  }

  if (caso === 'sexo_incompativel') {
    const nomeDestino = String(destino?.grupo?.nome || '').trim();
    const publico = exigido === 'feminino' ? 'só para mulheres' : exigido === 'masculino' ? 'só para homens' : 'para outro público';
    l.push(nomeDestino
      ? `O grupo *${nomeDestino}* é ${publico}, então não consigo pedir essa troca por aqui.`
      : `Esse grupo é ${publico}, então não consigo pedir essa troca por aqui.`);
    l.push('Se quiser outro grupo, me diga o nome dele — e sua mensagem também ficou registrada aqui para a equipe.');
    return l.join('\n');
  }

  if (caso === 'ja_pedido') {
    l.push('Seu pedido de troca de grupo já está com a coordenação de Grupos — eles vão falar com você para confirmar.');
    if (atual) {
      l.push('');
      l.push(`Até lá, você continua no grupo *${atual}* normalmente.`);
    }
    l.push('');
    l.push('Qualquer coisa, é só chamar por aqui. 💚');
    return l.join('\n');
  }

  // anotado
  l.push('Anotei seu pedido de troca de grupo e passei para a coordenação de Grupos. Eles vão falar com você para confirmar e combinar a mudança.');
  if (atual) {
    l.push('');
    l.push(`Até lá, você continua no grupo *${atual}* normalmente.`);
  }
  if (destino?.tipo === 'unico') {
    l.push('');
    l.push(`Grupo que você pediu: *${String(destino.grupo?.nome || '').trim()}*.`);
  } else if (destino?.tipo === 'varios') {
    l.push('');
    l.push(`Encontrei mais de um grupo com esse nome (${rotulosCandidatos(destino.grupos).join('; ')}) — a coordenação confirma com você qual é.`);
  } else {
    l.push('');
    l.push('Se você já souber para qual grupo quer ir, me mande o nome dele por aqui — a coordenação também pode te ajudar a escolher.');
  }
  l.push('');
  l.push('Qualquer coisa, é só chamar por aqui. 💚');
  return l.join('\n');
}

module.exports = {
  pedeTroca, grupoCitado, compatibilidadeTroca, ehLiderancaDoGrupo, casoDaTroca, FUNCOES_LIDERANCA,
  montarMotivoTroca, textoRespostaTroca, destinoComoTexto, rotulosCandidatos,
  tokensSignificativos, paraCasar, GENERICAS,
};
