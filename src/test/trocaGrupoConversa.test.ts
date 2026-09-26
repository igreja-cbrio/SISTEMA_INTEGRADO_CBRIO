// Contrato do gancho "quero trocar de grupo" pelo WhatsApp (Matheus · 26/09 ·
// item 3). ⚠️ A troca vira PEDIDO PENDENTE à coordenação — o bot nunca move
// ninguém de grupo (decisão do conselho). Régua pura em
// `backend/utils/trocaGrupoConversa` + guardas estáticas sobre o serviço.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { semComentariosJs } from "./_semComentarios";
import {
  pedeTroca, grupoCitado, compatibilidadeTroca, ehLiderancaDoGrupo, casoDaTroca,
  montarMotivoTroca, textoRespostaTroca, destinoComoTexto,
} from "../../backend/utils/trocaGrupoConversa.js";
import { textoAvisoTransferencia } from "../../backend/utils/avisoTransferenciaGrupo.js";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// Nomes no formato REAL da base (medido 26/09 · inclusive os repetidos).
const GRUPOS = [
  { id: "fin", nome: "ONLINE - Finanças na Ótica de Cristo", categoria: "Misto", bairro: "Online" },
  { id: "mu-on", nome: "ONLINE - MULHER ÚNICA", categoria: "Mulheres", bairro: "Online" },
  { id: "mu", nome: "MULHER ÚNICA", categoria: "Mulheres", bairro: "Barra da Tijuca" },
  { id: "jb1", nome: "Jornada Bíblica 1", categoria: "Misto", bairro: "Recreio" },
  { id: "jb2", nome: "Jornada Bíblica 2", categoria: "Misto", bairro: "Recreio" },
  { id: "teste", nome: "Teste", categoria: "Misto" },
  { id: "con1", nome: "ONLINE - GRUPO DE CONEXÃO", categoria: "Misto", bairro: "Online" },
  { id: "con2", nome: "ONLINE - GRUPO DE CONEXÃO", categoria: "Misto", bairro: "Online" },
  { id: "homens", nome: "NEW HEART - RECOMEÇO 40+", categoria: "Homens", bairro: "Barra" },
];

describe("pedeTroca · é pedido de troca de grupo?", () => {
  it("pedidos EXPLÍCITOS valem sem destino ('forte')", () => {
    for (const t of [
      "Quero trocar de grupo",
      "posso mudar de grupo?",
      "me transfere pra outro grupo",
      "gostaria de ir para outro grupo",
      "quero sair do meu grupo e entrar em outro",
      "queria mudar de grupo, esse horário não dá mais",
      "Tem como me colocar em outro grupo?",
    ]) expect(pedeTroca(t), t).toBe("forte");
  });

  it("'quero ir pro grupo X' depende de um destino claro", () => {
    expect(pedeTroca("quero ir pro grupo Mulher Única")).toBe("destino");
    expect(pedeTroca("quero mudar para o grupo jornada bíblica")).toBe("destino");
  });

  it("⚠️⚠️ o que NÃO é pedido de troca", () => {
    for (const t of [
      "não quero trocar de grupo, só saber o horário",
      "já troquei de grupo, obrigada",
      "me adiciona no grupo do whats",
      "posso ir pro grupo hoje?",
      "posso mudar meu grupo de horário?",
      "me transfere pra um atendente",
      "quero sair do grupo",
      "Cadê o link do grupo?",
      "",
    ]) expect(pedeTroca(t), t).toBe(false);
  });
});

describe("grupoCitado · para qual grupo (regra conservadora)", () => {
  it("nome inteiro vence, e o mais longo engole o que está dentro dele", () => {
    expect(grupoCitado("quero ir pro grupo online mulher única", GRUPOS)).toMatchObject({ tipo: "unico", grupo: { id: "mu-on" } });
    expect(grupoCitado("quero trocar para o mulher única", GRUPOS)).toMatchObject({ tipo: "unico", grupo: { id: "mu" } });
  });

  it("todos os tokens significativos casam (sem acento, sem pontuação)", () => {
    expect(grupoCitado("quero trocar pro finanças na ótica de cristo", GRUPOS)).toMatchObject({ tipo: "unico", grupo: { id: "fin" } });
  });

  it("⚠️⚠️ UM token só NÃO basta: 'grupo de finanças' não é o Finanças na Ótica de Cristo", () => {
    expect(grupoCitado("quero ir pro grupo de finanças", GRUPOS)).toEqual({ tipo: "nenhum" });
  });

  it("⚠️ Jornada Bíblica 1 e 2 ⇒ 'varios' — a coordenação confirma qual", () => {
    const r = grupoCitado("quero ir pra jornada bíblica", GRUPOS);
    expect(r.tipo).toBe("varios");
    expect((r as { grupos: { id: string }[] }).grupos.map((g) => g.id).sort()).toEqual(["jb1", "jb2"]);
  });

  it("⚠️ nome REPETIDO de verdade na base ⇒ 'varios'", () => {
    expect(grupoCitado("quero ir pro online grupo de conexão", GRUPOS).tipo).toBe("varios");
  });

  it("⚠️ nome de UMA palavra não casa dentro de frase comum ('é só um teste')", () => {
    expect(grupoCitado("quero trocar de grupo, é só um teste", GRUPOS)).toEqual({ tipo: "nenhum" });
  });

  it("sem candidatos ou sem texto ⇒ nenhum", () => {
    expect(grupoCitado("quero ir pro grupo X", [])).toEqual({ tipo: "nenhum" });
    expect(grupoCitado("", GRUPOS)).toEqual({ tipo: "nenhum" });
  });
});

