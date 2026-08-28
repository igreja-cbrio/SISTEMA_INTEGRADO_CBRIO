// Contrato do rodízio de escala de voluntários.
//
// Pedido do Matheus (13/08/2026): deixar a montagem de escala no estilo do
// Planning Center Services e mais prática pro supervisor de área. Duas coisas
// vieram de lá, medidas na ferramenta:
//   · a lista de candidatos é ordenada por HÁ QUANTO TEMPO A PESSOA NÃO SERVE;
//   · o auto-preencher escolhe "quem foi escalado há mais tempo", filtrando
//     conflitos — e preenche as VAGAS, não a equipe inteira.
//
// ⚠️ MUTATION-TEST das duas causas raiz:
//   · voltar a ordenar por nome (alfabético) → a suíte fica vermelha;
//   · preencher com todos os membros em vez das vagas → idem;
//   · aceitar quem tem OUTRA posição da mesma equipe → idem (escalar o
//     baterista no vocal).
//
// O "agora" é sempre injetado — nenhum caso depende do relógio da máquina.
import { describe, it, expect } from 'vitest';
import {
  semanasSemServir, rotuloTempoSemServir, ordenarCandidatos,
  candidatoElegivel, distribuirVagas,
} from '../../backend/utils/volRodizio.js';

const AGORA = '2026-08-13T12:00:00-03:00';

// Fábrica de candidato: o default é o caso comum (elegível, sem conflito).
const cand = (over: any = {}) => ({
  id: over.id || 'p1',
  nome: over.nome || 'Fulano',
  semanas: over.semanas === undefined ? 0 : over.semanas,
  conflito: !!over.conflito,
  indisponivel: !!over.indisponivel,
  jaEscalado: !!over.jaEscalado,
  equipes: over.equipes || [{ team_id: 'banda', position_id: null }],
});

describe('semanasSemServir · quanto tempo faz', () => {
  it('conta semanas inteiras', () => {
    expect(semanasSemServir('2026-08-06T10:00:00-03:00', AGORA)).toBe(1);
    expect(semanasSemServir('2026-07-16T10:00:00-03:00', AGORA)).toBe(4);
    expect(semanasSemServir('2026-08-12T10:00:00-03:00', AGORA)).toBe(0);
  });

  it('sem escala na janela devolve null — e null NÃO é zero', () => {
    // O null tem que atravessar como null: virar 0 colocaria quem nunca
    // apareceu no MESMO patamar de quem serviu ontem.
    expect(semanasSemServir(null, AGORA)).toBeNull();
    expect(semanasSemServir(undefined, AGORA)).toBeNull();
    expect(semanasSemServir('data-podre', AGORA)).toBeNull();
  });

  it('escala FUTURA conta como 0 — quem já está comprometido não é "descansado"', () => {
    expect(semanasSemServir('2026-08-20T10:00:00-03:00', AGORA)).toBe(0);
  });
});

describe('rotuloTempoSemServir · não afirma o que não sabemos', () => {
  it('null NÃO vira "nunca serviu"', () => {
    // A busca da rota tem janela. Quem serviu antes dela cai aqui igual a
    // quem nunca serviu — dizer "nunca serviu" seria afirmar o que não
    // medimos, e sobre uma pessoa real, na tela de quem decide a escala.
    expect(rotuloTempoSemServir(null)).toBe('sem escala recente');
    expect(rotuloTempoSemServir(null)).not.toMatch(/nunca/i);
  });

  it('textos curtos', () => {
    expect(rotuloTempoSemServir(0)).toBe('serviu esta semana');
    expect(rotuloTempoSemServir(1)).toBe('há 1 semana');
    expect(rotuloTempoSemServir(7)).toBe('há 7 semanas');
    expect(rotuloTempoSemServir(60)).toBe('há mais de um ano');
  });
});

