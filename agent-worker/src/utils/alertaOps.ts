/**
 * Canal de alerta que SOBREVIVE à queda do banco.
 *
 * ⚠️⚠️ As três regras vêm do que foi medido em 02/09/2026, quando nenhum
 * alerta saiu numa queda de 1h34:
 *
 *  1. DESTINATÁRIO EM ENV VAR, nunca consultado no banco.
 *     `notificar()` do ERP resolve o e-mail em `profiles` — ou seja, para
 *     avisar que o banco caiu ele precisa do banco. É o bug conceitual que
 *     causou os 85 minutos de silêncio.
 *  2. MICROSOFT GRAPH DIRETO daqui, sem passar pela Vercel.
 *     O padrão atual do worker (kpiRelatorioSemanal) delega o envio para
 *     `${base}/api/...` — e a Vercel estava devolvendo 522.
 *  3. FALHA DE ENVIO É BARULHENTA no log do worker. Alerta que não sai e não
 *     avisa que não saiu é a mesma cegueira, um andar acima.
 */

const TIMEOUT_MS = 15_000;

export function destinatarios(): string[] {
  // ⚠️ Só env. Sem fallback para "todo admin" — isso exigiria o banco.
  return String(process.env.ALERTA_OPS_EMAIL || '')
    .split(/[;,]/).map((s) => s.trim()).filter((s) => s.includes('@'));
}

export function canalConfigurado(): boolean {
  return destinatarios().length > 0
    && !!process.env.MICROSOFT_TENANT_ID
    && !!process.env.MICROSOFT_CLIENT_ID
    && !!process.env.MICROSOFT_CLIENT_SECRET
    && !!process.env.ALERTA_OPS_REMETENTE;
}

async function tokenGraph(): Promise<string> {
  const url = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: String(process.env.MICROSOFT_CLIENT_ID),
    client_secret: String(process.env.MICROSOFT_CLIENT_SECRET),
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const r = await fetch(url, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`token Graph ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json() as any).access_token;
}

/** Devolve `true` se ENTREGOU. Nunca lança — alerta que falha não pode derrubar o vigia. */
export async function alertar(assunto: string, corpo: string): Promise<boolean> {
  if (!canalConfigurado()) {
    // ⚠️ Barulhento de propósito: é o log que denuncia o canal desligado.
    console.error('[VIGIA] 🔴 ALERTA NAO ENVIADO (canal nao configurado):', assunto);
    console.error('[VIGIA] falta: ALERTA_OPS_EMAIL / ALERTA_OPS_REMETENTE / MICROSOFT_*');
    return false;
  }
  try {
    const token = await tokenGraph();
    const remetente = String(process.env.ALERTA_OPS_REMETENTE);
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remetente)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        message: {
          subject: assunto,
          body: { contentType: 'Text', content: corpo },
          toRecipients: destinatarios().map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    });
    if (!r.ok) throw new Error(`sendMail ${r.status}: ${(await r.text()).slice(0, 200)}`);
    console.log('[VIGIA] alerta enviado:', assunto);
    return true;
  } catch (e: any) {
    console.error('[VIGIA] 🔴 FALHA AO ENVIAR ALERTA:', e?.message, '·', assunto);
    return false;
  }
}
