// Publica os Flows do bot WhatsApp na Meta e devolve os flow_id pra setar no Vercel.
// Roda UMA vez (ou quando o JSON do flow mudar). NÃO faz parte do runtime.
//
// Pré-requisitos (no ambiente onde rodar · ex: backend/.env):
//   WHATSAPP_BUSINESS_ACCOUNT_ID  · id da WABA (Business Settings → Contas do WhatsApp)
//   WHATSAPP_ACCESS_TOKEN         · token System User com whatsapp_business_management
//
// Uso:  node scripts/publish-whatsapp-flows.js
// Saída: os 2 flow_id → copie pra WHATSAPP_FLOW_CULTO_ID / WHATSAPP_FLOW_PESSOA_ID no Vercel.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const FLOWS = [
  { nome: 'CBRio · Lançamento do culto', arquivo: 'flow-culto.json', env: 'WHATSAPP_FLOW_CULTO_ID' },
  { nome: 'CBRio · Pessoa que decidiu', arquivo: 'flow-pessoa.json', env: 'WHATSAPP_FLOW_PESSOA_ID' },
];

async function api(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${resp.status} ${JSON.stringify(data)}`);
  return data;
}

async function publicarFlow({ nome, arquivo }) {
  // 1. cria o flow (rascunho)
  const criado = await api(`${GRAPH}/${WABA}/flows`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, categories: ['SURVEY'] }),
  });
  const flowId = criado.id;

  // 2. sobe o JSON do flow (multipart · FormData nativo do Node 18+)
  const jsonPath = path.join(__dirname, '..', 'whatsapp-flows', arquivo);
  const conteudo = fs.readFileSync(jsonPath);
  const form = new FormData();
  form.append('name', 'flow.json');
  form.append('asset_type', 'FLOW_JSON');
  form.append('file', new Blob([conteudo], { type: 'application/json' }), 'flow.json');
  const upload = await api(`${GRAPH}/${flowId}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  if (upload.validation_errors?.length) {
    console.warn(`  ⚠ validação do ${arquivo}:`, JSON.stringify(upload.validation_errors));
  }

  // 3. publica
  await api(`${GRAPH}/${flowId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return flowId;
}

(async () => {
  if (!WABA || !TOKEN) {
    console.error('Faltam WHATSAPP_BUSINESS_ACCOUNT_ID e/ou WHATSAPP_ACCESS_TOKEN no env.');
    process.exit(1);
  }
  console.log('Publicando Flows na WABA', WABA, '\n');
  for (const f of FLOWS) {
    try {
      const id = await publicarFlow(f);
      console.log(`✅ ${f.nome}\n   ${f.env}=${id}\n`);
    } catch (e) {
      console.error(`❌ ${f.nome}:`, e.message, '\n');
    }
  }
  console.log('Pronto. Cole os ids acima no Vercel (Production) e faça redeploy.');
})();
