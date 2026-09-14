import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ⚠️⚠️ ESTE TESTE EXISTE POR CAUSA DE UM NÚMERO ERRADO NA TELA (14/09/2026).
//
// A aba Respostas dizia **"500 resposta(s) concluída(s)"** quando o banco tinha
// **812**. A causa era boba e cara: o endpoint tinha teto de 500, o cliente
// pedia exatamente 500, e a tela contava `linhas.length` — ou seja, anunciava o
// tamanho da PÁGINA como se fosse o total. Ninguém tinha como perceber olhando
// a tela; foi o Marcos que estranhou comparando com o painel.
//
// A régua que este teste trava: **o número na tela vem do COUNT do banco, nunca
// do tamanho da lista carregada.**

const respostasMock = vi.fn();

vi.mock('../api', () => ({
  censo: {
    respostas: (...a: unknown[]) => respostasMock(...a),
    resposta: vi.fn(async () => ({})),
    removerResposta: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AbaRespostas from '../components/censo/AbaRespostas';

const linha = (i: number) => ({
  id: `r${i}`,
  nome: `Pessoa ${i}`,
  na_base: true,
  contato: null,
  canal: 'qr',
  identificado_por: 'cpf_nascimento',
  concluida_em: '2026-09-13T12:50:00.000Z',
  duracao_seg: 199,
});

describe('AbaRespostas · o total é do banco, não da página', () => {
  beforeEach(() => { respostasMock.mockReset(); });

  it('mostra 812 mesmo carregando 500 — e diz que está mostrando 500', async () => {
    respostasMock.mockResolvedValue({
      total: 812, offset: 0, limite: 500,
      itens: Array.from({ length: 500 }, (_, i) => linha(i)),
    });
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/812 resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/mostrando 500/);
  });

  // ⚠️ Números pequenos aqui de propósito: o que se testa é a ARITMÉTICA da
  // paginação, e desenhar 812 linhas no jsdom estoura o timeout sem provar
  // nada a mais. O caso real (500 de 812) está no teste de cima.
  it('oferece carregar o resto, e some quando a lista completa', async () => {
    respostasMock
      .mockResolvedValueOnce({
        total: 8, offset: 0, limite: 500,
        itens: Array.from({ length: 5 }, (_, i) => linha(i)),
      })
      .mockResolvedValueOnce({
        total: 8, offset: 5, limite: 500,
        itens: Array.from({ length: 3 }, (_, i) => linha(5 + i)),
      });
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);

    const botao = await screen.findByRole('button', { name: /Carregar mais 3/ });
    fireEvent.click(botao);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull();
    });
    // Segunda chamada pediu a partir de onde a primeira parou.
    expect(respostasMock).toHaveBeenLastCalledWith('p1', 500, 5);
    const resumo = screen.getByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/8 resposta/);
    // Com tudo carregado, não anuncia mais "mostrando".
    expect(resumo.textContent).not.toMatch(/mostrando/);
  });

  it('quando o total cabe numa página, não inventa botão nenhum', async () => {
    respostasMock.mockResolvedValue({
      total: 3, offset: 0, limite: 500,
      itens: [linha(1), linha(2), linha(3)],
    });
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/3 resposta\(s\)/);
    expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull();
  });
});
