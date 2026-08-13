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
    cobertura: vi.fn(async () => ({
      pesquisa: { titulo: 'Censo CBRio 2026', status: 'aberta', total_perguntas: 108, ultima_resposta_em: null },
      iniciadas: 120, concluidas: 100, abandonadas: 20, taxa_conclusao: 83,
      duracao_media_seg: 540, identificadas: 90, anonimas: 10,
      membros_ativos: 1798, cobertura_pct: 5,
      por_canal: [{ canal: 'qr', iniciadas: 120, concluidas: 100, identificadas: 90 }],
      por_dia: [{ dia: '2026-08-09', iniciadas: 60, concluidas: 50 },
                { dia: '2026-08-10', iniciadas: 60, concluidas: 50 }],
      abandono: [{ pergunta_id: 'x', pergunta_texto: 'Pergunta cansativa', respostas: 40, pct_do_total: 40 }],
    })),
    perfil: vi.fn(async () => ({
      titulo: 'Censo CBRio 2026', respondentes: 100,
      graficos: [
        { tipo: 'secao', id: 'b1', texto: '1 — Identificação' },
        { tipo: 'opcao_unica', id: 'acompanhamento_lideranca', texto: 'Tem acompanhamento?',
          sensivel: false, base: 90, neutras: 10, total: 100, media: null, aberta: false,
          valores: [
            { valor: 'Sim', total: 40, pct: 44.4, neutra: false },
            { valor: 'Não', total: 30, pct: 33.3, neutra: false },
            { valor: 'Às vezes', total: 20, pct: 22.2, neutra: false },
            { valor: 'Não se aplica', total: 10, pct: 10, neutra: true },
          ] },
        { tipo: 'texto_longo', id: 'comentario', texto: 'Comentário livre',
          base: 30, neutras: 0, total: 30, media: null, aberta: true, valores: [] },
      ],
      demografia: {
        faixa_etaria: [{ valor: '25-34', total: 40 }, { valor: '35-44', total: 60 }],
        genero: [{ valor: 'feminino', total: 60 }, { valor: 'masculino', total: 40 }],
        estado_civil: [], bairro: [], status_membro: [],
      },
    })),
    ia: {
      obter: vi.fn(async () => ({
        leitura: null, respostas_na_base: 100, desatualizada: false,
        novas_desde: 100, pode_gerar: true, ia_configurada: true,
      })),
      gerar: vi.fn(),
    },
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

  it('Cobertura mostra o DENOMINADOR, não só a contagem', async () => {
    // O número que decide se dá para confiar no censo é 90 de 1.798 — não "90
    // respostas". Se a tela mostrar só o numerador, ela convida à leitura errada.
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cobertura/);
    // Aparece duas vezes de propósito: no cartão e dentro da ressalva. As duas
    // são o mesmo ponto — sem denominador o número engana.
    expect((await screen.findAllByText(/1798 membros ativos/)).length).toBeGreaterThan(0);
    expect(screen.getByText('5%')).toBeTruthy();
  });

  it('Cobertura avisa quando a amostra ainda não representa a igreja', async () => {
    // 5% de cobertura com um gráfico bonito do lado é como se produz decisão
    // errada com cara de dado. A ressalva tem que estar na tela.
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cobertura/);
    expect(await screen.findByText(/ainda não representa a igreja/i)).toBeTruthy();
  });

  // ⚠️ O que este teste cobre é a TELA: que ela desenha na ordem que recebeu e
  // não reordena por volume nem alfabeticamente. Quem ORDENA é o backend, e essa
  // lógica tem teste próprio em censoPerguntas.test.ts (`ordenarPorOpcoes`) —
  // não dá para testar as duas coisas no mesmo lugar, e confundi-las seria pior
  // que não testar: o nome diria "ordem garantida" cobrindo metade do caminho.
  it('Perfil desenha na ordem recebida (não reordena) e separa a opção neutra', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Perfil/);
    await screen.findByText('Tem acompanhamento?');

    const corpo = document.body.textContent || '';
    const pos = ['Sim', 'Não', 'Às vezes', 'Não se aplica'].map((v) => corpo.indexOf(v));
    expect(pos.every((p, i) => i === 0 || p > pos[i - 1])).toBe(true);

    // A neutra fica FORA do 100%: as três primeiras somam ~100 sozinhas.
    expect(screen.getByText(/44.4%/)).toBeTruthy();
    expect(await screen.findByText(/ficam? fora\s+da base|fica fora/i)).toBeTruthy();
  });

  it('Perfil não desenha barra para texto livre — manda para a Leitura da IA', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Perfil/);
    expect(await screen.findByText(/Barra não diz nada sobre texto aberto/i)).toBeTruthy();
  });

  it('Leitura da IA oferece gerar quando ainda não há síntese', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Leitura da IA/);
    expect(await screen.findByText(/ainda não foram lidas/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gerar leitura/ })).toBeTruthy();
  });

  it('quem não está na equipe de cuidado vê a explicação, não os nomes', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cuidado/);
    // Sem resposta ainda: o estado vazio é o esperado, e sem quebrar.
    expect(await screen.findByText(/Nenhum pedido ainda|nomes ficam com a equipe/i)).toBeTruthy();
  });
});
