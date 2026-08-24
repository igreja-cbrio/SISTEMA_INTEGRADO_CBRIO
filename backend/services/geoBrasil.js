// Endereço brasileiro → bairro e coordenada. Um lugar só.
//
// Por que este arquivo existe (2026-08-23): a mesma sequência ViaCEP + Nominatim
// estava copiada em QUATRO lugares — `routes/membresia.js` (`/geocode-cep`),
// `routes/grupos.js` (busca e `/geocode-batch`) e `routes/publicGrupos.js`. As
// cópias já divergiam: só a do `geocode-batch` valida que a coordenada caiu na
// região metropolitana do Rio, então as outras três aceitavam em silêncio uma
// "Rua São João" em Santa Catarina. O Perfil da Membresia seria a quinta cópia.
//
// ⚠️ POLÍTICA DE USO DO NOMINATIM (https://operations.osmfoundation.org/policies/nominatim/):
// no máximo 1 requisição por segundo e User-Agent identificando a aplicação.
// `esperarVezNoNominatim()` serializa as chamadas do processo inteiro numa fila
// — `await sleep(1100)` espalhado pelo código não garante nada quando duas
// requisições HTTP correm em paralelo na mesma instância.
//
// ⚠️ O ViaCEP NÃO tem essa restrição e é ordens de grandeza mais rápido. Por
// isso o caminho do salvamento de cadastro (`bairroPorCep`) chama SÓ o ViaCEP:
// preencher o bairro custa ~200 ms, e é o bairro que o mapa agregado usa.
// Nominatim fica para o lote em segundo plano.

const UA = 'CBRio-Sistema/1.0 (contato@cbrio.com.br)';

const NOMINATIM_INTERVALO_MS = 1100;
const TIMEOUT_VIACEP_MS = 4000;
const TIMEOUT_NOMINATIM_MS = 8000;

/** Caixa metropolitana do Rio + Baixada. Coordenada fora daqui é match errado
 *  em cidade homônima — e um pino em Santa Catarina estraga o mapa inteiro,
 *  porque o `fitBounds` foge do Rio para caber nele. */
const CAIXA_RJ = { latMax: -21.8, latMin: -23.6, lngMax: -42.4, lngMin: -44.3 };

const dentroDoRio = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng)
  && lat <= CAIXA_RJ.latMax && lat >= CAIXA_RJ.latMin
  && lng <= CAIXA_RJ.lngMax && lng >= CAIXA_RJ.lngMin;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fila global do processo: a próxima chamada ao Nominatim só sai 1,1s depois
 *  da anterior, mesmo que dois handlers HTTP peçam ao mesmo tempo. */
let filaNominatim = Promise.resolve();
let ultimaChamada = 0;
function esperarVezNoNominatim() {
  const minha = filaNominatim.then(async () => {
    const desde = Date.now() - ultimaChamada;
    if (desde < NOMINATIM_INTERVALO_MS) await sleep(NOMINATIM_INTERVALO_MS - desde);
    ultimaChamada = Date.now();
  });
  // A fila não pode quebrar por causa de uma chamada que falhou.
  filaNominatim = minha.catch(() => {});
  return minha;
}

async function buscarComTimeout(url, ms, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    // Timeout, DNS, 5xx do terceiro: o chamador decide o fallback. Endereço
    // sem coordenada é estado NORMAL aqui, não erro.
    return null;
  } finally {
    clearTimeout(t);
  }
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

/**
 * CEP → { cep, logradouro, bairro, cidade, uf }. Só ViaCEP: rápido e sem
 * rate-limit. Devolve `null` para CEP inválido ou inexistente.
 */
async function bairroPorCep(cepBruto) {
  const cep = soDigitos(cepBruto);
  if (cep.length !== 8) return null;
  const vc = await buscarComTimeout(`https://viacep.com.br/ws/${cep}/json/`, TIMEOUT_VIACEP_MS);
  if (!vc || vc.erro) return null;
  return {
    cep,
    logradouro: vc.logradouro || null,
    bairro: vc.bairro || null,
    cidade: vc.localidade || null,
    uf: vc.uf || null,
  };
}

/**
 * Texto livre → { lat, lng, exibicao } ou `null`. Respeita a fila do Nominatim.
 *
 * `exigirRio` (padrão true) descarta acerto fora da caixa metropolitana — é o
 * que protege o centróide de BAIRRO, onde "Centro" casa em dezenas de cidades.
 *
 * ⚠️ Passar `false` só se justifica quando a consulta já é um ENDEREÇO COMPLETO
 * (logradouro + cidade + UF), porque aí a ambiguidade que a caixa resolve não
 * existe. Hoje há UM chamador assim: `GET /membresia/geocode-cep`, que precisa
 * devolver coordenada de membro que mora fora do Rio. Nome de lugar solto
 * NUNCA passa false.
 */
