// Enriquecimento de fornecedor com dados oficiais.
//
// 1) Tenta achar um CNPJ: do campo cnpj, de um CNPJ completo no nome, ou da
//    RAIZ (XX.XXX.XXX) no nome → monta a matriz /0001-DV.
// 2) Consulta a Receita (BrasilAPI) → razão social, nome fantasia, endereço,
//    telefone, e-mail, situação.
// 3) Sem CNPJ derivável: usa IA com busca na web pra achar o CNPJ pelo nome.
// Só preenche campos VAZIOS (nunca sobrescreve dado já informado por humano).

const Anthropic = require('@anthropic-ai/sdk');

const soDigitos = (s) => String(s || '').replace(/\D/g, '');

function dvCnpj(base12) {
  const calc = (nums, pesos) => {
    let s = 0; for (let i = 0; i < nums.length; i++) s += nums[i] * pesos[i];
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  const n = base12.split('').map(Number);
  const d1 = calc(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}`;
}
function cnpjValido(c) {
  c = soDigitos(c);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  return dvCnpj(c.slice(0, 12)) === c.slice(12);
}

// Candidatos de CNPJ (14 dígitos) a partir do campo + nome do fornecedor
function candidatosCnpj(texto, cnpjField) {
  const out = [];
  const push = (c) => { c = soDigitos(c); if (c.length === 14 && cnpjValido(c) && !out.includes(c)) out.push(c); };
  if (cnpjField) push(cnpjField);
  const t = String(texto || '');
  for (const m of t.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)) push(m[0]);   // CNPJ completo
  const raiz = (t.match(/(?:^|\s)(\d{2}\.\d{3}\.\d{3})(?!\/|\d)/) || [])[1];          // raiz XX.XXX.XXX
  if (raiz) { const r = soDigitos(raiz).slice(0, 8); if (r.length === 8) push(r + '0001' + dvCnpj(r + '0001')); }
  return out;
}

async function consultarReceita(cnpj14) {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj14}`, { headers: { 'User-Agent': 'cbrio-erp/1.0' } });
    if (r.status === 429 || r.status === 503) { const e = new Error('rate_limit'); e.rateLimited = true; throw e; }
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !d.razao_social) return null;
    const ende = [d.descricao_tipo_de_logradouro, d.logradouro, d.numero].filter(Boolean).join(' ').trim();
    const compl = [d.bairro, [d.municipio, d.uf].filter(Boolean).join('/'), d.cep && `CEP ${d.cep}`].filter(Boolean).join(' · ');
    const endereco = [ende, compl].filter(Boolean).join(' · ') || null;
    return {
      cnpj: cnpj14,
      razao_social: d.razao_social || null,
      nome_fantasia: d.nome_fantasia || null,
      endereco,
      telefone: d.ddd_telefone_1 ? soDigitos(d.ddd_telefone_1) : null,
      email: d.email || null,
      situacao: d.descricao_situacao_cadastral || null,
      fonte: 'receita',
    };
  } catch (e) {
    if (e.rateLimited) throw e;            // propaga rate-limit (não marca "não encontrado")
    console.error('[enriquecer] receita:', e.message); return null;
  }
}

// IA com busca na web pra descobrir o CNPJ pelo nome (best-effort · pode não estar habilitado)
async function cnpjPorNomeIA(nome) {
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: `Procure na internet o CNPJ do fornecedor/empresa brasileiro "${nome}" (provavelmente no Rio de Janeiro). Responda APENAS com o CNPJ (14 dígitos). Se não tiver certeza, responda "nao".` }],
    });
    const texto = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    const m = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (m) { const c = soDigitos(m[0]); if (cnpjValido(c)) return c; }
    return null;
  } catch (e) { console.error('[enriquecer] IA web:', e.message); return null; }
}

async function enriquecerFornecedor(forn, { usarIA = true } = {}) {
  const nome = forn.razao_social || forn.nome_fantasia || '';
  let dados = null;
  for (const cnpj of candidatosCnpj(nome, forn.cnpj)) {
    dados = await consultarReceita(cnpj);
    if (dados) break;
  }
  if (!dados && usarIA && nome) {
    const cnpj = await cnpjPorNomeIA(nome);
    if (cnpj) dados = await consultarReceita(cnpj);
  }
  if (!dados) return { ok: false };
  const patch = {};
  if (!forn.cnpj && dados.cnpj) patch.cnpj = dados.cnpj;
  if (!forn.nome_fantasia && dados.nome_fantasia) patch.nome_fantasia = dados.nome_fantasia;
  if (!forn.endereco && dados.endereco) patch.endereco = dados.endereco;
  if (!forn.telefone && dados.telefone) patch.telefone = dados.telefone;
  if (!forn.email && dados.email) patch.email = dados.email;
  return { ok: true, dados, patch };
}

module.exports = { enriquecerFornecedor, candidatosCnpj, cnpjValido };
