// Renderiza o e-mail do relatório de KPI/OKR a partir do payload estruturado.
//
// ⚠️ Quem monta o HTML é CÓDIGO, não o modelo. O agente entrega dados; o
// template é determinístico. Assim o e-mail não muda de forma quando o modelo
// varia, e uma regressão de layout é revisável em diff.
//
// Estilo INLINE em tabelas: cliente de e-mail (Outlook, Gmail) ignora <style>.

import type { RelatorioPayload } from "../tools/kpiRelatorioEntrega.js";

const C = {
  page: "#f7f6f1",
  card: "#fefdfa",
  borda: "#e4e2d8",
  linha: "#ece9dd",
  tinta: "#17160f",
  tinta2: "#5c584c",
  fraco: "#8b8779",
  acento: "#2a78d6",
  bom: "#0ca30c",
  atencao: "#fab219",
  serio: "#ec835a",
  critico: "#d03b3b",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function corDoIndice(n: number): string {
  if (n >= 75) return C.bom;
  if (n >= 50) return C.atencao;
  if (n >= 30) return C.serio;
  return C.critico;
}

function secao(titulo: string, corpo: string): string {
  if (!corpo) return "";
  return `
<tr><td style="padding:20px 32px 4px 32px;font-family:Arial,Helvetica,sans-serif;">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:${C.fraco};margin-bottom:10px;">${esc(titulo)}</div>
  ${corpo}
</td></tr>`;
}

function cartaoAchado(a: any, cor: string): string {
  const linhas: string[] = [];
  if (a.numero) linhas.push(esc(a.numero));
  if (a.comparacao) linhas.push(esc(a.comparacao));
  const meta = [a.area && `área: ${esc(a.area)}`, a.dono && `dono: ${esc(a.dono)}`]
    .filter(Boolean)
    .join(" · ");
  if (meta) linhas.push(meta);
  if (a.causa) {
    linhas.push(
      a.causa_verificada
        ? esc(a.causa)
        : `<em>hipótese não verificada:</em> ${esc(a.causa)}`
    );
  }
  const acao = a.acao
    ? `<br/><strong>${a.dono ? "Ação" : "Decisão pedida"}:</strong> ${esc(a.acao)}`
    : "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border-left:3px solid ${cor};background-color:${C.card};">
    <tr><td style="padding:12px 16px;">
      <div style="font-size:14px;font-weight:bold;color:${C.tinta};margin-bottom:4px;">${esc(a.titulo)}</div>
      <div style="font-size:13px;color:${C.tinta2};line-height:1.5;">${linhas.join("<br/>")}${acao}</div>
    </td></tr>
  </table>`;
}

function listaNumerada(itens: any[], cores: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${C.tinta2};">
${itens
  .map((a, i) => {
    const ultimo = i === itens.length - 1;
    const b = ultimo ? "" : `border-bottom:1px solid ${C.linha};`;
    const cor = cores[Math.min(i, cores.length - 1)];
    const detalhe = [a.numero, a.comparacao].filter(Boolean).map(esc).join(" · ");
    return `    <tr>
      <td style="padding:8px 0;${b}width:20px;color:${cor};font-weight:bold;vertical-align:top;">${i + 1}</td>
      <td style="padding:8px 0;${b}vertical-align:top;">
        <strong style="color:${C.tinta};">${esc(a.titulo)}</strong>${detalhe ? ` — ${detalhe}` : ""}
        ${a.acao ? `<br/><span style="color:${C.fraco};">${esc(a.acao)}</span>` : ""}
      </td>
    </tr>`;
  })
  .join("\n")}
</table>`;
}

export function assuntoDoRelatorio(p: RelatorioPayload): string {
  const n = (p.decisoes?.length || 0) + (p.riscos?.length || 0);
  const risco = n ? ` · ${n} em risco` : " · sem alertas";
  return `KPI/OKR CBRio · ${p.periodo_semanal}${risco}`;
}

export function textoDoRelatorio(p: RelatorioPayload): string {
  const bloco = (t: string, itens: any[]) =>
    itens?.length
      ? `\n${t.toUpperCase()}\n` +
        itens
          .map(
            (a, i) =>
              `${i + 1}. ${a.titulo}${a.numero ? ` — ${a.numero}` : ""}${a.comparacao ? ` (${a.comparacao})` : ""}${a.acao ? `\n   Ação: ${a.acao}` : ""}`
          )
          .join("\n") +
        "\n"
      : "";
  return [
    `Painel KPI/OKR CBRio - fechamento ${p.periodo_semanal} (semanal) / ${p.periodo_mensal} (mensal).`,
    `Confiabilidade do painel: ${p.confiabilidade_indice}/100.`,
    p.ressalva ? `\n${p.ressalva}` : "",
    `\nVEREDITO`,
    `Mudou - ${p.veredito_mudou}`,
    `Risco - ${p.veredito_risco}`,
    `Fazer - ${p.veredito_fazer}`,
    bloco("Precisa de decisão", p.decisoes),
    bloco("Riscos", p.riscos),
    bloco("Avanços", p.avancos),
    p.okr_resumo ? `\nOKR\n${p.okr_resumo}\n` : "",
    p.falsos_alarmes?.length
      ? `\nNÃO É PROBLEMA\n${p.falsos_alarmes.map((f) => `- ${f}`).join("\n")}\n`
      : "",
    `\nConfiabilidade: ${p.confiabilidade_conta}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function htmlDoRelatorio(p: RelatorioPayload): string {
  const idx = Math.round(p.confiabilidade_indice ?? 0);
  const corIdx = corDoIndice(idx);

  const ressalva = p.ressalva
    ? `
<tr><td style="padding:8px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf3ef;border-left:3px solid ${C.serio};border-radius:6px;">
    <tr><td style="padding:12px 16px;font-size:13px;line-height:1.5;color:${C.tinta2};">${esc(p.ressalva)}</td></tr>
  </table>
</td></tr>`
    : "";

  const veredito = secao(
    "1 · Veredito",
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${[
  ["Mudou", p.veredito_mudou],
  ["Risco", p.veredito_risco],
  ["Fazer", p.veredito_fazer],
]
  .map(
    ([rot, txt], i) =>
      `    <tr><td style="padding:8px 0;${i < 2 ? `border-bottom:1px solid ${C.linha};` : ""}font-size:14px;line-height:1.5;color:${C.tinta};">
      <span style="font-size:11px;font-weight:bold;color:${C.acento};text-transform:uppercase;">${rot} &mdash; </span>${esc(txt)}
    </td></tr>`
  )
  .join("\n")}
</table>`
  );

  const decisoes = secao(
    "2 · Precisa de decisão",
    p.decisoes?.length
      ? p.decisoes.map((a) => cartaoAchado(a, C.critico)).join("")
      : `<div style="font-size:13px;color:${C.tinta2};">Nada aguarda decisão sua nesta semana.</div>`
  );

  const riscos = p.riscos?.length
    ? secao("3 · Riscos (por tamanho)", listaNumerada(p.riscos, [C.critico, C.critico, C.serio, C.atencao]))
    : "";

  const avancos = p.avancos?.length
    ? secao("4 · Avanços", p.avancos.map((a) => cartaoAchado(a, C.bom)).join(""))
    : "";

  const travados = p.okr_travados?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-top:10px;">
    <tr style="background-color:#f0eee4;">
      <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;color:${C.fraco};font-weight:bold;">Área</td>
      <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;color:${C.fraco};font-weight:bold;">O que trava</td>
      <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;color:${C.fraco};font-weight:bold;">Líder</td>
    </tr>
${p.okr_travados
  .map(
    (t: any, i: number) =>
      `    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid ${C.linha};color:${C.tinta};">${esc(t.area)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${C.linha};color:${C.tinta2};">${esc(t.o_que_trava)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${C.linha};color:${C.tinta2};">${esc(t.lider || "—")}</td>
    </tr>`
  )
  .join("\n")}
</table>`
    : "";

  const okr = p.okr_resumo
    ? secao(
        "5 · OKR",
        `<div style="font-size:13px;color:${C.tinta2};line-height:1.6;">${esc(p.okr_resumo)}</div>${travados}`
      )
    : "";

  const falsos = p.falsos_alarmes?.length
    ? secao(
        "6 · Não é problema",
        `<div style="font-size:13px;color:${C.tinta2};line-height:1.6;">${p.falsos_alarmes
          .map((f) => `&bull; ${esc(f)}`)
          .join("<br/>")}</div>`
      )
    : "";

  const revisoes = p.revisoes_okr_sugeridas?.length
    ? secao(
        "7 · Revisões de OKR a registrar",
        `<div style="font-size:12px;color:${C.fraco};margin-bottom:8px;">Rascunhos — o sistema não escreve no banco. Alguém precisa registrar em Gestão &rsaquo; OKR.</div>` +
          p.revisoes_okr_sugeridas
            .map(
              (r: any) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;border-left:3px solid ${C.acento};background-color:${C.card};">
    <tr><td style="padding:12px 16px;font-size:13px;color:${C.tinta2};line-height:1.5;">
      <strong style="color:${C.tinta};">${esc(r.objetivo)}</strong><br/>
      <strong>Causa:</strong> ${esc(r.causa_desvio)}<br/>
      <strong>Decisão:</strong> ${esc(r.decisao)}<br/>
      <strong>Próximo passo:</strong> ${esc(r.proximo_passo)}${r.prazo ? ` (até ${esc(r.prazo)})` : ""}
    </td></tr>
  </table>`
            )
            .join("")
      )
    : "";

  const confiabilidade = secao(
    "8 · Confiabilidade do painel",
    `<div style="font-size:13px;color:${C.tinta2};line-height:1.6;">${esc(p.confiabilidade_conta)}</div>` +
      (p.confiabilidade_pendencias?.length
        ? `<div style="font-size:13px;color:${C.tinta2};line-height:1.6;margin-top:8px;">${p.confiabilidade_pendencias
            .map((x) => `&bull; ${esc(x)}`)
            .join("<br/>")}</div>`
        : "")
  );

  return `<div style="margin:0;padding:0;background-color:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.page};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:${C.card};border:1px solid ${C.borda};border-radius:8px;">

<tr><td style="padding:28px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:21px;font-weight:bold;color:${C.tinta};">Painel KPI/OKR &middot; CBRio</td>
      <td align="right" style="white-space:nowrap;">
        <span style="display:inline-block;background-color:#f0eee4;border:1px solid ${C.borda};border-radius:6px;padding:6px 12px;font-size:13px;color:${corIdx};font-weight:bold;">${idx}/100 confiabilidade</span>
      </td>
    </tr>
  </table>
  <div style="font-size:13px;color:${C.tinta2};margin-top:4px;">Fechamento ${esc(p.periodo_semanal)} (semanal) &middot; ${esc(p.periodo_mensal)} (mensal)</div>
</td></tr>
${ressalva}${veredito}${decisoes}${riscos}${avancos}${okr}${falsos}${revisoes}${confiabilidade}

<tr><td style="padding:16px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;">
  <div style="border-top:1px solid ${C.linha};padding-top:12px;font-size:11px;color:${C.fraco};line-height:1.5;">
    Gerado automaticamente pelo agente de KPI/OKR, segunda-feira de manhã, a partir do banco do ERP.
    Somente leitura — nenhum dado foi alterado. Detalhe por indicador em Gestão &rsaquo; KPIs.
  </div>
</td></tr>

</table>
</td></tr>
</table>
</div>`;
}
