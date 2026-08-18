import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolverCaminho, validarCaminhoCorrecao } from "./devFiles.js";

test("allowlist da Etapa 3 aceita somente codigo de baixo risco", () => {
  assert.equal(validarCaminhoCorrecao("backend/services/cadastros.js"), "backend/services/cadastros.js");
  assert.equal(validarCaminhoCorrecao("src/components/Cadastro.jsx"), "src/components/Cadastro.jsx");
  assert.throws(() => validarCaminhoCorrecao("supabase/migrations/20260818.sql"), /fora do escopo/);
  assert.throws(() => validarCaminhoCorrecao("backend/middleware/auth.js"), /(protegido|fora do escopo)/);
  assert.throws(() => validarCaminhoCorrecao("backend/services/pagamentos/pix.js"), /protegido/);
  assert.throws(() => validarCaminhoCorrecao("backend/services/systemIncidentTriage.js"), /protegido/);
  assert.throws(() => validarCaminhoCorrecao("src/../supabase/migrations/bypass.sql"), /fora do escopo/);
  assert.throws(() => validarCaminhoCorrecao("backend/services/financeService.js"), /protegido/);
});

test("resolver bloqueia traversal e link simbolico para fora do workspace", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "cbrio-devfiles-test-"));
  const workspace = path.join(raiz, "workspace");
  const externo = path.join(raiz, "externo");
  fs.mkdirSync(workspace);
  fs.mkdirSync(externo);
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));

  assert.throws(() => resolverCaminho(workspace, "../externo/segredo.txt"), /fora do workspace/);
  try {
    fs.symlinkSync(externo, path.join(workspace, "atalho"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    t.skip(`ambiente sem permissao para symlink: ${(error as Error).message}`);
    return;
  }
  assert.throws(() => resolverCaminho(workspace, "atalho/segredo.txt"), /link simbolico/);
});
