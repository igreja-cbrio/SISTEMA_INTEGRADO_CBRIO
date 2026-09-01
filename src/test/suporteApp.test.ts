// Contrato de "Ajuda com o app" (Matheus · 29/08/2026).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validarMensagem, montarParams, paraParametro, telefoneLegivel, digitos, MAX_PARAM } from "../../backend/utils/suporteApp.js";

const raiz = join(__dirname, "..", "..");
const semComentarios = (s: string) =>
  s.split("\n").map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, "$1")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

describe("ajuda com o app · a dúvida vira mensagem", () => {
  it("⚠️⚠️ quebra de linha NÃO vai pro parâmetro do template", () => {
    // A Meta recusa a mensagem INTEIRA (132000) quando um parâmetro tem \n, tab
    // ou 4+ espaços. Gente escreve dúvida em várias linhas o tempo todo — sem
    // isto, justamente a dúvida mais bem escrita é a que não chega.
    const p = montarParams({ nome: "Ana", telefone: "21999998888", mensagem: "oi\n\nnão vejo meu grupo\n\tobrigada" });
    expect(p[2]).toBe("oi · não vejo meu grupo · obrigada");
    expect(p[2]).not.toMatch(/[\r\n\t]/);
    expect(p[2]).not.toMatch(/ {4}/);
  });

  it("⚠️ nome também é normalizado (vem de cadastro, com espaço duplo)", () => {
    expect(montarParams({ nome: "Ana  Souza", telefone: "", mensagem: "teste ok" })[0]).toBe("Ana Souza");
  });

  it("telefone sai legível pra quem vai ligar de volta", () => {
    expect(telefoneLegivel("5521999998888")).toBe("(21) 99999-8888");
    expect(telefoneLegivel("2133334444")).toBe("(21) 3333-4444");
  });

  it("⚠️ o 55 do país sai (o envio prefixa) — mas DDD 55 fica", () => {
    // Santa Maria/RS é DDD 55: comer o prefixo cru destruiria o número inteiro.
    expect(digitos("5521999998888")).toBe("21999998888");
    expect(digitos("55999998888")).toBe("55999998888");
    expect(digitos("(21) 99999-8888")).toBe("21999998888");
  });

  it("⚠️⚠️ SEM telefone o pedido não é bloqueado — é declarado", () => {
    // Cadastro incompleto é justamente o assunto de boa parte das dúvidas.
    // Barrar deixaria de fora quem mais precisa de ajuda.
    const p = montarParams({ nome: "Ana", telefone: null, mensagem: "não consigo entrar" });
    expect(p[1]).toBe("sem telefone no cadastro");
  });

  it("sem nome, não vai string vazia pro template", () => {
    expect(montarParams({ nome: "", telefone: "", mensagem: "oi tudo bem" })[0]).toBe("Alguém do app");
  });

  it("dúvida vazia ou curta demais é recusada", () => {
    expect(validarMensagem("").ok).toBe(false);
    expect(validarMensagem("   ").ok).toBe(false);
    expect(validarMensagem("oi").ok).toBe(false);
    expect(validarMensagem("meu grupo sumiu").ok).toBe(true);
  });

  it("⚠️ dúvida gigante é truncada no parâmetro, com reticência", () => {
    const p = montarParams({ nome: "A", telefone: "", mensagem: "x".repeat(5000) });
    expect(p[2].length).toBeLessThanOrEqual(MAX_PARAM);
    expect(p[2].endsWith("…")).toBe(true);
  });

  it("paraParametro aguenta nulo sem virar 'null'", () => {
    expect(paraParametro(null)).toBe("");
    expect(paraParametro(undefined)).toBe("");
  });
});

describe("⚠️ guarda: o destinatário vive no BANCO, não no código", () => {
  const rota = semComentarios(readFileSync(join(raiz, "backend/routes/app.js"), "utf8"));
  const bloco = rota.slice(rota.indexOf("router.post('/suporte'"), rota.indexOf("router.post('/notificacoes/:id/acao'"));

  it("lê whatsapp_config.suporte_app_membro_id", () => {
    expect(bloco).toMatch(/suporte_app_membro_id/);
  });

  it("⚠️⚠️ nenhum telefone ou nome de pessoa hardcoded na rota", () => {
    // Lei do projeto: dono de fluxo nunca é nome no código. E telefone literal
    // aqui viraria mensagem indo pro número errado quando a pessoa mudar.
    expect(bloco).not.toMatch(/\b(?:55)?\d{2}9\d{7,8}\b/);
    expect(bloco).not.toMatch(/wa\.me/);
  });

  it("GRAVA a dúvida antes de tentar o WhatsApp", () => {
    const iIns = bloco.indexOf("app_suporte_mensagens");
    const iWpp = bloco.indexOf("notificarMembro");
    expect(iIns).toBeGreaterThan(-1);
    expect(iWpp).toBeGreaterThan(iIns);
  });

  it("⚠️ a notificação interna não carrega o telefone", () => {
    const notif = bloco.slice(bloco.indexOf("notificar({"), bloco.indexOf("res.status(201)"));
    expect(notif).not.toMatch(/telefone/);
  });
});
