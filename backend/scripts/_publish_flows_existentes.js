// One-off · publica os 2 Flows JÁ EXISTENTES (NÃO cria novos) e mostra o motivo
// real (validation_errors / health_status) se a publicação falhar — em vez do
// "triângulo de aviso" vago da UI da Meta. Roda 1x e some · não é runtime.
//
// Pré-requisito: WHATSAPP_ACCESS_TOKEN no backend/.env (copie do Vercel · System
// User com whatsapp_business_management). Depois de usar, REMOVA do .env.
//
// Uso: node scripts/_publish_flows_existentes.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const FLOWS = [
  { nome: 'Lançamento do culto', id: '1163668689265932' },
  { nome: 'Pessoa que decidiu', id: '1941771723206900' },
];

async function api(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

(async () => {
  if (!TOKEN) {
    console.error('Falta WHATSAPP_ACCESS_TOKEN no backend/.env (copie do Vercel · remova depois).');
    process.exit(1);
  }
  for (const f of FLOWS) {
    console.log(`\n=== ${f.nome} (${f.id}) ===`);
    // 1. estado atual + por que (in)pode publicar
    const info = await api(
      `${GRAPH}/${f.id}?fields=id,name,status,validation_errors,health_status,categories`,
      { headers: { Authorization: `Bearer ${TOKEN}` } });
    console.log('estado:', JSON.stringify(info.data, null, 2));
    // 2. tenta publicar
    const pub = await api(`${GRAPH}/${f.id}/publish`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` },
    });
    console.log(pub.ok ? '✅ PUBLICADO' : `❌ falhou (${pub.status}): ${JSON.stringify(pub.data)}`);
  }
  process.exit(0);
})();
