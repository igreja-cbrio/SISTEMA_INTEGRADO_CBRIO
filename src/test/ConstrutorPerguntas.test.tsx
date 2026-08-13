import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ConstrutorPerguntas from '../components/censo/ConstrutorPerguntas';
import type { Pergunta } from '../lib/censoConstrutor';
import {
  trocarTipoPergunta, validarOrdem, renomearOpcao, moverPergunta, indiceApos,
  removerPerguntas, selecionadasComResposta, moverOpcao,
} from '../lib/censoConstrutor';
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

  it('⚠️ arrastar MOVE, não troca — arrastar o 1º para o fim não embaralha o meio', () => {
    const lista: Pergunta[] = [
      { id: 'a', tipo: 'texto_curto', texto: 'A' },
      { id: 'b', tipo: 'texto_curto', texto: 'B' },
      { id: 'c', tipo: 'texto_curto', texto: 'C' },
      { id: 'd', tipo: 'texto_curto', texto: 'D' },
    ];
    // Se isto fosse um swap (como o subir/descer podia ser), daria D,B,C,A —
    // uma reordenação viraria três perguntas fora de lugar.
    const r = moverPergunta(lista, 0, 3);
    expect(r.erro).toBeNull();
    expect(r.lista.map((p) => p.id)).toEqual(['b', 'c', 'd', 'a']);

    const volta = moverPergunta(r.lista, 3, 0);
    expect(volta.lista.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('arrastar que quebraria a condicional é RECUSADO e devolve a lista intacta', () => {
    const r = moverPergunta(BASE, 2, 1);   // "Quantos?" para antes de "Tem filhos?"
    expect(r.erro).toMatch(/pergunta anterior/i);
    expect(r.lista).toBe(BASE);            // mesma referência: nada foi aplicado
  });

  it('soltar fora das bordas satura em vez de cancelar, e soltar no mesmo lugar é no-op', () => {
    const lista: Pergunta[] = [
      { id: 'a', tipo: 'texto_curto', texto: 'A' },
      { id: 'b', tipo: 'texto_curto', texto: 'B' },
    ];
    expect(moverPergunta(lista, 0, 99).lista.map((p) => p.id)).toEqual(['b', 'a']);
    expect(moverPergunta(lista, 1, -5).lista.map((p) => p.id)).toEqual(['b', 'a']);
    expect(moverPergunta(lista, 1, 1).lista).toBe(lista);
    expect(moverPergunta(lista, 7, 0).lista).toBe(lista);   // índice inexistente
  });

  it('o painel aberto segue a pergunta certa depois do movimento', () => {
    // Sem isto, quem estava editando a pergunta 1 passa a digitar na de outra.
    expect(indiceApos(0, 0, 3)).toBe(3);   // a própria aberta foi arrastada
    expect(indiceApos(2, 0, 3)).toBe(1);   // estava no meio, arrasto desceu → sobe 1
    expect(indiceApos(1, 3, 0)).toBe(2);   // arrasto subiu por cima dela → desce 1
    expect(indiceApos(5, 0, 2)).toBe(5);   // fora do trecho movido, não muda
    expect(indiceApos(null, 0, 2)).toBeNull();
  });

  it('⚠️ apagar em LOTE: junto é permitido onde sozinho não é', () => {
    // "Quantos?" depende de "Tem filhos?". Apagar só a "Tem filhos?" é proibido…
    const soUma = removerPerguntas(BASE, [1]);
    expect(soUma.erro).toMatch(/depende de uma pergunta da seleção/i);
    expect(soUma.lista).toBe(BASE);

    // …mas apagar as DUAS juntas é legítimo, porque não sobra ninguém órfão.
    const asDuas = removerPerguntas(BASE, [1, 2]);
    expect(asDuas.erro).toBeNull();
    expect(asDuas.lista.map((p) => p.id)).toEqual(['b1']);
  });

  it('o aviso do lote NOMEIA quem ficaria órfã', () => {
    const r = removerPerguntas(BASE, [1]);
    expect(r.erro).toContain('Quantos?');
  });

  it('conta quantas da seleção já foram gravadas — é o que tem resposta a perder', () => {
    const comNova = [...BASE, { tipo: 'texto_curto', texto: 'Nova' } as Pergunta];
    expect(selecionadasComResposta(comNova, [1, 2, 3])).toBe(2);   // a nova não tem id
    expect(selecionadasComResposta(comNova, [3])).toBe(0);
  });

  it('a UI apaga as selecionadas e o botão de salvar aparece', () => {
    montar();
    const caixas = screen.getAllByRole('checkbox');
    fireEvent.click(caixas[1]);   // "Tem filhos?"
    fireEvent.click(caixas[2]);   // "Quantos?"
    expect(screen.getByText(/2 pergunta\(s\) selecionada/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apagar selecionadas/ }));
    expect(screen.queryByText('Tem filhos?')).toBeNull();
    expect(screen.queryByText('Quantos?')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Salvar perguntas/ })[0]).toBeTruthy();
  });

  it('⚠️ reordenar LIMPA a seleção — índice guardado apontaria para outra pergunta', () => {
    montar();
    const caixas = screen.getAllByRole('checkbox');
    fireEvent.click(caixas[0]);
    expect(screen.getByText(/1 pergunta\(s\) selecionada/)).toBeTruthy();
    fireEvent.click(screen.getAllByTitle('Descer')[0]);   // move a selecionada
    expect(screen.queryByText(/selecionada/)).toBeNull();
  });

  it('reordenar OPÇÃO move e não toca na marca de "não conta"', () => {
    // A marca aponta pelo TEXTO. Se ela fosse reescrita por índice, "não conta"
    // pousaria na opção errada — e o percentual passaria a excluir a resposta
    // errada, sem nada na tela denunciando.
    const p: Pergunta = {
      id: 'x', tipo: 'opcao_unica', texto: 'Cor?',
      opcoes: ['Azul', 'Verde', 'Prefiro não dizer'],
      opcoes_neutras: ['Prefiro não dizer'],
    };
    const patch = moverOpcao(p, 2, 0);
    expect(patch.opcoes).toEqual(['Prefiro não dizer', 'Azul', 'Verde']);
    expect(patch.opcoes_neutras).toBeUndefined();   // não é reescrita
  });

  it('mover opção para o mesmo lugar (ou índice inválido) não devolve mudança', () => {
    const p: Pergunta = { id: 'x', tipo: 'multipla', texto: 'Q', opcoes: ['A', 'B'] };
    expect(moverOpcao(p, 1, 1)).toEqual({});
    expect(moverOpcao(p, 9, 0)).toEqual({});
    expect(moverOpcao(p, 0, 99).opcoes).toEqual(['B', 'A']);   // satura na borda
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
