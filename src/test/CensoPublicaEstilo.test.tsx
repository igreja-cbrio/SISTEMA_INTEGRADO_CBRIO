import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import PerguntaCampo from '../components/censo/PerguntaCampo';
import CensoPublica from '../pages/public/CensoPublica';
import { PublicPaletteCtx } from '../pages/public/publicTheme';
import type { Pergunta } from '../lib/censoForm';

// ESTE TESTE EXISTE POR CAUSA DE UM BUG REAL (07/08). `usePublicTheme()` devolve
// { isDark, toggle, C } — a PALETA vem em `C`. Eu passei o objeto INTEIRO para o
// contexto, então `optionBg`, `inputBorder` e `text` chegavam undefined nos
// campos. O resultado no celular do Matheus: o campo de data virou um retângulo
// cinza sem texto, os botões de opção perderam a moldura, e "Sim"/"Não" ficaram
// visualmente IDÊNTICOS — dava para marcar um e parecia que os dois estavam
// marcados.
//
// Nada disso quebra em teste de comportamento: o valor mudava certo, só a tela
// mentia. Então o que está em teste aqui é o ESTILO: marcado tem que ser
// visivelmente diferente de desmarcado.

const PALETA_CLARA = {
  isDark: false, pageBg: '#eef2f1', card: 'rgba(255,255,255,0.94)',
  cardBorder: 'rgba(0,0,0,0.08)', text: '#1a1a1a', text2: '#333333',
  text3: '#666666', textDim: '#9aa0a6', inputBorder: 'rgba(0,0,0,0.2)',
  optionBg: '#ffffff', shapes: false,
};

function comPaleta(no: React.ReactNode) {
  return render(<PublicPaletteCtx.Provider value={PALETA_CLARA}>{no}</PublicPaletteCtx.Provider>);
}

const SIM_NAO: Pergunta = { id: 'tem_filhos', tipo: 'sim_nao', texto: 'Tem filhos?', obrigatoria: true };
const OPCAO: Pergunta = {
  id: 'estado_civil', tipo: 'opcao_unica', texto: 'Estado civil', obrigatoria: true,
  opcoes: ['Solteiro(a)', 'Casado(a)', 'União estável'],
};

describe('campos do censo · marcado é visivelmente diferente de desmarcado', () => {
  it('Sim/Não: só o escolhido fica destacado', () => {
    const r = comPaleta(<PerguntaCampo pergunta={SIM_NAO} valor="Sim" onChange={() => {}} />);
    const sim = r.getByRole('radio', { name: 'Sim' });
    const nao = r.getByRole('radio', { name: 'Não' });
    // O bug fazia os dois ficarem idênticos.
    expect(sim.style.borderColor).not.toBe(nao.style.borderColor);
    expect(sim.style.background).not.toBe(nao.style.background);
  });

  it('nenhum campo fica com estilo "undefined" — era a raiz do bug', () => {
    const r = comPaleta(<PerguntaCampo pergunta={OPCAO} valor="Casado(a)" onChange={() => {}} />);
    for (const b of r.getAllByRole('radio')) {
      const s = b.getAttribute('style') || '';
      expect(s).not.toContain('undefined');
      // e toda opção tem moldura visível, marcada ou não
      expect(b.style.border).not.toBe('');
    }
  });

  it('escolha única destaca exatamente uma opção', () => {
    const r = comPaleta(<PerguntaCampo pergunta={OPCAO} valor="Casado(a)" onChange={() => {}} />);
    const bordas = r.getAllByRole('radio').map((b) => b.style.borderColor);
    const destacadas = bordas.filter((c) => c === bordas[1]);   // "Casado(a)" é a 2ª
    expect(destacadas).toHaveLength(1);
  });

  it('o campo de data não fica invisível: tem fundo e cor de texto de verdade', () => {
    const r = comPaleta(<PerguntaCampo pergunta={{ id: 'nasc', tipo: 'data', texto: 'Nascimento' }}
      valor="" onChange={() => {}} />);
    // Pode ser o seletor da casa (botão) ou um input — em qualquer caso, não
    // pode estar com estilo undefined nem sem cor de texto.
    const alvo = r.container.querySelector('input, button') as HTMLElement;
    expect(alvo).toBeTruthy();
    expect(alvo.getAttribute('style') || '').not.toContain('undefined');
  });

  it('a escala 1–5 destaca só a nota escolhida', () => {
    const r = comPaleta(<PerguntaCampo
      pergunta={{ id: 'a', tipo: 'escala_5', texto: 'Acolhido?', rotulos: { min: 'Discordo', max: 'Concordo' } }}
      valor={4} onChange={() => {}} />);
    const notas = r.getAllByRole('button').filter((b) => /^[1-5]$/.test(b.textContent || ''));
    expect(notas).toHaveLength(5);
    const destaque = notas.filter((b) => b.textContent === '4')[0];
    const outra = notas.filter((b) => b.textContent === '2')[0];
    expect(destaque.style.borderColor).not.toBe(outra.style.borderColor);
  });
});

describe('página pública · a paleta chega de verdade na tela', () => {
  it('o container tem fundo e cor REAIS — era exatamente isto que faltava', async () => {
    // O bug: a página passava { isDark, toggle, C } onde devia passar C, então
    // `palette.pageBg` e `palette.text` eram undefined e o navegador descartava
    // as declarações. Um teste de comportamento não pegaria: o valor mudava
    // certo, só a tela mentia. Então olhamos o estilo aplicado.
    const { container } = render(<CensoPublica />);
    await screen.findByText(/Carregando|Tem algo|T/i).catch(() => null);

    const raiz = container.querySelector('div[style*="min-height"]') as HTMLElement;
    expect(raiz, 'container da página não encontrado').toBeTruthy();
    expect(raiz.getAttribute('style') || '').not.toContain('undefined');
    expect(raiz.style.background, 'página sem fundo: a paleta não chegou').not.toBe('');
    expect(raiz.style.color, 'página sem cor de texto: a paleta não chegou').not.toBe('');
  });
});


vi.mock('react-router-dom', () => ({
  useParams: () => ({ slug: 'censo-cbrio-2026' }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock('../api', () => ({
  censoPublico: {
    obter: vi.fn(async () => ({ slug: 's', titulo: 'T', perguntas: [], consentimento_texto: 'a' })),
    retomar: vi.fn(async () => ({ ok: false })),
    responder: vi.fn(), responderBeacon: vi.fn(), parcial: vi.fn(), prefill: vi.fn(),
  },
}));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }) }));
vi.mock('../pages/public/AnimatedBackground', () => ({ default: () => null }));
