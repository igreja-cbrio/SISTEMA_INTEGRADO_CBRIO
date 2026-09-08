// ════════════════════════════════════════════════════════════════════════════
//  BOT DE IA POR ÁREA · as réguas PURAS (2026-09-08)
//
//  Pedido do Marcos: "deixar o Claude simples respondendo dúvidas rápidas — se
//  alguém perguntar de grupos, ele manda o link; se a pessoa tiver inscrita, pede
//  para falar com o líder; em dúvida mais profunda manda o número do CBZap. Criar
//  esse bot POR ÁREA: quando uma área começar a atender de verdade, desligamos o
//  bot naquela área."
//
//  Medido em 08/09/2026 antes de escrever: 216 conversas com mensagem em 90 dias,
//  7 com resposta humana, 91 abertas sem resposta há mais de 2 dias. O bot existe
//  para dar fôlego enquanto não há atendimento — e para SAIR da frente assim que
//  houver (a área desligada devolve o silêncio, e a mensagem continua no inbox).
//
//  ⚠️ Este arquivo é PURO (sem banco, sem rede, sem relógio implícito) de
//  propósito: é o que entra no gate de deploy (`src/test/botIaRegras.test.ts`).
//  O serviço `services/botIaResposta.js` só lê o banco, chama o modelo e envia.
//
//  ⚠️⚠️ TODA decisão daqui é FAIL-CLOSED: config ilegível, área desconhecida,
//  contato humano ausente, resposta vazia ⇒ SILÊNCIO. O custo de errar fechado é
//  uma resposta a menos numa caixa que gente pode atender; o custo de errar
//  aberto é uma mensagem errada saindo em nome da igreja (a lei de 12/08).
// ════════════════════════════════════════════════════════════════════════════

const ACOES = ['responder', 'encaminhar', 'silencio'];

const LIMITES_PADRAO = Object.freeze({
  limite_dia: 200,               // teto GLOBAL de respostas do bot por dia (custo + freio)
  limite_conversa_dia: 3,        // por conversa por dia — depois disso o bot cala e a pessoa fica com a equipe
  horas_silencio_apos_humano: 48, // se um humano respondeu nesta conversa há menos de N horas, o bot não entra
});

const MAX_RESPOSTA_CHARS = 900;

/** Nome da pseudo-área que carrega o conteúdo institucional (horários, endereço). */
const AREA_GERAL = 'Geral';

// ── normalização ────────────────────────────────────────────────────────────

