// ============================================================================
// Voz do Pedrinho (assistente IA · pop lateral)
// Fala a resposta em áudio. Tenta a voz PREMIUM (ElevenLabs via backend
// /api/agents/tts); se não estiver configurada ou falhar, cai na voz do
// navegador (Web Speech API · pt-BR). Nunca quebra o chat.
// ============================================================================
import { agents } from '../api';

let audioEl = null;

// Remove markdown/urls/emoji-markup pra não "ler" símbolos em voz alta.
export function limparTextoParaVoz(t) {
  return (t || '')
    .replace(/```[\s\S]*?```/g, ' ')          // blocos de código
    .replace(/`([^`]+)`/g, '$1')               // código inline
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')  // links/imagens → texto
    .replace(/https?:\/\/\S+/g, ' ')            // urls soltas
    .replace(/[*_#>~|]/g, ' ')                  // marcadores de markdown
    .replace(/\s+/g, ' ')
    .trim();
}

// Interrompe qualquer fala em andamento (premium ou navegador).
export function pedrinhoParar() {
  try {
    if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl = null; }
  } catch { /* ignore */ }
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

function falarNoNavegador(texto, onStart, onEnd) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) { onEnd && onEnd(); return; }
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    u.rate = 1.03;
    u.pitch = 1.0;
    const vozes = synth.getVoices ? synth.getVoices() : [];
    const ptbr = vozes.find(v => /pt[-_]?BR/i.test(v.lang)) || vozes.find(v => /^pt/i.test(v.lang));
    if (ptbr) u.voice = ptbr;
    u.onstart = () => onStart && onStart();
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    synth.cancel();
    synth.speak(u);
  } catch { onEnd && onEnd(); }
}

/**
 * Fala o texto. Chama onStart quando o áudio começa e onEnd quando termina
 * (ou falha) — a UI usa isso pra mostrar/esconder a onda.
 */
export async function pedrinhoFalar(texto, { onStart, onEnd } = {}) {
  pedrinhoParar();
  const limpo = limparTextoParaVoz(texto);
  if (!limpo) { onEnd && onEnd(); return; }

  // 1) Voz premium (ElevenLabs) via backend.
  try {
    const blob = await agents.tts(limpo.slice(0, 5000));
    const url = URL.createObjectURL(blob);
    audioEl = new Audio(url);
    audioEl.onplay = () => onStart && onStart();
    audioEl.onended = () => { onEnd && onEnd(); URL.revokeObjectURL(url); };
    audioEl.onerror = () => { URL.revokeObjectURL(url); falarNoNavegador(limpo, onStart, onEnd); };
    await audioEl.play();
    return;
  } catch {
    // 503 (env não configurada), rede, autoplay bloqueado, etc. → navegador.
    falarNoNavegador(limpo, onStart, onEnd);
  }
}

// A voz existe se há algum canal (o premium é resolvido no backend; o navegador
// serve de fallback). Só falta suporte se nem o Web Speech existir.
export function vozSuportada() {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
}
