// Bairro que entra no cadastro · uma grafia só.
//
// ⚠️⚠️ POR QUE ESTE ARQUIVO EXISTE (24/08/2026): o formulário público
// FABRICAVA duas grafias para o mesmo bairro. A lista suspensa dele tinha 11
// apelidos curtos ('Barra', 'Recreio', 'Freguesia') e o ViaCEP devolve o nome
// oficial ('Barra da Tijuca', 'Recreio dos Bandeirantes', 'Freguesia
// (Jacarepaguá)'). A comparação normalizada nunca casava nos três bairros com
// mais gente: quem escolhia da lista gravava o curto, quem preenchia o CEP caía
// em "Outro" e gravava o longo. Medido em produção (23/08):
//   Barra da Tijuca 33 × Barra 22 · Recreio 15 × 14 · Freguesia 5 × 4
// mais 4 registros com espaço no fim.
//
// ⚠️ A lista suspensa sozinha NÃO fecha a torneira: sobram o totem, o RH, o
// censo e o import, que gravam texto. Por isso a canonicalização mora aqui, no
// caminho de GRAVAÇÃO, e não na tela.
const { supabase } = require('../utils/supabase');
const { bairroPorCep } = require('./geoBrasil');

/**
 * Texto digitado → rótulo canônico do catálogo.
 *
 * ⚠️ Segue alias de GRAFIA ("Barra" → "Barra da Tijuca": mesma informação
 * escrita de outro jeito) e NUNCA de AGRUPAMENTO ("Barra Olímpica" fica no
 * mapa dentro da Barra, mas reescrever apagaria onde a pessoa mora). Quem
 * conhece essa diferença é `fn_dem_bairro_canonico`.
 *
 * ⚠️ FALHA DEVOLVE O TEXTO TRIMADO, nunca null: a canonicalização é melhoria de
 * qualidade, e melhoria de qualidade não pode apagar o bairro que a pessoa
 * informou nem derrubar o salvamento.
 */
async function canonizarBairro(texto) {
  const cru = String(texto ?? '').trim();
  if (!cru) return null;
  try {
    const { data, error } = await supabase.rpc('fn_dem_bairro_canonico', { p_texto: cru });
    if (error) throw error;
    const canon = typeof data === 'string' ? data.trim() : '';
    return canon || cru;
  } catch (e) {
    console.warn('[bairro] canonicalização falhou (mantém o digitado):', e.message);
    return cru;
  }
}

/**
 * Normaliza o endereço de um payload de cadastro, no lugar.
 *
 * Faz duas coisas, nesta ordem:
 *  1. deriva bairro/cidade do CEP quando faltam;
 *  2. canonicaliza a grafia do bairro (venha do CEP ou do teclado).
 *
 * ⚠️ SÓ ViaCEP no passo 1 (~200 ms, sem rate-limit). O Nominatim exige 1,1 s
 * por chamada (política do OSM) e travaria quem está clicando em Salvar —
 * coordenada é trabalho do lote em segundo plano.
 *
 * ⚠️⚠️ SÓ-ONDE-VAZIO no passo 1, nos DOIS lados: nem o payload nem o que já
 * está gravado é sobrescrito pelo ViaCEP. Mesma política do censo.
 * ⇒ Resíduo declarado: trocar o CEP de quem já tem bairro NÃO corrige o bairro
 * antigo — corrigir seria decidir que o ViaCEP vence a equipe, e ele não vence.
 *
 * ⚠️ O passo 2 é diferente e vale sempre que houver bairro no payload: ali não
 * se troca a INFORMAÇÃO, só a grafia dela. É a mesma lei do "rótulo de opção
 * não é vocabulário de coluna" (17/08) — bairro é vocabulário de agregação.
 *
 * ⚠️ BEST-EFFORT inteiro: ViaCEP ou banco fora do ar não impedem ninguém de
 * salvar um cadastro.
 */
async function normalizarEnderecoDoPayload(body, atual = null) {
  try {
    if (!body || typeof body !== 'object') return;

    // 1 · CEP preenche o que falta
    const cep = String(body.cep || '').replace(/\D/g, '');
    if (cep.length === 8) {
      const bairroDefinido = String(body.bairro ?? atual?.bairro ?? '').trim();
      const cidadeDefinida = String(body.cidade ?? atual?.cidade ?? '').trim();
      if (!bairroDefinido || !cidadeDefinida) {
        const via = await bairroPorCep(cep);
        if (via) {
          if (!bairroDefinido && via.bairro) body.bairro = via.bairro;
          if (!cidadeDefinida && via.cidade) body.cidade = via.cidade;
        }
      }
    }

    // 2 · uma grafia só
    if (body.bairro !== undefined && body.bairro !== null) {
      const canon = await canonizarBairro(body.bairro);
      // `null` só quando a pessoa mandou string vazia — aí limpar é a intenção
      // dela, e o campo é nullable.
      body.bairro = canon;
    }
  } catch (e) {
    console.warn('[bairro] normalização do endereço falhou (segue como veio):', e.message);
  }
}

module.exports = { canonizarBairro, normalizarEnderecoDoPayload };