describe("compatibilidadeTroca · homem não vai pra grupo só de mulheres", () => {
  const mulheres = GRUPOS.find((g) => g.id === "mu-on")!;
  const homens = GRUPOS.find((g) => g.id === "homens")!;
  const misto = GRUPOS.find((g) => g.id === "fin")!;

  it("sexo conhecido e diferente do exigido BLOQUEIA", () => {
    expect(compatibilidadeTroca({ destino: mulheres, genero: "masculino" })).toEqual({ bloqueia: true, motivo: "sexo", exigido: "feminino" });
    expect(compatibilidadeTroca({ destino: homens, genero: "F" })).toMatchObject({ bloqueia: true, exigido: "masculino" });
  });

  it("sexo compatível ou grupo misto não bloqueiam", () => {
    expect(compatibilidadeTroca({ destino: mulheres, genero: "feminino" })).toEqual({ bloqueia: false, notas: [] });
    expect(compatibilidadeTroca({ destino: misto, genero: "masculino" })).toEqual({ bloqueia: false, notas: [] });
  });

  it("⚠️ sexo DESCONHECIDO não bloqueia — vira nota pra coordenação conferir", () => {
    const r = compatibilidadeTroca({ destino: mulheres, genero: null });
    expect(r.bloqueia).toBe(false);
    expect((r as { notas: string[] }).notas.join(" ")).toMatch(/sexo não está no cadastro/);
  });

  it("⚠️ grupo sem inscrições não bloqueia — vira nota", () => {
    const r = compatibilidadeTroca({ destino: { ...misto, aceitando_inscricoes: false }, genero: "feminino" });
    expect(r.bloqueia).toBe(false);
    expect((r as { notas: string[] }).notas.join(" ")).toMatch(/não está recebendo inscrições/);
  });
});

describe("quem pode pedir por aqui · a ordem das guardas", () => {
  it("líder principal e liderança do roster são LIDERANÇA", () => {
    expect(ehLiderancaDoGrupo({ membroId: "m1", grupo: { lider_id: "m1" }, roster: [] })).toBe(true);
    expect(ehLiderancaDoGrupo({ membroId: "m1", grupo: { lider_id: "x" }, roster: [{ funcao: "lider_treinamento" }] })).toBe(true);
    expect(ehLiderancaDoGrupo({ membroId: "m1", grupo: { lider_id: "x" }, roster: [{ funcao: "lider" }] })).toBe(true);
    expect(ehLiderancaDoGrupo({ membroId: "m1", grupo: { lider_id: "x" }, roster: [{ funcao: "frequentador" }] })).toBe(false);
    expect(ehLiderancaDoGrupo({ membroId: null, grupo: { lider_id: null }, roster: [] })).toBe(false);
  });

  it("⚠️⚠️ liderança vence tudo · sexo incompatível não cria pedido · o resto cria", () => {
    expect(casoDaTroca({ lideranca: true, compat: { bloqueia: true } })).toBe("lideranca");
    expect(casoDaTroca({ lideranca: false, compat: { bloqueia: true } })).toBe("sexo_incompativel");
    expect(casoDaTroca({ lideranca: false, compat: { bloqueia: false } })).toBe("criar");
    expect(casoDaTroca({ lideranca: "sim" as unknown as boolean, compat: { bloqueia: false } })).toBe("criar");
  });
});

