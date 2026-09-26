// Contrato do gancho "cadê o link do meu grupo?" → aviso à LIDERANÇA
// (Matheus · 26/09/2026 · item 4). Régua pura em `backend/utils/pedidoLinkGrupo`
// + guardas ESTÁTICAS sobre os serviços (que carregam o Supabase e não entram no
// vitest). Os casos de "link" vêm do inbox real (31/08).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { semComentariosJs } from "./_semComentarios";
import {
  pedeLink, escolherGrupoParaLink, chaveDoDia, algumCanalSaiu,
  paramsTemplateLider, textoAvisoLider, respostaDoPedidoLink,
  DISPARO_ID, CONTEXTO, TEMPLATE_PADRAO,
} from "../../backend/utils/pedidoLinkGrupo.js";
import { assuntoDaMensagem } from "../../backend/utils/assuntoGrupoConversa.js";
import { montarRespostaLink } from "../../backend/utils/respostaGrupoAgenda.js";
import { ROTULOS, rotuloDoDisparo } from "../../backend/utils/whatsappOrigem.js";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const G_ONLINE = { id: "g1", nome: "ONLINE - Finanças na Ótica de Cristo", bairro: "Online", ativo: true, lider_id: "m-lider" };
const G_OUTRO = { id: "g2", nome: "ONLINE - MULHER ÚNICA", bairro: "Online", ativo: true, lider_id: "m-l2" };

describe("pedeLink · é pedido do link da SALA?", () => {
  it("os casos reais do inbox continuam sendo pedido", () => {
    expect(pedeLink("Boa tarde. Receberemos o link por aqui? Devo fazer contato com a líder do grupo?")).toBe(true);
    expect(pedeLink("Cadê o Link ?")).toBe(true);
    expect(pedeLink("Cadê o link da reunião?")).toBe(true);
    expect(pedeLink("Estou no aguardo do Link para entrar na Reunião amanhã 20:00 hs")).toBe(true);
  });

  it("⚠️⚠️ link de OUTRA coisa NÃO é pedido do link do grupo", () => {
    // Desde 26/09 o pedido dispara WhatsApp pra líder — "me manda o link do
    // pix" viraria uma líder mandando link de sala a quem pediu o pix.
    expect(pedeLink("me manda o link do pix")).toBe(false);
    expect(pedeLink("qual o link da live?")).toBe(false);
    expect(pedeLink("link de inscrição do next")).toBe(false);
    expect(pedeLink("vcs tem o link pra doação?")).toBe(false);
  });

  it("⚠️ tirar o link de outra coisa NÃO apaga o resto da mensagem", () => {
    // A pergunta de agenda no mesmo texto segue valendo pra sugestão do inbox.
    expect(assuntoDaMensagem("qual o link do pix? e que dia é o encontro?")).toBe("agenda");
  });

  it("quem já resolveu não pede", () => {
    expect(pedeLink("Opa, consegui o link de acesso ao grupo")).toBe(false);
  });
});

describe("escolherGrupoParaLink · de qual grupo é o link", () => {
  it("o VÍNCULO vence o pedido", () => {
    const r = escolherGrupoParaLink({ vinculos: { grupo: G_ONLINE, motivo: "vinculo" }, pedidos: [G_OUTRO] });
    expect(r).toEqual({ grupo: G_ONLINE, origem: "vinculo" });
  });

  it("⚠️⚠️ o GAP: sem vínculo, UM pedido pendente/aprovado resolve", () => {
    const r = escolherGrupoParaLink({ vinculos: { grupo: null, motivo: "sem_grupo" }, pedidos: [G_OUTRO] });
    expect(r.grupo?.id).toBe("g2");
    expect(r.origem).toBe("pedido");
  });

  it("dois pedidos do MESMO grupo contam como um", () => {
    const r = escolherGrupoParaLink({ vinculos: { grupo: null, motivo: "sem_grupo" }, pedidos: [G_OUTRO, { ...G_OUTRO }] });
    expect(r.grupo?.id).toBe("g2");
  });

  it("⚠️ dois grupos diferentes nos pedidos ⇒ ambíguo, nunca 'o primeiro'", () => {
    const r = escolherGrupoParaLink({ vinculos: { grupo: null, motivo: "sem_grupo" }, pedidos: [G_ONLINE, G_OUTRO] });
    expect(r.grupo).toBe(null);
    expect(r.motivo).toBe("ambiguo");
  });

  it("⚠️ vínculo ambíguo ou ERRO não caem para os pedidos", () => {
    expect(escolherGrupoParaLink({ vinculos: { grupo: null, motivo: "ambiguo" }, pedidos: [G_OUTRO] }).grupo).toBe(null);
    expect(escolherGrupoParaLink({ vinculos: { grupo: null, motivo: "erro" }, pedidos: [G_OUTRO] }).grupo).toBe(null);
  });

  it("pedido de grupo inativo ou apagado não conta", () => {
    const r = escolherGrupoParaLink({
      vinculos: { grupo: null, motivo: "sem_grupo" },
      pedidos: [{ ...G_OUTRO, ativo: false }, { ...G_ONLINE, deleted_at: "2026-09-01" }],
    });
    expect(r.grupo).toBe(null);
    expect(r.motivo).toBe("sem_grupo");
  });

  it("sem cadastro nem pedido devolve o motivo certo", () => {
    expect(escolherGrupoParaLink({ vinculos: { grupo: null, motivo: "sem_cadastro" }, pedidos: [] }).motivo).toBe("sem_cadastro");
  });
});

