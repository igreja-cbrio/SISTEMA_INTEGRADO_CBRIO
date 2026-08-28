// Contrato da régua de calendário da rotina de gestão.
//
// ⚠️ Rodar com `npm test` DENTRO de agent-worker/. Este arquivo NÃO está no gate
// de deploy da Vercel de propósito: o agent-worker é deployado no Railway, e o
// `vitest` da raiz só varre `src/**` do ERP. Rodar antes de mexer na régua.
//
// O que ele protege: qual BLOCO da rotina dispara em cada dia. Errar aqui faz o
// pedido de dado da sexta chegar na segunda — e o pedido existe na sexta
// justamente pra ter 5 dias de folga até a reunião de quarta.

import assert from "node:assert/strict";
import {
  hojeBRT,
  diaDaSemanaBRT,
  somarDias,
  blocoDoDia,
  proximaQuarta,
  ehUltimaSextaDoMes,
  tituloDoBloco,
  NOME_DO_DIA,
} from "./rotinaDia.js";

let n = 0;
const t = (nome: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ok  ${nome}`);
};

console.log("rotinaDia");

// ── O dia é BRT, não UTC ────────────────────────────────────────────────────
// ⚠️ O caso que mata: 23h de sexta no Rio é 02h de SÁBADO em UTC. Com
// `toISOString()` o bloco "abastecer" simplesmente não existiria naquela noite.
t("23h de sexta no Rio ainda é sexta (UTC já virou sábado)", () => {
  const d = new Date("2026-08-15T02:00:00Z"); // sáb 02:00 UTC = sex 23:00 BRT
  assert.equal(hojeBRT(d), "2026-08-14");
  assert.equal(diaDaSemanaBRT(d), 5);
  assert.equal(blocoDoDia(diaDaSemanaBRT(d)), "abastecer");
});

t("21h de domingo no Rio ainda é domingo", () => {
  const d = new Date("2026-08-17T00:30:00Z"); // seg 00:30 UTC = dom 21:30 BRT
  assert.equal(hojeBRT(d), "2026-08-16");
  assert.equal(diaDaSemanaBRT(d), 0);
  assert.equal(blocoDoDia(diaDaSemanaBRT(d)), "fora");
});

t("07:00 BRT de segunda é segunda (o horário do scheduler)", () => {
  const d = new Date("2026-08-17T10:00:00Z"); // 10:00 UTC = 07:00 BRT
  assert.equal(hojeBRT(d), "2026-08-17");
  assert.equal(blocoDoDia(diaDaSemanaBRT(d)), "decidir");
});

// ── Os 3 dias, e só eles ────────────────────────────────────────────────────
t("sexta abastece · segunda decide · quarta fecha", () => {
  assert.equal(blocoDoDia(5), "abastecer");
  assert.equal(blocoDoDia(1), "decidir");
  assert.equal(blocoDoDia(3), "fechar");
});

t("terça, quinta, sábado e domingo ficam FORA", () => {
  // O plano tinha 5 manhãs e foi cortado pra 3. Se algum destes deixar de ser
  // "fora", a rotina voltou a 5 dias sem ninguém decidir isso.
  [0, 2, 4, 6].forEach((d) => assert.equal(blocoDoDia(d), "fora", `dow ${d}`));
});

t("cada bloco tem título próprio e nenhum vem vazio", () => {
  (["abastecer", "decidir", "fechar", "fora"] as const).forEach((b) => {
    assert.ok(tituloDoBloco(b).length > 10, b);
  });
  assert.notEqual(tituloDoBloco("abastecer"), tituloDoBloco("decidir"));
});

// ── A próxima quarta ────────────────────────────────────────────────────────
t("na sexta, a próxima quarta é a da semana seguinte", () => {
  assert.equal(proximaQuarta("2026-08-14"), "2026-08-19"); // sex 14 → qua 19
});

t("na quarta, a próxima quarta é HOJE", () => {
  // Na quarta a reunião a preparar é a de hoje. Apontar pra semana que vem
  // faria o last call da manhã cobrar dado da reunião errada.
  assert.equal(proximaQuarta("2026-08-19"), "2026-08-19");
});

t("na segunda, a próxima quarta é 2 dias à frente", () => {
  assert.equal(proximaQuarta("2026-08-17"), "2026-08-19");
});

t("a próxima quarta atravessa a virada de mês", () => {
  assert.equal(proximaQuarta("2026-08-28"), "2026-09-02"); // sex 28/08 → qua 02/09
});

// ── Fechamento mensal ───────────────────────────────────────────────────────
t("28/08/2026 é a última sexta de agosto", () => {
  assert.equal(ehUltimaSextaDoMes("2026-08-28"), true);
});

t("21/08/2026 é sexta mas NÃO é a última", () => {
  assert.equal(ehUltimaSextaDoMes("2026-08-21"), false);
});

t("quarta nunca é fechamento mensal, nem no fim do mês", () => {
  // Sem a guarda de dia da semana, o fechamento vazaria pro bloco errado.
  assert.equal(ehUltimaSextaDoMes("2026-09-30"), false); // 30/09 é quarta
  assert.equal(ehUltimaSextaDoMes("2026-08-31"), false); // 31/08 é segunda
});

t("fevereiro: 27/02/2026 é a última sexta", () => {
  assert.equal(ehUltimaSextaDoMes("2026-02-27"), true);
  assert.equal(ehUltimaSextaDoMes("2026-02-20"), false);
});

// ── somarDias ───────────────────────────────────────────────────────────────
t("somarDias atravessa mês e ano sem escorregar de fuso", () => {
  assert.equal(somarDias("2026-08-31", 1), "2026-09-01");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  // Bissexto: 2028 tem 29/02.
  assert.equal(somarDias("2028-02-28", 1), "2028-02-29");
});

t("somarDias(0) devolve o mesmo dia", () => {
  assert.equal(somarDias("2026-08-17", 0), "2026-08-17");
});

t("NOME_DO_DIA cobre os 7 dias na ordem do getDay()", () => {
  assert.equal(NOME_DO_DIA.length, 7);
  assert.equal(NOME_DO_DIA[0], "domingo");
  assert.equal(NOME_DO_DIA[1], "segunda");
  assert.equal(NOME_DO_DIA[3], "quarta");
  assert.equal(NOME_DO_DIA[5], "sexta");
});

console.log(`rotinaDia: ok (${n} casos)`);