function normalizarNome(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function soDigitos(v) { return String(v || '').replace(/\D+/g, ''); }

function inteiroPositivo(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
}

// ── configuração global (whatsapp_config.bot_ia) ────────────────────────────

/**
 * Lê o jsonb `whatsapp_config.bot_ia` com defaults fail-closed.
 * ⚠️ `ativo` só é true com `=== true` — coluna ausente, `{}`, string "true" ou
 * qualquer lixo significa DESLIGADO.
 */
function lerConfigBotIa(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const contato = String(r.contato_humano || '').trim();
  return {
    ativo: r.ativo === true,
    contato_humano: contato,
    contato_link: linkWaMe(contato),
    limite_dia: inteiroPositivo(r.limite_dia, LIMITES_PADRAO.limite_dia),
    limite_conversa_dia: inteiroPositivo(r.limite_conversa_dia, LIMITES_PADRAO.limite_conversa_dia),
    horas_silencio_apos_humano: inteiroPositivo(r.horas_silencio_apos_humano, LIMITES_PADRAO.horas_silencio_apos_humano),
    instrucoes: String(r.instrucoes || '').slice(0, 2000),
  };
}

/**
 * Quem responde quem escreve no número da igreja.
 *   'menu'    → o menu de setores (respostas_automaticas) · comportamento histórico
 *   'ia'      → o bot de IA por área (menu desligado E bot_ia.ativo)
 *   'ninguem' → só gente
 *
 * ⚠️ Espelha `freioBot.botPodeResponder`: `respostas_automaticas` ausente (deploy
 * anterior à migration de 12/08) conta como MENU LIGADO, que é o histórico; só o
 * `false` explícito cala o menu. E config ilegível ⇒ 'ninguem' (fail-closed).
 */
function modoResposta({ cfg = null, erroCfg = null, botIa = null } = {}) {
  if (erroCfg || !cfg) return 'ninguem';
  if (cfg.respostas_automaticas !== false) return 'menu';
  return botIa && botIa.ativo === true ? 'ia' : 'ninguem';
}

// ── áreas ───────────────────────────────────────────────────────────────────

/** Linha de `wa_bot_areas` normalizada. `ativo` só com `=== true`. */
function lerArea(row) {
  if (!row || typeof row !== 'object') return null;
  const nome = String(row.area || row.nome || '').trim();
  if (!nome) return null;
  const links = Array.isArray(row.links) ? row.links : [];
  return {
    area: nome,
    ativo: row.ativo === true,
    descricao: String(row.descricao || '').trim(),
    conhecimento: String(row.conhecimento || '').trim(),
    links: links
      .map(l => ({ rotulo: String(l?.rotulo || '').trim(), url: String(l?.url || '').trim() }))
      .filter(l => /^https?:\/\//i.test(l.url)),
    encaminhar_para: String(row.encaminhar_para || '').trim(),
  };
}

/** Procura a área pelo nome, sem acento nem caixa. "nenhuma"/vazio ⇒ null. */
function acharArea(nome, areas) {
  const n = normalizarNome(nome);
  if (!n || n === 'nenhuma' || n === 'nenhum' || n === 'outra' || n === 'outro') return null;
  return (areas || []).find(a => normalizarNome(a.area) === n) || null;
}

// ── antes do modelo ─────────────────────────────────────────────────────────

/**
 * Decide se vale a pena chamar o modelo. Cada `motivo` é um estado distinto
 * porque o resumo da tela separa "calou por limite" de "calou porque um humano
 * está atendendo" — e as duas coisas pedem ações diferentes de quem gerencia.
 */
function decidirAntesDoModelo({
  texto, agradecimento = false, areasAtivas = 0,
  respostasConversaHoje = 0, respostasHoje = 0,
  ultimaHumanaEm = null, agora = Date.now(), limites = LIMITES_PADRAO,
} = {}) {
  if (!String(texto || '').trim()) return { pular: true, motivo: 'sem_texto' };
  if (agradecimento) return { pular: true, motivo: 'agradecimento' };
  if (!areasAtivas) return { pular: true, motivo: 'sem_area_ativa' };
  if (respostasHoje >= limites.limite_dia) return { pular: true, motivo: 'limite_dia' };
  if (respostasConversaHoje >= limites.limite_conversa_dia) return { pular: true, motivo: 'limite_conversa' };
  if (ultimaHumanaEm) {
    const ms = new Date(ultimaHumanaEm).getTime();
    if (Number.isFinite(ms) && (agora - ms) < limites.horas_silencio_apos_humano * 3600 * 1000) {
      return { pular: true, motivo: 'humano_ativo' };
    }
  }
  return { pular: false, motivo: null };
}

// ── depois do modelo ────────────────────────────────────────────────────────

/**
 * Normaliza o que o modelo devolveu contra o que a CASA permite.
 *
 * ⚠️⚠️ A régua da área DESLIGADA é o coração do pedido do Marcos: área com gente
 * atendendo ⇒ o bot cala, mesmo que o modelo tenha escrito uma resposta boa. E
 * "encaminhar" numa área desligada também cala — mandar a pessoa pro CBZap
 * quando há uma equipe atendendo AQUI seria empurrá-la pra fora da fila certa.
 *
 * ⚠️ "responder" sem área conhecida vira ENCAMINHAR (não há conhecimento de onde
 * tirar a resposta) — e encaminhar sem contato humano configurado vira SILÊNCIO.
 */
function normalizarDecisao(input, { areas = [], contatoHumano = '' } = {}) {
  const acaoCrua = String(input?.acao || '').trim().toLowerCase();
  const acao = ACOES.includes(acaoCrua) ? acaoCrua : 'silencio';
  const area = acharArea(input?.area, areas);
  const resposta = String(input?.resposta || '').trim();
  const motivoModelo = String(input?.motivo || '').trim().slice(0, 300);

  if (acao === 'silencio') return { acao: 'silencio', area, resposta: '', motivo: motivoModelo || 'modelo_silencio' };

  if (area && area.ativo !== true) return { acao: 'silencio', area, resposta: '', motivo: 'area_desligada' };

  if (acao === 'encaminhar' || !area) {
    if (!String(contatoHumano || '').trim()) return { acao: 'silencio', area, resposta: '', motivo: 'sem_contato_humano' };
    return { acao: 'encaminhar', area, resposta: '', motivo: area ? (motivoModelo || 'modelo_encaminhar') : 'sem_area' };
  }

  if (!resposta) return { acao: 'silencio', area, resposta: '', motivo: 'resposta_vazia' };
  return { acao: 'responder', area, resposta, motivo: motivoModelo || 'modelo_responder' };
}

// ── sanitização do texto ────────────────────────────────────────────────────

const RE_URL = /(?:https?:\/\/|www\.)[^\s)>\]]+/gi;
// ≥8 dígitos com separadores comuns · pega "(21) 99756-7770", "+55 21 9 9756 7770", "2199756770"
const RE_TELEFONE = /\+?\d[\d\s().-]{6,}\d/g;

