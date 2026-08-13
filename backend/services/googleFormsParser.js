// Lê um Google Forms público e devolve as perguntas no formato do módulo NPS.
// Sem dependência nova: fetch global (undici) + parse do FB_PUBLIC_LOAD_DATA_
// (JSON que o Google embute na página do viewform).
//
// Estrutura do blob (posições estáveis, mas cheias de nulls — sempre com guarda):
//   data[1][8] = título do formulário · data[1][0] = descrição
//   data[1][1] = lista de itens; cada item = [id, texto, descricao, tipo, [questao...]]
//     questao[1] = opções (choice/scale) · cada opção = [texto, ...]
// Códigos de tipo do Google Forms:
//   0 curta · 1 parágrafo · 2 múltipla(radio) · 3 dropdown · 4 checkboxes
//   5 escala linear · 6 título+descrição(seção) · 7 grade · 8 quebra de página(seção)
//   9 data · 10 hora · 11 imagem · 12 vídeo · 13 upload

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizarUrl(url) {
  let u = String(url || '').trim();
  if (!u) throw new Error('Informe o link do Google Forms.');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!/docs\.google\.com\/forms|forms\.gle/i.test(u)) {
    throw new Error('O link não parece ser de um Google Forms.');
  }
  // Garante a página de resposta (viewform), onde o blob existe.
  if (/\/forms\/d\/e\/[\w-]+/.test(u) && !/viewform/.test(u)) {
    u = u.replace(/\/(edit|prefill).*$/, '').replace(/\/?$/, '') + '/viewform';
  }
  return u;
}

function extrairBlob(html) {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

const TIPO_MAP = {
  0: 'texto_curto',
  1: 'texto_longo',
  2: 'opcao_unica',
  3: 'opcao_unica',
  4: 'multipla',
  5: 'escala_5',
  6: 'secao',
  8: 'secao',
  9: 'texto_curto',
  10: 'texto_curto',
};

function opcoesDe(questao) {
  const raw = Array.isArray(questao?.[1]) ? questao[1] : [];
  return raw.map(o => (Array.isArray(o) ? o[0] : o)).filter(v => v != null && String(v).trim() !== '').map(String);
}

// Interpreta o blob → { titulo, descricao, itens[], candidatos_nota[], avisos[] }
function interpretar(data) {
  const meta = Array.isArray(data?.[1]) ? data[1] : [];
  const titulo = String(meta[8] || data?.[3] || 'Pesquisa importada').trim();
  const descricao = meta[0] ? String(meta[0]).trim() : null;
  const rawItens = Array.isArray(meta[1]) ? meta[1] : [];

  const itens = [];
  const candidatosNota = [];
  const avisos = [];
  let n = 0;

  for (const it of rawItens) {
    if (!Array.isArray(it)) continue;
    const texto = String(it[1] || '').trim();
    const descricaoItem = it[2] ? String(it[2]).trim() : null;
    const tipoCod = it[3];
    const tipoNps = TIPO_MAP[tipoCod];

    if (tipoNps === undefined) {
      // grade (7), imagem/vídeo/upload (11/12/13) etc.
      if (texto) avisos.push(`Ignorado (tipo não suportado): "${texto || 'sem título'}"`);
      continue;
    }

    const id = tipoNps === 'secao' ? `s${++n}` : `q${++n}`;
    const questao = Array.isArray(it[4]) ? it[4][0] : null;
    const pergunta = { id, tipo: tipoNps, texto: texto || (tipoNps === 'secao' ? 'Seção' : 'Pergunta') };
    if (descricaoItem) pergunta.descricao = descricaoItem;

    if (tipoNps === 'opcao_unica' || tipoNps === 'multipla') {
      pergunta.opcoes = opcoesDe(questao);
    }

    if (tipoCod === 5) {
      // escala linear → candidato a nota. Opções são os pontos da escala.
      const pontos = opcoesDe(questao).map(Number).filter(v => Number.isFinite(v));
      const min = pontos.length ? Math.min(...pontos) : 1;
      const max = pontos.length ? Math.max(...pontos) : 5;
      pergunta.escala = { min, max };
      candidatosNota.push({ id, texto: pergunta.texto, min, max });
    } else if (tipoNps === 'opcao_unica' && pergunta.opcoes.length >= 2) {
      // Múltipla escolha SÓ de números (ex.: "De 0 a 5" feito como opções 0..5,
      // ou "recomendaria de 0 a 10") também pode ser a nota.
      const nums = pergunta.opcoes.map(Number);
      if (nums.every(v => Number.isFinite(v))) {
        const min = Math.min(...nums), max = Math.max(...nums);
        pergunta.escala = { min, max };
        candidatosNota.push({ id, texto: pergunta.texto, min, max });
      }
    }

    itens.push(pergunta);
  }

  return { titulo, descricao, itens, candidatos_nota: candidatosNota, avisos };
}

async function parseGoogleForm(url) {
  const alvo = normalizarUrl(url);
  let res;
  try {
    res = await fetch(alvo, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt' }, redirect: 'follow' });
  } catch (e) {
    throw new Error(`Não consegui acessar o formulário: ${e.message}`);
  }
  if (!res.ok) throw new Error(`O formulário respondeu ${res.status}. Confira se o link está público.`);
  const html = await res.text();
  const data = extrairBlob(html);
  if (!data) {
    throw new Error('Não achei as perguntas na página. O formulário precisa estar público (aceitando respostas, sem exigir login).');
  }
  const parsed = interpretar(data);
  parsed.url = alvo;
  if (!parsed.itens.length) throw new Error('O formulário não tem perguntas legíveis.');
  return parsed;
}

// Converte um valor bruto da coluna-nota para 0..10, conforme a escala escolhida.
// escala: { tipo:'0-10' } | { min, max } | { tipo:'categoria', mapa:{ [opcao]:num } }
// Retorna número 0..10 ou null se não der pra converter (linha ignorada).
function converterNota(valor, escala) {
  if (valor == null || String(valor).trim() === '') return null;
  const e = escala || {};
  if (e.tipo === 'categoria' && e.mapa) {
    const chave = String(valor).trim();
    const v = e.mapa[chave];
    return v == null ? null : Math.max(0, Math.min(10, Math.round(Number(v))));
  }
  const num = Number(String(valor).replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0]);
  if (!Number.isFinite(num)) return null;
  let min = e.min, max = e.max;
  if (e.tipo === '0-10' || (min == null && max == null)) { min = 0; max = 10; }
  if (max === min) return Math.max(0, Math.min(10, Math.round(num)));
  const score = ((num - min) / (max - min)) * 10;
  return Math.max(0, Math.min(10, Math.round(score)));
}

module.exports = { parseGoogleForm, converterNota, TIPO_MAP };
