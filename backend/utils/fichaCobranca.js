/**
 * Régua PURA de COBRANÇA da ficha da CONTRATADA (Anexo II).
 *
 * Decide **quem recebe o link, por qual canal e em qual rodada** — primeira
 * via, lembrete ou nada. Vive em `utils/` (sem supabase, sem rede, sem relógio
 * implícito) porque entra no gate: é ela que decide se uma pessoa recebe
 * mensagem, e errar aqui é spam no número institucional ou silêncio em quem
 * precisa receber.
 *
 * ⚠️⚠️ POR QUE ELA EXISTE, medido em 21/09/2026 no disparo irmão (onboarding):
 *  · saiu **UMA leva, em 21/08**, e **ZERO lembretes** nos 31 dias seguintes;
 *  · as 31 primeiras tentativas falharam (`132001`, template inexistente) e o
 *    reenvio entregou 30 — mas só **15 leram**;
 *  · entre quem LEU, 9 de 15 preencheram (60%); entre quem não leu, 5 de 15.
 *    Ou seja **o gargalo não é o formulário, é a mensagem não chegar**;
 *  · o disparo é **WhatsApp-only** enquanto **40 dos 46** colaboradores têm
 *    e-mail e o canal do Graph funciona;
 *  · e `gerarOnboardingLink` carimba `enviado_em` ANTES de saber se enviou —
 *    com template ausente, marca todo mundo como "enviado" sem mandar nada.
 *
 * Construir mais campo não produz o dado. **Cobrar produz.**
 */

