import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarCiclo, estadoInicial, textoAlerta, CICLOS_PARA_ALERTAR, type Estado } from "./vigiaBanco.js";

const ciclo = (bancoOk: boolean, appOk: boolean, agoraMs = 0) => ({ bancoOk, appOk, agoraMs });
/** Roda N ciclos iguais, devolvendo estado final e o que foi disparado. */
function rodar(n: number, bancoOk: boolean, appOk: boolean, e: Estado = estadoInicial, t0 = 0) {
  let estado = e; const alertas: number[] = []; const recuperacoes: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = avaliarCiclo(estado, ciclo(bancoOk, appOk, t0 + i * 60_000));
    if (d.alertar) alertas.push(i);
    if (d.recuperou) recuperacoes.push(i);
    estado = d.estado;
  }
  return { estado, alertas, recuperacoes };
}

test("sistema saudável nunca alerta", () => {
  const r = rodar(100, true, true);
  assert.equal(r.alertas.length, 0);
  assert.equal(r.estado.alertado, false);
});

test("⚠️ 1 e 2 falhas NÃO alertam (soluço de rede)", () => {
  assert.equal(rodar(1, false, false).alertas.length, 0);
  assert.equal(rodar(2, false, false).alertas.length, 0);
});

test("⚠️⚠️ 3 falhas seguidas alertam — UMA vez", () => {
  const r = rodar(3, false, false);
  assert.deepEqual(r.alertas, [CICLOS_PARA_ALERTAR - 1]);
});

test("⚠️⚠️ queda de 1h34 gera UM alerta, não 94", () => {
  // Sem a trava `alertado`, um ciclo por minuto durante a queda real de
  // 02/09 teria mandado 94 e-mails. Enxurrada treina a ignorar o alerta.
  const r = rodar(94, false, false);
  assert.equal(r.alertas.length, 1, "deveria alertar UMA vez em 94 ciclos");
});

test("⚠️ falha isolada no meio de tudo bem NÃO alerta (contador zera)", () => {
  let e = estadoInicial;
  for (const ok of [true, false, true, false, true, false, true]) {
    e = avaliarCiclo(e, ciclo(ok, ok)).estado;
  }
  assert.equal(e.alertado, false);
});

test("recuperação avisa depois de 2 sucessos, com a duração", () => {
  const caiu = rodar(5, false, false, estadoInicial, 1_000_000);
  assert.equal(caiu.alertas.length, 1);
  let e = caiu.estado;
  const d1 = avaliarCiclo(e, ciclo(true, true, 1_600_000));
  assert.equal(d1.recuperou, false, "1 sucesso não basta");
  const d2 = avaliarCiclo(d1.estado, ciclo(true, true, 1_660_000));
  assert.equal(d2.recuperou, true);
  assert.equal(d2.duracaoMs, 660_000, "duração conta do 1º ciclo ruim");
  assert.equal(d2.estado.alertado, false, "estado volta ao zero");
});

test("⚠️⚠️ NÃO avisa 'voltou' de queda que ninguém soube", () => {
  // 2 falhas (sem alerta) e volta: mandar "o sistema voltou" sobre um
  // incidente que nunca foi comunicado só confunde quem lê.
  const r = rodar(2, false, false);
  const d1 = avaliarCiclo(r.estado, ciclo(true, true));
  const d2 = avaliarCiclo(d1.estado, ciclo(true, true));
  assert.equal(d2.recuperou, false);
});

test("⚠️⚠️ o cruzamento das sondas dá o diagnóstico", () => {
  const d = (b: boolean, a: boolean) => avaliarCiclo(estadoInicial, ciclo(b, a)).diagnostico;
  assert.equal(d(false, false), "banco_fora");        // o caso de 02/09
  assert.equal(d(true, false), "app_fora_banco_ok");  // Vercel/Cloudflare
  assert.equal(d(false, true), "sonda_suspeita");     // provavelmente eu
  assert.equal(d(true, true), "ok");
});

test("⚠️ o alerta de banco fora traz o RUNBOOK, não só o susto", () => {
  const d = avaliarCiclo({ ...estadoInicial, falhasSeguidas: 2 }, ciclo(false, false));
  const t = textoAlerta(d, "https://supabase.com/dashboard/project/X");
  assert.match(t.assunto, /BANCO NÃO RESPONDE/);
  assert.match(t.corpo, /Restart project/);
  assert.match(t.corpo, /supabase\.com/);
});

test("⚠️ app fora com banco vivo manda NÃO reiniciar o banco", () => {
  const d = avaliarCiclo({ ...estadoInicial, falhasSeguidas: 2 }, ciclo(true, false));
  const t = textoAlerta(d, "x");
  assert.match(t.corpo, /NÃO reinicie o banco/);
});
