// Exportador de datasets pro Google Stax (avaliação de LLM · stax.withgoogle.com).
// Script ops · NÃO faz parte do runtime (backend/scripts/ fica fora do bundle da Vercel).
// Read-only: só SELECT — nunca grava nada no banco.
//
// Uso:  node backend/scripts/_stax_export.js <dataset> [--limite=200]
//   datasets: whatsapp_culto · nf_categoria · compras_scan · nps_comentarios
//
// Saída: backend/scripts/stax-export/export_<dataset>_<AAAA-MM-DD>.csv (gitignored ·
// NUNCA commitar export com dado real). Subir manualmente na UI do Stax
// (Add Data > Import Dataset). Guia: backend/scripts/stax-export/README.md
//
// ⚠️ Regra "nunca sobe" (ver seção Stax no CLAUDE.md): pedidos de oração, governança,
// relatos nominais de grupos, fila pastoral (primeiro contato/batismo), Cérebro e
// qualquer dado de Kids NÃO têm exportador aqui — por decisão, não por falta de código.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OUT_DIR = path.join(__dirname, 'stax-export');
const PISO_LINHAS = 25; // abaixo disso a métrica é ruído — o script avisa
// Corte temporal: o parser de culto foi redesenhado em 2026-06-09; coletas anteriores
// vieram de outro prompt/fluxo e não representam o sistema atual.
const CORTE_WHATSAPP = '2026-06-09';

// ---------- infra comum ----------

