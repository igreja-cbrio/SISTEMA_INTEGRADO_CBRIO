/**
 * Sanitizer HTML dedicado aos contratos editáveis do RH.
 *
 * Fix CRIT-12 do code review: o campo `contrato_editado` é HTML editado em
 * `contentEditable` e depois re-renderizado via `dangerouslySetInnerHTML`.
 * A sanitização artesanal (`replace(/<script>/gi, '')` + `on\w+=`) tinha
 * bypass trivial:
 *   - `<a href="javascript:...">` — não é removido
 *   - `<iframe srcdoc="...">` — não é removido
 *   - `<svg><animate onbegin=...>` com espaço/newline entre `on` e `=` — passa
 *   - `<form action="javascript:...">` — passa
 * Como o contrato é salvo no DB e re-renderizado para admin/RH, isso vira
 * XSS armazenado; com o JWT do Supabase em localStorage, é account takeover.
 *
 * Regra: permite formatação (negrito/itálico/tabela/imagem inline base64
 * pra logo), bloqueia scripts, iframes, forms e URIs perigosas.
 */

import DOMPurify from 'dompurify';

// Elementos legítimos num contrato formatado — tabelas para dados salariais,
// imagem inline pra logo, listas, cabeçalhos. Nada de script/iframe/object.
const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'col', 'colgroup', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
  's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'u', 'ul',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
  'style', 'class', 'colspan', 'rowspan', 'align', 'valign',
];

export function sanitizeContratoHtml(dirty: string): string {
  if (typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Bloqueia data:, javascript:, vbscript:. Permite mailto:/http(s):/tel:.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
    // Não permite fragmentos MathML/SVG que possam invocar handlers.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['formaction', 'action', 'srcdoc', 'onclick', 'onerror', 'onload'],
    // Impede escape via `<html><body>` embarcado.
    WHOLE_DOCUMENT: false,
    // dompurify já força `rel="noopener noreferrer"` em anchors com target=_blank
    ADD_ATTR: [],
  });
}

export default sanitizeContratoHtml;
