// ════════════════════════════════════════════════════════════════════════════
//  CENSO · régua PURA do convite de atualização cadastral
//
//  Vive em utils/ (sem cliente Supabase, sem rede, sem relógio) porque é aqui
//  que se decide QUEM recebe mensagem e QUANTAS saem por rodada — e isso tem
//  que ser testável no gate de deploy. O serviço (services/censoDisparo.js) lê
//  o banco e envia; a decisão está toda aqui.
// ════════════════════════════════════════════════════════════════════════════

const { telefoneAlcancavel, digitos } = require('../services/contatoPessoa');
const { gerarTokenCenso } = require('./censoToken');

// ⚠️⚠️ Teto do TIER_250 da Meta (250 destinatários ÚNICOS por 24h), com folga
// pros avisos operacionais que dividem a mesma cota no dia. NÃO é um número
// escolhido por conforto: a fila desiste de uma mensagem 36h depois de criada
// (`whatsappFila.IDADE_MIN_DESISTIR_H`), então enfileirar acima do teto diário
// não entrega devagar — DESCARTA o excedente em silêncio, e a pessoa nunca
// recebe o convite. Só subir quando o tier da conta subir.
const TETO_RODADA_WHATSAPP = 200;

// Graph estrangula em ~30/min e o envio é sequencial dentro de uma requisição.
const TETO_RODADA_EMAIL = 200;

/**
 * O canal de WhatsApp está pronto para disparar?
 *
 * ⚠️ A env `WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO` é o SEMÁFORO: ela só é setada
 * depois de a Meta APROVAR o template. Enquanto o template está "em análise" o
 * envio falha (a Meta recusa template não aprovado), e o estrago é silencioso e
 * permanente: o disparo registraria as pessoas como CONVIDADAS
 * (`mem_censo_convites`), a mensagem nunca chegaria, e a próxima rodada as
 * pularia por já estarem convidadas. 200 pessoas perdidas sem erro na tela.
 *
 * Por isso NÃO basta o nome do template ter um default no código: sem a env, o
 * canal fica fechado e só o e-mail sai.
 */
function whatsappPronto(env = process.env) {
  return !!String(env.WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO || '').trim();
}

/** CPF ausente ou fora dos 11 dígitos = "sem CPF" para efeito do censo. */
function semCpf(cpf) {
  return digitos(cpf).length !== 11;
}

/**
 * O {{1}} do template.
 * ⚠️ Nome vazio cai num vocativo neutro: "Olá !" numa mensagem institucional
 *    para 200 pessoas é pior que não ter nome.
 */
function primeiroNome(nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return 'tudo bem';
  return limpo.split(' ')[0];
}

function emailUtilizavel(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  // ⚠️ Relay do "Entrar com Apple": a entrega até funciona, mas é uma caixa
  // técnica que a pessoa não lê como e-mail dela — convite ali é convite
  // perdido, e ainda marcaria a pessoa como já convidada.
  if (e.endsWith('privaterelay.appleid.com')) return false;
  return true;
}

/**
 * Por quais canais esta pessoa pode ser convidada, e por que não pelos outros.
 * @returns {{whatsapp:boolean, email:boolean, motivos:string[]}}
 */
function canaisDaPessoa(pessoa, { canais = ['whatsapp', 'email'], optinObrigatorio = false } = {}) {
  const p = pessoa || {};
  const motivos = [];
  const quer = c => canais.includes(c);

  let whatsapp = false;
  if (quer('whatsapp')) {
    if (!digitos(p.telefone)) motivos.push('sem_telefone');
    else if (!telefoneAlcancavel(p.telefone)) motivos.push('numero_errado');
    else if (optinObrigatorio && !p.whatsapp_optin) motivos.push('sem_optin');
    else whatsapp = true;
  }

  let email = false;
  if (quer('email')) {
    if (!emailUtilizavel(p.email)) motivos.push('sem_email');
    else email = true;
  }

  return { whatsapp, email, motivos };
}

/**
 * Corta a lista no teto da rodada.
 * ⚠️ O que ficou de fora é DEVOLVIDO (`adiados`), nunca descartado em silêncio:
 *    "convidei 200" lido como "convidei todo mundo" é a leitura errada que faz
 *    a equipe achar que a campanha acabou.
 */
function limitarPorTeto(lista, teto) {
  const arr = Array.isArray(lista) ? lista : [];
  if (!Number.isFinite(teto) || teto <= 0) return { envia: [], adiados: arr.length };
  return { envia: arr.slice(0, teto), adiados: Math.max(0, arr.length - teto) };
}

/**
 * Link do censo. `?censo=1` é o MESMO parâmetro do QR impresso do culto.
 *
 * ⚠️ Com `membroId` o link vai PESSOAL (`&t=<token assinado>`) e o formulário
 * abre COM OS DADOS DELA, marcando o que falta. É isso que responde "como o
 * sistema vai achar a pessoa se ela não tem CPF?" — não precisa achar: o link
 * foi emitido para ela. Sem token o link é genérico e cai no cadastro normal
 * (é o caso do QR impresso, que não sabe quem vai escanear).
 *
 * ⚠️ Fail-closed: sem segredo configurado `gerarTokenCenso` devolve null e o
 * link degrada pro genérico — a campanha não para, só perde o preenchimento.
 */
function montarLinkCenso(baseUrl, membroId = null) {
  const base = String(baseUrl || 'https://cbrio.org').replace(/\/+$/, '');
  const generico = `${base}/cadastro-membresia?censo=1`;
  if (!membroId) return generico;
  const token = gerarTokenCenso(membroId);
  return token ? `${generico}&t=${token}` : generico;
}

module.exports = {
  TETO_RODADA_WHATSAPP,
  TETO_RODADA_EMAIL,
  whatsappPronto,
  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
};
