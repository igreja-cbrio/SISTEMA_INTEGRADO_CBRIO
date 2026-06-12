// One-off · sobe o flow-culto.json ATUALIZADO pro Flow JÁ EXISTENTE na Meta
// (atualiza o rascunho · NÃO cria flow novo). Use quando o JSON do form mudar.
// Precisa WHATSAPP_ACCESS_TOKEN no backend/.env (copie do Vercel · remova depois).
// Mostra os validation_errors se a Meta recusar o JSON.
//
// Uso: node scripts/_atualizar_flow_culto.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const FLOW_ID = process.env.WHATSAPP_FLOW_CULTO_ID || '1163668689265932';

(async () => {
  if (!TOKEN) {
    console.error('Falta WHATSAPP_ACCESS_TOKEN no backend/.env (copie do Vercel · remova depois).');
    process.exit(1);
  }
  const conteudo = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-flows', 'flow-culto.json'));
  const form = new FormData();
  form.append('name', 'flow.json');
  form.append('asset_type', 'FLOW_JSON');
  form.append('file', new Blob([conteudo], { type: 'application/json' }), 'flow.json');
  const resp = await fetch(`${GRAPH}/${FLOW_ID}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const data = await resp.json().catch(() => ({}));
  console.log(resp.ok ? '✅ JSON atualizado no rascunho' : `❌ falhou (${resp.status})`);
  console.log(JSON.stringify(data, null, 2));
  process.exit(resp.ok ? 0 : 1);
})();