// Paginação canônica (cap server-side de 1000 do PostgREST · ver CLAUDE.md)
async function fetchAll(builderFactory) {
  const pageSize = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await builderFactory().range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// Anti-PII em texto livre: na dúvida, DESCARTA a linha (não mascara).
// Sequências de 8+ dígitos (telefone/CPF/CNPJ ditados) e e-mails.
const RE_DIGITOS_LONGOS = /\d[\d .()-]{6,}\d/;
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
function textoLivreSeguro(texto) {
  const t = String(texto || '');
  const soDigitos = t.replace(/\D/g, '');
  if (soDigitos.length >= 8 && RE_DIGITOS_LONGOS.test(t)) return false;
  if (RE_EMAIL.test(t)) return false;
  return true;
}

function csvCampo(v) {
  const s = v == null ? '' : String(v).replace(/\r/g, '');
  return '"' + s.replace(/"/g, '""') + '"';
}

function gravarCsv(nome, colunas, linhas) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const arquivo = path.join(OUT_DIR, `export_${nome}_${new Date().toISOString().slice(0, 10)}.csv`);
  const corpo = [colunas.join(',')]
    .concat(linhas.map(l => colunas.map(c => csvCampo(l[c])).join(',')))
    .join('\n');
  fs.writeFileSync(arquivo, '﻿' + corpo, 'utf8'); // BOM pro Excel não corromper acentuação
  return arquivo;
}

function resumo(nome, linhas, descartadas, arquivo) {
  console.log(`\n=== ${nome} ===`);
  console.log(`  linhas exportadas: ${linhas}`);
  if (descartadas) console.log(`  linhas descartadas pelo filtro anti-PII: ${descartadas}`);
  if (linhas === 0) {
    console.log('  ⚠️ Nenhum caso disponível ainda — este fluxo precisa acumular uso/veredito humano.');
  } else if (linhas < PISO_LINHAS) {
    console.log(`  ⚠️ Abaixo do piso de ${PISO_LINHAS} pares — dá pra explorar no Stax, mas a métrica ainda não é conclusiva.`);
  }
  if (arquivo) console.log(`  arquivo: ${arquivo}`);
}

// ---------- datasets ----------

// Parser de números de culto (services/whatsappParser.js · Haiku).
// input = texto do líder · output = parsed.dados · expected = submissão aplicada
// (quando destino_ref existe) · human_verdict = status da coleta.
async function exportWhatsappCulto(limite) {
  const rows = await fetchAll(() => sb.from('whatsapp_coletas')
    .select('id, raw_text, parsed, status, destino_ref, created_at')
    .is('deleted_at', null)
    .gte('created_at', CORTE_WHATSAPP)
    .not('parsed', 'is', null)
    .order('created_at', { ascending: false }));

  const casos = rows.filter(r => {
    const fonte = r.parsed?.fonte || '';
    // flow = formulário (sem IA) · nota_fiscal/grupo_encontro = outros fluxos (grupo é nominal · nunca sobe)
    return !['flow', 'nota_fiscal', 'grupo_encontro'].includes(fonte) && r.parsed?.dados;
  }).slice(0, limite);

  const refIds = casos.map(c => c.destino_ref).filter(Boolean);
  const subsById = {};
  if (refIds.length) {
    const subs = await fetchAll(() => sb.from('cultos_dados_submissoes')
      .select('id, ambiente, presencial, decisoes, status').in('id', refIds));
    subs.forEach(s => { subsById[s.id] = s; });
  }

  let descartadas = 0;
  const linhas = [];
  for (const c of casos) {
    if (!textoLivreSeguro(c.raw_text)) { descartadas++; continue; }
    const dados = c.parsed.dados || {};
    const sub = c.destino_ref ? subsById[c.destino_ref] : null;
    const expected = sub ? JSON.stringify({ presencial: sub.presencial, decisoes: sub.decisoes }) : '';
    const foiEditado = sub && (
      (dados.presencial != null && sub.presencial != null && Number(dados.presencial) !== Number(sub.presencial)) ||
      (dados.decisoes != null && sub.decisoes != null && Number(dados.decisoes) !== Number(sub.decisoes))
    );
    linhas.push({
      id: c.id,
      input: String(c.raw_text || '').trim(),
      output: JSON.stringify(dados),
      expected,
      human_verdict: c.status + (foiEditado ? ' (editado pelo coordenador)' : ''),
      contexto: `data=${(c.created_at || '').slice(0, 10)} modulo=${c.parsed.modulo || ''}`,
    });
  }
  const arq = linhas.length ? gravarCsv('whatsapp_culto', ['id', 'input', 'output', 'expected', 'human_verdict', 'contexto'], linhas) : null;
  resumo('whatsapp_culto', linhas.length, descartadas, arq);
}

// Sugestão de categoria contábil da nota fiscal (services/nfScanner.js · Haiku).
// input = extração da nota (texto flat) · output = categoria sugerida · expected =
// categoria final da fin_transacoes lançada pelo financeiro.
async function exportNfCategoria(limite) {
  // log_notas_fiscais NÃO tem deleted_at (conferido no schema vivo) — não filtrar
  const rows = await fetchAll(() => sb.from('log_notas_fiscais')
    .select('id, emitente_nome, emitente_cnpj, valor, data_emissao, descricao, itens, extracao_raw, sugestao_plano_contas_id, sugestao_centro_custo_id, sugestao_origem, sugestao_explicacao, transacao_id, status, rejeitada_motivo, created_at')
    .not('sugestao_plano_contas_id', 'is', null)
    .order('created_at', { ascending: false }));
  const casos = rows.slice(0, limite);

  const [planos, centros] = await Promise.all([
    fetchAll(() => sb.from('fin_plano_contas').select('id, codigo, nome')),
    fetchAll(() => sb.from('fin_centros_custo').select('id, codigo, nome')),
  ]);
  const planoById = Object.fromEntries(planos.map(p => [p.id, `${p.codigo} ${p.nome}`]));
  const centroById = Object.fromEntries(centros.map(c => [c.id, `${c.codigo} ${c.nome}`]));

  const txIds = casos.map(c => c.transacao_id).filter(Boolean);
  const txById = {};
  if (txIds.length) {
    const txs = await fetchAll(() => sb.from('fin_transacoes')
      .select('id, plano_contas_id, centro_custo_id').in('id', txIds));
    txs.forEach(t => { txById[t.id] = t; });
  }

  const linhas = casos.map(c => {
    const itens = Array.isArray(c.itens) ? c.itens.slice(0, 10).map(i => i?.descricao || i?.nome || '').filter(Boolean).join(' · ') : '';
    const tx = c.transacao_id ? txById[c.transacao_id] : null;
    return {
      id: c.id,
      // CNPJ/razão social de fornecedor = dado empresarial (mantido de propósito — é o sinal da classificação)
      input: `emitente=${c.emitente_nome || '?'} cnpj=${c.emitente_cnpj || '?'} valor=${c.valor || '?'} data=${c.data_emissao || '?'} descricao=${(c.descricao || '').slice(0, 200)} itens=${itens}`,
      output: `plano=${planoById[c.sugestao_plano_contas_id] || c.sugestao_plano_contas_id} centro=${centroById[c.sugestao_centro_custo_id] || c.sugestao_centro_custo_id || '-'} origem=${c.sugestao_origem || '-'} explicacao=${(c.sugestao_explicacao || '').slice(0, 200)}`,
      expected: tx ? `plano=${planoById[tx.plano_contas_id] || '-'} centro=${centroById[tx.centro_custo_id] || '-'}` : '',
      human_verdict: c.status + (c.rejeitada_motivo ? ` (motivo: ${c.rejeitada_motivo.slice(0, 120)})` : ''),
      contexto: `data=${(c.created_at || '').slice(0, 10)}`,
    };
  });
  const arq = linhas.length ? gravarCsv('nf_categoria', ['id', 'input', 'output', 'expected', 'human_verdict', 'contexto'], linhas) : null;
  resumo('nf_categoria', linhas.length, 0, arq);
}

// Extração de compra escaneada (nfScanner via aba Compras / WhatsApp · fila do Pery).
// output = extração da IA · expected = campos finais após aprovação.
async function exportComprasScan(limite) {
  const rows = await fetchAll(() => sb.from('log_compras')
    .select('id, fornecedor, materiais, valor, data_compra, emitente_cnpj, numero_nota, extracao_raw, extracao_confianca, status_aprovacao, origem_registro, created_at')
    .is('deleted_at', null)
    .in('origem_registro', ['scan', 'whatsapp'])
    .not('extracao_raw', 'is', null)
    .order('created_at', { ascending: false }));
  const casos = rows.slice(0, limite);

  let descartadas = 0;
  const linhas = [];
  for (const c of casos) {
    const ex = c.extracao_raw || {};
    const inputTexto = `emitente=${ex.emitente_nome || '?'} cnpj=${ex.emitente_cnpj || '?'} valor=${ex.valor_total || '?'} itens=${Array.isArray(ex.itens) ? ex.itens.slice(0, 10).map(i => i?.descricao || '').filter(Boolean).join(' · ') : ''}`;
    if (!textoLivreSeguro(String(c.materiais || ''))) { descartadas++; continue; }
    linhas.push({
      id: c.id,
      input: inputTexto,
      output: JSON.stringify({ fornecedor: ex.emitente_nome || null, valor: ex.valor_total || null, confianca: c.extracao_confianca || null }),
      expected: c.status_aprovacao === 'aprovada'
        ? JSON.stringify({ fornecedor: c.fornecedor, valor: c.valor, data: c.data_compra, materiais: String(c.materiais || '').slice(0, 200) })
        : '',
      human_verdict: c.status_aprovacao,
      contexto: `origem=${c.origem_registro} data=${(c.created_at || '').slice(0, 10)}`,
    });
  }
  const arq = linhas.length ? gravarCsv('compras_scan', ['id', 'input', 'output', 'expected', 'human_verdict', 'contexto'], linhas) : null;
  resumo('compras_scan', linhas.length, descartadas, arq);
}

// Comentários de NPS (texto livre · sem gabarito) — dataset "inputs-only" pro caso de uso
// qualitativo do Stax (avaliar extração de temas/sentimento da análise IA do módulo NPS).
async function exportNpsComentarios(limite) {
  const rows = await fetchAll(() => sb.from('nps_respostas')
    .select('id, score, comentario, created_at')
    .not('comentario', 'is', null)
    .order('created_at', { ascending: false }));

  let descartadas = 0;
  const linhas = [];
  for (const r of rows) {
    const c = String(r.comentario || '').trim();
    if (c.length < 4) continue;
    if (!textoLivreSeguro(c)) { descartadas++; continue; }
    linhas.push({
      id: r.id,
      input: `score=${r.score} comentario=${c}`,
      output: '', // gerar no Stax (Generate Outputs) com o prompt de análise
      expected: '',
      human_verdict: '',
      contexto: `data=${(r.created_at || '').slice(0, 10)}`,
    });
    if (linhas.length >= limite) break;
  }
  const arq = linhas.length ? gravarCsv('nps_comentarios', ['id', 'input', 'output', 'expected', 'human_verdict', 'contexto'], linhas) : null;
  resumo('nps_comentarios', linhas.length, descartadas, arq);
}

// ---------- main ----------

const DATASETS = {
  whatsapp_culto: exportWhatsappCulto,
  nf_categoria: exportNfCategoria,
  compras_scan: exportComprasScan,
  nps_comentarios: exportNpsComentarios,
};

(async () => {
  const args = process.argv.slice(2);
  const nome = args.find(a => !a.startsWith('--'));
  const limite = Number((args.find(a => a.startsWith('--limite=')) || '').split('=')[1]) || 200;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em backend/.env');
    process.exit(1);
  }
  if (!nome || !DATASETS[nome]) {
    console.log('Uso: node backend/scripts/_stax_export.js <dataset> [--limite=200]');
    console.log('Datasets: ' + Object.keys(DATASETS).join(' · '));
    process.exit(nome ? 1 : 0);
  }
  console.log(`Exportando "${nome}" (limite ${limite} · mais recentes primeiro · read-only)...`);
  await DATASETS[nome](limite);
  console.log('\nLembretes: o CSV é gitignored — não commitar; apagar após subir no Stax.');
  process.exit(0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });
