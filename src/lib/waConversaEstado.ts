// Estado de uma conversa do inbox para os chips Abertas · Sem resposta ·
// Finalizadas — régua PURA (08/09/2026 · redesenho da Comunicação).
//
// "Sem resposta" = conversa ABERTA cuja última mensagem é DA PESSOA. A leitura
// sai de duas colunas que o inbox já traz: `last_inbound_at` (só mensagem
// recebida) e `last_message_at` (qualquer direção). Inbound mais recente ou
// igual à última mensagem ⇒ a pessoa falou por último ⇒ está esperando.
// ⚠️ Igualdade conta como "sem resposta" DE PROPÓSITO: o RPC de inbound grava
// as duas colunas com o MESMO instante.
//
// A idade é medida do `last_inbound_at` — é desde quando a pessoa espera, não
// desde quando a conversa existe. O corte de 48h veio da medição de 08/09
// (91 conversas abertas sem resposta há mais de 2 dias): é o número que o
// Marcos pediu no dashboard, então é o mesmo que pinta o chip de vermelho.
export type ConversaEstado = {
  resolvida: boolean;
  last_message_at: string | null;
  last_inbound_at: string | null;
};

export type Vista = 'abertas' | 'sem_resposta' | 'finalizadas';

export const LIMITE_SEM_RESPOSTA_H = 48;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function semResposta(c: ConversaEstado): boolean {
  if (!c || c.resolvida) return false;
  const inb = ms(c.last_inbound_at);
  if (inb === null) return false;
  const ult = ms(c.last_message_at);
  return ult === null || inb >= ult;
}

/** Horas desde a última mensagem da pessoa; null quando não há inbound. Nunca negativo. */
export function horasSemResposta(c: ConversaEstado, agoraMs: number = Date.now()): number | null {
  const inb = ms(c?.last_inbound_at);
  if (inb === null) return null;
  return Math.max(0, (agoraMs - inb) / 3_600_000);
}

export function vencida(horas: number | null): boolean {
  return horas !== null && horas >= LIMITE_SEM_RESPOSTA_H;
}

/** "há 20min" · "há 3h" · "há 2d" — curto o bastante pra caber na linha da lista. */
export function rotuloIdade(horas: number | null): string {
  if (horas === null) return '';
  if (horas < 1) return `há ${Math.max(1, Math.floor(horas * 60))}min`;
  if (horas < 24) return `há ${Math.floor(horas)}h`;
  return `há ${Math.floor(horas / 24)}d`;
}

/**
 * Aplica a vista. "Sem resposta" vem ordenada da espera MAIS LONGA para a mais
 * curta — é a fila de quem está esperando há mais tempo, não a de quem falou
 * por último. As outras duas preservam a ordem que o servidor mandou.
 */
export function aplicarVista<T extends ConversaEstado>(lista: T[], vista: Vista): T[] {
  const arr = Array.isArray(lista) ? lista : [];
  if (vista === 'finalizadas') return arr.filter(c => c.resolvida);
  if (vista === 'sem_resposta') {
    return arr.filter(semResposta).sort((a, b) => (ms(a.last_inbound_at) ?? 0) - (ms(b.last_inbound_at) ?? 0));
  }
  return arr.filter(c => !c.resolvida);
}

export function contarVistas(lista: ConversaEstado[], agoraMs: number = Date.now()) {
  const arr = Array.isArray(lista) ? lista : [];
  const abertas = arr.filter(c => !c.resolvida);
  const sem = abertas.filter(semResposta);
  const vencidas = sem.filter(c => vencida(horasSemResposta(c, agoraMs))).length;
  return { abertas: abertas.length, sem_resposta: sem.length, vencidas };
}
