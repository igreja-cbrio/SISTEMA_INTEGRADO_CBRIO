// ════════════════════════════════════════════════════════════════════════════
//  "Quem registrou esta decisão, e quando?" — régua PURA do card do /online
//
//  Pedido do Matheus (02/09/2026): *"preciso que dê para ver o dia e horário que
//  a pessoa preencheu o formulário."*
//
//  ⚠️⚠️ O CARIMBO EXISTE, MAS NEM SEMPRE É "A PESSOA PREENCHENDO". Medido em
//  produção no dia do pedido, nas duas linhas vivas do online:
//    · Juliana · fonte='form_publico' · culto 30/08 · registrado 30/08 12:29 → foi ELA.
//    · Nelson  · fonte='manual'       · culto 02/08 · registrado 03/08 15:41 → foi a EQUIPE,
//      um dia depois. Ele não preencheu formulário nenhum.
//
//  Escrever "preencheu 03/08 15:41" no Nelson faria DOIS estragos: afirmaria um
//  fato falso sobre uma pessoa, e **lavaria o atraso do lançamento** — a tela
//  diria que ele demorou, quando quem demorou foi o registro. É a mesma classe
//  do culto de 12/07, com 19 nomes lançados 9 dias depois no culto errado.
//
//  ⚠️ `fonte` TEM CHECK com CINCO valores (medido no catálogo, não suposto):
//  `manual · form_publico · chat · app · link_culto`. Um conselheiro alertou que
//  seria texto livre; a medição desmentiu — mas o alerta valeu, porque três
//  desses valores ninguém tinha considerado, e `link_culto` (o link do
//  voluntário, de 14/08) é TERCEIRO registrando, não a pessoa.
// ════════════════════════════════════════════════════════════════════════════

/** A própria pessoa registrou — o formulário passou pela mão dela. */
const DA_PESSOA = new Set(['form_publico', 'app', 'chat']);

/** Alguém da equipe registrou POR ela (balcão e o link do voluntário no culto). */
const DE_TERCEIRO = new Set(['manual', 'link_culto']);

/**
 * O rótulo honesto para o carimbo.
 *
 * ⚠️⚠️ O DEFAULT NUNCA É "Preencheu". Fonte desconhecida (valor novo no CHECK,
 * NULL, ou decisão que não casou) cai em "Registrado", que é verdade em todos
 * os casos. Se o default fosse o específico, uma fonte nova entraria mentindo
 * em silêncio — que é exatamente o buraco que esta régua existe pra fechar.
 */
function origemDoRegistro(fonte) {
  const f = String(fonte || '').trim().toLowerCase();
  if (DA_PESSOA.has(f)) {
    return { rotulo: 'Preencheu', porPessoa: true, fonte: f };
  }
  if (DE_TERCEIRO.has(f)) {
    return { rotulo: 'Registrado pela equipe', porPessoa: false, fonte: f };
  }
  return { rotulo: 'Registrado', porPessoa: null, fonte: f || null };
}

/**
 * `30/08 12:29` — em BRT, sempre.
 *
 * ⚠️⚠️ `registrado_em` é timestamptz. Formatar sem forçar o fuso entrega o
 * horário em UTC: 12:29 BRT viraria 15:29 na tela. E das 21h em diante o DIA
 * também muda — é a armadilha que já mordeu o censo, o totem Kids e o "culto de
 * agora". O ano só aparece quando não é o corrente: poluir toda linha com
 * "/2026" custa espaço e não informa nada.
 */
function quandoBRT(iso, agora = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const b = new Date(t - 3 * 3600 * 1000);
  const dd = String(b.getUTCDate()).padStart(2, '0');
  const mm = String(b.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(b.getUTCHours()).padStart(2, '0');
  const mi = String(b.getUTCMinutes()).padStart(2, '0');
  const anoAgora = new Date(agora - 3 * 3600 * 1000).getUTCFullYear();
  const ano = b.getUTCFullYear() === anoAgora ? '' : `/${b.getUTCFullYear()}`;
  return `${dd}/${mm}${ano} ${hh}:${mi}`;
}

/** O dia BRT de um timestamp (para comparar com `data_culto`, que é DATE). */
function diaBRT(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Quantos dias DEPOIS do culto o registro entrou.
 *
 * ⚠️ Isto é o que responde a pergunta por trás do pedido: "esse dado é de agora
 * ou é lançamento atrasado?". O atraso medido em 14/08 era de média 3 dias e
 * máximo 9 — e é ele que faz o SLA de contato (≤3 dias, contado do culto)
 * nascer vencido.
 *
 * ⚠️ Negativo devolve `null`, nunca "-1": registro ANTES do culto é dado
 * incoerente (fuso, correção manual), e exibir número negativo é a tela
 * afirmando algo impossível.
 */
function atrasoDias(registradoEm, dataCulto) {
  const dia = diaBRT(registradoEm);
  if (!dia || !dataCulto) return null;
  const a = Date.parse(`${dia}T12:00:00Z`);
  const b = Date.parse(`${String(dataCulto).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.round((a - b) / 86400000);
  return d > 0 ? d : null;
}

/** A linha pronta: "Preencheu 30/08 12:29" · "Registrado pela equipe 03/08 15:41 · 1 dia após o culto". */
function textoRegistro({ registradoEm, fonte, dataCulto, agora = Date.now() } = {}) {
  const quando = quandoBRT(registradoEm, agora);
  if (!quando) return null;
  const { rotulo, porPessoa } = origemDoRegistro(fonte);
  const dias = atrasoDias(registradoEm, dataCulto);
  const sufixo = dias ? ` · ${dias} dia${dias === 1 ? '' : 's'} após o culto` : '';
  return { texto: `${rotulo} ${quando}${sufixo}`, porPessoa, atrasoDias: dias };
}

module.exports = { origemDoRegistro, quandoBRT, diaBRT, atrasoDias, textoRegistro, DA_PESSOA, DE_TERCEIRO };
