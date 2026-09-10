// Lê o motivo REAL de "Integrity requirements not met" nos Flows da WABA.
// A Meta devolve, por Flow, o `health_status` de cada entidade (FLOW · WABA ·
// BUSINESS · APP) com `error_code` — foi assim que em 09/06/2026 apareceu que o
// bloqueio era o método de pagamento da WABA (141006), não o JSON.
//
// Uso (token TEMPORÁRIO de 24h do app Meta ou do System User · NÃO salve em arquivo):
//   bash (o `!` do Claude Code roda Git Bash):
//     WHATSAPP_ACCESS_TOKEN='EAAG...' node backend/scripts/_flows_health.js
//   PowerShell:
//     $env:WHATSAPP_ACCESS_TOKEN='EAAG...'; node backend/scripts/_flows_health.js
// Em 10/09/2026 todas as entidades vieram AVAILABLE — o "Integrity requirements not
// met" que o Marcos viu na Meta não era bloqueio de conta naquele momento.
// Só LEITURA: não publica, não altera nada.
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '2177907859655557';

async function get(path) {
  const r = await fetch(`${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`);
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j.error || j));
  return j;
}

(async () => {
  if (!TOKEN) { console.error('Falta WHATSAPP_ACCESS_TOKEN (variável de ambiente, só nesta janela).'); process.exit(1); }
  const lista = await get(`${WABA}/flows?fields=id,name,status,categories,validation_errors`);
  if (!lista.data?.length) { console.log('Nenhum Flow na WABA', WABA); return; }
  for (const f of lista.data) {
    console.log(`\n── ${f.name} · id ${f.id} · status ${f.status}`);
    if (f.validation_errors?.length) console.log('   validation_errors:', JSON.stringify(f.validation_errors));
    const h = await get(`${f.id}?fields=health_status`);
    const hs = h.health_status || {};
    console.log(`   can_send_message: ${hs.can_send_message}`);
    for (const e of hs.entities || []) {
      const erros = (e.errors || []).map((x) => `${x.error_code}: ${x.error_description}${x.possible_solution ? ` → ${x.possible_solution}` : ''}`);
      console.log(`   ${e.entity_type.padEnd(8)} ${e.id}  ${e.can_send_message}${erros.length ? '\n      ' + erros.join('\n      ') : ''}`);
    }
  }
  console.log('\nLeitura: a entidade com can_send_message=BLOCKED e o error_code dela é a causa. FLOW bloqueado sozinho = problema do JSON/publicação; WABA/BUSINESS/APP bloqueado = conta, não o formulário.');
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
