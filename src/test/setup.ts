import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// O jsdom não tem ResizeObserver, e o recharts usa (via ResponsiveContainer) —
// sem isto, TODA tela com gráfico estoura no teste e o erro parece bug do
// componente. Stub, não implementação: o teste verifica o dado e o texto, não o
// desenho do SVG (que precisaria de layout de verdade).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