describe("o que fica registrado e o que a pessoa lê", () => {
  it("o motivo leva o telefone DA CONVERSA, o destino e o texto cru (truncado)", () => {
    const destino = grupoCitado("quero trocar pro finanças na ótica de cristo", GRUPOS);
    const m = montarMotivoTroca({ telefone: "5521987654321", destino, texto: "quero trocar\npro finanças", notas: ["o sexo não está no cadastro — conferir antes de transferir"] });
    expect(m).toBe('Pediu pelo WhatsApp da CBRio (telefone da conversa: (21) 98765-4321) · destino citado: ONLINE - Finanças na Ótica de Cristo · texto: "quero trocar · pro finanças" · o sexo não está no cadastro — conferir antes de transferir');
    const longo = montarMotivoTroca({ telefone: "", destino: { tipo: "nenhum" }, texto: "a".repeat(500) });
    expect(longo).toContain("destino citado: não informado");
    expect(longo).toContain("telefone da conversa: sem telefone");
    expect(longo.match(/texto: "(a+)…"/)?.[1].length).toBe(299);
  });

  it("destino ambíguo vira texto com os candidatos", () => {
    expect(destinoComoTexto(grupoCitado("quero ir pra jornada bíblica", GRUPOS))).toBe("ambíguo: Jornada Bíblica 1 (Recreio) / Jornada Bíblica 2 (Recreio)");
  });

  it("⚠️⚠️ a resposta NUNCA promete troca automática nem prazo, e diz que ela CONTINUA no grupo", () => {
    for (const caso of ["anotado", "ja_pedido"] as const) {
      const t = textoRespostaTroca({ caso, nome: "Ana Paula", grupoAtualNome: "ONLINE - X", destino: { tipo: "nenhum" } });
      expect(t, caso).toContain("você continua no grupo *ONLINE - X* normalmente");
      expect(t, caso).not.toMatch(/\b(hoje|amanhã|em breve|automaticamente|já foi transferid|transferimos|mudamos você)\b/i);
      expect(t, caso).toContain("coordenação de Grupos");
    }
  });

  it("resposta anotada cita o destino quando é único", () => {
    const destino = grupoCitado("quero ir pro grupo online mulher única", GRUPOS);
    expect(textoRespostaTroca({ caso: "anotado", nome: "Ana", grupoAtualNome: "X", destino })).toContain("Grupo que você pediu: *ONLINE - MULHER ÚNICA*.");
  });

  it("liderança e sexo incompatível têm texto próprio", () => {
    expect(textoRespostaTroca({ caso: "lideranca", nome: "Ana", grupoAtualNome: "X" })).toContain("faz parte da liderança do grupo *X*");
    const destino = grupoCitado("quero ir pro grupo online mulher única", GRUPOS);
    expect(textoRespostaTroca({ caso: "sexo_incompativel", nome: "João", destino, exigido: "feminino" })).toContain("é só para mulheres");
  });

  it("o aviso à coordenação do APP é byte a byte o de antes da extração", () => {
    const a = textoAvisoTransferencia({ origem: "app", pessoaNome: "Ana", grupoNome: "X", motivo: "mudou de bairro" });
    expect(a).toEqual({
      titulo: "Transferência pedida por um líder",
      mensagem: 'Ana do grupo "X" precisa ser transferida. Motivo: mudou de bairro. O pedido está na Caixa de entrada, aguardando a coordenação escolher o grupo.',
    });
  });

  it("⚠️ o aviso do WHATSAPP diz o destino e NÃO leva telefone", () => {
    const a = textoAvisoTransferencia({ origem: "whatsapp", pessoaNome: "Ana", grupoNome: "X", destinoTexto: "Y", motivo: "(21) 98765-4321" });
    expect(a.titulo).toBe("Pedido de troca de grupo pelo WhatsApp");
    expect(a.mensagem).toContain("Destino citado: Y.");
    expect(a.mensagem).not.toMatch(/\d{4,}/);
  });
});

describe("guardas estáticas do serviço de troca", () => {
  const src = semComentariosJs(ler("backend/services/trocaGrupoWhatsapp.js"));

  it("⚠️⚠️ a decisão passa pela régua PURA antes de criar o pedido", () => {
    const caso = src.indexOf("casoDaTroca(");
    const criar = src.indexOf("solicitarTransferencia(");
    expect(caso).toBeGreaterThan(-1);
    expect(criar).toBeGreaterThan(caso);
    expect(src.slice(caso, criar)).toContain("if (caso === 'criar')");
  });

  it("o pedido nasce com origem 'whatsapp' e sem autor de sistema", () => {
    expect(src).toContain("origem: 'whatsapp'");
    expect(src).toContain("pedidoPor: null");
    expect(src).toContain("pedidoPorNome: 'A própria pessoa (WhatsApp)'");
  });

  it("⚠️ a rota do app passou a usar o serviço ÚNICO de transferência", () => {
    const app = semComentariosJs(ler("backend/routes/app.js"));
    expect(app).toContain("solicitarTransferencia(");
    expect(app).not.toMatch(/from\(\s*['"]mem_grupo_transferencias['"]\s*\)\s*\.insert/);
  });
});
