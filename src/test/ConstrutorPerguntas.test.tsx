import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ConstrutorPerguntas from '../components/censo/ConstrutorPerguntas';
import type { Pergunta } from '../lib/censoConstrutor';
import { trocarTipoPergunta, validarOrdem, renomearOpcao } from '../lib/censoConstrutor';
import { validarPerguntas } from '../../backend/utils/censoPerguntas.js';

// O que está em teste aqui é a integridade do questionário quando alguém o
// EDITA — o momento em que um censo já coletado pode ser silenciosamente
// destruído. A regra que manda: o `id` da pergunta é a coluna da resposta no
// banco. Se ele mudar, as respostas viram órfãs e o gráfico daquela pergunta
// zera sem erro na tela.

const BASE: Pergunta[] = [
  { id: 'b1', tipo: 'secao', texto: '1 — Bloco' },
  { id: 'tem_filhos', tipo: 'sim_nao', texto: 'Tem filhos?', obrigatoria: true },
  {
    id: 'quantos', tipo: 'numero', texto: 'Quantos?', obrigatoria: true,
    min_num: 1, max_num: 20, mostrar_se: { pergunta: 'tem_filhos', valores: ['Sim'] },
  },
];

function montar(perguntas = BASE, respostas = 0) {
  const onSalvar = vi.fn();
  render(
    <ConstrutorPerguntas perguntas={perguntas} respostas={respostas}
      podeEditar salvando={false} onSalvar={onSalvar} />,
  );
  return { onSalvar };
}

/** Abre a linha da pergunta para editar. */
function abrir(texto: string) {
  fireEvent.click(screen.getByText(texto));
}

describe('construtor · o id é imutável', () => {
  it('editar o TEXTO não muda o id — é o que salva o censo já coletado', () => {
    const { onSalvar } = montar();
    abrir('Tem filhos?');
    const campo = screen.getByDisplayValue('Tem filhos?');
    fireEvent.change(campo, { target: { value: 'Você tem filhos?' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Salvar perguntas/ })[0]);

    const enviadas: Pergunta[] = onSalvar.mock.calls[0][0];
    const alvo = enviadas.find((p) => p.texto === 'Você tem filhos?');
    expect(alvo?.id).toBe('tem_filhos');
  });

  it('trocar o TIPO preserva id, texto e condicional', () => {
    const antes = BASE[2];   // "Quantos?" · numero · condicional
    const depois = trocarTipoPergunta(antes, 'texto_curto');
    expect(depois.id).toBe('quantos');
    expect(depois.texto).toBe('Quantos?');
    expect(depois.mostrar_se).toEqual({ pergunta: 'tem_filhos', valores: ['Sim'] });
    // e joga fora o que não vale mais no tipo novo
    expect(depois.min_num).toBeUndefined();
  });

  it('trocar para seção limpa o que seção não tem, sem perder o id', () => {
    const depois = trocarTipoPergunta(BASE[2], 'secao');
    expect(depois.id).toBe('quantos');
    expect(depois.obrigatoria).toBeUndefined();
    expect(depois.mostrar_se).toBeUndefined();
  });

  it('virar escolha única já nasce com opções válidas para o servidor', () => {
    const depois = trocarTipoPergunta(BASE[1], 'opcao_unica');
    expect(validarPerguntas([depois]).ok).toBe(true);
  });

  it('gatilho de cuidado sobrevive a virar Sim/Não de novo, e morre em outro tipo', () => {
    const gatilho: Pergunta = { id: 'g', tipo: 'sim_nao', texto: 'Quer ajuda?', obrigatoria: true,
      acao: 'cuidado', cuidado_tipo: 'oracao' };
    expect(trocarTipoPergunta(gatilho, 'sim_nao').acao).toBe('cuidado');
    // O servidor só aceita gatilho em Sim/Não, então em texto ele não pode ir.
    expect(trocarTipoPergunta(gatilho, 'texto_longo').acao).toBeUndefined();
  });

  it('duplicar NÃO copia o id — duas perguntas disputariam a mesma coluna', () => {
    const { onSalvar } = montar();
    fireEvent.click(screen.getAllByTitle('Duplicar')[1]);   // duplica "Tem filhos?"
    fireEvent.click(screen.getAllByRole('button', { name: /Salvar perguntas/ })[0]);

    const enviadas: Pergunta[] = onSalvar.mock.calls[0][0];
    const copia = enviadas.find((p) => p.texto.includes('(cópia)'));
    expect(copia).toBeTruthy();
    expect(copia?.id).toBeUndefined();
  });
});