describe('ordenarCandidatos · quem está há mais tempo sem servir vem primeiro', () => {
  it('ordena por tempo sem servir, NÃO por nome', () => {
    // ⚠️ Este é o mutante: em ordem alfabética a resposta seria
    // ['Ana', 'Bruno', 'Carla'] — que é exatamente a lista velha, em que o
    // topo era sempre a mesma gente.
    const r = ordenarCandidatos([
      cand({ id: 'a', nome: 'Ana', semanas: 1 }),
      cand({ id: 'b', nome: 'Bruno', semanas: 7 }),
      cand({ id: 'c', nome: 'Carla', semanas: 3 }),
    ]);
    expect(r.map((c: any) => c.nome)).toEqual(['Bruno', 'Carla', 'Ana']);
  });

  it('sem escala na janela vai pro TOPO (vale mais que 10 semanas)', () => {
    const r = ordenarCandidatos([
      cand({ id: 'a', nome: 'Ana', semanas: 10 }),
      cand({ id: 'b', nome: 'Bruno', semanas: null }),
    ]);
    expect(r[0].nome).toBe('Bruno');
  });

  it('conflito vai pro FIM, mesmo estando há mais tempo sem servir', () => {
    // Quem já serve em outro culto do mesmo dia é o último recurso — o
    // supervisor até pode escalar, mas não é a primeira sugestão.
    const r = ordenarCandidatos([
      cand({ id: 'a', nome: 'Ana', semanas: 2 }),
      cand({ id: 'b', nome: 'Bruno', semanas: 30, conflito: true }),
    ]);
    expect(r.map((c: any) => c.nome)).toEqual(['Ana', 'Bruno']);
  });

  it('empate desempata por nome — a ordem é determinística', () => {
    const lista = [
      cand({ id: 'c', nome: 'Carla', semanas: 3 }),
      cand({ id: 'a', nome: 'Ana', semanas: 3 }),
      cand({ id: 'b', nome: 'Bruno', semanas: 3 }),
    ];
    expect(ordenarCandidatos(lista).map((c: any) => c.nome)).toEqual(['Ana', 'Bruno', 'Carla']);
    // Reordenar a entrada não muda a saída (lista que dança a cada render
    // faz o supervisor perder o nome que estava lendo).
    expect(ordenarCandidatos([...lista].reverse()).map((c: any) => c.nome)).toEqual(['Ana', 'Bruno', 'Carla']);
  });

  it('não muta a lista recebida', () => {
    const lista = [cand({ id: 'a', nome: 'Ana', semanas: 1 }), cand({ id: 'b', nome: 'Bruno', semanas: 9 })];
    ordenarCandidatos(lista);
    expect(lista.map(c => c.nome)).toEqual(['Ana', 'Bruno']);
  });
});

describe('candidatoElegivel · o que a automação NUNCA escala', () => {
  it('indisponível está fora — é a lei de 13/08', () => {
    expect(candidatoElegivel(cand({ indisponivel: true }))).toBe(false);
  });
  it('já escalado neste culto está fora', () => {
    expect(candidatoElegivel(cand({ jaEscalado: true }))).toBe(false);
  });
  it('conflito no mesmo dia está fora do AUTOMÁTICO', () => {
    expect(candidatoElegivel(cand({ conflito: true }))).toBe(false);
  });
  it('o caso comum entra', () => {
    expect(candidatoElegivel(cand())).toBe(true);
  });
});