function normalizarUrl(u) {
  return String(u || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .replace(/[.,;:!?)]+$/, '').replace(/\/+$/, '');
}

/**
 * Tira do texto o que o modelo pode ter INVENTADO: URL que não está na lista
 * permitida e telefone que não é o contato humano configurado. Nunca acrescenta
 * nada — quem completa é o `textoEncaminhamento`.
 *
 * ⚠️ Link inventado é o pior erro possível aqui (a pessoa clica e não abre, ou
 * abre outra coisa), então a comparação é por PREFIXO normalizado: o modelo
 * pode citar `https://www.cbrio.org/grupos?x=1` se `cbrio.org/grupos` está
 * permitido, mas nunca um domínio que não foi configurado.
 */
function sanitizarResposta(texto, { linksPermitidos = [], contato = '' } = {}) {
  let t = String(texto || '');
  const permitidos = (linksPermitidos || []).map(normalizarUrl).filter(Boolean);
  const contatoDig = soDigitos(contato);
  let links = 0; let telefones = 0;

  t = t.replace(RE_URL, (m) => {
    const n = normalizarUrl(m);
    if (permitidos.some(p => n === p || n.startsWith(p + '/') || n.startsWith(p + '?') || n.startsWith(p + '#'))) return m;
    links += 1;
    return '';
  });

  t = t.replace(RE_TELEFONE, (m) => {
    const d = soDigitos(m);
    // ⚠️ Telefone BR tem 10–13 dígitos (DDD + número, com ou sem o 55). Abaixo
    // disso NÃO é telefone: uma data ISO ("2026-09-08" = 8 dígitos) casaria o
    // regex e seria apagada da resposta. O mutante que baixava este limiar
    // sobreviveu na 1ª rodada — este comentário é o motivo dele existir.
    if (d.length < 10) return m;
    if (contatoDig && contatoDig.endsWith(d.slice(-8))) return m;
    telefones += 1;
    return '';
  });

  t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > MAX_RESPOSTA_CHARS) {
    const corte = t.lastIndexOf(' ', MAX_RESPOSTA_CHARS);
    t = t.slice(0, corte > MAX_RESPOSTA_CHARS * 0.6 ? corte : MAX_RESPOSTA_CHARS).trim() + '…';
  }
  return { texto: t, removidos: { links, telefones } };
}

// ── textos fixos ────────────────────────────────────────────────────────────

function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

/** `https://wa.me/55DDDNUMERO` quando o contato é um telefone BR plausível; senão null. */
function linkWaMe(contato) {
  const d = soDigitos(contato);
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `https://wa.me/${d}`;
  return null;
}

/**
 * A mensagem de encaminhamento é DETERMINÍSTICA (não vem do modelo): é a única
 * que carrega um telefone, e telefone é o que não pode sair errado.
 */
function textoEncaminhamento({ nome = '', contato = '', contatoLink = null, area = null } = {}) {
  const oi = primeiroNome(nome) ? `Oi, ${primeiroNome(nome)}!` : 'Oi!';
  const equipe = area ? `a equipe de ${area}` : 'a nossa equipe';
  const linhas = [
    oi,
    `Essa dúvida ${equipe} responde melhor pessoalmente. Fala com a gente pelo WhatsApp da CBRio: ${String(contato).trim()}`,
  ];
  if (contatoLink) linhas.push(contatoLink);
  linhas.push('Vamos te atender por lá 🙏');
  return linhas.join('\n');
}

// ── prompts ─────────────────────────────────────────────────────────────────