async function coordenadaPorTexto(consulta, { exigirRio = true } = {}) {
  const q = String(consulta || '').trim();
  if (q.replace(/\W/g, '').length < 4) return null;
  await esperarVezNoNominatim();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`;
  const nom = await buscarComTimeout(url, TIMEOUT_NOMINATIM_MS, { 'User-Agent': UA });
  const hit = Array.isArray(nom) ? nom[0] : null;
  if (!hit) return null;
  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (exigirRio && !dentroDoRio(lat, lng)) return null;
  return { lat, lng, exibicao: hit.display_name || null };
}

/**
 * Centróide de um bairro. Tenta do mais específico ao mais genérico e para no
 * primeiro acerto — cada tentativa custa 1,1s de fila, então a ordem importa.
 */
async function centroideDeBairro(bairro, cidade = 'Rio de Janeiro', uf = 'RJ') {
  const b = String(bairro || '').trim();
  if (!b) return null;
  // "Freguesia (Jacarepaguá)" vira "Freguesia Jacarepaguá": o Nominatim lida
  // pior com o parêntese do que com as duas palavras soltas.
  const limpo = b.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const tentativas = [
    `${limpo}, ${cidade}, ${uf}, Brasil`,
    `${limpo}, ${uf}, Brasil`,
  ].filter((q, i, a) => a.indexOf(q) === i);
  for (const q of tentativas) {
    const hit = await coordenadaPorTexto(q);
    if (hit) return hit;
  }
  return null;
}

/**
 * CEP → { lat, lng, logradouro, bairro, cidade, uf } ou `null`.
 *
 * ViaCEP para virar ENDEREÇO (rápido, sem rate-limit) e Nominatim para virar
 * COORDENADA. É a sequência que dá ponto de RUA, não de bairro — é isso que faz
 * o mapa por trecho de CEP ser mais específico que o mapa por bairro.
 *
 * ⚠️ `exigirRio: false` de propósito, pelo mesmo motivo do `/geocode-cep`: a
 * consulta é um endereço COMPLETO (logradouro + cidade + UF vindos do ViaCEP),
 * então a ambiguidade que a caixa do Rio resolve não existe — e membro que mora
 * em Niterói, São Paulo ou Portugal tem endereço legítimo. Quem protege o
 * enquadramento do mapa contra o ponto distante é o `nucleoDoMapa` (90%) no
 * front, não um descarte de dado verdadeiro aqui.
 *
 * ⚠️ Duas tentativas no MÁXIMO (1,1s de fila cada): rua completa e, se falhar,
 * bairro da rua. Sem logradouro (CEP de cidade inteira, comum no interior) vai
 * direto para a segunda.
 */
async function coordenadaDeCep(cepBruto) {
  const via = await bairroPorCep(cepBruto);
  if (!via) return null;
  const { logradouro, bairro, cidade, uf } = via;
  const partes = [cidade, uf, 'Brasil'].filter(Boolean).join(', ');
  const tentativas = [
    logradouro && partes ? `${logradouro}, ${bairro || ''}, ${partes}`.replace(/, ,/g, ',') : null,
    bairro && partes ? `${bairro}, ${partes}` : null,
  ].filter(Boolean);
  for (const q of tentativas) {
    const hit = await coordenadaPorTexto(q, { exigirRio: false });
    if (hit) return { ...via, lat: hit.lat, lng: hit.lng };
  }
  // Endereço reconhecido pelo ViaCEP mas sem coordenada: devolve o endereço
  // mesmo assim. O trecho não entra no mapa, mas o rótulo ("22640 · Barra da
  // Tijuca") já fica correto e a tela sabe dizer o que falta.
  return { ...via, lat: null, lng: null };
}

/** Normalização do bairro · espelho EXATO de `f_unaccent(lower(trim(bairro)))`
 *  usado por `vw_dem_pessoa.bairro_norm_raw`. Duas normalizações diferentes
 *  fariam o backend gravar numa chave que a view nunca procura. */
function normalizarBairro(bairro) {
  const t = String(bairro || '').trim().toLowerCase();
  if (!t) return null;
  // \u0300-\u036f = marcas de acento que o NFD separa da letra. Escrito por
  // escape porque combining mark literal no fonte some em qualquer editor.
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || null;
}

module.exports = {
  bairroPorCep,
  coordenadaPorTexto,
  centroideDeBairro,
  coordenadaDeCep,
  normalizarBairro,
  dentroDoRio,
  CAIXA_RJ,
};
