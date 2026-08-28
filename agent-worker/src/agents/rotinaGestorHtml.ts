// Renderiza o e-mail do bloco do dia da rotina de gestão.
//
// ⚠️ Quem monta o HTML é CÓDIGO, não o modelo. O agente entrega dados; o
// template é determinístico. Assim o e-mail não muda de forma quando o modelo
// varia, e uma regressão de layout é revisável em diff.
//
// Estilo INLINE em tabelas: cliente de e-mail (Outlook, Gmail) ignora <style>.

import type { RotinaPayload } from "../tools/rotinaGestorEntrega.js";

const C = {
  page: "#f7f6f1",
  card: "#fefdfa",
  borda: "#e4e2d8",
  linha: "#ece9dd",
  tinta: "#17160f",
  tinta2: "#5c584c",
  fraco: "#8b8779",
  acento: "#00897b",
  atencao: "#fab219",
  critico: "#d03b3b",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CORES_BLOCO: Record<string, string> = {
  abastecer: "#00897b",
  decidir: "#8b5cf6",
  fechar: "#2a78d6",
  fora: "#8b8779",
};

function secao(titulo: string, corpo: string): string {
  if (!corpo) return "";
  return `
<tr><td style="padding:20px 32px 4px 32px;font-family:Arial,Helvetica,sans-serif;">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:${C.fraco};margin-bottom:10px;">${esc(titulo)}</div>
  ${corpo}
</td></tr>`;
}

type Item = { titulo: string; detalhe?: string; onde?: string; dono?: string };

function listaItens(itens: Item[]): string {
  if (!itens?.length) return "";
  return itens
    .map(
      (i) => `
<div style="padding:10px 0;border-bottom:1px solid ${C.linha};">
  <div style="font-size:14px;color:${C.tinta};font-weight:bold;">${esc(i.titulo)}</div>
  ${i.detalhe ? `<div style="font-size:13px;color:${C.tinta2};margin-top:3px;">${esc(i.detalhe)}</div>` : ""}
  ${
    i.dono || i.onde
      ? `<div style="font-size:11px;color:${C.fraco};margin-top:4px;">${[
          i.dono ? `dono: ${esc(i.dono)}` : "",
          i.onde ? `em ${esc(i.onde)}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}</div>`
      : ""
  }
</div>`
    )
    .join("");
}

function listaTexto(linhas: string[]): string {
  if (!linhas?.length) return "";
  return linhas
    .map(
      (l) => `<div style="padding:8px 0;border-bottom:1px solid ${C.linha};font-size:13px;color:${C.tinta};">${esc(l)}</div>`
    )
    .join("");
}

const COR_DEGRAU: Record<string, string> = { N1: C.acento, N2: C.atencao, N3: C.critico };

function mensagens(ms: RotinaPayload["mensagens"]): string {
  if (!ms?.length) return "";
  return ms
    .map(
      (m) => `
<div style="margin:0 0 14px 0;border:1px solid ${C.borda};border-radius:8px;overflow:hidden;">
  <div style="padding:8px 12px;background:${C.page};border-bottom:1px solid ${C.borda};">
    <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${COR_DEGRAU[m.degrau] || C.fraco};color:#fff;font-size:10px;font-weight:bold;">${esc(m.degrau)}</span>
    <span style="font-size:13px;color:${C.tinta};font-weight:bold;margin-left:8px;">${esc(m.para)}</span>
    <span style="font-size:12px;color:${C.tinta2};margin-left:6px;">${esc(m.assunto)}</span>
  </div>
  <div style="padding:12px;background:${C.card};font-family:Consolas,Menlo,monospace;font-size:13px;color:${C.tinta};white-space:pre-wrap;line-height:1.5;">${esc(m.texto)}</div>
  <div style="padding:7px 12px;background:${C.page};border-top:1px solid ${C.borda};font-size:11px;color:${C.fraco};">${esc(m.porque)}</div>
</div>`
    )
    .join("");
}

export function assuntoDaRotina(p: RotinaPayload): string {
  const rot: Record<string, string> = {
    abastecer: "Abastecer",
    decidir: "Decidir e comunicar",
    fechar: "Fechar",
    fora: "Sem rotina hoje",
  };
  const nome = rot[p.bloco] || "Rotina";
  const pend = (p.agora?.length || 0) + (p.mensagens?.length || 0);
  // O assunto carrega o número: e-mail que não diz o tamanho do trabalho na
  // linha de assunto é e-mail que se lê "depois".
  const sufixo = p.nada_a_fazer ? "nada pendente" : `${pend} item${pend === 1 ? "" : "s"}`;
  return `Rotina · ${nome} · ${p.dia} · ${sufixo}`;
}

export function htmlDaRotina(p: RotinaPayload): string {
  const cor = CORES_BLOCO[p.bloco] || C.fraco;

  const corpo = [
    p.ressalva
      ? `<tr><td style="padding:14px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
           <div style="padding:11px 13px;background:#fff8e6;border-left:3px solid ${C.atencao};font-size:13px;color:${C.tinta};">${esc(p.ressalva)}</div>
         </td></tr>`
      : "",

    `<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
       <div style="font-size:16px;line-height:1.5;color:${C.tinta};">${esc(p.abertura)}</div>
     </td></tr>`,

    p.nada_a_fazer && !p.agora?.length
      ? secao(
          "Hoje",
          `<div style="padding:12px 0;font-size:14px;color:${C.tinta2};">Nada pendente nos 3 pilares. Nenhum item foi inventado pra preencher este e-mail.</div>`
        )
      : secao("Fazer hoje", listaItens(p.agora || [])),

    secao("Pilar · Eventos", listaItens(p.eventos || [])),
    secao("Pilar · Reuniões", listaItens(p.reunioes || [])),
    secao("Pilar · Compromissos", listaItens(p.compromissos || [])),

    p.taxa_deliberacao_cumprida
      ? secao(
          "Taxa de deliberação cumprida",
          `<div style="padding:10px 0;font-size:15px;color:${C.tinta};font-weight:bold;">${esc(p.taxa_deliberacao_cumprida)}</div>
           <div style="font-size:12px;color:${C.fraco};">Abaixo de ~60% por dois meses seguidos, o problema não é o ritual — é que se decide mais do que se executa.</div>`
        )
      : "",

    secao("Pauta · Pedro / ciclo criativo (15 min)", listaTexto(p.pauta_marketing || [])),
    secao("Pauta · reunião de sistema (ministerial)", listaTexto(p.pauta_sistema || [])),
    secao("Fechamento do mês", listaItens(p.fechamento_mensal || [])),

    secao("Mensagens prontas pra enviar", mensagens(p.mensagens)),

    p.sem_a_quem_cobrar?.length
      ? secao(
          "Sem responsável cadastrado — cobrar o líder da área",
          listaTexto(p.sem_a_quem_cobrar)
        )
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:24px 0;margin:0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:${C.card};border:1px solid ${C.borda};border-radius:10px;">
  <tr><td style="padding:24px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:11px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:${cor};">${esc(p.dia_semana)} · ${esc(p.dia)}</div>
    <div style="font-size:22px;font-weight:bold;color:${C.tinta};margin-top:4px;line-height:1.25;">${esc(p.bloco_titulo)}</div>
    <div style="font-size:12px;color:${C.fraco};margin-top:6px;">Eventos · Reuniões · Compromissos</div>
  </td></tr>
  ${corpo}
  <tr><td style="padding:20px 32px 24px 32px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid ${C.linha};">
    <div style="font-size:11px;color:${C.fraco};line-height:1.5;">Montado pelo agente <b>rotina_gestor</b>, somente leitura. Nada foi enviado a ninguém — as mensagens acima são pra você copiar e enviar.</div>
  </td></tr>
</table>
</td></tr>
</table>`;
}

export function textoDaRotina(p: RotinaPayload): string {
  const L: string[] = [];
  L.push(`${p.bloco_titulo}`);
  L.push(`${p.dia_semana} · ${p.dia}`);
  L.push("");
  if (p.ressalva) {
    L.push(`ATENÇÃO: ${p.ressalva}`);
    L.push("");
  }
  L.push(p.abertura);
  L.push("");

  const bloco = (t: string, itens: Item[]) => {
    if (!itens?.length) return;
    L.push(`## ${t}`);
    itens.forEach((i) => {
      L.push(`- ${i.titulo}${i.detalhe ? ` — ${i.detalhe}` : ""}`);
      const meta = [i.dono ? `dono: ${i.dono}` : "", i.onde ? `em ${i.onde}` : ""].filter(Boolean).join(" · ");
      if (meta) L.push(`  (${meta})`);
    });
    L.push("");
  };

  if (p.nada_a_fazer && !p.agora?.length) {
    L.push("## Hoje");
    L.push("Nada pendente nos 3 pilares.");
    L.push("");
  } else {
    bloco("Fazer hoje", p.agora || []);
  }
  bloco("Pilar · Eventos", p.eventos || []);
  bloco("Pilar · Reuniões", p.reunioes || []);
  bloco("Pilar · Compromissos", p.compromissos || []);

  if (p.taxa_deliberacao_cumprida) {
    L.push(`## Taxa de deliberação cumprida`);
    L.push(p.taxa_deliberacao_cumprida);
    L.push("");
  }

  const linhas = (t: string, xs: string[]) => {
    if (!xs?.length) return;
    L.push(`## ${t}`);
    xs.forEach((x) => L.push(`- ${x}`));
    L.push("");
  };
  linhas("Pauta · Pedro / ciclo criativo", p.pauta_marketing || []);
  linhas("Pauta · reunião de sistema", p.pauta_sistema || []);
  bloco("Fechamento do mês", p.fechamento_mensal || []);

  if (p.mensagens?.length) {
    L.push("## Mensagens prontas pra enviar");
    p.mensagens.forEach((m) => {
      L.push("");
      L.push(`[${m.degrau}] ${m.para} — ${m.assunto}`);
      L.push(m.texto);
      L.push(`(por que: ${m.porque})`);
    });
    L.push("");
  }
  linhas("Sem responsável cadastrado — cobrar o líder da área", p.sem_a_quem_cobrar || []);

  L.push("--");
  L.push("Agente rotina_gestor · somente leitura. Nada foi enviado a ninguém.");
  return L.join("\n");
}