const TOOL_DECISAO = Object.freeze({
  name: 'decidir',
  description: 'Decide o que fazer com a mensagem recebida no WhatsApp da igreja: classificar a área do assunto e responder, encaminhar para a equipe humana, ou ficar em silêncio.',
  input_schema: {
    type: 'object',
    properties: {
      area: { type: 'string', description: 'Nome EXATO de uma das áreas listadas no sistema, ou "nenhuma" quando o assunto não é de nenhuma área.' },
      acao: { type: 'string', enum: ACOES, description: 'responder = você tem o conhecimento e a área está ligada · encaminhar = dúvida que exige gente (ou área sem conhecimento) · silencio = a mensagem não pede nada, ou a área está DESLIGADA.' },
      resposta: { type: 'string', description: 'O texto a enviar quando acao = responder. Vazio nas outras ações.' },
      motivo: { type: 'string', description: 'Uma frase curta explicando a decisão (fica no registro interno, a pessoa não vê).' },
    },
    required: ['area', 'acao', 'motivo'],
    additionalProperties: false,
  },
});

function montarSystemPrompt({ areas = [], institucional = null, contatoHumano = '', instrucoes = '', dataHoje = '' } = {}) {
  const inst = institucional && typeof institucional === 'object' ? institucional : {};
  const ligadas = areas.filter(a => a.ativo === true);
  const desligadas = areas.filter(a => a.ativo !== true);

  const blocoAreas = areas.length
    ? areas.map(a => `- ${a.area} · ${a.ativo === true ? 'LIGADA (você responde)' : 'DESLIGADA (a equipe humana responde · use acao=silencio)'}${a.descricao ? ` · ${a.descricao}` : ''}`).join('\n')
    : '- (nenhuma área configurada)';

  const blocoConhecimento = ligadas.map(a => {
    const partes = [`### ${a.area}`];
    if (a.conhecimento) partes.push(a.conhecimento);
    if (normalizarNome(a.area) === normalizarNome(AREA_GERAL)) {
      if (inst.horarios) partes.push(`Horários de culto: ${String(inst.horarios).trim()}`);
      if (inst.endereco) partes.push(`Endereço: ${String(inst.endereco).trim()}`);
      if (inst.sobre) partes.push(`Sobre a igreja: ${String(inst.sobre).trim()}`);
    }
    if (a.links.length) partes.push('Links que você PODE enviar (copie exatamente):\n' + a.links.map(l => `- ${l.rotulo || 'link'}: ${l.url}`).join('\n'));
    if (a.encaminhar_para) partes.push(`Quando encaminhar nesta área, cite: ${a.encaminhar_para}`);
    return partes.join('\n');
  }).join('\n\n');

  return [
    'Você é o assistente de WhatsApp da CBRio (Comunidade Batista do Rio de Janeiro). Você responde dúvidas RÁPIDAS de quem escreve para o número da igreja, em português do Brasil, com tom acolhedor e direto.',
    dataHoje ? `Hoje é ${dataHoje}.` : '',
    '',
    '## O que você faz',
    '1. Classifica o assunto da mensagem em UMA das áreas abaixo (ou "nenhuma").',
    '2. Se a área está LIGADA e o conhecimento dela responde a dúvida: acao=responder, com um texto curto (até 4 frases).',
    '3. Se a área está DESLIGADA: acao=silencio — a equipe humana daquela área vai responder pelo próprio inbox. Não explique isso à pessoa.',
    '4. Se a dúvida exige gente (dinheiro, dados pessoais, situação pastoral, reclamação, urgência, pedido de oração, algo fora do conhecimento): acao=encaminhar. O sistema manda o contato da equipe; você não escreve esse texto.',
    '5. Se a mensagem não pede nada (ok, amém, obrigado, figurinha, "boa noite" sozinho respondendo a algo nosso): acao=silencio.',
    '6. Se a pessoa apenas cumprimenta e pergunta se pode falar: acao=responder, área "Geral" (se ligada), convidando a dizer a dúvida.',
    '',
    '## Regras que você NUNCA quebra',
    '- Só use o que está no conhecimento abaixo e no contexto da pessoa. Nunca invente link, telefone, data, horário, valor, nome de pessoa ou regra.',
    '- Nunca prometa prazo nem ação de terceiro ("o líder vai te ligar hoje"). Pode dizer que a liderança entra em contato, sem prazo.',
    '- Se a pessoa está inscrita/vinculada num grupo e a dúvida é do grupo (encontro, link, endereço, data), oriente a falar com o líder e passe o contato do líder que está no contexto — não invente.',
    '- Não peça CPF, endereço ou dado pessoal. Não trate de dinheiro.',
    '- Não se apresente como pessoa. Se perguntarem, você é o atendimento automático da CBRio.',
    '- Sem listas longas, sem markdown, no máximo 1 emoji. Nunca comece com "Olá! Sou um assistente".',
    contatoHumano ? `- O contato humano da igreja (CBZap) é ${contatoHumano}. Você NÃO escreve esse número em resposta — quem manda é o sistema, quando acao=encaminhar.` : '- Não há contato humano configurado: prefira responder quando souber e ficar em silêncio quando não souber.',
    '',
    '## Áreas',
    blocoAreas,
    desligadas.length ? '' : '',
    '',
    '## Conhecimento por área (só as LIGADAS)',
    blocoConhecimento || '(nenhuma área ligada — use acao=silencio ou encaminhar)',
    '',
    instrucoes ? `## Instruções da equipe\n${String(instrucoes).trim()}` : '',
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function montarMensagemUsuario({ conversa = null, perfil = null, historico = [], texto = '' } = {}) {
  const p = perfil || {};
  const linhasPessoa = [];
  const nome = conversa?.nome || p.nome || null;
  linhasPessoa.push(`Nome: ${nome || '(desconhecido)'}`);
  linhasPessoa.push(`Cadastro na igreja: ${p.cadastrado ? 'sim' : 'não encontrado'}`);
  if (p.cadastrado) {
    linhasPessoa.push(`Batizado(a): ${p.batizado ? 'sim' : 'sem registro'}`);
    linhasPessoa.push(`Fez o Next: ${p.fez_next ? 'sim' : 'sem registro'}`);
    linhasPessoa.push(`Serve como voluntário(a): ${p.serve ? 'sim' : 'sem registro'}`);
  }
  if (p.grupo) {
    const g = p.grupo;
    const partes = [`Grupo de conexão: ${g.nome}`];
    if (g.online) partes.push('modalidade: online');
    if (g.lider_nome) partes.push(`líder: ${g.lider_nome}${g.lider_telefone ? ` (${g.lider_telefone})` : ''}`);
    if (g.proxima) partes.push(`próximo encontro: ${g.proxima}${g.estimada ? ' (data estimada — não afirme como certa)' : ''}`);
    if (g.local) partes.push(`local: ${g.local}`);
    linhasPessoa.push(partes.join(' · '));
  } else if (p.grupo_motivo === 'ambiguo') {
    linhasPessoa.push('Grupo de conexão: está em mais de um grupo — não afirme qual.');
  } else if (p.cadastrado) {
    linhasPessoa.push('Grupo de conexão: sem vínculo ativo');
  }
  if (p.sugestao_grupo) linhasPessoa.push(`Resposta pronta da casa sobre o grupo (use como base se a dúvida for de encontro/link/endereço do grupo):\n${p.sugestao_grupo}`);
  if (conversa?.area) linhasPessoa.push(`Área já marcada nesta conversa: ${conversa.area}`);

  const hist = (historico || []).slice(-8).map(m => {
    const quem = m.direcao === 'in' ? 'PESSOA' : (m.tipo === 'bot' || m.tipo === 'institucional' ? 'IGREJA (automático)' : 'IGREJA');
    return `[${quem}] ${String(m.texto || `[${m.tipo || 'mídia'}]`).replace(/\s+/g, ' ').slice(0, 300)}`;
  });

  return [
    '## Pessoa',
    linhasPessoa.join('\n'),
    '',
    '## Últimas mensagens (mais antigas primeiro)',
    hist.length ? hist.join('\n') : '(primeira mensagem desta conversa)',
    '',
    '## Mensagem NOVA da pessoa',
    String(texto || '').slice(0, 1500),
    '',
    'Decida com a ferramenta `decidir`.',
  ].join('\n');
}

module.exports = {
  ACOES, LIMITES_PADRAO, MAX_RESPOSTA_CHARS, AREA_GERAL, TOOL_DECISAO,
  normalizarNome, lerConfigBotIa, modoResposta, lerArea, acharArea,
  decidirAntesDoModelo, normalizarDecisao, sanitizarResposta,
  linkWaMe, textoEncaminhamento, montarSystemPrompt, montarMensagemUsuario,
};
