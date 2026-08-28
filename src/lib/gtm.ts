// ============================================================================
// Medição da porta pública de INSCRIÇÃO no Google Tag Manager.
//
// Hoje só a porta `grupos` (/inscricao-grupos) é medida — pedido do Gustavo
// (GTM). O arquivo é escrito pra receber outras portas depois (o parâmetro
// `porta` já existe e usa as chaves canônicas de
// `backend/services/inscricaoPortas.js`), mas NENHUMA outra está ligada: não
// tratar a presença deste módulo como cobertura das demais.
//
// ── Por que o container NÃO vai no index.html ──────────────────────────────
// `index.html` é um só pro site institucional e pro ERP inteiro. Snippet no
// <head> sobe o container em TODA tela, inclusive as internas com nome, CPF,
// telefone, contribuição e dado de menor no Kids — marca de anúncio não entra
// ali (LGPD). O container do site (GTM-M59RCB34, no index.html) resolve com
// trava por hostname; /inscricao-grupos é rota do `AppRoutes`, servida em
// cbrio.org, então a trava por hostname bloquearia justamente a página a
// medir. A trava certa aqui é injetar no mount da página.
//
// ⚠️ O GTM não descarrega: injetado, vive até a aba recarregar, e um gatilho de
// History Change no container continuaria disparando se a pessoa navegasse
// daqui pro resto do sistema. Este arquivo garante o CARREGAMENTO, não o
// disparo — os gatilhos do container têm que estar presos aos eventos daqui
// (`inscricao_pagina`, `inscricao_formulario`, `inscricao_concluida`) ou ao
// Page Path da porta. Isso é configuração no GTM.
//
// Sem o <iframe> de <noscript> do snippet: sem JS este SPA não renderiza nada
// (o iframe não mediria visita alguma) e, por morar no HTML compartilhado,
// carregaria em todas as telas do ERP — o vazamento que a trava evita. O site
// em Astro, que é HTML estático de verdade, é o lugar do noscript.
//
// ── O que conta como conversão ─────────────────────────────────────────────
// A porta devolve tela de sucesso pra REENVIO de quem já está no grupo ou já
// tem pedido (`ja_membro` / `ja_pedido`), sem criar nada, e devolve
// `{ ok: true }` SEM id pro honeypot de bot. Contar "chegou na tela de
// sucesso" inflaria a medição com reenvio e robô. Por isso `inscricao_concluida`
// só sai com o identificador do que o servidor criou (`pedido_id`) — ou com
// `renovado`, que é membresia de temporada nova, um desfecho real.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';

export const GTM_INSCRICOES = 'GTM-PQHGF574';

// Chaves canônicas das portas (backend/services/inscricaoPortas.js). Só
// 'grupos' está ligada — ver o cabeçalho.
export type PortaGtm =
  | 'eventos' | 'grupos' | 'grupos_lider' | 'next'
  | 'batismo' | 'apresentacao' | 'voluntariado';

// ⚠️ LGPD · lista FECHADA do que pode viajar junto do evento. O dataLayer vai
// pro GTM e de lá pra ferramenta de anúncio: nome, CPF, e-mail, telefone,
// nascimento, endereço e foto NÃO entram — nem os do cônjuge. Chave fora desta
// lista é descartada. A trava é aqui, não na lembrança de quem mexer depois.
const CAMPOS_PERMITIDOS = new Set([
  'grupo_id',    // qual grupo de conexão
  'categoria',   // categoria do grupo (Casais, Mulheres...)
  'origem',      // 'link_grupo' (QR direto no grupo) | 'escolha' (lista/mapa)
  'totem',       // true = quiosque do lounge; a MESMA aba atende muita gente,
                 // então a visita não pode ser comparada com a de celular
  'resultado',   // 'criado' | 'renovado'
  'pessoas',     // quantas inscrições o envio criou (casal = 2)
]);

type Extras = Record<string, unknown>;

function limpar(extras?: Extras): Extras {
  const saida: Extras = {};
  for (const [k, v] of Object.entries(extras || {})) {
    if (!CAMPOS_PERMITIDOS.has(k)) {
      if (import.meta.env?.DEV) console.warn(`[gtm] campo "${k}" fora da lista permitida — descartado (LGPD)`);
      continue;
    }
    if (v !== undefined && v !== null) saida[k] = v;
  }
  return saida;
}

