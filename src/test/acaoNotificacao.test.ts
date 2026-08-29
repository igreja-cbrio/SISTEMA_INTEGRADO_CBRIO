// Contrato dos BOTÕES na notificação do app (Matheus · 29/08/2026).
// A régua vive em backend/utils (sem Supabase) e tem espelho no repo do app.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acoesDaNotificacao, acaoPermitida, statusDaAcao, MAX_ESCALAS } from "../../backend/utils/acaoNotificacao.js";

const raiz = join(__dirname, "..", "..");
const semComentarios = (s: string) =>
  s.split("\n").map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, "$1")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ações da notificação", () => {
  it("escala COM ids mostra confirmar e não-posso", () => {
    const r = acoesDaNotificacao("escala", { tipo: "escala", escala_ids: ["a", "b"] });
    expect(r.acoes).toEqual(["confirmar", "nao_posso"]);
    expect(r.escalaIds).toEqual(["a", "b"]);
  });

  it("⚠️⚠️ escala SEM ids não mostra botão (as 79 antigas)", () => {
    // O aviso só passou a mandar `escala_ids` em 29/08. Notificação antiga não
    // tem alvo — inventar um responderia pela escala errada.
    expect(acoesDaNotificacao("escala", { tipo: "escala" }).acoes).toEqual([]);
    expect(acoesDaNotificacao("escala", { escala_ids: [] }).acoes).toEqual([]);
    expect(acoesDaNotificacao("escala", null).acoes).toEqual([]);
  });

  it("pedido de grupo COM pedido_id mostra aprovar e recusar", () => {
    const r = acoesDaNotificacao("grupo_pedido", { pedido_id: "p1", grupo_id: "g1" });
    expect(r.acoes).toEqual(["aprovar", "recusar"]);
    expect(r.pedidoId).toBe("p1");
  });

  it("pedido de grupo sem id não mostra botão", () => {
    expect(acoesDaNotificacao("grupo_pedido", { grupo_id: "g1" }).acoes).toEqual([]);
  });

  it("⚠️ já respondida vira DESFECHO, não botão", () => {
    // Sem isso a pessoa toca de novo, o servidor diz "já estava assim" e ela
    // conclui que o app não gravou.
    const r = acoesDaNotificacao("escala", { escala_ids: ["a"], acao: "confirmar" });
    expect(r.acoes).toEqual([]);
    expect(r.feita).toBe("confirmar");
  });

  it("tipo sem ação (comunicado, devocional) não ganha botão", () => {
    expect(acoesDaNotificacao("comunicado", { slug: "x" }).acoes).toEqual([]);
  });

  it("⚠️ ação de OUTRO tipo não passa (fail-closed)", () => {
    expect(acaoPermitida("escala", { escala_ids: ["a"] }, "aprovar")).toBe(false);
    expect(acaoPermitida("grupo_pedido", { pedido_id: "p" }, "nao_posso")).toBe(false);
    expect(acaoPermitida("escala", { escala_ids: ["a"] }, "")).toBe(false);
    expect(acaoPermitida("escala", { escala_ids: ["a"] }, undefined as never)).toBe(false);
  });

  it("⚠️ lixo no data não vira alvo", () => {
    expect(acoesDaNotificacao("escala", { escala_ids: "a" as never }).acoes).toEqual([]);
    expect(acoesDaNotificacao("escala", { escala_ids: [1, null, "  "] as never }).acoes).toEqual([]);
    expect(acoesDaNotificacao("grupo_pedido", { pedido_id: "  " }).acoes).toEqual([]);
  });

  it("⚠️ teto de escalas e sem repetição", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => `id-${i}`);
    expect(acoesDaNotificacao("escala", { escala_ids: muitos }).escalaIds).toHaveLength(MAX_ESCALAS);
    expect(acoesDaNotificacao("escala", { escala_ids: ["a", "a", "b"] }).escalaIds).toEqual(["a", "b"]);
  });

  it("⚠️⚠️ 'Pedir troca' grava DECLINED (é o que avisa a coordenação)", () => {
    expect(statusDaAcao("nao_posso")).toBe("declined");
    expect(statusDaAcao("confirmar")).toBe("confirmed");
    expect(statusDaAcao("aprovar")).toBe(null);
  });
});

describe("⚠️⚠️ guarda: responder escala pelo APP tem que avisar gente", () => {
  // Achado de 29/08: a rota do app fazia UPDATE direto em `confirmation_status`
  // e NÃO avisava coordenação nem supervisor — enquanto o irmão do ERP
  // (/my-schedules/:id/respond) já passava pelo serviço desde 14/08. Quem
  // recusava pelo celular deixava a vaga aberta em silêncio.
  const app = semComentarios(readFileSync(join(raiz, "backend/routes/app.js"), "utf8"));

  it("o helper do app chama responderEscala", () => {
    expect(app).toMatch(/async function responderMinhaEscala[\s\S]{0,2000}?return responderEscala\(/);
  });

  it("nenhuma rota do app grava a RESPOSTA da pessoa na mão", () => {
    // ⚠️ O alvo é `confirmation_status: status` — a resposta que a pessoa deu.
    // O check-in do supervisor grava o LITERAL 'confirmed' (linha ~2763) e é
    // legítimo: ali a pessoa APARECEU, o fato consumado não precisa avisar
    // ninguém pra repor vaga nenhuma. Casar o literal reprovaria aquele caso.
    expect(app).not.toMatch(/update\(\{\s*confirmation_status:\s*status/);
  });

  it("o aviso de escala manda os ids, senão o botão não tem alvo", () => {
    const aviso = semComentarios(readFileSync(join(raiz, "backend/services/escalaAviso.js"), "utf8"));
    expect(aviso).toMatch(/data:\s*\{\s*tipo:\s*'escala',\s*escala_ids:/);
  });
});
