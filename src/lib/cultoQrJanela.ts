// Quando o QR do apelo de um culto deixa de ser OFERECIDO na aba do Online.
//
// Pedido do Matheus (27/08/2026): "preciso que bloqueie os cultos que forem
// passando, para não confundir." A confusão é real — navegando pelas semanas, a
// aba oferecia o QR de um culto de duas semanas atrás com o mesmo destaque do
// culto de domingo que vem, e é a equipe do Online que leva esse cartaz pro
// telão.
//
// ⚠️⚠️ BLOQUEAR AQUI É ESCONDER O BOTÃO, NUNCA MATAR O LINK. O QR fica GRAVADO
// no vídeo, e o vídeo fica no YouTube pra sempre: quem assistir a gravação daqui
// a dois anos precisa que aquele link continue abrindo e continue caindo NAQUELE
// culto. Invalidar o token de culto passado destruiria justamente o mecanismo
// que este QR existe pra ter. O que se bloqueia é a OFERTA de baixar de novo o
// cartaz de um culto que já passou.
//
// ⚠️⚠️ A data vem do banco como 'YYYY-MM-DD' e NUNCA pode passar por
// `new Date('2026-08-16')`: essa forma é lida como meia-noite UTC, que no Rio é
// 21h do dia ANTERIOR — o culto de domingo apareceria como sábado e o bloqueio
// cairia um dia antes. Aqui a data é montada por COMPONENTES locais.

/** Margem depois do INÍCIO do culto. O apelo é perto do fim, então o QR precisa
 *  continuar disponível durante o culto inteiro. 4h cobre culto + atraso. */
export const HORAS_APOS_INICIO = 4;

/** Instante em que o QR daquele culto deixa de ser oferecido. `null` = não deu
 *  pra saber (data ilegível). */
export function fimDaJanelaQr(
  data: string | null | undefined,
  hora: string | null | undefined,
  horas: number = HORAS_APOS_INICIO,
): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? '').slice(0, 10));
  if (!d) return null;
  const ano = Number(d[1]);
  const mes = Number(d[2]);
  const dia = Number(d[3]);
  const h = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ''));
  // Sem hora não dá pra dizer que "já passou" no meio do dia — vale o dia todo.
  if (!h) return new Date(ano, mes - 1, dia, 23, 59, 59, 999);
  const fim = new Date(ano, mes - 1, dia, Number(h[1]), Number(h[2]), 0, 0);
  fim.setHours(fim.getHours() + horas);
  return fim;
}

/**
 * O culto já passou a ponto de o QR dele não valer mais a pena ser oferecido?
 *
 * ⚠️ FAIL-OPEN de propósito: data que não dá pra interpretar devolve `false`
 * (não bloqueia). Errar bloqueando esconderia o cartaz do culto de HOJE da
 * equipe que está montando o telão — bem pior que oferecer um cartaz velho.
 */
export function cultoEncerrado(
  data: string | null | undefined,
  hora: string | null | undefined,
  agora: Date = new Date(),
  horas: number = HORAS_APOS_INICIO,
): boolean {
  const fim = fimDaJanelaQr(data, hora, horas);
  if (!fim) return false;
  return agora.getTime() > fim.getTime();
}