describe('distribuirVagas · preenche as VAGAS, não a equipe inteira', () => {
  const vagaVocal = { id: 'v1', team_id: 'banda', position_id: 'vocal', position: 'Vocal', faltam: 2 };

  it('2 vagas com 5 candidatos escala 2 — e são os que estão há mais tempo sem servir', () => {
    // ⚠️ MUTANTE: o auto-fill até 13/08 fazia `available.map(...)` e escalava
    // os 5. Numa equipe de 40, escalava as 40.
    const candidatos = [
      cand({ id: 'a', nome: 'Ana', semanas: 1, equipes: [{ team_id: 'banda', position_id: 'vocal' }] }),
      cand({ id: 'b', nome: 'Bruno', semanas: 9, equipes: [{ team_id: 'banda', position_id: 'vocal' }] }),
      cand({ id: 'c', nome: 'Carla', semanas: 5, equipes: [{ team_id: 'banda', position_id: 'vocal' }] }),
      cand({ id: 'd', nome: 'Davi', semanas: 2, equipes: [{ team_id: 'banda', position_id: 'vocal' }] }),
      cand({ id: 'e', nome: 'Elis', semanas: 0, equipes: [{ team_id: 'banda', position_id: 'vocal' }] }),
    ];
    const { atribuicoes, vagasSemCandidato } = distribuirVagas({ vagas: [vagaVocal], candidatos });
    expect(atribuicoes).toHaveLength(2);
    expect(atribuicoes.map((a: any) => a.candidato.nome)).toEqual(['Bruno', 'Carla']);
    expect(vagasSemCandidato).toHaveLength(0);
  });

  it('nunca escala a mesma pessoa em duas vagas', () => {
    const candidatos = [cand({ id: 'a', nome: 'Ana', semanas: 9, equipes: [{ team_id: 'banda', position_id: null }] })];
    const { atribuicoes } = distribuirVagas({
      vagas: [
        { id: 'v1', team_id: 'banda', position_id: null, faltam: 1 },
        { id: 'v2', team_id: 'banda', position_id: null, faltam: 1 },
      ],
      candidatos,
    });
    expect(atribuicoes).toHaveLength(1);
  });

  it('vaga sem ninguém elegível é DECLARADA, não some', () => {
    const { atribuicoes, vagasSemCandidato } = distribuirVagas({
      vagas: [vagaVocal],
      candidatos: [cand({ id: 'a', nome: 'Ana', semanas: 9, indisponivel: true, equipes: [{ team_id: 'banda', position_id: 'vocal' }] })],
    });
    expect(atribuicoes).toHaveLength(0);
    expect(vagasSemCandidato).toHaveLength(1);
    expect(vagasSemCandidato[0].restantes).toBe(2);
  });

  it('quem tem OUTRA posição da mesma equipe NÃO entra na vaga', () => {
    // ⚠️ MUTANTE: afrouxar pra "qualquer vínculo da equipe" escala o
    // baterista no vocal, e o supervisor só descobre no domingo.
    const { atribuicoes, vagasSemCandidato } = distribuirVagas({
      vagas: [{ ...vagaVocal, faltam: 1 }],
      candidatos: [cand({ id: 'a', nome: 'Ana', semanas: 9, equipes: [{ team_id: 'banda', position_id: 'bateria' }] })],
    });
    expect(atribuicoes).toHaveLength(0);
    expect(vagasSemCandidato).toHaveLength(1);
  });

  it('quem é da equipe SEM posição definida serve de reserva pra vaga com posição', () => {
    // A maioria dos vínculos do Planning Center veio sem posição; exigir
    // posição exata deixaria o auto-preencher sem preencher nada.
    const { atribuicoes } = distribuirVagas({
      vagas: [{ ...vagaVocal, faltam: 1 }],
      candidatos: [cand({ id: 'a', nome: 'Ana', semanas: 9, equipes: [{ team_id: 'banda', position_id: null }] })],
    });
    expect(atribuicoes).toHaveLength(1);
    expect(atribuicoes[0].candidato.nome).toBe('Ana');
  });

  it('quem é de OUTRA equipe nunca entra', () => {
    const { atribuicoes } = distribuirVagas({
      vagas: [{ ...vagaVocal, faltam: 1 }],
      candidatos: [cand({ id: 'a', nome: 'Ana', semanas: 40, equipes: [{ team_id: 'cuidados', position_id: null }] })],
    });
    expect(atribuicoes).toHaveLength(0);
  });

  it('a atribuição carrega o vínculo — é dele que saem equipe e função gravadas', () => {
    const { atribuicoes } = distribuirVagas({
      vagas: [{ ...vagaVocal, faltam: 1 }],
      candidatos: [cand({ id: 'a', nome: 'Ana', semanas: 9, equipes: [{ team_id: 'banda', position_id: 'vocal' }] })],
    });
    expect(atribuicoes[0].vinculo).toEqual({ team_id: 'banda', position_id: 'vocal' });
  });

  it('sem vagas não escala ninguém', () => {
    expect(distribuirVagas({ vagas: [], candidatos: [cand({ semanas: 50 })] }).atribuicoes).toHaveLength(0);
    expect(distribuirVagas({ vagas: [{ ...vagaVocal, faltam: 0 }], candidatos: [cand({ semanas: 50 })] }).atribuicoes).toHaveLength(0);
  });
});