/** Dia no fuso da igreja (BRT). Nunca `toISOString()`: às 21h o dia UTC já virou. */
function diaBRT(agora) {
  const d = agora instanceof Date ? agora : new Date(agora);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Dias inteiros entre dois instantes. Devolve null se algum for ilegível. */
function diasEntre(depois, antes) {
  const a = new Date(antes);
  const b = depois instanceof Date ? depois : new Date(depois);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Escada de cobrança. Depois da última, PARA.
 *
 * ⚠️⚠️ O teto não é detalhe: cobrança que não termina vira perseguição, e a
 * pessoa que já decidiu não responder passa a associar o número institucional a
 * incômodo — o que queima o canal para TODO o resto do sistema. Três toques em
 * ~10 dias é escada; o quarto é assédio, e quem resolve dali em diante é gente
 * (a lista nominal existe para isso).
 */
const ESCADA_DIAS = [3, 7];
const MAX_COBRANCAS = 1 + ESCADA_DIAS.length; // 1ª via + 2 lembretes

/**
 * Canais pelos quais dá para alcançar a pessoa.
 *
 * ⚠️⚠️ E-MAIL É O CANAL PRIMÁRIO, não o secundário. O disparo irmão é
 * WhatsApp-only e 40 de 46 têm e-mail; o Graph tem 99% de alcance histórico
 * nesta casa e **não tem teto de 250/24h nem risco de queimar a nota de
 * qualidade do número**. O WhatsApp entra como REFORÇO quando existe template
 * aprovado — nunca como único caminho.
 */
function canaisDe(func, { temTemplateWhatsapp = false } = {}) {
  const f = func || {};
  const canais = [];

  // ⚠️⚠️ NOTIFICAÇÃO NO SISTEMA primeiro. Medido em 22/09: **28 dos 32 PJ têm
  // conta ativa** — o prestador entra no ERP e o aviso está lá, com o link.
  //
  // Ela não aumenta o ALCANCE (29 por e-mail × 29 por algum canal), aumenta a
  // chance de ser VISTA: no disparo irmão só 15 de 30 leram a mensagem, e entre
  // quem leu 60% preencheu contra 33% entre quem não leu. O gargalo medido é a
  // mensagem não chegar aos olhos, não o formulário.
  //
  // ⚠️ `profile_id` é resolvido por quem LÊ o banco (o serviço), nunca aqui —
  // esta régua é pura.
  if (f.profile_id) canais.push('sistema');

  const email = String(f.email || '').trim();
  // ⚠️ Relay do "Entrar com Apple" é caixa técnica que a pessoa não lê — mandar
  // ali a marcaria como cobrada sem ela nunca ter visto (lei do censo, 04/08).
  if (email.includes('@') && !email.endsWith('@privaterelay.appleid.com')) canais.push('email');
  const tel = String(f.telefone || '').replace(/\D/g, '');
  const semPais = tel.length > 11 && tel.startsWith('55') ? tel.slice(2) : tel;
  if (temTemplateWhatsapp && (semPais.length === 10 || semPais.length === 11)) canais.push('whatsapp');
  return canais;
}

/**
 * Decide o que fazer com UMA pessoa.
 *
 * Devolve `{ acao, rodada, canais, motivo }` onde `acao` é:
 *   · `'enviar'`  — manda agora (rodada 1 = primeira via, 2+ = lembrete)
 *   · `'aguardar'`— já cobrado, mas ainda não deu o intervalo
 *   · `'parar'`   — preencheu, não é PJ, esgotou a escada ou não há canal
 *
 * ⚠️ NUNCA devolve `'enviar'` sem canal: a lei do censo (05/08) — envio que não
 * envia ninguém não pode aparecer como sucesso.
 */
function decidirCobranca(func, { agora, temTemplateWhatsapp = false, estado } = {}) {
  const f = func || {};
  const ref = agora instanceof Date ? agora : new Date(agora);

  // ⚠️ Estado da ficha vem de fora (`fichaContratada.estadoFicha`) para não
  // duplicar a régua de prontidão. Duas respostas para "está completa?" é como
  // a tela e a cobrança passariam a discordar.
  if (estado && estado.aplicavel === false) {
    return { acao: 'parar', rodada: 0, canais: [], motivo: 'nao_e_pj' };
  }
  if (estado && estado.completa) {
    return { acao: 'parar', rodada: 0, canais: [], motivo: 'ja_entregou' };
  }

  const cobrancas = Array.isArray(f.ficha_contratada_cobrancas) ? f.ficha_contratada_cobrancas : [];
  const feitas = cobrancas.length;
  const canais = canaisDe(f, { temTemplateWhatsapp });

  if (!canais.length) {
    // ⚠️ "Não tem como receber o link" é coisa DIFERENTE de "não respondeu" —
    // medido: 2 dos 32 PJ não têm e-mail nem telefone. Colapsar os dois faz a
    // lista cobrar quem nunca foi alcançado.
    return { acao: 'parar', rodada: 0, canais: [], motivo: 'sem_canal' };
  }
  if (feitas >= MAX_COBRANCAS) {
    return { acao: 'parar', rodada: feitas, canais, motivo: 'escada_esgotada' };
  }
  if (feitas === 0) {
    return { acao: 'enviar', rodada: 1, canais, motivo: 'primeira_via' };
  }

  const ultima = cobrancas[cobrancas.length - 1];
  const dias = diasEntre(ref, ultima && ultima.em);
  if (dias === null) {
    // ⚠️ Data ilegível NÃO vira "manda de novo": erraria para o lado do spam.
    return { acao: 'parar', rodada: feitas, canais, motivo: 'data_ilegivel' };
  }
  const intervalo = ESCADA_DIAS[feitas - 1];
  if (dias < intervalo) {
    return { acao: 'aguardar', rodada: feitas, canais, motivo: `faltam ${intervalo - dias} dia(s)` };
  }
  return { acao: 'enviar', rodada: feitas + 1, canais, motivo: 'lembrete' };
}

/**
 * Monta a rodada inteira a partir da lista de candidatos.
 *
 * ⚠️ TETO de rodada com o que ficou de fora DECLARADO (`adiados`): a lei de
 * 04/08 — envio em massa sem teto estoura o `maxDuration` da função, e função
 * morta no meio não registra o que já saiu, fazendo a próxima rodada repetir.
 */
function montarRodada(lista, { agora, temTemplateWhatsapp = false, teto = 50, estadoDe } = {}) {
  const enviar = [];
  const resumo = { aguardando: 0, ja_entregou: 0, sem_canal: 0, nao_e_pj: 0, escada_esgotada: 0, data_ilegivel: 0 };

  for (const f of (lista || [])) {
    const estado = typeof estadoDe === 'function' ? estadoDe(f) : undefined;
    const d = decidirCobranca(f, { agora, temTemplateWhatsapp, estado });
    if (d.acao === 'enviar') { enviar.push({ func: f, ...d }); continue; }
    if (d.acao === 'aguardar') { resumo.aguardando += 1; continue; }
    if (Object.prototype.hasOwnProperty.call(resumo, d.motivo)) resumo[d.motivo] += 1;
  }

  // Primeira via antes de lembrete: quem nunca recebeu é quem mais precisa.
  enviar.sort((a, b) => a.rodada - b.rodada);
  return { enviar: enviar.slice(0, teto), adiados: Math.max(0, enviar.length - teto), resumo };
}

module.exports = {
  ESCADA_DIAS, MAX_COBRANCAS,
  diaBRT, diasEntre, canaisDe, decidirCobranca, montarRodada,
};
