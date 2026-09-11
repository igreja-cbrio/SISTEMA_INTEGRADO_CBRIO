// ════════════════════════════════════════════════════════════════════════════
//  VISITANTES · réguas PURAS da porta pública `/visitante` (09/09/2026)
//
//  Vive em utils/ (sem Supabase, sem rede, sem relógio implícito) porque é o
//  que entra no gate de deploy (`npm run test:visitante`). Quem lê/escreve o
//  banco é routes/publicVisitante.js, routes/visitantes.js e
//  services/visitantePesquisa.js — todos consomem DAQUI.
//
//  Quatro decisões moram aqui:
//   1. validarVisitante   — o que o formulário do QR aceita (nome · WhatsApp ·
//                           CPF com dígito verificador · aceite LGPD `=== true`).
//   2. LOCAIS             — onde o QR estava. Lista FECHADA (lei de 24/08:
//                           opção que vira dado não vive no cliente); valor
//                           desconhecido cai em 'outro', nunca recusa.
//   3. gerarCodigoVoucher — 6 chars, alfabeto sem O/0/I/1 (o mesmo do totem).
//   4. pesquisaDevida     — QUANDO a pesquisa de satisfação sai: depois que o
//                           culto acabou, nunca antes; e nunca depois de 72h,
//                           quando ela já virou mensagem fora de hora.
//   5. comentarioNaJanela — até quando o texto livre da pessoa ainda conta
//                           como comentário: até a virada do dia BRT do voto
//                           (com piso de 6h). Depois disso é conversa, e vai
//                           pro fluxo normal.
// ════════════════════════════════════════════════════════════════════════════

const { ALFABETO } = require('./totemCerco');

const LOCAIS = [
  { id: 'lounge',        nome: 'Lounge',        chamada: 'Primeira vez aqui? Ganhe um café por nossa conta.' },
  { id: 'banheiro',      nome: 'Banheiro',      chamada: 'É visitante? Um café te espera na cafeteria.' },
  { id: 'estacionamento', nome: 'Estacionamento', chamada: 'Chegou pela primeira vez? Seu café é presente nosso.' },
  { id: 'templo',        nome: 'Templo',        chamada: 'Que bom ter você aqui! Registre sua visita e ganhe um café.' },
  { id: 'outro',         nome: 'Outro / sem local', chamada: 'Primeira vez na CBRio? Ganhe um café por nossa conta.' },
];
const IDS_LOCAIS = LOCAIS.map((l) => l.id);

const CODIGO_LEN = 6;
// Culto padrão dura ~2h; a pesquisa sai quando ele já acabou (2h30 depois do
// início cobre quarta e domingo · medido no calendário: nenhum culto da sede
// passa de 2h). Sem culto atribuído, conta do REGISTRO.
const MIN_APOS_CULTO = 150;
const MIN_APOS_REGISTRO_SEM_CULTO = 120;
// Depois disso a pesquisa não sai: pergunta de satisfação três dias depois é
// mensagem fora de hora, e o opt-in foi pra "depois do culto".
const HORAS_VALIDADE_PESQUISA = 72;
// A escala da pesquisa: 1 (pior) · 2 (meio) · 3 (melhor). Ver normalizarNota.
const NOTA_MAX = 3;
// Piso da janela do comentário (ver fimDaJanelaComentario).
const HORAS_MIN_COMENTARIO = 6;

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Dígito verificador do CPF · rejeita sequência repetida (000…, 111…). */
function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base, peso) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

function normalizarLocal(local) {
  const l = String(local || '').trim().toLowerCase();
  return IDS_LOCAIS.includes(l) ? l : 'outro';
}

/**
 * Valida o corpo do POST público. Devolve `{ ok, valores }` ou
 * `{ ok:false, erro, campo }`. O formulário valida antes pra dar erro na hora,
 * mas quem MANDA é esta função — payload é do cliente.
 */
