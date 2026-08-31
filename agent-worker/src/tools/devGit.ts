import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Camada git + GitHub REST do Agente Dev. USO RESTRITO AO RUNNER — não são
// expostas ao LLM (o modelo só lê/escreve arquivos; a orquestração git fica
// aqui, determinística).
//
// Regras duras:
// - Branch SEMPRE `Codex/<desc>` (push pra main é bloqueado por construção).
// - Nunca force-push/reset em branch remota. Nunca mergeia PR (humano).
// - Token só aparece no clone/push (URL com credencial embutida) e é removido
//   do remote após o uso; o env do execFile é sanitizado (sem segredos).
// - WORKSPACE_ROOT é controlado pelo worker (default /tmp) — só rm dentro dele.

const REPO = process.env.GITHUB_REPO || "igreja-cbrio/SISTEMA_INTEGRADO_CBRIO";
const CLEAN_URL = `https://github.com/${REPO}.git`;
export const WORKSPACE_ROOT =
  process.env.DEV_WORKSPACE_DIR || path.join(os.tmpdir(), "cbrio-dev-workspace");

function token(): string {
  return process.env.GITHUB_TOKEN || "";
}

function tokenUrl(): string {
  return `https://x-access-token:${token()}@github.com/${REPO}.git`;
}

const SAFE_ENV: Record<string, string> = {
  PATH: process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin",
  HOME: process.env.HOME || "/tmp",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_ASKPASS: "true", // nunca pedir credencial interativa
};

export function git(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; maxOutputBytes?: number } = {}
): Promise<{ code: number | string; stdout: string; stderr: string; motivo: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: opts.cwd,
        env: SAFE_ENV,
        timeout: opts.timeoutMs || 120_000,
        maxBuffer: opts.maxOutputBytes || 10 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
        resolve({
          code: e ? e.code ?? 1 : 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          // ⚠️⚠️ `motivo` existe por causa de um incidente REAL (31/08): a
          // primeira execução de verdade do agente falhou 3× com a mensagem
          // `"clone falhou: "` — VAZIA. Quando o binário não existe, `execFile`
          // devolve `err.code = 'ENOENT'` e **stderr vazio**, então quem só olha
          // o stderr fica sem causa nenhuma. Reproduzido byte a byte:
          // `spawn git ENOENT` com stderr "".
          motivo: e ? String(e.message || `git terminou com código ${e.code}`) : "",
        });
      }
    );
  });
}

