/**
 * O RODÍZIO DE SUPERVISÃO DA CASA (2026-08-25)
 *
 * A Ariel mandou a lista real, e ela NÃO é por horário de culto:
 *
 *   1 Dom manhã · 1 Dom Noite · 2 Dom Manhã · 2 Dom Noite · … · 4 Dom Noite
 *   1ª 4ª feira · 2ª 4ª feira · 3ª 4ª feira · 4ª 4ª feira
 *
 * Ou seja: **semana do mês × dia × período**. "1 Dom manhã" é o PRIMEIRO
 * domingo do mês, não o culto das 08:30.
 *
 * ⚠️⚠️ POR QUE NÃO É POR HORÁRIO (medido no PCO em 25/08). Dos 110 escalados do
 * domingo 23/08: **102 têm só horário de ENSAIO** e os **8** com horário de
 * culto têm **as QUATRO** horas (08:30+09:30+10:00+11:30 BRT). Ou seja, mesmo
 * trazendo os `times` do Planning Center o dado NÃO distingue quem serve às
 * 08:30 de quem serve às 10:00 — a dimensão não separa ninguém. Esta régua
 * existe porque a que eu ia construir seria decorativa.
 *
 * ⚠️ E isto NÃO depende do Planning Center: dia, período e semana saem todos do
 * `vol_services.scheduled_at`, que já está no banco. Cálculo puro, testável.
 */

const TZ = 'America/Sao_Paulo';

/** Partes de um instante no fuso da igreja (dia da semana, dia do mês, hora). */
function _partesBRT(iso) {
  // ⚠️⚠️ GUARDA DE FALSY ANTES DO `new Date`. `new Date(null)` NÃO é data
  // inválida — é a EPOCH (01/01/1970), que em BRT cai numa QUARTA dia 31, ou
  // seja `{ dia: 'quarta', semana: 1 }`. Sem esta linha, culto sem data era
  // classificado como 1ª quarta e entrava no rodízio de alguém. O teste pegou.
  if (iso === null || iso === undefined || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA => YYYY-MM-DD; o dia-da-semana vem de um Date reconstruído no fuso,
  // nunca de `getDay()` do original (que é do fuso da MÁQUINA).
  const ymd = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const hora = Number(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2));
  const [ano, mes, dia] = ymd.split('-').map(Number);
  // Date.UTC com as partes BRT: só serve pra extrair o dia da semana, que é
  // igual em qualquer fuso desde que a DATA seja a certa.
  const semanaDia = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay(); // 0=dom
  return { ano, mes, dia, hora, semanaDia };
}

/**
 * A ENÉSIMA ocorrência daquele dia-da-semana no mês (1..5).
 *
 * ⚠️ `ceil(dia/7)` é exatamente isso e não é aproximação: o 1º domingo cai
 * entre os dias 1 e 7, o 2º entre 8 e 14, e assim por diante — independente de
 * em que dia da semana o mês começa.
 */
function ordinalNoMes(diaDoMes) {
  return Math.ceil(diaDoMes / 7);
}

const SEMANAS_DO_RODIZIO = 4;

/**
 * Normaliza a 5ª semana para a 1ª — decisão do Matheus (25/08): *"repete o 1º"*.
 *
 * ⚠️ Sem isto o 5º domingo ficaria SEM supervisor nenhum (a lista da Ariel só
 * vai até 4), e um culto órfão de supervisão é pior que um supervisor repetido.
 */
function semanaDoRodizio(diaDoMes) {
  const o = ordinalNoMes(diaDoMes);
  return o > SEMANAS_DO_RODIZIO ? 1 : o;
}

/**
 * Período do culto. ⚠️ Espelha o `periodoSP` de `routes/app.js` (corte em 14h),
 * que é o mesmo corte usado pela dedup de check-in — duas réguas para "manhã ou
 * noite" divergiriam no primeiro ajuste.
 */
function periodoDoCulto(horaBRT) {
  return horaBRT < 14 ? 'manha' : 'noite';
}

/** Só domingo e quarta entram no rodízio; o resto é `null` (ver classificar). */
const DIA_POR_INDICE = { 0: 'domingo', 3: 'quarta' };

/**
 * Classifica um culto para o rodízio: `{ dia, periodo, semana }`.
 *
 * ⚠️ `dia: null` para culto que NÃO é domingo nem quarta (AMI, Bridge, eventos).
 * Esses ficam FORA do rodízio de propósito: a lista da Ariel não os cobre, e
 * inventar um encaixe faria a trava recusar quem deveria poder agir.
 */
function classificarCulto(scheduledAt) {
  const p = _partesBRT(scheduledAt);
  if (!p) return null;
  return {
    dia: DIA_POR_INDICE[p.semanaDia] || null,
    periodo: periodoDoCulto(p.hora),
    semana: semanaDoRodizio(p.dia),
    ordinal_real: ordinalNoMes(p.dia),   // pra tela poder dizer "5º (cobre o 1º)"
  };
}

/**
 * A concessão cobre este culto?
 *
 * Cada eixo é curinga quando NULL — é o que preserva toda concessão anterior
 * (área inteira, sem rodízio) e o que permite "todas as semanas do domingo".
 *
 * ⚠️ Culto fora do rodízio (`dia: null`) só é coberto por concessão SEM recorte
 * de dia. Quem recebeu "1º domingo" não passa a supervisionar o AMI.
 */
function cultoCoberto(grant, culto) {
  if (!grant) return false;
  const g = {
    dia: grant.culto_dia || null,
    periodo: grant.culto_periodo || null,
    semana: grant.culto_semana || null,
  };
  if (!g.dia && !g.periodo && !g.semana) return true;   // sem recorte de rodízio
  if (!culto) return false;                              // sem data não dá pra afirmar
  if (g.dia && g.dia !== culto.dia) return false;
  if (g.periodo && g.periodo !== culto.periodo) return false;
  if (g.semana && Number(g.semana) !== Number(culto.semana)) return false;
  return true;
}

module.exports = {
  TZ, SEMANAS_DO_RODIZIO,
  ordinalNoMes, semanaDoRodizio, periodoDoCulto, classificarCulto, cultoCoberto,
};
