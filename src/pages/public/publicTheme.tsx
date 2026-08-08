import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

// Paleta dos formulários públicos · troca conforme tema claro/escuro.
export interface PublicPalette {
  isDark: boolean;
  pageBg: string;
  card: string;
  cardBorder: string;
  text: string;
  text2: string;
  text3: string;
  textDim: string;
  inputBorder: string;
  optionBg: string;
  shapes: boolean; // mostra o fundo animado (so faz sentido no escuro)
}

const DARK: PublicPalette = {
  isDark: true,
  pageBg: '#0a0a0a',
  card: 'rgba(22,22,22,0.78)',
  cardBorder: 'rgba(255,255,255,0.06)',
  text: '#e5e5e5',
  text2: '#d4d4d4',
  text3: '#a3a3a3',
  textDim: '#737373',
  inputBorder: 'rgba(255,255,255,0.18)',
  optionBg: '#161616',
  shapes: true,
};

const LIGHT: PublicPalette = {
  isDark: false,
  pageBg: '#eef2f1',
  card: 'rgba(255,255,255,0.94)',
  cardBorder: 'rgba(0,0,0,0.08)',
  text: '#1a1a1a',
  text2: '#333333',
  text3: '#666666',
  textDim: '#9aa0a6',
  inputBorder: 'rgba(0,0,0,0.2)',
  optionBg: '#ffffff',
  shapes: false,
};

// ════════════════════════════════════════════════════════════════════════════
// TEMA DAS PÁGINAS PÚBLICAS · padrão CLARO (decisão do Matheus · 2026-08-08)
//
// *"a abertura padrão dos formulários do sistema (TODOS) fosse no modo claro,
// pois hoje abre direto no modo escuro — isso às vezes pode cansar as vistas do
// usuário."*
//
// ⚠️⚠️ POR QUE ISTO NÃO É `ThemeContext` COM O DEFAULT TROCADO: aquele contexto
// é do ERP INTEIRO, cujo visual (tema "Vidro") nasceu escuro, e ele PERSISTE a
// escolha em `cbrio-theme`. Virar o default lá jogaria pro claro todo
// funcionário que nunca tocou no botão — mudança grande que ninguém pediu. Pior:
// como o ERP grava a preferência, um visitante que abrisse um formulário
// deixaria o tema salvo e a equipe herdaria a escolha dele.
//
// Então o público tem preferência PRÓPRIA (`cbrio-theme-publico`), independente,
// e o ERP fica exatamente como está.
//
// ⚠️ E o `data-theme` do documento é ajustado enquanto uma página pública está
// montada: componentes do shadcn (Dialog, Select) leem as variáveis CSS de lá, e
// sem isto um formulário claro abriria um modal escuro. Ao desmontar, o valor do
// ERP é restaurado — quem estava logado não sai do formulário com o sistema
// trocado.
// ════════════════════════════════════════════════════════════════════════════

const CHAVE_PUBLICA = 'cbrio-theme-publico';

function lerSalvo(): boolean {
  try {
    // Ausente = CLARO. Só quem clicou no botão tem preferência gravada.
    return window.localStorage.getItem(CHAVE_PUBLICA) === 'dark';
  } catch {
    return false;
  }
}

let escuroAtual = lerSalvo();
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

function alternarPublico() {
  escuroAtual = !escuroAtual;
  try { window.localStorage.setItem(CHAVE_PUBLICA, escuroAtual ? 'dark' : 'light'); } catch { /* modo privado */ }
  aplicarNoDocumento();
  avisar();
}

function aplicarNoDocumento() {
  document.documentElement.setAttribute('data-theme', escuroAtual ? 'dark' : 'light');
}

// Quantas páginas públicas estão montadas. O `data-theme` do ERP só é restaurado
// quando a ÚLTIMA sai — senão, página que monta dois consumidores restauraria o
// tema no meio da própria renderização.
let montados = 0;
let temaDoErp: string | null = null;

export function usePublicTheme() {
  const isDark = useSyncExternalStore(assinar, () => escuroAtual, () => false);

  useEffect(() => {
    if (montados === 0) {
      temaDoErp = document.documentElement.getAttribute('data-theme');
      aplicarNoDocumento();
    }
    montados += 1;
    return () => {
      montados -= 1;
      if (montados === 0) {
        if (temaDoErp) document.documentElement.setAttribute('data-theme', temaDoErp);
        temaDoErp = null;
      }
    };
  }, []);

  return { isDark, toggle: alternarPublico, C: isDark ? DARK : LIGHT };
}

// Context pra sub-componentes (Field, Select, etc) lerem a paleta sem prop-drilling.
// ⚠️ O default é a paleta CLARA porque é o padrão da abertura — um sub-componente
// que renderize fora do provider tem que combinar com a página, não brigar com ela.
export const PublicPaletteCtx = createContext<PublicPalette>(LIGHT);
export function usePublicPalette() {
  return useContext(PublicPaletteCtx);
}

// Botao flutuante de troca de tema · canto superior direito.
export function PublicThemeToggle() {
  const { isDark, toggle, C } = usePublicTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 50,
        width: 40, height: 40, borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.card, color: C.text,
        border: `1px solid ${C.cardBorder}`, cursor: 'pointer',
        backdropFilter: 'blur(12px)', fontSize: 18, lineHeight: 1,
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      }}
    >
      {isDark ? '☀️' : '\u{1F319}'}
    </button>
  );
}
