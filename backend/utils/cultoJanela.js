// ════════════════════════════════════════════════════════════════════════════
//  CULTO · quando o link do voluntário ACEITA lançamento
//
//  Régua PURA (fica em `utils/` pra entrar no gate de deploy). É ela que separa
//  as duas coisas que o desenho do link precisa manter separadas:
//
//    · a DISTRIBUIÇÃO é antecipada — a Integração escolhe a semana no
//      calendário e manda os links no grupo dos voluntários dias antes;
//    · o LANÇAMENTO não é — o voluntário só consegue registrar no dia do culto.
//
//  ⚠️ São TRÊS estados, não dois. Antes de 14/08/2026 a régua era
//  `dias >= 0 && dias <= 2`, e quem abria o link ANTES do culto (o caso normal
//  de quem recebe a mensagem na quarta) via "prazo encerrado" — a tela dizia
//  que o link estava morto justamente quando ele estava novo, e a pessoa
//  apagaria a mensagem. `antes` existe pra que a resposta seja "guarde até o
//  dia tal".
//
//  ⚠️ A janela continua terminando 2 dias DEPOIS do culto (decisão de 14/08):
//  o problema medido foi lançamento com média de 3 dias e máximo de 9 de
//  atraso, contra um SLA de 1º contato de 3 dias. Depois disso o caso vai pro
//  conferente, que é onde ele deve estar.
//
//  ⚠️ O "hoje" é INJETADO. Teste que lê o relógio da máquina é o que mordeu no
//  `faixaEtaria.test.ts`; e quem chama tem que passar o dia em BRT — usar UTC
//  aqui faria o dia virar às 21h, exatamente a faixa do culto de domingo à
//  noite.
// ════════════════════════════════════════════════════════════════════════════

// Dia do culto + 2 dias.
const DIAS_JANELA = 2;

/** Dia de hoje no fuso da igreja (YYYY-MM-DD). */
function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Dias corridos entre o culto e hoje. Negativo = culto ainda vai acontecer. */
function diasDesde(dataCulto, hojeIso) {
  const a = Date.parse(`${dataCulto}T00:00:00Z`);
  const b = Date.parse(`${hojeIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * `{ estado, dias }` — 'antes' | 'aberto' | 'encerrado'.
 * Data ilegível cai em 'encerrado': sem saber o dia do culto, o seguro é não
 * aceitar escrita (fail-closed), nunca liberar.
 */
function estadoJanelaCulto(dataCulto, hojeIso) {
  const dias = diasDesde(dataCulto, hojeIso);
  if (dias === null) return { estado: 'encerrado', dias: null };
  if (dias < 0) return { estado: 'antes', dias };
  return { estado: dias <= DIAS_JANELA ? 'aberto' : 'encerrado', dias };
}

/** AAAA-MM-DD → DD/MM/AAAA (vazio quando a data não é legível). */
function dataBR(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

module.exports = { DIAS_JANELA, hojeBRT, diasDesde, estadoJanelaCulto, dataBR };