describe('construtor · protege as condicionais', () => {
  it('a regra pura acusa condicional que aponta para frente', () => {
    expect(validarOrdem(BASE)).toBeNull();
    const invertida = [BASE[0], BASE[2], BASE[1]];   // "Quantos?" antes de "Tem filhos?"
    expect(validarOrdem(invertida)).toMatch(/pergunta anterior/i);
  });

  it('a UI avisa e NÃO reordena quando o movimento quebraria a condicional', () => {
    const avisos: string[] = [];
    vi.spyOn(window, 'alert').mockImplementation((m) => { avisos.push(String(m)); });
    montar();
    fireEvent.click(screen.getAllByTitle('Subir')[2]);   // "Quantos?" subindo
    expect(avisos.join(' ')).toMatch(/pergunta anterior/i);
    // Sem mudança, o botão de salvar nem aparece — é como a tela diz "nada mudou".
    expect(screen.queryByRole('button', { name: /Salvar perguntas/ })).toBeNull();
    vi.restoreAllMocks();
  });

  it('não deixa remover uma pergunta de que outra depende', () => {
    const avisos: string[] = [];
    vi.spyOn(window, 'alert').mockImplementation((m) => { avisos.push(String(m)); });
    montar();
    fireEvent.click(screen.getAllByTitle('Remover')[1]);   // "Tem filhos?"
    expect(avisos.join(' ')).toMatch(/dependem desta/i);
    expect(screen.getByText('Tem filhos?')).toBeTruthy();  // continua lá
    vi.restoreAllMocks();
  });
});

describe('construtor · opções e neutras', () => {
  const comOpcoes: Pergunta[] = [{
    id: 'emocional', tipo: 'opcao_unica', texto: 'Como está?', obrigatoria: true,
    opcoes: ['Bem', 'Ansioso', 'Prefiro não dizer'], opcoes_neutras: ['Prefiro não dizer'],
  }];

  it('renomear uma opção NEUTRA renomeia a marca também', () => {
    // Sem isto, a marca aponta para um texto que não existe mais e o servidor
    // recusa a gravação com "opcoes_neutras fora da lista de opções".
    const { onSalvar } = montar(comOpcoes);
    abrir('Como está?');
    fireEvent.change(screen.getByDisplayValue('Prefiro não dizer'), {
      target: { value: 'Prefiro não responder' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Salvar perguntas/ })[0]);

    const p = (onSalvar.mock.calls[0][0] as Pergunta[])[0];
    expect(p.opcoes).toContain('Prefiro não responder');
    expect(p.opcoes_neutras).toEqual(['Prefiro não responder']);
    // e o resultado passa na validação do servidor
    expect(validarPerguntas(onSalvar.mock.calls[0][0]).ok).toBe(true);
  });

  it('remover a opção remove a marca de neutra junto', () => {
    const { onSalvar } = montar(comOpcoes);
    abrir('Como está?');
    const linha = screen.getByDisplayValue('Prefiro não dizer').closest('div')!;
    fireEvent.click(linha.querySelector('[title="Remover opção"]')!);
    fireEvent.click(screen.getAllByRole('button', { name: /Salvar perguntas/ })[0]);

    const p = (onSalvar.mock.calls[0][0] as Pergunta[])[0];
    expect(p.opcoes).not.toContain('Prefiro não dizer');
    expect(p.opcoes_neutras).toEqual([]);
    expect(validarPerguntas(onSalvar.mock.calls[0][0]).ok).toBe(true);
  });
});

describe('construtor · o que ele produz passa no servidor', () => {
  it('renomear opção mantém a marca de "não conta" coerente com o servidor', () => {
    const p: Pergunta = { id: 'x', tipo: 'multipla', texto: 'X', obrigatoria: true,
      opcoes: ['A', 'Prefiro não dizer'], opcoes_neutras: ['Prefiro não dizer'] };
    const patch = renomearOpcao(p, 1, 'Prefiro não responder');
    const depois = { ...p, ...patch };
    expect(depois.opcoes_neutras).toEqual(['Prefiro não responder']);
    expect(validarPerguntas([depois]).ok).toBe(true);
  });

  it('adicionar pergunta pela UI produz algo que o servidor aceita', () => {
    const { onSalvar } = montar();
    fireEvent.click(screen.getByRole('button', { name: /Sim \/ Não/ }));
    // A nova entra sem texto e abre para edição: preenche o campo vazio.
    const vazio = screen.getAllByRole('textbox').find((e) => (e as HTMLTextAreaElement).value === '')!;
    fireEvent.change(vazio, { target: { value: 'Você já foi batizado?' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Salvar perguntas/ })[0]);

    const enviadas = onSalvar.mock.calls[0][0];
    expect(validarPerguntas(enviadas).erros).toEqual([]);
    // O servidor gera o id da nova a partir do texto; as antigas mantêm o delas.
    const v = validarPerguntas(enviadas);
    expect(v.perguntas.map((q: Pergunta) => q.id).slice(0, 3)).toEqual(['b1', 'tem_filhos', 'quantos']);
  });

  it('avisa quando a pesquisa já tem resposta', () => {
    montar(BASE, 42);
    expect(screen.getByText(/já tem 42 resposta/)).toBeTruthy();
  });
});