async function gh<T = unknown>(
  method: string,
  pathname: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${(data as { message?: string }).message || "erro"}`);
  }
  return data;
}

// ─── clone / branch ──────────────────────────────────────────────────────────

/**
 * Descreve a falha de um comando git de forma UTILIZÁVEL.
 *
 * ⚠️ stderr primeiro (é onde o git escreve o motivo real), e o `motivo` do
 * processo como rede — porque existe um caso em que o stderr é vazio: o binário
 * não existir. Sem isso, a mensagem chega como "clone falhou: " e ninguém
 * descobre nada (foi o que aconteceu em 31/08).
 */
function descreverFalhaGit(r: { code: number | string; stderr: string; motivo: string }): string {
  const stderr = r.stderr.trim();
  if (stderr) return stderr.slice(0, 500);
  if (r.code === "ENOENT") {
    return 'o binário `git` NÃO existe no container do worker (spawn ENOENT). '
      + 'Instalar no Railway: `agent-worker/nixpacks.toml` com git em [phases.setup].';
  }
  return `${r.motivo || 'sem stderr'} (code=${r.code})`;
}

/**
 * O `git` está utilizável neste container?
 *
 * ⚠️⚠️ Existe pra ser chamado ANTES de reservar a tarefa. Em 31/08 a primeira
 * execução real gastou 3 tarefas do board (todas marcadas `falhou`) por uma
 * dependência de AMBIENTE ausente — e `falhou` na aba se lê como "o agente
 * tentou e não conseguiu consertar", que é uma afirmação errada sobre o código.
 */
export async function gitDisponivel(): Promise<{ ok: boolean; motivo?: string; versao?: string }> {
  const r = await git(["--version"], { timeoutMs: 15_000 });
  if (r.code === 0) return { ok: true, versao: r.stdout.trim() };
  return { ok: false, motivo: descreverFalhaGit(r) };
}

export async function prepararWorkspace(branch: string): Promise<string> {
  const ws = path.join(WORKSPACE_ROOT, branch.replace(/[^A-Za-z0-9-_]/g, "-"));
  const guard = path.resolve(WORKSPACE_ROOT) + path.sep;
  if (!path.resolve(ws).startsWith(guard)) {
    throw new Error(`workspace fora de DEV_WORKSPACE_DIR: ${ws}`);
  }
  fs.rmSync(ws, { recursive: true, force: true });

  const r = await git(["clone", "--depth", "1", "--single-branch", "--branch", "main", tokenUrl(), ws], {
    timeoutMs: 180_000,
  });
  if (r.code !== 0) throw new Error(`clone falhou: ${descreverFalhaGit(r)}`);

  // remove a credencial do remote (o token não pode ficar no .git/config)
  const scrub = await git(["remote", "set-url", "origin", CLEAN_URL], { cwd: ws });
  if (scrub.code !== 0) throw new Error(`falha limpando remote: ${descreverFalhaGit(scrub)}`);

  const b = await git(["switch", "-c", branch], { cwd: ws });
  if (b.code !== 0) throw new Error(`criar branch falhou: ${descreverFalhaGit(b)}`);

  return ws;
}

// ─── diff / validação G1 ─────────────────────────────────────────────────────

export async function diffNomeArquivos(ws: string): Promise<string[]> {
  const r = await git(["diff", "--cached", "--name-only", "-z"], { cwd: ws });
  if (r.code !== 0) throw new Error(`diff falhou: ${descreverFalhaGit(r)}`);
  return r.stdout.split("\0").filter(Boolean);
}

export async function prepararDiff(ws: string): Promise<void> {
  const add = await git(["add", "-A"], { cwd: ws });
  if (add.code !== 0) throw new Error(`git add falhou: ${descreverFalhaGit(add)}`);
}

export async function diffConteudo(ws: string): Promise<string> {
  const r = await git(["diff", "--cached"], { cwd: ws, maxOutputBytes: 20 * 1024 * 1024 });
  return r.stdout || "";
}

// ─── commit / push / PR ──────────────────────────────────────────────────────

export async function commitar(ws: string, msg: string): Promise<void> {
  const add = await git(["add", "-A"], { cwd: ws });
  if (add.code !== 0) throw new Error(`git add falhou: ${descreverFalhaGit(add)}`);
  const r = await git(
    [
      "-c", "user.name=Agente Dev CBRio",
      "-c", "user.email=dev-agente@cbrio.local",
      "commit", "-m", msg,
    ],
    { cwd: ws }
  );
  if (r.code !== 0) {
    // ⚠️ O git escreve "nothing to commit" no STDOUT, não no stderr — testar só
    // o stderr fazia este ramo nunca casar, e a mensagem saía como
    // "commit falhou: " VAZIA (a mesma classe do `clone falhou:` de 31/08).
    const nada = /nothing to commit|no changes added/i.test(`${r.stdout}\n${r.stderr}`);
    throw new Error(nada ? "nenhuma alteração para commitar" : `commit falhou: ${descreverFalhaGit(r)}`);
  }
}

export async function push(ws: string, branch: string): Promise<void> {
  const setUrl = await git(["remote", "set-url", "origin", tokenUrl()], { cwd: ws });
  if (setUrl.code !== 0) throw new Error(`set-url falhou: ${descreverFalhaGit(setUrl)}`);
  try {
    const r = await git(["push", "-u", "origin", branch], { cwd: ws, timeoutMs: 180_000 });
    if (r.code !== 0) throw new Error(`push falhou: ${descreverFalhaGit(r)}`);
  } finally {
    await git(["remote", "set-url", "origin", CLEAN_URL], { cwd: ws });
  }
}

export async function abrirPr(opts: {
  head: string;
  title: string;
  body: string;
}): Promise<{ url: string; number: number }> {
  const data = await gh<{ html_url: string; number: number }>("POST", `/repos/${REPO}/pulls`, {
    title: opts.title.slice(0, 70),
    head: opts.head,
    base: "main",
    body: opts.body,
  });
  return { url: data.html_url, number: data.number };
}

// Mergea o PR (squash) na main. ⚠️ FLUXO DE BUG (decisão do Marcos 2026-08-14):
// no fluxo de bug APROVADO o agente mergea o próprio PR após o CI verde — isto
// sobrescreve a regra geral "nunca mergeia PR (humano)". Fora do fluxo de bug,
// a regra geral segue valendo. O merge dispara o deploy automático do Vercel.
export async function mergearPr(prNumber: number): Promise<{ merged: boolean; sha?: string }> {
  const data = await gh<{ merged: boolean; sha?: string }>("PUT", `/repos/${REPO}/pulls/${prNumber}/merge`, {
    merge_method: "squash",
  });
  if (!data.merged) throw new Error("merge do PR não foi aceito pelo GitHub");
  return data;
}

interface WorkflowRun {
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
}

// Aguarda o CI do PR (workflows de Actions do head commit) terminar.
// ⚠️ Usa a Actions API, NÃO a Checks API: tokens fine-grained NÃO têm a
// permissão "Checks" (limitação documentada do GitHub — só GitHub App). O
// `qualidade` é um workflow de Actions, então Actions:read cobre o gate G2.
// Retorna o veredito:
// - "ok": todos os workflows do commit concluíram sem falha
// - "falhas": houve falha (com contagem) — a 3ª falha consecutiva do CI
//   vira `bloqueada` no board (regra do skill dev/AGENTS.md)
// - "timeout": não terminou a tempo
export async function aguardarChecks(
  prNumber: number,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ veredito: "ok" | "falhas" | "timeout"; falhas: number; checados: string[] }> {
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 15_000;
  const fim = Date.now() + timeoutMs;
  let checados: string[] = [];

  // head sha do PR (pra filtrar só os runs deste commit)
  const pr = await gh<{ head: { sha: string } }>("GET", `/repos/${REPO}/pulls/${prNumber}`);
  const sha = pr.head.sha;

  while (Date.now() < fim) {
    const data = await gh<{ workflow_runs: WorkflowRun[] }>(
      "GET",
      `/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=50`
    );
    const runs = (data.workflow_runs || []).filter((r) => r.head_sha === sha);
    checados = runs.map((r) => r.name);

    // sem run ainda — o workflow pode levar alguns segundos pra ser criado
    if (!runs.length) {
      await sleep(intervalMs);
      continue;
    }

    const pendentes = runs.filter((r) => r.status !== "completed");
    if (pendentes.length === 0) {
      const falhas = runs.filter(
        (r) => r.conclusion === "failure" || r.conclusion === "cancelled" || r.conclusion === "timed_out"
      ).length;
      return { veredito: falhas > 0 ? "falhas" : "ok", falhas, checados };
    }
    await sleep(intervalMs);
  }

  return { veredito: "timeout", falhas: 0, checados };
}

// ─── utilidades ──────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Slug seguro pra branch `Codex/<slug>` (sem acento/espaco, max 40 chars).
export function slugDaTarefa(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = (base || "tarefa").slice(0, 40).replace(/-+$/g, "");
  return slug || "tarefa";
}
