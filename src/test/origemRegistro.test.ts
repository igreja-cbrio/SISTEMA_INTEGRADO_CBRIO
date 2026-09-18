// Contrato do "quando foi registrado" no card de convertidos (Matheus · 02/09/2026).
// ⚠️ Os dois casos base são REAIS, medidos em produção no dia do pedido.
import { describe, it, expect } from "vitest";
import { origemDoRegistro, quandoBRT, atrasoDias, textoRegistro } from "../../backend/utils/origemRegistro.js";

const AGORA = Date.parse("2026-09-02T12:00:00Z");

describe("origem do registro · quem preencheu", () => {
  it("a própria pessoa: formulário público, app e chat", () => {
    for (const f of ["form_publico", "app", "chat"]) {
      expect(origemDoRegistro(f)).toMatchObject({ rotulo: "Preencheu", porPessoa: true });
    }
  });

  it("⚠️⚠️ a equipe registrando NÃO é 'preencheu' — manual e link_culto", () => {
    // O link do voluntário (14/08) é o voluntário lançando PELA pessoa. Chamar
    // isso de "preencheu" afirma um fato falso sobre ela E lava o atraso do
    // lançamento: a tela diria que ela demorou, quando quem demorou foi o time.
    for (const f of ["manual", "link_culto"]) {
      expect(origemDoRegistro(f)).toMatchObject({ rotulo: "Registrado pela equipe", porPessoa: false });
    }
  });

  it("⚠️⚠️ fonte desconhecida cai no NEUTRO, nunca em 'Preencheu'", () => {
    // O CHECK tem 5 valores hoje; um sexto entra sem passar por aqui. Se o
    // default fosse o específico, a fonte nova mentiria em silêncio.
    for (const f of [null, undefined, "", "fonte_nova_2027", "  "]) {
      const r = origemDoRegistro(f as never);
      expect(r.rotulo).toBe("Registrado");
      expect(r.porPessoa).toBe(null);
    }
  });

  it("acento/caixa não mudam a decisão", () => {
    expect(origemDoRegistro("FORM_PUBLICO").porPessoa).toBe(true);
  });
});

describe("⚠️⚠️ a hora é BRT, nunca UTC", () => {
  it("12:29 BRT não vira 15:29 na tela", () => {
    // `registrado_em` é timestamptz. Sem forçar o fuso, o horário sai em UTC —
    // e das 21h em diante o DIA também muda.
    expect(quandoBRT("2026-08-30T15:29:35Z", AGORA)).toBe("30/08 12:29");
  });

  it("⚠️ o culto da noite não vaza pro dia seguinte", () => {
    expect(quandoBRT("2026-08-31T01:30:00Z", AGORA)).toBe("30/08 22:30");
  });

  it("ano só aparece quando NÃO é o corrente", () => {
    expect(quandoBRT("2025-12-10T15:00:00Z", AGORA)).toBe("10/12/2025 12:00");
    expect(quandoBRT("2026-12-10T15:00:00Z", AGORA)).toBe("10/12 12:00");
  });

  it("timestamp ilegível devolve null, não uma data errada", () => {
    expect(quandoBRT("ontem", AGORA)).toBe(null);
    expect(quandoBRT(null as never, AGORA)).toBe(null);
  });
});

describe("atraso do lançamento", () => {
  it("registro no dia do culto não tem atraso", () => {
    expect(atrasoDias("2026-08-30T15:29:35Z", "2026-08-30")).toBe(null);
  });

  it("⚠️ o caso do Nelson: registrado um dia depois", () => {
    expect(atrasoDias("2026-08-03T18:41:13Z", "2026-08-02")).toBe(1);
  });

  it("⚠️ registro ANTES do culto devolve null, nunca negativo", () => {
    // Dado incoerente (fuso, correção manual). Mostrar "-1 dia" seria a tela
    // afirmando algo impossível.
    expect(atrasoDias("2026-08-01T18:00:00Z", "2026-08-02")).toBe(null);
  });

  it("sem data do culto não inventa atraso", () => {
    expect(atrasoDias("2026-08-03T18:41:13Z", null)).toBe(null);
  });
});

describe("a linha pronta · os dois casos REAIS de produção", () => {
  it("Juliana (form_publico, no dia do culto)", () => {
    const r = textoRegistro({ registradoEm: "2026-08-30T15:29:35Z", fonte: "form_publico", dataCulto: "2026-08-30", agora: AGORA });
    expect(r!.texto).toBe("Preencheu 30/08 12:29");
  });

  it("⚠️⚠️ Nelson (manual, um dia depois) — e o atraso APARECE", () => {
    // É a informação que responde a pergunta por trás do pedido: "esse dado é
    // de agora ou é lançamento atrasado?". O atraso medido em 14/08 (média 3
    // dias) é o que faz o SLA de contato nascer vencido.
    const r = textoRegistro({ registradoEm: "2026-08-03T18:41:13Z", fonte: "manual", dataCulto: "2026-08-02", agora: AGORA });
    expect(r!.texto).toBe("Registrado pela equipe 03/08 15:41 · 1 dia após o culto");
    expect(r!.atrasoDias).toBe(1);
  });

  it("plural do dia", () => {
    const r = textoRegistro({ registradoEm: "2026-08-11T18:00:00Z", fonte: "manual", dataCulto: "2026-08-02", agora: AGORA });
    expect(r!.texto).toContain("9 dias após o culto");
  });

  it("sem carimbo não renderiza linha nenhuma", () => {
    expect(textoRegistro({ registradoEm: null, fonte: "manual", dataCulto: "2026-08-02" })).toBe(null);
    expect(textoRegistro({})).toBe(null);
  });

  it("⚠️ a string 'preencheu' NUNCA sai para registro de terceiro", () => {
    const r = textoRegistro({ registradoEm: "2026-08-03T18:41:13Z", fonte: "link_culto", dataCulto: "2026-08-02", agora: AGORA });
    expect(r!.texto.toLowerCase()).not.toContain("preencheu");
  });
});