describe("chaveDoDia · a dedup é por dia em BRT", () => {
  it("⚠️⚠️ 22h30 de sábado no Rio (01h30 UTC de domingo) ainda é SÁBADO", () => {
    // Em UTC o dia já virou — quem perguntasse às 20h e às 22h avisaria a líder
    // duas vezes no mesmo dia.
    const tzAntes = process.env.TZ;
    try {
      for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
        process.env.TZ = tz;
        expect(chaveDoDia(new Date("2026-09-27T01:30:00Z"))).toBe("2026-09-26");
        expect(chaveDoDia(new Date("2026-09-26T13:00:00Z"))).toBe("2026-09-26");
        expect(chaveDoDia(new Date("2026-09-27T03:00:00Z"))).toBe("2026-09-27");
      }
    } finally {
      if (tzAntes === undefined) delete process.env.TZ; else process.env.TZ = tzAntes;
    }
  });

  it("data inválida não vira 'NaN-NaN-NaN' na chave", () => {
    expect(chaveDoDia("lixo" as unknown as Date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("algumCanalSaiu · o que autoriza dizer 'já avisamos'", () => {
  it("só 'enviado' conta", () => {
    expect(algumCanalSaiu({ sino: "enviado" })).toBe(true);
    expect(algumCanalSaiu({ whatsapp: "enviado", app: "sem_destinatario" })).toBe(true);
  });

  it("⚠️⚠️ fila, sem destinatário e template não aprovado NÃO são aviso que saiu", () => {
    expect(algumCanalSaiu({ whatsapp: "na_fila" })).toBe(false);
    expect(algumCanalSaiu({ sino: "sem_destinatario", app: "sem_destinatario", whatsapp: "template_nao_aprovado" })).toBe(false);
    expect(algumCanalSaiu({})).toBe(false);
    expect(algumCanalSaiu(null)).toBe(false);
    expect(algumCanalSaiu("enviado")).toBe(false);
  });
});

describe("respostaDoPedidoLink · o texto que a PESSOA recebe", () => {
  const base = { conversaNome: "Ana Paula", grupo: G_ONLINE, liderNome: "Natasha Silva", liderTelefone: "" };

  it("com aviso que SAIU, diz que avisou a liderança", () => {
    const { texto } = respostaDoPedidoLink({ ...base, canais: { sino: "enviado" } });
    expect(texto).toContain("Já avisamos a liderança do grupo");
    expect(texto).toContain("Natasha vai entrar em contato");
  });

  it("⚠️⚠️ SEM aviso que saiu, NÃO afirma que avisou (a caixa verde do censo)", () => {
    const { texto } = respostaDoPedidoLink({ ...base, canais: { whatsapp: "na_fila", sino: "sem_destinatario" } });
    expect(texto).not.toMatch(/avisamos|repassado/i);
    expect(texto).toContain("O link do encontro é enviado pela liderança do grupo");
  });

  it("pedido repetido no mesmo dia diz que já foi repassado", () => {
    const { texto } = respostaDoPedidoLink({ ...base, canais: { app: "enviado" }, repetido: true });
    expect(texto).toContain("já foi repassado à liderança");
  });

  it("⚠️ nunca promete prazo nem entrega o link", () => {
    const { texto } = respostaDoPedidoLink({ ...base, canais: { sino: "enviado" } });
    expect(texto).not.toMatch(/\b(hoje|amanhã|em breve|logo)\b/i);
    expect(texto).not.toMatch(/https?:\/\//);
  });

  it("⚠️ truthy que não é `true` não vira promessa em montarRespostaLink", () => {
    const { texto } = montarRespostaLink({ nome: "Ana", grupoNome: "X", online: true, liderAvisada: "sim" as unknown as boolean });
    expect(texto).not.toMatch(/avisamos/i);
  });

  it("presencial nunca diz que avisou sobre link", () => {
    const { texto } = montarRespostaLink({ nome: "Ana", online: false, liderAvisada: true });
    expect(texto).not.toMatch(/avisamos/i);
  });
});

describe("template e aviso interno", () => {
  it("os 4 parâmetros, sem quebra de linha e com fallback (a Meta recusa vazio)", () => {
    const p = paramsTemplateLider({ liderNome: "Natasha Silva", pessoaNome: "Ana\nPaula", grupoNome: "ONLINE - X", pessoaTelefone: "5521987654321" });
    expect(p).toEqual(["Natasha", "Ana · Paula", "ONLINE - X", "(21) 98765-4321"]);
    const vazio = paramsTemplateLider({});
    expect(vazio).toHaveLength(4);
    for (const v of vazio) expect(String(v).trim().length).toBeGreaterThan(0);
  });

  it("o aviso interno leva quem pediu, o telefone da CONVERSA e o grupo", () => {
    const { titulo, mensagem } = textoAvisoLider({ pessoaNome: "Ana Paula", pessoaTelefone: "21987654321", grupoNome: "ONLINE - X" });
    expect(titulo).toBe("Pedido do link · ONLINE - X");
    expect(mensagem).toContain("Ana Paula, (21) 98765-4321, pediu");
    expect(mensagem).toContain('"ONLINE - X"');
  });

  it("ids fixos do disparo", () => {
    expect(DISPARO_ID).toBe("grupos_link_pedido");
    expect(CONTEXTO).toBe("grupos.link_pedido_lider");
    expect(TEMPLATE_PADRAO).toBe("grupos_link_pedido_lider");
  });

  it("o contexto da fila tem rótulo legível", () => {
    expect(ROTULOS.some(([c]: [string, string]) => c === CONTEXTO)).toBe(true);
    const r = rotuloDoDisparo(CONTEXTO);
    expect(r.conhecido).toBe(true);
    expect(r.rotulo).toMatch(/link/i);
    // ⚠️ O prefixo `grupos` manda a falha de entrega pro módulo certo.
    expect(r.modulo).toBe("grupos");
  });

  it("o catálogo de automáticos declara o id E o contexto (tríade do interruptor)", () => {
    const src = semComentariosJs(ler("backend/services/comunicacaoAutomaticas.js"));
    expect(src).toContain(`id: '${DISPARO_ID}'`);
    expect(src).toContain(`contexto: '${CONTEXTO}'`);
  });
});

// ── GUARDAS ESTÁTICAS ────────────────────────────────────────────────────────

/** Os arquivos NOVOS dos dois ganchos (o que o bot executa sozinho). */
const ARQUIVOS_NOVOS = [
  "backend/services/pedidoLinkGrupo.js",
  "backend/services/trocaGrupoWhatsapp.js",
  "backend/services/ganchosGrupoWhatsapp.js",
  "backend/services/grupoTransferencia.js",
  "backend/utils/pedidoLinkGrupo.js",
  "backend/utils/trocaGrupoConversa.js",
  "backend/utils/avisoTransferenciaGrupo.js",
];

describe("guardas do conselho (26/09)", () => {
  it("⚠️⚠️ NENHUM arquivo novo toca `mem_grupo_link` — o link da sala é credencial", () => {
    for (const f of ARQUIVOS_NOVOS) {
      expect(semComentariosJs(ler(f)), f).not.toMatch(/mem_grupo_link\b/);
    }
  });

  it("⚠️⚠️ NENHUM arquivo novo ESCREVE em `mem_grupo_membros`", () => {
    for (const f of ARQUIVOS_NOVOS) {
      const src = semComentariosJs(ler(f));
      const re = /from\(\s*['"`]mem_grupo_membros['"`]\s*\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const fim = src.indexOf(";", m.index);
        const cadeia = src.slice(m.index, fim === -1 ? undefined : fim);
        expect(cadeia, `${f}: ${cadeia.replace(/\s+/g, " ").slice(0, 120)}`).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
      }
    }
  });

  it("⚠️ o aviso respeita o interruptor e usa o contexto da fila", () => {
    const src = semComentariosJs(ler("backend/services/pedidoLinkGrupo.js"));
    expect(src).toContain("disparoDesligado(DISPARO_ID)");
    expect(src).toContain("contexto: CONTEXTO");
    // ⚠️ `notificar` sem `targetIds` cai no fallback de TODOS os admin/diretor —
    // e o telefone da pessoa iria junto. Lista vazia não chama.
    expect(src).toMatch(/if \(!alvo\.length\) canais\.sino = 'sem_destinatario'/);
    expect(src).toContain("targetIds: alvo");
  });

  it("⚠️⚠️ o webhook chama os ganchos DEPOIS do freio e ANTES do bot de IA", () => {
    const src = semComentariosJs(ler("backend/routes/publicWhatsapp.js"));
    const freio = src.indexOf("freioBot.botPodeResponder(");
    const ganchos = src.indexOf("tratarGanchos(");
    const botIa = src.indexOf("require('../services/botIaResposta')");
    expect(freio).toBeGreaterThan(-1);
    expect(ganchos).toBeGreaterThan(freio);
    expect(botIa).toBeGreaterThan(ganchos);
    // ⚠️ Com a config ilegível ninguém fala — nem os ganchos (freio de 26/08).
    expect(src.slice(freio, ganchos)).toContain("if (!erroCfg)");
    // E depois do `registrarInbound` + a saída de mídia: a mensagem já está no inbox.
    const inbox = src.lastIndexOf("registrarInbound(", freio);
    const midia = src.lastIndexOf("if (m.type !== 'text') return;", freio);
    expect(inbox).toBeGreaterThan(-1);
    expect(midia).toBeGreaterThan(inbox);
  });
});
