import { query } from "@anthropic-ai/claude-agent-sdk";
import { supabase } from "../supabase.js";

// ============================================================================
// pilotoTriageWatcher · Onda 0 · parte 2 (2026-06-09)
//
// 1x/dia: lê o feedback dos testadores (app_feedback) + os erros 500 do backend
// (app_erros_servidor) das últimas 24h, agrupa os erros em código, e faz UMA
// chamada Haiku pra sintetizar um RELATÓRIO ranqueado por impacto. Grava o
// relatório em agent_runs.summary e PINGA os admins (notificacoes) com o link
// pro /admin/feedback. Sem tool-loop · síntese de uma tacada (barato).
// ============================================================================

const AGENT_TYPE = "piloto_triage_watcher";
const MODEL = process.env.PILOTO_MODEL || "claude-haiku-4-5-20251001";
const MAX_TURNS = 1;

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
};
function cost(m: string, ti: number, to: number) {
  const p = PRICING[m] || PRICING["claude-haiku-4-5-20251001"];
  return (ti * p.input + to * p.output) / 1_000_000;
}

// Normaliza a mensagem de erro pra agrupar variações (ids/números viram #).
function normalizar(msg: string | null): string {
  return (msg || "")
    .toLowerCase()
    .replace(/[a-f0-9]{8}-[a-f0-9-]{20,}/g, "#id")
    .replace(/\d+/g, "#")
    .slice(0, 120);
}

const SYSTEM = `Você é o analista de qualidade do PILOTO de um ERP de igreja (CBRio). Recebe, em JSON, o feedback que os testadores mandaram pelo botão "Reportar" + os erros 500 do backend das últimas 24h (já agrupados). Escreva um RELATÓRIO curto em português do Brasil (markdown), direto e acionável, para o Marcos (dev/gestor).

Estrutura:
- 1 linha de resumo (quantos reportes, quantos erros, e o tom geral do dia).
- "## Top problemas" · no máximo 5, ranqueados por IMPACTO (frequência × severidade × nº de pessoas atingidas). Para cada: o que é · onde (rota) · causa provável · e a AÇÃO recomendada em 1 linha.
- "## Da boca dos testadores" · agrupe as confusões e ideias úteis em bullets curtos.

Regras: seja honesto — se o dia foi tranquilo, diga isso e não infle. NÃO invente causa que os dados não suportam (no máximo "provável"). Não repita e-mails/PII além do necessário. Seja conciso: o Marcos lê isto no celular.`;

async function pingAdmins(titulo: string, mensagem: string, severidade: string) {
  // Destinatários: regras do módulo 'piloto' ou fallback admin/diretor (espelha notificar.js)
  const { data: regras } = await supabase
    .from("notificacao_regras")
    .select("profile_id")
    .eq("modulo", "piloto")
    .eq("ativo", true);
  let alvos: string[] = (regras || []).map((r: any) => r.profile_id).filter(Boolean);
  if (!alvos.length) {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "diretor"]);
    alvos = (admins || []).map((a: any) => a.id).filter(Boolean);
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const chaveDedup = `piloto_relatorio_${hoje}`;
  let pinged = 0;
  for (const uid of alvos) {
    const { count } = await supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", uid)
      .eq("chave_dedup", chaveDedup);
    if ((count || 0) > 0) continue; // já avisado hoje
    const { error } = await supabase.from("notificacoes").insert({
      usuario_id: uid,
      titulo,
      mensagem,
      tipo: "piloto_relatorio",
      link: "/admin/feedback",
      modulo: "piloto",
      severidade,
      chave_dedup: chaveDedup,
      lida: false,
    });
    if (!error) pinged++;
  }
  return pinged;
}

