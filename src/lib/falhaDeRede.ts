/**
 * "Isto é queda de rede/servidor, ou é resposta do servidor?" — régua ÚNICA.
 *
 * ⚠️⚠️ O BUG QUE ISTO CONSERTA (medido em 02/09/2026): o
 * `isNetworkError` do totem de voluntários fazia
 *
 *     if (err.status) return false;   // "tem status HTTP → não é queda"
 *
 * ...e por isso **o banco fora NÃO ligava a fila offline**. Na queda de 1h34
 * daquele dia o backend respondia **500/503 com JSON** (o Cloudflare devolvia
 * 522 e a Vercel 504) — tudo com `status` preenchido. Ou seja: a fila offline
 * existia e teria ficado DESLIGADA exatamente no incidente que ela existe para
 * cobrir. Só WiFi caído (que lança `TypeError`) a acionava.
 *
 * São DOIS modos de falha com sintomas opostos, e confundi-los é o erro:
 *   · WiFi cai      → `fetch` LANÇA `TypeError: Failed to fetch`, sem status
 *   · Banco cai     → responde **HTTP 5xx com corpo**, com status
 * Resolver com 4G cura o primeiro e não cura o segundo.
 *
 * ⚠️ Vive em `src/lib/` porque vale para os DOIS totens (voluntariado e Kids).
 * A régua de "está sem servidor" não pode divergir entre eles.
 */

/** 503 tem semântica própria: "estou vivo, mas indisponível — tente depois". */
export const STATUS_INDISPONIVEL = [500, 502, 503, 504, 521, 522, 523, 524] as const;

export function ehFalhaDeRedeOuServidor(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; name?: string; message?: string };

  const status = Number(e.status);
  if (Number.isFinite(status) && status > 0) {
    // ⚠️⚠️ 5xx É indisponibilidade — é a linha que estava invertida.
    if (status >= 500) return true;
    // ⚠️ 429 conta: o servidor está pedindo para recuar. Enfileirar e tentar
    // depois é exatamente a resposta certa.
    if (status === 429) return true;
    // ⚠️ 4xx NÃO é: 401/403/404/409 são RESPOSTAS sobre o pedido. Enfileirar um
    // 409 ("já existe check-in") faria a fila retentar para sempre algo que o
    // servidor já decidiu.
    return false;
  }

  // Sem status: o `fetch` nem completou.
  if (e.name === 'TypeError' || e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  const msg = String(e.message || '').toLowerCase();
  if (!msg) return false;
  return /failed to fetch|networkerror|network request failed|load failed|backend n[ãa]o dispon|timeout|timed out|aborted/.test(msg);
}

/**
 * O servidor recusou por DUPLICIDADE (o item já está gravado)?
 * ⚠️ Na sincronização isto é SUCESSO, não erro: significa que o check-in já
 * chegou. Tratar como falha faria a fila retentar para sempre.
 */
export function ehDuplicado(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; message?: string };
  if (Number(e.status) === 409) return true;
  return /duplicad|j[áa] (existe|possui|tem) check|23505/i.test(String(e.message || ''));
}
