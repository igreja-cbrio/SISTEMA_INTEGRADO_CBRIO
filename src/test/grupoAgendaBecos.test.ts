import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ⚠️⚠️ Os TRÊS becos sem saída da agenda de encontros, fechados a pedido do
 * Marcos em 25/08/2026: *"precisamos corrigir essas coisas que você falou que
 * valem saber, não podem acontecer."*
 *
 *  1. "não aconteceu" num dia que TEM chamada era RECUSADO, e a mensagem mandava
 *     falar com a coordenação — o app sabia que a chamada estava errada e não
 *     deixava o líder arrumar. Virou ação de DOIS PASSOS.
 *  2. corrigir a data para um dia que já tem chamada levantava 23505 DEPOIS de
 *     salvar. As datas ocupadas saem da janela.
 *  3. as recusas restantes passaram a dizer o CAMINHO, não só o "não".
 *
 * Guarda ESTÁTICA (sobre o texto do código, com o comentário REMOVIDO): o
 * caminho passa por Supabase e o gate roda sem as dependências de `backend/`.
 * ⚠️ A remoção de comentário não é enfeite — o próprio arquivo explica o
 * mecanismo citando os identificadores, e sem isso a explicação vira a
 * evidência (a armadilha que já mordeu 3 vezes neste repo).
 */
const semComentarios = (fonte: string) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');

const ler = (p: string) => semComentarios(readFileSync(p, 'utf8'));

const SERVICO = ler('backend/services/grupoAgendaExcecao.js');
const APP = ler('backend/routes/app.js');
const GRUPOS = ler('backend/routes/grupos.js');

describe('beco 1 · "não aconteceu" com chamada é ação de dois passos', () => {
  it('o serviço recebe a confirmação e só apaga com ela', () => {
    expect(SERVICO).toContain('confirmarApagarChamada = false');
    // sem a confirmação, devolve 409 com o código que a tela reconhece
    expect(SERVICO).toContain("codigo: 'tem_chamada'");
    // com ela, apaga pelo caminho ÚNICO (que decrementa o contador de presenças
    // de cada pessoa — `delete` cru inflaria o contador pra sempre, sem erro)
    expect(SERVICO).toContain('apagarEncontroGrupo(encontroNaData.id)');
  });

  // ⚠️⚠️ FAIL-CLOSED: é este parâmetro que apaga chamada de gente. String, `1`
  // ou objeto vindos de um cliente distraído NÃO podem valer como confirmação.
  it('as duas portas exigem o booleano `true`, nada de truthy', () => {
    for (const rota of [APP, GRUPOS]) {
      expect(rota).toContain('confirmarApagarChamada: confirmar_apagar_chamada === true');
    }
  });

  it('o 409 leva quantas presenças se perdem, pra a pergunta ser concreta', () => {
    expect(SERVICO).toContain('presentes');
    for (const rota of [APP, GRUPOS]) {
      expect(rota).toContain('corpo.presentes = r.presentes');
    }
  });

  // ⚠️ Apagar ANTES de gravar a exceção: morrer no meio deixa a chamada apagada
  // e o dia sem a marca — visível na tela e corrigível com um toque. A ordem
  // inversa deixaria a marca com a chamada ainda lá, e a timeline dá precedência
  // ao registrado ("o fato vence a intenção") — a ação pareceria não ter pegado.
  it('apaga a chamada ANTES de escrever a exceção', () => {
    const iApagar = SERVICO.indexOf('apagarEncontroGrupo(encontroNaData.id)');
    const iGravar = SERVICO.indexOf('mem_grupo_agenda_excecoes');
    const iUpsert = SERVICO.lastIndexOf('upsert');
    expect(iApagar).toBeGreaterThan(0);
    expect(iApagar).toBeLessThan(Math.max(iGravar, iUpsert));
  });
});

describe('beco 2 · a data ocupada some da janela antes de alguém escolher', () => {
  it('o serviço passa as datas com chamada para a régua', () => {
    expect(SERVICO).toContain('datasComChamada(grupoId, dataOriginal)');
    expect(SERVICO).toContain('ocupadas:');
    // e recusa no servidor mesmo assim: a tela é conveniência, o cinto é aqui
    expect(SERVICO).toContain("codigo: 'data_ocupada'");
  });

  it('o app manda as bloqueadas para a tela apagar do calendário', () => {
    expect(APP).toContain('corrigir_bloqueadas');
    expect(APP).toContain('ocupadas:');
  });
});

describe('beco 3 · as recusas que sobraram dizem o CAMINHO', () => {
  it('corrigir para o futuro aponta a agenda, não uma tela genérica', () => {
    expect(SERVICO).toContain("codigo: 'correcao_no_futuro'");
    expect(SERVICO).toMatch(/n[ãa]o aconteceu/i);
  });

  it('janela sem data livre manda marcar "não aconteceu"', () => {
    expect(SERVICO).toMatch(/Não sobra nenhuma data livre/);
  });
});
