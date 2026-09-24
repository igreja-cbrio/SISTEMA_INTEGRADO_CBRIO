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

  // ⚠️⚠️ O BUG DE 24/09/2026: a busca puxava UM lote de 1.000 e a pesquisa tinha
  // 1.410 respostas. Ordenadas da mais recente para a mais antiga, as 410 MAIS
  // ANTIGAS eram invisíveis — a tela dizia "0 encontrada(s)", que se lê como
  // "fulano não respondeu o censo".
  //
  // Os nomes abaixo são REAIS, das posições 1.001 e 1.410 da pesquisa medida no
  // banco naquele dia: exatamente quem estava no buraco.
  it('acha quem está DEPOIS das mil primeiras (o buraco de 24/09)', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 1410))
      .mockResolvedValueOnce({ total: 1410, offset: 0, limite: 1000,
        itens: Array.from({ length: 20 }, (_, i) => linha(i)) })
      .mockResolvedValueOnce({ total: 1410, offset: 1000, limite: 1000,
        itens: [
          ...Array.from({ length: 5 }, (_, i) => linha(1000 + i)),
          linha(1401, 'Juliane Milani Tavares'),
          linha(1402, 'Fernanda Figueredo Sarruf Sudré'),
        ] });

    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 1410');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'juliane' } });

    // ⚠️ A prova: a pessoa da posição 1.001 aparece. Antes, não aparecia.
    expect(await screen.findByText('Juliane Milani Tavares')).toBeTruthy();
    expect(respostasMock).toHaveBeenCalledWith('p1', 1000, 0);
    expect(respostasMock).toHaveBeenCalledWith('p1', 1000, 1000);
  });

  // ⚠️ Acento continua valendo no lote novo: "sudre" tem que achar "Sudré". A
  // régua da casa normaliza os DOIS lados — é por isso que a busca não foi para
  // o servidor (o `ilike` do Postgres não é acento-insensível).
  it('a régua de acento vale também para quem veio do 2º lote', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 1410))
      .mockResolvedValueOnce({ total: 1410, offset: 0, limite: 1000,
        itens: Array.from({ length: 20 }, (_, i) => linha(i)) })
      .mockResolvedValueOnce({ total: 1410, offset: 1000, limite: 1000,
        itens: [linha(1402, 'Fernanda Figueredo Sarruf Sudré')] });

    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 1410');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'sudre' } });
    expect(await screen.findByText('Fernanda Figueredo Sarruf Sudré')).toBeTruthy();
  });

  // ⚠️⚠️ Um teto que trunca em silêncio é o defeito que esta mudança conserta.
  // Se um dia a base passar do que dá para varrer, a tela DIZ.
  it('avisa quando a busca não alcançou tudo', async () => {
    respostasMock.mockResolvedValueOnce(pagina(0, 50, 34000));
    for (let i = 0; i < 20; i += 1) {
      // ⚠️ 5 itens por lote de propósito: o que se testa aqui é o NÚMERO DE
      // LOTES e o aviso, não o volume. Encher 20 × 1.000 objetos fazia o teste
      // levar mais de um minuto sem provar nada a mais.
      respostasMock.mockResolvedValueOnce({ total: 34000, offset: i * 1000, limite: 1000,
        itens: Array.from({ length: 5 }, (_, k) => linha(i * 1000 + k)) });
    }

    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 34000');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'pessoa' } });

    await waitFor(() => { expect(screen.getByText(/A busca varreu as/)).toBeTruthy(); },
      { timeout: 6000 });
    expect(screen.getByText(/não entra/)).toBeTruthy();
  });

  it('quando tudo cabe numa página, não desenha navegação', async () => {
    respostasMock.mockResolvedValue(pagina(0, 3, 3));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/3 resposta/);
    expect(screen.queryByRole('button', { name: /Próxima/ })).toBeNull();
  });
});