export async function runPilotoTriageWatcher(
  opts: { triggeredBy?: string | null; config?: Record<string, unknown> } = {}
) {
  const { triggeredBy, config = {} } = opts;
  const { data: run, error: e0 } = await supabase
    .from("agent_runs")
    .insert({ agent_type: AGENT_TYPE, status: "running", triggered_by: triggeredBy || null, config: { ...config, model: MODEL } })
    .select("id")
    .single();
  if (e0) throw new Error(e0.message);
  const runId = run.id;
  let ti = 0, to = 0, summary = "";

  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: fb }, { data: errs }] = await Promise.all([
      supabase.from("app_feedback")
        .select("tipo, severidade, mensagem, rota, user_email, status, created_at")
        .gte("created_at", desde).order("created_at", { ascending: false }).limit(200),
      supabase.from("app_erros_servidor")
        .select("metodo, rota, mensagem, status, user_email, created_at")
        .gte("created_at", desde).order("created_at", { ascending: false }).limit(500),
    ]);
    const feedbacks = fb || [];
    const erros = errs || [];

    // Agrupa erros por rota + mensagem normalizada (conta ocorrências e usuários)
    const clusters = new Map<string, { metodo: string; rota: string; exemplo: string; count: number; usuarios: Set<string> }>();
    for (const e of erros as any[]) {
      const k = `${e.metodo} ${e.rota} :: ${normalizar(e.mensagem)}`;
      if (!clusters.has(k)) clusters.set(k, { metodo: e.metodo, rota: e.rota, exemplo: e.mensagem, count: 0, usuarios: new Set() });
      const c = clusters.get(k)!;
      c.count++;
      if (e.user_email) c.usuarios.add(e.user_email);
    }
    const errosTop = [...clusters.values()]
      .map((c) => ({ metodo: c.metodo, rota: c.rota, exemplo: (c.exemplo || "").slice(0, 200), ocorrencias: c.count, usuarios_atingidos: c.usuarios.size }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias)
      .slice(0, 15);

    const criticos = feedbacks.filter((f: any) => f.severidade === "critica").length;

    // Dia tranquilo → registra e não pinga (evita ruído)
    if (feedbacks.length === 0 && erros.length === 0) {
      summary = "Dia tranquilo no piloto: 0 reportes e 0 erros nas últimas 24h. 🎉";
      await supabase.from("agent_runs").update({ status: "completed", summary, actions_taken: { feedbacks: 0, erros: 0, pinged: 0 }, tokens_input: 0, tokens_output: 0, cost_usd: 0, completed_at: new Date().toISOString() }).eq("id", runId);
      return { runId, status: "completed" as const, summary, cost_usd: 0, tokens_input: 0, tokens_output: 0 };
    }

    const payload = {
      totais: { feedbacks: feedbacks.length, criticos, erros: erros.length, tipos_de_erro: clusters.size },
      feedbacks: (feedbacks as any[]).map((f) => ({ tipo: f.tipo, severidade: f.severidade, rota: f.rota, mensagem: f.mensagem, quem: f.user_email })),
      erros_agrupados: errosTop,
    };

    const stream = query({
      prompt: `Dados das últimas 24h (JSON):\n\n${JSON.stringify(payload).slice(0, 28000)}`,
      options: { model: MODEL, systemPrompt: SYSTEM, maxTurns: MAX_TURNS, allowedTools: [], permissionMode: "default" },
    });

    const partes: string[] = [];
    let resultText = "";
    for await (const msg of stream as any) {
      if (msg.type === "assistant" && msg.message?.content) {
        const u = msg.message.usage; ti += u?.input_tokens || 0; to += u?.output_tokens || 0;
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        for (const b of blocks) if (b.type === "text" && b.text) partes.push(b.text);
      }
      if (msg.type === "result") resultText = (msg.result || msg.message || "") as string;
    }
    summary = (resultText || partes.join("\n")).trim() || "Relatório vazio (sem texto do modelo).";

    // Headline curto pro ping
    const headline = `${feedbacks.length} reporte(s)${criticos ? ` · ${criticos} crítico(s)` : ""} · ${erros.length} erro(s) 500 nas últimas 24h.`;
    const severidade = criticos > 0 || erros.length >= 10 ? "alta" : "info";
    const pinged = await pingAdmins(`Relatório do piloto · ${headline.split(" · ")[0]}`, headline, severidade);

    const c = cost(MODEL, ti, to);
    await supabase.from("agent_runs").update({
      status: "completed",
      summary: summary.slice(0, 20000),
      actions_taken: { feedbacks: feedbacks.length, criticos, erros: erros.length, clusters: clusters.size, pinged },
      tokens_input: ti, tokens_output: to, cost_usd: c, completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return { runId, status: "completed" as const, summary, cost_usd: c, tokens_input: ti, tokens_output: to };
  } catch (err) {
    const e = (err as Error).message || String(err);
    await supabase.from("agent_runs").update({ status: "failed", error: e, summary, completed_at: new Date().toISOString() }).eq("id", runId);
    return { runId, status: "failed" as const, summary, error: e, cost_usd: cost(MODEL, ti, to), tokens_input: ti, tokens_output: to };
  }
}
