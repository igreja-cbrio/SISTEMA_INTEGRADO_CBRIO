// Contrato do card "Cadastros novos" do Kids (Matheus · 31/08/2026).
import { describe, it, expect } from "vitest";
import { diaBRT, resumirCadastros, serieDiaria, limitesUtc } from "../../backend/utils/cadastrosKids.js";

describe("dia do cadastro · BRT, nunca UTC", () => {
  it("⚠️⚠️ o culto de DOMINGO À NOITE conta no domingo", () => {
    // 19h BRT = 22h UTC. Em UTC o dia já virou, e as crianças cadastradas no
    // fim do culto cairiam na segunda — o número do domingo sairia menor.
    expect(diaBRT("2026-08-30T22:30:00Z")).toBe("2026-08-30");
    expect(diaBRT("2026-08-31T02:59:00Z")).toBe("2026-08-30");
    expect(diaBRT("2026-08-31T03:00:00Z")).toBe("2026-08-31");
  });

  it("timestamp ilegível devolve null, não uma data errada", () => {
    expect(diaBRT("ontem")).toBe(null);
    expect(diaBRT(null as never)).toBe(null);
  });
});

describe("resumo do período", () => {
  it("separa visitante, membro e SEM MARCAÇÃO", () => {
    // ⚠️ `visitante` é nullable: null não é membro. Contar como membro inflaria
    // o número de gente nova da igreja.
    const r = resumirCadastros([{ visitante: true }, { visitante: true }, { visitante: false }, { visitante: null }]);
    expect(r).toMatchObject({ total: 4, visitantes: 2, membros: 1, sem_marcacao: 1 });
  });

  it("⚠️ apagada sai do total e vira contagem PRÓPRIA", () => {
    // Cadastro feito e desfeito no mesmo domingo é sinal de que alguém errou e
    // corrigiu. Esconder faz a equipe procurar uma criança que não está lá.
    const r = resumirCadastros([{ visitante: true }, { visitante: true, deleted_at: "2026-08-30" }]);
    expect(r.total).toBe(1);
    expect(r.apagadas).toBe(1);
  });

  it("conta o que ficou INCOMPLETO", () => {
    const r = resumirCadastros([
      { visitante: false, tem_responsavel: true, data_nascimento: "2020-01-01" },
      { visitante: false, tem_responsavel: false, data_nascimento: null },
    ]);
    expect(r.sem_responsavel).toBe(1);
    expect(r.sem_nascimento).toBe(1);
  });

  it("lista vazia ou lixo não quebra", () => {
    expect(resumirCadastros([]).total).toBe(0);
    expect(resumirCadastros(undefined as never).total).toBe(0);
    expect(resumirCadastros([null as never]).total).toBe(0);
  });
});

describe("série diária", () => {
  it("⚠️ dia SEM cadastro aparece como zero", () => {
    // O gráfico existe pra mostrar que a entrada acontece no DOMINGO. Série só
    // com os dias que tiveram cadastro esconde exatamente esse padrão.
    const s = serieDiaria([{ created_at: "2026-08-30T14:00:00Z" }], "2026-08-28", "2026-08-31");
    expect(s.map((p: { dia: string; total: number }) => p.total)).toEqual([0, 0, 1, 0]);
    expect(s[0].dia).toBe("2026-08-28");
    expect(s[3].dia).toBe("2026-08-31");
  });

  it("⚠️ o culto da noite entra no domingo, também na série", () => {
    const s = serieDiaria([{ created_at: "2026-08-30T23:10:00Z" }], "2026-08-30", "2026-08-31");
    expect(s).toEqual([{ dia: "2026-08-30", total: 1 }, { dia: "2026-08-31", total: 0 }]);
  });

  it("apagada não entra na série (a série é do que EXISTE)", () => {
    const s = serieDiaria([{ created_at: "2026-08-30T14:00:00Z", deleted_at: "x" }], "2026-08-30", "2026-08-30");
    expect(s[0].total).toBe(0);
  });

  it("intervalo invertido devolve vazio em vez de laço infinito", () => {
    expect(serieDiaria([], "2026-08-31", "2026-08-01")).toEqual([]);
    expect(serieDiaria([], "amanhã", "2026-08-01")).toEqual([]);
  });
});

describe("⚠️⚠️ limites em UTC que cobrem o dia BRT", () => {
  it("o dia 30/08 BRT começa às 03:00Z e termina às 03:00Z do dia 31", () => {
    // Filtrar `created_at >= '2026-08-30'` (meia-noite UTC) pegaria 3h do dia 29
    // em BRT — a faixa do culto de domingo à noite ANTERIOR.
    expect(limitesUtc("2026-08-30", "2026-08-30")).toEqual({
      desde: "2026-08-30T03:00:00.000Z",
      ate: "2026-08-31T03:00:00.000Z",
    });
  });

  it("o fim é EXCLUSIVO e cobre o último dia inteiro", () => {
    const l = limitesUtc("2026-08-24", "2026-08-30");
    expect(l.desde).toBe("2026-08-24T03:00:00.000Z");
    expect(l.ate).toBe("2026-08-31T03:00:00.000Z");
  });

  it("data inválida devolve null, não um intervalo torto", () => {
    expect(limitesUtc("x", "2026-08-30")).toBe(null);
  });
});
