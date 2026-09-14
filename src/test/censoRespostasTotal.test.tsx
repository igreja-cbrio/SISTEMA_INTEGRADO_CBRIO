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
// A régua que este teste trava:
//   1. o número na tela vem do COUNT do banco, nunca do tamanho da lista;
//   2. a página tem 50 e a navegação diz onde a pessoa está ("1–50 de 812");
//   3. a BUSCA olha a lista inteira, não a página — senão "não achei" na
//      página 7 vira "fulano não respondeu o censo".

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

const linha = (i: number, nome?: string) => ({
  id: `r${i}`,
  nome: nome || `Pessoa ${i}`,
  na_base: true,
  contato: null,
  canal: 'qr',
  identificado_por: 'cpf_nascimento',
  concluida_em: '2026-09-13T12:50:00.000Z',
  duracao_seg: 199,
});
const pagina = (de: number, quantas: number, total: number) => ({
  total, offset: de, limite: 50,
  itens: Array.from({ length: quantas }, (_, i) => linha(de + i)),
});

describe('AbaRespostas · o total é do banco, a página tem 50', () => {
  beforeEach(() => { respostasMock.mockReset(); });

  it('anuncia o total do banco e pede a primeira página de 50', async () => {
    respostasMock.mockResolvedValue(pagina(0, 50, 812));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/812 resposta\(s\) concluída\(s\)/);
    expect(respostasMock).toHaveBeenCalledWith('p1', 50, 0);
    expect(await screen.findByText('1–50 de 812')).toBeTruthy();
  });

  it('navega e mostra em que pedaço a pessoa está', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 812))
      .mockResolvedValueOnce(pagina(50, 50, 812));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);

    const anterior = await screen.findByRole('button', { name: /Anterior/ });
    expect(anterior).toHaveProperty('disabled', true);   // na 1ª página não há para onde voltar

    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(await screen.findByText('51–100 de 812')).toBeTruthy();
    expect(respostasMock).toHaveBeenLastCalledWith('p1', 50, 50);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Anterior/ })).toHaveProperty('disabled', false);
    });
  });

  it('a busca olha TODAS as respostas, não a página na tela', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 812))          // página inicial
      .mockResolvedValueOnce({                            // a lista inteira, ao buscar
        total: 812, offset: 0, limite: 1000,
        itens: [...Array.from({ length: 50 }, (_, i) => linha(i)), linha(700, 'José da Silva')],
      });
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 812');

    // "jose" sem acento tem que achar "José" — a régua da casa é acento-insensível.
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'jose' } });

    expect(await screen.findByText('José da Silva')).toBeTruthy();
    expect(respostasMock).toHaveBeenLastCalledWith('p1', 1000, 0);
    // O contador troca de "buscando em todas…" para o resultado num tick depois
    // de a linha aparecer — esperar o texto final, não o instante da renderização.
    await waitFor(() => {
      expect(screen.getByText(/resposta\(s\) concluída\(s\)/).textContent).toMatch(/1 encontrada\(s\)/);
    });
    // Durante a busca a navegação some — ela já está olhando tudo.
    expect(screen.queryByRole('button', { name: /Próxima/ })).toBeNull();
  });

  it('quando tudo cabe numa página, não desenha navegação', async () => {
    respostasMock.mockResolvedValue(pagina(0, 3, 3));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/3 resposta/);
    expect(screen.queryByRole('button', { name: /Próxima/ })).toBeNull();
  });
});