const containersCarregados = new Set<string>();

/**
 * Injeta o gtm.js de um container. Idempotente: re-render, StrictMode ou
 * voltar pra página não carregam o script duas vezes.
 */
export function carregarGtm(containerId: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!containerId || containersCarregados.has(containerId)) return;
  containersCarregados.add(containerId);

  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  // Mesma inserção do snippet oficial (antes do 1º <script>); se a página ainda
  // não tem script algum, o <head> serve igual.
  const primeiro = document.getElementsByTagName('script')[0];
  if (primeiro && primeiro.parentNode) primeiro.parentNode.insertBefore(tag, primeiro);
  else document.head.appendChild(tag);
}

function empurrar(event: string, porta: PortaGtm, extras?: Extras): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, porta, ...limpar(extras) });
}

/**
 * A regra de "isto foi uma conversão?" da porta de grupos, isolada porque é o
 * ponto mais fácil de errar depois: a tela de sucesso NÃO serve de gatilho.
 *
 * Resposta de `POST /public/grupos/inscrever`:
 * - honeypot de bot .......... { ok: true }                     → null
 * - já é membro .............. { ja_membro: true, mensagem }    → null
 * - já tinha pedido .......... { ja_pedido: true, mensagem }    → null
 * - membresia renovada ....... { ja_membro: true, renovado: true } → 'renovado'
 * - criou .................... { pedido_id }                    → 'criado', 1
 * - criou casal .............. { pedido_id, conjuge: { pedido_id } } → 'criado', 2
 *
 * `pedido_id` só é devolvido quando o backend criou de fato
 * (`if (rt.criado) corpo.pedido_id = ...` em backend/routes/publicGrupos.js).
 */
export function desfechoInscricaoGrupos(
  r: { pedido_id?: unknown; renovado?: unknown; conjuge?: { pedido_id?: unknown } | null } | null | undefined,
): { resultado: 'criado' | 'renovado'; pessoas: number } | null {
  const criouTitular = !!(r && r.pedido_id);
  const criouConjuge = !!(r && r.conjuge && r.conjuge.pedido_id);
  if (criouTitular || criouConjuge) {
    return { resultado: 'criado', pessoas: (criouTitular ? 1 : 0) + (criouConjuge ? 1 : 0) };
  }
  // Renovação não cria pedido, mas leva a membresia pra temporada nova — é
  // desfecho real. Vai marcado à parte pra não virar inscrição nova na conta.
  if (r && r.renovado === true) return { resultado: 'renovado', pessoas: 0 };
  return null;
}

/** Etapa 3 · conversão. Só chamar com confirmação de criação vinda do servidor. */
export function medirInscricaoConcluida(porta: PortaGtm, extras?: Extras): void {
  empurrar('inscricao_concluida', porta, extras);
}

/**
 * Funil da porta. Devolve `medirFormulario`, que marca a etapa do meio (a
 * pessoa escolheu o grupo e chegou no formulário) — é entre ela e a conversão
 * que mora a desistência que o Marketing quer enxergar.
 *
 * - `inscricao_pagina` sai uma vez por montagem da página, junto com o
 *   carregamento do container.
 * - `inscricao_formulario` sai uma vez POR GRUPO. Voltar e reescolher o mesmo
 *   grupo não conta de novo; `esquecerEtapas()` limpa a marcação quando o
 *   totem troca de pessoa.
 */
export function useFunilInscricao(porta: PortaGtm, extras?: Extras) {
  const vistos = useRef(new Set<string>());

  useEffect(() => {
    carregarGtm(GTM_INSCRICOES);
    empurrar('inscricao_pagina', porta, extras);
    // `extras` de propósito fora das dependências: o que muda depois da
    // primeira renderização (o catálogo que ainda estava carregando) não pode
    // re-disparar a visita — a mesma pessoa contaria duas vezes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porta]);

  const medirFormulario = useCallback((chave: string, dados?: Extras) => {
    if (!chave || vistos.current.has(chave)) return;
    vistos.current.add(chave);
    empurrar('inscricao_formulario', porta, dados);
  }, [porta]);

  const esquecerEtapas = useCallback(() => { vistos.current.clear(); }, []);

  return { medirFormulario, esquecerEtapas };
}
