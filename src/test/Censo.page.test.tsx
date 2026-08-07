import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// O Radix Tabs ativa no mousedown do ponteiro, não no click sintético. Sem isto
// a aba nunca troca no jsdom e o teste passaria sem ter clicado em nada — que é
// pior do que não ter teste.
function clicarAba(rotulo: RegExp) {
  const aba = screen.getByRole('tab', { name: rotulo });
  fireEvent.mouseDown(aba, { button: 0, ctrlKey: false });
  fireEvent.pointerDown(aba, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(aba);
  return aba;
}

// ESTE TESTE EXISTE POR CAUSA DE UM BUG REAL (07/08): clicar em qualquer aba do
// censo derrubava a página com "Minified React error #31 — objeto sendo
// renderizado como filho". A causa: existem DOIS EmptyState no repo, e eu usei o
// `ui/empty-state` (cujo `icon` espera um ELEMENTO já renderizado) passando o
// componente do ícone, no estilo do `components/EmptyState` (cujo `icone`
// espera o COMPONENTE). O TypeScript não pegou porque ReactNode aceita quase
// tudo, e o build passou porque o erro só existe em tempo de render.
//
// Os testes que eu tinha cobriam o formulário público, não a página do módulo.
// Este renderiza a página de verdade e CLICA EM TODAS AS ABAS — que é o gesto
// que quebrava.

vi.mock('../api', () => ({
  censo: {
    aux: vi.fn(async () => ({
      tipos_pergunta: ['secao', 'texto_curto'], tipos_pesquisa: ['censo'],
      formatos: ['texto'], cuidado_tipos: ['oracao'],
      consentimento_default: 'aviso', nivel: 5, pode_ver_sensivel: false,
    })),
    pesquisas: vi.fn(async () => ([{
      pesquisa_id: 'p1', slug: 'censo-cbrio-2026', titulo: 'Censo CBRio 2026',
      tipo: 'censo', status: 'rascunho', total_perguntas: 106,
      iniciadas: 0, concluidas: 0, identificadas: 0, anonimas: 0,
      taxa_conclusao: 0, duracao_media_seg: null, ultima_resposta_em: null,
    }])),
    cuidadoResumo: vi.fn(async () => []),
    cuidado: vi.fn(async () => []),
    pendentes: vi.fn(async () => ({ pendentes: 0, com_erro: 0 })),
    pesquisa: vi.fn(async () => ({})),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ getAccessLevel: () => 5 }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Censo from '../pages/censo/Censo';

describe('página /censo', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('carrega sem estourar e mostra a pesquisa', async () => {
    render(<Censo />);
    expect(await screen.findByText('Censo CBRio 2026')).toBeTruthy();
  });

  it('CLICAR EM CADA ABA não derruba a página (o bug de 07/08)', async () => {
    // Qualquer erro de render dentro de um clique estoura aqui — é o que o
    // usuário viu como "Algo deu errado".
    const erros: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => { erros.push(a[0]); };
    try {
      render(<Censo />);
      await screen.findByText('Censo CBRio 2026');

      for (const rotulo of ['Cuidado', 'Cobertura', 'Perfil', 'Leitura da IA', 'Pesquisas']) {
        const aba = clicarAba(new RegExp(rotulo));
        // Espera a aba REALMENTE virar ativa — senão o teste clicaria no vazio.
        await waitFor(() => expect(aba).toHaveAttribute('data-state', 'active'));
      }
    } finally { console.error = original; }

    const reactErrors = erros.filter((e) => String(e).match(/Minified React error|not valid as a React child/i));
    expect(reactErrors).toEqual([]);
  });

  it('as abas em construção mostram o aviso, não uma tela branca', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cobertura/);
    expect(await screen.findByText(/em construção/)).toBeTruthy();
  });

  it('quem não está na equipe de cuidado vê a explicação, não os nomes', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cuidado/);
    // Sem resposta ainda: o estado vazio é o esperado, e sem quebrar.
    expect(await screen.findByText(/Nenhum pedido ainda|nomes ficam com a equipe/i)).toBeTruthy();
  });
});
