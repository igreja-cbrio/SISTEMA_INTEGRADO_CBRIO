import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

// Tools de arquivo do Agente Dev sobre o workspace (clone do repositório).
// Regras duras:
// - Todo caminho é RELATIVO ao workspace e é resolvido/validado aqui (path
//   traversal bloqueado).
// - Proibido ler/escrever arquivos de segredo (.env*, segredos conhecidos).
// - Limites de tamanho (read/write) para o modelo não estourar a janela.
// - Cada arquivo tocado é rastreado → o runner roda a validação G1 em cima
//   (node --check + varredura de segredo no diff).

const MAX_READ_BYTES = 300_000;
const MAX_WRITE_BYTES = 500_000;

const DENY_NAME = /^\.env($|\.)/;
const DENY_PART = /(^|\/)(\.git)(\/|$)/;

function ok(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(msg: string) {
  return {
    content: [{ type: "text" as const, text: `ERRO: ${msg}` }],
    isError: true,
  };
}

export function resolverCaminho(workspaceDir: string, rel: string): string {
  const base = path.resolve(workspaceDir);
  const alvo = path.resolve(base, rel);
  if (alvo !== base && !alvo.startsWith(base + path.sep)) {
    throw new Error(`caminho fora do workspace: ${rel}`);
  }
  if (DENY_PART.test(alvo.slice(base.length)) || DENY_PART.test(alvo)) {
    throw new Error(`acesso a .git não permitido: ${rel}`);
  }
  if (DENY_NAME.test(path.basename(alvo))) {
    throw new Error(`arquivo de segredo não pode ser lido/escrito: ${rel}`);
  }
  return alvo;
}

export function createDevFileTools(workspaceDir: string) {
  const tocados = new Set<string>();

  const lerArquivo = tool(
    "dev_ler_arquivo",
    "Lê um arquivo do repositório (caminho relativo ao workspace, ex: backend/routes/x.js). Máximo ~300KB. Use para entender o código antes de editar.",
    { caminho: z.string().min(1).max(500) },
    async ({ caminho }) => {
      try {
        const alvo = resolverCaminho(workspaceDir, caminho);
        const stat = fs.statSync(alvo);
        if (!stat.isFile()) return fail(`não é um arquivo: ${caminho}`);
        if (stat.size > MAX_READ_BYTES) {
          return fail(`arquivo grande demais para ler inteiro (${stat.size} bytes). Leia trechos específicos ou outro arquivo.`);
        }
        const conteudo = fs.readFileSync(alvo, "utf8");
        return ok({ caminho: path.relative(workspaceDir, alvo), bytes: stat.size, conteudo });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const escreverArquivo = tool(
    "dev_escrever_arquivo",
    "Cria ou SOBRESCREVE um arquivo do repositório (caminho relativo). Cria diretórios pai se preciso. Use para arquivos novos ou reescrita total.",
    { caminho: z.string().min(1).max(500), conteudo: z.string().max(MAX_WRITE_BYTES) },
    async ({ caminho, conteudo }) => {
      try {
        const alvo = resolverCaminho(workspaceDir, caminho);
        if (Buffer.byteLength(conteudo, "utf8") > MAX_WRITE_BYTES) {
          return fail(`conteúdo grande demais (limite ${MAX_WRITE_BYTES} bytes)`);
        }
        fs.mkdirSync(path.dirname(alvo), { recursive: true });
        fs.writeFileSync(alvo, conteudo, "utf8");
        tocados.add(path.relative(workspaceDir, alvo));
        return ok({ caminho: path.relative(workspaceDir, alvo), gravado: true, bytes: Buffer.byteLength(conteudo, "utf8") });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const editarArquivo = tool(
    "dev_editar_arquivo",
    "Edita um arquivo substituindo EXATAMENTE uma ocorrência de um trecho por outro. Se o trecho antigo aparecer mais de uma vez, falha (use contexto maior).",
    {
      caminho: z.string().min(1).max(500),
      antigo: z.string().min(1).describe("Trecho exato a substituir (deve aparecer exatamente 1 vez)"),
      novo: z.string().max(MAX_WRITE_BYTES).describe("Trecho novo"),
    },
    async ({ caminho, antigo, novo }) => {
      try {
        const alvo = resolverCaminho(workspaceDir, caminho);
        const original = fs.readFileSync(alvo, "utf8");
        const ocorrencias = original.split(antigo).length - 1;
        if (ocorrencias === 0) return fail(`trecho antigo não encontrado em ${caminho}`);
        if (ocorrencias > 1) {
          return fail(`trecho antigo aparece ${ocorrencias} vezes em ${caminho} — inclua mais contexto para ser único`);
        }
        const novoConteudo = original.replace(antigo, novo);
        fs.writeFileSync(alvo, novoConteudo, "utf8");
        tocados.add(path.relative(workspaceDir, alvo));
        return ok({ caminho: path.relative(workspaceDir, alvo), editado: true });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const listarDiretorio = tool(
    "dev_listar_diretorio",
    "Lista arquivos e pastas de um diretório do repositório (caminho relativo, ex: backend/routes). Use para navegar antes de editar.",
    { caminho: z.string().min(1).max(500).default(".").describe("Diretório relativo ('.' = raiz do repo)") },
    async ({ caminho }) => {
      try {
        const alvo = resolverCaminho(workspaceDir, caminho);
        const entries = fs.readdirSync(alvo, { withFileTypes: true });
        const lista = entries
          .map((e) => ({ nome: e.name, tipo: e.isDirectory() ? "dir" : "arquivo" }))
          .sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === "dir" ? -1 : 1));
        return ok({ caminho: path.relative(workspaceDir, alvo), total: lista.length, lista });
      } catch (e) {
        return fail((e as Error).message);
      }
    }
  );

  const tools = [lerArquivo, escreverArquivo, editarArquivo, listarDiretorio];
  return {
    tools,
    toolNames: tools.map((t) => `mcp__dev__${t.name}`),
    getTocados: (): string[] => Array.from(tocados),
  };
}
