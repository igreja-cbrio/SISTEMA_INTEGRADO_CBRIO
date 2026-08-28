import { supabase } from "./supabase.js";

// Fase 0 · Time de agentes — job description versionada.
// Carrega a versão ATIVA de agent_instrucoes do membro e monta o bloco
// "[JOB DESCRIPTION]" que é anexado ao systemPrompt, DEPOIS do SKILL.md
// (regras duras sempre vêm antes e nunca são sobrescritas).
// Se não houver instrução (fallback), retorna "" — nunca quebra a execução.

export async function loadInstrucoes(agentKey: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("agent_instrucoes")
      .select("raw_instrucoes, estruturado, versao")
      .eq("agent_key", agentKey)
      .eq("ativo", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!data) return "";
    const e = (data.estruturado || {}) as {
      titulo_cargo?: string;
      descricao?: string;
      responsabilidades?: string[];
      permitido?: string[];
      proibido?: string[];
    };

    const partes: string[] = [];
    if (e.titulo_cargo) partes.push(`Cargo: ${e.titulo_cargo}`);
    if (e.descricao) partes.push(e.descricao);
    if (Array.isArray(e.responsabilidades) && e.responsabilidades.length) {
      partes.push(`Responsabilidades:\n${e.responsabilidades.map((x) => `- ${x}`).join("\n")}`);
    }
    if (Array.isArray(e.permitido) && e.permitido.length) {
      partes.push(`O que pode fazer:\n${e.permitido.map((x) => `- ${x}`).join("\n")}`);
    }
    if (Array.isArray(e.proibido) && e.proibido.length) {
      partes.push(`O que NAO pode fazer:\n${e.proibido.map((x) => `- ${x}`).join("\n")}`);
    }
    if (data.raw_instrucoes) {
      partes.push(`Instrucoes originais (texto livre do gestor):\n${data.raw_instrucoes}`);
    }
    if (!partes.length) return "";
    return `[JOB DESCRIPTION · v${data.versao}]\n${partes.join("\n\n")}\n[/JOB DESCRIPTION]`;
  } catch (e) {
    console.warn(`[instrucoes] falha carregando job description de ${agentKey}:`, (e as Error).message);
    return "";
  }
}

// Monta o systemPrompt final: regras duras (SKILL.md) + job description do banco.
// Nunca falha: se qualquer parte falhar, usa a que conseguiu carregar.
export async function montarSystemPrompt(agentKey: string, regrasDuras: string): Promise<string> {
  const jobDesc = await loadInstrucoes(agentKey);
  return [regrasDuras.trim(), jobDesc].filter(Boolean).join("\n\n");
}
