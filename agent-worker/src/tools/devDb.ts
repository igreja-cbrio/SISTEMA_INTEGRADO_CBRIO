import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// Aplicação de migrations de PRODUÇÃO pelo Agente Dev — USO RESTRITO ao runner
// (não é exposto ao LLM). Regra dura do fluxo de bug (decisão do Marcos
// 2026-08-14): no bug APROVADO o agente aplica as migrations novas no Supabase
// de prod ANTES do merge — nada pode mergear com schema quebrado no backend.
// Fail-closed: sem DATABASE_URL a função LANÇA (a execução da tarefa falha com
// aviso claro, em vez de mergear por cima de schema não migrado).

const DATABASE_URL = process.env.DATABASE_URL || "";

// Lista as migrations NOVAS desta branch (arquivos adicionados em
// supabase/migrations/ no diff vs main). A base de prod está sempre em main,
// então o conjunto correto a aplicar é exatamente este.
export function listarMigrationsNovas(ws: string, stdout: string): string[] {
  return stdout
    .split("\0")
    .filter(Boolean)
    .filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f) && fs.existsSync(path.join(ws, f)));
}

export async function aplicarMigrations(ws: string, arquivos: string[]): Promise<string[]> {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL ausente no worker — não é possível aplicar migrations de produção. " +
        "Configure DATABASE_URL no Railway (com permissão de escrita) e rode a tarefa de novo."
    );
  }
  if (!arquivos.length) return [];

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const aplicadas: string[] = [];
  try {
    await client.connect();
    for (const rel of arquivos) {
      const sql = fs.readFileSync(path.join(ws, rel), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        aplicadas.push(rel);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
  return aplicadas;
}
