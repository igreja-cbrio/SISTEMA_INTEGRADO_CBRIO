// Contrato da sugestão de resposta do inbox (Matheus · 31/08/2026).
// ⚠️ Os casos vieram do BANCO: TODAS as mensagens de entrada com "link" em 90
// dias, medidas em 31/08. Nada aqui é hipotético.
import { describe, it, expect } from "vitest";
import { assuntoDaMensagem } from "../../backend/utils/assuntoGrupoConversa.js";
import { montarRespostaLink } from "../../backend/utils/respostaGrupoAgenda.js";
import { ehGrupoOnline } from "../../backend/utils/grupoOnline.js";

describe("assunto da mensagem · casos REAIS do inbox", () => {
  it("⚠️ o caso do Matheus (30/08): pergunta o link E se deve falar com a líder", () => {
    expect(assuntoDaMensagem("Boa tarde. Receberemos o link por aqui? Devo fazer contato com a líder do grupo?")).toBe("link");
  });

  it("as outras três formas do mesmo pedido", () => {
    expect(assuntoDaMensagem("Cadê o Link ?")).toBe("link");
    expect(assuntoDaMensagem("Vcs mandam link?")).toBe("link");
    expect(assuntoDaMensagem("Estou no aguardo do Link para entrar na Reunião amanhã 20:00 hs")).toBe("link");
  });

  it("⚠️⚠️ 'consegui o link' NÃO é pedido — é aviso de que já resolveu", () => {
    // Caso real de 05/08. Sugerir "a liderança vai te mandar o link" pra quem
    // acabou de dizer que conseguiu faz a igreja parecer que não leu.
    expect(assuntoDaMensagem("Opa, consegui o link de acesso ao grupo")).toBe(null);
    expect(assuntoDaMensagem("Já recebi o link, obrigada!")).toBe(null);
    expect(assuntoDaMensagem("obrigado pelo link")).toBe(null);
  });

  it("⚠️⚠️ link VENCE agenda quando a mensagem casa as DUAS réguas", () => {
    // ⚠️ A 1ª versão deste teste usava "Qual o link da reunião de amanhã?", que
    // NÃO casa a régua de agenda — o mutante que inverte a ordem SOBREVIVEU.
    // Um caso que casa só um lado não exercita a precedência. (Mesma lição do
    // sinônimo-que-era-prefixo, 25/08.)
    const dosDois = "Oi! Quando começa? E vocês mandam o link por aqui?";
    expect(assuntoDaMensagem(dosDois)).toBe("link");
    // prova de que o caso realmente casa os dois lados:
    expect(assuntoDaMensagem("Quando começa?")).toBe("agenda");
    expect(assuntoDaMensagem("vocês mandam o link por aqui?")).toBe("link");
  });

  it("as perguntas de AGENDA continuam caindo na régua de 26/08", () => {
    expect(assuntoDaMensagem("E quando inicia ?")).toBe("agenda");
    expect(assuntoDaMensagem("Gostaria de saber se está tudo ok para a reunião hoje ?")).toBe("agenda");
    expect(assuntoDaMensagem("Vai começar amanhã mesmo?")).toBe("agenda");
    expect(assuntoDaMensagem("que dia é o encontro?")).toBe("agenda");
  });

  it("⚠️ o resto é null — e null é o caso COMUM", () => {
    // Sugestão que chuta é pior que sugestão ausente: quem está com pressa
    // envia sem ler.
    expect(assuntoDaMensagem("Obrigada!")).toBe(null);
    expect(assuntoDaMensagem("Amém 🙏")).toBe(null);
    expect(assuntoDaMensagem("")).toBe(null);
    expect(assuntoDaMensagem(null as never)).toBe(null);
    expect(assuntoDaMensagem("Adorei o culto de ontem")).toBe(null);
  });

  it("acento e caixa não mudam nada", () => {
    expect(assuntoDaMensagem("CADÊ O LINK")).toBe("link");
    expect(assuntoDaMensagem("quando comeca?")).toBe("agenda");
  });
});

describe("o texto da resposta de link", () => {
  const base = { nome: "Ana paula roenick", grupoNome: "ONLINE - Finanças", liderNome: "Dassa Dana Hejda", liderTelefone: "(21) 99986-1230" };

  it("⚠️⚠️ diz que a LIDERANÇA entra em contato — não que o link vem por aqui", () => {
    // O sistema NÃO tem o link (não existe coluna pra ele): prometer que chega
    // pelo inbox institucional é comprometer a igreja com um envio que ninguém
    // vai fazer, e a pessoa fica esperando na conversa errada.
    const { texto } = montarRespostaLink({ ...base, online: true });
    expect(texto).toMatch(/Dassa vai entrar em contato/);
    expect(texto).not.toMatch(/vamos te enviar|enviaremos o link|o link chega por aqui/i);
  });

  it("⚠️ o CONTATO da líder vai junto — foi o que ela perguntou", () => {
    expect(montarRespostaLink({ ...base, online: true }).texto).toContain("(21) 99986-1230");
  });

  it("⚠️ sem líder resolvido, fala da liderança sem inventar nome", () => {
    const { texto } = montarRespostaLink({ ...base, liderNome: "", liderTelefone: "", online: true });
    expect(texto).toMatch(/liderança do grupo/);
    expect(texto).not.toMatch(/a \(/);
  });

  it("⚠️⚠️ grupo PRESENCIAL não fala de link — fala de endereço", () => {
    const { texto } = montarRespostaLink({ ...base, online: false, local: "Rua X, 10 — Barra" });
    expect(texto).toMatch(/presencial, em Rua X, 10 — Barra/);
    expect(texto).not.toMatch(/link/i);
  });

  it("⚠️ NÃO promete prazo", () => {
    const { texto } = montarRespostaLink({ ...base, online: true });
    expect(texto).not.toMatch(/hoje|em breve|logo|até amanhã|nas próximas/i);
  });
});

describe("⚠️ 'este grupo é online?' — a régua que não tem coluna", () => {
  it("bairro exato ou 'online' no local", () => {
    expect(ehGrupoOnline({ bairro: "Online" })).toBe(true);
    expect(ehGrupoOnline({ local: "Online — Zoom" })).toBe(true);
    expect(ehGrupoOnline({ local: "GRUPO ONLINE" })).toBe(true);
  });

  it("presencial não vira online por acidente", () => {
    expect(ehGrupoOnline({ bairro: "Barra da Tijuca", local: "Rua X" })).toBe(false);
    expect(ehGrupoOnline({})).toBe(false);
    expect(ehGrupoOnline(null)).toBe(false);
  });
});
