// Token dos links de Grupos que o líder abre SEM login (/g/a/, /g/s/, /g/f/,
// /g/r/, /g/c/). Régua PURA (só crypto + env) e por isso mora em utils/ — é o
// que a deixa no gate de deploy (`src/test/gruposToken.test.ts`).
// `services/gruposWhatsapp.js` re-exporta assinarToken/verificarToken: NÃO
// criar uma 2ª cópia da régua, foi assim que outras partes do módulo
// divergiram.
//
// HMAC-SHA256, fail-closed: sem segredo, nenhum token é assinado nem aceito.
// Payload mínimo { t: tipo, p: id, exp, ... } — dá acesso a UM item e expira.
const crypto = require('crypto');

// GRUPOS_TOKEN_SECRET (opcional) isola esta superfície dos demais usos do
// CRON_SECRET (bearer de crons, clientState do Graph no Cérebro — que é
// ecoado a terceiro). Sem ela, cai no CRON_SECRET como o resto do repo.
// ⚠️ Lido POR CHAMADA, não no load: constante de módulo congelaria o valor
// antes de o teste (e o serverless em cold start) definir a env.
function segredo() {
  return process.env.GRUPOS_TOKEN_SECRET || process.env.CRON_SECRET || '';
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias (default histórico)
// Aprovação de pedido de entrada em grupo (Natasha · 12/08/2026): 7 dias é
// menos do que o líder leva pra decidir. O fluxo desde 29/07 pede que ele
// LIGUE pra pessoa antes de aceitar, e os líderes ainda estão aprendendo —
// medido em 12/08: dos 90 pedidos pendentes, 51 (57%) já tinham passado dos 7
// dias, ou seja o link mais cobrado era justamente o que não abria mais.
// Alinhado com renovação/conferência: a validade REAL é decidida no servidor a
// cada uso (pedido ainda 'pendente' + quem recebeu ainda é o líder do grupo),
// então o TTL é a 2ª camada, não a única.
const APROV_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
// Renovação de temporada: a janela entre o fim de uma temporada e a abertura
// da próxima passa de 7 dias (e a fila pode segurar o envio por dias no
// backoff — o token é assinado no MONTAR, não no entregar). A revogação real
// é server-side: geração do token × linha + inscrições abertas + triagem.
const RENOV_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
// Conferência da lista: mesma razão do TTL longo da renovação.
const CONFIRA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// ⚠️ A VALIDADE DO LINK DE APROVAÇÃO É A TEMPORADA (Pr. Nélio + Natasha ·
// 17/08/2026) — não o relógio.
//
// Histórico curto: em 12/08 a prorrogação nasceu com DATA FIXA (31/08), porque
// o pedido da Natasha era "renove até o fim do mês". Conversando com o Pr.
// Nélio, a régua virou outra: **o link fica ativo enquanto aquela temporada
// estiver aberta**. Faz mais sentido — o que dá sentido a um pedido de entrada
// é a temporada em que ele foi feito, não uma data de calendário; e trocar de
// data fixa em data fixa seria um remendo por mês.
//
// Como isto funciona sem banco aqui: `verificarToken` é PURA (só crypto+env) e
// não sabe o que é temporada. Quem sabe é `publicGrupos.js`, que consulta
// `mem_temporadas.inscricoes_abertas` e passa `aceitarExpirado`. Assim a régua
// de negócio vive no lugar que tem o dado, e esta função continua testável no
// gate. ⚠️ O default é **false**: quem não souber responder não prorroga.
//
// Segurança — NÃO é afrouxamento geral:
//   · a assinatura HMAC continua obrigatória (token forjado nunca passa);
//   · vale SÓ pro tipo 'aprov', que dá acesso a UM pedido;
//   · as travas server-side seguem mandando (publicGrupos.js): pedido tem que
//     estar 'pendente' e `payload.l` tem que ser o líder ATUAL do grupo —
//     trocou a liderança, o link morre na hora, prorrogado ou não.
// É a mesma tese já aplicada à renovação e à conferência: "a validade real é
// decidida no servidor a cada uso".
//
// ⚠️ E ela MORRE SOZINHA do mesmo jeito: fechou as inscrições da temporada,
// link vencido volta a ser recusado. O TTL de 30 dias continua valendo como
// piso — é ele que segura o link de pé se a consulta da temporada falhar.

// ttlMs opcional (default 7d) — aprovação usa 30d, renovação/conferência 30d.
// `agora` injetável só pra teste (nunca passado em produção).
function assinarToken(tipo, pedidoId, extra, ttlMs, agora = Date.now()) {
  const s = segredo();
  if (!s) throw new Error('CRON_SECRET ausente — token de grupos não pode ser assinado');
  const payload = { t: tipo, p: pedidoId, exp: agora + (ttlMs || TOKEN_TTL_MS), ...(extra || {}) };
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', s).update(json).digest('base64url').slice(0, 24);
  return `${json}.${sig}`;
}

// `opts.aceitarExpirado` só é honrado no tipo 'aprov' e só quem tem o dado da
// temporada deve passá-lo (ver bloco acima). Default false = fail-closed.
function verificarToken(token, tipoEsperado, agora = Date.now(), opts = {}) {
  try {
    const s = segredo();
    if (!s) return null;
    const [json, sig] = String(token || '').split('.');
    if (!json || !sig) return null;
    const expected = crypto.createHmac('sha256', s).update(json).digest('base64url').slice(0, 24);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
    if (payload.t !== tipoEsperado) return null;
    if (!payload.exp) return null;
    if (agora > payload.exp) {
      // Só a aprovação é prorrogável, e só com a temporada aberta.
      if (tipoEsperado !== 'aprov' || opts.aceitarExpirado !== true) return null;
      return { ...payload, prorrogado: true };
    }
    return payload;
  } catch { return null; }
}

module.exports = {
  TOKEN_TTL_MS,
  APROV_TTL_MS,
  RENOV_TTL_MS,
  CONFIRA_TTL_MS,
  assinarToken,
  verificarToken,
};
