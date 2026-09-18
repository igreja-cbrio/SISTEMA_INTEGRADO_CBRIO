// ════════════════════════════════════════════════════════════════════════════
// Link de acesso por e-mail — a régua ÚNICA das portas públicas.
//
// ⚠️⚠️ A LEI QUE ESTE ARQUIVO EXISTE PRA GUARDAR: `generateLink` NÃO ENVIA
// E-MAIL. Ele GERA o link e devolve em `data.properties.action_link`; quem
// envia é quem chama. Três portas escreviam `const { error } = await
// generateLink(...)`, jogavam o link fora, logavam "Magic link enviado" e
// devolviam 200 — a tela dizia "Link enviado!" e a pessoa não recebia nada.
// É o REM-03 da auditoria do banco (17/09/2026).
//
// ⚠️⚠️ O `action_link` É CREDENCIAL: um clique e a pessoa está logada. Nunca
// logar, nunca devolver na resposta HTTP, nunca gravar em tabela. O único
// destino dele é o corpo do e-mail.
//
// ⚠️ Fail-soft do CANAL, não do fluxo: `services/email.js` devolve `{ok:false}`
// quando não há canal configurado, em vez de estourar. Quem chama decide o que
// fazer com a falha — e a decisão certa depende da porta: onde o link É a
// entrada (auto check-in do voluntário) a falha tem que aparecer; onde ele é
// acessório de algo já gravado (o cadastro da membresia), não pode derrubar.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('./supabase');
const { enviarEmail } = require('../services/email');

function corpo({ nome, link, chamada, textoBotao, rodape }) {
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <p style="font-size:16px">${ola}</p>
    <p style="font-size:15px;line-height:1.5">${chamada}</p>
    <p style="margin:28px 0">
      <a href="${link}" style="background:#00B39D;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">${textoBotao}</a>
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">
      Se o botão não abrir, copie e cole este endereço no navegador:<br>
      <span style="word-break:break-all">${link}</span>
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">${rodape}</p>
    <p style="font-size:12px;color:#9ca3af;margin-top:28px">Comunidade Batista do Rio</p>
  </div>`;
  const text = `${ola}\n\n${chamada}\n\n${link}\n\n${rodape}\n\nComunidade Batista do Rio`;
  return { html, text };
}

/**
 * Gera o link de acesso E MANDA o e-mail. Devolve `{ ok, motivo }`:
 *   · `ok:true` .................. o e-mail saiu pelo canal da casa
 *   · `motivo:'gerar'` ........... o GoTrue recusou gerar o link
 *   · `motivo:'sem_link'` ........ gerou e não veio `action_link` (contrato mudou)
 *   · `motivo:'envio'` ........... o link existe e o canal de e-mail falhou
 * Nunca lança: a porta que chama escolhe a severidade.
 */
async function enviarLinkDeAcesso({ email, redirectTo, nome, assunto, chamada, textoBotao, rodape, tag }) {
  const marca = tag ? `[${tag}]` : '[magicLink]';
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error) {
      console.error(`${marca} generateLink:`, error.message);
      return { ok: false, motivo: 'gerar' };
    }
    const link = data?.properties?.action_link;
    if (!link) {
      // Sem isto o defeito volta calado: `generateLink` que muda de contrato
      // devolveria `error` nulo e link nenhum, e o e-mail sairia sem link.
      console.error(`${marca} generateLink sem action_link — contrato do GoTrue mudou`);
      return { ok: false, motivo: 'sem_link' };
    }
    const { html, text } = corpo({ nome, link, chamada, textoBotao, rodape });
    const envio = await enviarEmail({ to: email, subject: assunto, html, text });
    if (!envio?.ok) {
      // ⚠️ Sem o link no log, de propósito (é credencial).
      console.error(`${marca} e-mail NÃO saiu:`, envio?.motivo || envio?.error || 'canal indisponível');
      return { ok: false, motivo: 'envio' };
    }
    return { ok: true };
  } catch (e) {
    console.error(`${marca} falha inesperada:`, e.message);
    return { ok: false, motivo: 'excecao' };
  }
}

module.exports = { enviarLinkDeAcesso };
