import { createContext, useContext } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// Paleta dos formularios publicos · troca conforme tema claro/escuro.
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

export function usePublicTheme() {
  const { isDark, toggleTheme } = useTheme();
  return { isDark, toggle: toggleTheme, C: isDark ? DARK : LIGHT };
}

// Context pra sub-componentes (Field, Select, etc) lerem a paleta sem prop-drilling.
export const PublicPaletteCtx = createContext<PublicPalette>(DARK);
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
