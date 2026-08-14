import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";

// Tools READ-ONLY do agente cyber. Nenhuma escreve no banco.
// Retornos SEM PII: ids (uuid) + contagens + datas — nunca nomes/CPFs/e-mails.

function ok(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function fail(msg: string) {
  return {
    content: [{ type: "text" as const, text: `ERRO: ${msg}` }],
    isError: true,
  };
}

export function createCyberReadTools() {
  const auditarSuperAdmins = tool(
    "auditar_super_admins",
    "Lista os super-admins cadastrados (app_super_admins) e se estão ativos. Pode incluir notas e e-mail (só admin lê o resultado; não repetir em achado).",
    {},
    async () => {
      try {
        const { data, error } = await supabase
          .from("app_super_admins")
          .select("id, email, nome, ativo, created_at, added_by")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw new Error(error.message);
        return ok({ total: (data || []).length, ativos: (data || []).filter((a) => a.ativo).length, lista: data || [] });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const auditarAuditSensivel = tool(
    "auditar_audit_sensivel",
    "Mudancas recentes (app_audit_log) em dados sensiveis: CPF/salario (rh_funcionarios, mem_membros), matriz de permissoes (cargo_modulo_permissao) e super-admins. Retorna quem/qual tabela/quando. NAO repetir dados pessoais em achados.",
    {
      dias: z.number().int().min(1).max(60).default(14).describe("janela em dias"),
      limite: z.number().int().min(1).max(100).default(50),
    },
    async ({ dias, limite }) => {
      try {
        const desde = new Date(Date.now() - dias * 86400000).toISOString();
        const { data, error } = await supabase
          .from("app_audit_log")
          .select("id, table_name, action, user_email, created_at, changes")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(limite);
        if (error) throw new Error(error.message);
        const resumo = (data || []).map((r) => ({
          id: r.id,
          tabela: r.table_name,
          acao: r.action,
          usuario: r.user_email,
          quando: r.created_at,
          campos: Object.keys(r.changes || {}),
        }));
        return ok({ janela_dias: dias, total: resumo.length, resumo });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const auditarSoftDeletados = tool(
    "auditar_soft_deletados",
    "Soft-deletes recentes (deleted_at) em tabelas com PII nos ultimos 30 dias. Retorna apenas id + quando, sem nomes/CPFs.",
    { limite: z.number().int().min(1).max(100).default(50) },
    async ({ limite }) => {
      try {
        const desde = new Date(Date.now() - 30 * 86400000).toISOString();
        const tabelas = ["mem_membros", "rh_funcionarios", "cultos_decisoes_pessoas", "mem_contribuicoes", "kids_criancas"];
        const resultado: Record<string, { total: number; amostra: Array<{ id: string; deleted_at: string }> }> = {};
        for (const t of tabelas) {
          const { data, error } = await supabase
            .from(t)
            .select("id, deleted_at")
            .not("deleted_at", "is", null)
            .gte("deleted_at", desde)
            .order("deleted_at", { ascending: false })
            .limit(limite);
          if (error) {
            resultado[t] = { total: -1, amostra: [] }; // tabela/coluna pode não existir
            continue;
          }
          resultado[t] = {
            total: (data || []).length,
            amostra: (data || []).map((r) => ({ id: r.id, deleted_at: r.deleted_at })),
          };
        }
        return ok({ janela: "30d", por_tabela: resultado });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const auditarEstadoAgentes = tool(
    "auditar_estado_agentes",
    "Saude operacional dos agentes: runs recentes que falharam e fila de aprovacao (agent_queue) parada em pending/aguardando.",
    { limite: z.number().int().min(1).max(50).default(20) },
    async ({ limite }) => {
      try {
        const [runs, fila] = await Promise.all([
          supabase
            .from("agent_runs")
            .select("id, agent_type, status, error, completed_at")
            .eq("status", "failed")
            .order("created_at", { ascending: false })
            .limit(limite),
          supabase
            .from("agent_queue")
            .select("id, action_type, status, created_at")
            .in("status", ["pending", "processing"])
            .order("created_at", { ascending: false })
            .limit(limite),
        ]);
        return ok({
          runs_falharam_recentes: (runs.data || []).map((r) => ({ id: r.id, agente: r.agent_type, quando: r.completed_at, erro: (r.error || "").slice(0, 200) })),
          fila_pendente_total: (fila.data || []).length,
          fila_amostra: (fila.data || []).map((r) => ({ id: r.id, tipo: r.action_type, status: r.status, criada_em: r.created_at })),
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [auditarSuperAdmins, auditarAuditSensivel, auditarSoftDeletados, auditarEstadoAgentes];
  return {
    tools,
    toolNames: tools.map((t) => `mcp__cyber__${t.name}`),
  };
}
