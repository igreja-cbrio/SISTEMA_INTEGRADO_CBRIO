import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Decisão do Matheus (08/08): *"a abertura padrão dos formulários do sistema
// (TODOS) fosse no modo claro, pois hoje abre direto no modo escuro — isso às
// vezes pode cansar as vistas do usuário."*
//
// ⚠️ O que este teste protege não é a cor: é o DESACOPLAMENTO. O tema do ERP
// (`cbrio-theme`, contexto `ThemeContext`) nasceu escuro e PERSISTE a escolha.
// Se alguém "simplificar" religando o público nele, dois estragos voltam de uma
// vez: todo formulário volta a abrir escuro, e a preferência de um visitante
// passa a sobrescrever o tema do funcionário que abrir a mesma máquina.

const CHAVE_PUBLICA = 'cbrio-theme-publico';
const CHAVE_ERP = 'cbrio-theme';

// ⚠️ O jsdom desta configuração sobe SEM `localStorage` (origem opaca), então o
// shim abaixo não é preguiça: sem ele o `lerSalvo()` cairia sempre no `catch` e
// o teste passaria por acidente, sem provar nada sobre a preferência salva.
const memoria = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (memoria.has(k) ? memoria.get(k)! : null),
    setItem: (k: string, v: string) => { memoria.set(k, String(v)); },
    removeItem: (k: string) => { memoria.delete(k); },
    clear: () => { memoria.clear(); },
  },
});

async function carregar() {
  vi.resetModules();   // o estado do tema é de MÓDULO — sem isto o 1º caso vaza pros outros
  return import('../pages/public/publicTheme');
}

describe('tema das páginas públicas · padrão CLARO', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('sem preferência salva, abre no CLARO', async () => {
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(result.current.isDark).toBe(false);
    expect(result.current.C.pageBg).toBe('#eef2f1');
  });

  it('⚠️ o tema ESCURO do ERP não arrasta o formulário junto', async () => {
    // Cenário real: funcionário usa o sistema no escuro e abre um formulário
    // público pra conferir. O formulário tem que abrir claro do mesmo jeito.
    window.localStorage.setItem(CHAVE_ERP, 'dark');
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(result.current.isDark).toBe(false);
  });

  it('quem CLICOU no botão tem a escolha respeitada', async () => {
    window.localStorage.setItem(CHAVE_PUBLICA, 'dark');
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(result.current.isDark).toBe(true);
    expect(result.current.C.pageBg).toBe('#0a0a0a');
  });

  it('alternar grava na chave PRÓPRIA e não encosta na do ERP', async () => {
    window.localStorage.setItem(CHAVE_ERP, 'dark');
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());

    act(() => { result.current.toggle(); });

    expect(result.current.isDark).toBe(true);
    expect(window.localStorage.getItem(CHAVE_PUBLICA)).toBe('dark');
    // O tema do ERP fica EXATAMENTE como estava.
    expect(window.localStorage.getItem(CHAVE_ERP)).toBe('dark');
  });

  it('o data-theme do documento acompanha a página pública', async () => {
    // Componentes do shadcn (Dialog, Select) leem as variáveis CSS de lá — sem
    // isto, um formulário claro abriria um modal escuro.
    const { usePublicTheme } = await carregar();
    const { result } = renderHook(() => usePublicTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => { result.current.toggle(); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ao sair da página pública, o tema do ERP volta', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');   // ERP no escuro
    const { usePublicTheme } = await carregar();
    const { unmount } = renderHook(() => usePublicTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    unmount();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a paleta padrão do contexto é a CLARA', async () => {
    // Sub-componente renderizado fora do provider tem que combinar com a página.
    const { PublicPaletteCtx } = await carregar();
    // @ts-expect-error acesso ao default do contexto no teste
    const padrao = PublicPaletteCtx._currentValue ?? PublicPaletteCtx.Provider._context?._currentValue;
    expect(padrao.isDark).toBe(false);
  });
});
