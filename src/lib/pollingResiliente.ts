/**
 * Régua do POLLING que não afoga o servidor quando ele está mal.
 *
 * Incidente de 02/09/2026: o AppShell fazia `setInterval(loadX, 30000)` fixo,
 * sem abortar e sem saber se a chamada anterior ainda estava em voo. Com o
 * banco fora e o backend pendurando 300 s por requisição, cada aba aberta
 * empilhava até **10 chamadas vivas por endpoint** (300 ÷ 30) — e cada uma
 * segurava uma conexão do banco que estava justamente tentando levantar.
 *
 * ⚠️⚠️ A lição: cliente que retenta em ritmo FIXO durante uma queda deixa de
 * ser vítima e vira parte da causa. O sistema afoga a si mesmo na volta.
 *
 * São DUAS proteções distintas, e nenhuma substitui a outra:
 *   1. NÃO EMPILHAR  — enquanto a anterior não voltou, não dispara outra.
 *   2. RECUAR NO ERRO — cada falha seguida espaça a próxima tentativa.
 */

/** Intervalo saudável. Igual ao de sempre: quando está tudo bem, nada muda. */
export const INTERVALO_BASE_MS = 30_000;
/** Teto do recuo. 5 min é o bastante para não afogar e ainda perceber a volta. */
export const INTERVALO_MAX_MS = 300_000;

/**
 * Quanto esperar até a próxima tentativa, dado o número de falhas SEGUIDAS.
 * Dobra a cada falha (30s → 60 → 120 → 240 → 300 teto).
 *
 * ⚠️ `falhasSeguidas = 0` DEVOLVE O INTERVALO BASE: sucesso zera o recuo na
 * hora. Sem isso, uma falha isolada às 3h da manhã deixaria o sino lento pelo
 * resto do dia — e o polling existe justamente para ressincronizar.
 */
export function proximoIntervalo(falhasSeguidas: number, base = INTERVALO_BASE_MS): number {
  const n = Number(falhasSeguidas);
  if (!Number.isFinite(n) || n <= 0) return base;
  // ⚠️ Teto no expoente antes de exponenciar. HONESTIDADE SOBRE A COBERTURA:
  // hoje esta linha é REDUNDANTE e nenhum teste a mata — o `Math.min` externo
  // já corta o `Infinity` de `2**5000`. Fica como defesa em profundidade, para
  // o dia em que alguém mexer na ordem: `setTimeout(Infinity)` dispara
  // IMEDIATAMENTE, ou seja, o recuo viraria exatamente o martelo que ele
  // existe para evitar. Quem guarda de verdade é o `Math.min` de baixo, e
  // ESSE tem mutante que o mata.
  const passos = Math.min(n, 20);
  return Math.min(base * 2 ** passos, INTERVALO_MAX_MS);
}

/**
 * A falha merece recuo?
 *
 * ⚠️ Só recua em falha de INFRA (rede, 503, 502, 504, 522, timeout). Erro de
 * PERMISSÃO (401/403) não é o servidor mal — é esta pessoa não podendo ver
 * aquilo, e recuar por causa dele degradaria o sino de quem simplesmente não
 * tem acesso ao módulo. O 401 durante a queda vira 503 no servidor (conserto
 * irmão desta leva), então cai no ramo certo.
 */
export function deveRecuar(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return true; // sem sinal: recua (rede caiu)
  const e = erro as { status?: number; message?: string };
  const status = Number(e.status);
  if (Number.isFinite(status) && status > 0) return status >= 500 || status === 429;
  const txt = String(e.message || '').toLowerCase();
  if (!txt) return true;
  return ['failed to fetch', 'networkerror', 'timeout', 'aborted', 'load failed']
    .some((m) => txt.includes(m));
}