function validarVisitante(body) {
  const b = body && typeof body === 'object' ? body : {};
  const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2) return { ok: false, erro: 'Informe seu nome.', campo: 'nome' };
  if (nome.length > 120) return { ok: false, erro: 'Nome longo demais.', campo: 'nome' };

  let telefone = soDigitos(b.telefone);
  // 55 + 11 dígitos = a pessoa digitou com o país; tira só quando SOBRA número inteiro.
  if (telefone.length === 13 && telefone.startsWith('55')) telefone = telefone.slice(2);
  if (telefone.length < 10 || telefone.length > 11) {
    return { ok: false, erro: 'Informe seu WhatsApp com DDD (10 ou 11 dígitos).', campo: 'telefone' };
  }

  const cpf = soDigitos(b.cpf);
  if (cpf.length !== 11) return { ok: false, erro: 'Informe o CPF com 11 dígitos.', campo: 'cpf' };
  if (!cpfValido(cpf)) return { ok: false, erro: 'Esse CPF não é válido — confira os números.', campo: 'cpf' };

  // ⚠️ `=== true`, não truthy: "on", "1" e "false" (string) não são aceite.
  if (b.aceite_lgpd !== true) {
    return { ok: false, erro: 'Para registrar, marque o aceite do tratamento dos seus dados.', campo: 'aceite_lgpd' };
  }

  return {
    ok: true,
    valores: {
      nome,
      telefone,
      cpf,
      // Opt-in do WhatsApp: é o que libera a PESQUISA. `=== true` pela mesma razão.
      whatsapp_optin: b.whatsapp_optin === true,
      local: normalizarLocal(b.local),
    },
  };
}

/**
 * Código do voucher · 6 chars no alfabeto do totem (sem O/0/I/1 — a pessoa
 * DITA o código no balcão). `rand` injetável pra teste; default crypto.
 */
function gerarCodigoVoucher(rand) {
  const r = typeof rand === 'function' ? rand : defaultRand;
  let out = '';
  for (let i = 0; i < CODIGO_LEN; i++) out += ALFABETO[r(ALFABETO.length)];
  return out;
}
function defaultRand(n) {
  // eslint-disable-next-line global-require
  return require('crypto').randomInt(n);
}

