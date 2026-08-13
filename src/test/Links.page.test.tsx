import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ESTE TESTE EXISTE POR UM BUG REAL (08/08): a tela /links inteira caía com
// "some is not a function". Causa: `getAccessLevel` recebe um ARRAY e faz
// `moduleNames.some(...)` por dentro; eu passei a string 'links'.
//
// Por que nada pegou:
//  · TypeScript — o AuthContext é .jsx, então `useAuth()` chega como `any` e a
//    chamada não é verificada. (Pior: no worktree o tsc nem roda, porque
//    node_modules é um link simbólico e a resolução de módulos falha. Descobri
//    isso caçando este bug.)
//  · eslint e build — nenhum dos dois executa o componente.
//
// O único que pega é este: renderizar a página de verdade. Toda tela nova
// precisa de um, e é a segunda vez nesta sessão que a lição aparece (a primeira
// foi o React #31 nas abas do censo).

vi.mock('../api', () => ({
  links: {
    listar: vi.fn(async () => ([{
      link_id: 'l1', slug: 'censo', titulo: 'Censo CBRio 2026',
      destino: 'https://www.cbrio.org/censo/p/censo-cbrio-2026', ativo: true,
      onde: 'QR do culto', acessos: 12, acessos_7d: 12, acessos_30d: 12,
      ultimo_acesso: '2026-08-08T12:00:00Z',
    }])),
    obter: vi.fn(), criar: vi.fn(), atualizar: vi.fn(),
    remover: vi.fn(), paraDestino: vi.fn(),
  },
}));

// getAccessLevel com a MESMA assinatura do AuthContext real: recebe array e
// chama .some(). Um dublê que aceitasse string esconderia exatamente o bug.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    getAccessLevel: (nomes: string[]) => (nomes.some((n) => n === 'bloqueado') ? 0 : 5),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Links from '../pages/links/Links';

describe('página /links', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renderiza sem estourar e mostra o link', async () => {
    const erros: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => { erros.push(a[0]); };
    try {
      render(<Links />);
      expect(await screen.findByText('Censo CBRio 2026')).toBeTruthy();
    } finally { console.error = original; }
    expect(erros.filter((e) => String(e).match(/is not a function|Minified React error/i))).toEqual([]);
  });

  it('mostra o endereço que vai IMPRESSO, não o destino', async () => {
    // O que a pessoa precisa copiar para a gráfica é o cbrio.org/r/<código>.
    // Se a tela destacasse o destino, alguém imprimiria o link errado — o fixo.
    render(<Links />);
    expect(await screen.findByText('cbrio.org/r/censo')).toBeTruthy();
  });

  it('mostra a contagem de escaneamentos', async () => {
    render(<Links />);
    await screen.findByText('Censo CBRio 2026');
    expect(screen.getByText('12')).toBeTruthy();
  });
});
