// Contrato do filtro por área nos check-ins (Matheus · 01/09/2026).
// ⚠️ As opções e os valores são os REAIS do Celebra 2026, medidos no banco.
import { describe, it, expect } from "vitest";
import { opcoesMarcadas, camposAgrupaveis, resumoPorOpcao, normalizar } from "../../backend/utils/respostaOpcoes.js";

const INTERESSE = "Ainda não sirvo, mas tenho interesse em conhecer o voluntariado.";
const OPCOES = [
  "Ofertório - Integração", "Kids", "AMI", "Bridge", "Online", "Recepção - Integração",
  "Estacionamento - Integração", "Intercessão - Integração", "Ceia - Integração",
  "Batismo - Integração", "Check-in  - Voluntariado", "Cozinha - Voluntariado",
  "Cuidados", "Louvor / Coral", "Produção", "Marketing - Fotografia / Vídeo",
  "Next", "Grupos", INTERESSE,
];

describe("opções marcadas · casos REAIS do Celebra", () => {
  it("uma área só", () => {
    expect(opcoesMarcadas("Produção", OPCOES)).toEqual(["Produção"]);
    expect(opcoesMarcadas("Kids", OPCOES)).toEqual(["Kids"]);
  });

  it("múltipla escolha separada por vírgula", () => {
    expect(opcoesMarcadas("AMI, Bridge", OPCOES)).toEqual(["AMI", "Bridge"]);
  });

  it("⚠️⚠️ a opção que CONTÉM vírgula não é partida em duas", () => {
    // Dividir por vírgula produzia "Ainda não sirvo" e "mas tenho interesse em
    // conhecer o voluntariado." — duas áreas que não existem no formulário.
    expect(opcoesMarcadas(INTERESSE, OPCOES)).toEqual([INTERESSE]);
  });

  it("⚠️⚠️ a linha suja de verdade: mesma opção 8× e cortada no fim", () => {
    // Existe em produção. Sem dedup, essa inscrição sozinha somaria 8 na área.
    const sujo =
      `${INTERESSE}, `.repeat(4) + "Cuidados, " + `${INTERESSE}, `.repeat(3) + "Ainda não sirvo, mas tenho i";
    const r = opcoesMarcadas(sujo, OPCOES);
    expect(r).toHaveLength(2);
    expect(r).toContain("Cuidados");
    expect(r).toContain(INTERESSE);
  });

  it("⚠️ espaço duplo do catálogo não impede o casamento", () => {
    // "Check-in  - Voluntariado" tem DOIS espaços em `opcoes`.
    expect(opcoesMarcadas("Check-in - Voluntariado", OPCOES)).toEqual(["Check-in  - Voluntariado"]);
  });

  it("acento e caixa não importam", () => {
    expect(opcoesMarcadas("PRODUCAO", OPCOES)).toEqual(["Produção"]);
  });

  it("⚠️ a opção CURTA não é marcada por estar dentro da longa", () => {
    // Se um dia existir "Integração" solta ao lado de "Recepção - Integração",
    // casar a curta primeiro marcaria a área errada.
    const comCurta = [...OPCOES, "Integração"];
    expect(opcoesMarcadas("Recepção - Integração", comCurta)).toEqual(["Recepção - Integração"]);
    expect(opcoesMarcadas("Integração", comCurta)).toEqual(["Integração"]);
  });

  it("⚠️ a ordem é a do CATÁLOGO, não a da resposta", () => {
    // Faz a tela listar as áreas sempre igual.
    expect(opcoesMarcadas("Bridge, AMI", OPCOES)).toEqual(["AMI", "Bridge"]);
  });

  it("vazio, nulo e texto que não casa devolvem lista vazia", () => {
    expect(opcoesMarcadas("", OPCOES)).toEqual([]);
    expect(opcoesMarcadas(null, OPCOES)).toEqual([]);
    expect(opcoesMarcadas("Sou do time da limpeza", OPCOES)).toEqual([]);
    expect(opcoesMarcadas("Kids", null as never)).toEqual([]);
  });
});

describe("campos agrupáveis", () => {
  it("só campo COM lista de opções", () => {
    const campos = [
      { key: "ministerio", tipo: "multi", opcoes: ["A", "B"] },
      { key: "obs", tipo: "texto", opcoes: [] },
      { key: "foto", tipo: "imagem" },
    ];
    expect(camposAgrupaveis(campos).map((c: { key: string }) => c.key)).toEqual(["ministerio"]);
  });

  it("⚠️ texto livre NUNCA entra", () => {
    // Não agrupa (cada resposta é única) e é onde PII aparece — um filtro por
    // resposta ali viraria lista de nomes e telefones na tela de check-in.
    expect(camposAgrupaveis([{ key: "nome_empresa", tipo: "texto", opcoes: [] }])).toEqual([]);
    expect(camposAgrupaveis(null as never)).toEqual([]);
  });
});

describe("resumo por opção", () => {
  const linhas = [
    { valor: "Produção", presente: true },
    { valor: "Produção", presente: false },
    { valor: "Produção, Kids", presente: true },
    { valor: "", presente: true },
    { valor: "Sou da limpeza", presente: false },
  ];

  it("conta inscritos e presentes por área", () => {
    const r = resumoPorOpcao(linhas, OPCOES);
    const prod = r.porOpcao.find((o: { opcao: string }) => o.opcao === "Produção");
    expect(prod).toMatchObject({ inscritos: 3, presentes: 2 });
    const kids = r.porOpcao.find((o: { opcao: string }) => o.opcao === "Kids");
    expect(kids).toMatchObject({ inscritos: 1, presentes: 1 });
  });

  it("⚠️⚠️ a soma das áreas passa do total de PESSOAS — e é esperado", () => {
    // Campo de múltipla escolha: quem marca 2 áreas conta nas 2. Somar as
    // colunas e comparar com o total leva a concluir que a conta está errada.
    const r = resumoPorOpcao(linhas, OPCOES);
    const somaAreas = r.porOpcao.reduce((s: number, o: { inscritos: number }) => s + o.inscritos, 0);
    expect(somaAreas).toBeGreaterThan(r.pessoas - r.sem_resposta - r.nao_reconhecido);
    expect(r.pessoas).toBe(5);
    expect(r.presentes).toBe(3);
  });

  it("⚠️ sem resposta e não reconhecido são estados SEPARADOS", () => {
    // "não declarou" e "declarou algo que não está no formulário" pedem ações
    // diferentes — e nenhum dos dois é uma área.
    const r = resumoPorOpcao(linhas, OPCOES);
    expect(r.sem_resposta).toBe(1);
    expect(r.nao_reconhecido).toBe(1);
  });

  it("área que ninguém marcou não polui a lista", () => {
    const r = resumoPorOpcao(linhas, OPCOES);
    expect(r.porOpcao.some((o: { opcao: string }) => o.opcao === "Next")).toBe(false);
  });

  it("lista vazia não quebra", () => {
    expect(resumoPorOpcao([], OPCOES).pessoas).toBe(0);
    expect(resumoPorOpcao(null as never, OPCOES).porOpcao).toEqual([]);
  });
});

describe("normalizar", () => {
  it("colapsa espaço e tira acento", () => {
    expect(normalizar("  Check-in   -  Voluntariado ")).toBe("check-in - voluntariado");
  });
});
