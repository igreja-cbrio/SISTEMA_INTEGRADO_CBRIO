// Contrato do card "Cadastros novos" do Kids (Matheus · 31/08/2026).
import { describe, it, expect } from "vitest";
import { diaBRT, resumirCadastros, serieDiaria, limitesUtc, temMarcaDeImport } from "../../backend/utils/cadastrosKids.js";

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

// ════════════════════════════════════════════════════════════════════════════
//  IMPORT × cadastro no culto · acrescentado em 31/08/2026
//
//  ⚠️⚠️ O achado que motiva este bloco, MEDIDO em produção: o dia 30/06/2026
//  tem 3.381 cadastros num único dia (import do Planning Center), 3.169 deles
//  marcados `visitante = true`. Efeito no chip que a tela JÁ mostrava:
//
//    janela     total cru   visitantes cru   visitantes REAIS
//    7 dias        31            21               21
//    30 dias       98            47               47
//    90 dias    3.547         3.222               53   ← 60× inflado
//
//  "Quantos visitantes eu tive" é sobre gente que APARECEU. Linha de planilha
//  importada não apareceu em culto nenhum.
// ════════════════════════════════════════════════════════════════════════════
describe("cadastrosKids · import não é visitante", () => {
  it("reconhece a marca do Planning Center", () => {
    expect(temMarcaDeImport({ planning_center_id: "12345" })).toBe(true);
    expect(temMarcaDeImport({ planning_center_id: null })).toBe(false);
    expect(temMarcaDeImport({})).toBe(false);
    expect(temMarcaDeImport(null)).toBe(false);
  });

  it("⚠️ string VAZIA conta como ausência (a base tem as duas formas)", () => {
    expect(temMarcaDeImport({ planning_center_id: "" })).toBe(false);
    expect(temMarcaDeImport({ planning_center_id: "   " })).toBe(false);
  });

  it("⚠️⚠️ importada NÃO entra no total nem em visitantes", () => {
    const r = resumirCadastros([
      { visitante: true, created_at: "2026-08-30T14:00:00Z" },
      { visitante: true, created_at: "2026-06-30T14:00:00Z", planning_center_id: "p1" },
      { visitante: true, created_at: "2026-06-30T14:00:00Z", planning_center_id: "p2" },
    ]);
    expect(r.total).toBe(1);
    expect(r.visitantes).toBe(1);
    expect(r.importadas).toBe(2);
    expect(r.importadas_visitante).toBe(2);
  });

  it("⚠️ importada é CONTADA e declarada, nunca descartada em silêncio", () => {
    const r = resumirCadastros([
      { visitante: false, created_at: "2026-06-30T14:00:00Z", planning_center_id: "p1" },
    ]);
    expect(r.total).toBe(0);
    expect(r.importadas).toBe(1);
    // veio como membro no import: conta em importadas, não em importadas_visitante
    expect(r.importadas_visitante).toBe(0);
  });

  it("a proporção real do dia do import, em miniatura", () => {
    // 4 do culto (3 visitantes) + 10 do import (9 visitantes)
    const linhas = [
      ...Array.from({ length: 3 }, () => ({ visitante: true, created_at: "2026-08-30T14:00:00Z" })),
      { visitante: false, created_at: "2026-08-30T14:00:00Z" },
      ...Array.from({ length: 9 }, (_, i) => ({ visitante: true, created_at: "2026-06-30T14:00:00Z", planning_center_id: `p${i}` })),
      { visitante: false, created_at: "2026-06-30T14:00:00Z", planning_center_id: "px" },
    ];
    const r = resumirCadastros(linhas);
    expect(r.total).toBe(4);
    expect(r.visitantes).toBe(3);
    expect(r.membros).toBe(1);
    expect(r.importadas).toBe(10);
  });

  it("⚠️⚠️ a SÉRIE também exclui o import (o pico achata os outros dias)", () => {
    const s = serieDiaria([
      { created_at: "2026-08-30T14:00:00Z" },
      ...Array.from({ length: 50 }, (_, i) => ({ created_at: "2026-08-29T14:00:00Z", planning_center_id: `p${i}` })),
    ], "2026-08-29", "2026-08-30");
    expect(s).toEqual([
      { dia: "2026-08-29", total: 0 },
      { dia: "2026-08-30", total: 1 },
    ]);
  });

  it("⚠️ apagada + importada: cada uma no seu balde, sem contar duas vezes", () => {
    const r = resumirCadastros([
      { visitante: true, created_at: "2026-06-30T14:00:00Z", planning_center_id: "p1", deleted_at: "2026-07-01T00:00:00Z" },
    ]);
    expect(r.apagadas).toBe(1);
    expect(r.importadas).toBe(0);   // apagada saiu antes
    expect(r.total).toBe(0);
  });
});