/** Como a pessoa digita no balcão: maiúsculo, sem espaço/hífen, O→0? NÃO — o alfabeto não tem O nem 0. */
function normalizarCodigoVoucher(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** `hora` 'HH:MM[:SS]' → minutos do dia, ou null. */
function minutosDaHora(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Instante (ms) em que a pesquisa passa a ser devida.
 *  · com culto (data + hora): início do culto em BRT + MIN_APOS_CULTO;
 *  · sem culto: registro + MIN_APOS_REGISTRO_SEM_CULTO.
 * ⚠️ `cultoData` é dia BRT ('YYYY-MM-DD') e `cultoHora` é hora BRT — a conversão
 * pra instante soma +3h (BRT = UTC−3, fixo desde 2019).
 */
function instanteDevido({ registradoEm, cultoData, cultoHora }) {
  const reg = new Date(registradoEm).getTime();
  const min = minutosDaHora(cultoHora);
  if (cultoData && min != null && /^\d{4}-\d{2}-\d{2}$/.test(String(cultoData))) {
    const inicioUtc = Date.parse(`${cultoData}T00:00:00Z`) + 3 * 3600 * 1000 + min * 60 * 1000;
    // Registro DEPOIS do culto ter acabado (a pessoa preencheu na saída, ou no
    // dia seguinte): conta do registro, senão a pesquisa sairia "no passado" e
    // chegaria junto do voucher.
    const porCulto = inicioUtc + MIN_APOS_CULTO * 60 * 1000;
    return Math.max(porCulto, reg + 30 * 60 * 1000);
  }
  return reg + MIN_APOS_REGISTRO_SEM_CULTO * 60 * 1000;
}

/**
 * Decide o destino de uma visita na varredura horária:
 *   'enviar'   — devida e dentro da validade;
 *   'aguardar' — ainda não chegou a hora;
 *   'expirada' — passou de HORAS_VALIDADE_PESQUISA desde o registro (não sai mais).
 * Quem já recebeu (`pesquisaEnviadaEm`) ou não deu opt-in nunca chega aqui —
 * mas a régua repete a guarda, porque é barato e o teste cobre.
 */
function pesquisaDevida({ registradoEm, cultoData, cultoHora, whatsappOptin, pesquisaEnviadaEm, agora }) {
  if (whatsappOptin !== true) return 'nao_elegivel';
  if (pesquisaEnviadaEm) return 'ja_enviada';
  const now = agora instanceof Date ? agora.getTime() : (typeof agora === 'number' ? agora : Date.now());
  const reg = new Date(registradoEm).getTime();
  if (!Number.isFinite(reg)) return 'nao_elegivel';
  if (now - reg > HORAS_VALIDADE_PESQUISA * 3600 * 1000) return 'expirada';
  return now >= instanteDevido({ registradoEm, cultoData, cultoHora }) ? 'enviar' : 'aguardar';
}

/** Primeiro nome pra parâmetro de template (sem quebra de linha · lei da Meta 132000). */
function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'Olá';
}

/**
 * Nota da pesquisa: inteiro 1..3, senão null.
 *
 * ⚠️⚠️ A ESCALA É 1 · 2 · 3 desde 11/09/2026 (decisão do Marcos: *"1 a pior, 2
 * a do meio, 3 a maior… ai fazemos a média depois"*). Três botões, três
 * números. **Nada no sistema pode gravar 4 ou 5** — isso misturaria duas
 * réguas na mesma coluna e a média não diria mais nada.
 * ⚠️ O CHECK do banco ainda aceita até 5 (herança da migration de 09/09): a
 * guarda de verdade é ESTA função, por onde passam a página e a rota pública.
 */
function normalizarNota(n) {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= NOTA_MAX ? v : null;
}

/**
 * Até quando o texto livre da pessoa ainda é COMENTÁRIO da pesquisa (ms).
 *
 * Decisão do Marcos (11/09/2026): *"deixar um tempo máximo, se ele responder
 * naquele dia, pegamos essa informação"*. Então a janela fecha na **virada do
 * dia BRT** em que ela votou.
 * ⚠️ Com um PISO de HORAS_MIN_COMENTARIO: quem vota às 23h no culto da noite
 * teria 1 hora, e é justamente de quem sai do culto da noite que a gente mais
 * quer ouvir. O piso só ESTENDE, nunca encurta.
 */
function fimDaJanelaComentario(respondidaEm) {
  const t = new Date(respondidaEm).getTime();
  if (!Number.isFinite(t)) return null;
  // desloca pro relógio BRT (UTC−3, fixo desde 2019), acha a meia-noite
  // seguinte daquele relógio e traz de volta pra instante UTC.
  const brt = t - 3 * 3600 * 1000;
  const viradaBrt = (Math.floor(brt / 86400000) + 1) * 86400000 + 3 * 3600 * 1000;
  return Math.max(viradaBrt, t + HORAS_MIN_COMENTARIO * 3600 * 1000);
}

/**
 * O texto que chegou agora ainda conta como comentário da pesquisa?
 *
 * ⚠️ Sem carimbo de resposta (`respondidaEm` nulo ou inválido) a janela é
 * considerada ABERTA. Isso é deliberado: carimbo faltando é bug NOSSO, e
 * perder o que a visitante escreveu por causa dele é o pior dos dois erros.
 */
function comentarioNaJanela({ respondidaEm, agora } = {}) {
  if (respondidaEm == null || respondidaEm === '') return true;
  const fim = fimDaJanelaComentario(respondidaEm);
  if (fim == null) return true;
  const now = agora instanceof Date ? agora.getTime() : (typeof agora === 'number' ? agora : Date.now());
  return now <= fim;
}

module.exports = {
  LOCAIS, IDS_LOCAIS, CODIGO_LEN, MIN_APOS_CULTO, MIN_APOS_REGISTRO_SEM_CULTO, HORAS_VALIDADE_PESQUISA,
  NOTA_MAX, HORAS_MIN_COMENTARIO,
  soDigitos, cpfValido, normalizarLocal, validarVisitante,
  gerarCodigoVoucher, normalizarCodigoVoucher,
  instanteDevido, pesquisaDevida, primeiroNome, normalizarNota,
  fimDaJanelaComentario, comentarioNaJanela,
};
