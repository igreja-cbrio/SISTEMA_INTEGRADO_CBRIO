// ============================================================================
// Carregador do Google Tag Manager sob demanda (por PÁGINA, não pelo app).
//
// Por que não vai no index.html: este bundle é UM só pro site público e pro
// ERP inteiro (ver SITE_PUBLICO_HOSTS em src/App.tsx). O snippet padrão do GTM
// mora no <head> e carrega em TODA tela — inclusive as internas, que têm dado
// de membro (nome, CPF, telefone, contribuição, dado de menor no Kids). Marca
// de anúncio não entra ali (LGPD). O container do site institucional
// (GTM-M59RCB34, no index.html) resolve isso com trava por hostname; quando a
// medição é de UMA página pública servida no domínio do ERP, a trava certa é
// esta: injetar o container só enquanto a página estiver montada.
//
// ⚠️ O GTM não "descarrega". Depois de injetado ele vive até a aba recarregar,
// e um gatilho de History Change dentro do container continuaria disparando se
// a pessoa navegasse daqui pro resto do sistema. Por isso os gatilhos do
// container precisam ser fixados no caminho da página (ex.: Page Path igual a
// /inscricao-grupos) — a trava daqui garante o carregamento, não o disparo.
//
// Sem o <iframe> de <noscript>: ele só serve visitante com JS desligado e, sem
// JS, este SPA não renderiza nada — o iframe não mediria visita nenhuma e, por
// estar no HTML compartilhado, carregaria em todas as telas do ERP (exatamente
// o vazamento que a trava evita). O site em Astro, que é HTML estático de
// verdade, é o lugar do noscript.
// ============================================================================

const containersCarregados = new Set<string>();

/**
 * Injeta o gtm.js de um container. Idempotente: chamar de novo (re-render,
 * StrictMode, voltar pra página) não carrega o script duas vezes.
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
